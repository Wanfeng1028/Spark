/**
 * 模型设置页（§13.D③ / 工单 6.5）：左列表两组（内置/自定义供应商）+ 详情区
 * （启用 badge、Base URL、API Key 掩码）+ 显式「测试连接」按钮与状态点。
 * 数据源 GET /api/models（掩码原则：DTO 只含环境变量名，key 值永不上线——
 * 故无「眼睛看明文」；增改供应商走 models.json 手工编辑，页面如实说明，不假装可写）。
 * 承接原「新建会话默认模型」行（设置存储，前端本地）。
 */
import { useEffect, useState } from 'react'
import { Eye, EyeOff, PlugZap } from 'lucide-react'
import type { ModelProviderDto, ModelTestResultDto, ModelsDto } from '@spark/protocol'
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
                  <span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">
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
                  <dd className="min-w-0 flex-1">{statusText(detail)}</dd>
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
    </div>
  )
}
