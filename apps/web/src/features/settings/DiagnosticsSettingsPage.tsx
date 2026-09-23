/**
 * 诊断页（阶段十九 19.38 第二批 / V2-14）：引擎日志尾部查看器。
 * 形态照 §13.G 转录式明细流，与审计日志页同族（级别过滤 + 子串匹配 + 列表）。
 * 数据源 GET /api/logs——**只读尾部字节窗口**（引擎侧默认 512KB、上限 4MB），故 `truncated`
 * 为真时必须如实说明"还有更早的内容未返回"，不能让用户以为看到了全部。
 * 导出走浏览器 Blob 不经服务端，导出的是**当前视图**（已过滤的那批）而非日志全文，
 * 按钮文案与文件名都如实说明——把过滤后的子集叫"日志导出"会让人误以为是全量。
 */
import { useState } from 'react'
import type { LogEntryDto, LogsQuery } from '@spark/protocol'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const inputClass =
  'h-8 min-w-0 rounded-full border border-border/60 bg-secondary px-2.5 text-xs outline-none focus:border-ring'

type LevelKey = 'all' | LogEntryDto['level']

/** 级别取"该级别及以上"（pino 语义，服务端 logs.ts 实现），故选项文案直说而非只列级别名 */
const LEVEL_OPTIONS: ReadonlyArray<readonly [LevelKey, string]> = [
  ['all', '全部级别'],
  ['trace', 'trace 及以上'],
  ['debug', 'debug 及以上'],
  ['info', 'info 及以上'],
  ['warn', 'warn 及以上'],
  ['error', 'error 及以上'],
  ['fatal', '仅 fatal'],
]

const LIMIT = 500

function levelClass(level: LogEntryDto['level']): string {
  if (level === 'error' || level === 'fatal') return 'text-[var(--spark-err)]'
  if (level === 'warn') return 'text-[var(--spark-warn)]'
  if (level === 'info') return 'text-foreground'
  return 'text-muted-foreground'
}

/** 导出一行的文本形态：与页面显示同构（ISO 时间 + 定宽级别 + msg + fields），便于贴进 issue 后再 grep */
export function logLineOf(e: LogEntryDto): string {
  const fields = Object.keys(e.fields).length === 0 ? '' : ` ${JSON.stringify(e.fields)}`
  return `${new Date(e.time).toISOString()} ${e.level.toUpperCase().padEnd(5)} ${e.msg}${fields}`
}

function LogRow({ e }: { e: LogEntryDto }): React.JSX.Element {
  const when = new Date(e.time)
  const hasFields = Object.keys(e.fields).length > 0
  return (
    <div className="flex items-baseline gap-2 px-4 py-2 text-xs leading-5">
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {`${when.toLocaleDateString()} ${when.toLocaleTimeString()}`}
      </span>
      <span className={cn('w-11 shrink-0 font-mono text-[11px] font-medium', levelClass(e.level))}>
        {e.level}
      </span>
      <span className="shrink-0 font-mono text-[11px]">{e.msg}</span>
      {hasFields && (
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground/80">
          {JSON.stringify(e.fields)}
        </span>
      )}
    </div>
  )
}

export function DiagnosticsSettingsPage(): React.JSX.Element {
  const [level, setLevel] = useState<LevelKey>('all')
  const [match, setMatch] = useState('')
  const { data: logs, error } = useTransportQuery(
    (t) => {
      const query: LogsQuery = {
        limit: LIMIT,
        ...(level !== 'all' ? { level } : {}),
        ...(match.trim() !== '' ? { match: match.trim() } : {}),
      }
      return t.getLogs(query)
    },
    [level, match],
  )

  const entries = logs?.entries ?? []

  function exportView(): void {
    const blob = new Blob([`${entries.map(logLineOf).join('\n')}\n`], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spark-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as LevelKey)}
          aria-label="级别"
          className={inputClass}
        >
          {LEVEL_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <Input
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          placeholder="子串匹配（比 msg 与字段）"
          aria-label="子串匹配"
          className="w-52 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={exportView}
          disabled={entries.length === 0}
          className="ml-auto"
        >
          导出当前 {entries.length} 条
        </Button>
      </div>

      {logs !== null && (
        <p className="font-mono text-[11px] leading-4 text-muted-foreground">
          {logs.path}
          {logs.truncated && ` · 已截断：仅显示尾部最近 ${entries.length} 条，更早的内容未返回`}
        </p>
      )}

      {error !== null ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : logs === null ? (
        <p className="text-xs text-muted-foreground">加载中…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          没有符合条件的日志——引擎日志写在 ~/.spark/logs/engine.log，首次运行前确实为空。
        </p>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {entries.map((e, i) => (
              <LogRow key={`${e.time}-${i}`} e={e} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
