/**
 * /stats 统计面板（工单 10.11 / §13.K K.4 决策④）：
 * seq 水位与 token 明细自 footer 收进此处（按需查看，不占常态底栏）。
 * Esc 关闭（App 层键处理）。
 */
import { Box, Text } from 'ink'
import type { SessionSlice } from '@spark/protocol'

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function StatsPanel({ slice }: { slice: SessionSlice | null }) {
  const usage = slice?.usageTotal
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text>
        统计<Text color="gray">  Esc 关闭</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {slice === null ? (
          <Text color="gray">（无激活会话）</Text>
        ) : (
          <>
            <Text>
              <Text color="gray">seq 水位：</Text>
              {slice.lastSeq}
            </Text>
            <Text>
              <Text color="gray">token 累计：</Text>
              {usage === undefined
                ? '—'
                : `↑${fmtTokens(usage.inputTokens)} ↓${fmtTokens(usage.outputTokens)}（思考 ${fmtTokens(usage.reasoningTokens ?? 0)}）`}
            </Text>
            <Text>
              <Text color="gray">模型：</Text>
              {slice.meta.model === '' ? '—' : slice.meta.model}
            </Text>
            {slice.meta.branch !== undefined && slice.meta.branch !== '' ? (
              <Text>
                <Text color="gray">分支：</Text>
                {slice.meta.branch}
              </Text>
            ) : null}
          </>
        )}
      </Box>
    </Box>
  )
}
