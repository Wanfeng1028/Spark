/**
 * 数据管理页（阶段十九工单 19.37 / V2-13 第二批）：GET /api/storage/report 只读占用统计——
 * 引擎按**目录发现**分桶（新子路径自动冒出，报表不会安静漏项），本页只做渲染：
 * 桶名映射成人话标签是渲染层的事，引擎不产 UI 文案（19.17 语言单源在 protocol）。
 * 未识别的桶名按原样展示（POSIX 相对路径）——最坏是"没标签"，不是"数据不见了"。
 * 清理与导出导入归下一批（清理走 §2.10 确认纪律，另立交互），本页不设假开关。
 */
import { useTransportQuery } from '@/hooks/useTransportQuery'
import type { StorageBucketDto } from '@spark/protocol'
import { formatBytes } from '@/lib/format'
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
  browser-shots: '浏览器/电脑控制截图',
  trash: '回收站（删除会话的留存）',
  feedbackDb: '反馈仓',
  agents: '用户层子代理档',
  trusted.json: '目录信任档',
  permissions.json: '用户级权限规则',
  mcp.json: 'MCP 配置',
  lsp.json: 'LSP 配置',
  extensions: '扩展包',
  models.json: '模型声明',
  secrets.json: '密钥仓',
  devices.json: '已配对设备',
}

function bucketLabel(name: string): string {
  return BUCKET_LABELS[name] ?? name
}

function bucketTitle(name: string): string {
  return BUCKET_LABELS[name] !== undefined ? name : ''
}

/** 桶占比条宽度（最大桶为满宽基准——占比一眼可读；零字节桶不给条） */
function barWidth(bytes: number, maxBytes: number): string {
  if (maxBytes <= 0 || bytes <= 0) return '0%'
  return `${Math.max(2, Math.round((bytes / maxBytes) * 100))}%`
}

export function DataManagementPage() {
  const { data: report, error } = useTransportQuery((t) => t.storageReport())

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
              <span className="truncate text-xs text-foreground" title={bucketTitle(b.name) || b.name}>
                {bucketLabel(b.name)}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatBytes(b.bytes)} · {b.files} 文件
                {b.newestAt !== undefined ? ` · 最近 ${new Date(b.newestAt).toLocaleDateString()}` : ''}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground/60" style={{ width: barWidth(b.bytes, maxBytes) }} />
            </div>
          </div>
        ))}
      </SettingGroupCard>

      {report.skipped.length > 0 && (
        <SettingGroupCard>
          <p className="px-4 pt-3 text-[11px] text-muted-foreground">
            以下条目未计入统计（如实列原因——少算和"没算"是两件事）：
          </p>
          {report.skipped.map((s) => (
            <div key={`${s.name}:${s.reason}`} className="flex min-h-9 items-center justify-between gap-3 px-4 py-1.5">
              <span className="truncate font-mono text-[11px] text-foreground">{s.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{s.reason}</span>
            </div>
          ))}
        </SettingGroupCard>
      )}
    </div>
  )
}
