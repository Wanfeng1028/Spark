/**
 * 交付物视图（CK-13 批 2）：present 工具声明清单——slice.deliverables 投影。
 * 只读列表（文件路径 + 可选说明）；无交付声明不渲染入口（禁假状态）。
 */
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface DeliverablesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  files: string[]
  summary?: string
}

export function DeliverablesDialog({ open, onOpenChange, files, summary }: DeliverablesDialogProps) {
  const [copied, setCopied] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogTitle>交付文件</DialogTitle>
        <DialogDescription>
          {summary !== undefined && summary !== '' ? summary : '模型声明的交付文件清单'}
        </DialogDescription>
        <ul className="max-h-[50vh] overflow-y-auto rounded-xl border border-border font-mono text-xs">
          {files.map((f) => (
            <li key={f} className="border-b border-border px-3 py-1.5 last:border-b-0">
              {f}
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(files.join('
')).then(() => setCopied(true))
            }}
          >
            {copied ? '已复制' : '复制清单'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
