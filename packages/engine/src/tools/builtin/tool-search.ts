/**
 * ToolSearch（CK-11）：MCP 工具延迟加载——deferred 工具不进初始广告面
 * （OpenAPI 型 server 动辄 15-60KB 描述挤爆上下文），模型经 tool_search 检索
 * 或精确显现后，下一轮广告面才含之。
 * 注册与执行面不变：deferred 工具照常注册进 registry（权限门照走）——只过滤
 * 广告清单（materialize），显现有会话级滞后一轮（Claude Code 同语义）。
 * deferred 判定双入口：mcp.json per-server `deferTools: true` 显式声明，或
 * 广告面字节阈值自动 deferred 化（描述累计超 TOOLSEARCH_AUTO_THRESHOLD）。
 */
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'

/** 自动 deferred 化阈值：MCP 工具描述累计字节（Claude Code 广告面预算同量级） */
export const TOOLSEARCH_AUTO_THRESHOLD = 32 * 1024

export class DeferredToolIndex {
  private readonly deferred = new Set<string>()
  private readonly revealed = new Set<string>()

  /** 标记延迟加载（注册时调用；已显现的保持显现） */
  defer(name: string): void {
    if (!this.revealed.has(name)) this.deferred.add(name)
  }

  /** 显现（tool_search select）：下一轮广告面含之 */
  reveal(name: string): boolean {
    if (!this.deferred.has(name)) return false
    this.deferred.delete(name)
    this.revealed.add(name)
    return true
  }

  isDeferred(name: string): boolean {
    return this.deferred.has(name)
  }

  /** 检索：名称/描述子串（大小写不敏感），返回未显现的 deferred 工具 */
  search(query: string, catalog: ReadonlyMap<string, string>): Array<{ name: string; description: string }> {
    const q = query.toLowerCase()
    const out: Array<{ name: string; description: string }> = []
    for (const name of this.deferred) {
      const desc = catalog.get(name) ?? ''
      if (name.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) {
        out.push({ name, description: desc })
      }
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : 1))
  }

  /** 全部 deferred 名单（tool_search 无参时给概览） */
  list(): string[] {
    return [...this.deferred].sort()
  }
}

const ToolSearchInputSchema = z.strictObject({
  /**
   * 检索词（匹配工具名/描述子串）；`select:<工具名>` = 精确显现该工具
   * （下一轮广告面含其完整 schema）。留空 = 列出全部延迟工具名。
   */
  query: z.string().max(200).optional(),
})

type ToolSearchInput = z.infer<typeof ToolSearchInputSchema>

export function makeToolSearchTool(index: DeferredToolIndex, catalog: () => ReadonlyMap<string, string>): ToolDefinition<ToolSearchInput> {
  return {
    name: 'tool_search',
    description:
      '检索或显现延迟加载的工具（deferred——完整 schema 未在广告面中）。' +
      'query 留空列出全部延迟工具名；填检索词按名称/描述子串匹配；' +
      '`select:<工具名>` 精确显现（下一轮即可直接调用该工具）。' +
      '当需要的工具不在可见清单且可能是 MCP 延迟工具时使用。',
    inputSchema: ToolSearchInputSchema,
    permission: {
      action: 'tool.search',
      resourceOf: () => 'deferred-tools',
    },
    parallelizable: true,
    execute(ctx: ToolContext, input: ToolSearchInput): Promise<ToolOutput> {
      const q = input.query ?? ''
      if (q.startsWith('select:')) {
        const name = q.slice('select:'.length).trim()
        const ok = index.reveal(name)
        return Promise.resolve({
          output: ok
            ? { revealed: name, message: `工具 ${name} 已显现——下一轮起可直接调用（本轮已可按其 schema 构造调用）` }
            : { code: 'E_TOOLSEARCH_UNKNOWN', message: `延迟工具清单中无 ${name}（可能已显现或不存在）` },
          isError: !ok,
        })
      }
      const hits = q === '' ? [] : index.search(q, catalog())
      const all = index.list()
      return Promise.resolve({
        output: {
          deferredCount: all.length,
          ...(q !== '' ? { matches: hits } : {}),
          ...(q === '' ? { deferred: all } : {}),
          hint: '用 select:<工具名> 显现后即可调用',
        },
        isError: false,
      })
    },
  }
}
