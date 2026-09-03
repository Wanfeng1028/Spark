/**
 * web 端会话流派生（工单 R-B 下沉后仅留端特有）：
 * rowIndexOfEvent——搜索跳转的行定位（工单 7.13 语义迁移）。
 * 共享核（toolCategoryOf / flowRowsOf + 显示选项 / FlowRow / ToolItem / FlowRowsOptions）
 * 已上移 @spark/protocol flow-rows（工单 R-B，以本版为准合并单源，cli 旧版缺显示选项参数）。
 * 本函数只在 web 成立（cli 无搜索跳转），下沉即造死导出——故留本地。
 */
import type { FlowRow } from '@spark/protocol'

/** 定位包含指定事件的显示行下标（搜索跳转用，工单 7.13 语义迁移）；未命中 -1 */
export function rowIndexOfEvent(rows: FlowRow[], eventId: string): number {
  return rows.findIndex((r) =>
    r.kind === 'item' ? r.item.eventId === eventId : r.tools.some((t) => t.eventId === eventId),
  )
}
