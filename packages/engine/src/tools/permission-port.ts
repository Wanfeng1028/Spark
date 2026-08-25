/**
 * 审批端口（doc/02 §5.7.2）：管线 ② verdict = PermissionService.assert(call)。
 * 真身在 permission/（工单 7）：evaluate → allow 直接过 / deny 返回 / ask 挂起
 * （emit permission.asked + 5min 定时器，fail-closed）。本端口只约定管线侧契约。
 */
import type { CallId, SessionId, TurnId } from '@spark/protocol'

export interface PermissionCheck {
  sessionId: SessionId
  callId: CallId
  turnId: TurnId
  /** 工具名（permission.asked 的事件关联） */
  name: string
  action: string
  resource: string
  /** 多 pattern 评估清单（§5.7 补强 1，工单 4.7）：复合命令等一次声明多个资源；缺省单资源 */
  patterns?: readonly string[]
  /** always 固化范围（补强 3）：缺省回落 patterns ?? [resource] */
  alwaysPatterns?: readonly string[]
  input: unknown
  /** turn 的中断信号：挂起期间 abort → 级联拒绝（fail-closed） */
  signal: AbortSignal
}

export interface PermissionService {
  /** allow → true；deny / 超时 / turn 中断 → false（一律 fail-closed） */
  assert(check: PermissionCheck): Promise<boolean>
  /** 全域 deny 的 action 不进广告清单（§5.7 补强 5） */
  isDenied(action: string): boolean
}
