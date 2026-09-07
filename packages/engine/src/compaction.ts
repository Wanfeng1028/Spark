/**
 * 压缩（doc/02 §5.8.5）：emit compaction.started → generateOnce 生成摘要 →
 * keptFromEventId（尾部 token 预算反推；§5.8.5 分支隐患修复——fork 后路径序≠
 * 文件行序，锚定事件 id 而非 seq）→ emit compaction.completed。
 * 旧事件不删（append-only）；此后 Projector 按 §5.8.3 锚点分支自动生效。
 *
 * 失败语义：generateOnce 抛错 → emit error{scope:'llm'} 后正常返回——压缩是
 * 优化路径，失败不杀 turn，旧上下文继续可用；started 无 completed 配对属
 * 预期形态（投影只认 completed 锚点；UI 由 started + error 还原"压缩中失败"）。
 * 压缩调用本身的 usage 不计入会话 usage（§5.8.5 v1 口径——compactor 不触碰
 * turn.usage 即达成）。
 */
import type { EventId, SessionId, SparkEventEnvelope, SparkEventType } from '@spark/protocol'
import { errText } from './errs.js'
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

/** §5.11 辅助提示词：压缩（maxTokens 2000 经 OnceRequest 传递）。
 * 工单 13.3：作为**缺省模板**——spark.json `prompts.compaction` 可指向模板文件覆盖，
 * 覆盖值经 CompactorDeps.prompt 以已渲染文本传入（未配置时逐字节等于本常量）。
 * 工单 13.4 / ADR D29 第一层：尾部追加 kept-files 结构化要求（自定义模板不含该要求时
 * = 无清单，压缩照常——解析是 fail-soft 的）。 */
export const COMPACTION_PROMPT =
  'Summarize the conversation so far so work can continue with this summary alone. ' +
  'Keep: goals, key decisions, current task state, open TODOs, important file paths. ' +
  'Reply with the summary only. ' +
  'Then append exactly one final line listing the files whose current content matters for ' +
  'continuing, in this exact form: <!-- kept-files: ["src/a.ts","doc/b.md"] --> ' +
  '(empty array if none; no other markup).'

/** 蒸馏提示词（工单 13.4 / D29 第二层）。**未纳入 13.3 的三键可配面**——要可配另立工单
 * （doc/02 §5.11 可配性表已注明）；走 compactionModel 路由档（已有廉价辅助通道）。 */
export const DISTILL_PROMPT =
  'Condense the following tool output into the facts needed to continue the task. ' +
  'Keep: file paths, identifiers, numbers, error codes, and any constraint the output states. ' +
  'Drop: boilerplate, repeated lines, and formatting. Reply with the condensed notes only.'

/** 蒸馏阈值：序列化后超 4KB 的工具输出才蒸馏（工单 13.4 产出③）——字符近似口径 */
const DISTILL_MIN_CHARS = 4 * 1024
/** 单次压缩最多蒸馏条数（成本护栏：每条一次 generateOnce） */
const DISTILL_MAX_ITEMS = 8
/** 蒸馏输出 maxTokens（要点而非重写；与压缩 2000 / 标题 50 区分） */
const DISTILL_MAX_TOKENS = 500
/** 保留文件清单上限（防模型吐超长清单把摘要消息撑爆） */
const KEPT_FILES_MAX = 50

/** kept-files 标记（工单 13.4）：取最后一处（模型可能在正文里复述格式） */
const KEPT_FILES_RE = /<!--\s*kept-files:\s*(\[[\s\S]*?\])\s*-->/g

export interface KeptFilesParse {
  /** 剥离标记后的摘要正文（无标记时原样） */
  summary: string
  /** 解析成功且非空时的清单；否则不携带（禁空数组充数） */
  keptFiles?: string[]
  /** 标记存在但内容不可解析时的原因（调用方落结构化 warn——不静默） */
  invalid?: string
}

/**
 * 解析并剥离摘要尾部的 kept-files 标记（工单 13.4 / D29 第一层）。
 * fail-soft：标记缺失 = 无清单；标记坏（JSON 不合法/不是数组）= 剥离标记 + 报 invalid，
 * 摘要照常可用——压缩不因清单解析失败而失败（失败闭合的是 turn，不是这个可选增强）。
 * 非字符串条目静默丢弃（模型输出宽容；全部丢弃 = 无清单）。
 */
export function parseKeptFiles(raw: string): KeptFilesParse {
  const matches = [...raw.matchAll(KEPT_FILES_RE)]
  const last = matches[matches.length - 1]
  if (last === undefined) return { summary: raw }
  const cut = (raw.slice(0, last.index) + raw.slice(last.index + last[0].length)).trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(last[1] ?? '[]')
  } catch {
    return { summary: cut, invalid: 'kept-files 不是合法 JSON' }
  }
  if (!Array.isArray(parsed)) return { summary: cut, invalid: 'kept-files 不是数组' }
  const files: string[] = []
  for (const item of parsed) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (trimmed !== '' && !files.includes(trimmed)) files.push(trimmed)
  }
  if (files.length === 0) return { summary: cut }
  return { summary: cut, keptFiles: files.slice(0, KEPT_FILES_MAX) }
}

export interface CompactorDeps {
  sessionId: SessionId
  bus: EventBus
  gateway: LlmGateway
  /** 压缩提示词（工单 13.3：可配模板的渲染结果；缺省 = COMPACTION_PROMPT）。
   * 用 thunk 而非字符串：每次压缩现渲染，{{model}} 跟随路由档热变不落假状态 */
  prompt?: () => string
  /** 结构化告警出口（工单 13.4：蒸馏失败 / kept-files 标记坏）——形状同 skills/mcp loader */
  logger?: { warn(msg: string, fields?: Record<string, unknown>): void }
  /** 被压缩上下文的投影（摘要输入与 tokensBefore 来源） */
  projector: Projector
  tree: EventTree
  /** compactionModel（config.models.compactionModel 解析产物） */
  model: ResolvedModel
  /** 保留尾部的 token 预算（§5.8.5 "N 由 token 预算反推"；装配层建议 threshold×contextWindow/2） */
  keepTokens: number
}

/** 投影消息 → 纯文本转录（generateOnce 单 prompt；结构项 JSON 序列化；标题生成复用） */
export function serializeTranscript(messages: readonly LlmMessage[]): string {
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
      const raw = await this.deps.gateway.generateOnce({
        model: this.deps.model,
        prompt: `${this.deps.prompt?.() ?? COMPACTION_PROMPT}\n\n${serializeTranscript(ctx.messages)}`,
        maxTokens: 2000,
      })
      // 第一层（工单 13.4 / D29）：摘要尾部 kept-files 标记 → 结构化清单（标记从摘要剥离）
      const parsed = parseKeptFiles(raw)
      if (parsed.invalid !== undefined) {
        this.deps.logger?.warn('compaction.kept_files.invalid', { sid, reason: parsed.invalid })
      }
      const keptFromEventId = this.computeKeptFromEventId()
      // 第二层：锚点后超限工具输出蒸馏（逐条失败降级为原文，不推翻压缩）
      const distilled = await this.distillKeptOutputs(keptFromEventId)
      await this.deps.bus.emit(sid, 'compaction.completed', {
        summary: parsed.summary,
        keptFromEventId,
        tokensBefore: ctx.tokens,
        ...(parsed.keptFiles !== undefined ? { keptFiles: parsed.keptFiles } : {}),
        ...(distilled !== undefined ? { distilled } : {}),
      })
    } catch (err) {
      const message = errText(err)
      await this.deps.bus.emit(sid, 'error', {
        scope: 'llm',
        message: `E_LLM_COMPACTION: ${message}`,
      })
    }
  }

  /**
   * 第二层蒸馏（工单 13.4 / ADR D29）：锚点（含）之后的 assistant.message 里超 4KB 的
   * toolResult 输出（工具输出经 run-loop 以 toolResult 项回填进 assistant.message——那才是
   * 模型可见面；tool.completed 只是同源日志），逐条经辅助通道蒸馏成要点。
   * 单次压缩上限 DISTILL_MAX_ITEMS 条（成本护栏）；单条失败 → 结构化 warn + 不入表
   * （投影层原样透传原文，pipeline 的 32KB 限界已生效）——压缩不因蒸馏失败而失败。
   * 蒸馏结果进 compaction.completed（durable）：模型可见的替换文本必被记录（surface 纪律）。
   */
  private async distillKeptOutputs(
    anchorId: EventId,
  ): Promise<Record<string, string> | undefined> {
    const path = this.deps.tree.pathToRoot()
    const start = path.findIndex((e) => e.id === anchorId)
    // 锚点不在路径（数据损坏兜底同投影层）：不蒸馏也不自创边界
    if (start < 0) return undefined
    const targets: Array<{ callId: string; text: string }> = []
    for (let i = start; i < path.length && targets.length < DISTILL_MAX_ITEMS; i++) {
      const e = path[i]
      if (e === undefined || !isOfType(e, 'assistant.message')) continue
      for (const item of e.data.content) {
        if (item.type !== 'toolResult') continue
        const text =
          typeof item.output === 'string' ? item.output : (JSON.stringify(item.output) ?? '')
        if (text.length <= DISTILL_MIN_CHARS) continue
        targets.push({ callId: item.callId, text })
        if (targets.length >= DISTILL_MAX_ITEMS) break
      }
    }
    if (targets.length === 0) return undefined
    const out: Record<string, string> = {}
    for (const t of targets) {
      try {
        const notes = (
          await this.deps.gateway.generateOnce({
            model: this.deps.model,
            prompt: `${DISTILL_PROMPT}\n\n${t.text}`,
            maxTokens: DISTILL_MAX_TOKENS,
          })
        ).trim()
        if (notes !== '') out[t.callId] = notes
      } catch (err) {
        this.deps.logger?.warn('compaction.distill.failed', {
          sid: this.deps.sessionId,
          callId: t.callId,
          err: errText(err),
        })
      }
    }
    return Object.keys(out).length > 0 ? out : undefined
  }

  /**
   * keptFromEventId = 当前上下文尾部（token 预算内）最老 surface 事件的 id。
   * 最新一条无条件保留（不得把当前上下文全部摘要掉）；边界不越过旧锚点
   * （越过会复活已被上一轮摘要的事件）。
   */
  private computeKeptFromEventId(): EventId {
    const path = this.deps.tree.pathToRoot()
    // 旧锚点位置：新边界不得越过（已摘要事件不复活）
    let start = 0
    for (let i = path.length - 1; i >= 0; i--) {
      const e = path[i]
      if (e !== undefined && isOfType(e, 'compaction.completed')) {
        const pos = path.findIndex((p) => p.id === e.data.keptFromEventId)
        if (pos >= 0) start = pos
        break
      }
    }
    // 尾部预算反推：从 leaf 端收 surface 事件，预算耗尽即停；
    // 无 surface 事件时边界即旧锚点位置（与"无新内容可保"语义一致）
    let boundary = start
    let acc = 0
    let keptAny = false
    for (let i = path.length - 1; i >= start; i--) {
      const e = path[i]
      if (e === undefined || !isSurface(e)) continue
      const t = eventTokens(e)
      if (keptAny && acc + t > this.deps.keepTokens) break
      acc += t
      keptAny = true
      boundary = i
    }
    const anchor = path[boundary]
    if (anchor === undefined) {
      // 空路径（零事件会话手动压缩）：走 error 事件失败闭合
      throw new Error('E_COMPACTION_EMPTY_PATH')
    }
    return anchor.id
  }
}
