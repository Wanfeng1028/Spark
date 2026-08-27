/**
 * SettingsDialog 快速面板（doc/02 §6.2.3 → 工单 6.4 瘦身）：
 * 设置主体已迁设置中心全屏页（/settings/:page，DESIGN §13.D）；
 * 此 Dialog 保留会话内快捷形态——主题三档 +「打开设置中心」入口。
 * defaultDelivery/model/权限规则/密钥均已迁（常规页/模型设置页/权限规则页）。
 */
import { useNavigate } from 'react-router'
import { useSettingsStore } from '@/stores/settings'
import type { Theme } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** 主题三档（§13.C；浅色默认） */
const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: 'light', label: '浅色', hint: '默认' },
  { value: 'dark', label: '深色', hint: '' },
  { value: 'system', label: '跟随系统', hint: '监听系统外观' },
]

export function SettingsDialog() {
  const navigate = useNavigate()
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  function openCenter(): void {
    setOpen(false)
    void navigate('/settings/appearance')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>快速设置</DialogTitle>
          <DialogDescription>完整设置在设置中心</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <p className="font-mono text-[11px] text-muted-foreground">主题</p>
            <div className="flex h-8 w-fit rounded-md border border-border p-0.5" role="radiogroup" aria-label="主题">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => setTheme(t.value)}
                  title={t.hint !== '' ? t.hint : undefined}
                  className={
                    'h-7 rounded-sm px-4 text-xs ' +
                    (theme === t.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={openCenter}
            className="flex h-8 items-center justify-center rounded-md border border-border px-3 text-[13px] hover:bg-accent"
          >
            打开设置中心…
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
