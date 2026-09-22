/**
 * 命令面板族（工单 10.18④ / §13.K）：/model /mcp /skills /usage /checkpoint /tree
 * 六面板——数据全部走既有端点（零新后端），装载失败如实呈现错误文案（禁假状态）。
 * - ModelPanel：store.models 数据源（启动时装载），↑↓ 选择，Enter 确认切换；
 * - McpPanel/SkillsPanel/UsagePanel/CheckpointsPanel/TreePanel：只读。
 * 面板内键位（↑↓/Enter）由面板自身 useInput 消费（App 层在这些面板下不接管 ↑↓）。
 */
import { Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { useCliStore } from '../store.js'
import type {
  ArenaStatusDto,
  ArenaHistoryDto,
  ExtensionDto,
  TrustStatusDto,
  AgentPresetDto,
  CheckpointDto,
  ModelsDto,
  RoutingDto,
  SettingsDto,
  SkillDto,
  LspServerStatusDto,
  McpServerDto,
  SandboxNetworkStatusDto,
  SessionId,
  TreeNodeDto,
  Transport,
} from '@spark/protocol'
import { ids, KNOWN_LSP_SERVERS } from '@spark/protocol'

// 面板原语（壳 / 装载 / 写回 / 列表导航 / 二次确认）单一来源：panel-core.tsx（工单 19.24 抽出）
import {
  LoadState,
  PanelShell,
  rowMark,
  useConfirm,
  useEditor,
  useListNav,
  useLoad,
  usePanelWrite,
} from './panel-core.js'

/**
 * 模型面板（工单 10.18④；工单 19.24 加配置引导）：↑↓ 全量浏览，Enter 在**已配置**条目上
 * 切换会话模型，在**未配置**条目上行内录入该 provider 的 apiKey（PUT secrets 后即刷新目录，
 * 该行随之可选）。输入期回显星号——终端回声不留明文（真正红线是 key 永不进 GET 响应）。
 */
export function ModelPanel({
  models,
  current,
  onPick,
  transport,
}: {
  models: ModelsDto | null
  current: string | null
  onPick: (model: string) => void
  transport: Transport
}) {
  const entries =
    models === null
      ? []
      : models.models.map((m) => ({ ...m, configured: isConfigured(models, m.provider) }))
  const [selected, setSelected] = useState(0)
  const editor = useEditor()
  const { busy, msg, setMsg, run } = usePanelWrite()

  useInput((input, key) => {
    if (editor.handle(input, key, (buf) => {
      const entry = entries[selected]
      if (entry === undefined || buf === '') {
        setMsg(buf === '' ? '已取消（空密钥不写入）' : null)
        return
      }
      void run(
        async () => {
          await transport.setSecret(entry.provider, buf)
          useCliStore.getState().setModels(await transport.listModels())
        },
        `已保存 ${entry.provider} 的密钥（该行现已可选）`,
      )
    })) {
      return
    }
    if (entries.length === 0 || busy) return
    if (key.upArrow || key.downArrow) {
      const dir = key.upArrow ? -1 : 1
      setSelected((s) => (s + dir + entries.length) % entries.length)
      return
    }
    if (key.return) {
      const entry = entries[selected]
      if (entry === undefined) return
      if (entry.configured) {
        onPick(`${entry.provider}/${entry.model}`)
        return
      }
      setMsg(null)
      editor.begin('')
    }
  })

  return (
    <PanelShell
      title="模型"
      hint={
        editor.active
          ? `录入 ${entries[selected]?.provider ?? ''} apiKey：${'*'.repeat(editor.buf.length)}（Enter 保存 · Esc 取消）`
          : busy
            ? '写入中…'
            : entries.length > 0
              ? '↑↓ 选择 · Enter 切换 / 未配置项 Enter 录入密钥'
              : ''
      }
    >
      {models === null ? (
        <Text color="gray">（模型目录未装载——服务不可达）</Text>
      ) : (
        entries.map((m, i) => {
          const key = `${m.provider}/${m.model}`
          return (
            <Text
              key={key}
              inverse={i === selected}
              wrap="truncate-end"
              {...(m.configured ? {} : { color: 'gray' })}
            >
              {rowMark(i === selected)}
              {key}
              <Text color="gray">
                {'  '}
                {Math.round(m.contextWindow / 1000)}K
                {m.configured ? '' : '（未配置，Enter 录入 apiKey）'}
                {key === current ? '（当前）' : ''}
              </Text>
            </Text>
          )
        })
      )}
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

function isConfigured(models: ModelsDto, provider: string): boolean {
  return models.providers.some((p) => p.id === provider && p.configured)
}

/**
 * MCP 服务器面板（工单 19.24 升管理态）：连接状态 + Enter 删除条目（二次确认）。
 * 删除走"读-改-写"：读回按 MCP_ENV_MASK 掩码，写回时掩码值由 engine mcp/config.ts
 * 的合并语义还原盘上真值——故删一条不会连带清空其他服务器的 env/headers。
 * 新增/改参数仍是 web 设置中心（表单面窄屏不适用，且 CLI 不做假控件）。
 */
export function McpPanel({ transport }: { transport: Transport }) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<McpServerDto[]>(() => transport.listMcpServers(), revision)
  const { busy, msg, setMsg, run } = usePanelWrite()
  const { arm } = useConfirm(setMsg)
  const servers = state.status === 'ready' ? state.data : []
  const index = useListNav(servers, (s) => {
    if (busy) return
    arm(`mcp:${s.name}`, `删除 ${s.name}`, () => {
      void run(
        async () => {
          const config = await transport.getMcpConfig()
          await transport.updateMcpConfig({
            ...config,
            servers: Object.fromEntries(
              Object.entries(config.servers).filter(([name]) => name !== s.name),
            ),
          })
        },
        `已删除 ${s.name}`,
        () => setRevision((r) => r + 1),
      )
    })
  })
  return (
    <PanelShell title="MCP 服务器" hint="↑↓ 选择 · Enter 删除（二次确认）· 新增走 web 设置中心">
      <LoadState state={state} render={(list) =>
        list.length === 0 ? (
          <Text color="gray">（未配置 MCP 服务器——~/.spark/mcp.json）</Text>
        ) : (
          list.map((s, i) => (
            <Text key={s.name} wrap="truncate-end" inverse={i === index}>
              {rowMark(i === index)}
              <Text color={s.connected ? 'green' : 'red'}>{s.connected ? '●' : '○'}</Text>
              {' '}
              {s.name}
              <Text color="gray">
                {'  '}
                {s.tools} 工具 · {s.command}
              </Text>
            </Text>
          ))
        )
      } />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

/**
 * 语言服务器面板（工单 16.9；工单 19.24 升管理态）：已装清单 + 内置目录未装项，
 * Enter 安装（`npm install -g` + 写 ~/.spark/lsp.json，二次确认防手滑装全局包）。
 * 未连接/失败如实呈现 error——禁假状态。
 */
interface LspRow {
  key: string
  label: string
  detail: string
  /** null = 已装条目（只读状态）；非空 = 内置目录可安装 id */
  installId: string | null
  connected: boolean
}

export function LspPanel({ transport }: { transport: Transport }) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<LspServerStatusDto[]>(() => transport.listLspServers(), revision)
  const { busy, msg, setMsg, run } = usePanelWrite()
  const { arm } = useConfirm(setMsg)
  const servers = state.status === 'ready' ? state.data : []
  const rows: LspRow[] = [
    ...servers.map((s) => ({
      key: `on:${s.language}`,
      label: s.language,
      installId: null as string | null,
      connected: s.connected,
      detail: s.connected
        ? `已连接 · 诊断 ${s.files} 文件（E ${s.errors} / W ${s.warnings}）`
        : `未连接${s.error !== undefined ? ` · ${s.error}` : ''}`,
    })),
    ...KNOWN_LSP_SERVERS.filter((k) => !servers.some((s) => s.language === k.language)).map((k) => ({
      key: `install:${k.id}`,
      label: k.language,
      installId: k.id,
      connected: false,
      detail: `未安装 · ${k.description}`,
    })),
  ]
  const index = useListNav(rows, (r) => {
    const installId = r.installId
    if (installId === null || busy) return
    arm(r.key, `安装 ${installId}`, () => {
      void run(
        () => transport.installLspServer(installId),
        `已安装 ${installId}（npm 全局装 + 写 lsp.json）`,
        () => setRevision((x) => x + 1),
      )
    })
  })
  return (
    <PanelShell
      title="语言服务器"
      hint={busy ? '写入中…' : '↑↓ 选择 · Enter 安装未装项（二次确认）· 配置 ~/.spark/lsp.json'}
    >
      <LoadState state={state} render={() =>
        rows.length === 0 ? (
          <Text color="gray">（无语言服务器条目，且内置目录为空——异常）</Text>
        ) : (
          rows.map((r, i) => (
            <Text key={r.key} wrap="truncate-end" inverse={i === index}>
              {rowMark(i === index)}
              <Text color={r.installId === null ? (r.connected ? 'green' : 'red') : 'gray'}>
                {r.installId === null ? (r.connected ? '●' : '○') : '＋'}
              </Text>
              {' '}
              {r.label}
              <Text color="gray">  {r.detail}</Text>
            </Text>
          ))
        )
      } />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

/** 电脑控制面板（阶段十九 19.2 / ADR D44；工单 19.24 升管理态）：Enter 切换主开关（热档），
 *  八操作与审批档位只读（档位是权限规则，改它走审批卡"总是允许"或 web 权限页） */
const COMPUTER_OPS: ReadonlyArray<{ op: string; desc: string }> = [
  { op: 'screenshot', desc: '截屏 PNG（不进对话上下文）' },
  { op: 'click', desc: '坐标点击（左/右/中、双击）' },
  { op: 'type', desc: '键入文本（UNICODE）' },
  { op: 'key', desc: '按键/组合键' },
  { op: 'scroll', desc: '滚轮滚动' },
  { op: 'window', desc: '窗口清单/聚焦' },
  { op: 'app', desc: '进程清单/启动程序' },
  { op: 'clipboard', desc: '剪贴板读写' },
]

export function ComputerPanel({ transport }: { transport: Transport }) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<SettingsDto>(() => transport.getSettings(), revision)
  const { busy, msg, run } = usePanelWrite()
  const index = useListNav([{ key: 'engine.computerUseEnabled' }], () => {
    if (busy || state.status !== 'ready') return
    const cur = state.data.engine.computerUseEnabled
    void run(
      async () => {
        // 写前重读：整段回传不得用打开面板时的旧快照覆盖并发修改
        const s = await transport.getSettings()
        await transport.updateSettings({
          engine: { ...s.engine, computerUseEnabled: !cur },
        })
      },
      `主开关已${!cur ? '启用' : '停用'}（下一操作生效）`,
      () => setRevision((r) => r + 1),
    )
  })
  return (
    <PanelShell
      title="电脑控制"
      hint={busy ? '写入中…' : '↑↓ 选择 · Enter 切换主开关（改完下一操作生效）'}
    >
      <LoadState state={state} render={(s) => (
        <>
          <Text wrap="truncate-end" inverse={index === 0}>
            {rowMark(index === 0)}
            <Text color={s.engine.computerUseEnabled ? 'green' : 'gray'}>
              {s.engine.computerUseEnabled ? '● 已启用' : '○ 未启用'}
            </Text>
            <Text color="gray">  spark.json engine.computerUseEnabled（缺省关 fail-closed）</Text>
          </Text>
          {COMPUTER_OPS.map((o) => (
            <Text key={o.op} wrap="truncate-end">
              {'  computer://'}
              {o.op}
              <Text color="gray">  {o.desc}</Text>
            </Text>
          ))}
          <Text color="gray">审批档位 = 权限规则 computer:// 前缀（未设逐次询问，deny 胜出）</Text>
          <Text color="gray">执行体：Windows 全量 / macOS 需辅助功能授权 / Linux X11 需 xdotool 家族（Wayland 不支持）</Text>
        </>
      )} />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

/**
 * 沙箱与网络面板（阶段十九 19.7 / ADR D50；工单 19.24 升管理态）：Enter 切换 mode
 * off ↔ allowlist（热档）；清单条目与端口仍走 web 设置页（多行编辑与重启档不在窄屏做）。
 * 未就绪时如实呈现 reason——allowlist 档下 bash fail-closed 拒跑，不假称"已隔离"。
 */
export function SandboxPanel({ transport }: { transport: Transport }) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<SettingsDto>(() => transport.getSettings(), revision)
  const status = useLoad<SandboxNetworkStatusDto>(() => transport.sandboxNetworkStatus(), revision)
  const { busy, msg, run } = usePanelWrite()
  const index = useListNav([{ key: 'sandbox.network.mode' }], () => {
    if (busy || state.status !== 'ready') return
    const cur = state.data.sandbox?.network.mode ?? 'off'
    const next = cur === 'allowlist' ? 'off' : 'allowlist'
    void run(
      async () => {
        const s = await transport.getSettings()
        await transport.updateSettings({
          sandbox: { network: { ...s.sandbox?.network, mode: next } },
        })
      },
      next === 'allowlist'
        ? '出口过滤已开启（allowlist 为空 = 全部拒绝，bash 会 fail-closed）'
        : '出口过滤已关闭（off = 不拦截）',
      () => setRevision((r) => r + 1),
    )
  })
  return (
    <PanelShell
      title="沙箱与网络"
      hint={busy ? '写入中…' : '↑↓ 选择 · Enter 切换 mode（清单/端口在 web 设置页）'}
    >
      <LoadState state={state} render={(s) => {
        const net = s.sandbox?.network
        const enabled = net?.mode === 'allowlist'
        return (
          <>
            <Text wrap="truncate-end" inverse={index === 0}>
              {rowMark(index === 0)}
              <Text color={enabled ? 'green' : 'gray'}>{enabled ? '● allowlist' : '○ off（不拦截）'}</Text>
              <Text color="gray">  spark.json sandbox.network.mode</Text>
            </Text>
            <LoadState state={status} render={(st) => (
              <Text wrap="truncate-end">
                <Text color={st.ready ? 'green' : 'yellow'}>{st.ready ? '● 代理运行中' : '○ 代理未运行'}</Text>
                <Text color="gray">
                  {`  127.0.0.1:${String(st.port)}，活跃隧道 ${String(st.activeConnections)}`}
                  {st.reason !== null ? `（${st.reason}）` : ''}
                </Text>
              </Text>
            )} />
            <Text wrap="truncate-end">
              <Text color="gray">清单（{String((net?.allowlist ?? []).length)} 条）：</Text>
              {(net?.allowlist ?? []).length === 0 ? <Text color="gray">（空 = 全部拒绝）</Text> : null}
            </Text>
            {(net?.allowlist ?? []).slice(0, 8).map((d) => (
              <Text key={d} wrap="truncate-end">
                <Text color="gray">{'  '}</Text>
                {d}
              </Text>
            ))}
            {(net?.allowlist ?? []).length > 8 ? (
              <Text color="gray">{`  …余 ${String((net?.allowlist ?? []).length - 8)} 条（web 设置页看全量）`}</Text>
            ) : null}
            <Text color="gray">端口 spark.json sandbox.network.port（改端口需重启）</Text>
            <Text color="gray">边界：出口引导非内核隔离——尊重代理变量的客户端才走过滤（ADR D50）</Text>
          </>
        )
      }} />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

/** 竞答面板（工单 16.8 / ADR D42；工单 19.24 升管理态）：running 期 2s 轮询实时化 +
 *  Enter 应用所选 contender 为胜者（改动经 fs.write 审批）/ 取消本场（二次确认）。 */
export function ArenaPanel({ transport, sessionId }: { transport: Transport; sessionId: SessionId }) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<ArenaStatusDto | null>(() => transport.getArena(sessionId), revision)
  // 竞答历史计数（工单 19.10，翻案 D42 内存态）：TUI 窄——只给一行计数，全量历史表走 web 使用统计页
  const history = useLoad<ArenaHistoryDto>(() => transport.listArenaHistory(), revision)
  const { busy, msg, setMsg, run } = usePanelWrite()
  const { arm } = useConfirm(setMsg)
  const snap = state.status === 'ready' ? state.data : null
  useEffect(() => {
    if (snap === null || snap.status !== 'running') return
    const timer = setInterval(() => setRevision((r) => r + 1), 2000)
    return () => {
      clearInterval(timer)
    }
  }, [snap])
  const rows: ReadonlyArray<{ key: string; contenderId: string | null; model: string; detail: string }> =
    snap === null
      ? []
      : [
          ...snap.contenders.map((c) => ({
            key: `c:${c.sessionId}`,
            contenderId: c.sessionId,
            model: c.model,
            detail: [
              c.status === 'done' ? '完成' : c.status === 'running' ? '进行中' : '出错',
              `${(c.usage.inputTokens + c.usage.outputTokens).toLocaleString()} tokens`,
              c.durationMs !== null ? `${Math.round(c.durationMs / 1000)}s` : null,
              c.diffStat !== null
                ? `${c.diffStat.files} 文件（+${c.diffStat.additions} −${c.diffStat.deletions}）`
                : null,
              snap.winner === c.sessionId ? '已应用' : null,
            ]
              .filter((x): x is string => x !== null)
              .join(' · '),
          })),
          ...(snap.status === 'running'
            ? [{ key: 'cancel', contenderId: null, model: '取消本场', detail: '中断全部 contender' }]
            : []),
          ...(snap.status === 'done'
            ? [{ key: 'cancel', contenderId: null, model: '取消本场', detail: '已完成的竞答也可作废（不应用任何胜者）' }]
            : []),
        ]
  const index = useListNav(rows, (r) => {
    if (busy || snap === null) return
    if (r.key === 'cancel') {
      arm('cancel', '取消本场竞答', () => {
        void run(
          () => transport.cancelArena(sessionId),
          '已请求取消',
          () => setRevision((x) => x + 1),
        )
      })
      return
    }
    if (r.contenderId === null) return
    if (snap.status !== 'done') {
      setMsg('竞答仍在进行——结束后才能应用胜者')
      return
    }
    arm(r.key, `应用 ${r.model} 的改动`, () => {
      void run(
        () => transport.applyArenaWinner(sessionId, ids.session(r.contenderId ?? '')),
        `已提交应用 ${r.model}（改动走 fs.write 审批）`,
        () => setRevision((x) => x + 1),
      )
    })
  })
  return (
    <PanelShell
      title="多模型竞答"
      hint={busy ? '写入中…' : '↑↓ 选择 · Enter 应用该模型为胜者 / 取消本场（均需二次确认）'}
    >
      <LoadState state={state} render={(snap2) =>
        snap2 === null ? (
          <Text color="gray">（本会话没有竞答记录——/arena model-a|model-b &lt;任务&gt; 发起）</Text>
        ) : (
          <>
            <Text wrap="truncate-end">
              {snap2.status === 'running' ? '进行中' : snap2.status === 'done' ? '已完成' : '已取消'}
              <Text color="gray"> · {snap2.prompt}</Text>
            </Text>
            {rows.map((r, i) => (
              <Text key={r.key} wrap="truncate-end" inverse={i === index}>
                {rowMark(i === index)}
                <Text color={r.key === 'cancel' ? 'yellow' : 'green'}>
                  {r.key === 'cancel' ? '×' : '●'}
                </Text>
                {' '}
                {r.model}
                <Text color="gray">
                  {'  '}
                  {r.detail}
                </Text>
              </Text>
            ))}
            {snap2.applied !== null && snap2.applied.skippedDeletions.length > 0 && (
              <Text color="yellow">跳过删除类改动（请手动处理）：{snap2.applied.skippedDeletions.join('、')}</Text>
            )}
          </>
        )
      } />
      <LoadState state={history} render={(h) => (
        <Text color="gray">历史 {h.runs.length} 场（全量历史表见 web 设置中心·使用统计页）</Text>
      )} />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

/** 子代理面板（工单 16.2 / ADR D36；工单 19.24 升管理态）：Enter 启停（写 spark.json
 *  agents.disabledAgents——装载在构造期，故重启后生效） */
export function AgentsPanel({ transport }: { transport: Transport }) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<AgentPresetDto[]>(() => transport.listAgentPresets(), revision)
  const { busy, msg, run } = usePanelWrite()
  const presets = state.status === 'ready' ? state.data : []
  const index = useListNav(presets, (p) => {
    if (busy) return
    const off = p.disabled === true
    const next = presets
      .filter((x) => x.disabled === true && x.name !== p.name)
      .map((x) => x.name)
    if (!off) next.push(p.name)
    void run(
      async () => {
        const s = await transport.getSettings()
        await transport.updateSettings({ agents: { ...s.agents, disabledAgents: next } })
      },
      `${off ? '已启用' : '已停用'} ${p.name}（重启后生效）`,
      () => setRevision((r) => r + 1),
    )
  })
  return (
    <PanelShell
      title="子代理"
      hint={busy ? '写入中…' : '↑↓ 选择 · Enter 启停（写 spark.json，重启后生效）'}
    >
      <LoadState state={state} render={(list) =>
        list.length === 0 ? (
          <Text color="gray">（未配置预设档——~/.spark/agents/&lt;name&gt;.json 或 .spark/agents/&lt;name&gt;.json）</Text>
        ) : (
          list.map((p, i) => (
            <Text key={p.name} wrap="truncate-end" inverse={i === index}>
              {rowMark(i === index)}
              <Text color={p.disabled === true ? 'gray' : 'green'}>{p.disabled === true ? '○' : '●'}</Text>
              {' '}
              {p.name}
              <Text color="gray">
                {'  '}
                {p.source === 'project' ? '项目' : '用户'}
                {p.model !== undefined ? ` · ${p.model}` : ''}
                {p.disabled === true ? ' · 已停用' : ''}
              </Text>
            </Text>
          ))
        )
      } />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

/**
 * 文件夹信任面板（工单 16.4 / ADR D37；工单 19.24 升管理态）：当前目录与 trusted.json
 * 条目同列可改——Enter 在 trusted / untrusted 之间切换（写 ~/.spark/trusted.json）。
 * 未信任档下 bash/MCP 自动放行收紧为逐次询问（evaluateAll 后处理），deny/ask 规则不受影响。
 */
export function TrustPanel({ transport }: { transport: Transport }) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<TrustStatusDto>(() => transport.getTrust(), revision)
  const { busy, msg, run } = usePanelWrite()
  const cwd = process.cwd()
  const t = state.status === 'ready' ? state.data : null
  const rows: ReadonlyArray<{ key: string; path: string; trusted: boolean; label: string }> =
    t === null
      ? []
      : [
          { key: `cur:${cwd}`, path: cwd, trusted: t.current === 'trusted', label: `${cwd}（当前目录）` },
          ...t.folders
            .filter((f) => f.path !== cwd)
            .map((f) => ({
              key: `f:${f.path}`,
              path: f.path,
              trusted: f.trust === 'trusted',
              label: f.path,
            })),
        ]
  const index = useListNav(rows, (r) => {
    if (busy) return
    void run(
      () => transport.setTrust(r.path, r.trusted ? 'untrusted' : 'trusted'),
      `${r.trusted ? '已取消信任' : '已信任'} ${r.path}`,
      () => setRevision((x) => x + 1),
    )
  })
  return (
    <PanelShell title="文件夹信任" hint={busy ? '写入中…' : '↑↓ 选择 · Enter 切换信任档'}>
      <LoadState state={state} render={(cur) => (
        <>
          <Text wrap="truncate-end">
            当前目录：
            <Text color={cur.current === 'trusted' ? 'green' : cur.current === 'untrusted' ? 'red' : 'yellow'}>
              {cur.current === 'trusted' ? '已信任' : cur.current === 'untrusted' ? '明确不信任' : '未信任'}
            </Text>
            <Text color="gray">（未信任目录下 bash/MCP 自动放行收紧为询问）</Text>
          </Text>
          {rows.map((r, i) => (
            <Text key={r.key} wrap="truncate-end" inverse={i === index}>
              {rowMark(i === index)}
              <Text color={r.trusted ? 'green' : 'red'}>{r.trusted ? '●' : '○'}</Text>
              {' '}
              {r.label}
            </Text>
          ))}
        </>
      )} />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

/** 扩展面板（工单 16.5 / ADR D38；工单 19.24 升管理态）：Enter 启停
 *  （PUT /api/extensions/:id/enabled——停用名单写 spark.json，注册表构造期装配故重启生效） */
export function ExtensionsPanel({ transport }: { transport: Transport }) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<ExtensionDto[]>(() => transport.listExtensions(), revision)
  const { busy, msg, run } = usePanelWrite()
  const exts = state.status === 'ready' ? state.data : []
  const index = useListNav(exts, (e) => {
    if (busy) return
    void run(
      () => transport.setExtensionEnabled(e.id, !e.enabled),
      `${e.enabled ? '已停用' : '已启用'} ${e.id}（重启后生效）`,
      () => setRevision((r) => r + 1),
    )
  })
  return (
    <PanelShell title="扩展" hint={busy ? '写入中…' : '↑↓ 选择 · Enter 启停（重启后生效）'}>
      <LoadState state={state} render={(list) =>
        list.length === 0 ? (
          <Text color="gray">（未安装扩展——~/.spark/extensions/&lt;id&gt;/spark-extension.json）</Text>
        ) : (
          list.map((e, i) => (
            <Text key={e.id} wrap="truncate-end" inverse={i === index}>
              {rowMark(i === index)}
              <Text color={e.enabled ? 'green' : 'gray'}>{e.enabled ? '●' : '○'}</Text>
              {' '}
              {e.id}
              <Text color="gray">
                {'  '}
                {`v${e.version}`}
                {e.skills !== undefined ? ` · ${e.skills.length} 技能` : ''}
                {e.agents !== undefined ? ` · ${e.agents.length} 子代理` : ''}
                {e.commands !== undefined ? ` · ${e.commands.length} 命令` : ''}
                {e.mcpServers !== undefined ? ` · ${e.mcpServers.length} MCP` : ''}
                {!e.enabled ? ' · 已停用' : ''}
              </Text>
            </Text>
          ))
        )
      } />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

/** 技能面板：清单来源 = ~/.spark/skills 与已启用扩展包（D18 声明式内容包）。
 *  单条技能无启停位（协议里不存在该字段——停用走所属扩展或删目录），故本面板不造假控件。 */
export function SkillsPanel({ transport }: { transport: Transport }) {
  const state = useLoad<SkillDto[]>(() => transport.listSkills())
  return (
    <PanelShell title="技能" hint="清单来源 ~/.spark/skills 与已启用扩展包">
      <LoadState state={state} render={(skills) =>
        skills.length === 0 ? (
          <Text color="gray">（无已加载技能——~/.spark/skills/）</Text>
        ) : (
          skills.map((s) => (
            <Text key={s.name} wrap="truncate-end">
              ${s.name}
              <Text color="gray">
                {'  '}
                {s.events.length} 事件 · {s.hooks.length} 钩子
              </Text>
            </Text>
          ))
        )
      } />
      <Text color="gray">停用单条技能 = 停用其所属扩展（/extensions）或删除技能目录（人类执行）</Text>
    </PanelShell>
  )
}

/**
 * 用量与路由面板（工单 19.24 升管理态）：三处模型档 Enter 在**已配置模型**间循环，
 * 成本上限行内编辑（留空 = 清除）。fallback 链是有序列表、窄屏不做重排——留在 web
 * 使用统计页（不在终端造假控件）。写入走 PUT /api/routing（热生效下一请求）。
 */
export function UsagePanel({ transport }: { transport: Transport }) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<RoutingDto>(() => transport.getRouting(), revision)
  const catalog = useLoad<ModelsDto>(() => transport.listModels(), revision)
  const { busy, msg, setMsg, run } = usePanelWrite()
  const editor = useEditor()
  const r = state.status === 'ready' ? state.data : null
  const configured =
    catalog.status === 'ready'
      ? catalog.data.models
          .filter((m) => isConfigured(catalog.data, m.provider))
          .map((m) => `${m.provider}/${m.model}`)
      : []
  useEffect(() => {
    useCliStore.getState().setPanelEditing(editor.active)
    return () => {
      useCliStore.getState().setPanelEditing(false)
    }
  }, [editor.active])
  type Slot = 'compactionModel' | 'titleModel' | 'subagentModel'
  const rows: ReadonlyArray<{
    key: string
    label: string
    detail: string
    slot: Slot | null
    cost: boolean
  }> =
    r === null
      ? []
      : [
          { key: 'compactionModel', label: '压缩档', detail: r.compactionModel, slot: 'compactionModel', cost: false },
          { key: 'titleModel', label: '标题档', detail: r.titleModel, slot: 'titleModel', cost: false },
          { key: 'subagentModel', label: '子代理档', detail: r.subagentModel, slot: 'subagentModel', cost: false },
          {
            key: 'cost',
            label: '成本上限',
            detail: r.costLimitUsd === null ? '不限' : `$${r.costLimitUsd}`,
            slot: null,
            cost: true,
          },
        ]
  const commitCost = (buf: string): void => {
    if (r === null) return
    const trimmed = buf.trim()
    if (trimmed === '') {
      void run(() => transport.updateRouting({ costLimitUsd: null }), '已清除成本上限', () =>
        setRevision((x) => x + 1),
      )
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n <= 0) {
      setMsg('成本上限需为正数（留空 = 不限）')
      return
    }
    void run(() => transport.updateRouting({ costLimitUsd: n }), `成本上限已设为 $${n}`, () =>
      setRevision((x) => x + 1),
    )
  }
  useInput((input, key) => {
    editor.handle(input, key, commitCost)
  })
  const index = useListNav(rows, (row) => {
    if (busy || editor.active || r === null) return
    if (row.cost) {
      setMsg(null)
      editor.begin(r.costLimitUsd === null ? '' : String(r.costLimitUsd))
      return
    }
    const slot = row.slot
    if (slot === null) return
    if (configured.length === 0) {
      setMsg('无已配置模型可切换——先在 /model 录入 apiKey')
      return
    }
    const cur = r[slot]
    const at = configured.indexOf(cur)
    const next = configured[(at + 1 + configured.length) % configured.length] ?? cur
    const patch =
      slot === 'compactionModel'
        ? { compactionModel: next }
        : slot === 'titleModel'
          ? { titleModel: next }
          : { subagentModel: next }
    void run(() => transport.updateRouting(patch), `${row.label} → ${next}`, () =>
      setRevision((x) => x + 1),
    )
  })
  return (
    <PanelShell
      title="用量与路由"
      hint={
        editor.active
          ? `输入成本上限（美元，留空 = 不限）：${editor.buf} · Enter 提交 · Esc 取消`
          : busy
            ? '写入中…'
            : '↑↓ 选择 · Enter 切换模型档 / 编辑成本上限'
      }
    >
      <LoadState state={state} render={(routing) => (
        <>
          <Text>
            <Text color="gray">fallback 链：</Text>
            {routing.fallbacks.length === 0 ? '（空——不切换）' : routing.fallbacks.join(' → ')}
          </Text>
          {rows.map((row, i) => (
            <Text key={row.key} wrap="truncate-end" inverse={i === index}>
              {rowMark(i === index)}
              <Text color="gray">{row.label}：</Text>
              {row.detail}
            </Text>
          ))}
          <Text>
            <Text color="gray">成本：</Text>
            {`$${routing.usage.costUsd.toFixed(4)}`}
            {routing.costLimitUsd !== null ? ` / 上限 $${routing.costLimitUsd}` : '（不限）'}
            {routing.usage.exceeded ? <Text color="red">（已熔断）</Text> : ''}
          </Text>
          <Text color="gray">token 累计：↑{routing.usage.inputTokens} ↓{routing.usage.outputTokens}</Text>
        </>
      )} />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

/** 检查点面板（工单 10.18 只读；工单 19.24 升管理态）：Enter 回滚到该快照（二次确认——
 *  回滚会让 seq 倒退并重置投影，是面板里最重的动作）。 */
export function CheckpointsPanel({
  transport,
  sessionId,
}: {
  transport: Transport
  sessionId: SessionId
}) {
  const [revision, setRevision] = useState(0)
  const state = useLoad<CheckpointDto[]>(() => transport.listCheckpoints(sessionId), revision)
  const { busy, msg, setMsg, run } = usePanelWrite()
  const { arm } = useConfirm(setMsg)
  const list = state.status === 'ready' ? [...state.data].reverse() : []
  const index = useListNav(list, (c) => {
    if (busy) return
    arm(String(c.checkpointId), `回滚到 ${c.checkpointId}`, () => {
      void run(
        () => transport.rollbackCheckpoint(sessionId, c.checkpointId),
        `已回滚到 ${c.checkpointId}（投影已重放）`,
        () => setRevision((r) => r + 1),
      )
    })
  })
  return (
    <PanelShell
      title="检查点"
      hint={busy ? '写入中…' : '↑↓ 选择 · Enter 回滚（二次确认）· 亦可 /rollback <id>'}
    >
      <LoadState state={state} render={(items) =>
        items.length === 0 ? (
          <Text color="gray">（无快照——turn 完成后生成，或会话未启用检查点）</Text>
        ) : (
          list.map((c, i) => (
            <Text key={c.checkpointId} wrap="truncate-end" inverse={i === index}>
              {rowMark(i === index)}
              <Text color="cyan">{c.checkpointId}</Text>
              <Text color="gray">  {new Date(c.createdAt).toLocaleString('zh-CN')}</Text>
            </Text>
          ))
        )
      } />
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}

export function TreePanel({ transport, sessionId }: { transport: Transport; sessionId: SessionId }) {
  const state = useLoad<TreeNodeDto[]>(() => transport.getTree(sessionId))
  return (
    <PanelShell title="会话树" hint="只读">
      <LoadState state={state} render={(nodes) =>
        nodes.length === 0 ? (
          <Text color="gray">（空）</Text>
        ) : (
          nodes.map((n) => (
            <Text key={n.id} wrap="truncate-end">
              <Text color="gray">{n.seq}</Text> {n.label === '' ? n.type : n.label}
              {n.forks.length > 0 ? (
                <Text color="gray">
                  {' '}
                  ⑂ {n.forks.map((f) => (f.title === '' ? f.sessionId : f.title)).join('、')}
                </Text>
              ) : null}
            </Text>
          ))
        )
      } />
    </PanelShell>
  )
}
