/**
 * DTO 装配（工单 14.4 / ADR D31 结论 4）：引擎侧数据 → 线上 DTO 的**纯映射函数单一来源**。
 *
 * 为什么住 engine 而不是 protocol：这些函数要读 engine 的 `SessionMeta`/`SessionTreeInfo`
 * 形状，而 protocol 的硬约束是**零依赖 engine**（AGENTS §1.1）——放 protocol 会倒转依赖。
 * engine 本来就是 DTO 的产地（`listModels(): ModelsDto`、`getSettings(): SettingsDto`、
 * `listCommands(): CommandDto[]` 等都在 engine），会话三件只是补齐同一层职责。
 *
 * 为什么必须单一来源：`apps/server` 的路由要用（HTTP 通道），`@spark/sdk` 的
 * InProcessTransport 也要用（进程内通道）——各写一份就是第三份拷贝，
 * 正是阶段十七抓到三例漂移的那类病（AGENTS §1.1）。
 *
 * 纯函数纪律：不读引擎实例、不出网、不落盘；状态由调用方显式传入（`statusOf` 的结果）。
 */
import type { SessionDto, SessionMetaDto, SparkEventEnvelope, TreeNodeDto } from '@spark/protocol'
import type { SessionMeta, SessionTreeInfo, SessionTreeNode } from './engine-types.js'

/** 引擎 SessionMeta + 实时状态 → 线上 meta DTO（doc/02 §4.5.1） */
export function sessionMetaDtoOf(meta: SessionMeta, status: SessionMetaDto['status']): SessionMetaDto {
  return {
    id: meta.id,
    title: meta.title,
    model: meta.model,
    cwd: meta.cwd,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    lastSeq: meta.lastSeq,
    status,
    // 工单 10.6：分支/档位真值透传（缺省不携带——前端禁假状态不渲染）
    ...(meta.branch !== undefined ? { branch: meta.branch } : {}),
    ...(meta.effort !== undefined ? { effort: meta.effort } : {}),
    // 工单 12.4：归档时刻透传（仅已归档携带）
    ...(meta.archivedAt !== undefined ? { archivedAt: meta.archivedAt } : {}),
  }
}

/**
 * meta + 事件页 → 完整 SessionDto（GET /api/sessions/:id 与 InProcess `getSession` 共用）。
 * events 的**分页由调用方做**（before 游标过滤 + limit 尾部切片，doc/02 §4.5 工单 9.3）——
 * 本函数只装配，不含分页策略。
 */
export function sessionDtoOf(
  meta: SessionMeta,
  status: SessionMetaDto['status'],
  events: readonly SparkEventEnvelope[],
): SessionDto {
  return { ...sessionMetaDtoOf(meta, status), events: [...events] }
}

/** 事件渲染摘要（树视图 label，doc/02 §5.8.6）：按类型取关键字段，截 60 字符；无文本事件为空串 */
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
export function sessionTreeToDto(tree: SessionTreeInfo): TreeNodeDto[] {
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
  const toNode = (n: SessionTreeNode): TreeNodeDto => ({
    id: n.event.id,
    parentId: n.parentId,
    seq: n.event.seq ?? 0,
    type: n.event.type,
    time: n.event.time,
    label: labelOf(n.event),
    childIds: n.childIds,
    forks: forksByEvent.get(n.event.id) ?? [],
  })
  return tree.nodes.map(toNode)
}
