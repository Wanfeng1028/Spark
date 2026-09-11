/**
 * LSP 连接（工单 16.9 产出①）：stdio 子进程 + JSON-RPC。基座换判决（doc/08 §16.9）：
 * qwen 自研 330 行 JsonRpcConnection 不值得重复——用 vscode-languageserver-protocol +
 * vscode-jsonrpc（MIT，微软官方），本文件只做两件事：
 * 1. spawn 前剥离敏感环境变量（qwen LspServerManager SECURITY_SENSITIVE_ENV_KEYS 同清单，
 *    大小写不敏感比对——防 LD_PRELOAD/NODE_OPTIONS 等经继承注入子进程；config.env 覆盖项
 *    同样过闸，双面一次覆盖）；
 * 2. 把 vscode-jsonrpc 的 MessageConnection 收敛为引擎消费的最小窄接口（测试可注入假体）。
 */
import type { Readable, Writable } from 'node:stream'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

/** spawn 前剥离的敏感环境变量（qwen 同清单，逐键大写比对） */
const SENSITIVE_ENV_KEYS = new Set([
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'LD_AUDIT',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_OPTIONS',
])

/**
 * 子进程环境：本进程环境拷贝去敏感键 + 配置覆盖项（v1 配置面只有 command/args，
 * extra 预留给后续 config.env；敏感键覆盖同样拒绝——qwen 同款防护）。
 */
export function sanitizedLspEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (SENSITIVE_ENV_KEYS.has(key.toUpperCase())) continue
    env[key] = value
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (SENSITIVE_ENV_KEYS.has(key.toUpperCase())) continue
    env[key] = value
  }
  return env
}

/** 引擎消费的最小连接面（窄接口——测试注入内存假体，不背 vscode-jsonrpc 全量类型） */
export interface LspConnection {
  /** 结果统一 unknown——窄化在 manager/工具层做（12 操作各自归一），不在连接层开泛型口 */
  sendRequest(method: string, params?: unknown): Promise<unknown>
  sendNotification(method: string, params?: unknown): void
  /** 订阅服务端通知（publishDiagnostics 等；须在 listen() 前注册） */
  onNotification(method: string, handler: (params: unknown) => void): void
  /** 开始读入流（必须在首个 sendRequest 前调用，否则响应无人读取——死锁到超时） */
  listen(): void
  dispose(): void
}

export interface LspStreamPair {
  stdin: Writable
  stdout: Readable
}

export type ConnectionFactory = (streams: LspStreamPair) => LspConnection

/** 默认工厂：stdio 管道 → JSON-RPC 连接（vscode-jsonrpc node 入口） */
export function stdioConnectionFactory(): ConnectionFactory {
  return (streams) => {
    const connection = createMessageConnection(
      new StreamMessageReader(streams.stdout),
      new StreamMessageWriter(streams.stdin),
    )
    return {
      sendRequest: (method, params) => connection.sendRequest(method, params),
      sendNotification: (method, params) => {
        connection.sendNotification(method, params)
      },
      onNotification: (method, handler) => {
        // vscode-jsonrpc 字符串重载的 handler 是 any 形参——窄化为 unknown 传递
        connection.onNotification(method, (params: unknown) => handler(params))
      },
      listen: () => connection.listen(),
      dispose: () => connection.dispose(),
    }
  }
}
