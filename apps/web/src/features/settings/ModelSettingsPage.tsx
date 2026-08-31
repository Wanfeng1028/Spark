/**
 * 模型设置页（§13.D③ / 工单 6.5）：左列表两组（内置/自定义供应商）+ 详情区
 * （启用 badge、Base URL、API Key 掩码）+ 显式「测试连接」按钮与状态点。
 * 数据源 GET /api/models（掩码原则：DTO 只含环境变量名，key 值永不上线——
 * 故无「眼睛看明文」；增改供应商走 models.json 手工编辑，页面如实说明，不假装可写）。
 * 承接原「新建会话默认模型」行（设置存储，前端本地）。
 * 密钥区（阶段七工单 7.1 / H01）：~/.spark/secrets.json 录入（store > env 优先级），
 * 值只进不回——原 SettingsDialog SecretsSection 随工单 6.4 瘦身迁入本页。
 */
import { useEffect, useState } from 'react'
import { Eye, EyeOff, PlugZap } from 'lucide-react'
import type {
  ModelProviderDto,
  ModelTestResultDto,
  ModelsDto,
  RoutingDto,
  SecretStatusDto,
} from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useSettingsStore } from '@/stores/settings'
import { errorMessageOf } from '@/lib/error-copy'
import { cn } from '@/lib/utils'
import { SettingRow, SettingGroupCard } from './SettingRow'

type LoadState = 'loading' | { error: string }

/** 供应商行状态点：已配置且 Key 就绪=ok；已配置缺 Key=warn；未配置=灰 */
function statusDotClass(p: ModelProviderDto): string {
  if (!p.configured) return 'bg-muted-foreground/30'
  return p.hasKey ? 'bg-[var(--spark-ok)]' : 'bg-[var(--spark-warn)]'
}

function statusText(p: ModelProviderDto): string {
  if (!p.configured) return '未配置'
  return p.hasKey ? '已就绪' : '缺少 API Key'
}

/** 密钥来源徽标文案 */
const SOURCE_LABEL: Record<SecretStatusDto['source'], string> = {
  store: '密钥仓',
  env: '环境变量',
  none: '未配置',
}

/** 密钥管理（工单 7.1）：providers 状态列表 + 单条录入（保存即生效，值不回显） */
function SecretsSection() {
  const { transport } = useTransport()
  const [secrets, setSecrets] = useState<SecretStatusDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  const [provider, setProvider] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    transport
      .listSecrets()
      .then((ss) => {
        if (!cancelled) setSecrets(ss)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport])

  async function save() {
    if (provider.trim() === '' || value.trim() === '') return
    setBusy(true)
    setOpError(null)
    try {
      const p = provider.trim()
      await transport.setSecret(p, value.trim())
      setSecrets((ss) => {
        const next = ss ?? []
        return next.some((s) => s.provider === p)
          ? next.map((s) => (s.provider === p ? { ...s, source: 'store' as const } : s))
          : [...next, { provider: p, source: 'store' as const }]
      })
      setValue('')
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: string) {
    setBusy(true)
    setOpError(null)
    try {
      await transport.removeSecret(p)
      setSecrets((ss) =>
        (ss ?? []).map((s) => (s.provider === p ? { ...s, source: 'none' as const } : s)),
      )
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingGroupCard>
      <SettingRow
        title="API 密钥（密钥仓）"
        description="~/.spark/secrets.json，优先于环境变量；保存即生效，值不回显"
      />
      {error !== null && (
        <p className="px-4 py-3 font-mono text-xs text-[var(--spark-err)]">{error}</p>
      )}
      {error === null && secrets === null && (
        <p className="px-4 py-3 text-xs text-muted-foreground">加载密钥状态…</p>
      )}
      {error === null && secrets !== null && secrets.length === 0 && (
        <p className="px-4 py-3 text-xs text-muted-foreground">models.json 未配置任何 provider</p>
      )}
      {error === null &&
        secrets !== null &&
        secrets.map((s) => (
          <div key={s.provider} className="flex min-h-12 items-center gap-2 px-4 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{s.provider}</span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {SOURCE_LABEL[s.source]}
            </span>
            {s.source === 'store' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(s.provider)}
                className="h-6 shrink-0 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                删除
              </button>
            )}
          </div>
        ))}
      <div className="flex items-center gap-1.5 px-4 py-3">
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="provider（如 deepseek）"
          aria-label="密钥 provider"
          className="h-8 w-36 min-w-0 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="password"
          placeholder="apiKey（写入 ~/.spark/secrets.json）"
          aria-label="apiKey"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
        />
        <button
          type="button"
          disabled={busy || provider.trim() === '' || value.trim() === ''}
          onClick={() => void save()}
          className="h-8 shrink-0 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          保存
        </button>
      </div>
      {opError !== null && (
        <p className="px-4 pb-3 font-mono text-xs text-[var(--spark-err)]">{opError}</p>
      )}
    </SettingGroupCard>
  )
}

/**
 * 模型路由（工单 10.20 A②）：fallback 链 + 任务三档位（压缩/标题/子代理）——
 * GET|PUT /api/routing 端点与 RoutingDto 四字段本就可读写，页面此前缺接线。
 * 三档位不可清空（引擎运行时依赖；留空按未改处理），fallback 链可清空（= 不切换）。
 */
function RoutingSection() {
  const { transport } = useTransport()
  const [routing, setRouting] = useState<RoutingDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fallbacksDraft, setFallbacksDraft] = useState('')
  const [compactionDraft, setCompactionDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [subagentDraft, setSubagentDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    transport
      .getRouting()
      .then((r) => {
        if (cancelled) return
        setRouting(r)
        setFallbacksDraft(r.fallbacks.join('\n'))
        setCompactionDraft(r.compactionModel)
        setTitleDraft(r.titleModel)
        setSubagentDraft(r.subagentModel)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [transport])

  async function save(): Promise<void> {
    const fallbacks = fallbacksDraft
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
    setBusy(true)
    setOpError(null)
    try {
      const next = await transport.updateRouting({
        fallbacks,
        compactionModel: compactionDraft.trim(),
        titleModel: titleDraft.trim(),
        subagentModel: subagentDraft.trim(),
      })
      setRouting(next)
      setFallbacksDraft(next.fallbacks.join('\n'))
      setCompactionDraft(next.compactionModel)
      setTitleDraft(next.titleModel)
      setSubagentDraft(next.subagentModel)
    } catch (err) {
      setOpError(errorMessageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const slotsReady =
    compactionDraft.trim() !== '' && titleDraft.trim() !== '' && subagentDraft.trim() !== ''
  const inputCls =
    'h-8 w-56 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring disabled:opacity-40'

  return (
    <SettingGroupCard>
      <SettingRow
        title="模型路由"
        description="fallback 链与任务档位（provider/model）；保存后热生效（下一次请求），主档=会话模型不在此表"
      />
      {error !== null && (
        <p className="px-4 py-3 font-mono text-xs text-[var(--spark-err)]">{error}</p>
      )}
      {error === null && routing === null && (
        <p className="px-4 py-3 text-xs text-muted-foreground">加载路由配置…</p>
      )}
      {error === null && routing !== null && (
        <>
          <SettingRow title="fallback 链" description="主请求失败按序切换；每行一条，留空 = 不切换">
            <textarea
              value={fallbacksDraft}
              onChange={(e) => setFallbacksDraft(e.target.value)}
              rows={2}
              aria-label="fallback 链"
              disabled={busy}
              placeholder="provider/model（每行一条）"
              className="w-56 resize-none rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring disabled:opacity-40"
            />
          </SettingRow>
          <SettingRow title="压缩档" description="上下文压缩（compaction）使用的模型">
            <input
              value={compactionDraft}
              onChange={(e) => setCompactionDraft(e.target.value)}
              aria-label="压缩档模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="标题档" description="会话自动标题使用的模型">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              aria-label="标题档模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="子代理档" description="子代理（task）使用的模型">
            <input
              value={subagentDraft}
              onChange={(e) => setSubagentDraft(e.target.value)}
              aria-label="子代理档模型"
              disabled={busy}
              placeholder="provider/model"
              className={inputCls}
            />
          </SettingRow>
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              type="button"
              disabled={busy || !slotsReady}
              onClick={() => void save()}
              className="h-8 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              保存
            </button>
            {opError !== null && (
              <span className="min-w-0 truncate font-mono text-xs text-[var(--spark-err)]">
                {opError}
              </span>
            )}
          </div>
        </>
      )}
    </SettingGroupCard>
  )
}

export function ModelSettingsPage() {
  const { transport } = useTransport()
  const model = useSettingsStore((s) => s.model)
  const setModel = useSettingsStore((s) => s.setModel)
  // 本地编辑态：失焦时非空才落库；初始不报错，动过才提示
  const [draft, setDraft] = useState(model)
  const [touched, setTouched] = useState(false)
  const invalid = draft.trim() === ''

  const [dto, setDto] = useState<ModelsDto | LoadState | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  // 测试结果表（providerId → 最近一次）；进行中集合（防连点）
  const [results, setResults] = useState<Record<string, ModelTestResultDto>>({})
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [showEnv, setShowEnv] = useState(false)

  useEffect(() => {
    let cancelled = false
    transport
      .listModels()
      .then((m) => {
        if (cancelled) return
        setDto(m)
        // 初始选中：第一个已配置供应商
        setSelected((cur) => cur ?? m.providers.find((p) => p.configured)?.id ?? null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setDto({ error: errorMessageOf(err) })
      })
    return () => {
      cancelled = true
    }
  }, [transport])

  async function testProvider(p: ModelProviderDto): Promise<void> {
    setTesting((s) => new Set(s).add(p.id))
    try {
      const r = await transport.testModelProvider(p.id)
      setResults((rs) => ({ ...rs, [p.id]: r }))
    } catch (err) {
      // 传输层失败（网络/引擎不可达）也归入结果表如实展示
      setResults((rs) => ({
        ...rs,
        [p.id]: { provider: p.id, ok: false, message: errorMessageOf(err) },
      }))
    } finally {
      setTesting((s) => {
        const next = new Set(s)
        next.delete(p.id)
        return next
      })
    }
  }

  const providers = dto !== null && dto !== 'loading' && !('error' in dto) ? dto.providers : []
  const builtin = providers.filter((p) => p.builtin)
  const custom = providers.filter((p) => !p.builtin)
  const detail = providers.find((p) => p.id === selected) ?? null

  const listRow = (p: ModelProviderDto): React.ReactNode => (
    <button
      key={p.id}
      type="button"
      aria-pressed={p.id === selected}
      onClick={() => setSelected(p.id)}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent',
        p.id === selected && 'bg-accent',
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', statusDotClass(p))} />
      <span className="min-w-0 flex-1 truncate">{p.label}</span>
      {p.configured && (
        <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">
          启用
        </span>
      )}
    </button>
  )

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

      {/* 模型路由（工单 10.20 A②）：fallback 链 + 压缩/标题/子代理三档位 */}
      <RoutingSection />

      {dto === 'loading' || dto === null ? (
        <SettingGroupCard>
          <SettingRow title="供应商列表" description="加载中…" />
        </SettingGroupCard>
      ) : 'error' in dto ? (
        <SettingGroupCard>
          <SettingRow title="供应商列表" description={`加载失败：${dto.error}`}>
            <span className="font-mono text-xs text-[var(--spark-warn)]">不可用</span>
          </SettingRow>
        </SettingGroupCard>
      ) : (
        <div className="flex gap-4">
          {/* 左列表（§13.D③）：内置/自定义两组 */}
          <nav aria-label="供应商列表" className="w-44 shrink-0">
            <p className="px-2 pb-1 text-[11px] text-muted-foreground">
              内置（{builtin.length}）
            </p>
            {builtin.map(listRow)}
            {custom.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-3 text-[11px] text-muted-foreground">
                  自定义（{custom.length}）
                </p>
                {custom.map(listRow)}
              </>
            )}
            <p className="px-2 pt-3 text-[11px] leading-relaxed text-muted-foreground">
              增改供应商须编辑 models.json（providers/models），保存后重启生效。
            </p>
          </nav>

          {/* 详情区（§13.D③） */}
          {detail !== null && (
            <div className="min-w-0 flex-1 rounded-lg border border-border">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className={cn('size-2 shrink-0 rounded-full', statusDotClass(detail))} />
                <h3 className="text-[13px] font-semibold">{detail.label}</h3>
                {detail.configured ? (
                  <span
                    className="rounded border border-border px-1.5 text-[11px] text-muted-foreground"
                    title="已启用 = 已写入 models.json providers；不代表连通，请用「测试连接」确认"
                  >
                    已启用
                  </span>
                ) : (
                  <span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground/60">
                    未配置
                  </span>
                )}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {detail.api}
                </span>
              </div>

              <dl className="divide-y divide-border text-[13px]">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <dt className="w-24 shrink-0 text-muted-foreground">状态</dt>
                  <dd
                    className="min-w-0 flex-1"
                    title="已就绪 = API Key 已配置（密钥仓或环境变量）；不代表连通，请用「测试连接」确认"
                  >
                    {statusText(detail)}
                  </dd>
                </div>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <dt className="w-24 shrink-0 text-muted-foreground">Base URL</dt>
                  <dd className="min-w-0 flex-1 truncate font-mono text-xs">
                    {detail.baseUrl ?? '—（自定义供应商须在 models.json 设置）'}
                  </dd>
                </div>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <dt className="w-24 shrink-0 text-muted-foreground">API Key</dt>
                  <dd className="flex min-w-0 flex-1 items-center gap-1.5">
                    {detail.apiKeyEnv === null ? (
                      <span className="text-muted-foreground">未设置（apiKeyEnv 为空）</span>
                    ) : detail.hasKey ? (
                      <>
                        <span className="font-mono text-xs">
                          {showEnv ? detail.apiKeyEnv : '••••••••'}
                        </span>
                        <button
                          type="button"
                          aria-label={showEnv ? '隐藏环境变量名' : '显示环境变量名'}
                          onClick={() => setShowEnv((v) => !v)}
                          className="text-muted-foreground/60 hover:text-foreground"
                        >
                          {showEnv ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                        <span className="text-[11px] text-muted-foreground">
                          （key 值不进前端——只显示环境变量名）
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--spark-warn)]">
                        环境变量 {detail.apiKeyEnv} 未设置
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <dt className="w-24 shrink-0 text-muted-foreground">测试连接</dt>
                  <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={testing.has(detail.id)}
                      onClick={() => void testProvider(detail)}
                      className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <PlugZap className="size-3.5" />
                      {testing.has(detail.id) ? '测试中…' : '测试连接'}
                    </button>
                    {results[detail.id] !== undefined && (
                      <span
                        className={cn(
                          'flex min-w-0 items-center gap-1.5 text-xs',
                          results[detail.id]?.ok
                            ? 'text-[var(--spark-ok)]'
                            : 'text-[var(--spark-warn)]',
                        )}
                        title={results[detail.id]?.detail ?? results[detail.id]?.message}
                      >
                        <span
                          className={cn(
                            'size-1.5 shrink-0 rounded-full',
                            results[detail.id]?.ok
                              ? 'bg-[var(--spark-ok)]'
                              : 'bg-[var(--spark-warn)]',
                          )}
                        />
                        {results[detail.id]?.ok
                          ? `${results[detail.id]?.message}（${results[detail.id]?.latencyMs ?? '?'}ms）`
                          : results[detail.id]?.message}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}

      <SecretsSection />
    </div>
  )
}
