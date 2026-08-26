/**
 * 模型设置页（工单 6.4 部分落地）：承接原 SettingsDialog 的「新建会话默认模型」；
 * 供应商两组列表/连通测试/会话级选择器为工单 6.5（§13.D③），此处占位明示。
 */
import { useState } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { SettingRow, SettingGroupCard } from './SettingRow'

export function ModelSettingsPage() {
  const model = useSettingsStore((s) => s.model)
  const setModel = useSettingsStore((s) => s.setModel)
  // 本地编辑态：失焦时非空才落库；初始不报错，动过才提示
  const [draft, setDraft] = useState(model)
  const [touched, setTouched] = useState(false)
  const invalid = draft.trim() === ''

  return (
    <div className="flex flex-col gap-5">
      <SettingGroupCard>
        <SettingRow
          title="新建会话默认模型"
          description="provider/model；留空 = 用引擎默认（spark.json defaultModel）"
        >
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setTouched(true)
            }}
            onBlur={() => {
              setTouched(true)
              if (!invalid) setModel(draft.trim())
            }}
            placeholder="provider/model"
            aria-label="新建会话默认模型"
            aria-invalid={touched && invalid}
            className={
              'h-8 w-56 rounded-md border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 ' +
              (touched && invalid ? 'border-[var(--spark-err)]/60' : 'border-border focus:border-ring')
            }
          />
        </SettingRow>
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow
          title="供应商列表"
          description="内置/自定义两组、启用 badge、Base URL 与 Key 掩码"
          placeholderBadge="后续工单"
        />
        <SettingRow
          title="连通测试"
          description="保存即测状态点 + 显式「测试连接」按钮"
          placeholderBadge="后续工单"
        />
        <SettingRow
          title="会话级模型选择器"
          description="Composer 旁供应商/模型级联下拉"
          placeholderBadge="后续工单"
        />
      </SettingGroupCard>
    </div>
  )
}
