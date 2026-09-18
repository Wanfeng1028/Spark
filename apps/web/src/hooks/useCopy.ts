/**
 * 剪贴板复制 + 1.5s 已复制态（工单 R-E③：ToolCard CopyButton 与
 * AssistantActions 两份同构合一；成功 Check / 失败静默复位）。
 * AUD-13：定时器存 ref——连点先清旧再设新（防前次提前复位"已复制"态），
 * 卸载时清理（setState 不得在卸载后触发）。
 */
import { useEffect, useRef, useState } from 'react'

export function useCopy(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setCopied(false)
      }, 1500)
    } catch {
      setCopied(false)
    }
  }
  return { copied, copy }
}
