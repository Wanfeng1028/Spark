/**
 * 沙箱网络隔离单测（阶段十九 19.7 / ADR D50）：
 * ① 纯函数——hostAllowed 清单匹配（精确/通配子域/不含本域/大小写/根点/IP 字面量）、
 *    formatIPv6、parseAuthority；
 * ② 集成——真实 socket 打 SOCKS5（无鉴权 + CONNECT）与 HTTP CONNECT 同端口分流：
 *    命中放行并双向透传、未命中 SOCKS 0x02 / HTTP 403、非 CONNECT 与非两协议首字节
 *    直接断、上游连不上 SOCKS 0x01 / HTTP 502、无 0x00 方法 0xFF、allowlist 热切换。
 * 出口引导不是内核隔离（AD-50 边界）——本文件只验证代理与清单语义本身。
 */
import { createServer, connect as netConnect, type Server, type Socket } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'
import { formatIPv6, hostAllowed, parseAuthority, SandboxNetworkProxy } from '../src/sandbox/proxy.js'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 起一个临时 TCP 服务，返回端口与关闭函数（连接自行跟踪——不依赖 server.sockets 迭代面） */
async function listen(
  onConnection: (sock: Socket) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const conns = new Set<Socket>()
  const server: Server = createServer((sock) => {
    conns.add(sock)
    sock.on('close', () => conns.delete(sock))
    onConnection(sock)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of conns) s.destroy()
        conns.clear()
        server.close(() => resolve())
      }),
  }
}

/** 起一个代理实例（allowlist 可变——热切换验证），返回端口/停代理/换清单 */
async function startProxy(
  initial: readonly string[],
): Promise<{ port: number; stop: () => Promise<void>; setAllowlist: (next: string[]) => void; status: () => { ready: boolean } }> {
  let current: string[] = [...initial]
  // 先用探针服务占一个空闲端口再释放，代理按该端口 listen（代理自身端口由配置给定）
  const probe = await listen(() => {})
  const port = probe.port
  await probe.close()
  const proxy = new SandboxNetworkProxy({ port, allowlist: () => current })
  await proxy.start()
  return {
    port,
    stop: () => proxy.stop(),
    setAllowlist: (next) => {
      current = next
    },
    status: () => ({ ready: proxy.status.ready }),
  }
}

/** 收集 socket 数据直到满足判定或超时 */
async function readSome(sock: Socket, ms = 500): Promise<Buffer> {
  const chunks: Buffer[] = []
  const onData = (c: Buffer): void => {
    chunks.push(c)
  }
  sock.on('data', onData)
  await sleep(ms)
  sock.off('data', onData)
  return Buffer.concat(chunks)
}

/**
 * 持续收集器：一个 socket 一个，attach 后不离场（定时窗口读会把"方法选择应答 +
 * 请求应答"两段搅在一起，而按长度切包又会丢掉同段到达的应用字节——收集器两者兼顾：
 * wait(n) 等够 n 字节，drain() 取走已收的全部，尾字节不丢）。
 */
function collector(sock: Socket): { wait: (n: number, timeoutMs?: number) => Promise<void>; drain: () => Buffer } {
  // 显式 Buffer（ArrayBufferLike）——Buffer.alloc 推狭的 ArrayBuffer 与 data 块的
  // ArrayBufferLike 互相赋值会 TS2322（@types/node 的 Buffer 泛型方差）
  let buf: Buffer = Buffer.alloc(0)
  sock.on('data', (c: Buffer) => {
    buf = buf.length === 0 ? c : Buffer.concat([buf, c])
  })
  return {
    async wait(n, timeoutMs = 1000) {
      const deadline = Date.now() + timeoutMs
      while (buf.length < n && Date.now() < deadline) await sleep(10)
    },
    drain() {
      const out = buf
      buf = Buffer.alloc(0)
      return out
    },
  }
}

/**
 * SOCKS5 客户端最小实现：greeting+请求一次写出，**先读 2 字节方法选择应答再读 10 字节
 * 请求应答**（两段应答——只读一段会把方法选择的 0x00 当成请求应答码）。
 */
async function socksConnect(
  proxyPort: number,
  host: string,
  port: number,
): Promise<{ code: number; tail: Buffer; sock: Socket; col: ReturnType<typeof collector> }> {
  const sock = netConnect({ host: '127.0.0.1', port: proxyPort })
  await new Promise<void>((resolve, reject) => {
    sock.once('connect', resolve)
    sock.once('error', reject)
  })
  const name = Buffer.from(host, 'latin1')
  const col = collector(sock)
  sock.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), Buffer.from([0x05, 0x01, 0x00, 0x03, name.length]), name, Buffer.from([port >> 8, port & 0xff])]))
  // 两段应答：方法选择 2 字节 + 请求应答 10 字节（一次写完时代理连续回复）。
  // 请求应答布局 [ver, code, rsv, atyp, bnd×4, port×2]——code 在整体第 3 字节。
  await col.wait(12)
  const raw = col.drain()
  expect(raw.subarray(0, 2)).toEqual(Buffer.from([0x05, 0x00]))
  // 第 12 字节起可能已跟来上游数据（同段到达）——随 tail 交还，调用方不得丢
  return { code: raw.length >= 4 ? (raw[3] as number) : -1, tail: raw.subarray(12), sock, col }
}

afterEach(async () => {
  // 每个用例自行停代理/上游；这里只做兜底等待，防句柄泄漏拖垮 vitest
  await sleep(10)
})

describe('hostAllowed（allowlist 匹配纯函数）', () => {
  test('精确主机名命中；大小写不敏感；忽略根点', () => {
    expect(hostAllowed('github.com', ['github.com'])).toBe(true)
    expect(hostAllowed('GITHUB.COM', ['github.com'])).toBe(true)
    expect(hostAllowed('github.com.', ['github.com'])).toBe(true)
    expect(hostAllowed('evil.com', ['github.com'])).toBe(false)
    expect(hostAllowed('', ['github.com'])).toBe(false)
  })

  test('*.example.com 匹配任意层子域，不含本域自身', () => {
    expect(hostAllowed('a.example.com', ['*.example.com'])).toBe(true)
    expect(hostAllowed('x.y.example.com', ['*.example.com'])).toBe(true)
    expect(hostAllowed('example.com', ['*.example.com'])).toBe(false)
    expect(hostAllowed('notexample.com', ['*.example.com'])).toBe(false)
  })

  test('空条目与空白条目跳过；IP 字面量按精确匹配', () => {
    expect(hostAllowed('a.com', ['', '   ', 'b.com'])).toBe(false)
    expect(hostAllowed('127.0.0.1', ['127.0.0.1'])).toBe(true)
    expect(hostAllowed('127.0.0.2', ['127.0.0.1'])).toBe(false)
  })
})

describe('formatIPv6 / parseAuthority（协议解析纯函数）', () => {
  test('IPv6 压缩最长零跑', () => {
    const loop = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(formatIPv6(loop)).toBe('::1')
    const full = Buffer.from([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(formatIPv6(full)).toBe('2001:db8::1')
    const noZero = Buffer.from([0x20, 0x01, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7])
    expect(formatIPv6(noZero)).toBe('2001:1:2:3:4:5:6:7')
  })

  test('authority 解析：缺省 443 / IPv6 方括号 / 非法端口', () => {
    expect(parseAuthority('example.com:8443')).toEqual({ host: 'example.com', port: 8443 })
    expect(parseAuthority('example.com')).toEqual({ host: 'example.com', port: 443 })
    expect(parseAuthority('[::1]:8443')).toEqual({ host: '::1', port: 8443 })
    expect(parseAuthority('[::1]')).toEqual({ host: '::1', port: 443 })
    expect(parseAuthority('example.com:0')).toEqual({ host: 'example.com', port: null })
    expect(parseAuthority('example.com:abc')).toEqual({ host: 'example.com', port: null })
    expect(parseAuthority('[::1')).toEqual({ host: null, port: null })
  })
})

describe('SandboxNetworkProxy（SOCKS5 + HTTP CONNECT 同端口分流）', () => {
  test('allowlist 命中：SOCKS5 CONNECT 放行并双向透传', async () => {
    const upstream = await listen((sock) => sock.write('pong'))
    const proxy = await startProxy(['localhost'])
    try {
      const { code, tail, sock, col } = await socksConnect(proxy.port, 'localhost', upstream.port)
      expect(code).toBe(0x00)
      await sleep(200)
      // 上游回包可能紧随应答到达（tail 已收）或稍后到（收集器续收）——两处都看
      expect(`${tail.toString()}${col.drain().toString()}`).toContain('pong')
      sock.destroy()
    } finally {
      await proxy.stop()
      await upstream.close()
    }
  })

  test('allowlist 未命中：SOCKS 回 0x02（规则拒绝）后断开', async () => {
    const upstream = await listen(() => {})
    const proxy = await startProxy(['allowed.example'])
    try {
      const { code, sock } = await socksConnect(proxy.port, 'blocked.example', upstream.port)
      expect(code).toBe(0x02)
      sock.destroy()
    } finally {
      await proxy.stop()
      await upstream.close()
    }
  })

  test('HTTP CONNECT 命中：200 建立 + 透传；未命中：403', async () => {
    const upstream = await listen((sock) => sock.write('http-ok'))
    const proxy = await startProxy(['localhost'])
    try {
      const ok = netConnect({ host: '127.0.0.1', port: proxy.port })
      await new Promise<void>((r) => ok.once('connect', r))
      ok.write(`CONNECT localhost:${String(upstream.port)} HTTP/1.1\r\nHost: localhost\r\n\r\n`)
      const okResp = await readSome(ok, 300)
      expect(okResp.toString()).toContain('200 Connection Established')
      expect(okResp.toString()).toContain('http-ok')
      ok.destroy()

      const denied = netConnect({ host: '127.0.0.1', port: proxy.port })
      await new Promise<void>((r) => denied.once('connect', r))
      denied.write(`CONNECT blocked.example:443 HTTP/1.1\r\nHost: blocked.example\r\n\r\n`)
      const deniedResp = await readSome(denied, 300)
      expect(deniedResp.toString()).toContain('403')
      denied.destroy()
    } finally {
      await proxy.stop()
      await upstream.close()
    }
  })

  test('非 CONNECT 方法与非两协议首字节：直接断开（不假装代理）', async () => {
    const proxy = await startProxy(['localhost'])
    try {
      const getSock = netConnect({ host: '127.0.0.1', port: proxy.port })
      await new Promise<void>((r) => getSock.once('connect', r))
      getSock.write('GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\n\r\n')
      const closed = await new Promise<boolean>((resolve) => {
        getSock.once('close', () => resolve(true))
        setTimeout(() => resolve(false), 500)
      })
      expect(closed).toBe(true)

      const junk = netConnect({ host: '127.0.0.1', port: proxy.port })
      await new Promise<void>((r) => junk.once('connect', r))
      junk.write(Buffer.from([0x04, 0x01]))
      const closed2 = await new Promise<boolean>((resolve) => {
        junk.once('close', () => resolve(true))
        setTimeout(() => resolve(false), 500)
      })
      expect(closed2).toBe(true)
    } finally {
      await proxy.stop()
    }
  })

  test('上游连不上：SOCKS 0x01 / HTTP 502（不悬挂连接）', async () => {
    const proxy = await startProxy(['localhost'])
    try {
      // 本地一个无人监听的端口（127.0.0.1:1 几乎必然拒连）
      const { code } = await socksConnect(proxy.port, 'localhost', 1)
      expect(code).toBe(0x01)

      const httpSock = netConnect({ host: '127.0.0.1', port: proxy.port })
      await new Promise<void>((r) => httpSock.once('connect', r))
      httpSock.write('CONNECT localhost:1 HTTP/1.1\r\nHost: localhost\r\n\r\n')
      const resp = await readSome(httpSock, 500)
      expect(resp.toString()).toContain('502')
      httpSock.destroy()
    } finally {
      await proxy.stop()
    }
  })

  test('SOCKS5 不提供 0x00 方法：回 0xFF 无可接受方法', async () => {
    const proxy = await startProxy(['localhost'])
    try {
      const sock = netConnect({ host: '127.0.0.1', port: proxy.port })
      await new Promise<void>((r) => sock.once('connect', r))
      sock.write(Buffer.from([0x05, 0x01, 0x02])) // 只提供 user/pass
      const raw = await readSome(sock, 300)
      expect(raw[0]).toBe(0x05)
      expect(raw[1]).toBe(0xff)
      sock.destroy()
    } finally {
      await proxy.stop()
    }
  })

  test('allowlist 热切换：先拒后放（getter 语义，代理不重启）', async () => {
    const upstream = await listen((sock) => sock.write('hot'))
    const proxy = await startProxy([])
    try {
      const denied = await socksConnect(proxy.port, 'localhost', upstream.port)
      expect(denied.code).toBe(0x02)
      denied.sock.destroy()

      proxy.setAllowlist(['localhost'])
      const allowed = await socksConnect(proxy.port, 'localhost', upstream.port)
      expect(allowed.code).toBe(0x00)
      await sleep(200)
      expect(`${allowed.tail.toString()}${allowed.col.drain().toString()}`).toContain('hot')
      allowed.sock.destroy()
    } finally {
      await proxy.stop()
      await upstream.close()
    }
  })

  test('stop() 后 status.ready=false；活跃连接被断开', async () => {
    const upstream = await listen((sock) => sock.write('x'))
    const proxy = await startProxy(['localhost'])
    const { sock } = await socksConnect(proxy.port, 'localhost', upstream.port)
    await proxy.stop()
    expect(proxy.status().ready).toBe(false)
    const closed = await new Promise<boolean>((resolve) => {
      sock.once('close', () => resolve(true))
      setTimeout(() => resolve(false), 500)
    })
    expect(closed).toBe(true)
    await upstream.close()
  })
})
