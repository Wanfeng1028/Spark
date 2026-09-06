/**
 * 文件树浮层（工单 12.5）：Composer 工具条弹出，懒加载子目录（展开时再请求
 * listFs），点击文件 → onPick(path)（Composer 插入 @path token——只作文本引用，
 * 内容由模型经 read 工具自取，保持 surface 纪律）。
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, File, Folder } from 'lucide-react'
import type { FsEntryDto, SessionId } from '@spark/protocol'
import type { Transport } from '@spark/protocol'
import { cn } from '@/lib/utils'

interface TreeEntry extends FsEntryDto {
  children?: TreeEntry[]
  expanded?: boolean
  loaded?: boolean
}

export function FileTreePopover({
  sessionId,
  transport,
  onPick,
}: {
  sessionId: SessionId
  transport: Transport
  onPick: (path: string) => void
}) {
  const [roots, setRoots] = useState<TreeEntry[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [children, setChildren] = useState<Map<string, TreeEntry[]>>(new Map())

  useEffect(() => {
    void transport
      .listFsTree(sessionId, '')
      .then((r) => setRoots(r.entries))
      .catch(() => setRoots([]))
  }, [sessionId, transport])

  const toggleDir = useCallback(
    (entry: TreeEntry) => {
      const isExp = expanded.has(entry.path)
      if (isExp) {
        setExpanded((prev) => {
          const next = new Set(prev)
          next.delete(entry.path)
          return next
        })
        return
      }
      setExpanded((prev) => new Set(prev).add(entry.path))
      if (!children.has(entry.path)) {
        void transport
          .listFs(sessionId, entry.path)
          .then((r) => setChildren((prev) => new Map(prev).set(entry.path, r.entries)))
          .catch(() => setChildren((prev) => new Map(prev).set(entry.path, [])))
      }
    },
    [expanded, children, sessionId, transport],
  )

  const renderEntries = (list: TreeEntry[] | undefined, depth: number) => {
    if (list === undefined) {
      return (
        <li className="px-3 py-1 text-xs text-muted-foreground/70" style={{ paddingLeft: depth * 14 + 12 }}>
          加载中…
        </li>
      )
    }
    return list.map((e) => (
      <li key={e.path}>
        <button
          type="button"
          onClick={() => {
            if (e.isDir) toggleDir(e)
            else onPick(e.path)
          }}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-3 py-1 text-left text-[13px] hover:bg-accent',
          )}
          style={{ paddingLeft: depth * 14 + 12 }}
        >
          {e.isDir ? (
            <>
              <ChevronRight
                className={cn('size-3.5 shrink-0 transition-transform', expanded.has(e.path) && 'rotate-90')}
              />
              <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            </>
          ) : (
            <>
              <span className="size-3.5 shrink-0" />
              <File className="size-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.name}</span>
        </button>
        {e.isDir && expanded.has(e.path) && (
          <ul>
            {renderEntries(children.get(e.path), depth + 1)}
          </ul>
        )}
      </li>
    ))
  }

  return (
    <div
      role="dialog"
      aria-label="文件树"
      className="absolute bottom-full left-3 z-20 mb-1.5 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md"
    >
      <p className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        点击文件插入 @路径引用（内容由模型经 read 自取）
      </p>
      <ul>{roots === null ? <li className="px-3 py-1 text-xs text-muted-foreground/70">加载中…</li> : renderEntries(roots, 0)}</ul>
    </div>
  )
}
