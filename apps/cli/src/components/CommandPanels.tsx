/**
 * 命令面板族（工单 10.18④ / §13.K）：/model /mcp /skills /usage /checkpoint /tree
 * 六面板——数据全部走既有端点（零新后端），装载失败如实呈现错误文案（禁假状态）。
 * - ModelPanel：store.models 数据源（启动时装载），↑↓ 选择，Enter 确认切换；
 * - McpPanel/SkillsPanel/UsagePanel/CheckpointsPanel/TreePanel：只读。
 * 面板内键位（↑↓/Enter）由面板自身 useInput 消费（App 层在这些面板下不接管 ↑↓）。
 */
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import type {
  CheckpointDto,
  ModelsDto,
  RoutingDto,
  SkillDto,
  McpServerDto,
  SessionId,
  TreeNodeDto,
  Transport,
} from '@spark/protocol'

/** 面板壳：标题 + 关闭提示 + 内容 */
function PanelShell({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text>
        {title}
        <Text color="gray">  {hint} · Esc 关闭</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  )
}

/** 装载态文案（只读面板共用——失败如实呈现，禁假状态） */
function LoadState<T>({
  state,
  render,
}: {
  state: { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }
  render: (data: T) => React.ReactNode
}) {
  if (state.status === 'loading') return <Text color="gray">装载中…</Text>
  if (state.status === 'error') return <Text color="red">{state.message}</Text>
  return <>{render(state.data)}</>
}

type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

/** 挂载时装载一次（面板生命周期内不重取——打开即快照） */
function useLoad<T>(load: () => Promise<T>): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' })
  useEffect(() => {
    let disposed = false
    load()
      .then((data) => {
        if (!disposed) setState({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (!disposed) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      disposed = true
    }
  }, [])
  return state
}

export function ModelPanel({
  models,
  current,
  onPick,
}: {
  models: ModelsDto | null
  current: string | null
  onPick: (model: string) => void
}) {
  const entries =
    models === null
      ? []
      : models.models.map((m) => ({ ...m, configured: isConfigured(models, m.provider) }))
  const selectable = entries.filter((e) => e.configured)
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (selectable.length === 0) return
    if (key.upArrow || key.downArrow) {
      const dir = key.upArrow ? -1 : 1
      setSelected((s) => (s + dir + selectable.length) % selectable.length)
      return
    }
    if (key.return) {
      const pick = selectable[selected]
      if (pick !== undefined) onPick(`${pick.provider}/${pick.model}`)
    }
  })

  return (
    <PanelShell title="模型" hint={selectable.length > 0 ? '↑↓ 选择 · Enter 切换' : ''}>
      {models === null ? (
        <Text color="gray">（模型目录未装载——服务不可达）</Text>
      ) : (
        entries.map((m) => {
          const key = `${m.provider}/${m.model}`
          const selIdx = selectable.indexOf(m)
          return (
            <Text
              key={key}
              inverse={selIdx === selected && m.configured}
              wrap="truncate-end"
              {...(m.configured ? {} : { color: 'gray' })}
            >
              {selIdx === selected && m.configured ? '> ' : '  '}
              {key}
              <Text color="gray">
                {'  '}
                {Math.round(m.contextWindow / 1000)}K
                {m.configured ? '' : '（未配置，不可选）'}
                {key === current ? '（当前）' : ''}
              </Text>
            </Text>
          )
        })
      )}
    </PanelShell>
  )
}

function isConfigured(models: ModelsDto, provider: string): boolean {
  return models.providers.some((p) => p.id === provider && p.configured)
}

export function McpPanel({ transport }: { transport: Transport }) {
  const state = useLoad<McpServerDto[]>(() => transport.listMcpServers())
  return (
    <PanelShell title="MCP 服务器" hint="只读">
      <LoadState state={state} render={(servers) =>
        servers.length === 0 ? (
          <Text color="gray">（未配置 MCP 服务器——~/.spark/mcp.json）</Text>
        ) : (
          servers.map((s) => (
            <Text key={s.name} wrap="truncate-end">
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
    </PanelShell>
  )
}

export function SkillsPanel({ transport }: { transport: Transport }) {
  const state = useLoad<SkillDto[]>(() => transport.listSkills())
  return (
    <PanelShell title="技能" hint="只读">
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
    </PanelShell>
  )
}

export function UsagePanel({ transport }: { transport: Transport }) {
  const state = useLoad<RoutingDto>(() => transport.getRouting())
  return (
    <PanelShell title="用量与路由" hint="只读">
      <LoadState state={state} render={(r) => (
        <>
          <Text>
            <Text color="gray">fallback 链：</Text>
            {r.fallbacks.length === 0 ? '（空——不切换）' : r.fallbacks.join(' → ')}
          </Text>
          <Text>
            <Text color="gray">压缩档：</Text>
            {r.compactionModel}
          </Text>
          <Text>
            <Text color="gray">标题档：</Text>
            {r.titleModel}
          </Text>
          <Text>
            <Text color="gray">子代理档：</Text>
            {r.subagentModel}
          </Text>
          <Text>
            <Text color="gray">成本：</Text>
            {`$${r.usage.costUsd.toFixed(4)}`}
            {r.costLimitUsd !== null ? ` / 上限 $${r.costLimitUsd}` : '（不限）'}
            {r.usage.exceeded ? <Text color="red">（已熔断）</Text> : ''}
          </Text>
          <Text color="gray">token 累计：↑{r.usage.inputTokens} ↓{r.usage.outputTokens}</Text>
        </>
      )} />
    </PanelShell>
  )
}

export function CheckpointsPanel({
  transport,
  sessionId,
}: {
  transport: Transport
  sessionId: SessionId
}) {
  const state = useLoad<CheckpointDto[]>(() => transport.listCheckpoints(sessionId))
  return (
    <PanelShell title="检查点" hint="只读；回滚用 /rollback <id>">
      <LoadState state={state} render={(list) =>
        list.length === 0 ? (
          <Text color="gray">（无快照——turn 完成后生成，或会话未启用检查点）</Text>
        ) : (
          [...list].reverse().map((c) => (
            <Text key={c.checkpointId} wrap="truncate-end">
              <Text color="cyan">{c.checkpointId}</Text>
              <Text color="gray">  {new Date(c.createdAt).toLocaleString('zh-CN')}</Text>
            </Text>
          ))
        )
      } />
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
