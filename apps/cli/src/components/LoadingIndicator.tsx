/**
 * 运行中指示行（工单 10.36，Qwen LoadingIndicator 同款）：cli-spinners 的 dots 帧
 * 序列手写（不引新依赖——8 帧 ASCII）+ 中文俏皮短语（zh.js WITTY_LOADING_PHRASES 同款
 * 摘选）+ secondary 统计尾缀 `(Ns · ↓ N tokens · esc to cancel)`。
 * token 数与流量方向取会话投影 usageTotal（本轮累计口径，CLI 无分轮 usage 事件——如实）。
 */
import { Box, Text } from 'ink'
import type { SessionSlice } from '@spark/protocol'
import { useNow } from './items.js'

const DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const PHRASES = [
  '正在努力搬砖，请稍候...',
  '正在向服务器投喂咖啡...',
  '只要我不写代码，代码就没有 Bug...',
  '指针就像人生的方向，偏了就都乱了...',
] as const

function phraseOf(seed: number): string {
  return PHRASES[seed % PHRASES.length] ?? PHRASES[0]
}

export function LoadingIndicator({ slice }: { slice: SessionSlice }) {
  const running = slice.activeTurn !== null
  // startedAt 取活动 turn 的 UiItem（activeTurn 无时间字段——turn 行是权威源）
  const turnItem = [...slice.items].reverse().find((it) => it.kind === 'turn' && it.finishedAt === undefined)
  const started = turnItem !== undefined && 'startedAt' in turnItem ? turnItem.startedAt : undefined
  const now = useNow(running)
  // 帧号按秒轮换（终端重绘节奏即秒级，无需亚秒动画——帧率过高会与 IME/重绘打架）
  const frame = DOTS[Math.floor(now / 1000) % DOTS.length] ?? '⠋'
  const sec = started !== undefined ? Math.max(0, Math.round((now - started) / 1000)) : 0
  const tokens = slice.usageTotal.inputTokens + slice.usageTotal.outputTokens
  if (!running) return null
  return (
    <Box paddingLeft={2}>
      <Box marginRight={1}>
        <Text>{frame}</Text>
      </Box>
      <Text color="#CBA6F7">{phraseOf(Math.floor(now / 1000))}</Text>
      <Text color="gray"> ({sec}s · ↓ {tokens} tokens · esc to cancel)</Text>
    </Box>
  )
}
