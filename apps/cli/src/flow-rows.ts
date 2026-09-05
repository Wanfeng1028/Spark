/**
 * cli 端会话流派生（工单 R-B 下沉后仅留端特有）：
 * rowSettled——行级定稿判定（Ink Static 前缀单调的前提：组行需全组定稿，
 * 组内首条定稿进 scrollback 后不可收回）。
 * 共享核（toolCategoryOf / flowRowsOf + 显示选项 / FlowRow / ToolItem / FlowRowsOptions）
 * 已上移 @spark/protocol flow-rows（工单 R-B，以 web 版为准合并单源——本文件旧版
 * 缺显示选项参数、私有 key 函数名 itemKey 亦异，属漂移方）。
 * 本判定只在 cli 成立（web 无 Static scrollback），下沉即造死导出——故留本地。
 */
import type { FlowRow, UiItem } from '@spark/protocol'

/** 条目定稿（与 MessagePane 既有判定同语义：只会由活动转定稿，前缀单调） */
function itemSettled(it: UiItem): boolean {
  switch (it.kind) {
    case 'user':
      return true
    case 'turn':
      return it.finishedAt !== undefined
    case 'assistant':
      return it.streaming === undefined
    case 'reasoning':
      return it.streaming !== true
    case 'tool':
      return it.status !== 'running'
    case 'approval':
      return it.status === 'resolved'
  }
}

/** 行级定稿：组行需全组定稿（组内首条定稿进 Static 后不可收回——组以整组为单位入 scrollback） */
export function rowSettled(row: FlowRow): boolean {
  return row.kind === 'item' ? itemSettled(row.item) : row.tools.every((t) => t.status !== 'running')
}

/** 项目名 = cwd 末段目录名（与 web 同口径的终端版；Footer/ResumePanel 共用——R-G 单源） */
export function projectOf(cwd: string): string {
  const seg = cwd.split(/[\\/]/).filter((seg_) => seg_.length > 0)
  return seg[seg.length - 1] ?? '未分组'
}
