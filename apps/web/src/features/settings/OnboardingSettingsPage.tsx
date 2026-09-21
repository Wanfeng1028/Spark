/**
 * 引导设置页（阶段十九 19.15，消解"引导"占位页）：引导状态查看（完成标记/当前步骤/
 * 供应商配置态——真实数据源 GET /api/models）+ 重跑引导入口收编本页（原在常规页
 * 「重跑引导」按钮，收拢到专属页后常规页改为指向本页的说明）+ 首启自动弹开关。
 * 状态全部落 localStorage（端侧偏好，不进 spark.json）；自动弹关掉后 shouldOnboard
 * 不再弹（用户明确选择不看引导时不强弹）。
 */
import { useNavigate } from 'react-router'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useOnboardingState, ONBOARDING_STEPS } from '@/hooks/useOnboardingState'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { SettingGroupCard, SettingRow } from './SettingRow'

export function OnboardingSettingsPage() {
  const navigate = useNavigate()
  const { state, rerun, setAutoPop } = useOnboardingState()
  const { data: models } = useTransportQuery((t) => t.listModels())
  const configured = (models?.providers ?? []).filter((p) => p.hasKey).length
  const total = models?.providers.length ?? 0

  return (
    <div className="flex flex-col gap-3">
      <SettingGroupCard>
        <SettingRow
          title="引导状态"
          description={
            state.done
              ? `已完成（第 ${String(state.step + 1)} 步：${ONBOARDING_STEPS[state.step] ?? ''}）`
              : `未完成（停在第 ${String(state.step + 1)} 步：${ONBOARDING_STEPS[state.step] ?? ''}）`
          }
        >
          <span className="font-mono text-xs text-muted-foreground">{state.done ? 'done' : 'pending'}</span>
        </SettingRow>
        <SettingRow
          title="供应商配置态"
          description="已录 key 的供应商数（引导第二步的数据源；0 = 引导会再次从配模型开始）"
        >
          <span className="font-mono text-xs text-muted-foreground">
            {models === null ? '加载中…' : `${String(configured)} / ${String(total)}`}
          </span>
        </SettingRow>
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow title="首启自动弹引导" description="无完成标记且服务端无任何已配置供应商时，首次进入自动打开引导">
          <Switch aria-label="首启自动弹引导" checked={state.autoPop} onChange={setAutoPop} />
        </SettingRow>
        <div className="flex items-center gap-2 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              rerun()
              void navigate('/onboarding')
            }}
          >
            重新运行引导
          </Button>
          <span className="text-xs text-muted-foreground">
            清完成标记与步骤进度并打开引导页（欢迎 / 配模型 / 建会话）
          </span>
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            引导状态存本机浏览器（localStorage）——换浏览器/清站点数据后会重新看到引导；
            服务端只认证供应商配置态（GET /api/models），不记录"是否看过引导"。
          </p>
        </div>
      </SettingGroupCard>
    </div>
  )
}
