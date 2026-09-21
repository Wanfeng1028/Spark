/**
 * 设置面板单测（阶段十九 19.23）：写路径单测 + 键位表单测。
 * 选行断言一律走「当前反白行」而非硬编码序号——字段表重排时用例应继续通过，
 * 而错位会直接报"找不到目标行"，不会静默写到别的字段上。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'ink-testing-library'
import type { Transport } from '@spark/protocol'
import { SettingsPanel } from '../src/components/SettingsPanel.js'
import { useCliStore } from '../src/store.js'

const BASE_SETTINGS = {
  server: { port: 4318, host: '127.0.0.1' },
  engine: {
    maxStepsPerTurn: 24,
    maxToolParallel: 4,
    toolTimeoutMs: 120000,
    permissionTimeoutMs: 300000,
    progressThrottleMs: 200,
    toolOutputLimitKB: 64,
    compactionThreshold: 0.8,
    checkpoints: true,
    bashSandbox: 'on',
    computerUseEnabled: false,
    bashPersistent: false,
  },
  certificates: { nodeExtraCaCerts: null },
  home: '/tmp/.spark',
  restartRequired: ['engine.toolTimeoutMs', 'engine.bashSandbox'],
  models: { defaultModel: 'deepseek/deepseek-chat', defaultEffort: null },
  ui: { language: 'zh-CN' },
}

const BASE_ROUTING = {
  fallbacks: [],
  compactionModel: 'deepseek/deepseek-chat',
  titleModel: 'deepseek/deepseek-chat',
  subagentModel: 'deepseek/deepseek-chat',
  costLimitUsd: null,
  defaultModel: 'deepseek/deepseek-chat',
  defaultEffort: null,
  usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 },
}

/** 夹具只覆盖面板实际读取的字段（其余字段本组件不消费，故不构造） */
function makeTransport() {
  const getSettings = vi.fn(async () => BASE_SETTINGS)
  const putSettings = vi.fn(async () => BASE_SETTINGS)
  const putRouting = vi.fn(async () => BASE_ROUTING)
  const transport = {
    getSettings,
    getRouting: async () => BASE_ROUTING,
    promptsInfo: async () => ({ slots: [], placeholders: [] }),
    updateSettings: putSettings,
    updateRouting: putRouting,
  } as unknown as Transport
  return { transport, getSettings, putSettings, putRouting }
}

interface Harness {
  stdin: { write: (s: string) => void }
  frame: () => string
}

const tick = () => new Promise((r) => setTimeout(r, 5))

async function open(transport: Transport): Promise<Harness> {
  const { stdin, lastFrame } = render(<SettingsPanel transport={transport} />)
  await tick()
  return {
    stdin: stdin as unknown as Harness['stdin'],
    frame: () => lastFrame() ?? '',
  }
}

/** 当前反白行（'> ' 前缀）= 光标所在字段 */
function selected(h: Harness): string {
  const line = h.frame()
    .split('\n')
    .find((l) => l.startsWith('> '))
  return (line ?? '').trim().slice(2)
}

/** 按下箭头走到目标字段——绕一圈仍找不到即失败，不静默停在别的字段上 */
async function moveTo(h: Harness, label: string): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    h.stdin.write('\x1b[B')
    await tick()
    if (selected(h).includes(label)) return
  }
  throw new Error(`未找到字段行：${label}`)
}

beforeEach(() => {
  useCliStore.getState().setPanel('none')
})

describe('SettingsPanel（阶段十九 19.23）', () => {
  it('装载：渲染字段值、重启标注与只读项说明', async () => {
    const h = await open(makeTransport().transport)
    expect(selected(h)).toContain('默认模型')
    expect(h.frame()).toContain('每回合最大步数')
    expect(h.frame()).toContain('24')
    // restartRequired 单源标注（engine.toolTimeoutMs 在名单内）
    expect(h.frame()).toContain('下次启动生效')
  })

  it('数值编辑：Enter 进编辑 · 输入数字 · Enter 提交，并按服务端回显重读', async () => {
    const { transport, putSettings, getSettings } = makeTransport()
    const h = await open(transport)
    await moveTo(h, '每回合最大步数')
    h.stdin.write('\r')
    await tick()
    h.stdin.write('\x7f'.repeat(2)) // 清空原值 24
    h.stdin.write('99')
    await tick()
    expect(h.frame()).toContain('[99]')
    h.stdin.write('\r')
    await tick()
    const patch = putSettings.mock.calls[0]?.[0] as { engine?: Record<string, unknown> }
    expect(patch.engine?.['maxStepsPerTurn']).toBe(99)
    // 整段回传（不受服务端合并语义牵连）+ 未变动字段保持现值
    expect(patch.engine?.['maxToolParallel']).toBe(4)
    expect(getSettings.mock.calls.length).toBe(2)
  })

  it('非法数值不发写请求：端侧预校验拦下并如实提示', async () => {
    const { transport, putSettings } = makeTransport()
    const h = await open(transport)
    await moveTo(h, '每回合最大步数')
    h.stdin.write('\r')
    await tick()
    h.stdin.write('abc')
    h.stdin.write('\r')
    await tick()
    expect(putSettings).not.toHaveBeenCalled()
    expect(h.frame()).toContain('需要整数')
  })

  it('布尔取反：Enter 直接写当前值的反面（不进编辑行）', async () => {
    const { transport, putSettings } = makeTransport()
    const h = await open(transport)
    await moveTo(h, 'turn 边界检查点')
    h.stdin.write('\r')
    await tick()
    const patch = putSettings.mock.calls[0]?.[0] as { engine?: Record<string, unknown> }
    expect(patch.engine?.['checkpoints']).toBe(false)
  })

  it('枚举循环两档：ui.language 走 settings、默认推理档走 routing', async () => {
    const { transport, putSettings, putRouting } = makeTransport()
    const h = await open(transport)
    // 光标首行 = 默认模型；下一行 = 默认推理档（null → 候选首项 low）
    h.stdin.write('\x1b[B')
    await tick()
    h.stdin.write('\r')
    await tick()
    expect(putRouting.mock.calls[0]?.[0]).toEqual({ defaultEffort: 'low' })
    await moveTo(h, '界面语言')
    h.stdin.write('\r')
    await tick()
    const patch = putSettings.mock.calls[0]?.[0] as { ui?: Record<string, unknown> }
    expect(patch.ui?.['language']).toBe('en')
  })

  it('Esc 只取消行内编辑、不关整面板（panelEditing 让位契约）', async () => {
    const { transport } = makeTransport()
    const h = await open(transport)
    await moveTo(h, '每回合最大步数')
    h.stdin.write('\r')
    await tick()
    expect(useCliStore.getState().panelEditing).toBe(true)
    h.stdin.write('\x1b')
    await tick()
    expect(useCliStore.getState().panelEditing).toBe(false)
    expect(h.frame()).not.toContain('[24]')
    expect(h.frame()).toContain('每回合最大步数')
  })

  it('只读字段不写：Enter 给出行内说明（禁假控件）', async () => {
    const { transport, putSettings } = makeTransport()
    const h = await open(transport)
    await moveTo(h, '自定义 CA 证书')
    h.stdin.write('\r')
    await tick()
    expect(putSettings).not.toHaveBeenCalled()
    expect(h.frame()).toContain('只读')
  })
})
