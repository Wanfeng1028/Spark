/**
 * 压缩（doc/02 §5.8.5）：emit compaction.started → generateOnce 生成摘要 →
 * keptFromSeq（尾部 token 预算反推）→ emit compaction.completed。
 * 旧事件不删（append-only）；此后 Projector 按 §5.8.3 锚点分支自动生效。
 *
 * 失败语义：generateOnce 抛错 → emit error{scope:'llm'} 后正常返回——压缩是
 * 优化路径，失败不杀 turn，旧上下文继续可用；started 无 completed 配对属
 * 预期形态（投影只认 completed 锚点；UI 由 started + error 还原"压缩中失败"）。
 * 压缩调用本身的 usage 不计入会话 usage（§5.8.5 v1 口径——compactor 不触碰
 * turn.usage 即达成）。
 */
import type { SessionId, SparkEventEnvelope, SparkEventType } from '@spark/protocol'
import type { EventBus } from './bus.js'
import type { LlmGateway, LlmMessage, ResolvedModel } from './llm-gateway.js'
import type { Compactor, Projector } from './run-loop.js'
import type { EventTree } from './session/tree.js'

/** 事件类型守卫：收窄 e.data（联合信封的 type 判别不自动传播到 data） */
function isOfType<K extends SparkEventType>(
  e: SparkEventEnvelope,
  type: K,
): e is SparkEventEnvelope<K> {
  return e.type === type
}

/** §5.11 辅助提示词：压缩（maxTokens 2000 经 OnceRequest 传递） */
export const COMPACTION_PROMPT =
  'Summarize the conversation so far so work can continue with this summary alone. ' +
  'Keep: goals, key decisions, current task state, open TODOs, important file paths. ' +
  'Reply with the summary only.'

export interface CompactorDeps {
  sessionId: SessionId
  bus: EventBus
  gateway: LlmGateway
  /** 被压缩上下文的投影（摘要输入与 tokensBefore 来源） */
  projector: Projector
  tree: EventTree
  /** compactionModel（config.models.compactionModel 解析产物） */
  model: ResolvedModel
  /** 保留尾部的 token 预算（§5.8.5 "N 由 token 预算反推"；装配层建议 threshold×contextWindow/2） */
  keepTokens: number
}

/** 投影消息 → 纯文本转录（generateOnce 单 prompt；结构项 JSON 序列化） */
function serializeTranscript(messages: readonly LlmMessage[]): string {
  return messages
    .map((m) => {
      const parts = m.content.map((item) =>
        item.type === 'text' || item.type === 'reasoning' ? item.text : JSON.stringify(item),
      )
      return `${m.role}: ${parts.join('\n')}`
    })
    .join('\n\n')
}

/** surface 事件字符近似 token（data 序列化长度 / 4；与投影估算同一量级，仅定保留边界） */
function eventTokens(e: SparkEventEnvelope): number {
  return Math.ceil(JSON.stringify(e.data).length / 4)
}

function isSurface(e: SparkEventEnvelope): boolean {
  return isOfType(e, 'user.message') || isOfType(e, 'assistant.message')
}

export class CompactorImpl implements Compactor {
  constructor(private readonly deps: CompactorDeps) {}

  async compact(): Promise<void> {
    const sid = this.deps.sessionId
    await this.deps.bus.emit(sid, 'compaction.started', {})
    const ctx = this.deps.projector.modelContext()
    try {
      const summary = await this.deps.gateway.generateOnce({
        model: this.deps.model,
        prompt: `${COMPACTION_PROMPT}\n\n${serializeTranscript(ctx.messages)}`,
        maxTokens: 2000,
      })
      const keptFromSeq = this.computeKeptFromSeq()
      await this.deps.bus.emit(sid, 'compaction.completed', {
        summary,
        keptFromSeq,
        tokensBefore: ctx.tokens,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.deps.bus.emit(sid, 'error', {
        scope: 'llm',
        message: `E_LLM_COMPACTION: ${message}`,
      })
    }
  }

  /**
   * keptFromSeq = 当前上下文尾部（token 预算内）最老 surface 事件的 seq。
   * 最新一条无条件保留（不得把当前上下文全部摘要掉）；边界不越过旧锚点
   * （越过会复活已被上一轮摘要的事件）。
   */
  private computeKeptFromSeq(): number {
    const path = this.deps.tree.pathToRoot()
    let anchorSeq = 0
    for (let i = path.length - 1; i >= 0; i--) {
      const e = path[i]
      if (e !== undefined && isOfType(e, 'compaction.completed')) {
        anchorSeq = e.data.keptFromSeq
        break
      }
    }
    const surface = path.filter((e) => isSurface(e) && (e.seq ?? 0) >= anchorSeq)
    if (surface.length === 0) return anchorSeq

    const last = surface[surface.length - 1]
    if (last === undefined) return anchorSeq
    let acc = eventTokens(last)
    let boundary = last.seq ?? 0
    for (let i = surface.length - 2; i >= 0; i--) {
      const e = surface[i]
      if (e === undefined) break
      const t = eventTokens(e)
      if (acc + t > this.deps.keepTokens) break
      acc += t
      boundary = e.seq ?? 0
    }
    return boundary
  }
}
