/**
 * PermissionService（doc/02 §5.7.2）：ask 挂起表 + 事件时序 + fail-closed。
 *
 * - evaluate → allow 直接过 / deny 直接拒（均不发事件，事件由管线补）；
 *   多 pattern 清单逐段评估：任一 deny → 拒、全 allow → 过、否则一次 ask 携带全部
 *   patterns/alwaysPatterns（补强 1，工单 4.7）；
 * - reply：once 放行一次；always 按 alwaysPatterns（缺省 patterns ?? [resource]）固化
 *   规则——先落用户级文件（跨会话生效）再写会话临时层（进程内立即生效），并扫描
 *   pending 级联放行（opencode 自动放行）；reject 级联拒绝同会话其余挂起
 *   （补强 2），feedback 非空时注入 user.message 回喂模型；
 * - 超时 / turn 中断（AbortSignal）/ dispose → 一律 resolve(deny) +
 *   permission.resolved{reject}（fail-closed，"宁可错杀"）。
 */
import type { EventId, PermissionPreset, PermissionReply, RequestId, SessionId } from '@spark/protocol'
import type { EventBus } from '../bus.js'
import type { PermissionRule } from '../config.js'
import { newIds } from '../ulid.js'
import type { PermissionCheck, PermissionService } from '../tools/permission-port.js'
import { evaluateAll } from './rules.js'
import type { RuleStore } from './store.js'
import type { Metrics } from '../observability/metrics.js'
import type { AuditSink } from '../audit/log.js'

interface PendingEntry {
  requestId: RequestId
  sessionId: SessionId
  check: PermissionCheck
  settled: boolean
  resolve: (allowed: boolean) => void
  timer: ReturnType<typeof setTimeout>
  onAbort: () => void
}

export interface PermissionServiceDeps {
  bus: EventBus
  /** 用户级规则仓（~/.spark/permissions.json 内存持有；always 持久化落点——工单 4.7） */
  ruleStore: RuleStore
  /** 项目级 <cwd>/.spark/permissions.json 规则（loadProjectRules） */
  projectRules: readonly PermissionRule[]
  /** 审批超时（spark.json permissionTimeoutMs，缺省 5min） */
  timeoutMs: number
  /** 进程内指标（§5.10 清单；缺省不计数——测试可省，工单 4.8） */
  metrics?: Metrics
  /**
   * 用户侧 hooks 挂点（阶段七工单 7.3 / H03）：permission.resolved 事件落盘后
   * 触发（fire-and-forget——回调内自闭合，不阻断审批流程）。
   */
  onResolved?: (payload: {
    sessionId: SessionId
    requestId: RequestId
    reply: PermissionReply
    sourceEventId: EventId
  }) => void
  /**
   * 审计日志（阶段七工单 7.12 / H11）：permission 决策与 always 固化规则变更
   * 逐条记入独立明细流（旁路记录，写失败不影响审批主链路）。
   */
  audit?: AuditSink
}

export class PermissionServiceImpl implements PermissionService {
  private readonly pending = new Map<RequestId, PendingEntry>()
  private readonly sessionRules = new Map<SessionId, PermissionRule[]>()
  /** 档位 ID 表（D7 补记预设层）；规则由 presetRulesOf 派生，切档整体替换 */
  private readonly presets = new Map<SessionId, PermissionPreset>()

  constructor(private readonly deps: PermissionServiceDeps) {}

  async assert(check: PermissionCheck): Promise<boolean> {
    // fail-closed：请求已达时 turn 已中断
    if (check.signal.aborted) {
      this.recordDecision(check, false, 'system', 'abort')
      return false
    }
    const effect = evaluateAll(
      check.action,
      check.patterns ?? [check.resource],
      this.deps.ruleStore.list(),
      this.deps.projectRules,
      this.sessionRulesOf(check.sessionId),
      this.presetRulesOf(check.sessionId),
    )
    if (effect === 'allow' || effect === 'deny') {
      // 规则层快路径：归因 = 命中且与终判同效的最高优先层（findLast 语义倒查）
      this.recordDecision(check, effect === 'allow', 'system', `rule:${this.ruleSourceOf(check, effect)}`)
      return effect === 'allow'
    }

    const requestId = newIds.request()
    await this.deps.bus.emit(check.sessionId, 'permission.asked', {
      requestId,
      callId: check.callId,
      action: check.action,
      resource: check.resource,
      ...(check.patterns !== undefined ? { patterns: [...check.patterns] } : {}),
      ...(check.alwaysPatterns !== undefined
        ? { alwaysPatterns: [...check.alwaysPatterns] }
        : {}),
      reason: `工具 ${check.name} 请求 ${check.action}：${check.resource}`,
      detail: check.input,
    })
    // emit 期间 turn 中断：asked 已入流，补 resolved{reject} 保持闭合
    if (check.signal.aborted) {
      const env = await this.deps.bus.emit(check.sessionId, 'permission.resolved', {
        requestId,
        reply: 'reject',
      })
      this.deps.onResolved?.({
        sessionId: check.sessionId,
        requestId,
        reply: 'reject',
        sourceEventId: env.id,
      })
      this.recordDecision(check, false, 'system', 'abort')
      return false
    }
    return await new Promise<boolean>((resolve) => {
      const entry: PendingEntry = {
        requestId,
        sessionId: check.sessionId,
        check,
        settled: false,
        resolve,
        onAbort: () => {
          void this.settle(entry, false, 'reject', 'abort')
        },
        timer: setTimeout(() => {
          void this.settle(entry, false, 'reject', 'timeout')
        }, this.deps.timeoutMs),
      }
      check.signal.addEventListener('abort', entry.onAbort, { once: true })
      this.pending.set(requestId, entry)
    })
  }

  /** 全域 deny 的 action 不进广告清单（§5.7 补强 5；会话临时层只有 allow 写入，不参与） */
  isDenied(action: string): boolean {
    return evaluateAll(action, ['**'], this.deps.ruleStore.list(), this.deps.projectRules) === 'deny'
  }

  /** 会话是否有挂起审批（SessionMetaDto.status 的 'waiting-approval' 数据源） */
  isWaitingApproval(sessionId: SessionId): boolean {
    for (const entry of this.pending.values()) {
      if (entry.sessionId === sessionId) return true
    }
    return false
  }

  /**
   * UI 审批回复（POST /api/permissions/:requestId 的引擎侧入口）。
   * 返回 false = 未知/已决 requestId（server 层映射 404）。
   */
  async reply(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<boolean> {
    const entry = this.pending.get(requestId)
    if (entry === undefined) return false
    if (reply === 'once') {
      await this.settle(entry, true, 'once', 'reply')
      return true
    }
    if (reply === 'always') {
      // 固化范围在 ask 时声明（补强 3）：alwaysPatterns ?? patterns ?? 单资源。
      // 先落用户级文件（跨会话生效；写盘失败抛错→审批仍挂起可重试），再写会话临时层
      // （进程内立即生效，免重读文件）
      const targets =
        entry.check.alwaysPatterns ?? entry.check.patterns ?? [entry.check.resource]
      for (const resource of targets) {
        const rule: PermissionRule = {
          action: entry.check.action,
          resource,
          effect: 'allow',
        }
        this.deps.ruleStore.add(rule)
        this.sessionRulesOf(entry.sessionId).push(rule)
        // 审计（7.12）：always 答复附带规则固化——决策行之外另记规则变更行
        this.deps.audit?.record({
          time: Date.now(),
          kind: 'permission.rule',
          actor: 'user',
          result: 'applied',
          op: 'add',
          action: rule.action,
          resource,
          effect: 'allow',
          source: 'reply:always',
        })
      }
      await this.settle(entry, true, 'always', 'reply')
      // 级联放行：各自会话规则下现在 evaluate=allow 的其他挂起项一并 resolve
      for (const other of [...this.pending.values()]) {
        if (
          evaluateAll(
            other.check.action,
            other.check.patterns ?? [other.check.resource],
            this.deps.ruleStore.list(),
            this.deps.projectRules,
            this.sessionRulesOf(other.sessionId),
            this.presetRulesOf(other.sessionId),
          ) === 'allow'
        ) {
          await this.settle(other, true, 'always', 'cascade')
        }
      }
      return true
    }
    // reject：feedback 非空注入 user.message（surface）回喂模型（CorrectedError 思想）
    await this.settle(entry, false, 'reject', 'reply', feedback)
    if (feedback !== undefined && feedback !== '') {
      await this.deps.bus.emit(entry.sessionId, 'user.message', { text: feedback })
    }
    // reject 级联：同会话其余挂起审批一并自动 reject（fail-closed 收敛，补强 2）
    for (const other of [...this.pending.values()]) {
      if (other.sessionId === entry.sessionId) {
        await this.settle(other, false, 'reject', 'cascade')
      }
    }
    return true
  }

  /** 引擎 shutdown 收尾：pending 非空 → 全部 resolve(deny)（§5.7 补强 7） */
  async dispose(): Promise<void> {
    for (const entry of [...this.pending.values()]) {
      await this.settle(entry, false, 'reject', 'shutdown')
    }
  }

  /** 结清一项：resolved 事件 + 工具侧 resolve。落盘失败也必须闭合（finally） */
  private async settle(
    entry: PendingEntry,
    allowed: boolean,
    reply: PermissionReply,
    origin: 'reply' | 'timeout' | 'abort' | 'shutdown' | 'cascade',
    feedback?: string,
  ): Promise<void> {
    if (entry.settled) return
    entry.settled = true
    clearTimeout(entry.timer)
    entry.check.signal.removeEventListener('abort', entry.onAbort)
    this.pending.delete(entry.requestId)
    this.deps.metrics?.inc('spark_permission_decisions', { reply }) // 工单 4.8：once/always/reject 计数
    // 审计（7.12）：用户答复 = 主体 user；超时/中断/级联/收尾 = system 自动
    this.recordDecision(
      entry.check,
      allowed,
      origin === 'reply' ? 'user' : 'system',
      origin === 'reply' ? `reply:${reply}` : origin,
    )
    try {
      const env = await this.deps.bus.emit(entry.sessionId, 'permission.resolved', {
        requestId: entry.requestId,
        reply,
        ...(feedback !== undefined && feedback !== '' ? { feedback } : {}),
      })
      this.deps.onResolved?.({
        sessionId: entry.sessionId,
        requestId: entry.requestId,
        reply,
        sourceEventId: env.id,
      })
    } finally {
      entry.resolve(allowed)
    }
  }

  private sessionRulesOf(sid: SessionId): PermissionRule[] {
    let rules = this.sessionRules.get(sid)
    if (rules === undefined) {
      rules = []
      this.sessionRules.set(sid, rules)
    }
    return rules
  }

  /** 审计（7.12）：记一条权限决策明细（旁路；未接审计仓即忽略） */
  private recordDecision(
    check: PermissionCheck,
    allowed: boolean,
    actor: 'user' | 'system',
    source: string,
  ): void {
    this.deps.audit?.record({
      time: Date.now(),
      kind: 'permission.decision',
      actor,
      result: allowed ? 'allow' : 'deny',
      sessionId: check.sessionId,
      tool: check.name,
      action: check.action,
      resource: check.resource,
      source,
    })
  }

  /**
   * 规则层归因（审计展示"规则来源"用）：evaluateAll 是 findLast 语义——
   * 按优先级倒序（档位→会话→项目→用户）找首个单层评估即得终判 effect 的层。
   */
  private ruleSourceOf(check: PermissionCheck, effect: 'allow' | 'deny'): string {
    const resources = check.patterns ?? [check.resource]
    const layers: ReadonlyArray<readonly [string, readonly PermissionRule[]]> = [
      ['preset', this.presetRulesOf(check.sessionId)],
      ['session', this.sessionRulesOf(check.sessionId)],
      ['project', this.deps.projectRules],
      ['user', this.deps.ruleStore.list()],
    ]
    for (const [name, rules] of layers) {
      if (evaluateAll(check.action, resources, rules) === effect) return name
    }
    return 'none'
  }

  // ---- 权限档位（DESIGN §13.E 四档 / ADR D7 补记：规则引擎之上的预设层） ----

  /** 设置会话档位：切档整体替换预设规则；confirm-each / plan 无预设行（不改审批语义） */
  setPreset(sessionId: SessionId, preset: PermissionPreset): void {
    if (preset === 'confirm-each') {
      this.presets.delete(sessionId)
      return
    }
    this.presets.set(sessionId, preset)
  }

  /** 当前档位（无记录 = confirm-each 缺省档） */
  presetOf(sessionId: SessionId): PermissionPreset {
    return this.presets.get(sessionId) ?? 'confirm-each'
  }

  /**
   * 档位 → 预设规则（派生，不落盘）。排在会话 always 规则之后（findLast：
   * 档位是用户最新意图，与 always 写入同位的临时层语义）。
   * - auto-edit：仅 fs.write（write/edit 同 action）预置 allow，其余照旧；
   * - full-access：内置五 action 全量 allow（fs.read/fs.write/shell.exec/
   *   agent.task/mcp.call）；用户/项目显式规则仍在其前，但档位行更靠后——
   *   选此档即明示放行（UI 以 warn 琥珀警示，DESIGN §13.E）。
   */
  private presetRulesOf(sid: SessionId): readonly PermissionRule[] {
    return PRESET_RULES[this.presetOf(sid)]
  }
}

/** 各档位的预设行（const 派生表；plan/confirm-each 无行） */
const PRESET_RULES: Record<PermissionPreset, readonly PermissionRule[]> = {
  'confirm-each': [],
  'auto-edit': [{ action: 'fs.write', resource: '**', effect: 'allow' }],
  plan: [],
  'full-access': ['fs.read', 'fs.write', 'shell.exec', 'agent.task', 'mcp.call'].map(
    (action) => ({ action, resource: '**', effect: 'allow' as const }),
  ),
}
