/**
 * ToolCard（doc/02 §6.3 / DESIGN §8）：工具调用块——默认折叠为一行摘要
 * `[图标] 人话类别词 · 资源路径（mono 截断）· 状态 · 耗时`（类别词工单 10.4④；
 * 原工具名收 title）；展开区按工具分发：bash→Terminal（自动滚底 + 复制）、
 * edit|write→DiffViewer（output.diff，unified）、read→CodeBlock（path+行数元数据）、
 * 其他→JSON 折叠。running 时摘要行尾显示 progressBuf 最后片段（折叠态也可见）；
 * 错误态红字摘要默认展开；审批拒绝（output.code=E_PERMISSION）整行删除线+"已拒绝"
 * 不默认展开（拒绝非失败——工单 10.4④）。
 */
import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Copy,
  FilePen,
  FileText,
  Globe,
  Loader2,
  Terminal,
  Wrench,
} from 'lucide-react'
import { toolCategoryOf } from '@spark/protocol'
import { cn } from '@/lib/utils'

export interface ToolCardProps {
  name: string
  input: unknown
  status: 'running' | 'completed' | 'error'
  progressBuf?: string
  output?: unknown
  isError: boolean
  durationMs?: number
}

export function ToolCard({
  name,
  input,
  status,
  progressBuf,
  output,
  isError,
  durationMs,
}: ToolCardProps) {
  const [open, setOpen] = useState(false)
  const manual = useRef(false)

  /** 审批拒绝态（工单 10.4④）：引擎管线拒绝路径 tool.completed output = {code:'E_PERMISSION'} */
  const denied =
    status !== 'running' &&
    typeof output === 'object' &&
    output !== null &&
    (output as Record<string, unknown>).code === 'E_PERMISSION'

  // 错误态默认展开（DESIGN §8；拒绝非失败不展开）；用户手动操作后优先
  useEffect(() => {
    if (manual.current) return
    if (status === 'error' && !denied) setOpen(true)
  }, [status, denied])

  function toggle() {
    manual.current = true
    setOpen((v) => !v)
  }

  const category = toolCategoryOf(name)
  const resource = resourceOf(name, input)
  const progressTail = status === 'running' ? lastLine(progressBuf ?? '') : ''

  return (
    <div className="my-1 rounded-md border border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-7 w-full items-center gap-1.5 px-2 text-left"
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        {status === 'running' ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ToolIcon name={name} />
        )}
        <span
          className={cn('shrink-0 text-xs', denied && 'line-through')}
          title={name !== category ? name : undefined}
        >
          {category}
        </span>
        {resource && (
          <span
            className={cn(
              'min-w-0 truncate font-mono text-xs text-muted-foreground',
              denied && 'line-through',
            )}
          >
            {resource}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-xs">
          {status === 'running' ? (
            <span className="text-muted-foreground">运行中…</span>
          ) : denied ? (
            <span className="text-[var(--spark-err)]">已拒绝</span>
          ) : status === 'error' || isError ? (
            <span className="text-[var(--spark-err)]">失败</span>
          ) : (
            <span className="text-muted-foreground/70">
              完成{durationMs !== undefined ? ` · ${fmtDuration(durationMs)}` : ''}
            </span>
          )}
        </span>
      </button>

      {/* running 时折叠态也可见的 progress 尾部片段（§6.3） */}
      {progressTail && !open && (
        <p className="truncate border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground/70">
          {progressTail}
        </p>
      )}

      {open && (
        <div className="border-t border-border">
          {status === 'running' && (progressBuf ?? '') !== '' && (
            <TerminalView text={progressBuf ?? ''} running />
          )}
          {status !== 'running' && output !== undefined && (
            <ToolDetail name={name} output={output} />
          )}
          {status !== 'running' && output === undefined && (
            <p className="px-3 py-2 font-mono text-xs text-muted-foreground/70">无输出</p>
          )}
        </div>
      )}
    </div>
  )
}

function ToolIcon({ name }: { name: string }) {
  const cls = 'size-3.5 shrink-0 text-muted-foreground'
  if (name === 'bash') return <Terminal className={cls} />
  if (name === 'edit' || name === 'write') return <FilePen className={cls} />
  if (name === 'read') return <FileText className={cls} />
  if (name.startsWith('browser.')) return <Globe className={cls} />
  return <Wrench className={cls} />
}

/** 工具资源摘要：bash→command，browser→url/selector，其余→path */
function resourceOf(name: string, input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const r = input as Record<string, unknown>
  if (name === 'bash' && typeof r.command === 'string') return r.command
  if (typeof r.url === 'string') return r.url
  if (typeof r.selector === 'string') return r.selector
  if (typeof r.path === 'string') return r.path
  if (typeof r.command === 'string') return r.command
  return ''
}

function fmtDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function lastLine(text: string): string {
  const lines = text.split('\n')
  return (lines[lines.length - 1] ?? '').trim()
}

// ---------- 展开区分发 ----------

function ToolDetail({ name, output }: { name: string; output: unknown }) {
  if (name === 'bash') return <BashDetail output={output} />
  if (name === 'edit' || name === 'write') return <DiffViewer output={output} />
  if (name === 'read') return <ReadMeta output={output} />
  if (name.startsWith('browser.')) return <BrowserDetail name={name} output={output} />
  return (
    <pre className="max-h-64 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
      {JSON.stringify(output, null, 2)}
    </pre>
  )
}

/**
 * browser 工具族可视化（工单 7.10 / ADR D27）：screenshot 显示截图本体
 * （/api/artifacts 供图，加载失败降级占位——mock 模式与缺文件不炸）；
 * read 显示文本预览；open/click 显示 URL 与标题元数据。
 */
function BrowserDetail({ name, output }: { name: string; output: unknown }) {
  const r = (typeof output === 'object' && output !== null ? output : {}) as Record<string, unknown>
  const url = typeof r.url === 'string' ? r.url : ''
  const [imgFailed, setImgFailed] = useState(false)

  const meta = (
    <p className="truncate border-b border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
      {url || '（无页面）'}
      {typeof r.title === 'string' && r.title !== '' ? ` · ${r.title}` : ''}
      {r.clicked === true ? ' · 已点击' : ''}
      {typeof r.bytes === 'number' ? ` · ${(r.bytes / 1024).toFixed(1)} KB` : ''}
    </p>
  )

  if (name === 'browser.screenshot' && typeof r.file === 'string') {
    return (
      <div>
        {meta}
        {imgFailed ? (
          <p className="px-3 py-2 font-mono text-xs text-muted-foreground/70">
            截图不可预览（{r.file}——服务未提供该文件）
          </p>
        ) : (
          <div className="p-2">
            <img
              src={`/api/artifacts/${r.file}`}
              alt={`页面截图 ${r.file}`}
              onError={() => setImgFailed(true)}
              className="max-h-80 w-auto rounded-md border border-border"
            />
          </div>
        )}
      </div>
    )
  }

  if (name === 'browser.read' && typeof r.text === 'string') {
    return (
      <div>
        {meta}
        <pre className="max-h-64 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
          {r.text}
        </pre>
        {r.truncated === true && (
          <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground/70">
            正文已截断
          </p>
        )}
      </div>
    )
  }

  return meta
}

/** bash 输出（Terminal，DESIGN §8）：mono、自动滚底、右上角复制 */
function BashDetail({ output }: { output: unknown }) {
  const r = (typeof output === 'object' && output !== null ? output : {}) as Record<string, unknown>
  const code = typeof r.code === 'number' ? r.code : null
  const head = typeof r.head === 'string' ? r.head : ''
  const tail = typeof r.tail === 'string' ? r.tail : ''
  const lines = typeof r.lines === 'number' ? r.lines : null
  const truncated = r.truncated === true
  const text = [head, truncated ? '…（中间输出已截断）' : '', tail]
    .filter((s) => s !== '')
    .join('\n')
  return (
    <div className="relative">
      <CopyButton text={text} />
      <div className="flex items-center justify-between px-3 pt-1.5 font-mono text-xs text-muted-foreground/70">
        <span>
          {lines !== null && `${lines} 行`}
          {truncated && ' · 已截断'}
        </span>
        {code !== null && (
          <span className={code === 0 ? 'text-[var(--spark-ok)]' : 'text-[var(--spark-err)]'}>
            exit {code}
          </span>
        )}
      </div>
      <TerminalView text={text} />
    </div>
  )
}

/** 终端输出块：自动滚底（用户上滚则暂停跟随——Terminal 内部简化为始终滚底） */
function TerminalView({ text, running = false }: { text: string; running?: boolean }) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [text])
  return (
    <pre
      ref={ref}
      className={cn(
        'max-h-64 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground',
        running && 'min-h-8',
      )}
    >
      {text || (running ? '…' : '')}
    </pre>
  )
}

/** edit/write 的 unified diff（DESIGN §8：增行低饱和绿底、删行低饱和红底、hunk 头灰底） */
function DiffViewer({ output }: { output: unknown }) {
  const r = (typeof output === 'object' && output !== null ? output : {}) as Record<string, unknown>
  const diff = typeof r.diff === 'string' ? r.diff : ''
  const path = typeof r.path === 'string' ? r.path : ''
  const replaced = typeof r.replaced === 'number' ? r.replaced : null
  if (diff === '') {
    return (
      <p className="px-3 py-2 font-mono text-xs text-muted-foreground/70">
        {path}
        {replaced !== null && ` · 替换 ${replaced} 处`}（无 diff）
      </p>
    )
  }
  return (
    <div>
      <p className="border-b border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
        {path}
        {replaced !== null && ` · 替换 ${replaced} 处`}
      </p>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed">
        {diff.split('\n').map((line, i) => (
          <span
            key={i}
            className={cn(
              'block whitespace-pre',
              line.startsWith('@@')
                ? 'bg-muted text-muted-foreground'
                : line.startsWith('+')
                  ? 'bg-[var(--spark-ok)]/10 text-foreground'
                  : line.startsWith('-')
                    ? 'bg-[var(--spark-err)]/10 text-foreground'
                    : 'text-muted-foreground',
            )}
          >
            {line}
          </span>
        ))}
      </pre>
    </div>
  )
}

/** read 的元数据（§6.3：CodeBlock 显示 path+行数；文件内容不在事件流中，不渲染） */
function ReadMeta({ output }: { output: unknown }) {
  const r = (typeof output === 'object' && output !== null ? output : {}) as Record<string, unknown>
  const path = typeof r.path === 'string' ? r.path : ''
  const lines = typeof r.lines === 'number' ? r.lines : null
  const truncated = r.truncated === true
  return (
    <p className="px-3 py-2 font-mono text-xs text-muted-foreground">
      {path}
      {lines !== null && ` · ${lines} 行`}
      {truncated && ' · 已截断'}
    </p>
  )
}

/** 复制按钮（Terminal 右上角，DESIGN §8） */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="复制输出"
      className="absolute right-2 top-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}
