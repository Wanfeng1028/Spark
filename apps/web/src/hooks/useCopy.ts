/**
 * 剪贴板复制 + 1.5s 已复制态（工单 R-E③：ToolCard CopyButton 与
 * AssistantActions 两份同构合一；成功 Check / 失败静默复位）。
 */
import { useState } from 'react'

export function useCopy(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false)
  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return { copied, copy }
}
