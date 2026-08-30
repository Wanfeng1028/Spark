/**
 * 会话列表侧栏——**工单 10.8 起停用**（ADR D19 修订：纯单栏，会话管理退 /new 与 /resume）。
 * App 不再渲染本组件；文件按删除保护纪律保留（删除须人工五层级确认）。
 * 原职责：数据 = 连接/重连时刻的 listSessions 快照（按更新时间新→旧）；当前会话 `>` 标记。
 */
import { Box, Text } from 'ink'
import { useCliStore } from '../store.js'

const WIDTH = 24

/** 标题截断（侧栏定宽；空标题与 web 同口径显示「新会话」） */
function titleOf(title: string): string {
  const t = title === '' ? '新会话' : title
  return t.length > WIDTH - 4 ? `${t.slice(0, WIDTH - 7)}...` : t
}

export function Sidebar() {
  const sessions = useCliStore((s) => s.sessions)
  const activeId = useCliStore((s) => s.activeSessionId)
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <Box flexDirection="column" width={WIDTH} paddingRight={1}>
      <Text color="gray">会话（{sorted.length}）</Text>
      {sorted.map((s) =>
        s.id === activeId ? (
          <Text key={s.id}>
            {'> '}
            {titleOf(s.title)}
          </Text>
        ) : (
          <Text key={s.id} color="gray">
            {'  '}
            {titleOf(s.title)}
          </Text>
        ),
      )}
      {sorted.length === 0 ? <Text color="gray">（空）</Text> : null}
    </Box>
  )
}
