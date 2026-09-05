/**
 * @ / / 命令菜单浮层（工单 R-E③ 自 Composer 拆出，纯展示——菜单状态机
 * （detectMenu/Esc 签名/确认回写）仍在 Composer 核心语义内）。
 */
import type { CommandDto } from '@spark/protocol'
import { cn } from '@/lib/utils'
import type { MenuQuery } from './composer-menus'

export function ComposerMenu({
  menu,
  slashItems,
  menuIndex,
  onSelect,
}: {
  menu: MenuQuery
  slashItems: readonly CommandDto[]
  menuIndex: number
  /** 行按下（mousedown 保输入焦点）：父层负责选中并 rAF 确认 */
  onSelect: (index: number) => void
}) {
  return (
    <div className="absolute inset-x-3 bottom-full z-20 mb-1.5 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
      <ul
        role="listbox"
        aria-label={menu.kind === 'at' ? '提及菜单' : '命令菜单'}
        className="max-h-64 overflow-y-auto py-1"
      >
        {menu.kind === 'slash' ? (
          slashItems.length > 0 ? (
            <>
              <li className="px-2.5 py-1 text-[11px] text-muted-foreground">命令</li>
              {slashItems.map((c, i) => (
                <li
                  key={c.name}
                  role="option"
                  aria-selected={i === menuIndex}
                  onMouseDown={(e) => {
                    e.preventDefault() // 保输入焦点
                    onSelect(i)
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px]',
                    i === menuIndex && 'bg-accent',
                  )}
                >
                  <span className="font-mono text-xs text-muted-foreground">/{c.name}</span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {c.description}
                  </span>
                </li>
              ))}
            </>
          ) : (
            <li className="px-2.5 py-2 text-xs text-muted-foreground">没有匹配的命令</li>
          )
        ) : (
          <>
            <li className="px-2.5 py-1 text-[11px] text-muted-foreground">文件</li>
            <li className="px-2.5 py-2 text-xs text-muted-foreground">
              文件搜索将在阶段七接入（引擎目录 API）
            </li>
            <li className="px-2.5 py-1 text-[11px] text-muted-foreground">技能</li>
            <li className="px-2.5 py-2 text-xs text-muted-foreground">暂无已加载技能</li>
          </>
        )}
      </ul>
      <p className="border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
        {menu.kind === 'at'
          ? '输入内容以搜索文件或技能'
          : '输入内容以搜索命令、技能或子智能体'}
      </p>
    </div>
  )
}
