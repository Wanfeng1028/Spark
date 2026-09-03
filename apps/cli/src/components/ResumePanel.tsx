/**
 * /resume 恢复面板（工单 10.11 / §13.K K.7；10.54 双行化 qwen SessionPicker 同款）：
 * 会话列表每条 2 行——行1=标题（prompt 首句），行2=相对时间 · 事件数 · git 分支。
 * / 过滤、↑↓ 移动、Space 预览（选中项详情——列表快照字段如实呈现）、Enter 恢复
 * （=切激活会话，事件流 since=0 全量重放——引擎既有回放路径，durable 事件重放呈现）、
 * Esc 关闭。数据源=连接/重连时刻的 listSessions 快照（store.sessions，如实呈现）。
 * 事件数取 SessionDto.lastSeq（durable 事件计数真值——非 message 数，禁假状态如实标注“条事件”）。
 */
import { Box, Text } from 'ink'
import type { SessionDto } from '@spark/protocol'

/** 相对时间（与 web formatRelative 同口径的终端简版） */
function relative(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

function projectOf(cwd: string): string {
  const seg = cwd.split(/[\\/]/).filter((s) => s.length > 0)
  return seg[seg.length - 1] ?? '未分组'
}

const STATUS_COPY: Record<SessionDto['status'], string> = {
  idle: '空闲',
  running: '运行中',
  'waiting-approval': '等待审批',
}

/** 预览行段：字段缺省不渲染该段（禁假状态——分支/档位取不到就不出现） */
function effortCopy(effort: SessionDto['effort']): string {
  return effort ?? '自动'
}

export interface ResumePanelProps {
  sessions: SessionDto[]
  selected: number
  filter: string
  activeId: string | null
  /** Space 预览态的选中会话（undefined = 预览关闭） */
  preview?: SessionDto | undefined
}

export function ResumePanel({ sessions, selected, filter, activeId, preview }: ResumePanelProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text>
        恢复会话
        <Text color="gray">
          {'  '}
          / 过滤：{filter === '' ? '（输入即过滤）' : filter} · ↑↓ 移动 · Space 预览 · Enter 恢复 ·
          Esc 关闭
        </Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {sessions.map((s, i) => {
          const title = s.title === '' ? '新会话' : s.title
          const active = i === selected
          return (
            <Box key={s.id} flexDirection="column">
              {/* 行 1（工单 10.54）：标题（prompt 首句）；选中行反色 + > 标记 */}
              <Text inverse={active} wrap="truncate-end">
                {active ? '> ' : '  '}
                {title}
              </Text>
              {/* 行 2（工单 10.54，qwen SessionPicker 第二行同款）：相对时间 · 事件数 · git 分支（缺省不渲染该段） */}
              <Text color="gray" wrap="truncate-end">
                {'  '}
                {relative(s.updatedAt)} · {s.lastSeq} 条事件
                {s.branch !== undefined && s.branch !== '' ? ` · git:(${s.branch})` : ''}
                {s.id === activeId ? ' · （当前）' : ''}
              </Text>
            </Box>
          )
        })}
        {sessions.length === 0 ? <Text color="gray">（无匹配会话）</Text> : null}
      </Box>
      {preview !== undefined ? (
        <Box flexDirection="column" marginTop={1} borderStyle="round" paddingX={1}>
          <Text>
            {preview.title === '' ? '新会话' : preview.title}
            <Text color="gray"> — 预览</Text>
          </Text>
          <Text color="gray">
            {[
              preview.model !== '' ? preview.model : null,
              projectOf(preview.cwd),
              preview.branch !== undefined && preview.branch !== '' ? `git:(${preview.branch})` : null,
              `档位 ${effortCopy(preview.effort)}`,
              STATUS_COPY[preview.status],
              `seq ${preview.lastSeq}`,
              relative(preview.updatedAt),
            ]
              .filter((seg) => seg !== null)
              .join(' · ')}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
