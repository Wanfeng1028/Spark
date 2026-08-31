/**
 * 启动头部（工单 10.8 / §13.K K.1，实测 Qwen Code 空态首屏；10.23 改判左右分栏）：
 * 渐变 ASCII logo（§13.K K.0 全仓唯一渐变豁免位，决策①）居左 + 圆角信息盒居右
 * （名称版本/模型行/cwd）+ 「提示：」行。宽度感知回退（同 Qwen Header 口径）：
 * 放得下 logo+最小信息盒才双栏，否则隐藏 logo、信息盒占满（不堆叠）。
 * 模型提示与 cwd 截短按显示宽度门控（放得下才显示）；cwd 先 tilde 化。
 * 密钥/上下文文件无数据源不渲染（禁假状态）：Base URL 取模型目录真值，缺则省。
 */
import { Box, Text } from 'ink'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { sep } from 'node:path'
import type { ModelsDto, SessionSlice } from '@spark/protocol'
import { displayWidth, truncateByWidth } from '../text-width.js'

/** ASCII 字样（4 行；每行按序号在靛→紫间插值——行级渐变） */
const LOGO_LINES = [
  '  ___                  _    ',
  ' / __| _ __  __ _  _ _| |__ ',
  ' \\__ \\| \'__|/ _` || \'_|| / /',
  ' |___/|_|   \\__,_||_|  |_\\_\\',
] as const

/** 布局常量（同 Qwen Code Header 口径）：外边距/Logo 与信息盒间距/盒内边距与边框/最小路径宽/双栏盒宽上限 */
const MARGIN_X = 2
const LOGO_GAP = 2
const PANEL_PADDING_X = 1
const PANEL_BORDER = 2
const MIN_PATH = 40
const MAX_PANEL = 60

const LOGO_WIDTH = Math.max(...LOGO_LINES.map((l) => l.length))
const MODEL_LABEL = '   model: '
const CWD_LABEL = '   cwd:   '
const MODEL_HINT = '  （/model 切换）'

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

/** home 前缀 → ~（与 Qwen tildeifyPath 同口径） */
function tildeify(p: string): string {
  const home = homedir()
  if (p === home) return '~'
  return p.startsWith(home + sep) ? '~' + p.slice(home.length) : p
}

export function BootHeader({
  slice,
  models,
  columns,
}: {
  slice: SessionSlice | null
  models: ModelsDto | null
  columns: number
}) {
  const model = slice === null || slice.meta.model === '' ? null : slice.meta.model
  const cwd = slice === null || slice.meta.cwd === '' ? null : slice.meta.cwd
  // Base URL 真值：模型目录按 provider 命中；缺省不渲染该段（禁假状态）
  const provider = model === null ? null : model.slice(0, model.indexOf('/'))
  const baseUrl =
    provider === null
      ? null
      : (models?.providers.find((p) => p.id === provider)?.baseUrl ?? null)

  // 宽度感知：双栏需放得下 logo+间距+最小信息盒；否则隐藏 logo、盒占满（不堆叠）
  const available = Math.max(0, columns - MARGIN_X * 2)
  const minPanel = MIN_PATH + PANEL_PADDING_X * 2 + PANEL_BORDER
  const showLogo = available >= LOGO_WIDTH + LOGO_GAP + minPanel
  const panelWidth = showLogo
    ? Math.max(0, Math.min(available - LOGO_WIDTH - LOGO_GAP, MAX_PANEL))
    : available
  const contentWidth = Math.max(0, panelWidth - PANEL_PADDING_X * 2 - PANEL_BORDER)

  const modelBase = MODEL_LABEL + (model ?? '—')
  const showModelHint = model !== null && displayWidth(modelBase + MODEL_HINT) <= contentWidth
  const cwdBudget = Math.max(1, contentWidth - displayWidth(CWD_LABEL))
  const displayCwd = cwd === null ? '—' : truncateByWidth(tildeify(cwd), cwdBudget)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" alignItems="center">
        {showLogo ? (
          <>
            <Box flexShrink={0} flexDirection="column">
              {LOGO_LINES.map((line, i) => (
                <Text key={i} color={logoColor(i, LOGO_LINES.length)}>
                  {line}
                </Text>
              ))}
            </Box>
            <Box width={LOGO_GAP} />
          </>
        ) : null}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={PANEL_PADDING_X}
          width={panelWidth}
        >
          <Text>
            <Text color="cyan">{'>_'}</Text> Spark <Text color="gray">(v{versionOf()})</Text>
          </Text>
          <Text>
            <Text color="gray">{MODEL_LABEL}</Text>
            {model ?? '—'}
            {showModelHint ? <Text color="gray">{MODEL_HINT}</Text> : null}
          </Text>
          <Text>
            <Text color="gray">{CWD_LABEL}</Text>
            {displayCwd}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">
          提示： 输入任务开始；/ 看命令；? 看帮助{baseUrl !== null ? `；API ${baseUrl}` : ''}
        </Text>
      </Box>
    </Box>
  )
}
