/**
 * 会话列表侧栏（<80 列隐藏——工单 8.2 / ADR D19）：
 * 数据 = 连接/重连时刻的 listSessions 快照（按更新时间新→旧）；当前会话 `>` 标记。
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
