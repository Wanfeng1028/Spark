/**
 * MCP streamable-http transport 工厂测试（doc/11 LA-10）：
 * defaultTransport 的 http 分支可达——streamable-http 配置产出 StreamableHTTPClientTransport
 * 且 headers 经 requestInit 注入；把 http 分支删掉必须让该用例红。
 * （正向连接测试需要完整 MCP 握手 + 服务端实现，超出静态测试能力——真网关联调留用户。）
 */
import { describe, expect, test } from 'vitest'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { defaultTransport } from '../src/mcp/manager.js'
import type { McpServerConfig } from '../src/mcp/config.js'

describe('defaultTransport streamable-http 分支（LA-10）', () => {
  test('streamable-http 配置 → StreamableHTTPClientTransport 实例（非 stdio）', () => {
    const cfg: McpServerConfig = {
      transport: 'streamable-http',
      url: 'http://127.0.0.1:0/mcp',
      headers: { 'x-spark-test': 'la10' },
    }
    const t = defaultTransport('test', cfg)
    expect(t).toBeInstanceOf(StreamableHTTPClientTransport)
  })

  test('stdio 配置 → 不走 http 分支（不同 transport 类型）', () => {
    const cfg: McpServerConfig = { command: 'echo' }
    const t = defaultTransport('test', cfg)
    expect(t).not.toBeInstanceOf(StreamableHTTPClientTransport)
  })
})
