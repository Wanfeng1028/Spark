/**
 * Task 工具（doc/02 §5.6.1，阶段五工单 5.4 / ADR D17）：子代理派生。
 * 独立子会话（header.parentSession）跑一轮任务，返回最终 assistant 文本——
 * 执行体由 Engine 注入（工具层不感知会话管理）；单层限制（E_SUBAGENT_DEPTH）
 * 与子会话生命周期都在 Engine.runSubagent。
 */
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'

const TaskInput = z.strictObject({
  prompt: z.string().min(1),
  title: z.string().min(1).optional(),
})

export type TaskInput = z.infer<typeof TaskInput>

/** 执行体端口（Engine.runSubagent 注入；单测可换桩） */
export type TaskRunner = (input: TaskInput, ctx: ToolContext) => Promise<ToolOutput>

export function makeTaskTool(run: TaskRunner): ToolDefinition<TaskInput> {
  return {
    name: 'task',
    description:
      '派生子代理：在独立子会话中执行一个自包含任务并返回其最终答复。' +
      '适合并行调研/批量独立操作；子代理可用全部工具（含审批），单层不可嵌套。',
    inputSchema: z.strictObject({
      prompt: z.string().min(1),
      title: z.string().min(1).optional(),
    }),
    permission: {
      action: 'agent.task',
      resourceOf: () => 'task',
    },
    // 工单 7.8：解除单并发——每个子代理在独立子会话跑（独立事件流/输入队列），
    // 并行互不串扰；并发上限仍受 maxToolParallel 分批约束
    parallelizable: true,
    async execute(ctx, input) {
      return run(input, ctx)
    },
  }
}
