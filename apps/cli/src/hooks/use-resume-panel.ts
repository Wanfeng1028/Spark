/**
 * /resume 面板派生态（工单 10.11 / §13.K K.7；工单 R-G② 自 app.tsx 抽出）：
 * 过滤 = 输入框内容；选中位回位；Space 预览态随面板关闭复位。
 */
import { useEffect, useMemo, useState } from 'react'
import type { SessionDto } from '@spark/protocol'
import type { CliPanel } from '../store.js'

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
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
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
