/**
 * 会话自动标题（doc/02 §5.11 辅助提示词 / 阶段四工单 4.4）：首 turn 完成后
 * 异步 generateOnce → emit session.title。
 *
 * 失败语义：generateOnce 抛错向上传播（引擎层 catch 记日志）——标题是辅助
 * 路径，失败不 emit error（空标题不悬空任何 UI 状态），下一 turn.completed
 * 可重触发（引擎层 titleTask 在途去重）。
 */
import type { SessionId } from '@spark/protocol'
import type { EventBus } from './bus.js'
import type { LlmGateway, ResolvedModel } from './llm-gateway.js'
import type { Projector } from './run-loop.js'
import { serializeTranscript } from './compaction.js'

/** §5.11 辅助提示词：会话标题（首 turn 完成后异步触发） */
export const TITLE_PROMPT =
  'Generate a 3-6 word title for this conversation. Reply with the title only.'

/** 标题长度防线：3-6 词预期，模型失控长串截断（单行标题展示宽度） */
const TITLE_MAX_CHARS = 80

/** 标题生成 maxTokens（§5.11 辅助提示词短输出；与压缩 2000 区分） */
const TITLE_MAX_TOKENS = 50

export interface TitleGeneratorDeps {
  sessionId: SessionId
  bus: EventBus
  gateway: LlmGateway
  /** 当前模型上下文（转录来源；含 compaction 摘要时同样适用） */
  projector: Projector
  /** 辅助模型（复用 compactionModel——§5.11 辅助提示词同一廉价通道） */
  model: ResolvedModel
}

export class TitleGenerator {
  constructor(private readonly deps: TitleGeneratorDeps) {}

  /** 生成并 emit session.title；修剪后空串不发（保持"新会话"） */
  async generate(): Promise<void> {
    const ctx = this.deps.projector.modelContext()
    const raw = await this.deps.gateway.generateOnce({
      model: this.deps.model,
      prompt: `${TITLE_PROMPT}\n\n${serializeTranscript(ctx.messages)}`,
      maxTokens: TITLE_MAX_TOKENS,
    })
    const title = raw.trim().slice(0, TITLE_MAX_CHARS)
    if (title.length === 0) return
    await this.deps.bus.emit(this.deps.sessionId, 'session.title', { title })
  }
}
