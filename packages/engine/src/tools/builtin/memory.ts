/**
 * memory 工具族（阶段七工单 7.5 / H05 / ADR D25）：memory.save / memory.search。
 * save 内容对用户可见（审批卡显示 input）；审批 action memory.write/memory.read、
 * resource 恒 memory（空规则表缺省 ask——fail-safe 方向，可 always 固化）。
 * 执行体注入（同 makeTaskTool 先例）：MemoryStore 是 Engine 装配职责。
 */
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'

const MAX_CONTENT_CHARS = 10_000

const SaveInput = z.strictObject({
  content: z.string().min(1).max(MAX_CONTENT_CHARS),
})

type SaveInput = z.infer<typeof SaveInput>

export const memorySaveTool: ToolDefinition<SaveInput> = {
  name: 'memory.save',
  description:
    `保存一条长期记忆（跨会话生效——新会话首条消息后自动检索注入相关记忆）。` +
    `适用于用户偏好、项目约定等值得跨会话记住的事实。单条上限 ${MAX_CONTENT_CHARS} 字符。`,
  inputSchema: SaveInput,
  permission: {
    action: 'memory.write',
    resourceOf: () => 'memory',
  },
  parallelizable: false,

  async execute(ctx: ToolContext, input: SaveInput): Promise<ToolOutput> {
    const memory = ctx.memory
    if (memory === undefined) return Promise.reject(new Error('E_MEMORY_UNAVAILABLE: 长期记忆未启用'))
    const row = memory.save(ctx.sessionId, input.content, (ctx.now ?? Date.now)())
    return { output: { id: row.id, saved: true }, isError: false }
  },
}

const SearchInput = z.strictObject({
  query: z.string().min(1),
  limit: z.number().int().positive().max(20).optional(),
})

type SearchInput = z.infer<typeof SearchInput>

export const memorySearchTool: ToolDefinition<SearchInput> = {
  name: 'memory.search',
  description:
    '检索长期记忆（子串/关键词命中，新→旧排序）。返回匹配条目列表；' +
    '新会话首条消息会自动注入 top-3 相关记忆，无需重复检索已知注入内容。',
  inputSchema: SearchInput,
  permission: {
    action: 'memory.read',
    resourceOf: () => 'memory',
  },
  parallelizable: true,

  async execute(ctx: ToolContext, input: SearchInput): Promise<ToolOutput> {
    const memory = ctx.memory
    if (memory === undefined) return Promise.reject(new Error('E_MEMORY_UNAVAILABLE: 长期记忆未启用'))
    const hits = memory.search(input.query, input.limit ?? 5)
    return { output: { hits }, isError: false }
  },
}
