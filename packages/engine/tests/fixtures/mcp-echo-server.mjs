/**
 * 测试夹具：stdio MCP echo server（tests/mcp.test.ts 起真实子进程走 StdioClientTransport）。
 * 工具：echo（原样返回）、fail（isError=true——失败路径）。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'echo', version: '1.0.0' })

server.tool('echo', '原样返回输入文本', { message: z.string() }, async ({ message }) => ({
  content: [{ type: 'text', text: `echo: ${message}` }],
}))

server.tool('fail', '总是返回 isError', {}, async () => ({
  content: [{ type: 'text', text: 'boom' }],
  isError: true,
}))

await server.connect(new StdioServerTransport())
