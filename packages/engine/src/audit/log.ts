/**
 * 审计日志（阶段七工单 7.12 / H11）：permission 决策 / 规则变更 / rollback 的
 * 独立 JSONL 明细流——~/.spark/audit.jsonl 追加写（单写者纪律同 automation-runs）。
 * 明细含时间/主体/动作/结果；脱敏纪律同 pino（redaction.ts 单一来源三层正则 +
 * 密钥仓动态值，与 IoGuard 同模式）。读端坏行跳过（只追加不改写——单行损坏不
 * 阻塞列表）。
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BEARER_RE,
  REPLACEMENT,
  SECRET_RE,
  buildEnvPatterns,
  escapeRegex,
} from '../observability/redaction.js'

export type AuditKind = 'permission.decision' | 'permission.rule' | 'session.rollback'

export interface AuditEntry {
  time: number
  kind: AuditKind
  /** 主体：user=用户答复/管理操作；system=规则/超时/中断/级联自动 */
  actor: 'user' | 'system'
  /** 结果：allow/deny=决策；applied=规则变更生效；ok=回滚完成 */
  result: 'allow' | 'deny' | 'applied' | 'ok'
  sessionId?: string
  /** 工具名（权限决策的过滤维度） */
  tool?: string
  action?: string
  resource?: string
  /** 规则变更时该规则的 effect（规则表允许 ask 档） */
  effect?: 'allow' | 'deny' | 'ask'
  /** 规则变更操作（kind=permission.rule）：add=新增/覆盖；remove=删除 */
  op?: 'add' | 'remove'
  /** 决策/变更来源（命中规则层 / 答复类型 / 超时 / 管理页…） */
  source?: string
  checkpointId?: string
}

export interface AuditQuery {
  limit: number
  kind?: AuditKind
  result?: AuditEntry['result']
  tool?: string
  since?: number
}

/** 记录端口（PermissionService 只依赖本接口；真身是 AuditLog） */
export type AuditSink = Pick<AuditLog, 'record'>

export class AuditLog {
  private readonly filePath: string
  /** env 脱敏模式进程内静态（启动后环境变量不变） */
  private readonly envPatterns: readonly RegExp[]

  constructor(
    root: string,
    /** 密钥仓动态取值（同 IoGuard：setSecret 即时纳入脱敏；缺省仅静态三层） */
    private readonly secretValues?: () => Iterable<string>,
  ) {
    this.filePath = join(root, 'audit.jsonl')
    this.envPatterns = buildEnvPatterns()
  }

  /** 追加一条明细（写前脱敏；审计失败不阻断主流程——内部自闭合） */
  record(entry: AuditEntry): void {
    try {
      appendFileSync(this.filePath, `${this.redact(JSON.stringify(entry))}\n`)
    } catch {
      // 审计是旁路记录：写盘失败吞掉不影响审批/回滚主链路
    }
  }

  /** 读最近明细（新→旧）：过滤 since/kind/result/tool 后取末 limit 条 */
  entries(query: AuditQuery): AuditEntry[] {
    if (!existsSync(this.filePath)) return []
    const lines = readFileSync(this.filePath, 'utf8').split('\n').filter((l) => l !== '')
    const rows: AuditEntry[] = []
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line) as AuditEntry)
      } catch {
        // 坏行跳过（历史文件只追加不改写——单行损坏不阻塞列表）
      }
    }
    const filtered = rows.filter((e) => {
      if (query.since !== undefined && e.time < query.since) return false
      if (query.kind !== undefined && e.kind !== query.kind) return false
      if (query.result !== undefined && e.result !== query.result) return false
      if (query.tool !== undefined && e.tool !== query.tool) return false
      return true
    })
    return filtered.slice(-query.limit).reverse()
  }

  /** 脱敏：三层静态正则 + 密钥仓动态值（长度 ≥ 6 防误伤，同 buildEnvPatterns） */
  private redact(line: string): string {
    let out = line.replace(SECRET_RE, REPLACEMENT).replace(BEARER_RE, REPLACEMENT)
    for (const re of this.envPatterns) out = out.replace(re, REPLACEMENT)
    for (const v of this.secretValues?.() ?? []) {
      if (v.length < 6) continue
      out = out.replace(new RegExp(escapeRegex(v), 'g'), REPLACEMENT)
    }
    return out
  }
}
