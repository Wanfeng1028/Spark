/**
 * MCP streamable-http 正向环回用例（doc/11 LA-10）：
 * 本地 http server 挂 StreamableHTTPServerTransport（SDK 自带，零新依赖）→
 * McpManager 以 transport:'streamable-http' 连接（走真实 defaultTransport http 分支，
 * 不用 transportFactory 替身）→ 断言工具真注册 + 服务端收到自定义 header +
 * 调用结果真通。把 defaultTransport 的 http 分支删掉必须让该用例红。
 */
import { createServer, type Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpManager, mcpToolName } from '../src/mcp/manager.js'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'spark-mcp-http-'))
}

describe('MCP streamable-http 环回（LA-10）', () => {
  test('本地 http server + 自定义 header → 工具真注册且调用结果真通', async () => {
    // --- 服务端：McpServer + StreamableHTTPServerTransport ---
    const mcpServer = new McpServer({ name: 'loopback-echo', version: '1.0.0' })
    mcpServer.tool('echo', 'echo back', { message: z.string() }, async ({ message }) => ({
      content: [{ type: 'text' as const, text: `echo:${message}` }],
    }))
    mcpServer.tool('ping', 'ping', {}, async () => ({
      content: [{ type: 'text' as const, text: 'pong' }],
    }))

    const receivedHeaders: Record<string, string> = {}
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    const httpServer: Server = createServer((req, res) => {
      for (const [k, v] of Object.entries(req.headers)) {
        if (k.startsWith('x-spark-')) receivedHeaders[k] = String(v)
      }
      void transport.handleRequest(req, res)
    })
    await mcpServer.connect(transport)
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve)
    })
    const addr = httpServer.address()
    if (addr === null || typeof addr === 'string') throw new Error('http server addr fail')
    const baseUrl = `http://127.0.0.1:${addr.port}/mcp`

    // --- 客户端：McpManager 连 streamable-http（走真实 defaultTransport） ---
    const registry = new ToolRegistry()
    const manager = new McpManager({
      config: {
        version: 1,
        servers: {
          loopback: {
            transport: 'streamable-http' as const,
            url: baseUrl,
            headers: { 'x-spark-test': 'la10' },
          },
        },
      },
      toolTimeoutMs: 5_000,
      // 刻意**不提供** transportFactory——让真实 defaultTransport 的 http 分支跑起来
    })
    await manager.connect(registry)

    // 断言 1：工具真注册
    const echoName = mcpToolName('loopback', 'echo')
    const pingName = mcpToolName('loopback', 'ping')
    const echoEntry = registry.resolve(echoName)
    const pingEntry = registry.resolve(pingName)
    expect(echoEntry).not.toBeUndefined()
    expect(pingEntry).not.toBeUndefined()

    // 断言 2：服务端收到自定义 header（requestInit 注入路径真实生效）
    expect(receivedHeaders['x-spark-test']).toBe('la10')

    // 断言 3：工具调用真通（经由 http 环回，返回 echo 结果）
    const toolDef = echoEntry!
    const callResult = await toolDef.execute({ message: 'la10-test' } as never, {
      sessionId: ids.session('ses_mcphttp00000000001'),
      turnId: ids.turn('trn_mcphttp0000000001'),
      callId: ids.call('cal_mcphttp0000000001'),
      signal: new AbortController().signal,
      onProgress: () => {},
      cwd: tempDir(),
    } as never)
    // MCP 工具 handler 返回的 content 需包含 echo 结果
    const resultStr = JSON.stringify(callResult)
    expect(resultStr).toContain('la10-test')

    // 清理
    await manager.dispose()
    httpServer.close()
  })
})
