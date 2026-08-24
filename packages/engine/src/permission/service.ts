/**
 * PermissionService（doc/02 §5.7.2）：ask 挂起表 + 事件时序 + fail-closed。
 *
 * - evaluate → allow 直接过 / deny 直接拒（均不发事件，事件由管线补）；
 * - ask → emit permission.asked（durable）+ Promise 挂入 pending 表；
 * - reply：once 放行一次；always 写入会话临时层（findLast 最高优先）并扫描
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
import { evaluate } from './rules.js'

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
  /** 用户级 ~/.spark/permissions.json 规则（EngineConfig.permissions.rules） */
  userRules: readonly PermissionRule[]
  /** 项目级 <cwd>/.spark/permissions.json 规则（loadProjectRules） */
  projectRules: readonly PermissionRule[]
  /** 审批超时（spark.json permissionTimeoutMs，缺省 5min） */
  timeoutMs: number
}

export class PermissionServiceImpl implements PermissionService {
  private readonly pending = new Map<RequestId, PendingEntry>()
  private readonly sessionRules = new Map<SessionId, PermissionRule[]>()

  constructor(private readonly deps: PermissionServiceDeps) {}

  async assert(check: PermissionCheck): Promise<boolean> {
    // fail-closed：请求已达时 turn 已中断
    if (check.signal.aborted) return false
    const effect = evaluate(
      check.action,
      check.resource,
      this.deps.userRules,
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
    return evaluate(action, '**', this.deps.userRules, this.deps.projectRules) === 'deny'
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
      this.sessionRulesOf(entry.sessionId).push({
        action: entry.check.action,
        resource: entry.check.resource,
        effect: 'allow',
      })
      await this.settle(entry, true, 'always')
      // 级联放行：各自会话规则下现在 evaluate=allow 的其他挂起项一并 resolve
      for (const other of [...this.pending.values()]) {
        if (
          evaluate(
            other.check.action,
            other.check.resource,
            this.deps.userRules,
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
