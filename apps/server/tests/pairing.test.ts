/**
 * 配对鉴权单测（阶段九工单 9.1 / ADR D24）：
 * - 纯函数（环回判定）与 DeviceStore/PairService 生命周期；
 * - 路由四端点（环回缺省口径：行为不变红线回归）；
 * - 非环回口径（inject 注入 remoteAddress）：无 token 401 / Bearer 与 ?token= 同口径 /
 *   豁免路径（healthz、兑换口）；
 * - 撤销即断：真实 listen，带 token 的 SSE 在 DELETE 设备后收 bye 帧断开。
 */
import { writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ConfigError } from '@spark/engine'
import type { PairCodeDto, PairStatusDto, PairTokenDto } from '@spark/protocol'
import { redactTokenQuery } from '../src/auth.js'
import {
  DeviceStore,
  PairService,
  PAIR_CODE_MAX_FAILURES,
  PAIR_CODE_TTL_MS,
  isLoopbackHost,
  isLoopbackRemote,
  resolveBindTarget,
} from '../src/pairing.js'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

const REMOTE = '192.168.1.50' // 非环回对端（注入 remoteAddress 模拟局域网设备）

async function tmpDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

describe('环回判定纯函数', () => {
  test('监听地址：127.* / ::1 / localhost 为环回；0.0.0.0 与具体网卡地址不是', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('127.0.0.5')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
    expect(isLoopbackHost('::')).toBe(false)
    expect(isLoopbackHost('192.168.1.10')).toBe(false)
  })

  test('对端地址：含 IPv4 映射形态；undefined 按非环回（失败闭合）', () => {
    expect(isLoopbackRemote('127.0.0.1')).toBe(true)
    expect(isLoopbackRemote('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackRemote('::1')).toBe(true)
    expect(isLoopbackRemote(REMOTE)).toBe(false)
    expect(isLoopbackRemote(undefined)).toBe(false)
  })
})

describe('启动绑定护栏 resolveBindTarget（ADR D24 绑定纪律）', () => {
  test('SPARK_HOST 非环回无条件拒（环回红线：即使鉴权已启用也不放行）', () => {
    expect(() => resolveBindTarget('192.168.1.10', '127.0.0.1', true)).toThrow(ConfigError)
    expect(() => resolveBindTarget('0.0.0.0', '127.0.0.1', true)).toThrow(ConfigError)
  })

  test('非环回未启用鉴权拒（fail-closed）', () => {
    expect(() => resolveBindTarget(undefined, '0.0.0.0', false)).toThrow(ConfigError)
    expect(() => resolveBindTarget(undefined, '192.168.1.10', false)).toThrow(ConfigError)
  })

  test('合法组合放行：非环回显式配置 + 鉴权已启用；SPARK_HOST 环回覆盖', () => {
    expect(resolveBindTarget(undefined, '192.168.1.10', true)).toBe('192.168.1.10')
    expect(resolveBindTarget(undefined, '0.0.0.0', true)).toBe('0.0.0.0')
    // 桌面壳 sidecar：SPARK_HOST 环回覆盖优先于配置（此时不要求鉴权）
    expect(resolveBindTarget('127.0.0.5', '192.168.1.10', false)).toBe('127.0.0.5')
  })

  test('缺省环回放行（行为不变红线）', () => {
    expect(resolveBindTarget(undefined, '127.0.0.1', false)).toBe('127.0.0.1')
    expect(resolveBindTarget('::1', '127.0.0.1', false)).toBe('::1')
  })
})

describe('DeviceStore', () => {
  test('文件不存在：未启用、空列表', async () => {
    const store = new DeviceStore(join(await tmpDir('spark-devstore-'), 'devices.json'))
    expect(store.enabled).toBe(false)
    expect(store.list()).toEqual([])
  })

  test('坏 JSON 拒载：ConfigError（E_CONFIG，入口同护栏人话退出；不带病运行，同 secrets 纪律）', async () => {
    const path = join(await tmpDir('spark-devbad-'), 'devices.json')
    writeFileSync(path, '{ 不是 JSON')
    let caught: unknown
    try {
      new DeviceStore(path)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ConfigError)
    expect(caught instanceof ConfigError ? caught.code : '').toBe('E_CONFIG') // 退出前缀 `${code}: ` 的数据源
    writeFileSync(path, JSON.stringify({ version: 2, devices: [] }))
    expect(() => new DeviceStore(path)).toThrow(ConfigError)
  })

  test('add 落盘后重载可见；remove 同样持久化', async () => {
    const path = join(await tmpDir('spark-devstore-'), 'devices.json')
    const store = new DeviceStore(path)
    const rec = store.add('手机', 'hash-a', 1000)
    expect(new DeviceStore(path).list()).toHaveLength(1)
    expect(new DeviceStore(path).findByTokenHash('hash-a')?.name).toBe('手机')
    store.remove(rec.id)
    expect(new DeviceStore(path).list()).toEqual([])
  })

  test('touch 节流：1min 内不落盘，超阈更新 lastSeenAt', async () => {
    const path = join(await tmpDir('spark-devstore-'), 'devices.json')
    const store = new DeviceStore(path)
    store.add('手机', 'hash-a', 1000)
    store.touch('hash-a', 2000) // <60s：内存更新不落盘，磁盘值不变
    expect(new DeviceStore(path).findByTokenHash('hash-a')?.lastSeenAt).toBe(1000)
    store.touch('hash-a', 70_000) // >60s：落盘
    expect(new DeviceStore(path).findByTokenHash('hash-a')?.lastSeenAt).toBe(70_000)
  })
})

describe('PairService 生命周期', () => {
  test('未启用即兑换 → E_PAIR_DISABLED（fail-closed）', async () => {
    const store = new DeviceStore(join(await tmpDir('spark-pair-'), 'devices.json'))
    const pair = new PairService(store)
    expect(() => pair.redeem('123456', '手机')).toThrow(/^E_PAIR_DISABLED/)
  })

  test('签发→兑换成功；重放/无码/过期一律拒绝', async () => {
    const store = new DeviceStore(join(await tmpDir('spark-pair-'), 'devices.json'))
    let nowMs = 1_000_000
    const pair = new PairService(store, () => nowMs)

    const { code, expiresAt } = pair.createCode()
    expect(code).toMatch(/^\d{6}$/)
    expect(expiresAt).toBe(nowMs + PAIR_CODE_TTL_MS)
    expect(store.enabled).toBe(true) // 签发即落盘启用鉴权

    const { token, device } = pair.redeem(code, '手机')
    expect(token).toMatch(/^spk_/)
    expect(device.name).toBe('手机')
    expect(() => pair.redeem(code, '手机')).toThrow(/^E_PAIR:/) // 一次性：重放拒绝
    expect(() => pair.redeem('000000', '手机')).toThrow(/^E_PAIR:/) // 无在途码拒绝

    const { code: code2 } = pair.createCode()
    nowMs += PAIR_CODE_TTL_MS + 1 // 超过 60s：过期拒绝
    expect(() => pair.redeem(code2, '手机')).toThrow(/^E_PAIR:/)
  })

  test('连续 5 次失败作废在途码（防暴力穷举）；新签发复位计数', async () => {
    const store = new DeviceStore(join(await tmpDir('spark-pair-'), 'devices.json'))
    const pair = new PairService(store)
    const { code } = pair.createCode()
    const wrong = code === '000000' ? '000001' : '000000'
    for (let i = 0; i < PAIR_CODE_MAX_FAILURES; i++) {
      expect(() => pair.redeem(wrong, '手机')).toThrow(/^E_PAIR:/)
    }
    // 在途码已作废：第 6 次即使输入正确码也被拒（须重新签发）
    expect(() => pair.redeem(code, '手机')).toThrow(/^E_PAIR:/)
    // 重新签发复位失败计数：新码立即可兑（成功兑换同样复位）
    const { code: fresh } = pair.createCode()
    expect(pair.redeem(fresh, '手机').token).toMatch(/^spk_/)
  })
})

describe('配对路由（环回缺省口径——行为不变红线）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  async function setup(): Promise<void> {
    f = await makeServer({ pairing: { authRequired: false } })
  }

  test('GET /api/pair：缺省环回未启用', async () => {
    await setup()
    const res = await f.app.inject({ method: 'GET', url: '/api/pair' })
    expect(res.statusCode).toBe(200)
    const status: PairStatusDto = res.json()
    expect(status.loopback).toBe(true)
    expect(status.authEnabled).toBe(false)
    expect(status.devices).toEqual([])
  })

  test('签发→兑换→设备列表→撤销全链路', async () => {
    await setup()
    const codeRes = await f.app.inject({ method: 'POST', url: '/api/pair/code' })
    expect(codeRes.statusCode).toBe(200)
    const dto: PairCodeDto = codeRes.json()
    expect(dto.code).toMatch(/^\d{6}$/)
    expect(dto.qr).toBe(`spark://pair?host=127.0.0.1&port=4318&code=${dto.code}`)

    // 签发即启用鉴权
    const status1: PairStatusDto = (await f.app.inject({ method: 'GET', url: '/api/pair' })).json()
    expect(status1.authEnabled).toBe(true)

    const redeemRes = await f.app.inject({
      method: 'POST',
      url: '/api/pair',
      payload: { code: dto.code, name: '我的手机' },
    })
    expect(redeemRes.statusCode).toBe(200)
    const redeemed: PairTokenDto = redeemRes.json()
    expect(redeemed.token).toMatch(/^spk_/)

    const status2: PairStatusDto = (await f.app.inject({ method: 'GET', url: '/api/pair' })).json()
    expect(status2.devices).toHaveLength(1)
    expect(status2.devices[0]?.name).toBe('我的手机')

    // 撤销：存在 → ok；不存在 → 404
    const del = await f.app.inject({
      method: 'DELETE',
      url: `/api/pair/devices/${status2.devices[0]?.id}`,
    })
    expect(del.statusCode).toBe(200)
    const afterRevoke: PairStatusDto = (await f.app.inject({ method: 'GET', url: '/api/pair' })).json()
    expect(afterRevoke.devices).toEqual([])
    const del404 = await f.app.inject({ method: 'DELETE', url: '/api/pair/devices/dev_none' })
    expect(del404.statusCode).toBe(404)
  })

  test('兑换拒绝：未启用 403 / 错码 401', async () => {
    await setup()
    const disabled = await f.app.inject({
      method: 'POST',
      url: '/api/pair',
      payload: { code: '123456' },
    })
    expect(disabled.statusCode).toBe(403)
    const disabledBody: { code: string } = disabled.json()
    expect(disabledBody.code).toBe('E_PAIR_DISABLED')

    const codeRes = await f.app.inject({ method: 'POST', url: '/api/pair/code' })
    const dto: PairCodeDto = codeRes.json()
    const wrong = await f.app.inject({
      method: 'POST',
      url: '/api/pair',
      payload: { code: dto.code === '000000' ? '000001' : '000000' },
    })
    expect(wrong.statusCode).toBe(401)
    const wrongBody: { code: string } = wrong.json()
    expect(wrongBody.code).toBe('E_PAIR')
  })

  test('缺省形态回归：无鉴权时既有端点照常（红线）', async () => {
    await setup()
    const res = await f.app.inject({ method: 'GET', url: '/api/sessions' })
    expect(res.statusCode).toBe(200)
  })
})

describe('鉴权钩子（非环回口径）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  async function pairToken(): Promise<string> {
    const codeRes = await f.app.inject({ method: 'POST', url: '/api/pair/code' })
    const { code }: PairCodeDto = codeRes.json()
    const redeemRes = await f.app.inject({
      method: 'POST',
      url: '/api/pair',
      payload: { code },
    })
    const redeemed: PairTokenDto = redeemRes.json()
    return redeemed.token
  }

  test('非环回对端无 token：REST 与 SSE 同口径 401；环回对端豁免', async () => {
    f = await makeServer({ pairing: { authRequired: true } })
    const rest = await f.app.inject({ method: 'GET', url: '/api/sessions', remoteAddress: REMOTE })
    expect(rest.statusCode).toBe(401)
    const restBody: { code: string } = rest.json()
    expect(restBody.code).toBe('E_AUTH')

    const sse = await f.app.inject({ method: 'GET', url: '/api/event', remoteAddress: REMOTE })
    expect(sse.statusCode).toBe(401)

    // 环回对端（缺省 inject）豁免：无 token 照常
    const loop = await f.app.inject({ method: 'GET', url: '/api/sessions' })
    expect(loop.statusCode).toBe(200)
  })

  test('Bearer 头与 ?token= 查询参数同口径放行；伪造拒绝', async () => {
    f = await makeServer({ pairing: { authRequired: true } })
    const token = await pairToken()

    const viaHeader = await f.app.inject({
      method: 'GET',
      url: '/api/sessions',
      remoteAddress: REMOTE,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(viaHeader.statusCode).toBe(200)

    const viaQuery = await f.app.inject({
      method: 'GET',
      url: '/api/sessions',
      remoteAddress: REMOTE,
      query: { token },
    })
    expect(viaQuery.statusCode).toBe(200)

    const forged = await f.app.inject({
      method: 'GET',
      url: '/api/sessions',
      remoteAddress: REMOTE,
      headers: { authorization: 'Bearer spk_forged' },
    })
    expect(forged.statusCode).toBe(401)
  })

  test('豁免路径：healthz 与兑换口对非环回开放（兑换口由短码保护）', async () => {
    f = await makeServer({ pairing: { authRequired: true } })
    const health = await f.app.inject({ method: 'GET', url: '/api/healthz', remoteAddress: REMOTE })
    expect(health.statusCode).toBe(200)

    // 无 token 可达（鉴权自举）：签发后从非环回对端兑换成功；错码仍拒绝（短码保护）
    const codeRes = await f.app.inject({ method: 'POST', url: '/api/pair/code' })
    const { code }: PairCodeDto = codeRes.json()
    const redeem = await f.app.inject({
      method: 'POST',
      url: '/api/pair',
      remoteAddress: REMOTE,
      payload: { code },
    })
    expect(redeem.statusCode).toBe(200)
    const wrong = await f.app.inject({
      method: 'POST',
      url: '/api/pair',
      remoteAddress: REMOTE,
      payload: { code: '123456' },
    })
    expect(wrong.statusCode).toBe(401)
  })

  test('百分号编码路径不得绕过鉴权（评审修复：preHandler 基于路由器解码后模式判断）', async () => {
    f = await makeServer({ pairing: { authRequired: true } })
    // 编码变体解码后均命中 /api/sessions：无 token 一律 401，不得误当静态资源放行
    for (const url of ['/%61pi/sessions', '/ap%69/sessions', '/api/%73essions', '/%61%70%69/sessions']) {
      const res = await f.app.inject({ method: 'GET', url, remoteAddress: REMOTE })
      expect(res.statusCode, url).toBe(401)
      const body: { code: string } = res.json()
      expect(body.code).toBe('E_AUTH')
    }
    // 带有效 token 的编码变体照常放行（解码后 = /api/sessions）
    const token = await pairToken()
    const ok = await f.app.inject({
      method: 'GET',
      url: '/%61pi/sessions',
      remoteAddress: REMOTE,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(ok.statusCode).toBe(200)
    // 未匹配路由（静态 404 兜底）：非数据面豁免，404 而非 401（响应无敏感数据）
    const miss = await f.app.inject({ method: 'GET', url: '/not-a-route', remoteAddress: REMOTE })
    expect(miss.statusCode).toBe(404)
  })

  test('撤销后已持该 token 的请求即被拒（撤销即失效）', async () => {
    f = await makeServer({ pairing: { authRequired: true } })
    const token = await pairToken()
    const status: PairStatusDto = (await f.app.inject({ method: 'GET', url: '/api/pair' })).json()
    const deviceId = status.devices[0]?.id ?? ''

    const del = await f.app.inject({ method: 'DELETE', url: `/api/pair/devices/${deviceId}` })
    expect(del.statusCode).toBe(200)

    const after = await f.app.inject({
      method: 'GET',
      url: '/api/sessions',
      remoteAddress: REMOTE,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(after.statusCode).toBe(401)
  })
})

describe('redactTokenQuery（请求日志 URL 脱敏，评审修复）', () => {
  test('token= 值掩码；其余查询参数保留；无 token 不变', () => {
    expect(redactTokenQuery('/api/event?token=spk_abc123')).toBe('/api/event?token=***')
    expect(redactTokenQuery('/api/event?sessionId=ses_x&since=3&token=spk_abc')).toBe(
      '/api/event?sessionId=ses_x&since=3&token=***',
    )
    expect(redactTokenQuery('/api/sessions?limit=10')).toBe('/api/sessions?limit=10')
    expect(redactTokenQuery('/api/event')).toBe('/api/event')
  })
})

describe('撤销即断：已连 SSE 收 bye 帧断开（真实 listen）', () => {
  test('带 token 的 SSE 在设备撤销后断开', async () => {
    const f = await makeServer({ pairing: { authRequired: false }, heartbeatMs: 100 })
    await f.app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = f.app.server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${port}`
    try {
      // 配对拿 token
      const codeRes = await f.app.inject({ method: 'POST', url: '/api/pair/code' })
      const { code }: PairCodeDto = codeRes.json()
      const redeemRes = await f.app.inject({
        method: 'POST',
        url: '/api/pair',
        payload: { code },
      })
      const redeemed: PairTokenDto = redeemRes.json()
      const token = redeemed.token
      const status: PairStatusDto = (await f.app.inject({ method: 'GET', url: '/api/pair' })).json()
      const deviceId = status.devices[0]?.id ?? ''

      // 带 token 连 SSE（钩子登记哈希 → 撤销可按哈希断连）
      const res = await fetch(`${baseUrl}/api/event?token=${token}`)
      expect(res.status).toBe(200)
      expect(res.body).not.toBeNull()

      // 撤销设备
      const del = await f.app.inject({ method: 'DELETE', url: `/api/pair/devices/${deviceId}` })
      expect(del.statusCode).toBe(200)

      // 流应结束（bye 帧后断）：泵读到 done
      const reader = (res.body as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()
      let text = ''
      const deadline = Date.now() + 2000
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        if (Date.now() > deadline) throw new Error('撤销后 SSE 未断开')
      }
      expect(text).toContain('event: bye')
    } finally {
      f.app.sseCloseAll()
      await f.app.close()
      await f.engine.shutdown()
    }
  })
})
