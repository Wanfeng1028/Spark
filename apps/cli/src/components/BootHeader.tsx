/**
 * 启动头部（工单 10.32：完美还原 Qwen Code 首屏——晚风拍板，推翻 10.23 的"不抄"边界）。
 * 布局/宽度门控/信息盒结构复用 Qwen Code Header.tsx（Apache-2.0，Copyright 2025 Google LLC /
 * Qwen Team——借布局逻辑与默认渐变色值，SPARK 字形按其字形语法补齐），版权声明于此留痕。
 *
 * 结构：横向渐变 ASCII 大 logo（SPARK，§13.K K.0 全仓唯一渐变豁免位）居左 + 信息盒居右
 * （`>_ Spark (v版本)` / 空行 / `API Key | 模型（/model 切换）` / cwd）+ 「提示：」行。
 * 宽度感知：放得下 logo+间距+最小信息盒才双栏，否则隐藏 logo、信息盒占满（不堆叠）。
 * 「API Key |」是鉴权方式声明（Spark 鉴权方式恒为 API Key——models.json apiKeyEnv），
 * 非 key 存在性断言；模型名与 cwd 均为真值（无数据源显 —，禁假状态）。
 */
import { Box, Text } from 'ink'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { sep } from 'node:path'
import type { ModelsDto, SessionSlice } from '@spark/protocol'
import { displayWidth, truncateByWidth } from '../text-width.js'

/**
 * SPARK 字形（6 行 × 8 列/字母）：patorjk「ANSI Regular」细线风格 = Qwen Code 首屏同款
 * 字形语法（Q/W/E/N 锚定自其 AsciiArt.ts，S/P/A/R/K 按同一笔画体系补齐——行首 ▄ 帽 +
 * ╔══╗ 连线 + ██ 双格笔画）。行内宽度已对齐，渲染时统一 padEnd 防渐变错列。
 */
const LOGO_LINES = [
  '▄▄▄▄▄▄▄  ▄▄▄▄▄▄   ▄▄▄▄▄  ▄▄▄▄▄▄  ▄▄   ▄▄ ',
  '██╔════╝██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝',
  '███████╗██████╔╝███████║██████╔╝█████╔╝ ',
  '╚════██║██╔═══╝ ██╔══██║██╔══██╗██╔═██╗ ',
  '███████║██║     ██║  ██║██║  ██║██║  ██╗',
  '╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝',
] as const

/** 布局常量（同 Qwen Code Header）：外边距/Logo 与信息盒间距/盒内边距与边框/最小路径宽/双栏盒宽上限 */
const MARGIN_X = 2
const LOGO_GAP = 2
const PANEL_PADDING_X = 1
const PANEL_BORDER = 2
const MIN_PATH = 40
const MAX_PANEL = 60

const LOGO_WIDTH = Math.max(...LOGO_LINES.map((l) => l.length))
const MODEL_HINT = '（/model 切换）'

/** Qwen Code 默认暗色主题渐变色值（themes/theme.ts GradientColors，Apache-2.0）——蓝→紫→粉 */
const GRADIENT_STOPS = [
  [0x47, 0x96, 0xe4],
  [0x84, 0x7a, 0xce],
  [0xc3, 0x67, 0x7f],
] as const

/** 横向渐变：按列在色标间插值（ink-gradient 横向同效果，不引新依赖） */
function gradientColor(col: number, total: number): string {
  const t = total <= 1 ? 0 : (col / (total - 1)) * (GRADIENT_STOPS.length - 1)
  const i = Math.min(GRADIENT_STOPS.length - 2, Math.floor(t))
  const f = t - i
  const a = GRADIENT_STOPS[i] ?? GRADIENT_STOPS[0]
  const b = GRADIENT_STOPS[i + 1] ?? a
  const c = a.map((v, k) => Math.round(v + ((b[k] ?? v) - v) * f))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** 单行按列分色渲染（同列同色合并为段——避免逐字符 Text 节点爆炸） */
function GradientLine({ line, width }: { line: string; width: number }) {
  const padded = line.padEnd(width, ' ')
  const segments: Array<{ color: string; text: string }> = []
  for (let i = 0; i < padded.length; i++) {
    const color = gradientColor(i, width)
    const last = segments[segments.length - 1]
    if (last !== undefined && last.color === color) last.text += padded[i]
    else segments.push({ color, text: padded[i] ?? ' ' })
  }
  return (
    <Text>
      {segments.map((s, i) => (
        <Text key={i} color={s.color}>
          {s.text}
        </Text>
      ))}
    </Text>
  )
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
  // 模型真值：会话模型优先；无会话用模型目录缺省（Qwen 首屏同口径——无会话也显示模型）
  const sessionModel = slice === null || slice.meta.model === '' ? null : slice.meta.model
  const defaultModel =
    models === null
      ? null
      : `${models.defaultModel.provider}/${models.defaultModel.model}`
  const model = sessionModel ?? defaultModel
  const cwd = slice === null || slice.meta.cwd === '' ? null : slice.meta.cwd

  // 宽度感知：双栏需放得下 logo+间距+最小信息盒；否则隐藏 logo、盒占满（不堆叠）
  const available = Math.max(0, columns - MARGIN_X * 2)
  const minPanel = MIN_PATH + PANEL_PADDING_X * 2 + PANEL_BORDER
  const showLogo = available >= LOGO_WIDTH + LOGO_GAP + minPanel
  const panelWidth = showLogo
    ? Math.max(0, Math.min(available - LOGO_WIDTH - LOGO_GAP, MAX_PANEL))
    : available
  const contentWidth = Math.max(0, panelWidth - PANEL_PADDING_X * 2 - PANEL_BORDER)

  const authModelText = `API Key | ${model ?? '—'}`
  // 禁假状态：模型无真值（slice 与模型目录皆空）时不给切换提示——提示指向无对象的动作
  const showModelHint = model !== null && displayWidth(authModelText + MODEL_HINT) <= contentWidth
  const cwdBudget = Math.max(1, contentWidth - 1)
  const displayCwd = cwd === null ? '—' : truncateByWidth(tildeify(cwd), cwdBudget)

  return (
    <Box flexDirection="column" paddingX={MARGIN_X}>
      <Box flexDirection="row" alignItems="center">
        {showLogo ? (
          <>
            <Box flexShrink={0} flexDirection="column">
              {LOGO_LINES.map((line, i) => (
                <GradientLine key={i} line={line} width={LOGO_WIDTH} />
              ))}
            </Box>
            <Box width={LOGO_GAP} />
          </>
        ) : null}
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={PANEL_PADDING_X}
          width={panelWidth}
        >
          <Text>
            <Text bold color="#847ACE">
              {'>_ Spark'}
            </Text>
            <Text color="gray"> (v{versionOf()})</Text>
          </Text>
          <Text> </Text>
          <Text color="gray">
            {authModelText}
            {showModelHint ? ` ${MODEL_HINT}` : ''}
          </Text>
          <Text color="gray">{displayCwd}</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">提示： 试 /resume，接着上次的会话聊。</Text>
      </Box>
    </Box>
  )
}
