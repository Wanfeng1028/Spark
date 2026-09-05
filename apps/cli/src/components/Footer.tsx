/**
 * footer 单行（工单 10.51，qwen Footer 单行形态；修正批次 3「双行」决策——qwen 实际单行）：
 * 左=→项目名 · git:(分支) · 模型 · [提交模式] · 运行指示（step/工具/等待审批/压缩中）· ? 帮助 · /stats 明细
 * 右=上下文窗口 · N%（>80% 红；分支/窗口取不到不渲染该段——禁假状态）。
 * 断线/重连异常时在本行上方临时插红字行，恢复即消失（决策④沿用）。
 * seq 水位与 token 明细不在 footer——收 /stats（决策④沿用）。
 */
import { Box, Text } from 'ink'
import { CONTEXT_WARN_RATIO, contextRatio, contextWindowOf } from '@spark/protocol'
import type { SessionSlice } from '@spark/protocol'
import { projectOf } from '../flow-rows.js'
import { useCliStore } from '../store.js'


/** token 数 K 格式化（qwen 200.0k 同款）：≥1000 显示一位小数 k */
function kFormat(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

export function Footer({ slice }: { slice: SessionSlice | null }) {
  const status = useCliStore((s) => s.status)
  const delivery = useCliStore((s) => s.delivery)
  const models = useCliStore((s) => s.models)

  const ratio =
    slice === null ? null : contextRatio(slice.contextUsage, contextWindowOf(models, slice.meta.model))
  const warn = ratio !== null && ratio > CONTEXT_WARN_RATIO
  const turn = slice?.activeTurn ?? null

  // 运行中工具名计数（同名 ×N，与 web TurnStatusBar 同口径）
  const toolCounts = new Map<string, number>()
  if (turn !== null) {
    for (const it of slice?.items ?? []) {
      if (it.kind === 'tool' && it.status === 'running') {
        toolCounts.set(it.name, (toolCounts.get(it.name) ?? 0) + 1)
      }
    }
  }

  const abnormal = status !== 'open'
  const cwd = slice === null || slice.meta.cwd === '' ? null : slice.meta.cwd
  const branch = slice === null || slice.meta.branch === undefined ? null : slice.meta.branch

  return (
    <Box flexDirection="column">
      {/* 异常插行（决策④）：断线/重连中临时红字，恢复即消失 */}
      {abnormal ? (
        <Text color="red">
          {status === 'connecting'
            ? '连接中...'
            : status === 'reconnecting'
              ? '已断线，重连中...'
              : '连接已断开'}
        </Text>
      ) : null}
      {/* 单行（工单 10.51，qwen Footer 单行形态）：左=工作区+模型+提交模式+运行指示+帮助入口，右=上下文占用 */}
      <Box flexDirection="row" justifyContent="space-between" width="100%" paddingLeft={2} paddingRight={2} gap={1}>
        <Text color="gray" wrap="truncate">
          →{cwd !== null ? projectOf(cwd) : '—'}
          {branch !== null && branch !== '' ? (
            <>
              {' '}
              git:({branch})
            </>
          ) : null}
          {slice !== null && slice.meta.model !== '' ? ` · ${slice.meta.model}` : ''}
          {' · '}
          <Text color={delivery === 'now' ? '#89B4FA' : 'gray'}>[{delivery}]</Text>
          {slice?.compacting === true ? <Text color="yellow"> · 压缩中...</Text> : null}
          {turn !== null ? (
            <>
              {' '}
              step {turn.stepCount}
              {[...toolCounts.entries()].map(([name, count]) => (
                <Text key={name}>
                  {' '}
                  {count > 1 ? `${name}x${count}` : name}
                </Text>
              ))}
              {turn.waiting ? <Text color="yellow"> · 请求授权</Text> : null}
            </>
          ) : null}
          {' · ? 帮助 · /stats 明细'}
        </Text>
        {ratio !== null ? (
          <Text color={warn ? 'red' : 'gray'}>
            {kFormat(contextWindowOf(models, slice?.meta.model ?? '') ?? 0)} 上下文 ·{' '}
            {Math.min(100, Math.round(ratio * 100))}% 已用
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}
