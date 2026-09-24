/**
 * UI 文案与状态取色单源（工单 R-B 下沉 / D22 四端共享资产之四，与 error-copy/format/flow-rows/keymap 同列）：
 * 收敛各端复制且已漂移的展示层纯文案与纯映射——
 * 连接态文案（原四份：web StatusBar、web AppShell ReconnectBanner、mobile SessionScreen、miniapp session 页）、
 * 工具状态词与审批决策回显（mobile/miniapp session-items 逐字双份）、
 * 会话列表状态点取色（mobile/miniapp 逐字双份）、复制按钮两态文案（mobile/miniapp 已漂移）、
 * 回合头时长口语形态与 LSP 诊断严重度字母/取色（W18 mobile/miniapp 首次落地即入单源，不等漂移再收）。
 * 纯常量与纯函数，无平台依赖，四端一律从 @spark/protocol 导入。
 *
 * 边界（刻意不入此表）：
 * 1) closed 态文案留各端。closed 有两个语义不同的触发源——鉴权连续 3 次 401/403 进终态、
 *    与配置变更主动 invalidate（mobile invalidateTransport / miniapp invalidateRest 同型）；
 *    单份文案无法如实覆盖两者，强并即造假状态（AGENTS §2.7）。SessionStreamCore（工单 R-B.5）
 *    只让 closed 真正可达、未让它带原因，故仍不并入本表。现状四份 closed 文案：
 *    web StatusBar「已断开」与 web AppShell 横幅「连接已断开」（两者均自 R-B.5b 把连接态
 *    3 态扩为 4 态起才可达，此前写了也显示不出来）；miniapp 与 mobile 逐字同的
 *    「连接已停止：鉴权失败，请到设置页重新配对」（mobile 自 R-B.5c 补齐）——两个靠配对
 *    token 连 server 的远端取鉴权口径：closed 唯一持久可见的触发源即鉴权终态
 *    （配置变更那条是瞬态，随即被新实例的 connecting 覆盖）。
 * 2) miniapp 复制态的 ✓ 是「无图标组件平台」的视觉补偿记号（同 cli ✓/… 排版记号先例，
 *    非 emoji 装饰，AGENTS §2.6），留渲染层附加，不进文案表——文案本体两端已统一。
 */
import { translate, type Language } from './i18n.js'
import type { SessionStatus } from './api.js'

/** 连接态人话文案（四端逐字同的三态；closed 见文件头边界说明 1）。
 *  19.17 第二批起值由 i18n 的 zh-CN 字典派生——本文件不再持有第二份中文原文。 */
export const CONNECTION_TEXT = {
  connecting: translate('zh-CN', 'copy.connecting'),
  open: translate('zh-CN', 'copy.open'),
  reconnecting: translate('zh-CN', 'copy.reconnecting'),
} as const

/** CONNECTION_TEXT 的可索引键（各端 status 联合含 closed 时须先排除再索引） */
export type ConnectionTextKey = keyof typeof CONNECTION_TEXT

/** 连接态文案（可指定语言）。closed 刻意不入本表，理由见文件头边界说明 1——
 *  两个触发源语义不同，单份文案无法如实覆盖，强并即造假状态。 */
export function connectionText(status: ConnectionTextKey, lang: Language = 'zh-CN'): string {
  return translate(lang, `copy.${status}`)
}

/** 工具状态词（工具卡 meta 与无障碍标签共用同一口径） */
export function toolStatusText(
  status: 'running' | 'completed' | 'error',
  lang: Language = 'zh-CN',
): string {
  if (status === 'running') return translate(lang, 'copy.toolRunning')
  if (status === 'error') return translate(lang, 'copy.toolError')
  return translate(lang, 'copy.toolCompleted')
}

/** 审批决策后的回显（reply 缺省 = 已处理但决策未知——不给假具体值） */
export function approvalResolvedText(
  reply: 'once' | 'always' | 'reject' | undefined,
  lang: Language = 'zh-CN',
): string {
  if (reply === 'once') return translate(lang, 'copy.approvalOnce')
  if (reply === 'always') return translate(lang, 'copy.approvalAlways')
  if (reply === 'reject') return translate(lang, 'copy.approvalReject')
  return translate(lang, 'copy.approvalHandled')
}

/** 复制按钮两态文案（miniapp 的 ✓ 记号在渲染层附加，见文件头边界说明 2）；值由 zh 字典派生 */
export const COPY_TEXT = {
  copy: translate('zh-CN', 'copy.copyButton'),
  copied: translate('zh-CN', 'copy.copied'),
} as const

/** 复制按钮文案（可指定语言） */
export function copyButtonText(state: 'copy' | 'copied', lang: Language = 'zh-CN'): string {
  return translate(lang, state === 'copy' ? 'copy.copyButton' : 'copy.copied')
}

/** 回合头时长（工单 10.4②；W18 mobile/miniapp 落地入单源）：口语形态「N 秒 / N 分 N 秒」
 *  （en 为 `{n}s` / `{m}m {s}s`，同走字典占位符）——与 web formatTurnDuration
 *  （apps/web/src/lib/time.ts）逐字同实现（web 侧改引本表记后续对账）；
 *  cli 保持终端秒表口径（K.2 `${sec} 秒`）不强并。毫秒向下取整（回合头不虚报）。 */
export function turnDurationText(ms: number, lang: Language = 'zh-CN'): string {
  const s = Math.floor(ms / 1000)
  return s < 60
    ? translate(lang, 'copy.durationSeconds', { n: s })
    : translate(lang, 'copy.durationMinutes', { m: Math.floor(s / 60), s: s % 60 })
}

/** 严重度取色所需的最小 token 面（同 StatusDotTokens 手法：结构化子集，各端完整 ThemeTokens 可直传） */
export interface SeverityTokens {
  sparkWarn: string
  foreground: string
  mutedForeground: string
}

/** LSP 诊断严重度字母与取色（工单 16.9 / W18）：1=E warn 琥珀 / 2=W 前景 / 3、4=I meta 灰——
 *  web DiagnosticsRow severityText 同口径；字母与颜色同一映射返回，两端渲染层不再各自维护 */
export function severityOf(severity: number, t: SeverityTokens): { label: string; color: string } {
  if (severity === 1) return { label: 'E', color: t.sparkWarn }
  if (severity === 2) return { label: 'W', color: t.foreground }
  return { label: 'I', color: t.mutedForeground }
}

/** 状态点取色所需的最小 token 面（各端 ThemeTokens 均含此四字段——结构化子集，protocol 不依赖端主题类型） */
export interface StatusDotTokens {
  sparkAccent: string
  sparkWarn: string
  sparkOk: string
  /**
   * 归档灰档（工单 19.21 尾巴兑现）。两端 ThemeTokens **早已有本字段**（meta 文字在用），
   * 故不另立原注记里预想的 `sparkMeta`——同值同义的第四个 token 只会让人分不清该用哪个。
   */
  mutedForeground: string
}

/**
 * 状态点的 token 键 = **「归档压过状态色」这条规则的单一来源**（DESIGN §13.J.2.2）：
 * 已归档会话未装载、引擎 `statusOf` 一律回 'idle'，画绿点等于谎称它在你工作区里活跃。
 * web 由键取 Tailwind 类名（§2.6 token 纪律，不内联 JS 色值），mobile/miniapp 由
 * `dotColor` 取值（RN/Taro 的内联 style 要色值）——三端不再各写一遍同一条分支。
 */
export type DotTokenKey = keyof StatusDotTokens

export function dotTokenOf(status: SessionStatus, archived = false): DotTokenKey {
  if (archived) return 'mutedForeground'
  switch (status) {
    case 'running':
      return 'sparkAccent'
    case 'waiting-approval':
      return 'sparkWarn'
    case 'idle':
      return 'sparkOk'
  }
}

/**
 * 会话列表状态点配色（DESIGN §13.J.2.2：绿空闲 / accent 运行 / amber 待审批 / 灰已归档）。
 * 归档位取 `SessionMetaDto.archivedAt`（12.4 仅已归档携带——禁假状态，不传即视为未归档）。
 */
export function dotColor(
  status: SessionStatus,
  t: StatusDotTokens,
  archived = false,
): string {
  return t[dotTokenOf(status, archived)]
}
