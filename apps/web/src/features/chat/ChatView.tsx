/**
 * ChatView（doc/02 §6.2.2 / §6.3）：虚拟化会话流（react-virtuoso）。
 * followOutput='smooth' 自动跟随底部；用户上滚即暂停跟随，BackBottom 悬浮按钮回底。
 * 空态 = 居中欢迎语 + 提示词 chips（紧凑引导块，非 hero——DESIGN §7.1）。
 * 数据源：useSessionItems 选择器（组件不直接 fetch，DESIGN §9）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { Components, VirtuosoHandle } from 'react-virtuoso'
import { ids } from '@spark/protocol'
import type { SessionId } from '@spark/protocol'
import { useSessionItems, useSessionMeta } from '@/stores/session'
import { useTransport } from '@/transports/context'
import { flowRowsOf, rowIndexOfEvent, type FlowRow } from './chat-flow-rows'
import { MessageItem } from './MessageItem'
import { ToolGroupRow } from './ToolGroupRow'
import { BackBottom } from './BackBottom'

export interface ChatViewProps {
  sessionId: string
  /** 搜索跳转定位（工单 7.13）：滚至该事件并短暂高亮；未找到静默跳过 */
  focusEventId?: string
}

const PROMPTS = ['总结这个项目的架构', '跑一遍测试并修复失败项', '把 src 里的 any 清理掉']

export function ChatView({ sessionId, focusEventId }: ChatViewProps) {
  const sid = ids.session(sessionId)
  const items = useSessionItems(sid)
  const meta = useSessionMeta(sid)
  const model = meta.model === '' ? 'assistant' : meta.model
  // 显示行（工单 10.4④）：连续同类工具聚合成组行，其余逐项
  const rows = useMemo(() => flowRowsOf(items), [items])
  const [atBottom, setAtBottom] = useState(true)
  const ref = useRef<VirtuosoHandle>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // 同一 focusEventId 只定位一次（后续新事件到达不重复滚动）
  const focusedRef = useRef<string | null>(null)

  useEffect(() => {
    if (focusEventId === undefined || focusEventId === '' || focusedRef.current === focusEventId) {
      return
    }
    const idx = rowIndexOfEvent(rows, focusEventId)
    if (idx === -1) return
    focusedRef.current = focusEventId
    ref.current?.scrollToIndex({ index: idx, align: 'center' })
    setHighlightId(focusEventId)
    const t = setTimeout(() => setHighlightId(null), 2500)
    return () => clearTimeout(t)
  }, [focusEventId, rows])

  const components: Components<FlowRow> = useMemo(
    () => ({ EmptyPlaceholder: () => <EmptyChat sid={sid} /> }),
    [sid],
  )

  return (
    <div className="relative h-full">
      <Virtuoso
        ref={ref}
        className="h-full"
        data={rows}
        itemContent={(_, row) =>
          row.kind === 'item' ? (
            <MessageItem
              item={row.item}
              model={model}
              sid={sid}
              highlight={row.item.eventId === highlightId}
            />
          ) : (
            <ToolGroupRow
              category={row.category}
              tools={row.tools}
              highlight={row.tools.some((t) => t.eventId === highlightId)}
            />
          )
        }
        followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
        atBottomStateChange={setAtBottom}
        components={components}
      />
      <BackBottom
        show={!atBottom && rows.length > 0}
        onClick={() => ref.current?.scrollToIndex({ index: 'LAST' })}
      />
    </div>
  )
}

/** 空会话引导块（§6.2.2 状态矩阵「空」） */
function EmptyChat({ sid }: { sid: SessionId }) {
  const { transport } = useTransport()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <p className="text-[13px] text-muted-foreground">发送第一条消息开始对话</p>
      <ul className="flex flex-wrap justify-center gap-2" aria-label="快捷提示词">
        {PROMPTS.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => void transport.sendMessage(sid, p)}
              className="h-6 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
