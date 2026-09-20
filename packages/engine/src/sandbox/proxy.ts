/**
 * 沙箱网络隔离代理（阶段十九 19.7 / ADR D50，翻案 ADR D15"网络隔离 v1 不做"登记）：
 * 127.0.0.1 本地代理，SOCKS5（无鉴权 + CONNECT）与 HTTP CONNECT **同端口按首字节分流**——
 * 一个端口同时喂 curl/wget（HTTP_PROXY/ALL_PROXY）与只认 SOCKS5 的客户端。
 * bash 联动：沙箱命令继承 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY=socks5h:// 环境变量时，
 * 每个连接先过域名 allowlist 再放行；未命中 → SOCKS 0x02 / HTTP 403 后断开（fail-closed）。
 *
 * **诚实边界（AD-50 判决核心，页面与文档不得逾越）**：环境变量只引导**尊重代理设置**的
 * 客户端；裸 socket 或显式绕过代理的命令仍可直连。OS 级强制属 19.6（spike 判 Windows
 * 不可行）。本模块交付的是**出口域名过滤**，不是内核隔离——不宣称"沙箱内断网"。
 * socks5h（而非 socks5）是刻意选择：主机名交给代理解析，allowlist 才能按域名判定；
 * socks5 会让客户端本地解析，代理只见到 IP，域名清单失效。
 */
import { connect as netConnect, createServer, type Server, type Socket } from 'node:net'

/** SOCKS5 应答码（RFC 1928 §6）：本模块只用到成功/规则拒绝/一般失败/命令不支持 */
const SOCKS_REPLY = {
  success: 0x00,
  generalFailure: 0x01,
  notAllowed: 0x02,
  commandNotSupported: 0x07,
} as const

/** HTTP CONNECT 首行与响应（最小实现：只要 CONNECT，GET/POST 等不透传） */
const HTTP_TUNNEL_OK = 'HTTP/1.1 200 Connection Established\r\n\r\n'
const HTTP_DENY = 'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
const HTTP_UPSTREAM_FAIL = 'HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
/** 请求头累积上限（防慢速客户端撑内存）：超限即断 */
const HTTP_HEAD_MAX = 64 * 1024
/** 握手期客户端缓冲上限（沙箱命令可能是不可信代码——连上不握手狂发数据不许撑内存） */
const HANDSHAKE_BUFFER_MAX = 4 * 1024 * 1024
/** 握手超时（连上不发完整握手 → 断；防半开连接占活跃计数） */
const HANDSHAKE_TIMEOUT_MS = 15_000

/**
 * allowlist 匹配（纯函数）：条目 = 精确主机名，或 `*.example.com`（匹配任意层子域，
 * **不含本域自身**——`*.a.com` 命中 `x.a.com`/`x.y.a.com`，不命中 `a.com`）。
 * 大小写不敏感；忽略条目首尾空白与根点（`example.com.`）。IPv4/IPv6 字面量按精确匹配。
 */
export function hostAllowed(host: string, allowlist: readonly string[]): boolean {
  const h = normalizeHost(host)
  if (h === '') return false
  for (const raw of allowlist) {
    const entry = normalizeHost(raw)
    if (entry === '') continue
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1) // ".example.com"
      if (h.length > suffix.length && h.endsWith(suffix)) return true
      continue
    }
    if (h === entry) return true
  }
  return false
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.+$/, '')
}

/** 16 字节 → IPv6 文本（压缩最长零跑，RFC 5952 简化版：SOCKS5 atyp=4 的目标展示与匹配用） */
export function formatIPv6(bytes: Buffer): string {
  const groups: number[] = []
  for (let i = 0; i < 16; i += 2) groups.push(bytes.readUInt16BE(i))
  let bestStart = -1
  let bestLen = 0
  let curStart = -1
  let curLen = 0
  for (let i = 0; i < 8; i++) {
    if (groups[i] === 0) {
      if (curStart === -1) curStart = i
      curLen++
      if (curLen > bestLen) {
        bestLen = curLen
        bestStart = curStart
      }
    } else {
      curStart = -1
      curLen = 0
    }
  }
  const parts = groups.map((g) => g.toString(16))
  // 最长零跑（≥2 组）压成 '::'——单组零不压（RFC 5952）；全零 → '::'
  if (bestLen > 1 && bestStart >= 0) {
    const head = parts.slice(0, bestStart).join(':')
    const tail = parts.slice(bestStart + bestLen).join(':')
    return `${head}::${tail}`
  }
  return parts.join(':')
}

/** 分块读取器：握手期手动消费，隧道期 attachSink 后直达上游（积压先冲刷） */
class ChunkQueue {
  private queue: Buffer[] = []
  private buffered = 0
  private notify: (() => void) | null = null
  ended = false
  private sink: ((chunk: Buffer) => void) | null = null

  constructor(private readonly sock: Socket) {
    sock.on('data', (c: Buffer) => {
      if (this.sink !== null) {
        this.sink(c)
        return
      }
      this.buffered += c.length
      // 不可信本地客户端兜底：连上不握手狂发数据 → 超限即断（不无限缓冲）
      if (this.buffered > HANDSHAKE_BUFFER_MAX) {
        sock.destroy()
        return
      }
      this.queue.push(c)
      this.wake()
    })
    sock.on('end', () => {
      this.ended = true
      this.wake()
    })
    sock.on('error', () => {
      this.ended = true
      this.wake()
    })
  }

  private wake(): void {
    const n = this.notify
    this.notify = null
    n?.()
  }

  private take(): Buffer | undefined {
    const c = this.queue.shift()
    if (c !== undefined) this.buffered -= c.length
    return c
  }

  /** 精确 n 字节；EOF 提前到达 → null。返回恰好 n 字节（多余部分留在队列） */
  async read(n: number): Promise<Buffer | null> {
    const parts: Buffer[] = []
    let have = 0
    while (have < n) {
      if (this.queue.length === 0) {
        if (this.ended) return null
        await new Promise<void>((r) => {
          this.notify = r
        })
        continue
      }
      const chunk = this.queue[0] as Buffer
      const take = Math.min(chunk.length, n - have)
      parts.push(chunk.subarray(0, take))
      have += take
      if (take === chunk.length) this.take()
      else this.queue[0] = chunk.subarray(take)
    }
    return Buffer.concat(parts)
  }

  /** 把字节放回队列头（握手预读多有/协议分支交还时用） */
  unshift(bytes: Buffer): void {
    if (bytes.length === 0) return
    this.queue.unshift(bytes)
    this.buffered += bytes.length
    this.wake()
  }

  /** 读到 marker 为止（含 marker）；超 max 字节或 EOF → null */
  async readUntil(marker: Buffer, max: number): Promise<Buffer | null> {
    // 显式 Buffer（ArrayBufferLike）：Buffer.alloc 推狭的 ArrayBuffer 与队列里的
    // ArrayBufferLike 块互相赋值会 TS2322——@types/node 的 Buffer 泛型方差
    let acc: Buffer = Buffer.alloc(0)
    while (true) {
      const idx = acc.indexOf(marker)
      if (idx !== -1) return acc
      if (acc.length > max) return null
      if (this.queue.length === 0) {
        if (this.ended) return null
        await new Promise<void>((r) => {
          this.notify = r
        })
        continue
      }
      const chunk = this.take()
      if (chunk === undefined) continue
      acc = acc.length === 0 ? chunk : Buffer.concat([acc, chunk])
      if (acc.length > max) return null
    }
  }

  /** 切隧道态：积压与后续客户端字节直达 write（握手多读的字节不丢） */
  attachSink(write: (chunk: Buffer) => void): void {
    this.sink = write
    for (const c of this.queue) write(c)
    this.queue = []
    this.buffered = 0
  }
}

export interface SandboxNetworkProxyOptions {
  /** 本地监听端口（spark.json sandbox.network.port；重启档） */
  port: number
  /** 监听地址（缺省 127.0.0.1——本地代理不对网卡暴露） */
  host?: string | undefined
  /** allowlist 读取（getter：PUT /api/settings 后热生效，不重启代理） */
  allowlist: () => readonly string[]
  /** 连接级异常（单连接失败不拖垮代理；server error 由 start 的 reject 承载） */
  onConnectionError?: ((err: Error) => void) | undefined
}

/** 代理运行时状态（设置页/CLI 面板只读展示） */
export interface SandboxNetworkProxyStatus {
  ready: boolean
  /** 未就绪原因（绑定失败等）；ready 时为 null */
  reason: string | null
  activeConnections: number
}

/**
 * 本地出口过滤代理。start() 绑定失败由调用方决定 fail-closed 行为（引擎：沙箱命令拒跑
 * E_SANDBOX_NETWORK_UNAVAILABLE，不降级为直连）。
 */
export class SandboxNetworkProxy {
  private server: Server | null = null
  private readonly sockets = new Set<Socket>()
  private failReason: string | null = null
  private readonly host: string

  constructor(private readonly opts: SandboxNetworkProxyOptions) {
    this.host = opts.host ?? '127.0.0.1'
  }

  get status(): SandboxNetworkProxyStatus {
    return {
      ready: this.server !== null && this.server.listening,
      reason: this.failReason,
      activeConnections: this.sockets.size,
    }
  }

  /** 绑定并监听；失败（端口占用等）reject——调用方记 failReason 并拒跑沙箱命令 */
  start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const server = createServer((sock) => {
        this.sockets.add(sock)
        sock.on('close', () => this.sockets.delete(sock))
        // 握手超时：连上不发完整握手 → 断（防半开连接占活跃计数与内存）
        sock.setTimeout(HANDSHAKE_TIMEOUT_MS, () => sock.destroy())
        this.dispatch(sock)
      })
      server.on('error', (err) => reject(err))
      server.listen(this.opts.port, this.host, () => {
        this.server = server
        this.failReason = null
        resolve()
      })
    })
  }

  /** 关停：先断活跃连接再关监听（在途隧道不留半开） */
  stop(): Promise<void> {
    const server = this.server
    this.server = null
    for (const s of this.sockets) s.destroy()
    this.sockets.clear()
    if (server === null) return Promise.resolve()
    return new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }

  /** 记录绑定失败原因（start 被拒后由调用方转入 fail-closed 态） */
  markFailed(reason: string): void {
    this.failReason = reason
  }

  /**
   * 首字节分流：0x05 = SOCKS5；'C' = HTTP CONNECT（余下交还队列按行解析）；
   * 其余直接断。**只预读 1 字节**——SOCKS5 客户端发完 greeting 会等我们的方法选择
   * 应答，多读即死锁。
   */
  private dispatch(sock: Socket): void {
    const q = new ChunkQueue(sock)
    void (async () => {
      const first = await q.read(1)
      if (first === null) {
        sock.destroy()
        return
      }
      const b0 = first[0] as number
      if (b0 === 0x05) {
        await this.handleSocks(sock, q)
        return
      }
      if (b0 === 0x43 /* 'C' */) {
        q.unshift(first)
        await this.handleHttpConnect(sock, q)
        return
      }
      sock.destroy()
    })().catch((err: unknown) => {
      this.opts.onConnectionError?.(err instanceof Error ? err : new Error(String(err)))
      sock.destroy()
    })
  }

  // ---- SOCKS5（RFC 1928：无鉴权 + CONNECT） ----

  private async handleSocks(sock: Socket, q: ChunkQueue): Promise<void> {
    // 版本字节（0x05）已由 dispatch 消费；这里读 [n][methods...]
    const nBuf = await q.read(1)
    if (nBuf === null) {
      sock.destroy()
      return
    }
    const methods = await q.read(nBuf[0] as number)
    if (methods === null) {
      sock.destroy()
      return
    }
    // 选无鉴权（0x00）；客户端若不提供 0x00 → 0xFF 无可接受方法
    if (!methods.includes(0x00)) {
      sock.write(Buffer.from([0x05, 0xff]))
      sock.destroy()
      return
    }
    sock.write(Buffer.from([0x05, 0x00]))

    // 请求：[0x05][cmd][rsv][atyp][addr][port:2]
    const head = await q.read(4)
    if (head === null || head[0] !== 0x05) {
      sock.destroy()
      return
    }
    const cmd = head[1] as number
    const atyp = head[3] as number
    if (cmd !== 0x01) {
      this.socksReply(sock, SOCKS_REPLY.commandNotSupported)
      return
    }
    let host: string
    if (atyp === 0x01) {
      const addr = await q.read(4)
      if (addr === null) {
        sock.destroy()
        return
      }
      host = Array.from(addr).join('.')
    } else if (atyp === 0x03) {
      const lenBuf = await q.read(1)
      if (lenBuf === null) {
        sock.destroy()
        return
      }
      const name = await q.read(lenBuf[0] as number)
      if (name === null) {
        sock.destroy()
        return
      }
      host = name.toString('latin1')
    } else if (atyp === 0x04) {
      const addr = await q.read(16)
      if (addr === null) {
        sock.destroy()
        return
      }
      host = formatIPv6(addr)
    } else {
      this.socksReply(sock, SOCKS_REPLY.generalFailure)
      return
    }
    const portBuf = await q.read(2)
    if (portBuf === null) {
      sock.destroy()
      return
    }
    const port = portBuf.readUInt16BE(0)

    if (!hostAllowed(host, this.opts.allowlist())) {
      this.socksReply(sock, SOCKS_REPLY.notAllowed)
      return
    }
    this.tunnel(sock, q, host, port, (ok) => {
      this.socksReply(sock, ok ? SOCKS_REPLY.success : SOCKS_REPLY.generalFailure)
    })
  }

  private socksReply(sock: Socket, code: number): void {
    // BND.ADDR/BND.PORT 用 0.0.0.0:0（客户端不使用；RFC 1928 §6 允许）
    sock.write(Buffer.from([0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
    if (code !== SOCKS_REPLY.success) sock.destroy()
  }

  // ---- HTTP CONNECT（绝对形式；只处理 CONNECT，不透传明文代理请求） ----

  private async handleHttpConnect(sock: Socket, q: ChunkQueue): Promise<void> {
    const head = await q.readUntil(Buffer.from('\r\n\r\n'), HTTP_HEAD_MAX)
    if (head === null) {
      sock.destroy()
      return
    }
    // 头部之后可能已跟来 TLS ClientHello 等应用字节——交还队列，隧道期冲刷上游
    const marker = head.indexOf(Buffer.from('\r\n\r\n'))
    if (marker !== -1) q.unshift(head.subarray(marker + 4))
    const requestLine = head.toString('latin1').split('\r\n')[0] ?? ''
    const m = /^CONNECT[ ]+([^ ]+)[ ]+HTTP\/1\.[01]$/.exec(requestLine)
    if (m === null) {
      sock.destroy()
      return
    }
    const { host, port } = parseAuthority(m[1] as string)
    if (host === null || port === null) {
      sock.destroy()
      return
    }
    if (!hostAllowed(host, this.opts.allowlist())) {
      sock.write(HTTP_DENY)
      sock.destroy()
      return
    }
    this.tunnel(sock, q, host, port, (ok) => {
      sock.write(ok ? HTTP_TUNNEL_OK : HTTP_UPSTREAM_FAIL)
    })
  }

  // ---- 隧道（两协议共用） ----

  /**
   * 连上游并双向转发（同步注册，无 await 必要）。onHandshake 在连接成败分明后调用
   * （SOCKS 应答 / HTTP 状态行）；失败时由 onHandshake 负责回错误并销毁。
   */
  private tunnel(
    sock: Socket,
    q: ChunkQueue,
    host: string,
    port: number,
    onHandshake: (ok: boolean) => void,
  ): void {
    const upstream = netConnect({ host, port })
    const cleanup = (): void => {
      upstream.destroy()
      sock.destroy()
    }
    upstream.on('error', () => {
      onHandshake(false)
      cleanup()
    })
    upstream.on('connect', () => {
      onHandshake(true)
      // 握手完成：解除握手超时（隧道可长期静默——TLS 长连接不该被 15s 杀）
      sock.setTimeout(0)
      // 握手多读的客户端字节先冲刷，后续直达（ChunkQueue 切隧道态）
      q.attachSink((c) => {
        if (!upstream.destroyed) upstream.write(c)
      })
      upstream.pipe(sock)
    })
    sock.on('close', () => upstream.destroy())
    upstream.on('close', () => sock.destroy())
  }
}

/** authority → host/port（支持 IPv6 方括号形 `[::1]:443`；非法 → null） */
export function parseAuthority(authority: string): { host: string | null; port: number | null } {
  const a = authority.trim()
  if (a.startsWith('[')) {
    const end = a.indexOf(']')
    if (end === -1) return { host: null, port: null }
    const host = a.slice(1, end)
    const rest = a.slice(end + 1)
    if (rest === '') return { host, port: 443 }
    if (!rest.startsWith(':')) return { host: null, port: null }
    const port = Number(rest.slice(1))
    return { host, port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : null }
  }
  const idx = a.lastIndexOf(':')
  if (idx === -1) return { host: a, port: 443 }
  const host = a.slice(0, idx)
  const port = Number(a.slice(idx + 1))
  return { host, port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : null }
}
