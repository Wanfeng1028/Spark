/**
 * 状态细条——**工单 10.8 起停用**（§13.K K.4 决策④：footer 双行 Footer.tsx 取代，
 * seq 水位与 token 明细收 /stats）。文件按删除保护纪律保留（删除须人工五层级确认）。
 * 原职责（字段同 web StatusBar 口径）：连接点+文案 · 模型 · seq 水位 · token 累计 ·
 * 上下文水位 · 提交模式；turn 进行中追加 step/工具/等待审批。
 */
import { Box, Text } from 'ink'
import { CONTEXT_WARN_RATIO, contextRatio, contextWindowOf } from '@spark/protocol'
import type { SessionSlice } from '@spark/protocol'
import { useCliStore } from '../store.js'

/** token 累计紧凑展示（与 web fmtTokens 同：k=千位截断） */
function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function ConnectionMark({ status }: { status: 'connecting' | 'open' | 'reconnecting' | 'closed' }) {
  if (status === 'open') return <Text color="green">已连接</Text>
  if (status === 'connecting') return <Text color="gray">连接中...</Text>
  if (status === 'reconnecting') return <Text color="red">已断线，重连中...</Text>
  return <Text color="red">已断开</Text>
}

export function StatusBar({ slice }: { slice: SessionSlice | null }) {
  const status = useCliStore((s) => s.status)
  const delivery = useCliStore((s) => s.delivery)
  const models = useCliStore((s) => s.models)

  const usage = slice?.usageTotal
  const ratio =
    slice === null ? null : contextRatio(slice.contextUsage, contextWindowOf(models, slice.meta.model))
  const warn = ratio !== null && ratio > CONTEXT_WARN_RATIO
  const turn = slice?.activeTurn ?? null

  // 运行中工具名计数（与 web TurnStatusBar 同：同名 ×N）
  const toolCounts = new Map<string, number>()
  if (turn !== null) {
    for (const it of slice?.items ?? []) {
      if (it.kind === 'tool' && it.status === 'running') {
        toolCounts.set(it.name, (toolCounts.get(it.name) ?? 0) + 1)
      }
    }
  }

  return (
    <Box>
      <Text color="gray">
        <ConnectionMark status={status} />
        <Text color="gray"> · </Text>
        {slice === null || slice.meta.model === '' ? '—' : slice.meta.model}
        <Text color="gray"> · </Text>seq {slice?.lastSeq ?? 0}
        {usage !== undefined ? (
          <>
            <Text color="gray"> · </Text>↑{fmtTokens(usage.inputTokens)} ↓{fmtTokens(usage.outputTokens)}
          </>
        ) : null}
        {ratio !== null ? (
          <>
            <Text color="gray"> · </Text>
            {warn ? (
              <Text color="yellow">水位 {Math.min(100, Math.round(ratio * 100))}%</Text>
            ) : (
              <Text>水位 {Math.min(100, Math.round(ratio * 100))}%</Text>
            )}
          </>
        ) : null}
        <Text color="gray"> · </Text>[{delivery}]
        {slice?.compacting === true ? (
          <>
            <Text color="gray"> · </Text>
            <Text color="yellow">压缩中...</Text>
          </>
        ) : null}
        {turn !== null ? (
          <>
            <Text color="gray"> · </Text>step {turn.stepCount}
            {[...toolCounts.entries()].map(([name, count]) => (
              <Text key={name} color="gray">
                {' '}
                {count > 1 ? `${name}x${count}` : name}
              </Text>
            ))}
            {turn.waiting ? <Text color="yellow"> 等待审批</Text> : null}
          </>
        ) : null}
      </Text>
    </Box>
  )
}
