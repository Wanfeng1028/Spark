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
  /** ZC-2：工具声明的 alwaysAsk 标记（管线从 ToolDefinition.permission.alwaysAsk 求值传入）——
   *  策略层判 allow 时压制为 ask 一次；用户/会话层显式 allow 可压制，项目级 deny 不可压制。 */
  alwaysAsk?: boolean
  /** CK-17 批 2：工具声明的风险档（管线从 def.safety.riskLevel 透传）——
   *  high 时审批 reason 附加风险提示；未声明/低中档不加（防噪声）。 */
  riskLevel?: 'low' | 'medium' | 'high'
  /** CK-2 批 2 ④：会话工作目录（permission.request hook 的 spawn cwd；管线传入） */
  cwd?: string
  signal: AbortSignal
}

export interface PermissionService {
  /** allow → true；deny / 超时 / turn 中断 → false（一律 fail-closed） */
  assert(check: PermissionCheck): Promise<boolean>
  /** 全域 deny 的 action 不进广告清单（§5.7 补强 5） */
  isDenied(action: string): boolean
}
