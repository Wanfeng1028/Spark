/**
 * SSE 分块解析单测（工单 9.4）：模拟 onChunkReceived 分块喂帧——
 * 任意切点（含多字节 UTF-8 中间）喂 SseFramePump，出信封口径与四端一致。
 */
import { describe, expect, it } from 'vitest'
import type { SparkEventEnvelope } from '@spark/protocol'
import { SseFramePump } from '../src/transport/sse-pump'

const SID = 'ses_minisse1'

function frameOf(seq: number, text: string): string {
  const envelope = {
    id: `evt_minisse${seq}`,
    sessionId: SID,
    seq,
    time: 1000 + seq,
    type: 'user.message',
    data: { text },
  }
  return `data: ${JSON.stringify(envelope)}\n\n`
}

function bytesOf(text: string): Uint8Array {
  return new Uint8Array(Array.from(text).map((ch) => ch.codePointAt(0) ?? 0))
}

/** 文本 → UTF-8 字节（含多字节中文，走编码器而非 codePoint 直转） */
function utf8Bytes(text: string): Uint8Array {
  const out: number[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      )
    }
  }
  return Uint8Array.from(out)
}

function feedAll(pump: SseFramePump, bytes: Uint8Array, cutPoints: number[]): void {
  let prev = 0
  for (const cut of cutPoints) {
    pump.feedBytes(bytes.subarray(prev, cut))
    prev = cut
  }
  pump.feedBytes(bytes.subarray(prev))
}

describe('SseFramePump——分块喂帧（模拟 onChunkReceived）', () => {
  it('整块喂入：连续帧全部出信封（保持到达序）', () => {
    const got: SparkEventEnvelope[] = []
    const pump = new SseFramePump((e) => got.push(e))
    pump.feedBytes(utf8Bytes(frameOf(1, '甲') + frameOf(2, '乙')))
    expect(got.map((e) => e.seq)).toEqual([1, 2])
    expect(got.map((e) => (e.data as { text: string }).text)).toEqual(['甲', '乙'])
  })

  it('任意切点分块：帧被切碎仍能完整还原（含多字节字符中间切断）', () => {
    const stream = frameOf(1, '你好世界') + ': heartbeat\n\n' + frameOf(2, '再见')
    const bytes = utf8Bytes(stream)
    const got: SparkEventEnvelope[] = []
    const pump = new SseFramePump((e) => got.push(e))
    // 逐字节喂——最恶劣切点（含中文三字节序列中间）
    for (let i = 0; i < bytes.length; i++) {
      pump.feedBytes(bytes.subarray(i, i + 1))
    }
    expect(got.map((e) => e.seq)).toEqual([1, 2])
    expect((got[0]?.data as { text: string }).text).toBe('你好世界')
    // 心跳注释帧不出信封（帧数=2 而非 3）
  })

  it('CRLF 分行（代理/网关形态）：归一化后照常切帧', () => {
    const crlf = frameOf(1, 'x').replace(/\n/g, '\r\n')
    const got: SparkEventEnvelope[] = []
    const pump = new SseFramePump((e) => got.push(e))
    pump.feedBytes(utf8Bytes(crlf))
    expect(got).toHaveLength(1)
    expect(got[0]?.seq).toBe(1)
  })

  it('尾帧未收齐：留存缓冲，补块后出帧', () => {
    const full = frameOf(1, '尾帧')
    const bytes = utf8Bytes(full)
    const got: SparkEventEnvelope[] = []
    const pump = new SseFramePump((e) => got.push(e))
    feedAll(pump, bytes, [Math.floor(bytes.length / 2)])
    expect(got).toHaveLength(1)
  })

  it('坏帧（非法 JSON）抛错：调用方冒泡断开走重连（失败闭合）', () => {
    const pump = new SseFramePump(() => undefined)
    expect(() => pump.feedBytes(utf8Bytes('data: {不是JSON}\n\n'))).toThrow()
  })

  it('feedText 直喂文本段（跨块残余留存）', () => {
    const got: SparkEventEnvelope[] = []
    const pump = new SseFramePump((e) => got.push(e))
    const frame = frameOf(1, '文')
    pump.feedText(frame.slice(0, 10))
    expect(got).toHaveLength(0)
    pump.feedText(frame.slice(10))
    expect(got).toHaveLength(1)
  })
})

describe('utf8 直转一致性（bytesOf 仅 ASCII 用）', () => {
  it('ASCII 帧字节直转与 utf8Bytes 等价', () => {
    expect(Array.from(bytesOf('data'))).toEqual(Array.from(utf8Bytes('data')))
  })
})
