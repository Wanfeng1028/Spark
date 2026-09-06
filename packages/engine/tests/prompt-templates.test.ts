/**
 * 提示词模板层单测（阶段十三工单 13.3 / V2-16）：
 * ① 缺省同一性——不配置时三处提示词逐字节不变（验收第 1 条的锁）；
 * ② 自定义模板生效（文件路径相对 spark.json 所在目录 + 三个白名单占位符渲染）；
 * ③ 占位符白名单封闭集（非白名单 `{{...}}`、含带空格形 → E_CONFIG）；
 * ④ fail-closed：缺文件 / 坏占位符 / spark.json prompts 段形状非法 / Engine 构造期拒启动。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { platform, tmpdir } from 'node:os'
import { afterEach, describe, expect, test } from 'vitest'
import { BASE_PROMPT, buildSystemPrompt } from '../src/prompts.js'
import { COMPACTION_PROMPT } from '../src/compaction.js'
import { TITLE_PROMPT } from '../src/title.js'
import {
  assertPlaceholders,
  loadPromptTemplates,
  renderPromptTemplate,
  type PromptTemplates,
} from '../src/prompt-templates.js'
import { loadConfig } from '../src/config.js'
import { Engine } from '../src/engine.js'

/** 引擎内置三处提示词 = 缺省模板（与 Engine 构造期传入的 defaults 同源） */
const DEFAULTS: PromptTemplates = {
  base: BASE_PROMPT,
  compaction: COMPACTION_PROMPT,
  title: TITLE_PROMPT,
}

/** loadConfig 要求 models.json 的 defaultModel 必填——最小合法文档 */
const MODELS_JSON = JSON.stringify({
  providers: { fake: { apiKeyEnv: null } },
  defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
})

const roots: string[] = []

/** 临时配置根（= spark.json 所在目录）；用例结束统一回收 */
function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'spark-prompts-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
}

/** ConfigError 断言：code=E_CONFIG（server 侧据此映射 400） */
function expectConfigError(fn: () => unknown, pattern: RegExp): void {
  try {
    fn()
  } catch (err) {
    const e = err as { code?: string; message: string }
    expect(e.code).toBe('E_CONFIG')
    expect(e.message).toMatch(pattern)
    return
  }
  throw new Error('预期抛 ConfigError，实际未抛')
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      // 句柄未释放的目录跳过清理（交系统临时目录回收）
    }
  }
})

describe('缺省同一性（工单 13.3 验收第 1 条）', () => {
  test('未配置 prompts 段 → 原样返回内置模板对象', () => {
    const root = makeRoot({})
    expect(loadPromptTemplates(root, undefined, DEFAULTS)).toBe(DEFAULTS)
  })

  test('内置三处模板无占位符 → 渲染后逐字节不变', () => {
    const vars = { cwd: join(tmpdir(), 'anywhere'), model: 'fake/fake-chat' }
    expect(renderPromptTemplate(BASE_PROMPT, vars)).toBe(BASE_PROMPT)
    expect(renderPromptTemplate(COMPACTION_PROMPT, vars)).toBe(COMPACTION_PROMPT)
    expect(renderPromptTemplate(TITLE_PROMPT, vars)).toBe(TITLE_PROMPT)
  })

  test('system 组装全链路同一性：缺省调用 == 传入渲染后内置模板', () => {
    const cwd = join(tmpdir(), 'anywhere')
    const now = new Date('2026-09-07T00:00:00.000Z')
    const rendered = renderPromptTemplate(BASE_PROMPT, { cwd, model: 'fake/fake-chat' })
    expect(buildSystemPrompt(cwd, now, rendered)).toBe(buildSystemPrompt(cwd, now))
  })
})

describe('自定义模板生效', () => {
  test('prompts.base 指向文件 → 装载为模板原文，另两处沿用内置', () => {
    const root = makeRoot({
      'prompts/base.md': 'CUSTOM BASE cwd={{cwd}} model={{model}} plat={{platform}}',
    })
    const loaded = loadPromptTemplates(root, { base: 'prompts/base.md' }, DEFAULTS)
    expect(loaded.base).toBe('CUSTOM BASE cwd={{cwd}} model={{model}} plat={{platform}}')
    expect(loaded.compaction).toBe(COMPACTION_PROMPT)
    expect(loaded.title).toBe(TITLE_PROMPT)
  })

  test('三个白名单占位符各自替换（platform 由模块自取）', () => {
    const rendered = renderPromptTemplate('cwd={{cwd}} model={{model}} plat={{platform}}', {
      cwd: '/work',
      model: 'fake/fake-chat',
    })
    expect(rendered).toBe(`cwd=/work model=fake/fake-chat plat=${platform()}`)
  })

  test('自定义 base 渲染后进 system 组装（首段即模板文本）', () => {
    const root = makeRoot({ 'prompts/base.md': 'CUSTOM BASE {{cwd}}' })
    const loaded = loadPromptTemplates(root, { base: 'prompts/base.md' }, DEFAULTS)
    const system = buildSystemPrompt(
      '/work',
      new Date('2026-09-07T00:00:00.000Z'),
      renderPromptTemplate(loaded.base, { cwd: '/work', model: 'fake/fake-chat' }),
    )
    expect(system.startsWith('CUSTOM BASE /work')).toBe(true)
    expect(system).toContain('# Environment') // 环境块与项目指引段不因换基座而丢
  })

  test('compaction/title 也可各自单独覆盖', () => {
    const root = makeRoot({
      'p/compact.txt': 'CUSTOM COMPACT {{model}}',
      'p/title.txt': 'CUSTOM TITLE',
    })
    const loaded = loadPromptTemplates(
      root,
      { compaction: 'p/compact.txt', title: 'p/title.txt' },
      DEFAULTS,
    )
    expect(loaded.base).toBe(BASE_PROMPT)
    expect(renderPromptTemplate(loaded.compaction, { cwd: '/w', model: 'p/m' })).toBe(
      'CUSTOM COMPACT p/m',
    )
    expect(loaded.title).toBe('CUSTOM TITLE')
  })
})

describe('占位符白名单（封闭集）', () => {
  test('三个白名单占位符通过校验', () => {
    expect(() => assertPlaceholders('{{cwd}} {{model}} {{platform}}', 'prompts.base')).not.toThrow()
  })

  test('非白名单占位符 → E_CONFIG', () => {
    expectConfigError(() => assertPlaceholders('{{secret}}', 'prompts.base'), /非白名单占位符/)
  })

  test('带空格的白名单形 {{ cwd }} 也算非白名单（精确匹配口径）→ E_CONFIG', () => {
    expectConfigError(() => assertPlaceholders('{{ cwd }}', 'prompts.base'), /非白名单占位符/)
  })

  test('单花括号与无占位符文本不受影响', () => {
    expect(() => assertPlaceholders('json { "a": 1 } 与 {single}', 'prompts.base')).not.toThrow()
  })
})

describe('fail-closed（宁拒启动不静默降级）', () => {
  test('模板文件缺失 → E_CONFIG', () => {
    const root = makeRoot({})
    expectConfigError(
      () => loadPromptTemplates(root, { base: 'prompts/missing.md' }, DEFAULTS),
      /模板文件读取失败/,
    )
  })

  test('模板含非白名单占位符 → E_CONFIG（装载期即拒，不等到渲染）', () => {
    const root = makeRoot({ 'prompts/bad.md': '泄露 {{env.API_KEY}} 的模板' })
    expectConfigError(
      () => loadPromptTemplates(root, { base: 'prompts/bad.md' }, DEFAULTS),
      /非白名单占位符/,
    )
  })

  test('spark.json prompts 段被 loadConfig 接受并原样透传', () => {
    const root = makeRoot({
      'models.json': MODELS_JSON,
      'spark.json': JSON.stringify({ version: 1, prompts: { base: 'prompts/base.md' } }),
      'prompts/base.md': 'CUSTOM BASE',
    })
    expect(loadConfig(root).spark.prompts?.base).toBe('prompts/base.md')
  })

  test('spark.json prompts 段含未知键 → E_CONFIG（strictObject）', () => {
    const root = makeRoot({
      'models.json': MODELS_JSON,
      'spark.json': JSON.stringify({ version: 1, prompts: { base: 'a.md', nope: 'b.md' } }),
    })
    expectConfigError(() => loadConfig(root), /spark\.json 校验失败/)
  })

  test('Engine 构造期拒启动：坏模板 = 引擎不起来（不是静默用内置）', () => {
    const root = makeRoot({
      'models.json': MODELS_JSON,
      'spark.json': JSON.stringify({ version: 1, prompts: { base: 'prompts/bad.md' } }),
      'prompts/bad.md': 'CUSTOM {{notAllowed}}',
    })
    expectConfigError(() => new Engine({ root }), /非白名单占位符/)
  })
})
