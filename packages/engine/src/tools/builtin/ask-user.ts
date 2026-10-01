/**
 * ask_user 工具（CK-6 批 1）：结构化提问——模型需要用户决策时给出 1-4 问 × 每问
 * 2-4 封闭选项（可多选），用户答案结构化回给模型（toolResult）。
 * 挂起等待复用审批纪律（QuestionBoard）：超时/中断 fail-closed 返回 E_QUESTION_*
 * 错误（不假装拿到答案）；答案流经 question.asked/resolved durable 事件。
 * 审批：action 'question.ask' 在各档位预置 allow（PRESET_RULES）——提问本身无
 * 副作用，再走审批门等于"问问题还要批问题"（递归死锁）；会话/用户层显式 deny
 * 规则仍可拦（findLast 语义）。
 */
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import type { QuestionBoard, QuestionSpec } from '../../question-board.js'

const QuestionOptionSchema = z.strictObject({
  label: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
})

const AskUserInput = z.strictObject({
  questions: z
    .array(
      z.strictObject({
        question: z.string().min(1).max(300),
        options: z.array(QuestionOptionSchema).min(2).max(4),
        multiSelect: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(4),
})

type AskUserInput = z.infer<typeof AskUserInput>

export function makeAskUserTool(board: QuestionBoard): ToolDefinition<AskUserInput> {
  return {
    name: 'ask_user',
    description:
      '向用户提出结构化选择题（1-4 问，每问 2-4 个封闭选项，可多选）。' +
      '当任务存在需要用户拍板的分叉（方案取舍 / 破坏性操作确认 / 需求澄清）时使用；' +
      '自由文本追问请直接输出文字，不要用本工具。答案由用户点选后结构化返回；' +
      '超时或会话中断会 fail-closed 报错（届时如实说明未拿到答案并自行收尾）。',
    inputSchema: AskUserInput,
    permission: {
      action: 'question.ask',
      resourceOf: () => 'user',
    },
    parallelizable: false,
    async execute(ctx: ToolContext, input: AskUserInput): Promise<ToolOutput> {
      const specs: QuestionSpec[] = input.questions.map((q) => ({
        question: q.question,
        options: q.options.map((o) => ({
          label: o.label,
          ...(o.description !== undefined ? { description: o.description } : {}),
        })),
        ...(q.multiSelect !== undefined ? { multiSelect: q.multiSelect } : {}),
      }))
      const answers = await board.ask(ctx.sessionId, specs, ctx.signal)
      if (answers === null) {
        return {
          output: {
            code: 'E_QUESTION_UNANSWERED',
            message: '提问超时或会话中断，未拿到用户答案——不要假装已获得选择，如实收尾本轮',
          },
          isError: true,
        }
      }
      return { output: { answers }, isError: false }
    },
  }
}
