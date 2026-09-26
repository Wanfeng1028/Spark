/**
 * MCP streamable-http 正向环回用例（doc/11 LA-10）：
 * mock HTTP 端点验证 defaultTransport 的 streamable-http 分支可达且 headers 注入生效。
 * 把 defaultTransport 的 http 分支删掉必须让该用例红。
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { describe, expect, test, afterEach } from 'vitest'
import { McpManager, mcpToolName } from '../src/mcp/manager.js'
import { ToolRegistry } from '../src/tools/registry.js'

const servers: Server[] = []

afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

/** 最小 MCP JSON-RPC 端点：接受 initialize / tools/list POST，返回够用的 JSON-RPC 响应 */
function startMcpEndpoint(
  headers: Record<string, string>,
): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      for (const [k, v] of Object.entries(req.headers)) {
        if (k.startsWith('x-spark-')) headers[k] = String(v)
      }
      let body = ''
      req.on('data', (c: Buffer) => {
        body += c.toString()
      })
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        let id: number | null = null
        try {
          const parsed = JSON.parse(body) as { id?: number; method?: string }
          id = parsed.id ?? null
        } catch {
          // 非 JSON 请求
        }
        if (body.includes('"method":"initialize"')) {
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2025-03-26',
                capabilities: { tools: {} },
                serverInfo: { name: 'loopback', version: '1.0.0' },
              },
            }),
          )
        } else if (body.includes('"method":"notifications/initialized"')) {
          res.writeHead(202)
          res.end()
        } else if (body.includes('"method":"tools/list"')) {
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                tools: [
                  {
                    name: 'echo',
                    description: 'echo back',
                    inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
                  },
                ],
              },
            }),
          )
        } else {
          res.end(JSON.stringify({ jsonrpc: '2.0', id, result: {} }))
        }
      })
    })
    servers.push(server)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        resolve({ url: 'http://127.0.0.1:0/mcp', close: () => server.close() })
        return
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/mcp`,
        close: () => server.close(),
      })
    })
  })
}

describe('MCP streamable-http 环回（LA-10）', () => {
  test(
    '真实 http 分支连接 + 自定义 header 注入 + 工具注册',
    { timeout: 10_000 },
    async () => {
      const headers: Record<string, string> = {}
      const endpoint = await startMcpEndpoint(headers)
      try {
        const registry = new ToolRegistry()
        const manager = new McpManager({
          config: {
            servers: {
              loopback: {
                transport: 'streamable-http' as const,
                url: endpoint.url,
                headers: { 'x-spark-test': 'la10' },
              },
            },
          },
          toolTimeoutMs: 5_000,
          // 刻意**不提供** transportFactory——让真实 defaultTransport 的 http 分支跑起来
        })
        await manager.connect(registry)

        // 工具真注册（服务端 tools/list 返回了 echo）
        const echoName = mcpToolName('loopback', 'echo')
        expect(registry.resolve(echoName)).not.toBeUndefined()

        // 服务端收到自定义 header（requestInit 注入路径真实生效）
        expect(headers['x-spark-test']).toBe('la10')
      } finally {
        endpoint.close()
      }
    },
  )
})
