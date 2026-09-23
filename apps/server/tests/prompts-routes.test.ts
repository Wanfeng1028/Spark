/**
 * 提示词模板管理（阶段十九 19.18 / V2-16 前端半边收口）server 侧单测：
 * GET /api/prompts 三槽位快照（内置模板 + 未覆盖 + 占位符白名单）；
 * PUT 写文件（落盘 + spark.json prompts 指向它）+ 空 content 恢复缺省（删配置）；
 * 非白名单占位符 → 400 不落盘（fail-closed，防注入面扩大）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { PromptsDto } from '@spark/protocol'
import { makeServer } from './helpers.js'
import type { ServerFixture } from './helpers.js'

/**
 * updatePrompt 经 persistSparkPatch 写 spark.json 后 loadConfig 全量重载（同 PUT settings）——
 * 夹具直注入 config、磁盘无 models.json 时重载即抛，被路由的 catch 归 400。
 * 本包写盘用例的既有纪律，判例见 settings.test.ts。
 */
function seedModelsJson(root: string): void {
  writeFileSync(
    join(root, 'models.json'),
    JSON.stringify({
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
    }),
  )
}

describe('提示词模板管理（阶段十九 19.18 / V2-16）', () => {
  let f: ServerFixture

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  test('GET：三槽位内置态 + 占位符白名单', async () => {
    f = await makeServer({})
    const res = await f.app.inject({ method: 'GET', url: '/api/prompts' })
    expect(res.statusCode).toBe(200)
    const body: PromptsDto = res.json()
    expect(body.slots.map((s) => s.slot)).toEqual(['base', 'compaction', 'title'])
    for (const s of body.slots) {
      expect(s.overridden).toBe(false)
      expect(s.path).toBeNull()
      expect(s.content.length).toBeGreaterThan(0)
    }
    expect(body.placeholders).toContain('{{cwd}}')
    expect(body.placeholders).toContain('{{model}}')
  })

  test('PUT：写模板文件 + spark.json 指向它（重启档）', async () => {
    f = await makeServer({})
    seedModelsJson(f.root)
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/prompts',
      payload: { slot: 'title', content: '标题模板：{{model}} 在 {{cwd}}' },
    })
    expect(res.statusCode).toBe(200)
    const body: PromptsDto = res.json()
    const title = body.slots.find((s) => s.slot === 'title')
    expect(title?.overridden).toBe(true)
    expect(title?.path).toBe(join('prompts', 'title.md'))
    // 文件真落盘
    const abs = join(f.root, 'prompts', 'title.md')
    expect(existsSync(abs)).toBe(true)
    expect(readFileSync(abs, 'utf8')).toBe('标题模板：{{model}} 在 {{cwd}}')
    // spark.json 配置指向它
    const spark = JSON.parse(readFileSync(join(f.root, 'spark.json'), 'utf8')) as {
      prompts?: { title?: string }
    }
    expect(spark.prompts?.title).toBe(join('prompts', 'title.md'))
  })

  test('PUT 空 content = 恢复缺省（删配置，文件保留）', async () => {
    f = await makeServer({})
    seedModelsJson(f.root)
    await f.app.inject({
      method: 'PUT',
      url: '/api/prompts',
      payload: { slot: 'title', content: 'x' },
    })
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/prompts',
      payload: { slot: 'title', content: '' },
    })
    expect(res.statusCode).toBe(200)
    const body: PromptsDto = res.json()
    const title = body.slots.find((s) => s.slot === 'title')
    expect(title?.overridden).toBe(false)
    // 文件仍在（删文件属 §2.10 人类决策）
    expect(existsSync(join(f.root, 'prompts', 'title.md'))).toBe(true)
    const spark = JSON.parse(readFileSync(join(f.root, 'spark.json'), 'utf8')) as {
      prompts?: { title?: string }
    }
    expect(spark.prompts?.title).toBeUndefined()
  })

  test('PUT 非白名单占位符 → 400 不落盘（fail-closed）', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/prompts',
      payload: { slot: 'base', content: '泄露：{{secrets}}' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('E_CONFIG')
    expect(existsSync(join(f.root, 'prompts', 'base.md'))).toBe(false)
  })

  test('PUT 未知槽位 → 400', async () => {
    f = await makeServer({})
    const res = await f.app.inject({
      method: 'PUT',
      url: '/api/prompts',
      payload: { slot: 'nope', content: 'x' },
    })
    expect(res.statusCode).toBe(400)
  })
})
