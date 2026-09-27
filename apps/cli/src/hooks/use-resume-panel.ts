/**
 * /resume 面板派生态（工单 10.11 / §13.K K.7；工单 R-G② 自 app.tsx 抽出）：
 * 过滤 = 输入框内容；列表序置顶优先（工单 19.41）；选中位回位；Space 预览态随面板关闭复位。
 */
import { useEffect, useMemo, useState } from 'react'
import type { SessionDto } from '@spark/protocol'
import { useCliStore, type CliPanel } from '../store.js'

/**
 * 列表序（工单 19.41「CLI 列表侧展示」）：置顶优先 + 更新时间新→旧，与引擎
 * `ORDER BY pinned DESC, updated_at DESC, id DESC` 同口径。**此前只按 updatedAt 排**，
 * 等于把服务端的置顶序当场抹掉——置顶会话在 CLI 里跟没置顶一样。
 * id 末键不必在此重现：sort 稳定，同 updatedAt 时保持服务端已排好的次序。
 * 抽成纯函数是为了可单测（面板本身要 ink 渲染才看得见次序）。
 */
export function sortResumeSessions(sessions: readonly SessionDto[]): SessionDto[] {
  return [...sessions].sort(
    (a, b) =>
      (b.pinned === true ? 1 : 0) - (a.pinned === true ? 1 : 0) || b.updatedAt - a.updatedAt,
  )
}

/**
 * /resume 过滤纯函数（LA-45）：排序 + 草稿小写包含过滤。抽出来是为了
 * confirmResume 调用时能从 useCliStore.getState() 现算同一份——动作闭包
 * 不再依赖组件 memo 的 filtered（那是"每键重建 actions"的根因）。
 */
export function resumeFilteredOf(
  sessions: readonly SessionDto[],
  draft: string,
): SessionDto[] {
  const q = draft.trim().toLowerCase()
  const sorted = sortResumeSessions(sessions)
  if (q === '') return sorted
  return sorted.filter((s) => (s.title === '' ? '新会话' : s.title).toLowerCase().includes(q))
}

export function useResumePanel(
  panel: CliPanel,
  draft: string,
  sessions: readonly SessionDto[],
): {
  filtered: SessionDto[]
  selected: number
  setSelected: (n: number) => void
  preview: boolean
  setPreview: (updater: (v: boolean) => boolean) => void
} {
  const filtered = useMemo(() => resumeFilteredOf(sessions, panel === 'resume' ? draft : ''), [
    panel,
    draft,
    sessions,
  ])
  // LA-45：选中位迁入 useCliStore 单源——键位导航写 store，confirmResume 调用时
  // getState() 读同一份（此前组件 useState 与动作闭包各持一份，draft 每键变化
  // 还会经 memo 依赖把整个 actions 对象重建掉）
  const selected = useCliStore((s) => s.resumeSelected)
  const setSelected = useCliStore((s) => s.setResumeSelected)
  useEffect(() => {
    setSelected(0)
  }, [panel, draft, setSelected])
  // 预览态随面板关闭复位（预览对象只在 resume 面板内有意义）
  const [preview, setPreview] = useState(false)
  useEffect(() => {
    if (panel !== 'resume') setPreview(false)
  }, [panel])
  return { filtered, selected, setSelected, preview, setPreview }
}
