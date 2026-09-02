/**
 * 行组件共享工具（工单 10.47，自 items.tsx 拆出——qwen messages/ 目录同构）。
 */
import { useEffect, useState } from 'react'
import type { UiItem } from '@spark/protocol'
import { truncateByWidth } from '../../text-width.js'

export function summarizeToolInput(input: unknown): string {
  if (input === null || typeof input !== 'object') return ''
  const rec = input as Record<string, unknown>
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = rec[k]
      if (typeof v === 'string' && v !== '') return v
    }
    return ''
  }
  const s = pick('command', 'file_path', 'path', 'query', 'prompt')
  // 单行化：空白压一格，超长按**显示宽度**截断（工单 10.19②：CJK 占 2 列，
  // code unit 计数与终端换行不一致=错列；展开态看全量）
  const one = s.replace(/\s+/g, ' ')
  return truncateByWidth(one, 60)
}

export function toolOutputText(output: unknown, maxLines = 50): string {
  const raw = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  const lines = raw.split('\n')
  if (lines.length <= maxLines) return raw
  return `...（前 ${lines.length - maxLines} 行已截断）\n${lines.slice(-maxLines).join('\n')}`
}

export function toolOutputLines(output: unknown): number {
  const raw = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  return raw.split('\n').length
}

export function isDenied(item: Extract<UiItem, { kind: 'tool' }>): boolean {
  return (
    item.status !== 'running' &&
    typeof item.output === 'object' &&
    item.output !== null &&
    (item.output as Record<string, unknown>).code === 'E_PERMISSION'
  )
}

export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

export function strike(text: string): string {
  return `\u001b[9m${text}\u001b[29m`
}
