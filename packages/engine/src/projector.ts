/**
 * Projector（doc/02 §5.8.3）：surface 事件 → 模型上下文投影（六步算法）。
 *
 * 1. path = tree.pathToRoot()（v1 线性追加：leaf 恒为最新；端口无参——§5.5 runStep ②
 *    调用时树即当前态）
 * 2/3. 有最新 compaction.completed → 上下文 = [摘要消息] + 路径上锚点事件
 *    （keptFromEventId，含）之后的 surface 事件（§5.8.5：fork 后路径序≠文件行序，
 *    锚定事件 id 而非 seq）；4. 无 → 全部 surface 事件
 * 5. 投影：user.message → user 消息；assistant.message → assistant 消息
 *    （content 逐字直通——dsh "framing is caller-owned"，投影层禁止二次加工）；
 *    reasoning 项按 provider 配置保留（Anthropic thinking 块）或丢弃；
 *    空 content 的 assistant.message 不进转录（dsh：仅承载 usage 的 max-tokens step）
 * 6. 字符近似 token 估算（文本/结构项序列化长度 / 4）
 *
 * 摘要消息形状：system 走 StreamRequest 独立字段（v2.7），摘要作首条 user 消息
 * （§5.8.5 注：与 pi buildContextEntries 的"摘要条目"互证）。
 */
import type { ContentItem, EventId, SparkEventEnvelope, SparkEventType } from '@spark/protocol'
import type { LlmMessage } from './llm-gateway.js'
import type { Projector } from './run-loop.js'
import type { EventTree } from './session/tree.js'

/** 事件类型守卫：收窄 e.data（联合信封的 type 判别不自动传播到 data） */
function isOfType<K extends SparkEventType>(
  e: SparkEventEnvelope,
  type: K,
): e is SparkEventEnvelope<K> {
  return e.type === type
}

export interface ProjectorDeps {
  tree: EventTree
  /** §5.8.3 第 5 步 provider 配置：Anthropic thinking 块保留，其他丢弃 */
  includeReasoning: boolean
  /** 悬空锚点告警（§5.8.5 数据损坏兜底被触发时调用；实现方落结构化日志） */
  onDanglingAnchor?: (anchorId: EventId) => void
}

/** §5.8.3 第 5 步：reasoning 投影的 provider 判定（Anthropic thinking 块 / 其他丢弃） */
export function reasoningIncluded(provider: string): boolean {
  return provider === 'anthropic'
}

/** surface 投影条目（eventId 供 compaction 计算 keptFromEventId，§5.8.5） */
export interface SurfaceEntry {
  eventId: EventId
  message: LlmMessage
}

export interface Projection {
  /** 最新 compaction 摘要；无压缩时 undefined */
  summary: string | undefined
  /** 锚点之后的 surface 投影条目（root → leaf 序） */
  entries: SurfaceEntry[]
}

/** 路径上最新 compaction.completed（锚点）；从 leaf 端回扫 */
function latestCompaction(
  path: readonly SparkEventEnvelope[],
): SparkEventEnvelope<'compaction.completed'> | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    const e = path[i]
    if (e !== undefined && isOfType(e, 'compaction.completed')) return e
  }
  return undefined
}

/** content 逐字直通；includeReasoning=false 时滤除 reasoning 项 */
function projectContent(content: readonly ContentItem[], includeReasoning: boolean): ContentItem[] {
  if (includeReasoning) return [...content]
  return content.filter((item) => item.type !== 'reasoning')
}

/** 单条消息字符近似 token：text/reasoning 取文本长度，结构项取 JSON 长度 */
function messageTokens(m: LlmMessage): number {
  let chars = 0
  for (const item of m.content) {
    chars +=
      item.type === 'text' || item.type === 'reasoning'
        ? item.text.length
        : JSON.stringify(item).length
  }
  return Math.ceil(chars / 4)
}

/** §5.8.3 第 6 步：字符近似 token 估算（run-loop 压缩触发判据） */
export function estimateTokens(messages: readonly LlmMessage[]): number {
  return messages.reduce((acc, m) => acc + messageTokens(m), 0)
}

/**
 * 六步算法主体（Compactor 复用同一锚点语义）。
 * 锚点定位：keptFromEventId 在路径中的位置（含该事件）之后全部保留——
 * 与 seq 比较不同，路径序与文件行序解耦后依然正确（§5.8.5 分支隐患修复）。
 */
export function projectSurface(
  tree: EventTree,
  includeReasoning: boolean,
  onDanglingAnchor?: (anchorId: EventId) => void,
): Projection {
  const path = tree.pathToRoot()
  const anchor = latestCompaction(path)
  let start = 0
  if (anchor !== undefined) {
    const pos = path.findIndex((e) => e.id === anchor.data.keptFromEventId)
    if (pos < 0) onDanglingAnchor?.(anchor.data.keptFromEventId)
    // 锚点事件不在路径（数据损坏的兜底）：退化为无压缩全量投影（调用方落结构化
    // warning）；超限上下文会被 run-loop 触发判据再次压缩，自愈而非丢数据
    start = pos >= 0 ? pos : 0
  }
  const entries: SurfaceEntry[] = []
  for (let i = start; i < path.length; i++) {
    const e = path[i]
    if (e === undefined) continue
    if (isOfType(e, 'user.message')) {
      entries.push({ eventId: e.id, message: { role: 'user', content: [{ type: 'text', text: e.data.text }] } })
    } else if (isOfType(e, 'assistant.message')) {
      const content = projectContent(e.data.content, includeReasoning)
      if (content.length === 0) continue // 空内容/全滤空不进转录（dsh 规则）
      entries.push({ eventId: e.id, message: { role: 'assistant', content } })
    }
  }
  return { summary: anchor?.data.summary, entries }
}

export class ProjectorImpl implements Projector {
  /** 已告警过的悬空锚点（modelContext 高频调用——同一锚点只报一次防刷屏） */
  private readonly danglingWarned = new Set<EventId>()

  constructor(private readonly deps: ProjectorDeps) {}

  modelContext(): { messages: LlmMessage[]; tokens: number } {
    const p = projectSurface(this.deps.tree, this.deps.includeReasoning, (anchorId) => {
      if (this.danglingWarned.has(anchorId)) return
      this.danglingWarned.add(anchorId)
      this.deps.onDanglingAnchor?.(anchorId)
    })
    const messages: LlmMessage[] = []
    if (p.summary !== undefined) {
      messages.push({ role: 'user', content: [{ type: 'text', text: p.summary }] })
    }
    for (const entry of p.entries) messages.push(entry.message)
    return { messages, tokens: estimateTokens(messages) }
  }
}
