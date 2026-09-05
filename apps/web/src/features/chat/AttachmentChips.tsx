/**
 * 附件路径 chips（v1 只收路径文本；工单 R-E③ 自 Composer 拆出，纯展示——
 * 列表状态与添加逻辑在 Composer）。
 */
import { X } from 'lucide-react'

export function AttachmentChips({
  attachments,
  attachOpen,
  attachInput,
  onAttachInput,
  onAdd,
  onRemove,
}: {
  attachments: readonly string[]
  attachOpen: boolean
  attachInput: string
  onAttachInput: (v: string) => void
  onAdd: () => void
  onRemove: (path: string) => void
}) {
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="附件路径">
          {attachments.map((p) => (
            <li
              key={p}
              className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 font-mono text-xs text-muted-foreground"
            >
              <span className="max-w-56 truncate">{p}</span>
              <button
                type="button"
                aria-label={`移除附件 ${p}`}
                onClick={() => onRemove(p)}
                className="text-muted-foreground/60 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {attachOpen && (
        <input
          value={attachInput}
          onChange={(e) => onAttachInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAdd()
            }
          }}
          placeholder="输入文件路径后回车添加（v1 只收路径文本）"
          className="h-7 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground/60 focus:border-ring"
        />
      )}
    </div>
  )
}
