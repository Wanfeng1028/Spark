/**
 * 数据管理页（阶段十九工单 19.37 / V2-13 第二、三批）：GET /api/storage/report 只读占用统计
 * + 第三批的清理与导出导入。
 * 引擎按**目录发现**分桶（新子路径自动冒出，报表不会安静漏项），本页只做渲染：
 * 桶名映射成人话标签是渲染层的事，引擎不产 UI 文案（19.17 语言单源在 protocol）。
 * 未识别的桶名按原样展示（POSIX 相对路径）——最坏是"没标签"，不是"数据不见了"。
 * **清理**（第三批）：仅 cleanable 桶出按钮（白名单单一来源在引擎，随 report 下发）；
 * 内联两段式确认（DESIGN §5 禁原生 confirm）；服务端纪律 = 移入 trash（§2.10 只移不删），
 * trash 桶清理 = 永久清空（回收站语义）。
 * **导出/导入**（第三批）：JSONL 原生格式整库打包；导出 = 拉取 bundle 下载为文件；
 * 导入 = 选择文件后两段式确认上送，回执 imported/skipped/failed 如实展示。
 */
import { useEffect, useRef, useState } from 'react'
import type { StorageBucketDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { formatBytes } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { SettingGroupCard } from './SettingRow'

/** 常见桶的中文标签（识别不出 = 原样展示相对路径，不造假标签） */
const BUCKET_LABELS: Record<string, string> = {
  sessions: '会话（JSONL 正文）',
  'sessions/checkpoints': '检查点快照（git 仓，可清理大头）',
  logs: '日志',
  'audit.jsonl': '审计明细流',
  'search.db': '全文/语义检索库',
  'memory.db': '长期记忆库',
  'usage.jsonl': '用量累计',
  toolOutputs: '工具输出缓存',
  attachments: '附件',
  'browser-shots': '浏览器/电脑控制截图',
  trash: '回收站（删除会话的留存）',
  feedbackDb: '反馈仓',
  agents: '用户层子代理档',
  'trusted.json': '目录信任档',
  'permissions.json': '用户级权限规则',
  'mcp.json': 'MCP 配置',
  'lsp.json': 'LSP 配置',
  extensions: '扩展包',
  'models.json': '模型声明',
  'secrets.json': '密钥仓',
  'devices.json': '已配对设备',
}

function bucketLabel(name: string): string {
  return BUCKET_LABELS[name] ?? name
}

/** 桶占比条宽度（最大桶为满宽基准——占比一眼可读；零字节桶不给条） */
function barWidth(bytes: number, maxBytes: number): string {
  if (maxBytes <= 0 || bytes <= 0) return '0%'
  return `${Math.max(2, Math.round((bytes / maxBytes) * 100))}%`
}

type ConfirmAction = { kind: 'cleanup'; bucket: string } | { kind: 'import' }

export function DataManagementPage() {
  const { transport } = useTransport()
  const { data: report, error, refresh } = useTransportQuery((t) => t.storageReport())
  const { busy, opError, run } = useAsyncOp()
  /** 内联两段式确认态（DESIGN §5）：首击进入确认态，3s 超时还原；期间再击才执行 */
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 上次维护动作的结果行回显 */
  const [lastResult, setLastResult] = useState<string | null>(null)
  /** 导入文件（选定后待确认上送） */
  const [importFile, setImportFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  // 卸载清定时器（确认态不跨页悬挂）
  useEffect(
    () => () => {
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
    },
    [],
  )

  function askConfirm(action: ConfirmAction): void {
    const same =
      confirming !== null &&
      confirming.kind === action.kind &&
      (action.kind !== 'cleanup' ||
        confirming.kind !== 'cleanup' ||
        confirming.bucket === action.bucket)
    if (!same) {
      setConfirming(action)
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirming(null), 3000)
      return
    }
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current)
    setConfirming(null)
    void execute(action)
  }

  async function execute(action: ConfirmAction): Promise<void> {
    await run(async () => {
      if (action.kind === 'cleanup') {
        const r = await transport.storageCleanup(action.bucket)
        setLastResult(
          r.permanent
            ? `已永久清空 ${r.bucket}：${r.moved} 项${r.failed > 0 ? `，失败 ${r.failed} 项` : ''}`
            : `已移入回收站 ${r.bucket}：${r.moved} 项${r.failed > 0 ? `，失败 ${r.failed} 项` : ''}（可人工找回）`,
        )
        await refresh()
        return
      }
      if (importFile === null) return
      const r = await transport.storageImport(await importFile.text())
      setLastResult(`导入完成：新增 ${r.imported}、已存在跳过 ${r.skipped}、失败 ${r.failed}`)
      setImportFile(null)
      if (fileInput.current !== null) fileInput.current.value = ''
      await refresh()
    })
  }

  async function exportBundle(): Promise<void> {
    await run(async () => {
      const r = await transport.storageExport()
      const blob = new Blob([r.bundle], { type: 'application/x-ndjson' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `spark-export-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
      a.click()
      URL.revokeObjectURL(url)
      setLastResult(`已导出 ${r.files} 个会话文件`)
    })
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (report === null) return <p className="text-xs text-muted-foreground">统计中…</p>

  if (!report.exists) {
    return (
      <SettingGroupCard>
        <p className="px-4 py-4 text-xs text-muted-foreground">
          数据根目录还不存在（{report.home}）——首次创建会话/配置后这里会出现真实占用。
        </p>
      </SettingGroupCard>
    )
  }

  const maxBytes = report.buckets.reduce((m, b) => Math.max(m, b.bytes), 0)

  return (
    <div className="flex flex-col gap-5">
      <SettingGroupCard>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm text-foreground">总占用</span>
            <span className="font-mono text-[11px] text-muted-foreground" title={report.home}>
              {report.home}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground">{formatBytes(report.totalBytes)}</span>
            <span className="text-[11px] text-muted-foreground">{report.totalFiles} 个文件</span>
          </div>
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <p className="px-4 pt-3 text-[11px] text-muted-foreground">
          按目录占用排序（检查点单独成桶）；统计截至 {new Date(report.generatedAt).toLocaleString()}
        </p>
        {report.buckets.map((b: StorageBucketDto) => (
          <div key={b.name} className="flex min-h-12 flex-col justify-center gap-1 px-4 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-xs text-foreground" title={b.name}>
                {bucketLabel(b.name)}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatBytes(b.bytes)} · {b.files} 文件
                {b.newestAt !== undefined ? ` · 最近 ${new Date(b.newestAt).toLocaleDateString()}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground/60" style={{ width: barWidth(b.bytes, maxBytes) }} />
              </div>
              {b.cleanable && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => askConfirm({ kind: 'cleanup', bucket: b.name })}
                  className={
                    confirming?.kind === 'cleanup' && confirming.bucket === b.name
                      ? 'h-6 border-destructive px-2 text-[11px] text-destructive'
                      : 'h-6 px-2 text-[11px]'
                  }
                >
                  {confirming?.kind === 'cleanup' && confirming.bucket === b.name ? '确认清理？' : '清理'}
                </Button>
              )}
            </div>
          </div>
        ))}
        <p className="px-4 pb-3 text-[11px] text-muted-foreground">
          清理 = 移入回收站（可人工找回）；回收站自身清理为永久清空。
        </p>
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm text-foreground">导出 / 导入</span>
            <span className="text-[11px] text-muted-foreground">
              JSONL 原生格式整库打包；回导时同名会话跳过、未知会话按原文件恢复
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void exportBundle()}>
            导出全部会话
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".jsonl,application/x-ndjson,application/json"
            aria-label="选择导出包文件"
            className="hidden"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            选择导入文件
          </Button>
          {importFile !== null && (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => askConfirm({ kind: 'import' })}
            >
              {confirming?.kind === 'import' ? '确认导入？' : `导入 ${importFile.name}`}
            </Button>
          )}
        </div>
      </SettingGroupCard>

      {lastResult !== null && (
        <SettingGroupCard>
          <p className="px-4 py-3 text-xs text-muted-foreground">{lastResult}</p>
        </SettingGroupCard>
      )}
      {opError !== null && (
        <SettingGroupCard>
          <p className="px-4 py-3 font-mono text-xs text-[var(--spark-err)]">{opError}</p>
        </SettingGroupCard>
      )}
    </div>
  )
}
