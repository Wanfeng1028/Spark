/**
 * 图片附件路由单测（阶段十二工单 12.2a）：
 * POST /api/sessions/:id/attachments——合法 png 201 落盘 / 类型拒绝 415 / 空体 400 / 超限 413；
 * GET /api/attachments/:file——取回字节与 content-type；白名单内不存在 404。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeServer } from './helpers.js'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

interface AttachmentView {
  id: string
  file: string
  mime: string
  size: number
  name: string
}

/** inject().json() 返回面宽——统一窄化入口（其余用例同 routes.test.ts 的 jsonOf 模式） */
function sidOf(created: { json: () => { id: string } }): string {
  return created.json().id
}

describe('POST /api/sessions/:id/attachments（工单 12.2a）', () => {
  it('合法 png → 201 + dto + 落盘 attachments/', async () => {
    const f = await makeServer()
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = sidOf(created)

    const res = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/attachments`,
      headers: { 'content-type': 'image/png', 'x-file-name': encodeURIComponent('截图.png') },
      payload: PNG_1PX,
    })
    expect(res.statusCode).toBe(201)
    const dto: AttachmentView = res.json()
    expect(dto.mime).toBe('image/png')
    expect(dto.size).toBe(PNG_1PX.length)
    expect(dto.file).toMatch(/\.png$/)
    expect(dto.name).toBe('截图.png')
    expect(existsSync(join(f.root, 'attachments', dto.file))).toBe(true)
  })

  it('非图片类型 → 415', async () => {
    const f = await makeServer()
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = sidOf(created)
    const res = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/attachments`,
      headers: { 'content-type': 'application/zip' },
      payload: Buffer.from('PK'),
    })
    expect(res.statusCode).toBe(415)
  })

  it('空体 → 400', async () => {
    const f = await makeServer()
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = sidOf(created)
    const res = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/attachments`,
      headers: { 'content-type': 'image/png' },
      payload: Buffer.alloc(0),
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/attachments/:file（工单 12.2a）', () => {
  it('取回字节与 content-type；白名单内不存在 → 404', async () => {
    const f = await makeServer()
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = sidOf(created)
    const up = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/attachments`,
      headers: { 'content-type': 'image/png', 'x-file-name': 'a.png' },
      payload: PNG_1PX,
    })
    const upView: AttachmentView = up.json()
    const file = upView.file

    const res = await f.app.inject({ method: 'GET', url: `/api/attachments/${file}` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
    expect(res.rawPayload?.length).toBe(PNG_1PX.length) // 二进制走 rawPayload（body 字符串化会坏）

    const bad = await f.app.inject({
      method: 'GET',
      url: `/api/attachments/${'0'.repeat(32)}.png`,
    })
    // 白名单格式内但文件不存在 → 404（格式非法则 zod 400——另一条路径）
    expect(bad.statusCode).toBe(404)
  })
})

describe('LA-47：附件按会话分目录', () => {
  it('上传落 attachments/<sid>/，file 带 sid 前缀；GET 通配段两形态并存', async () => {
    const f = await makeServer()
    const created = await f.app.inject({ method: 'POST', url: '/api/sessions', payload: {} })
    const sid = sidOf(created)

    const res = await f.app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/attachments`,
      headers: { 'content-type': 'image/png', 'x-file-name': 'a.png' },
      payload: PNG_1PX,
    })
    expect(res.statusCode).toBe(201)
    const dto: AttachmentView = res.json()
    // file 带会话前缀 + 落在会话子目录
    expect(dto.file).toBe(`${sid}/${dto.file.split('/')[1] ?? ''}`)
    expect(existsSync(join(f.root, 'attachments', sid, dto.file.split('/')[1] ?? ''))).toBe(true)

    // 新形态 GET
    const got = await f.app.inject({ method: 'GET', url: `/api/attachments/${dto.file}` })
    expect(got.statusCode).toBe(200)
    expect(got.headers['content-type']).toContain('image/png')
  })

  it('历史平铺形态（无 sid 前缀）GET 兼容；路径分量（..）→ 404', async () => {
    const f = await makeServer()
    // 手工放一份历史平铺文件（升级前落盘形态）
    const legacy = `${'a'.repeat(32)}.png`
    mkdirSync(join(f.root, 'attachments'), { recursive: true })
    writeFileSync(join(f.root, 'attachments', legacy), PNG_1PX)

    const got = await f.app.inject({ method: 'GET', url: `/api/attachments/${legacy}` })
    expect(got.statusCode).toBe(200)
    expect(got.rawPayload?.length).toBe(PNG_1PX.length)

    // 正则把守路径分量：.. 形态匹配不上白名单 → 404（非 500/穿越）
    const evil = await f.app.inject({ method: 'GET', url: '/api/attachments/ses_x%2F..%2F..%2Fmcp.json' })
    expect(evil.statusCode).toBe(404)
  })
})
