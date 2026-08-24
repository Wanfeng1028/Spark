/**
 * pi-ai 集成 spike（doc/02 §5.9 假设验证，D3）——独立运行，不进主构建/CI。
 * 运行前提：DEEPSEEK_API_KEY 已配置（pnpm spike）。
 *
 * 验证三点（结论按 §5.9 逐条标「实证符合 / 不符 / 未覆盖」）：
 *  1) 流式回调：text_delta / thinking_delta 的回调粒度与顺序；
 *  2) 工具调用一轮：zod → toJSONSchema → Type.Unsafe 薄桥（v2.7 修正），模型发起 → 结果回喂 → 继续；
 *  3) 中途 abort：AbortController.abort() 后的错误形态 + 已交付前缀能否拿到。
 */
import { z } from 'zod'
import { Type } from 'typebox'
import { stream as openaiCompletions } from '@earendil-works/pi-ai/api/openai-completions'
import type {
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Message,
  Model,
  ToolResultMessage,
} from '@earendil-works/pi-ai'

const KEY = process.env.DEEPSEEK_API_KEY
if (!KEY) {
  console.error('[spike] 缺 DEEPSEEK_API_KEY 环境变量——配置后重跑：pnpm spike')
  process.exit(1)
}
const API_KEY: string = KEY

/** deepseek-chat：OpenAI 兼容端点（无内置 provider，手写 Model 对象直连 openai-completions api） */
const model: Model<'openai-completions'> = {
  id: process.env.SPIKE_MODEL ?? 'deepseek-chat',
  name: 'DeepSeek Chat (spike)',
  api: 'openai-completions',
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  reasoning: true,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 65536,
  maxTokens: 8192,
}

/** §5.9 事件映射的原始证据收集器：记录事件类型序列与 delta 粒度 */
class Recorder {
  readonly events: string[] = []
  textDeltas: { len: number; text: string }[] = []
  thinkingDeltas: { len: number; text: string }[] = []
  textBuf = ''
  thinkingBuf = ''

  push(e: AssistantMessageEvent): void {
    this.events.push(e.type)
    if (e.type === 'text_delta') {
      this.textDeltas.push({ len: e.delta.length, text: e.delta })
      this.textBuf += e.delta
    }
    if (e.type === 'thinking_delta') {
      this.thinkingDeltas.push({ len: e.delta.length, text: e.delta })
      this.thinkingBuf += e.delta
    }
  }

  report(label: string): void {
    console.log(`\n===== [${label}] 事件序列 =====`)
    console.log(this.events.join(' → '))
    console.log(`text_delta: ${this.textDeltas.length} 次，长度分布：[${this.textDeltas.map((d) => d.len).join(',')}]`)
    console.log(
      `thinking_delta: ${this.thinkingDeltas.length} 次，长度分布：[${this.thinkingDeltas.map((d) => d.len).join(',')}]`,
    )
    const firstText = this.events.indexOf('text_delta')
    const firstThink = this.events.indexOf('thinking_delta')
    if (firstText >= 0 && firstThink >= 0) {
      console.log(`顺序：thinking 先于 text = ${firstThink < firstText}`)
    }
  }
}

/** 跑一条流，收集事件 + 最终消息（done/error 都闭合） */
async function runStream(
  context: Context,
  signal?: AbortSignal,
): Promise<{ rec: Recorder; final: AssistantMessage }> {
  const opts = { apiKey: API_KEY, ...(signal !== undefined ? { signal } : {}) }
  const s = openaiCompletions(model, context, opts)
  const rec = new Recorder()
  let final: AssistantMessage | null = null
  for await (const e of s) {
    rec.push(e)
    if (e.type === 'done') final = e.message
    if (e.type === 'error') final = e.error
  }
  if (final === null) throw new Error('E_SPIKE_NO_FINAL: 流未闭合（无 done/error 事件）')
  return { rec, final }
}

async function main(): Promise<void> {
    console.log(`[spike] model=${model.id} pi-ai=0.84.3`)

    // ---------- 1) 流式回调粒度与顺序 ----------
    console.log('\n########## 1. 流式回调（纯文本 + 诱导思考） ##########')
    {
      const context: Context = {
        systemPrompt: '你是验证助手。先给一句简短思考，再用恰好三句话回答。',
        messages: [{ role: 'user', content: '用一句话解释什么是事件溯源。', timestamp: Date.now() }],
      }
      const { rec, final } = await runStream(context)
      rec.report('plain-stream')
      console.log('stopReason:', final.stopReason, '| usage:', JSON.stringify(final.usage))
      console.log('定稿 content 类型:', final.content.map((c) => c.type).join(','))
      console.log('textBuf 与定稿一致:', rec.textBuf === (final.content.find((c) => c.type === 'text') as { text: string } | undefined)?.text)
    }

    // ---------- 2) 工具调用一轮：zod → jsonSchema → Type.Unsafe 薄桥 ----------
    console.log('\n########## 2. 工具调用一轮（v2.7 薄桥验证） ##########')
    {
      const WeatherInput = z.object({
        city: z.string().describe('城市名'),
        unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
      })
      // §5.9 v2.7：pi-ai Tool.parameters 要求 typebox TSchema；zod4 toJSONSchema → Type.Unsafe
      const jsonSchema = z.toJSONSchema(WeatherInput)
      const tool = {
        name: 'get_weather',
        description: '查询指定城市当前天气',
        parameters: Type.Unsafe(jsonSchema),
      }
      console.log('薄桥 jsonSchema:', JSON.stringify(jsonSchema))

      const context: Context = {
        systemPrompt: '你是验证助手。必须调用工具查天气，拿到结果后用一句中文汇报。',
        messages: [{ role: 'user', content: '查一下北京的天气（摄氏度）。', timestamp: Date.now() }],
        tools: [tool],
      }
      const r1 = await runStream(context)
      r1.rec.report('tool-round-1')
      const call = r1.final.content.find((c): c is Extract<typeof c, { type: 'toolCall' }> => c.type === 'toolCall')
      console.log('stopReason:', r1.final.stopReason, '| toolCall:', call ? `${call.name}(${JSON.stringify(call.arguments)})` : '（无）')
      if (!call) throw new Error('E_SPIKE_NO_TOOLCALL: 模型未发起工具调用')

      // 执行假工具 → ToolResultMessage 回喂 → 继续流
      const result: ToolResultMessage = {
        role: 'toolResult',
        toolCallId: call.id,
        toolName: call.name,
        content: [{ type: 'text', text: '{"temp": 22, "condition": "晴"}' }],
        isError: false,
        timestamp: Date.now(),
      }
      const messages: Message[] = [
        ...context.messages,
        r1.final,
        result,
      ]
      const r2 = await runStream({
        ...(context.systemPrompt !== undefined ? { systemPrompt: context.systemPrompt } : {}),
        messages,
        tools: [tool],
      })
      r2.rec.report('tool-round-2')
      console.log('stopReason:', r2.final.stopReason)
      const text = r2.final.content.find((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
      console.log('续答:', text?.text ?? '（无文本）')
    }

    // ---------- 3) 中途 abort ----------
    console.log('\n########## 3. 中途 abort（错误形态 + 已交付前缀） ##########')
    {
      const ac = new AbortController()
      const context: Context = {
        systemPrompt: '你是验证助手。写一段至少 300 字的散文。',
        messages: [{ role: 'user', content: '写秋天的清晨。', timestamp: Date.now() }],
      }
      const rec = new Recorder()
      let final: AssistantMessage | null = null
      let abortAt = ''
      const s = openaiCompletions(model, context, { apiKey: API_KEY, signal: ac.signal })
      try {
        for await (const e of s) {
          rec.push(e)
          if (e.type === 'text_delta' && rec.textDeltas.length === 5) {
            abortAt = `第 ${rec.textDeltas.length} 个 text_delta 后`
            ac.abort()
          }
          if (e.type === 'done') final = e.message
          if (e.type === 'error') final = e.error
        }
      } catch (err) {
        console.log('迭代器抛出（未内化为 error 事件）:', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      }
      rec.report('abort')
      console.log('abort 时机:', abortAt || '（未触发，delta 少于 5 个）')
      console.log('final.stopReason:', final?.stopReason, '| errorMessage:', final?.errorMessage)
      // 已交付前缀：两条获取路径——回调累计 vs error 事件携带的 partial content
      const partialText = final?.content.find((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
      console.log('回调累计前缀长度:', rec.textBuf.length)
      console.log('error 事件携带前缀长度:', partialText?.text.length ?? '（无）')
      console.log('两者一致:', partialText ? partialText.text === rec.textBuf : 'n/a')
    }

    console.log('\n[spike] 三点验证完毕')
}

main().catch((err: unknown) => {
  console.error('[spike] 失败:', err instanceof Error ? `${err.name}: ${err.message}` : err)
  process.exit(1)
})
