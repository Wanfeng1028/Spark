/**
 * UI 文案与状态取色单源（工单 R-B 下沉 / D22 四端共享资产之四，与 error-copy/format/flow-rows/keymap 同列）：
 * 收敛各端复制且已漂移的展示层纯文案与纯映射——
 * 连接态文案（原四份：web StatusBar、web AppShell ReconnectBanner、mobile SessionScreen、miniapp session 页）、
 * 工具状态词与审批决策回显（mobile/miniapp session-items 逐字双份）、
 * 会话列表状态点取色（mobile/miniapp 逐字双份）、复制按钮两态文案（mobile/miniapp 已漂移）。
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
import type { SessionStatus } from './api.js'

/** 连接态人话文案（四端逐字同的三态；closed 见文件头边界说明 1） */
export const CONNECTION_TEXT = {
  connecting: '连接中…',
  open: '已连接',
  reconnecting: '已断线，重连中…',
} as const

/** CONNECTION_TEXT 的可索引键（各端 status 联合含 closed 时须先排除再索引） */
export type ConnectionTextKey = keyof typeof CONNECTION_TEXT

/** 工具状态词（工具卡 meta 与无障碍标签共用同一口径） */
export function toolStatusText(status: 'running' | 'completed' | 'error'): string {
  if (status === 'running') return '运行中'
  if (status === 'error') return '失败'
  return '完成'
}

/** 审批决策后的回显（reply 缺省 = 已处理但决策未知——不给假具体值） */
export function approvalResolvedText(reply: 'once' | 'always' | 'reject' | undefined): string {
  if (reply === 'once') return '已允许本次'
  if (reply === 'always') return '已始终允许'
  if (reply === 'reject') return '已拒绝'
  return '已处理'
}

/** 复制按钮两态文案（miniapp 的 ✓ 记号在渲染层附加，见文件头边界说明 2） */
export const COPY_TEXT = {
  copy: '复制',
  copied: '已复制',
} as const

/** 状态点取色所需的最小 token 面（各端 ThemeTokens 均含此三字段——结构化子集，protocol 不依赖端主题类型） */
export interface StatusDotTokens {
  sparkAccent: string
  sparkWarn: string
  sparkOk: string
}

/** 会话列表状态点配色（DESIGN §13.J.2.2：绿空闲 / accent 运行 / amber 待审批；灰=完成态 v2 归档预留，故无此分支） */
export function dotColor(status: SessionStatus, t: StatusDotTokens): string {
  switch (status) {
    case 'running':
      return t.sparkAccent
    case 'waiting-approval':
      return t.sparkWarn
    case 'idle':
      return t.sparkOk
  }
}
