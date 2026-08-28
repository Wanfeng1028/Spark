/**
 * 自动化页（阶段七工单 7.6 / H06 / ADR D26；DESIGN §13.F.3 实测形态）：
 * 页头一句说明 → 空态虚线卡（创建定时/闲时双钮）→ 模板两组各 3 列栅格
 * （闲时=外部触发入口；定时=人话化 cron 预设）→ 我的任务列表（启停/立即运行/删除）
 * → 运行历史（新→旧；失败行结构化错误留存；成功行跳会话）。
 * 「运行会话时保持电脑唤醒」开关条缺省不渲染——Web 端无系统电源权限，
 * 桌面端后续工单实现（ADR D26 注记）。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  CalendarClock,
  FileSearch,
  GitPullRequest,
  Moon,
  PackagePlus,
  Play,
  RefreshCw,
  ScrollText,
  Sun,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AutomationCreate, AutomationRunDto, AutomationTriggerDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { errorMessageOf } from '@/lib/error-copy'

type TemplateKind = 'idle' | 'scheduled'

interface AutomationTemplate {
  id: string
  kind: TemplateKind
  name: string
  description: string
  /** 闲时 = 最早可用时段；定时 = 执行时间人话 */
  timing: string
  icon: LucideIcon
  create: AutomationCreate
}

const TEMPLATES: readonly AutomationTemplate[] = [
  {
    id: 'idle-review',
    kind: 'idle',
    name: '合并后复查',
    description: '对最近一次合并跑一遍静态检查与单测',
    timing: '空闲时排队',
    icon: GitPullRequest,
    create: {
      name: '合并后复查',
      cwd: '',
      prompt: '对最近一次 git 合并运行 lint 与单元测试，汇总失败项。',
      webhook: true,
    },
  },
  {
    id: 'idle-deps',
    kind: 'idle',
    name: '依赖更新检查',
    description: '检查依赖是否有可用的次版本升级',
    timing: '空闲时排队',
    icon: PackagePlus,
    create: {
      name: '依赖更新检查',
      cwd: '',
      prompt: '检查本项目依赖是否有可用的次版本升级，列出名称与版本差。',
      webhook: true,
    },
  },
  {
    id: 'idle-digest',
    kind: 'idle',
    name: '日志整理',
    description: '整理当天工作记录，生成一份简报',
    timing: '空闲时排队',
    icon: ScrollText,
    create: {
      name: '日志整理',
      cwd: '',
      prompt: '整理今天的工作目录变更记录，生成一份简短日报。',
      webhook: true,
    },
  },
  {
    id: 'sched-morning',
    kind: 'scheduled',
    name: '晨间准备',
    description: '汇总昨日未完成任务与今日待办',
    timing: '每工作日 09:00',
    icon: Sun,
    create: {
      name: '晨间准备',
      cwd: '',
      prompt: '汇总昨日未完成任务与今日待办，输出清单。',
      cron: '0 9 * * 1-5',
    },
  },
  {
    id: 'sched-night',
    kind: 'scheduled',
    name: '夜间巡检',
    description: '跑一次全量测试并记录结果',
    timing: '每天 23:00',
    icon: Moon,
    create: {
      name: '夜间巡检',
      cwd: '',
      prompt: '运行全量测试套件，记录通过/失败数量与失败项。',
      cron: '0 23 * * *',
    },
  },
  {
    id: 'sched-weekly',
    kind: 'scheduled',
    name: '周度回顾',
    description: '按提交记录生成本周变更摘要',
    timing: '每周五 17:00',
    icon: CalendarClock,
    create: {
      name: '周度回顾',
      cwd: '',
      prompt: '按本周 git 提交记录生成变更摘要，按模块归类。',
      cron: '0 17 * * 5',
    },
  },
]

const KIND_TEXT: Record<AutomationRunDto['kind'], string> = {
  cron: '定时',
  watch: '文件变更',
  webhook: '外部触发',
  manual: '手动',
}

/** 触发条件人话化（任务列表行内展示） */
function triggerText(t: AutomationTriggerDto): string {
  const parts: string[] = []
  if (t.cron !== undefined) parts.push(`定时 ${t.cron}`)
  if (t.watch !== undefined) parts.push(`监听 ${t.watch}`)
  if (t.webhook === true) parts.push('外部触发')
  return parts.length === 0 ? '—' : parts.join(' / ')
}

interface DraftState {
  mode: 'cron' | 'webhook'
  name: string
  cwd: string
  prompt: string
  cron: string
}

function draftOf(tpl: AutomationTemplate | null, mode: 'cron' | 'webhook'): DraftState {
  return {
    mode,
    name: tpl?.create.name ?? '',
    cwd: tpl?.create.cwd ?? '',
    prompt: tpl?.create.prompt ?? '',
    cron: tpl?.create.cron ?? (mode === 'cron' ? '0 9 * * *' : ''),
  }
}

export function AutomationPage() {
  const navigate = useNavigate()
  const { transport } = useTransport()
  const [triggers, setTriggers] = useState<AutomationTriggerDto[] | null>(null)
  const [runs, setRuns] = useState<AutomationRunDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [ts, rs] = await Promise.all([transport.listAutomation(), transport.listAutomationRuns(100)])
      setTriggers(ts)
      setRuns(rs)
      setError(null)
    } catch (err) {
      setError(errorMessageOf(err))
    }
  }, [transport])

  useEffect(() => {
    void reload()
  }, [reload])

  async function submitDraft(): Promise<void> {
    if (draft === null) return
    if (draft.name.trim() === '' || draft.cwd.trim() === '' || draft.prompt.trim() === '') {
      setDraftError('名称、工作目录与任务内容均必填')
      return
    }
    if (draft.mode === 'cron' && draft.cron.trim() === '') {
      setDraftError('定时任务须填写 cron 表达式（5 字段：分 时 日 月 周）')
      return
    }
    const input: AutomationCreate = {
      name: draft.name.trim(),
      cwd: draft.cwd.trim(),
      prompt: draft.prompt.trim(),
      ...(draft.mode === 'cron' ? { cron: draft.cron.trim() } : { webhook: true }),
    }
    try {
      await transport.createAutomation(input)
      setDraft(null)
      setDraftError(null)
      await reload()
    } catch (err) {
      setDraftError(errorMessageOf(err))
    }
  }

  async function toggleEnabled(t: AutomationTriggerDto, enabled: boolean): Promise<void> {
    setBusyId(t.id)
    try {
      await transport.setAutomationEnabled(t.id, enabled)
      await reload()
    } catch (err) {
      setError(errorMessageOf(err))
    } finally {
      setBusyId(null)
    }
  }

  async function runNow(t: AutomationTriggerDto): Promise<void> {
    setBusyId(t.id)
    try {
      await transport.fireAutomationManual(t.id)
      await reload()
    } catch (err) {
      setError(errorMessageOf(err))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(t: AutomationTriggerDto): Promise<void> {
    setBusyId(t.id)
    try {
      await transport.removeAutomation(t.id)
      await reload()
    } catch (err) {
      setError(errorMessageOf(err))
    } finally {
      setBusyId(null)
    }
  }

  if (triggers === null) {
    return <p className="p-6 text-xs text-muted-foreground">加载中…</p>
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-base font-semibold">自动化</h1>
        <p className="text-xs text-muted-foreground">
          创建定时任务，或排队在闲置算力空闲时后台执行。
        </p>
      </header>

      {error !== null && (
        <p className="rounded-md border border-border px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {triggers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <FileSearch className="size-6 text-muted-foreground/60" />
          <p className="text-[13px] text-muted-foreground">还没有自动化任务</p>
          <div className="flex items-center gap-2">
            <Button onClick={() => setDraft(draftOf(null, 'cron'))}>创建定时任务</Button>
            <Button variant="secondary" onClick={() => setDraft(draftOf(null, 'webhook'))}>
              创建闲时任务
            </Button>
          </div>
        </div>
      ) : (
        <section aria-label="我的任务" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-muted-foreground">我的任务</h2>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(draftOf(null, 'cron'))}>
                新建定时
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDraft(draftOf(null, 'webhook'))}>
                新建闲时
              </Button>
            </div>
          </div>
          <ul className="flex flex-col rounded-lg border border-border">
            {triggers.map((t) => (
              <li
                key={t.id}
                className="flex h-11 items-center gap-3 border-b border-border px-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{t.name}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {triggerText(t)}
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
                  {new Date(t.createdAt).toLocaleDateString()}
                </span>
                <Switch
                  checked={t.enabled}
                  disabled={busyId === t.id}
                  aria-label={`启停 ${t.name}`}
                  onChange={(on) => void toggleEnabled(t, on)}
                />
                <button
                  type="button"
                  title="立即运行"
                  aria-label={`立即运行 ${t.name}`}
                  disabled={busyId === t.id}
                  onClick={() => void runNow(t)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                >
                  <Play className="size-3.5" />
                </button>
                <button
                  type="button"
                  title="删除"
                  aria-label={`删除 ${t.name}`}
                  disabled={busyId === t.id}
                  onClick={() => void remove(t)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="任务模板" className="flex flex-col gap-3">
        <h2 className="text-xs font-medium text-muted-foreground">从模板创建</h2>
        {(['idle', 'scheduled'] as const).map((kind) => (
          <div key={kind} className="flex flex-col gap-1.5">
            <h3 className="text-xs text-muted-foreground/80">
              {kind === 'idle' ? '闲时任务（排队等待手动或外部触发）' : '定时任务（按 cron 表达式自动运行）'}
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TEMPLATES.filter((tpl) => tpl.kind === kind).map((tpl) => {
                const Icon = tpl.icon
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setDraft(draftOf(tpl, kind === 'idle' ? 'webhook' : 'cron'))}
                    className="flex flex-col gap-1 rounded-lg border border-border p-3 text-left hover:bg-accent"
                  >
                    <span className="flex items-center gap-1.5 text-[13px] font-medium">
                      <Icon className="size-3.5 text-muted-foreground" />
                      {tpl.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{tpl.description}</span>
                    <span className="mt-1 text-[11px] text-muted-foreground/70">{tpl.timing}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <section aria-label="运行历史" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-muted-foreground">运行历史</h2>
          <button
            type="button"
            aria-label="刷新运行历史"
            title="刷新"
            onClick={() => void reload()}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
        {runs === null || runs.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">尚无运行记录</p>
        ) : (
          <ul className="flex flex-col rounded-lg border border-border">
            {runs.map((r) => (
              <li
                key={r.id}
                className="flex h-10 items-center gap-3 border-b border-border px-3 text-xs last:border-b-0"
              >
                <span className="shrink-0 text-muted-foreground">
                  {new Date(r.at).toLocaleString()}
                </span>
                <span className="min-w-0 flex-1 truncate">{r.triggerName}</span>
                <span className="shrink-0 text-muted-foreground">{KIND_TEXT[r.kind]}</span>
                {r.finish === 'ok' ? (
                  r.sessionId !== undefined ? (
                    <button
                      type="button"
                      onClick={() => void navigate(`/session/${r.sessionId}`)}
                      className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-[var(--spark-ok)] hover:bg-accent"
                    >
                      成功 · 查看会话
                    </button>
                  ) : (
                    <span className="shrink-0 text-[var(--spark-ok)]">成功</span>
                  )
                ) : (
                  <span
                    className="min-w-0 shrink truncate text-destructive"
                    title={r.error ?? ''}
                  >
                    失败：{r.error ?? '未知错误'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null)
            setDraftError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.mode === 'cron' ? '创建定时任务' : '创建闲时任务'}</DialogTitle>
            <DialogDescription>
              {draft?.mode === 'cron'
                ? '到达 cron 表达式指定的时刻时自动创建会话并执行任务内容。'
                : '任务创建后待命，由「立即运行」或外部 webhook 触发执行。'}
            </DialogDescription>
          </DialogHeader>
          {draft !== null && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                名称
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-[13px] text-foreground outline-none focus:border-ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                工作目录
                <input
                  value={draft.cwd}
                  onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                  placeholder="会话的工作目录（绝对路径）"
                  className="h-8 rounded-md border border-border bg-background px-2 text-[13px] text-foreground outline-none focus:border-ring"
                />
              </label>
              {draft.mode === 'cron' && (
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  cron 表达式（分 时 日 月 周）
                  <input
                    value={draft.cron}
                    onChange={(e) => setDraft({ ...draft, cron: e.target.value })}
                    placeholder="如 0 9 * * 1-5 = 每工作日 09:00"
                    className="h-8 rounded-md border border-border bg-background px-2 font-mono text-[13px] text-foreground outline-none focus:border-ring"
                  />
                </label>
              )}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                任务内容
                <textarea
                  value={draft.prompt}
                  onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                  rows={3}
                  className="resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-ring"
                />
              </label>
              {draftError !== null && <p className="text-xs text-destructive">{draftError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              取消
            </Button>
            <Button onClick={() => void submitDraft()}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
