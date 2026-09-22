/**
 * 桌面配置与通知纯逻辑单测（工单 12.7；19.31 扩证书；19.30 扩通知面/去抖/窗口行为配置）：
 * 配置装载（缺省/合法/坏 JSON 与形状不符回缺省）、事件→通知映射、去抖闸门（窗口来自
 * desktop.json）、投递判据（handleNotifyEnvelope）、提示音的平台差异。
 * Notification/Tray 本体由壳层注入，本文件不 import electron。
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_DESKTOP_CONFIG,
  EXTRA_NOTIFY_EVENTS,
  handleNotifyEnvelope,
  loadDesktopConfig,
  NOTIFY_COPY,
  notificationSoundOf,
  NotifyGate,
  notifyTargetOf,
  toNotifyEnvelope,
  type DesktopConfig,
  type NotifyTarget,
} from '../src/notify.js'

function cfgOf(dir: string, name: string, json: string, warns?: string[]): DesktopConfig {
  const p = join(dir, name)
  writeFileSync(p, json, 'utf8')
  return loadDesktopConfig(p, warns === undefined ? undefined : (m) => warns.push(m))
}

describe('loadDesktopConfig（~/.spark/desktop.json）', () => {
  test('文件不存在 → 缺省全开', () => {
    expect(loadDesktopConfig(join(tmpdir(), 'no-such-desktop.json'))).toEqual(
      DEFAULT_DESKTOP_CONFIG,
    )
  })

  // 缺省值由 schema 现推（DEFAULT_DESKTOP_CONFIG = parse({})）：空对象与"文件不存在"必须同值，
  // 否则新增键就会两处默认值漂移
  test('空对象 {} → 与缺省常量逐项相等', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    expect(cfgOf(dir, 'empty.json', '{}')).toEqual(DEFAULT_DESKTOP_CONFIG)
  })

  test('合法配置如实装载（关项保留）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const cfg = cfgOf(dir, 'off.json', '{"notifications":{"turnCompleted":false,"approvalWaiting":true}}')
    expect(cfg.notifications.turnCompleted).toBe(false)
    expect(cfg.notifications.approvalWaiting).toBe(true)
    expect(notifyTargetOf(cfg, 'turn.completed')).toBeNull()
    expect(notifyTargetOf(cfg, 'permission.asked')).toBe('approvalWaiting')
  })

  test('坏 JSON / 形状不符 → 回缺省且 warn 如实（fail-closed 不静默）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const warns: string[] = []
    expect(cfgOf(dir, 'bad.json', '{not json', warns)).toEqual(DEFAULT_DESKTOP_CONFIG)
    expect(cfgOf(dir, 'wrong.json', '{"notifications":{"turnCompleted":"yes"}}', warns)).toEqual(
      DEFAULT_DESKTOP_CONFIG,
    )
    expect(warns).toHaveLength(2)
  })

  // 工单 19.31（V2-06 桌面半边）：certificates 段是 sidecar env 注入的唯一入口——手改
  // 文件的人往往只写这一段，故缺某段时该段回缺省，不连带判废另一段（键越界仍整份回缺省）
  test('只配 certificates → 证书装载、通知回缺省全开', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const cfg = cfgOf(dir, 'cert-only.json', '{"certificates":{"nodeExtraCaCerts":"/etc/certs/company-ca.pem"}}')
    expect(cfg.certificates.nodeExtraCaCerts).toBe('/etc/certs/company-ca.pem')
    expect(cfg.notifications).toEqual(DEFAULT_DESKTOP_CONFIG.notifications)
  })

  test('certificates 与 notifications 同时装载', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const cfg = cfgOf(
      dir,
      'both.json',
      '{"notifications":{"turnCompleted":false,"approvalWaiting":true},"certificates":{"nodeExtraCaCerts":null}}',
    )
    expect(cfg.notifications.turnCompleted).toBe(false)
    expect(cfg.certificates.nodeExtraCaCerts).toBeNull()
  })

  test('certificates 段类型错 / 键越界 → 整份回缺省且 warn（不半截生效）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const warns: string[] = []
    expect(cfgOf(dir, 'cert-wrong-type.json', '{"certificates":{"nodeExtraCaCerts":4096}}', warns)).toEqual(
      DEFAULT_DESKTOP_CONFIG,
    )
    expect(
      cfgOf(dir, 'cert-extra-key.json', '{"certificates":{"nodeExtraCaCerts":"/ca.pem","caBundle":"/ca2.pem"}}', warns),
    ).toEqual(DEFAULT_DESKTOP_CONFIG)
    expect(warns).toHaveLength(2)
  })

  // 工单 19.30：通知面（声音/事件/去抖）与窗口行为（关窗隐藏/保持运行/自启）扩容
  test('19.30 新键全量装载', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const cfg = cfgOf(
      dir,
      'v1930.json',
      '{"notifications":{"sound":false,"debounceMs":800,"events":["error","goal.paused"]},' +
        '"hideOnClose":true,"keepAwake":true,"autoLaunch":false}',
    )
    expect(cfg.notifications.sound).toBe(false)
    expect(cfg.notifications.debounceMs).toBe(800)
    expect(cfg.notifications.events).toEqual(['error', 'goal.paused'])
    expect(cfg.hideOnClose).toBe(true)
    expect(cfg.keepAwake).toBe(true)
    expect(cfg.autoLaunch).toBe(false)
  })

  test('19.30 新键缺省：通知面不外扩、关窗仍按退出（行为不变红线）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const cfg = cfgOf(dir, 'defaults.json', '{"certificates":{"nodeExtraCaCerts":null}}')
    expect(cfg.notifications).toEqual({
      turnCompleted: true,
      approvalWaiting: true,
      sound: true,
      debounceMs: 2000,
      events: [],
    })
    expect(cfg.hideOnClose).toBe(false)
    expect(cfg.keepAwake).toBe(false)
    expect(cfg.autoLaunch).toBe(false)
  })

  test('events 写白名单外的值 / debounceMs 越界 → 整份回缺省且 warn（不留假开关）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const warns: string[] = []
    expect(cfgOf(dir, 'unknown-event.json', '{"notifications":{"events":["assistant.delta"]}}', warns)).toEqual(
      DEFAULT_DESKTOP_CONFIG,
    )
    expect(cfgOf(dir, 'debounce-neg.json', '{"notifications":{"debounceMs":-1}}', warns)).toEqual(
      DEFAULT_DESKTOP_CONFIG,
    )
    expect(cfgOf(dir, 'debounce-float.json', '{"notifications":{"debounceMs":1.5}}', warns)).toEqual(
      DEFAULT_DESKTOP_CONFIG,
    )
    expect(warns).toHaveLength(3)
  })
})

describe('notifyTargetOf（事件类型 → 通知种类）', () => {
  const base = DEFAULT_DESKTOP_CONFIG
  const withExtras: DesktopConfig = {
    ...base,
    notifications: { ...base.notifications, events: ['error', 'goal.completed', 'goal.paused'] },
  }

  test('内置两枚按开关走（关 = 不发）', () => {
    expect(notifyTargetOf(base, 'turn.completed')).toBe('turnCompleted')
    expect(notifyTargetOf(base, 'permission.asked')).toBe('approvalWaiting')
    const off: DesktopConfig = {
      ...base,
      notifications: { ...base.notifications, turnCompleted: false, approvalWaiting: false },
    }
    expect(notifyTargetOf(off, 'turn.completed')).toBeNull()
    expect(notifyTargetOf(off, 'permission.asked')).toBeNull()
  })

  test('白名单事件要显式订阅才发；缺省空数组 = 不外扩', () => {
    expect(notifyTargetOf(base, 'error')).toBeNull()
    expect(notifyTargetOf(withExtras, 'error')).toBe('error')
    expect(notifyTargetOf(withExtras, 'goal.paused')).toBe('goal.paused')
    const onlyGoal: DesktopConfig = {
      ...base,
      notifications: { ...base.notifications, events: ['goal.completed'] },
    }
    expect(notifyTargetOf(onlyGoal, 'error')).toBeNull()
    expect(notifyTargetOf(onlyGoal, 'goal.completed')).toBe('goal.completed')
  })

  test('其余事件类型一律不发（通知面不是事件镜像）', () => {
    for (const t of ['user.message', 'tool.started', 'session.title', 'memory.injected', '']) {
      expect(notifyTargetOf(withExtras, t)).toBeNull()
    }
  })
})

describe('NOTIFY_COPY 与脱敏红线', () => {
  // 白名单就是"通知面"的边界：加一项必须连带文案，否则这条事件配上了也不发（假配置）
  test('白名单内每个事件都有标题与会话占位', () => {
    expect(EXTRA_NOTIFY_EVENTS).toEqual(['error', 'goal.completed', 'goal.paused'])
    for (const e of EXTRA_NOTIFY_EVENTS) {
      const copy = NOTIFY_COPY[e]
      expect(copy.title).toMatch(/^Spark · /)
      expect(copy.body).toContain('{session}')
    }
  })

  test('内置两枚同样有文案，且标题一律以 Spark 起头（不冒充别的应用）', () => {
    const targets: NotifyTarget[] = ['turnCompleted', 'approvalWaiting']
    for (const t of targets) {
      expect(NOTIFY_COPY[t].title.startsWith('Spark · ')).toBe(true)
      expect(NOTIFY_COPY[t].body).toContain('{session}')
    }
  })
})

describe('notificationSoundOf（提示音的平台差异如实处理）', () => {
  test('Windows/macOS：sound 取反成 silent', () => {
    expect(notificationSoundOf('win32', true)).toEqual({ silent: false, caveat: null })
    expect(notificationSoundOf('darwin', false)).toEqual({ silent: true, caveat: null })
  })

  test('Linux 不实现 silent：开声不吭（无假可拆），关声如实给 caveat（不谎称静音）', () => {
    expect(notificationSoundOf('linux', true)).toEqual({ silent: false, caveat: null })
    const off = notificationSoundOf('linux', false)
    expect(off.silent).toBe(false)
    expect(off.caveat).toContain('Linux')
  })
})

describe('toNotifyEnvelope（帧切片与坏帧筛选）', () => {
  test('带 type+sessionId 才收；data.requestId 有则取', () => {
    expect(
      toNotifyEnvelope({ type: 'permission.asked', sessionId: 's1', data: { requestId: 'r1' } }),
    ).toEqual({ type: 'permission.asked', sessionId: 's1', requestId: 'r1' })
    expect(toNotifyEnvelope({ type: 'turn.completed' })).toBeNull()
    expect(toNotifyEnvelope(null)).toBeNull()
    expect(toNotifyEnvelope('x')).toBeNull()
    expect(toNotifyEnvelope({ type: 'turn.completed', sessionId: 's1' })).toEqual({
      type: 'turn.completed',
      sessionId: 's1',
      requestId: null,
    })
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

  // 19.30：合并窗口从硬编码搬到 desktop.json（notifications.debounceMs）——闸门按配置值走
  test('窗口宽度取配置值（800ms 时 500ms 内合并、900ms 时再发）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-dt-'))
    const cfg = cfgOf(dir, 'd.json', '{"notifications":{"debounceMs":800}}')
    let t = 0
    const gate = new NotifyGate(() => t, cfg.notifications.debounceMs)
    expect(gate.decide('s1', 'turnCompleted')).toBe(true)
    t = 500
    expect(gate.decide('s1', 'turnCompleted')).toBe(false)
    t = 900
    expect(gate.decide('s1', 'turnCompleted')).toBe(true)
  })

  test('白名单事件的合并窗与内置同律（同会话同类合并）', () => {
    let t = 0
    const gate = new NotifyGate(() => t, 2000)
    expect(gate.decide('s1', 'error')).toBe(true)
    expect(gate.decide('s1', 'error')).toBe(false)
    t = 2500
    expect(gate.decide('s1', 'error')).toBe(true)
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

describe('handleNotifyEnvelope（一条信封的投递判据）', () => {
  const base = DEFAULT_DESKTOP_CONFIG
  const extras: DesktopConfig = {
    ...base,
    notifications: { ...base.notifications, events: ['error'] },
  }
  const titleOf = (id: string): Promise<string> => Promise.resolve(`标题-${id}`)

  function harness(cfg: DesktopConfig) {
    const sent: Array<{ title: string; body: string }> = []
    const deps = {
      cfg,
      gate: new NotifyGate(() => 0, cfg.notifications.debounceMs),
      titleOf,
      emit: (title: string, body: string) => sent.push({ title, body }),
    }
    return { sent, deps }
  }

  test('回合完成发一句人话，body 只含会话标题（不含正文）', async () => {
    const { sent, deps } = harness(base)
    await handleNotifyEnvelope({ type: 'turn.completed', sessionId: 's1', requestId: null }, deps)
    expect(sent).toEqual([{ title: 'Spark · 回合完成', body: '「标题-s1」的回合已结束' }])
  })

  test('开关关掉就不发，也不占去抖窗口', async () => {
    const off: DesktopConfig = {
      ...base,
      notifications: { ...base.notifications, turnCompleted: false },
    }
    const { sent, deps } = harness(off)
    await handleNotifyEnvelope({ type: 'turn.completed', sessionId: 's1', requestId: null }, deps)
    await handleNotifyEnvelope({ type: 'turn.completed', sessionId: 's1', requestId: null }, deps)
    expect(sent).toHaveLength(0)
  })

  test('白名单事件要订阅才发', async () => {
    const a = harness(base)
    await handleNotifyEnvelope({ type: 'error', sessionId: 's1', requestId: null }, a.deps)
    expect(a.sent).toHaveLength(0)
    const b = harness(extras)
    await handleNotifyEnvelope({ type: 'error', sessionId: 's2', requestId: null }, b.deps)
    expect(b.sent).toEqual([{ title: 'Spark · 运行出错', body: '「标题-s2」报告了一个错误，请回到窗口查看' }])
  })

  test('审批按 requestId 去重，resolved 后新请求可再发', async () => {
    const { sent, deps } = harness(base)
    await handleNotifyEnvelope({ type: 'permission.asked', sessionId: 's1', requestId: 'r1' }, deps)
    await handleNotifyEnvelope({ type: 'permission.asked', sessionId: 's1', requestId: 'r1' }, deps)
    expect(sent).toHaveLength(1)
    await handleNotifyEnvelope({ type: 'permission.resolved', sessionId: 's1', requestId: 'r1' }, deps)
    await handleNotifyEnvelope({ type: 'permission.asked', sessionId: 's1', requestId: 'r1' }, deps)
    expect(sent).toHaveLength(2)
  })

  test('审批缺 requestId → 不发（宁缺不假报）', async () => {
    const { sent, deps } = harness(base)
    await handleNotifyEnvelope({ type: 'permission.asked', sessionId: 's1', requestId: null }, deps)
    expect(sent).toHaveLength(0)
  })

  test('与通知无关的事件不占去抖窗口（后面真该发的照常发）', async () => {
    const { sent, deps } = harness(extras)
    await handleNotifyEnvelope({ type: 'assistant.message', sessionId: 's1', requestId: null }, deps)
    await handleNotifyEnvelope({ type: 'turn.completed', sessionId: 's1', requestId: null }, deps)
    expect(sent).toHaveLength(1)
  })
})
