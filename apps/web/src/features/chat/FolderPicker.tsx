/**
 * 工作区文件夹 chip（§13.L L.8，DSH 三批）：浮于 Composer 卡上方——DSH hero
 * WorkspaceChip 同构（28px 高、16px 圆角、transparent 底、13px/500 全对比度文本 +
 * caption chevron）。两形态：
 * - 选择（欢迎页）：options=最近会话 cwd 去重 + 「默认工作区」（引擎缺省 cwd）；
 *   选中后新会话按该 cwd 创建（createSession({ cwd })）。
 * - 只读（会话页）：cwd 固定，无 chevron 无弹层，title 提示完整路径。
 * 无数据（欢迎页无最近会话）时整枚不渲染——禁假状态。
 */
import { useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '@/hooks/useDismissOnOutsideClick'
import { Check, ChevronDown, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FolderOption {
  /** 完整 cwd（建会话透传） */
  cwd: string
  /** 显示名（目录名） */
  label: string
}

export interface FolderPickerProps {
  /** 当前显示名（欢迎页未选 =「选择文件夹」占位——DSH「Choose workspace」同位） */
  label: string
  /** 完整 cwd（只读形态的 title；undefined = 未选/默认） */
  cwd?: string
  /** 可选项；缺省 = 只读形态 */
  options?: readonly FolderOption[]
  /** 当前选中 cwd（null = 默认工作区/未选） */
  selected?: string | null
  onPick?: (cwd: string | null) => void
  disabled?: boolean
}

export function FolderPicker({ label, cwd, options, selected, onPick, disabled }: FolderPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const interactive = options !== undefined && onPick !== undefined

  useDismissOnOutsideClick(
    open,
    () => setOpen(false),
    (t) => rootRef.current !== null && rootRef.current.contains(t),
  )

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="工作区文件夹"
        aria-haspopup={interactive ? 'menu' : undefined}
        aria-expanded={interactive ? open : undefined}
        disabled={disabled}
        onClick={() => {
          if (interactive) setOpen((v) => !v)
        }}
        title={cwd ?? label}
        className={cn(
          'flex h-7 max-w-[360px] min-w-0 items-center gap-1 rounded-2xl px-2 text-[13px] leading-5 font-medium text-foreground',
          interactive && !disabled && 'hover:bg-accent',
        )}
      >
        <FolderOpen className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
        {interactive && <ChevronDown className="size-3 shrink-0 text-muted-foreground" />}
      </button>

      {interactive && open && (
        <ul
          role="menu"
          aria-label="工作区文件夹"
          className="absolute bottom-full left-0 z-20 mb-1.5 w-64 overflow-hidden rounded-xl bg-popover py-1 shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_3px_8px_rgba(0,0,0,0.03),0_0_16px_rgba(0,0,0,0.02)] dark:shadow-[0_0_0_0.5px_rgb(255_255_255/0.16),0_3px_8px_rgb(0_0_0/0.25)]"
        >
          <li role="none">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={selected === null}
              onMouseDown={(e) => e.preventDefault()} // 保输入焦点
              onClick={() => {
                setOpen(false)
                onPick(null)
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">默认工作区</span>
              {selected === null && <Check className="size-3.5 shrink-0" />}
            </button>
          </li>
          {options.map((o) => (
            <li key={o.cwd} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected === o.cwd}
                title={o.cwd}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false)
                  onPick(o.cwd)
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
              >
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{o.label}</span>
                {selected === o.cwd && <Check className="size-3.5 shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
