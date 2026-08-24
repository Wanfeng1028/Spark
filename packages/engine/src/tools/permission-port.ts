/**
 * 审批端口（doc/02 §5.7.2）：管线 ② verdict = PermissionService.assert(call)。
 * 真身在 permission/（工单 7）：evaluate → allow 直接过 / deny 返回 / ask 挂起
 * （emit permission.asked + 5min 定时器，fail-closed）。本端口只约定管线侧契约。
 */
import type { CallId, TurnId } from '@spark/protocol'

export interface PermissionCheck {
  callId: CallId
  turnId: TurnId
  /** 工具名（permission.asked 的事件关联） */
  name: string
  action: string
  resource: string
  input: unknown
}

export interface PermissionService {
  /** allow → true；deny / 超时 / turn 中断 → false（一律 fail-closed） */
  assert(check: PermissionCheck): Promise<boolean>
}
