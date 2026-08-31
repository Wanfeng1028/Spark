/**
 * 启动头部（工单 10.8 / §13.K K.1，实测 Qwen Code 空态首屏）：
 * 渐变 ASCII logo（蓝紫渐变——§13.K K.0 全仓唯一豁免位，决策①）+ 圆角信息盒
 * （名称版本/模型行/cwd）+ 提示行。空会话时呈现；首条消息后让位会话流。
 * 密钥/上下文文件无数据源不渲染（禁假状态）：Base URL 取模型目录真值，缺则省。
 */
import { Box, Text } from 'ink'
import { createRequire } from 'node:module'
import type { ModelsDto, SessionSlice } from '@spark/protocol'

/** ASCII 字样（4 行；每行按序号在靛→紫间插值——行级渐变） */
const LOGO_LINES = [
  '  ___                  _    ',
  ' / __| _ __  __ _  _ _| |__ ',
  ' \\__ \\| \'__|/ _` || \'_|| / /',
  ' |___/|_|   \\__,_||_|  |_\\_\\',
] as const

/** 靛(#818cf8) → 紫(#c084fc) 行级插值（hex → ink color） */
function logoColor(i: number, total: number): string {
  const from = [0x81, 0x8c, 0xf8]
  const to = [0xc0, 0x84, 0xfc]
  const t = total <= 1 ? 0 : i / (total - 1)
  const c = from.map((f, k) => Math.round(f + ((to[k] ?? f) - f) * t))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** 版本（从包清单现读——真值不硬编码；工单 10.17②：相对组件目录 ../../=apps/cli） */
const require = createRequire(import.meta.url)
function versionOf(): string {
  try {
    const pkg = require('../../package.json') as { version?: unknown }
    return typeof pkg.version === 'string' ? pkg.version : '未知版本'
  } catch {
    return '未知版本'
  }
}

export function BootHeader({
  slice,
  models,
}: {
  slice: SessionSlice | null
  models: ModelsDto | null
}) {
  const model = slice === null || slice.meta.model === '' ? null : slice.meta.model
  const cwd = slice === null || slice.meta.cwd === '' ? null : slice.meta.cwd
  // Base URL 真值：模型目录按 provider 命中；缺省不渲染该段（禁假状态）
  const provider = model === null ? null : model.slice(0, model.indexOf('/'))
  const baseUrl =
    provider === null
      ? null
      : (models?.providers.find((p) => p.id === provider)?.baseUrl ?? null)

  return (
    <Box flexDirection="column" paddingX={1}>
      {LOGO_LINES.map((line, i) => (
        <Text key={i} color={logoColor(i, LOGO_LINES.length)}>
          {line}
        </Text>
      ))}
      <Box flexDirection="column" borderStyle="round" borderColor="gray" marginTop={1} paddingX={1}>
        <Text>
          <Text color="cyan">{'>_'}</Text> Spark <Text color="gray">(v{versionOf()})</Text>
        </Text>
        <Text>
          <Text color="gray">   model: </Text>
          {model ?? '—'}
          {model !== null ? <Text color="gray">  （/model 切换）</Text> : null}
        </Text>
        <Text>
          <Text color="gray">   cwd:   </Text>
          {cwd ?? '—'}
        </Text>
      </Box>
      <Text color="gray">
        输入任务开始；/ 看命令；? 看帮助{baseUrl !== null ? `；API ${baseUrl}` : ''}
      </Text>
    </Box>
  )
}
