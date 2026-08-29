/**
 * UTF-8 流式解码单测（工单 9.4）：小程序无 TextDecoder——手写解码纯函数把关。
 * 跨块切断（多字节序列中间）、坏序列替字符、flush 收尾。
 */
import { describe, expect, it } from 'vitest'
import { Utf8StreamDecoder, decodeUtf8, safeUtf8Boundary } from '../src/transport/utf8'

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

describe('decodeUtf8——完整字节段解码', () => {
  it('ASCII / 中文 / 增补面（emoji）', () => {
    expect(decodeUtf8(utf8Bytes('hello'))).toBe('hello')
    expect(decodeUtf8(utf8Bytes('你好'))).toBe('你好')
    expect(decodeUtf8(utf8Bytes('🚀x'))).toBe('🚀x')
  })

  it('坏序列替为 U+FFFD（不崩、不静默吞）', () => {
    expect(decodeUtf8(Uint8Array.from([0xff, 0xfe]))).toBe('\uFFFD\uFFFD')
    // 3 字节首字节后缺续字节
    expect(decodeUtf8(Uint8Array.from([0xe4]))).toBe('\uFFFD')
    // 中文"你"(e4 bd a0) 后跟孤立续字节
    expect(decodeUtf8(Uint8Array.from([0xe4, 0xbd, 0xa0, 0x80]))).toBe('你\uFFFD')
  })
})

describe('safeUtf8Boundary——跨块安全切分点', () => {
  it('全 ASCII / 序列完整：切分点 = 长度', () => {
    expect(safeUtf8Boundary(utf8Bytes('abc'))).toBe(3)
    expect(safeUtf8Boundary(utf8Bytes('你'))).toBe(3)
    expect(safeUtf8Boundary(new Uint8Array(0))).toBe(0)
  })

  it('尾部不完整序列：切分点回退到序列起点', () => {
    const half = utf8Bytes('你').subarray(0, 2) // e4 bd（缺 a0）
    expect(safeUtf8Boundary(half)).toBe(0)
    const mix = Uint8Array.from([...utf8Bytes('ab'), ...utf8Bytes('你').subarray(0, 1)])
    expect(safeUtf8Boundary(mix)).toBe(2)
  })
})

describe('Utf8StreamDecoder——跨块有状态解码', () => {
  it('逐字节喂中文：残留拼齐后完整还原', () => {
    const decoder = new Utf8StreamDecoder()
    const bytes = utf8Bytes('你好，Spark！')
    let out = ''
    for (let i = 0; i < bytes.length; i++) {
      out += decoder.decode(bytes.subarray(i, i + 1))
    }
    out += decoder.flush()
    expect(out).toBe('你好，Spark！')
  })

  it('任意切点分块：拼接结果与整块一致', () => {
    const text = 'data: {"msg":"中文内容"}\n'
    const bytes = utf8Bytes(text)
    for (const cut of [1, 7, 13, bytes.length - 1]) {
      const decoder = new Utf8StreamDecoder()
      const out = decoder.decode(bytes.subarray(0, cut)) + decoder.decode(bytes.subarray(cut)) + decoder.flush()
      expect(out).toBe(text)
    }
  })

  it('流终止残留不完整序列：替字符收尾（不拿半截字符冒充）', () => {
    const decoder = new Utf8StreamDecoder()
    decoder.decode(Uint8Array.from([0x61, 0xe4])) // 'a' + 汉字首字节未收齐
    expect(decoder.flush()).toBe('\uFFFD')
  })

  it('空块与连续 flush：无副作用', () => {
    const decoder = new Utf8StreamDecoder()
    expect(decoder.decode(new Uint8Array(0))).toBe('')
    expect(decoder.flush()).toBe('')
    expect(decoder.flush()).toBe('')
  })
})
