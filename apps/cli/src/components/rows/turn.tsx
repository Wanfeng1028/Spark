/**
 * 回合头行（工单 10.47 拆分）：「工作中 · N 秒 / 已工作 N 秒」。
 */
import { Text } from 'ink'
import { useNow } from './shared.js'

export function TurnLine({ startedAt, finishedAt }: { startedAt: number; finishedAt: number | undefined }) {
  const running = finishedAt === undefined
  const now = useNow(running)
  const sec = Math.max(0, Math.round(((finishedAt ?? now) - startedAt) / 1000))
  return <Text color="gray">{running ? `工作中 · ${sec} 秒` : `已工作 ${sec} 秒`}</Text>
}
