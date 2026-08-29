/**
 * 搜索页（阶段七工单 7.13 / H12）：会话全文搜索的线上入口。
 * 检索数据源 = GET /api/search（用户/助手消息 + 会话标题；命中摘要引擎侧截窗）。
 * 命中行 = 会话标题 + 类型标签 + 相对时间 + 摘要（查询词高亮）；
 * 点击跳 /session/:id?event=<eventId>——ChatView 定位滚动 + 短暂高亮。
 * 回车提交；空查询不检索。键盘优先（输入框 autofocus）。
 */
import { useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import type { SearchHitDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'
import { formatRelative } from '@/lib/time'

type SearchState =
  | { phase: 'idle' }
  | { phase: 'loading'; q: string }
  | { phase: 'done'; q: string; hits: SearchHitDto[] }
  | { phase: 'error'; q: string; message: string }

const TYPE_LABEL: Record<SearchHitDto['type'], string> = {
  'user.message': '用户',
  'assistant.message': '助手',
  'session.title': '标题',
}

export function SearchPage() {
  const navigate = useNavigate()
  const { transport } = useTransport()
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<SearchState>({ phase: 'idle' })
  const inflight = useRef(0)

  async function runSearch(q: string): Promise<void> {
    const query = q.trim()
    if (query === '') return
    const seq = ++inflight.current
    setState({ phase: 'loading', q: query })
    try {
      const hits = await transport.search(query, 50)
      // 竞态防护：只采纳最后一次提交的结果
      if (inflight.current === seq) setState({ phase: 'done', q: query, hits })
    } catch (err) {
      if (inflight.current === seq) {
        setState({ phase: 'error', q: query, message: errorMessageOf(err) })
      }
    }
  }

  function onSubmit(e: FormEvent): void {
    e.preventDefault()
    void runSearch(draft)
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-base font-semibold">搜索</h1>
        <p className="text-xs text-muted-foreground">
          检索所有会话的用户消息、助手回复与标题，点击命中行直达原文。
        </p>
      </header>

      <form onSubmit={onSubmit} className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="输入关键词，回车检索"
          aria-label="搜索关键词"
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
      </form>

      {state.phase === 'loading' && (
        <p className="text-xs text-muted-foreground">检索中…</p>
      )}

      {state.phase === 'error' && (
        <div className="flex flex-col gap-1.5 text-xs">
          <span className="text-destructive">{state.message}</span>
          <button
            type="button"
            onClick={() => void runSearch(state.q)}
            className="self-start rounded-md border border-border px-2 py-0.5 hover:bg-accent"
          >
            重试
          </button>
        </div>
      )}

      {state.phase === 'done' && state.hits.length === 0 && (
        <p className="text-xs text-muted-foreground/70">无匹配结果</p>
      )}

      {state.phase === 'done' && state.hits.length > 0 && (
        <ul className="flex flex-col gap-1">
          {state.hits.map((h) => (
            <li key={`${h.sessionId}:${h.eventId}`}>
              <button
                type="button"
                onClick={() => void navigate(`/session/${h.sessionId}?event=${h.eventId}`)}
                className="flex w-full flex-col gap-1 rounded-md border border-border px-3 py-2 text-left hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0 font-medium text-foreground">
                    {h.sessionTitle === '' ? '新会话' : h.sessionTitle}
                  </span>
                  <span className="shrink-0 rounded-[3px] bg-secondary px-1 py-px text-[11px]">
                    {TYPE_LABEL[h.type]}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70">
                    {formatRelative(h.time)}
                  </span>
                </span>
                <span className="text-[13px] leading-relaxed">
                  <Highlighted text={h.snippet} q={state.q} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 摘要内查询词高亮：整词优先，其次拆词（≥2 字符）；大小写不敏感 */
function Highlighted({ text, q }: { text: string; q: string }) {
  const needles = [...new Set([q.trim(), ...q.trim().split(/\s+/)].filter((t) => t.length >= 2))]
  if (needles.length === 0) return <>{text}</>
  const re = new RegExp(
    `(${needles
      .sort((a, b) => b.length - a.length)
      .map(escapeRe)
      .join('|')})`,
    'gi',
  )
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i): ReactNode =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[2px] bg-accent px-0.5 text-foreground">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}
