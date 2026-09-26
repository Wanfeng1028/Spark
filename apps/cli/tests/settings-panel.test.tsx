/**
 * 设置面板单测（阶段十九 19.23）：写路径单测 + 键位表单测。
 * 选行断言一律走「当前反白行」而非硬编码序号——字段表重排时用例应继续通过，
 * 而错位会直接报"找不到目标行"，不会静默写到别的字段上。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'ink-testing-library'
import type { RoutingUpdate, SettingsUpdate, Transport } from '@spark/protocol'
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
    bashSandbox: 'light',
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
  costLimitTokens: null,
  defaultModel: 'deepseek/deepseek-chat',
  defaultEffort: null,
  usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 },
}

/** 夹具只覆盖面板实际读取的字段（其余字段本组件不消费，故不构造） */
function makeTransport() {
  const getSettings = vi.fn(() => Promise.resolve(BASE_SETTINGS))
  const putSettings = vi.fn((_patch: SettingsUpdate) => Promise.resolve(BASE_SETTINGS))
  const putRouting = vi.fn((_patch: RoutingUpdate) => Promise.resolve(BASE_ROUTING))
  const transport = {
    getSettings,
    getRouting: () => Promise.resolve(BASE_ROUTING),
    promptsInfo: () => Promise.resolve({ slots: [], placeholders: [] }),
    updateSettings: putSettings,
    updateRouting: putRouting,
  } as unknown as Transport
  return { transport, getSettings, putSettings, putRouting }
}

interface Harness {
  stdin: { write: (s: string) => void }
  frame: () => string
}

/**
 * 等一拍让装载与渲染落地。本面板的字段值来自 GET /api/settings 的 promise（useEffect 里发出），
 * 断言选中行/按 Enter 都要等它 setState 重渲染完成；一拍 150ms 覆盖
 * "装载 → 编辑 → 提交 → 重取回显"整条链的余量（拍数不足时表现为找不到行、Enter 不触发写）。
 */
const tick = () => new Promise((r) => setTimeout(r, 150))

/**
 * 等到装载落定再返回：字段行来自 getSettings/getRouting 的 promise → setState → 重渲染，
 * 装载未落定就断言选中行/按 Enter，读到的是还没有字段行的那一帧。
 */
async function settleLoaded(h: Harness): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const f = h.frame()
    if (f !== '' && !f.includes('装载中')) return
    await tick()
  }
  throw new Error('面板装载未落定——40 拍后帧里仍是"装载中"')
}

async function open(transport: Transport): Promise<Harness> {
  const { stdin, lastFrame } = render(<SettingsPanel transport={transport} />)
  const h: Harness = {
    stdin,
    frame: () => lastFrame() ?? '',
  }
  await settleLoaded(h)
  return h
}

/**
 * 当前反白行（'> ' 前缀）= 光标所在字段。PanelShell 带 paddingX=1，整帧每行都前置一格
 * 空白，故按 trimStart 判行首标记——从列 0 起算永远找不到行（本文件与 panel-manage 同源）。
 */
function selected(h: Harness): string {
  const line = h.frame()
    .split('\n')
    .find((l) => l.trimStart().startsWith('> '))
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
    const before = getSettings.mock.calls.length
    h.stdin.write('\r')
    await tick()
    const patch = putSettings.mock.calls[0]?.[0]
    expect(patch?.engine?.['maxStepsPerTurn']).toBe(99)
    // 整段回传（不受服务端合并语义牵连）+ 未变动字段保持现值
    expect(patch?.engine?.['maxToolParallel']).toBe(4)
    // 禁乐观更新：写完必以服务端回显重读一次。基准计数取在提交 Enter 之前——取在等待之后
    // 会让"重读恰好已落地"退化成"等一次永不到来的第三次读"（ec8dc15 的 5s 超时即此）。
    for (let i = 0; i < 40; i += 1) {
      if (getSettings.mock.calls.length > before) break
      await tick()
    }
    expect(getSettings.mock.calls.length, '提交后未按服务端回显重读').toBe(before + 1)
    // 走字段表 + 等重读落地，每拍 150ms——缺省 5s 不够（判例 beb59db / 本文件另两例）
  }, 20000)

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
    const patch = putSettings.mock.calls[0]?.[0]
    expect(patch?.engine?.['checkpoints']).toBe(false)
  })

  // 走字段表要按下箭头十几到二十几次，每拍等 150ms（见 tick 注释）——缺省 5s 用例超时不够
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
    const patch = putSettings.mock.calls[0]?.[0]
    expect(patch?.ui?.['language']).toBe('en')
  }, 20000)

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
  }, 20000)
})
