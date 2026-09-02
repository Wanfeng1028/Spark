/**
 * 品牌化 ID（doc/02 §4.1）：编译期防止普通字符串与各类 ID 混用。
 * 运行时校验 schema（§4.3.1）：前缀 + ULID/UUID 字符集。
 */
import { z } from 'zod'

declare const brand: unique symbol
export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type SessionId = Brand<string, 'SessionId'> // ses_<uuid>
export type TurnId = Brand<string, 'TurnId'> // trn_<ulid>
export type EventId = Brand<string, 'EventId'> // evt_<ulid>
/** 工具调用关联 id：引擎自产为 cal_<ulid>；上游模型返回的 id（OpenAI `call_xxx` 等）
 * 原样透传不重写——CallId 是不透明关联 token，只要求可回环匹配，不做前缀断言（工单 10.39：
 * 实测 stepfun 返回 `call_xxx` 被 cal_ 前缀闸门拒收，整条 assistant.message 落盘失败） */
export type CallId = Brand<string, 'CallId'>
export type RequestId = Brand<string, 'RequestId'> // req_<ulid>
export type CheckpointId = Brand<string, 'CheckpointId'> // ckp_<ulid>

const idOf = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[0-9A-Za-z]+$`))
const branded = <B>(schema: z.ZodType<string>): z.ZodType<B> => schema as unknown as z.ZodType<B>

export const SessionIdSchema = branded<SessionId>(idOf('ses'))
export const TurnIdSchema = branded<TurnId>(idOf('trn'))
export const EventIdSchema = branded<EventId>(idOf('evt'))
/** 不透明 token：引擎自产 cal_<ulid> 或上游原样（call_xxx / toolu_xxx 等），1..128 位 url-safe */
export const CallIdSchema = branded<CallId>(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/))
export const RequestIdSchema = branded<RequestId>(idOf('req'))
export const CheckpointIdSchema = branded<CheckpointId>(idOf('ckp'))

/** 构造器：引擎与测试内部使用；业务代码不得用裸字符串拼 ID */
export const ids = {
  session: (v: string): SessionId => v as SessionId,
  turn: (v: string): TurnId => v as TurnId,
  event: (v: string): EventId => v as EventId,
  call: (v: string): CallId => v as CallId,
  request: (v: string): RequestId => v as RequestId,
  checkpoint: (v: string): CheckpointId => v as CheckpointId,
}
