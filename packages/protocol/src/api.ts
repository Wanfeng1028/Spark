/**
 * HTTP API DTO（doc/02 §4.5.1）——SessionMeta 的线上形状。
 */
import { z } from 'zod'
import { CheckpointIdSchema, EventIdSchema, SessionIdSchema, TurnIdSchema } from './ids.js'
import type { SparkEventEnvelope } from './events.js'
import type { TurnId } from './ids.js'

export const SessionStatusSchema = z.enum(['idle', 'running', 'waiting-approval'])
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const SessionMetaDtoSchema = z.strictObject({
  id: SessionIdSchema,
  title: z.string(), // 空字符串 = 前端显示"新会话"（自动标题阶段四）
  model: z.string(), // provider/model 形式
  cwd: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(), // = 最近 durable 事件 time（列表排序键）
  lastSeq: z.number().int().nonnegative(),
  status: SessionStatusSchema, // 引擎从 SessionRuntime 实时填充
})
export type SessionMetaDto = z.infer<typeof SessionMetaDtoSchema>

/** 仅 GET /api/sessions/:id 携带 events（全部 durable 按 seq 升序——冷启动回放） */
export interface SessionDto extends SessionMetaDto {
  events?: SparkEventEnvelope[]
}

/** POST /:id/messages 响应：三态直通（HTTP 只表达"已受理"，不等 turn 结果） */
export interface SubmitResult {
  result: 'started' | 'steered' | 'queued'
  turnId?: TurnId
}

// ---------- fork 与树视图（doc/02 §5.8.6 / §4.5，阶段四） ----------

/** 从某事件分叉出去的子会话（engine 扫描磁盘 header.parentSession 汇总） */
export const ForkChildDtoSchema = z.strictObject({
  sessionId: SessionIdSchema,
  title: z.string(), // 空字符串 = 新会话
  createdAt: z.number().int().nonnegative(),
})
export type ForkChildDto = z.infer<typeof ForkChildDtoSchema>

/** GET /api/sessions/:id/tree 节点：label 为渲染摘要（截断文本；无摘要事件为空串） */
export const TreeNodeDtoSchema = z.strictObject({
  id: EventIdSchema,
  parentId: EventIdSchema.nullable(),
  seq: z.number().int().positive(),
  type: z.string(), // SparkEventType（词表演进不改本 DTO 形状）
  time: z.number().int().nonnegative(),
  label: z.string(),
  /** 会话内子节点（v1 线性路径至多 1 个；分支树阶段二扩展） */
  childIds: z.array(EventIdSchema),
  /** 从此事件分叉出的子会话（树视图"已分叉"标记） */
  forks: z.array(ForkChildDtoSchema),
})
export type TreeNodeDto = z.infer<typeof TreeNodeDtoSchema>

// ---------- checkpoint（doc/02 §5.8.7 / 阶段四工单 4.6） ----------

/** GET /api/sessions/:id/checkpoints 行：turn 边界快照（files 含会话文件别名） */
export const CheckpointDtoSchema = z.strictObject({
  checkpointId: CheckpointIdSchema,
  turnId: TurnIdSchema,
  createdAt: z.number().int().nonnegative(),
  files: z.array(z.string()),
})
export type CheckpointDto = z.infer<typeof CheckpointDtoSchema>

// ---------- permission rules（doc/02 §5.7 规则表 / 阶段四工单 4.7） ----------

/** 权限规则（用户级 permissions.json 行；规则管理 UI 的线上形状） */
export const PermissionRuleDtoSchema = z.strictObject({
  action: z.string().min(1),
  resource: z.string().min(1),
  effect: z.enum(['allow', 'deny', 'ask']),
})
export type PermissionRuleDto = z.infer<typeof PermissionRuleDtoSchema>

// ---------- permission preset（DESIGN §13.E 权限四档 / ADR D7 补记，阶段六工单 6.3） ----------

/**
 * 会话级权限预设四档（规则引擎之上的预设层，不引入第二权限机制）：
 * - confirm-each 逐项确认（缺省档）：规则表不动；
 * - auto-edit 自动编辑：会话临时层对 fs.write 预置 allow；
 * - plan 计划模式：交互层约定（system prompt 追加计划指令），不改审批语义；
 * - full-access 完全访问：会话临时层批量预置 allow。
 * 会话内存态（临时层），引擎重启回 confirm-each。
 */
export const PermissionPresetSchema = z.enum(['confirm-each', 'auto-edit', 'plan', 'full-access'])
export type PermissionPreset = z.infer<typeof PermissionPresetSchema>
