/**
 * 首启 onboarding 三步引导（阶段十二工单 12.8 / V2-17）：
 * ① 欢迎与安全姿态 ② 配模型（选供应商 → 录 key → 测试连接）③ 建首个会话。
 * 可跳过（不再自动弹）；步骤进度落 localStorage（中途关闭再进续到当前步）；
 * 设置中心「重跑引导」入口复用本页（clearDone + 步骤归零）。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Loader2, ShieldCheck } from 'lucide-react'
import type { ModelProviderDto } from '@spark/protocol'
import { errorMessageOf } from '@/lib/error-copy'
import { useTransport } from '@/transports/context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export const ONBOARDING_DONE_KEY = 'spark-onboarding-done'
export const ONBOARDING_STEP_KEY = 'spark-onboarding-step'

export function onboardingDone(): void {
  localStorage.setItem(ONBOARDING_DONE_KEY, '1')
}

export function clearOnboarding(): void {
  localStorage.removeItem(ONBOARDING_DONE_KEY)
  localStorage.removeItem(ONBOARDING_STEP_KEY)
}

/** 首启判定（AppShell 挂载时调用一次）：无完成标记且服务端无任何已配置供应商 */
export async function shouldOnboard(
  listModels: () => Promise<{ providers: ModelProviderDto[] }>,
): Promise<boolean> {
  if (localStorage.getItem(ONBOARDING_DONE_KEY) === '1') return false
  try {
    const dto = await listModels()
    return !dto.providers.some((p) => p.hasKey)
  } catch {
    return false // server 未就绪等异常不弹引导（fail-soft）
  }
}

const STEPS = ['欢迎', '配置模型', '开始使用'] as const

export function OnboardingPage(): React.ReactElement {
  const navigate = useNavigate()
  const [step, setStep] = useState<number>(() => {
    const saved = Number(localStorage.getItem(ONBOARDING_STEP_KEY) ?? '0')
    return Number.isInteger(saved) && saved >= 0 && saved < STEPS.length ? saved : 0
  })
  const goto = (n: number): void => {
    setStep(n)
    localStorage.setItem(ONBOARDING_STEP_KEY, String(n))
  }

  const skip = (): void => {
    onboardingDone()
    localStorage.removeItem(ONBOARDING_STEP_KEY)
    void navigate('/welcome')
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-base font-semibold">欢迎使用 Spark</h1>
        <ol className="flex gap-2" aria-label="引导步骤">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs',
                i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </header>

      {step === 0 && <WelcomeStep onNext={() => goto(1)} onSkip={skip} />}
      {step === 1 && <ModelStep onServerReady={() => goto(2)} onSkip={skip} />}
      {step === 2 && <StartStep onBack={() => goto(1)} />}

      <div className="mt-auto flex justify-between text-xs text-muted-foreground">
        <button type="button" onClick={skip} className="hover:text-foreground">
          跳过引导（不再自动弹出）
        </button>
        <span>随时可在 设置 → 通用 重新运行</span>
      </div>
    </div>
  )
}

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-5">
      <h2 className="flex items-center gap-2 text-[13px] font-medium">
        <ShieldCheck className="size-4" /> 本地优先 · 数据不出本机
      </h2>
      <ul className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
        <li>· 引擎运行在你自己的机器上（127.0.0.1，无公网暴露）。</li>
        <li>· API Key 只存本地密钥仓（~/.spark/secrets.json），不进对话、不进日志。</li>
        <li>· 敏感操作默认需你逐条审批（可按规则固化）。</li>
      </ul>
      <div className="mt-2 flex gap-2">
        <Button onClick={onNext}>开始配置模型</Button>
        <Button variant="ghost" onClick={onSkip}>
          稍后再说
        </Button>
      </div>
    </section>
  )
}

function ModelStep({ onServerReady, onSkip }: { onServerReady: () => void; onSkip: () => void }) {
  const { transport } = useTransport()
  const [providers, setProviders] = useState<ModelProviderDto[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tested, setTested] = useState<string | null>(null) // ok 消息或 null

  const load = async (): Promise<void> => {
    try {
      const dto = await transport.listModels()
      setProviders(dto.providers)
      const first = dto.providers.find((p) => p.hasKey) ?? dto.providers[0]
      if (first !== undefined) setSelected(first.id)
    } catch (err) {
      setError(errorMessageOf(err))
    }
  }
  if (providers === null) {
    void load()
    return (
      <section className="flex items-center gap-2 rounded-lg border border-border p-5 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 加载供应商目录…
      </section>
    )
  }

  async function saveAndTest(): Promise<void> {
    if (selected === null || apiKey.trim() === '') {
      setError('请先选择供应商并输入 API Key')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await transport.setSecret(selected, apiKey.trim())
      const result = await transport.testModelProvider(selected)
      if (result.ok) {
        setTested(`连接成功（${result.latencyMs}ms）——配置已保存`)
        onServerReady()
      } else {
        setError(result.message ?? '测试连接失败——请检查 Key 与网络')
      }
    } catch (err) {
      setError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-5">
      <h2 className="text-[13px] font-medium">选择供应商并录入 API Key（只存本地密钥仓）</h2>
      <div className="flex flex-wrap gap-1.5">
        {(providers ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs',
              selected === p.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {p.label}
            {p.hasKey ? ' · 已配' : ''}
          </button>
        ))}
      </div>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="API Key（sk-…；只存 ~/.spark/secrets.json）"
        className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
      />
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
      {tested !== null && <p className="text-xs text-[var(--spark-ok)]">{tested}</p>}
      <div className="mt-1 flex gap-2">
        <Button onClick={() => void saveAndTest()} disabled={busy || selected === null}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} 保存并测试连接
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          跳过此步
        </Button>
      </div>
    </section>
  )
}

function StartStep({ onBack }: { onBack: () => void }) {
  const { transport } = useTransport()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-5">
      <h2 className="text-[13px] font-medium">一切就绪——创建第一个会话开始对话</h2>
      <p className="text-[13px] text-muted-foreground">
        会话即工作台：输入任务，模型会以流式回复并按需调用工具（敏感操作会请求审批）。
      </p>
      <div className="mt-1 flex gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void transport
              .createSession()
              .then((dto) => {
                onboardingDone()
                localStorage.removeItem(ONBOARDING_STEP_KEY)
                void navigate(`/session/${dto.id}`)
              })
              .catch(() => setBusy(false))
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} 创建会话并开始
        </Button>
        <Button variant="ghost" onClick={onBack}>
          返回上一步
        </Button>
      </div>
    </section>
  )
}

