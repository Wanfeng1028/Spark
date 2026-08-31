/**
 * content-type 空 body 口径单测（工单 10.12）：
 * 真实浏览器的 fetch 可能对无 body 的 POST 自动带上 content-type: application/json，
 * Fastify 5 缺省解析器对「application/json + 空 body」在路由前即拒
 * （FST_ERR_CTP_EMPTY_JSON_BODY）——既有 inject 用例不带该 header，缺陷因此被掩盖。
 * 本文件显式复现「带 header + 空 body」口径：
 * 1) 宽容解析器把空 body 当未带 body → 路由照常命中（配对码签发/连通测试）；
 * 2) 坏 JSON 经解析器抛错 → setErrorHandler 收编为统一 {code, message}（E_VALIDATION），
 *    框架层错误不再绕过协议端 error-copy 词表。
 */
import { afterEach, describe, expect, test } from 'vitest'
import type { ModelTestResultDto, PairCodeDto } from '@spark/protocol'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

describe('content-type + 空 body 口径（工单 10.12——真实浏览器形态复现）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  test('POST /api/pair/code：带 content-type 空 body 照常签发（不被框架层拒）', async () => {
    f = await makeServer({ pairing: { authRequired: false } })
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/pair/code',
      headers: { 'content-type': 'application/json' }, // 有 header 无 payload = 缺陷复现口径
    })
    expect(res.statusCode).toBe(200)
    const dto: PairCodeDto = res.json()
    expect(dto.code).toMatch(/^\d{6}$/)
  })

  test('POST /api/models/:providerId/test：带 content-type 空 body 照常执行连通测试', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/models/fake/test',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(200)
    const dto: ModelTestResultDto = res.json()
    expect(dto.provider).toBe('fake')
    // 夹具无密钥：结果是语义失败（缺 Key 人话文案），而不是框架层 400
    expect(dto.ok).toBe(false)
    expect(dto.message).toContain('API Key')
  })

  test('坏 JSON 体：统一 {code, message} 形态（setErrorHandler 收编，不走框架默认形状）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'content-type': 'application/json' },
      payload: '{不是 JSON',
    })
    expect(res.statusCode).toBe(400)
    const body: { code: string; message: string } = res.json()
    expect(body.code).toBe('E_VALIDATION')
    expect(typeof body.message).toBe('string')
  })

  test('既有口径回归：正常 JSON 体解析不受影响', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { title: '空 body 口径回归' }, // inject 自动带 content-type
    })
    expect(res.statusCode).toBe(201)
    const dto: { title?: string } = res.json()
    expect(dto.title).toBe('空 body 口径回归')
  })
})
