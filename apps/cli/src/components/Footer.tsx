/**
 * footer 双行（工单 10.8 / §13.K K.4，决策④；取代阶段八单行状态细条）：
 * 第 1 行：→项目名 · git:(分支) · 模型 · 上下文 N%（>80% 琥珀；分支取不到不渲染该段）
 * 第 2 行：[提交模式] · 运行中指示（step/工具/等待审批/压缩中）· ? 帮助 · /stats 看水位明细
 * 断线/重连异常时在第 1 行上方临时插红字行，恢复即消失（决策④）。
 * seq 水位与 token 明细不在 footer——收 /stats（决策④）。
 */
import { Box, Text } from 'ink'
import { CONTEXT_WARN_RATIO, contextRatio, contextWindowOf } from '@spark/protocol'
import type { SessionSlice } from '@spark/protocol'
import { useCliStore } from '../store.js'

/** 项目名 = cwd 末段目录名（与 web projectOf 同口径的终端版） */
function projectOf(cwd: string): string {
  const seg = cwd.split(/[\\/]/).filter((s) => s.length > 0)
  return seg[seg.length - 1] ?? '未分组'
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


/** token 数 K 格式化（qwen 200.0k 同款）：≥1000 显示一位小数 k */
function kFormat(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
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
      {/* Qwen 对齐（工单 10.37，Footer space-between 单行形态）：左=工作区+git 分支，右=上下文占用 */}
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
        </Text>
        {ratio !== null ? (
          <Text color={warn ? 'red' : 'gray'}>
            {kFormat(contextWindowOf(models, slice?.meta.model ?? '') ?? 0)} 上下文 ·{' '}
            {Math.min(100, Math.round(ratio * 100))}% 已用
          </Text>
        ) : null}
      </Box>
      {/* 第 2 行（Spark 保留件）：提交模式 · 运行指示 · 帮助/统计入口 */}
      <Text color="gray">
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
        {' · Tab 切换提交模式 · ? 帮助 · /stats 明细'}
      </Text>
    </Box>
  )
}
