/**
 * 面板渲染路由（工单 10.10 面板族；工单 R-G② 自 app.tsx 抽出的 11 分支三元链）：
 * panel → 对应面板组件；'none' 落回会话流（models 未装载先给连接中提示）。
 */
import { Box, Text } from 'ink'
import type { ModelsDto, SessionDto, SessionId, SessionSlice, Transport } from '@spark/protocol'
import type { CliPanel } from '../store.js'
import { BootHeader } from './BootHeader.js'
import {
  CheckpointsPanel,
  McpPanel,
  ModelPanel,
  SkillsPanel,
  TreePanel,
  UsagePanel,
} from './CommandPanels.js'
import { HelpPanel } from './HelpPanel.js'
import { StatsPanel } from './StatsPanel.js'
import { MessagePane } from './MessagePane.js'
import { ResumePanel } from './ResumePanel.js'

export function PanelRouter({
  panel,
  draft,
  columns,
  sessions,
  resumeSelected,
  resumePreview,
  activeSessionId,
  slice,
  models,
  actions,
  transport,
  liveBudget,
  staticKey,
  agentsPath,
}: {
  panel: CliPanel
  draft: string
  columns: number
  sessions: SessionDto[]
  resumeSelected: number
  resumePreview: boolean
  activeSessionId: SessionId | null
  slice: SessionSlice | null
  models: ModelsDto | null
  actions: { pickModel: (m: string) => void }
  transport: Transport
  liveBudget: number
  staticKey: number
  agentsPath?: string | null | undefined
}) {
  if (panel === 'help') {
    return <HelpPanel columns={columns} />
  }
  if (panel === 'resume') {
    return (
      <ResumePanel
        sessions={sessions}
        selected={resumeSelected}
        filter={draft}
        activeId={activeSessionId}
        preview={resumePreview ? sessions[resumeSelected] : undefined}
      />
    )
  }
  if (panel === 'stats') {
    return <StatsPanel slice={slice} />
  }
  if (panel === 'model') {
    return (
      <ModelPanel
        models={models}
        current={slice !== null && slice.meta.model !== '' ? slice.meta.model : null}
        onPick={actions.pickModel}
      />
    )
  }
  if (panel === 'mcp') {
    return <McpPanel transport={transport} />
  }
  if (panel === 'skills') {
    return <SkillsPanel transport={transport} />
  }
  if (panel === 'usage') {
    return <UsagePanel transport={transport} />
  }
  if (panel === 'checkpoints') {
    return activeSessionId !== null ? (
      <CheckpointsPanel transport={transport} sessionId={activeSessionId} />
    ) : null
  }
  if (panel === 'tree') {
    return activeSessionId !== null ? (
      <TreePanel transport={transport} sessionId={activeSessionId} />
    ) : null
  }
  if (models === null) {
    // 10.38：Static 首印不可更新——models 到位后才挂面板，信息盒首印即真值
    return (
      <Box marginLeft={2}>
        <Text color="gray">连接中...</Text>
      </Box>
    )
  }
  return (
    // 10.38：BootHeader 恒为 Static 首项（MessagePane 内），消息紧随其后——
    // 帧内不再有居中 boot 分支；staticEpoch 变化时 Static 重挂整屏重印
    <MessagePane
      slice={slice}
      maxLiveRows={liveBudget}
      staticKey={staticKey}
      header={
        <BootHeader
          slice={slice}
          models={models}
          columns={columns}
          {...(agentsPath != null ? { agentsPath } : {})}
        />
      }
    />
  )
}
