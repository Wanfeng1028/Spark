/**
 * ChatView（doc/02 §6.2.2 / §6.3）：虚拟化会话流（react-virtuoso）。
 * followOutput='smooth' 自动跟随底部；用户上滚即暂停跟随（virtuoso 原生：仅 at-bottom 生效），
 * 滚回底部自动恢复。空态 = 居中欢迎语 + 提示词 chips（紧凑引导块，非 hero——DESIGN §7.1）。
 * 数据源：useSessionItems 选择器（组件不直接 fetch，DESIGN §9）。
 */
import { Virtuoso } from 'react-virtuoso'
import type { Components } from 'react-virtuoso'
import { ids } from '@spark/protocol'
import { useSessionItems, useSessionMeta } from '@/stores/session'
import type { UiItem } from '@/stores/session'
import { useTransport } from '@/transports/context'
import { MessageItem } from './MessageItem'

export interface ChatViewProps {
  sessionId: string
}

const PROMPTS = ['总结这个项目的架构', '跑一遍测试并修复失败项', '把 src 里的 any 清理掉']

export function ChatView({ sessionId }: ChatViewProps) {
  const sid = ids.session(sessionId)
  const items = useSessionItems(sid)
  const meta = useSessionMeta(sid)
  const model = meta.model === '' ? 'assistant' : meta.model

  const components: Components<UiItem> = { EmptyPlaceholder: EmptyChat }

  return (
    <Virtuoso
      className="h-full"
      data={items}
      itemContent={(_, item) => <MessageItem item={item} model={model} />}
      followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
      components={components}
    />
  )
}

/** 空会话引导块（§6.2.2 状态矩阵「空」） */
function EmptyChat() {
  const { transport } = useTransport()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <p className="text-[13px] text-muted-foreground">发送第一条消息开始对话</p>
      <ul className="flex flex-wrap justify-center gap-2" aria-label="快捷提示词">
        {PROMPTS.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => void transport.sendMessage(p)}
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
