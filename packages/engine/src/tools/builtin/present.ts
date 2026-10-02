/**
 * present 工具（CK-13 批 1）：模型显式声明"这些文件是本任务的交付物"（dsh present
 * 同语义）——turn 尾变更卡片与四端交付面的数据源。声明 ≠ 只读聚合（19.35 审查
 * 已承担只读 diff 面）：交付物是模型的主动断言，用户据此知道该看哪些文件。
 * 路径硬边界：resolveInRoot 逐个校验（cwd 外 E_PATH_OUTSIDE）；文件必须真实存在
 * （不存在的交付物 = 假状态，E_DELIVERABLE_MISSING）。emit deliverables.presented
 * （durable 非 surface；模型可见面是 toolResult 回执）。
 */
import { stat } from 'node:fs/promises'
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import { resolveInRoot } from '../definition.js'

const PresentInput = z.strictObject({
  /** 交付文件清单（相对 cwd；1-20 个） */
  files: z.array(z.string().min(1)).min(1).max(20),
  /** 一句话交付说明 */
  summary: z.string().min(1).max(500).optional(),
})

type PresentInput = z.infer<typeof PresentInput>

export function makePresentTool(
  emit: (sessionId: ToolContext['sessionId'], files: string[], summary?: string) => Promise<void>,
): ToolDefinition<PresentInput> {
  return {
    name: 'present',
    description:
      '声明本任务的交付文件（最终产物清单）。在任务完成、产出文件就绪后调用一次：' +
      '用户界面会高亮这些文件；重复调用以最后一次为准。文件必须已存在于工作区内' +
      '（不存在的路径会被拒绝）。纯查询/无交付物的任务不要调用。',
    inputSchema: PresentInput,
    permission: {
      action: 'deliverable.present',
      resourceOf: (input) => `files:${input.files.length}`,
    },
    parallelizable: false,
    async execute(ctx: ToolContext, input: PresentInput): Promise<ToolOutput> {
      const resolved: string[] = []
      for (const file of input.files) {
        const abs = resolveInRoot(ctx.cwd, file)
        const info = await stat(abs).catch(() => undefined)
        if (info === undefined || !info.isFile()) {
          return {
            output: {
              code: 'E_DELIVERABLE_MISSING',
              message: `交付文件不存在或不是文件：${file}——请先产出文件再声明交付`,
            },
            isError: true,
          }
        }
        resolved.push(abs)
      }
      await emit(ctx.sessionId, resolved, input.summary)
      return {
        output: {
          count: resolved.length,
          files: resolved,
          message: '交付声明已记录',
        },
        isError: false,
      }
    },
  }
}
