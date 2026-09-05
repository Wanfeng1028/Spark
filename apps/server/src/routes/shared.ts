/**
 * 路由共享件（工单 R-F③ 域拆分）：RoutesOptions / toDto / requireHandle /
 * 各域 zod schema 常量集中地（域文件按需导入）。
 */
import { z } from 'zod'
import {
  CheckpointIdSchema,
  DeliverySchema,
  EventIdSchema,
  PermissionReplySchema,
  PermissionPresetSchema,
  ReasoningEffortSchema,
  RequestIdSchema,
  SessionIdSchema,
  TurnIdSchema,
} from '@spark/protocol'
import type {
  SessionMetaDto,
  SessionId,
  SparkEventEnvelope,
  TreeNodeDto,
} from '@spark/protocol'
import type { SessionTreeInfo, SessionTreeNode } from '@spark/engine'
import type { Engine, SessionHandle, SessionMeta } from '@spark/engine'

export { DeliverySchema, TurnIdSchema } from '@spark/protocol'

export interface RoutesOptions {
  engine: Engine
}

/** 引擎 SessionMeta + 实时状态 → 线上 DTO（§4.5.1） */
export function toDto(engine: Engine, meta: SessionMeta): SessionMetaDto {
  return {
    id: meta.id,
    title: meta.title,
    model: meta.model,
    cwd: meta.cwd,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    lastSeq: meta.lastSeq,
    status: engine.statusOf(meta.id),
    // 工单 10.6：分支/档位真值透传（缺省不携带——前端禁假状态不渲染）
    ...(meta.branch !== undefined ? { branch: meta.branch } : {}),
    ...(meta.effort !== undefined ? { effort: meta.effort } : {}),
    // 工单 12.4：归档时刻透传（仅已归档携带）
    ...(meta.archivedAt !== undefined ? { archivedAt: meta.archivedAt } : {}),
  }
}

/** :id 路由通用入口：已加载直接用，未加载先 resumeSession（§7.2 GET 规格） */
export async function requireHandle(engine: Engine, id: SessionId): Promise<SessionHandle> {
  return engine.getSession(id) ?? engine.resumeSession(id)
}


export const CreateSessionBody = z.strictObject({
  title: z.string().optional(),
  model: z.string().optional(),
  cwd: z.string().optional(),
})

export const ArchiveBody = z.strictObject({ archived: z.boolean() })

/** 工单 12.4：DELETE 需显式 confirm: true（防误删——两层护栏的第一层） */
export const DeleteSessionBody = z.strictObject({ confirm: z.literal(true) })

export const ListSessionsQuery = z.object({
  limit: z.coerce.number().int().positive().default(50),
  cursor: SessionIdSchema.optional(),
  /** 工单 12.4：archived=true 只列已归档（缺省排除） */
  archived: z.coerce.boolean().optional(),
})

/**
 * GET /api/sessions/:id 事件分页查询（工单 9.3）：全可选——缺省 = 全量回放（向后兼容红线）。
 * limit 升序尾部切片（上限 200）；before = seq 游标（只返回 seq < before）。
 */
export const SessionDetailQuery = z.strictObject({
  limit: z.coerce.number().int().positive().max(200).optional(),
  before: z.coerce.number().int().positive().optional(),
})

export const SendMessageBody = z.strictObject({
  text: z.string().min(1),
  delivery: DeliverySchema.default('now'),
  expectedTurnId: TurnIdSchema.optional(),
})

export const ReplyBody = z.strictObject({
  reply: PermissionReplySchema,
  feedback: z.string().optional(),
})

export const IdParams = z.strictObject({ id: SessionIdSchema })
/** @ 文件路径补全目录列举上限（工单 10.53）：防大目录（node_modules 根）巨响应；目录优先字典序后截断 */
// 协议同形（原 routes.ts 直接 import @spark/protocol 的 FsQuerySchema——域拆分后改为
// 本地定义会漂移；此处 re-export 协议原件保持单一来源）
export { FsQuerySchema } from '@spark/protocol'

export const FS_LIST_LIMIT = 200
export const RequestIdParams = z.strictObject({ requestId: RequestIdSchema })
export const RollbackParams = z.strictObject({ id: SessionIdSchema, cid: CheckpointIdSchema })

export const ForkBody = z.strictObject({ fromEventId: EventIdSchema })

export const RemoveRuleBody = z.strictObject({ action: z.string().min(1), resource: z.string().min(1) })

/** 密钥仓（阶段七工单 7.1 / H01） */
export const SecretProviderParams = z.strictObject({ provider: z.string().min(1) })

export const SetSecretBody = z.strictObject({ value: z.string().min(1) })

/** 权限档位（DESIGN §13.E 四档 / D7 补记预设层，工单 6.3） */
export const PresetBody = z.strictObject({ preset: PermissionPresetSchema })

/** 模型管理（工单 6.5）：供应商连通测试参数 + 会话级换模型 body */
export const ProviderIdParams = z.strictObject({ providerId: z.string().min(1).max(64) })
export const SetModelBody = z.strictObject({ model: z.string().min(1) })

/** 推理档位（工单 10.6）：会话级换档 body */
export const SetEffortBody = z.strictObject({ effort: ReasoningEffortSchema })

/** 命令注册表（阶段七工单 7.4 / H04）：命令名与执行 body */
export const CommandNameParams = z.strictObject({
  id: SessionIdSchema,
  name: z.string().min(1).max(64),
})

/** 长期记忆（工单 7.5）：删除参数 */
export const MemoryIdParams = z.strictObject({ id: z.coerce.number().int().positive() })

/** 自动化触发器（工单 7.6）：触发器 id 路径 / 启停 body / 运行历史 limit */
export const AutomationIdParams = z.strictObject({ id: z.string().min(1) })
export const AutomationEnabledBody = z.strictObject({ enabled: z.boolean() })
export const AutomationRunsQuery = z.strictObject({
  limit: z.coerce.number().int().positive().max(500).optional(),
})

/** 审计日志（工单 7.12 / H11）：明细流查询（时间/决策/工具过滤器数据源） */
export const AuditQuery = z.strictObject({
  limit: z.coerce.number().int().positive().max(500).optional(),
  kind: z.enum(['permission.decision', 'permission.rule', 'session.rollback']).optional(),
  result: z.enum(['allow', 'deny', 'applied', 'ok']).optional(),
  tool: z.string().optional(),
  since: z.coerce.number().int().nonnegative().optional(),
})

/** 会话全文搜索（工单 7.13 / H12）：q 必填非空；limit 缺省 20 上限 100 */
export const SearchQuery = z.strictObject({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

/** 浏览器截图供图（工单 7.10 / H09）：文件名白名单形状校验在引擎侧 */
export const ArtifactParams = z.strictObject({ file: z.string().min(1) })

/** 事件渲染摘要（树视图 label，§5.8.6）：按类型取关键字段，截 60 字符；无文本事件为空串 */
function labelOf(e: SparkEventEnvelope): string {
  const data = e.data as Record<string, unknown>
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  let text = ''
  if (typeof data.text === 'string') text = data.text // user/assistant/reasoning 的 ended 终值
  else if (typeof data.title === 'string') text = data.title
  else if (typeof data.summary === 'string') text = data.summary
  else if (e.type === 'turn.started') text = 'turn 开始'
  else if (e.type === 'turn.completed') text = `turn 结束（${str(data.finish)}）`
  else if (e.type === 'tool.started') text = `工具 ${str(data.toolId)}`
  else if (e.type === 'permission.asked') text = `审批 ${str(data.requestId)}`
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

/** 引擎树数据 → 线上 DTO（forks 按边界事件归组到节点） */
export function treeToDto(tree: SessionTreeInfo): TreeNodeDto[] {
  const forksByEvent = new Map<string, TreeNodeDto['forks']>()
  for (const f of tree.forks) {
    const list = forksByEvent.get(f.fromEventId) ?? []
    list.push({
      sessionId: f.child.sessionId,
      title: f.child.title,
      createdAt: f.child.createdAt,
      status: f.child.status,
    })
    forksByEvent.set(f.fromEventId, list)
  }
  const toDto = (n: SessionTreeNode): TreeNodeDto => ({
    id: n.event.id,
    parentId: n.parentId,
    seq: n.event.seq ?? 0,
    type: n.event.type,
    time: n.event.time,
    label: labelOf(n.event),
    childIds: n.childIds,
    forks: forksByEvent.get(n.event.id) ?? [],
  })
  return tree.nodes.map(toDto)
}
