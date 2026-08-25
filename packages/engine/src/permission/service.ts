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
import type { PermissionReply, RequestId, SessionId } from '@spark/protocol'
import type { EventBus } from '../bus.js'
import type { PermissionRule } from '../config.js'
import { newIds } from '../ulid.js'
import type { PermissionCheck, PermissionService } from '../tools/permission-port.js'
import { evaluateAll } from './rules.js'
import type { RuleStore } from './store.js'
import type { Metrics } from '../observability/metrics.js'

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
  /** 进程内指标（§5.10；缺省不计数——测试可省，工单 4.8） */
  metrics?: Metrics
}

export class PermissionServiceImpl implements PermissionService {
  private readonly pending = new Map<RequestId, PendingEntry>()
  private readonly sessionRules = new Map<SessionId, PermissionRule[]>()

  constructor(private readonly deps: PermissionServiceDeps) {}

  async assert(check: PermissionCheck): Promise<boolean> {
    // fail-closed：请求已达时 turn 已中断
    if (check.signal.aborted) return false
    const effect = evaluateAll(
      check.action,
      check.patterns ?? [check.resource],
      this.deps.ruleStore.list(),
      this.deps.projectRules,
      this.sessionRulesOf(check.sessionId),
    )
    if (effect === 'allow') return true
    if (effect === 'deny') return false

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
      await this.deps.bus.emit(check.sessionId, 'permission.resolved', {
        requestId,
        reply: 'reject',
      })
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
          void this.settle(entry, false, 'reject')
        },
        timer: setTimeout(() => {
          void this.settle(entry, false, 'reject')
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
      await this.settle(entry, true, 'once')
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
      }
      await this.settle(entry, true, 'always')
      // 级联放行：各自会话规则下现在 evaluate=allow 的其他挂起项一并 resolve
      for (const other of [...this.pending.values()]) {
        if (
          evaluateAll(
            other.check.action,
            other.check.patterns ?? [other.check.resource],
            this.deps.ruleStore.list(),
            this.deps.projectRules,
            this.sessionRulesOf(other.sessionId),
          ) === 'allow'
        ) {
          await this.settle(other, true, 'always')
        }
      }
      return true
    }
    // reject：feedback 非空注入 user.message（surface）回喂模型（CorrectedError 思想）
    await this.settle(entry, false, 'reject', feedback)
    if (feedback !== undefined && feedback !== '') {
      await this.deps.bus.emit(entry.sessionId, 'user.message', { text: feedback })
    }
    // reject 级联：同会话其余挂起审批一并自动 reject（fail-closed 收敛，补强 2）
    for (const other of [...this.pending.values()]) {
      if (other.sessionId === entry.sessionId) {
        await this.settle(other, false, 'reject')
      }
    }
    return true
  }

  /** 引擎 shutdown 收尾：pending 非空 → 全部 resolve(deny)（§5.7 补强 7） */
  async dispose(): Promise<void> {
    for (const entry of [...this.pending.values()]) {
      await this.settle(entry, false, 'reject')
    }
  }

  /** 结清一项：resolved 事件 + 工具侧 resolve。落盘失败也必须闭合（finally） */
  private async settle(
    entry: PendingEntry,
    allowed: boolean,
    reply: PermissionReply,
    feedback?: string,
  ): Promise<void> {
    if (entry.settled) return
    entry.settled = true
    clearTimeout(entry.timer)
    entry.check.signal.removeEventListener('abort', entry.onAbort)
    this.pending.delete(entry.requestId)
    this.deps.metrics?.inc('spark_permission_decisions', { reply }) // 工单 4.8：once/always/reject 计数
    try {
      await this.deps.bus.emit(entry.sessionId, 'permission.resolved', {
        requestId: entry.requestId,
        reply,
        ...(feedback !== undefined && feedback !== '' ? { feedback } : {}),
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
}
