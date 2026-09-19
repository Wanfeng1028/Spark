/**
 * 权限档位菜单浮层（§13.E 四档；工单 R-E③ 自 Composer 拆出，纯展示——
 * 当前档右侧勾选，full-access 图标 warn）。外点关闭兜底在 Composer 层。
 */
import { Check } from 'lucide-react'
import type { PermissionPreset } from '@spark/protocol'
import { cn } from '@/lib/utils'
import { PERMISSION_TIERS } from './composer-menus'

export function PermissionTierMenu({
  preset,
  onChoose,
}: {
  preset: PermissionPreset
  onChoose: (preset: PermissionPreset) => void
}) {
  return (
    <div
      data-preset-menu
      className="absolute bottom-full left-3 z-20 mb-1.5 w-64 overflow-hidden rounded-xl bg-popover shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_3px_8px_rgba(0,0,0,0.03),0_0_16px_rgba(0,0,0,0.02)] dark:shadow-[0_0_0_0.5px_rgb(255_255_255/0.16),0_3px_8px_rgb(0_0_0/0.25)]"
    >
      <ul>
        {PERMISSION_TIERS.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={t.id === preset}
              onMouseDown={(e) => e.preventDefault()} // 保输入焦点
              onClick={() => onChoose(t.id)}
              className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-accent"
            >
              <t.icon
                className={cn('mt-0.5 size-4 shrink-0', t.warn && 'text-[var(--spark-warn)]')}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-tight">{t.label}</span>
                <span className="block text-xs leading-tight text-muted-foreground">
                  {t.description}
                </span>
              </span>
              {t.id === preset && <Check className="mt-0.5 size-4 shrink-0" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
