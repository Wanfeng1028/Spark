/**
 * SettingsDialog（doc/02 §6.2.3）：v1 用 Dialog 不换路由；即存即生效（无保存按钮）。
 * 字段全部走 settings-store（localStorage 持久化）；默认模型只影响新建会话。
 * 权限规则表为阶段四内容，v1 不渲染（§6.2.3 表内标注 v2）。
 */
import { useState } from 'react'
import type { Delivery } from '@spark/protocol'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const DELIVERIES: { value: Delivery; label: string; hint: string }[] = [
  { value: 'now', label: 'now', hint: '空闲时立即开新轮' },
  { value: 'steer', label: 'steer', hint: '进行中注入当前轮' },
  { value: 'queue', label: 'queue', hint: '排队等本轮结束' },
]

function SectionLabel({ children }: { children: string }) {
  return <p className="font-mono text-[11px] text-muted-foreground">{children}</p>
}

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const defaultDelivery = useSettingsStore((s) => s.defaultDelivery)
  const setDefaultDelivery = useSettingsStore((s) => s.setDefaultDelivery)
  const model = useSettingsStore((s) => s.model)
  const setModel = useSettingsStore((s) => s.setModel)

  // 本地编辑态：失焦时非空才落库（§6.2.3 唯一校验为非空）；初始不报错，动过才提示
  const [modelDraft, setModelDraft] = useState(model)
  const [modelTouched, setModelTouched] = useState(false)
  const modelInvalid = modelDraft.trim() === ''

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>即存即生效，仅本地持久化</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <SectionLabel>通用 · 主题</SectionLabel>
            <div className="flex h-8 w-fit rounded-md border border-border p-0.5" role="radiogroup" aria-label="主题">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  onClick={() => setTheme(t)}
                  className={
                    'h-7 rounded-sm px-4 text-xs ' +
                    (theme === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>通用 · 默认 delivery</SectionLabel>
            <div className="flex flex-col gap-1" role="radiogroup" aria-label="默认 delivery">
              {DELIVERIES.map((d) => (
                <label
                  key={d.value}
                  className={
                    'flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-[13px] ' +
                    (defaultDelivery === d.value ? 'bg-accent' : 'hover:bg-accent/50')
                  }
                >
                  <input
                    type="radio"
                    name="default-delivery"
                    checked={defaultDelivery === d.value}
                    onChange={() => setDefaultDelivery(d.value)}
                    className="size-3 accent-[var(--primary)]"
                  />
                  <span className="font-mono text-xs">{d.label}</span>
                  <span className="text-xs text-muted-foreground">{d.hint}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>模型 · 新建会话默认模型</SectionLabel>
            <input
              value={modelDraft}
              onChange={(e) => {
                setModelDraft(e.target.value)
                setModelTouched(true)
              }}
              onBlur={() => {
                setModelTouched(true)
                if (!modelInvalid) setModel(modelDraft.trim())
              }}
              placeholder="provider/model"
              aria-invalid={modelTouched && modelInvalid}
              className={
                'h-8 rounded-md border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 ' +
                (modelTouched && modelInvalid ? 'border-[var(--spark-err)]/60' : 'border-border focus:border-ring')
              }
            />
            {modelTouched && modelInvalid && (
              <p className="text-xs text-[var(--spark-err)]">模型名不能为空——留空将沿用上次保存值</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
