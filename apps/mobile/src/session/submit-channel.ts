/**
 * 提交通道装饰器（工单 19.27 的 SubmitOutcome 半边）。
 *
 * 为什么在端侧：会话页状态机在 protocol `session-page.ts`（四端共享核），它的
 * `send(text)` 调的是 `transport.sendMessage(sid, text)` ——不带 delivery、不回报
 * SubmitOutcome。移动端的排队语义（started/steered/queued 提示 + 运行中 steer/queue
 * 档 + steer 目标轮校验）需要这两样。改法有两条：
 * ① 改 protocol 的 `send(text, opts)` 返回 SubmitOutcome（四端同批受益，正解）；
 * ② 端侧包一层 REST 适配器（本文件）——状态机仍只在 protocol 一份，这里只做
 *   "注入提交档 + 把返回值交给端侧呈现"，不复制任何连接/回放/去重逻辑。
 * 本单不许动 protocol，故走 ②；① 已登记在 19.27 报告（miniapp 落地时应一并迁）。
 */
import type {
  Delivery,
  PermissionReply,
  RequestId,
  SendMessageOptions,
  SessionId,
  SubmitOutcome,
  Transport,
  TurnId,
} from '@spark/protocol'

/** session-page controller 的 REST 子集（与 protocol SessionPageRest 的返回形状同源） */
export type SessionPageRestSlice = Pick<
  Transport,
  'getSession' | 'sendMessage' | 'interrupt' | 'replyPermission'
>

export interface SubmitPolicy {
  /** 当前提交档与 steer 目标轮（空闲恒 'now'；运行中 steer/queue——§6.2.2） */
  delivery: () => { mode: Delivery; expectedTurnId?: TurnId | undefined }
  /** SubmitOutcome 上报（端侧呈现"已开始/已插话/已排队"瞬态行） */
  report: (outcome: SubmitOutcome) => void
}

/**
 * 包一层 sendMessage：提交档由端侧策略给定，返回值交给策略上报。
 * 逐方法转发而不用 `{...transport}` 展开——HttpTransport 的方法在原型上，
 * 展开只会得到一个丢了方法的空壳。
 */
export function createSubmitRest(
  transport: SessionPageRestSlice | null,
  policy: SubmitPolicy,
): SessionPageRestSlice | null {
  if (transport === null) return null
  return {
    getSession: (sessionId, query) => transport.getSession(sessionId, query),
    interrupt: (sessionId) => transport.interrupt(sessionId),
    replyPermission: (requestId: RequestId, reply: PermissionReply, feedback?: string, scope?) =>
      transport.replyPermission(requestId, reply, feedback, scope),
    sendMessage: (sessionId: SessionId, text: string, opts?: SendMessageOptions) => {
      const { mode, expectedTurnId } = policy.delivery()
      return transport
        .sendMessage(sessionId, text, {
          ...opts,
          delivery: mode,
          ...(expectedTurnId !== undefined ? { expectedTurnId } : {}),
        })
        .then((outcome) => {
          policy.report(outcome)
          return outcome
        })
    },
  }
}

/** 三态人话（与 web Composer 的 OUTCOME_TEXT 同表——文案下沉 protocol ui-copy 待对账，见 19.27 报告） */
export const OUTCOME_TEXT: Record<SubmitOutcome['result'], string> = {
  started: '已开始本轮',
  steered: '已插话注入当前轮',
  queued: '已排队（下一轮执行）',
}

/**
 * 运行中的占位文案切换（J.2.1 Composer 胶囊）：空闲提示写消息，运行中按提交档
 * 说明这条消息会怎么被处置——排队语义的常驻面（提示行是瞬态面）。
 */
export function composerPlaceholder(running: boolean, delivery: Delivery): string {
  if (!running) return '描述你的任务…'
  return delivery === 'queue'
    ? '排队发送：当前轮结束后作为新轮执行'
    : '插话注入：当前轮立刻读到这句'
}
