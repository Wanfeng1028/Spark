/**
 * 基础库版本探测 + 会话页纯函数补充单测（工单 9.4）：
 * SSE 分块门槛 2.20.2 判定 / 分页合并保序 / 时间戳分隔。
 */
import { describe, expect, it } from 'vitest'
import { sdkSupportsChunked, sdkVersionAtLeast } from '../src/transport/support'
import {
  TIMESTAMP_GAP_MS,
  isReplayedDuplicate,
  mergeEventPage,
  shouldInsertTimestamp,
} from '../src/session/session-rows'
import type { SparkEventEnvelope } from '@spark/protocol'
import { formatTimestamp, ids } from '@spark/protocol'

describe('sdkVersionAtLeast / sdkSupportsChunked——分块能力门槛', () => {
  it('逐段数字比较（10 > 9 不字符串比较）', () => {
    expect(sdkVersionAtLeast('2.20.2', '2.20.2')).toBe(true)
    expect(sdkVersionAtLeast('2.20.3', '2.20.2')).toBe(true)
    expect(sdkVersionAtLeast('2.21.0', '2.20.2')).toBe(true)
    expect(sdkVersionAtLeast('3.0.0', '2.20.2')).toBe(true)
    expect(sdkVersionAtLeast('2.20.1', '2.20.2')).toBe(false)
    expect(sdkVersionAtLeast('2.9.9', '2.20.2')).toBe(false)
    expect(sdkVersionAtLeast('1.99.99', '2.20.2')).toBe(false)
  })

  it('段不足视为 0；空白容忍', () => {
    expect(sdkVersionAtLeast('2.20', '2.20.2')).toBe(false)
    expect(sdkVersionAtLeast('2.21', '2.20.2')).toBe(true)
    expect(sdkVersionAtLeast(' 2.20.2 ', '2.20.2')).toBe(true)
  })

  it('sdkSupportsChunked：2.20.2 恰为门槛', () => {
    expect(sdkSupportsChunked('2.20.2')).toBe(true)
    expect(sdkSupportsChunked('2.20.1')).toBe(false)
    expect(sdkSupportsChunked('3.1.5')).toBe(true)
  })
})

const SID = ids.session('ses_mini_rows_1')

function env(seq: number | undefined, id: string, time: number): SparkEventEnvelope {
  return {
    id: ids.event(`evt_mini_rows_${id}`),
    sessionId: SID,
    time,
    ...(seq !== undefined ? { seq } : {}),
    type: 'user.message',
    data: { text: id },
  }
}

describe('mergeEventPage——分页合并（前置+去重，不重排——评审 H1 同律）', () => {
  it('较旧一页前置并入既有窗口（到达序即正确重放序）', () => {
    const older = [env(1, 'a', 1), env(2, 'b', 2)]
    const existing = [env(3, 'c', 3), env(undefined, 'live', 4), env(4, 'd', 5)]
    const merged = mergeEventPage(older, existing)
    expect(merged.map((e) => e.seq)).toEqual([1, 2, 3, undefined, 4])
  })

  it('按 id 去重：重复页幂等（弱网重试安全）', () => {
    const page = [env(1, 'a', 1), env(2, 'b', 2)]
    const once = mergeEventPage(page, [env(3, 'c', 3)])
    const twice = mergeEventPage(page, once)
    expect(twice.map((e) => e.seq)).toEqual([1, 2, 3])
  })
})

describe('isReplayedDuplicate / 时间戳分隔', () => {
  it('重放重复帧：带 seq 且 <= 水位', () => {
    expect(isReplayedDuplicate({ seq: 2 }, 3)).toBe(true)
    expect(isReplayedDuplicate({ seq: 4 }, 3)).toBe(false)
    expect(isReplayedDuplicate({}, 99)).toBe(false)
  })

  it('间隔 >30 分钟插分隔；恰 30 分钟不插；时间缺失不插', () => {
    const base = 1_700_000_000_000
    expect(shouldInsertTimestamp(base, base + TIMESTAMP_GAP_MS + 1)).toBe(true)
    expect(shouldInsertTimestamp(base, base + TIMESTAMP_GAP_MS)).toBe(false)
    expect(shouldInsertTimestamp(undefined, base)).toBe(false)
  })

  it('"7月25日 18:30" 式时间戳文案（本机时区）', () => {
    const ms = new Date(2026, 6, 25, 18, 30).getTime()
    expect(formatTimestamp(ms)).toBe('7月25日 18:30')
  })
})
