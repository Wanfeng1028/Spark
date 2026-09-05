/**
 * 通知纯逻辑单测（工单 12.7 / new-tool 判例第 7 步精神——纯逻辑可测，Notification 本体壳层 mock）：
 * 配置装载三态（缺省/合法/坏 JSON 回缺省）、开关过滤、去抖合并、审批一次一发与 resolved 清除。
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_DESKTOP_CONFIG,
  loadDesktopConfig,
  NotifyGate,
  shouldNotify,
} from '../src/notify.js'

describe('loadDesktopConfig（~/.spark/desktop.json）', () => {
  test('文件不存在 → 缺省全开', () => {
    expect(loadDesktopConfig(join(tmpdir(), 'no-such-desktop.json'))).toEqual(
      DEFAULT_DESKTOP_CONFIG,
    )
  })

  test('合法配置如实装载（关项保留）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const p = join(dir, 'desktop.json')
    writeFileSync(p, '{"notifications":{"turnCompleted":false,"approvalWaiting":true}}', 'utf8')
    const cfg = loadDesktopConfig(p)
    expect(cfg.notifications.turnCompleted).toBe(false)
    expect(cfg.notifications.approvalWaiting).toBe(true)
    expect(shouldNotify(cfg, 'turnCompleted')).toBe(false)
    expect(shouldNotify(cfg, 'approvalWaiting')).toBe(true)
  })

  test('坏 JSON / 形状不符 → 回缺省且 warn 如实（fail-closed 不静默）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const warns: string[] = []
    const p1 = join(dir, 'bad.json')
    writeFileSync(p1, '{not json', 'utf8')
    expect(loadDesktopConfig(p1, (m) => warns.push(m))).toEqual(DEFAULT_DESKTOP_CONFIG)
    const p2 = join(dir, 'wrong.json')
    writeFileSync(p2, '{"notifications":{"turnCompleted":"yes"}}', 'utf8')
    expect(loadDesktopConfig(p2, (m) => warns.push(m))).toEqual(DEFAULT_DESKTOP_CONFIG)
    expect(warns).toHaveLength(2)
  })
})

describe('NotifyGate（去抖与审批一次一发）', () => {
  test('同会话同类 2s 内合并；跨会话不互扰', () => {
    let t = 1000
    const gate = new NotifyGate(() => t, 2000)
    expect(gate.decide('s1', 'turnCompleted')).toBe(true)
    expect(gate.decide('s1', 'turnCompleted')).toBe(false) // 窗口内合并
    t += 2001
    expect(gate.decide('s1', 'turnCompleted')).toBe(true) // 窗口过期再发
    expect(gate.decide('s2', 'turnCompleted')).toBe(true) // 跨会话独立
  })

  test('审批：同 requestId 一次一发；resolved 后可再来（新审批）', () => {
    const gate = new NotifyGate()
    expect(gate.decide('s1', 'approvalWaiting', 'req1')).toBe(true)
    expect(gate.decide('s1', 'approvalWaiting', 'req1')).toBe(false)
    gate.markResolved('req1')
    expect(gate.decide('s1', 'approvalWaiting', 'req1')).toBe(true)
    expect(gate.decide('s1', 'approvalWaiting', 'req2')).toBe(true)
  })

  test('审批缺 requestId → 不发（防误报）', () => {
    const gate = new NotifyGate()
    expect(gate.decide('s1', 'approvalWaiting')).toBe(false)
  })
})
