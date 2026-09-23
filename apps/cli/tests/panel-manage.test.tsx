/**
 * CLI 面板管理态单测（阶段十九 19.24）：每面板"操作 → 引擎生效"一条——断言的是
 * 传给 Transport 的写参数（引擎侧生效由 server/engine 测试覆盖），以及二次确认
 * 必须两次 Enter 才落写（防手滑改坏数据）。
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from 'ink-testing-library'
import {
  ids,
  type CheckpointId,
  type McpConfigInput,
  type ModelsDto,
  type RoutingUpdate,
  type SessionId,
  type SettingsUpdate,
  type Transport,
} from '@spark/protocol'
import {
  AgentsPanel,
  ArenaPanel,
  CheckpointsPanel,
  ComputerPanel,
  ExtensionsPanel,
  LspPanel,
  McpPanel,
  ModelPanel,
  SandboxPanel,
  TrustPanel,
  UsagePanel,
} from '../src/components/CommandPanels.js'
import type { ReactElement } from 'react'

const SID = ids.session('ses_0000000000000000000000000000a1')

/**
 * 等一拍让装载与渲染落地。面板的行来自 useLoad 的 promise（useEffect 里发出），Enter 的
 * 目标行、写回后的重取都要等它 setState 重渲染完成；一拍 150ms 覆盖
 * "写入 → 重取 → 再渲染"这条链的余量（拍数不足时表现为选中行为空、Enter 找不到目标）。
 */
const tick = () => new Promise((r) => setTimeout(r, 150))

interface H {
  stdin: { write: (s: string) => void }
  frame: () => string
}

/**
 * 等到装载落定再返回：与装载同批的键位/选中行断言若抢在前面，读到的是还没有数据行的那一帧。
 * 判据 = 帧里不再有 LoadState 装载态那一行的"装载中"（cli.loading 文案）。
 */
async function settleLoaded(h: H): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const f = h.frame()
    if (f !== '' && !f.includes('装载中')) return
    await tick()
  }
  throw new Error('面板装载未落定——40 拍后帧里仍是"装载中"')
}

async function open(node: ReactElement): Promise<H> {
  const { stdin, lastFrame } = render(node)
  const h: H = {
    stdin,
    frame: () => lastFrame() ?? '',
  }
  await settleLoaded(h)
  return h
}

/**
 * 当前选中行（行首 '> ' = rowMark）。PanelShell 带 paddingX=1（panel-core.tsx 的面板壳），
 * 整帧每行都前置一格空白，故按 trimStart 判行首标记——从列 0 起算永远找不到行。
 */
function selected(h: H): string {
  const line = h.frame()
    .split('\n')
    .find((l) => l.trimStart().startsWith('> '))
  return (line ?? '').trim().slice(2)
}

async function moveTo(h: H, label: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    h.stdin.write('\x1b[B')
    await tick()
    if (selected(h).includes(label)) return
  }
  throw new Error(`未找到面板行：${label}`)
}

/** 二次确认：Enter 两次，并断言第一次确实没落写 */
async function enterTwice(
  h: H,
  spy: { mock: { calls: unknown[][] } },
  before: number,
): Promise<void> {
  h.stdin.write('\r')
  await tick()
  expect(spy.mock.calls.length, '首次 Enter 只应挂起确认').toBe(before)
  expect(h.frame()).toContain('再按一次 Enter 确认')
  h.stdin.write('\r')
  await tick()
}

const asTransport = (fake: Record<string, unknown>): Transport => fake as unknown as Transport

/** 写 settings 的整段回传断言助手 */
function engineOf(call: unknown[] | undefined): Record<string, unknown> {
  const patch = call?.[0] as { engine?: Record<string, unknown> } | undefined
  return patch?.engine ?? {}
}

const SETTINGS = {
  server: { port: 4318, host: '127.0.0.1' },
  engine: {
    maxStepsPerTurn: 24,
    maxToolParallel: 4,
    toolTimeoutMs: 1000,
    permissionTimeoutMs: 1000,
    progressThrottleMs: 100,
    toolOutputLimitKB: 8,
    compactionThreshold: 0.8,
    checkpoints: true,
    bashSandbox: 'on',
    computerUseEnabled: false,
    bashPersistent: false,
  },
  sandbox: { network: { mode: 'off', allowlist: ['example.com'], port: 1080 } },
  certificates: { nodeExtraCaCerts: null },
  home: '/tmp/.spark',
  restartRequired: [],
  models: { defaultModel: 'deepseek/deepseek-chat', defaultEffort: null },
}

/** 供应商条目按引擎 listModels 的合成口径取值：未配置 → apiKeyEnv null + hasKey false +
 *  baseUrl 不带（自定义 glm 不在 PROVIDER_CATALOG，label 回落 id、api 回落 openai-completions） */
const MODELS: ModelsDto = {
  providers: [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      builtin: true,
      configured: true,
      baseUrl: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      hasKey: true,
      api: 'openai-completions',
    },
    {
      id: 'glm',
      label: 'glm',
      builtin: false,
      configured: false,
      apiKeyEnv: null,
      hasKey: false,
      api: 'openai-completions',
    },
  ],
  models: [
    { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 65536 },
    { provider: 'glm', model: 'glm-4', contextWindow: 128000 },
  ],
  defaultModel: { provider: 'deepseek', model: 'deepseek-chat', contextWindow: 65536 },
}

describe('CLI 面板管理态（阶段十九 19.24）', () => {
  it('子代理：Enter 停用写入 disabledAgents（保留既有停用项）', async () => {
    const updateSettings = vi.fn((_patch: SettingsUpdate) => Promise.resolve(SETTINGS))
    const h = await open(
      <AgentsPanel
        transport={asTransport({
          listAgentPresets: () =>
            Promise.resolve([
              { name: 'reviewer', source: 'user' },
              { name: 'scout', disabled: true, source: 'project' },
            ]),
          getSettings: () => Promise.resolve(SETTINGS),
          updateSettings,
        })}
      />,
    )
    expect(selected(h)).toContain('reviewer')
    h.stdin.write('\r')
    await tick()
    const patch = updateSettings.mock.calls[0]?.[0]
    expect(patch?.agents?.['disabledAgents']?.sort()).toEqual(['reviewer', 'scout'])
    expect(h.frame()).toContain('重启后生效')
  })

  it('扩展：Enter 调 setExtensionEnabled 取反', async () => {
    const setExtensionEnabled = vi.fn(
      (_id: string, _enabled: boolean): Promise<void> => Promise.resolve(undefined),
    )
    const h = await open(
      <ExtensionsPanel
        transport={asTransport({
          listExtensions: () =>
            Promise.resolve([{ id: 'pack-a', enabled: true, version: '1.0.0' }]),
          setExtensionEnabled,
        })}
      />,
    )
    h.stdin.write('\r')
    await tick()
    expect(setExtensionEnabled.mock.calls[0]).toEqual(['pack-a', false])
  })

  it('信任：当前目录行进 Enter 写 setTrust(cwd, trusted)（未信任→信任）', async () => {
    const setTrust = vi.fn(
      (_path: string, _trust: 'trusted' | 'untrusted'): Promise<void> => Promise.resolve(undefined),
    )
    const h = await open(
      <TrustPanel
        transport={asTransport({
          getTrust: () =>
            Promise.resolve({ folders: [{ path: '/other', trust: 'trusted' }], current: 'none' }),
          setTrust,
        })}
      />,
    )
    expect(selected(h)).toContain('当前目录')
    h.stdin.write('\r')
    await tick()
    expect(setTrust.mock.calls[0]?.[1]).toBe('trusted')
    expect(setTrust.mock.calls[0]?.[0]).toBe(process.cwd())
  })

  it('MCP：两次 Enter 才删除条目，其余 server 配置原样保留', async () => {
    const updateMcpConfig = vi.fn((_config: McpConfigInput) => Promise.resolve({ ok: true }))
    const h = await open(
      <McpPanel
        transport={asTransport({
          listMcpServers: () =>
            Promise.resolve([
              { name: 'keep', connected: true, tools: 1, command: 'keep-cmd' },
              { name: 'drop', connected: false, tools: 0, command: 'drop-cmd' },
            ]),
          getMcpConfig: () =>
            Promise.resolve({
              version: 1,
              servers: { keep: { command: 'keep-cmd' }, drop: { command: 'drop-cmd' } },
            }),
          updateMcpConfig,
        })}
      />,
    )
    await moveTo(h, 'drop')
    await enterTwice(h, updateMcpConfig, 0)
    const config = updateMcpConfig.mock.calls[0]?.[0]
    expect(Object.keys(config?.servers ?? {})).toEqual(['keep'])
  })

  it('检查点：两次 Enter 才回滚到所选快照', async () => {
    const rollbackCheckpoint = vi.fn(
      (_sid: SessionId, _cid: CheckpointId) => Promise.resolve({ id: SID }),
    )
    const h = await open(
      <CheckpointsPanel
        sessionId={SID}
        transport={asTransport({
          listCheckpoints: () =>
            Promise.resolve([
              { checkpointId: ids.checkpoint('ckp_one'), turnId: ids.turn('trn_one'), createdAt: 1, files: [] },
              { checkpointId: ids.checkpoint('ckp_two'), turnId: ids.turn('trn_two'), createdAt: 2, files: [] },
            ]),
          rollbackCheckpoint,
        })}
      />,
    )
    // 面板按倒序展示（最新在前）——首行应是 ckp_two
    expect(selected(h)).toContain('ckp_two')
    await enterTwice(h, rollbackCheckpoint, 0)
    expect(rollbackCheckpoint.mock.calls[0]?.[1]).toBe(ids.checkpoint('ckp_two'))
  })

  it('竞答：done 状态 Enter 两次应用所选模型为胜者', async () => {
    const applyArenaWinner = vi.fn(
      (_sid: SessionId, _contender: SessionId): Promise<void> => Promise.resolve(undefined),
    )
    const h = await open(
      <ArenaPanel
        transport={asTransport({
          getArena: () =>
            Promise.resolve({
              arenaId: 'arn_1',
              prompt: 'p',
              status: 'done',
              contenders: [
                {
                  sessionId: 'ses_contender_a',
                  model: 'deepseek/deepseek-chat',
                  status: 'done',
                  usage: { inputTokens: 1, outputTokens: 2 },
                  durationMs: 1000,
                  diffStat: null,
                },
              ],
              winner: null,
              applied: null,
            }),
          listArenaHistory: () => Promise.resolve({ runs: [] }),
          applyArenaWinner,
        })}
        sessionId={SID}
      />,
    )
    await enterTwice(h, applyArenaWinner, 0)
    expect(applyArenaWinner.mock.calls[0]).toEqual([SID, 'ses_contender_a'])
  })

  it('竞答：running 状态不得应用胜者，取消行需二次确认', async () => {
    const applyArenaWinner = vi.fn(
      (_sid: SessionId, _contender: SessionId): Promise<void> => Promise.resolve(undefined),
    )
    const cancelArena = vi.fn(
      (_sid: SessionId): Promise<void> => Promise.resolve(undefined),
    )
    const h = await open(
      <ArenaPanel
        transport={asTransport({
          getArena: () =>
            Promise.resolve({
              arenaId: 'arn_1',
              prompt: 'p',
              status: 'running',
              contenders: [
                {
                  sessionId: 'ses_contender_a',
                  model: 'deepseek/deepseek-chat',
                  status: 'running',
                  usage: { inputTokens: 0, outputTokens: 0 },
                  durationMs: null,
                  diffStat: null,
                },
              ],
              winner: null,
              applied: null,
            }),
          listArenaHistory: () => Promise.resolve({ runs: [] }),
          applyArenaWinner,
          cancelArena,
        })}
        sessionId={SID}
      />,
    )
    // 首行 = contender：running 下应用被拒（禁假状态，明确文案）
    h.stdin.write('\r')
    await tick()
    expect(applyArenaWinner).not.toHaveBeenCalled()
    expect(h.frame()).toContain('竞答仍在进行')
    // 取消行：两次 Enter 才落写
    await moveTo(h, '取消本场')
    await enterTwice(h, cancelArena, 0)
    expect(cancelArena.mock.calls[0]).toEqual([SID])
  })

  it('语言服务器：内置目录未装项 Enter 两次触发安装', async () => {
    const installLspServer = vi.fn((_id: string) =>
      Promise.resolve({
        language: 'typescript',
        command: 'typescript-language-server',
        args: ['--stdio'],
        written: true,
      }),
    )
    const h = await open(
      <LspPanel transport={asTransport({ listLspServers: () => Promise.resolve([]), installLspServer })} />,
    )
    await moveTo(h, 'typescript')
    expect(h.frame()).toContain('未安装')
    await enterTwice(h, installLspServer, 0)
    expect(installLspServer.mock.calls[0]).toEqual(['typescript'])
  })

  it('用量路由：模型档 Enter 在已配置模型间循环，写 PUT /api/routing', async () => {
    const updateRouting = vi.fn((_patch: RoutingUpdate) => Promise.resolve(ROUTING))
    const h = await open(
      <UsagePanel
        transport={asTransport({
          getRouting: () => Promise.resolve(ROUTING),
          listModels: () => Promise.resolve(MODELS),
          updateRouting,
        })}
      />,
    )
    expect(selected(h)).toContain('压缩档')
    h.stdin.write('\r')
    await tick()
    // 只有一个已配置模型 → 循环回自身，仍如实写入一次（不静默吞操作）
    expect(updateRouting.mock.calls[0]?.[0]).toEqual({ compactionModel: 'deepseek/deepseek-chat' })
    await moveTo(h, '成本上限')
    h.stdin.write('\r')
    await tick()
    h.stdin.write('25')
    h.stdin.write('\r')
    await tick()
    expect(updateRouting.mock.calls[1]?.[0]).toEqual({ costLimitUsd: 25 })
  })

  it('用量路由：非法成本上限不落写', async () => {
    const updateRouting = vi.fn((_patch: RoutingUpdate) => Promise.resolve(ROUTING))
    const h = await open(
      <UsagePanel
        transport={asTransport({
          getRouting: () => Promise.resolve(ROUTING),
          listModels: () => Promise.resolve(MODELS),
          updateRouting,
        })}
      />,
    )
    await moveTo(h, '成本上限')
    h.stdin.write('\r')
    await tick()
    h.stdin.write('abc')
    h.stdin.write('\r')
    await tick()
    expect(updateRouting).not.toHaveBeenCalled()
    expect(h.frame()).toContain('成本上限需为正数')
  })

  it('模型面板：未配置项 Enter 录入 apiKey → setSecret 并重取目录', async () => {
    const setSecret = vi.fn(
      (_provider: string, _value: string): Promise<void> => Promise.resolve(undefined),
    )
    const listModels = vi.fn(() => Promise.resolve(MODELS))
    const onPick = vi.fn()
    const h = await open(
      <ModelPanel
        models={MODELS}
        current={null}
        onPick={onPick}
        transport={asTransport({ setSecret, listModels })}
      />,
    )
    // 首行 deepseek 已配置 → 直接切换；第二行 glm 未配置 → 进入密钥录入
    h.stdin.write('\x1b[B')
    await tick()
    h.stdin.write('\r')
    await tick()
    expect(onPick).not.toHaveBeenCalled()
    h.stdin.write('sk-test')
    h.stdin.write('\r')
    await tick()
    expect(setSecret.mock.calls[0]).toEqual(['glm', 'sk-test'])
    expect(listModels.mock.calls.length).toBe(1)
    expect(h.frame()).not.toContain('sk-test')
  })

  it('电脑控制：Enter 取反主开关并整段回传 engine', async () => {
    const updateSettings = vi.fn((_patch: SettingsUpdate) => Promise.resolve(SETTINGS))
    const h = await open(
      <ComputerPanel
        transport={asTransport({ getSettings: () => Promise.resolve(SETTINGS), updateSettings })}
      />,
    )
    h.stdin.write('\r')
    await tick()
    const engine = engineOf(updateSettings.mock.calls[0])
    expect(engine['computerUseEnabled']).toBe(true)
    expect(engine['maxStepsPerTurn']).toBe(24)
  })

  it('沙箱：Enter 切换出口过滤档并保留 allowlist', async () => {
    const updateSettings = vi.fn((_patch: SettingsUpdate) => Promise.resolve(SETTINGS))
    const h = await open(
      <SandboxPanel
        transport={asTransport({
          getSettings: () => Promise.resolve(SETTINGS),
          sandboxNetworkStatus: () =>
            Promise.resolve({
              ready: false,
              reason: '未启动',
              activeConnections: 0,
              port: 1080,
            }),
          updateSettings,
        })}
      />,
    )
    h.stdin.write('\r')
    await tick()
    const patch = updateSettings.mock.calls[0]?.[0]
    expect(patch?.sandbox?.network['mode']).toBe('allowlist')
    expect(patch?.sandbox?.network['allowlist']).toEqual(['example.com'])
  })
})

const ROUTING = {
  fallbacks: [],
  compactionModel: 'deepseek/deepseek-chat',
  titleModel: 'deepseek/deepseek-chat',
  subagentModel: 'deepseek/deepseek-chat',
  costLimitUsd: null,
  defaultModel: 'deepseek/deepseek-chat',
  defaultEffort: null,
  usage: {
    costUsd: 0.12,
    inputTokens: 100,
    outputTokens: 200,
    cacheRead: 0,
    cacheWrite: 0,
    exceeded: false,
  },
}
