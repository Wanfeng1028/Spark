/**
 * /resume 面板派生态（工单 10.11 / §13.K K.7；工单 R-G② 自 app.tsx 抽出）：
 * 过滤 = 输入框内容；列表序置顶优先（工单 19.41）；选中位回位；Space 预览态随面板关闭复位。
 */
import { useEffect, useMemo, useState } from 'react'
import type { SessionDto } from '@spark/protocol'
import type { CliPanel } from '../store.js'

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
  const filtered = useMemo(() => {
    const q = panel === 'resume' ? draft.trim().toLowerCase() : ''
    const sorted = sortResumeSessions(sessions)
    if (q === '') return sorted
    return sorted.filter((s) =>
      (s.title === '' ? '新会话' : s.title).toLowerCase().includes(q),
    )
  }, [panel, draft, sessions])
  const [selected, setSelected] = useState(0)
  useEffect(() => {
    setSelected(0)
  }, [panel, draft])
  // 预览态随面板关闭复位（预览对象只在 resume 面板内有意义）
  const [preview, setPreview] = useState(false)
  useEffect(() => {
    if (panel !== 'resume') setPreview(false)
  }, [panel])
  return { filtered, selected, setSelected, preview, setPreview }
}
