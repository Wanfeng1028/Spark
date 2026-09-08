/**
 * 审计日志页（工单 7.12 / H11；DESIGN §13.G 形态）：
 * 转录式明细流——时间+主体+工具/资源+决策+来源；顶部过滤器（时间/决策/工具/类型）。
 * 数据源 GET /api/audit（新→旧）；只读视图，无写操作。
 * **互链初值**（工单 13.7）：会话链路浮层点「审计」跳 `?tool=<名>`（可带 result/kind）——
 * URL 只作 useState 初值，之后以页内控件为准（不反向写 URL，避免双向绑定）。
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { AuditEntryDto, AuditQuery } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { cn } from '@/lib/utils'

const inputClass =
  'h-8 min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring'

type RangeKey = 'all' | 'today' | '7d' | '30d'
type ResultKey = 'all' | AuditEntryDto['result']
type KindKey = 'all' | AuditEntryDto['kind']

const RANGE_OPTIONS: ReadonlyArray<readonly [RangeKey, string]> = [
  ['all', '全部时间'],
  ['today', '今日'],
  ['7d', '近 7 日'],
  ['30d', '近 30 日'],
]
const RESULT_OPTIONS: ReadonlyArray<readonly [ResultKey, string]> = [
  ['all', '全部决策'],
  ['allow', '允许'],
  ['deny', '拒绝'],
  ['applied', '规则生效'],
  ['ok', '回滚完成'],
]
const KIND_OPTIONS: ReadonlyArray<readonly [KindKey, string]> = [
  ['all', '全部类型'],
  ['permission.decision', '审批决策'],
  ['permission.rule', '规则变更'],
  ['session.rollback', '会话回滚'],
]

function sinceOf(range: RangeKey): number | undefined {
  const now = new Date()
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }
  if (range === '7d') return Date.now() - 7 * 86_400_000
  if (range === '30d') return Date.now() - 30 * 86_400_000
  return undefined
}

/** URL 初值解析（工单 13.7 互链）：只认选项表里存在的值，其余回落 all——不拿非法串当筛选条件 */
function optionOf<T extends string>(
  options: ReadonlyArray<readonly [T, string]>,
  raw: string | null,
): T | 'all' {
  if (raw === null) return 'all'
  return options.some(([v]) => v === raw) ? (raw as T) : 'all'
}

const KIND_LABEL: Record<AuditEntryDto['kind'], string> = {
  'permission.decision': '审批决策',
  'permission.rule': '规则变更',
  'session.rollback': '会话回滚',
}

function resultClass(result: AuditEntryDto['result']): string {
  if (result === 'allow' || result === 'ok') return 'text-[var(--spark-ok)]'
  if (result === 'deny') return 'text-[var(--spark-err)]'
  return 'text-muted-foreground'
}

const RESULT_LABEL: Record<AuditEntryDto['result'], string> = {
  allow: '允许',
  deny: '拒绝',
  applied: '生效',
  ok: '完成',
}

function AuditRow({ e }: { e: AuditEntryDto }): React.JSX.Element {
  const when = new Date(e.time)
  const timeStr = `${when.toLocaleDateString()} ${when.toLocaleTimeString()}`
  const target = [
    ...(e.tool !== undefined ? [e.tool] : []),
    ...(e.action !== undefined ? [e.action] : []),
    ...(e.resource !== undefined ? [e.resource] : []),
  ].join(' · ')
  const ruleDetail =
    e.kind === 'permission.rule'
      ? `${e.op === 'remove' ? '删除' : '新增'} ${e.action ?? ''} ${e.resource ?? ''}${e.effect !== undefined ? `（${e.effect}）` : ''}`
      : undefined
  return (
    <div className="flex items-baseline gap-2 px-4 py-2 text-xs leading-5">
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{timeStr}</span>
      <span className="shrink-0 text-muted-foreground">{e.actor === 'user' ? '用户' : '系统'}</span>
      <span className={cn('shrink-0 font-medium', resultClass(e.result))}>
        {RESULT_LABEL[e.result]}
      </span>
      <span className="shrink-0 text-muted-foreground">{KIND_LABEL[e.kind]}</span>
      <span className="min-w-0 truncate font-mono text-[11px]">
        {ruleDetail ?? (target !== '' ? target : '—')}
      </span>
      {e.source !== undefined && (
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70">{e.source}</span>
      )}
    </div>
  )
}

export function AuditSettingsPage(): React.JSX.Element {
  // 互链初值（工单 13.7）：链路浮层跳来的 tool/result/kind 只当 useState 初值用
  const [params] = useSearchParams()
  const [range, setRange] = useState<RangeKey>('all')
  const [result, setResult] = useState<ResultKey>(optionOf(RESULT_OPTIONS, params.get('result')))
  const [kind, setKind] = useState<KindKey>(optionOf(KIND_OPTIONS, params.get('kind')))
  const [tool, setTool] = useState(params.get('tool') ?? '')
  // 筛选变化即重查（useTransportQuery deps 驱动——原 cancelled effect 同语义）
  const { data: entries, error } = useTransportQuery((t) => {
    const since = sinceOf(range)
    const query: AuditQuery = {
      limit: 200,
      ...(kind !== 'all' ? { kind } : {}),
      ...(result !== 'all' ? { result } : {}),
      ...(tool.trim() !== '' ? { tool: tool.trim() } : {}),
      ...(since !== undefined ? { since } : {}),
    }
    return t.listAudit(query)
  }, [range, result, kind, tool])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          aria-label="时间范围"
          className={inputClass}
        >
          {RANGE_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as KindKey)}
          aria-label="类型"
          className={inputClass}
        >
          {KIND_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={result}
          onChange={(e) => setResult(e.target.value as ResultKey)}
          aria-label="决策"
          className={inputClass}
        >
          {RESULT_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          placeholder="按工具名过滤（如 bash）"
          aria-label="工具名"
          className={cn(inputClass, 'w-44')}
        />
      </div>

      {error !== null ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : entries === null ? (
        <p className="text-xs text-muted-foreground">加载中…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          暂无审计记录——权限决策、规则变更与会话回滚会逐条记入 ~/.spark/audit.jsonl。
        </p>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {entries.map((e, i) => (
              <AuditRow key={`${e.time}-${i}`} e={e} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
