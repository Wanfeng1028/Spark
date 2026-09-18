/**
 * 附件路径 chips（v1 只收路径文本；工单 R-E③ 自 Composer 拆出，纯展示——
 * 列表状态与添加逻辑在 Composer）。
 */
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function AttachmentChips({
  attachments,
  attachmentNames,
  attachOpen,
  attachInput,
  onAttachInput,
  onAdd,
  onRemove,
}: {
  attachments: readonly string[]
  /** 附件 id → 原始文件名（工单 12.2a 图片上传后的 chips 展示；无映射按路径条目渲染） */
  attachmentNames?: ReadonlyMap<string, string>
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
          {attachments.map((p) => {
            const name = attachmentNames?.get(p)
            // §13.L L.5（WO-066）：上传图片=64px 缩略方块 + hover 关闭；路径条目维持 chip
            if (name !== undefined) {
              return (
                <li key={p} className="group/att relative">
                  <img
                    src={`/api/attachments/${p}`}
                    alt={name}
                    className="size-16 rounded-2xl object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`移除附件 ${name}`}
                    onClick={() => onRemove(p)}
                    className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-foreground text-background opacity-0 transition-opacity group-hover/att:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              )
            }
            return (
              <li
                key={p}
                className="flex h-6 items-center gap-1 rounded-full border border-border px-1.5 font-mono text-xs text-muted-foreground"
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
            )
          })}
        </ul>
      )}
      {attachOpen && (
        <Input
          value={attachInput}
          onChange={(e) => onAttachInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAdd()
            }
          }}
          placeholder="输入文件路径后回车添加（v1 只收路径文本）"
          className="h-7 font-mono text-xs"
        />
      )}
    </div>
  )
}
