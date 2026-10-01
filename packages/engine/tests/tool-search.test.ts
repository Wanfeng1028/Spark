/**
 * ToolSearch 单测（CK-11）：deferred 化（per-server 配置 + 字节阈值自动）/
 * 检索（子串匹配排序）/ select 显现（下一轮广告面含之）/ 未知 select 报错 /
 * 广告面字节断言（deferred 不进 materialize，显现后进）。
 */
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import { DeferredToolIndex, makeToolSearchTool, TOOLSEARCH_AUTO_THRESHOLD } from '../src/tools/builtin/tool-search.js'
import { ToolRegistry } from '../src/tools/registry.js'
import { makeMcpToolDef, mcpToolName } from '../src/mcp/manager.js'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { ToolContext } from '../src/tools/definition.js'

const SID = ids.session('ses_toolsearch000000000000')

function makeCtx(): ToolContext {
  return {
    sessionId: SID,
    turnId: ids.turn('trn_toolsearch000000000001'),
    callId: ids.call('cal_toolsearch00000000001'),
    signal: new AbortController().signal,
    onProgress: () => {},
    cwd: '/tmp',
  }
}

describe('DeferredToolIndex（CK-11）', () => {
  test('defer/deferred/reveal 全链：显现后 isDeferred false', () => {
    const idx = new DeferredToolIndex()
    idx.defer('mcp__srv__a')
    idx.defer('mcp__srv__b')
    expect(idx.isDeferred('mcp__srv__a')).toBe(true)
    expect(idx.reveal('mcp__srv__a')).toBe(true)
    expect(idx.isDeferred('mcp__srv__a')).toBe(false)
    expect(idx.reveal('mcp__srv__a')).toBe(false) // 已显现：重复 reveal false
    expect(idx.reveal('mcp__nosuch')).toBe(false)
  })

  test('search：名称/描述子串匹配（大小写不敏感），排序稳定', () => {
    const idx = new DeferredToolIndex()
    idx.defer('mcp__jira__search_issues')
    idx.defer('mcp__jira__create_issue')
    idx.defer('mcp__wiki__get_page')
    const catalog = new Map([
      ['mcp__jira__search_issues', 'Search Jira issues by project'],
      ['mcp__jira__create_issue', 'Create a new Jira issue'],
      ['mcp__wiki__get_page', 'Get wiki page content'],
    ])
    const hits = idx.search('jira', catalog)
    expect(hits.map((h) => h.name)).toEqual(['mcp__jira__create_issue', 'mcp__jira__search_issues'])
    const byDesc = idx.search('WIKI', catalog)
    expect(byDesc.map((h) => h.name)).toEqual(['mcp__wiki__get_page'])
    expect(idx.search('nomatch-xyz', catalog)).toEqual([])
  })

  test('list：全量 deferred 名单排序', () => {
    const idx = new DeferredToolIndex()
    idx.defer('mcp__b__t')
    idx.defer('mcp__a__t')
    expect(idx.list()).toEqual(['mcp__a__t', 'mcp__b__t'])
  })
})

describe('tool_search 工具（CK-11）', () => {
  function makeFixture() {
    const idx = new DeferredToolIndex()
    const catalog = new Map([
      ['mcp__jira__search_issues', 'Search Jira issues'],
      ['mcp__jira__create_issue', 'Create issue'],
    ])
    idx.defer('mcp__jira__search_issues')
    idx.defer('mcp__jira__create_issue')
    const tool = makeToolSearchTool(idx, () => catalog)
    return { idx, tool }
  }

  test('query 检索：matches 返回且不显现', async () => {
    const { idx, tool } = makeFixture()
    const r = await tool.execute(makeCtx(), { query: 'issue' })
    expect(r.isError).toBe(false)
    const out = r.output as { matches: unknown[]; deferredCount: number }
    expect(out.matches).toHaveLength(2)
    expect(out.deferredCount).toBe(2)
    expect(idx.isDeferred('mcp__jira__search_issues')).toBe(true) // 检索不显现
  })

  test('select 精确显现：reveal 生效；未知名报 E_TOOLSEARCH_UNKNOWN', async () => {
    const { idx, tool } = makeFixture()
    const r = await tool.execute(makeCtx(), { query: 'select:mcp__jira__search_issues' })
    expect(r.isError).toBe(false)
    expect((r.output as { revealed: string }).revealed).toBe('mcp__jira__search_issues')
    expect(idx.isDeferred('mcp__jira__search_issues')).toBe(false)
    const bad = await tool.execute(makeCtx(), { query: 'select:mcp__nosuch' })
    expect(bad.isError).toBe(true)
    expect((bad.output as { code: string }).code).toBe('E_TOOLSEARCH_UNKNOWN')
  })

  test('留空 query：列出全部 deferred 名单', async () => {
    const { tool } = makeFixture()
    const r = await tool.execute(makeCtx(), {})
    const out = r.output as { deferred: string[] }
    expect(out.deferred).toEqual(['mcp__jira__create_issue', 'mcp__jira__search_issues'])
  })
})

describe('deferred 化与广告面（CK-11）', () => {
  function makeDeferredRegistry(): { registry: ToolRegistry; index: DeferredToolIndex } {
    const registry = new ToolRegistry()
    const index = new DeferredToolIndex()
    const fakeClient = {} as Client
    for (const toolName of ['search_issues', 'create_issue']) {
      const def = makeMcpToolDef(
        'jira',
        { name: toolName, description: 'x'.repeat(100), inputSchema: { type: 'object' } },
        fakeClient,
        5_000,
      )
      registry.register(def)
      index.defer(mcpToolName('jira', toolName))
    }
    return { registry, index }
  }

  test('广告面字节断言：deferred 未显现不进 materialize，显现后进', () => {
    const { registry, index } = makeDeferredRegistry()
    // 模拟管线过滤语义（与 pipeline.materialize 同式）
    const materialize = (): string[] =>
      registry
        .materialize()
        .map((s) => s.name)
        .filter((n) => !index.isDeferred(n))
    expect(materialize()).toEqual([]) // 全部 deferred：广告面为空
    const bytesBefore = registry.materialize().reduce((n, s) => n + Buffer.byteLength(s.description, 'utf8'), 0)
    expect(bytesBefore).toBeGreaterThan(200) // schema 描述体量在（只是不进广告面）
    index.reveal(mcpToolName('jira', 'search_issues'))
    expect(materialize()).toEqual([mcpToolName('jira', 'search_issues')])
  })

  test('阈值常量：32KB（Claude Code 广告面预算同量级）', () => {
    expect(TOOLSEARCH_AUTO_THRESHOLD).toBe(32 * 1024)
  })
})
