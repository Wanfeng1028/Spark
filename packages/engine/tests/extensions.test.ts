/**
 * 扩展 loader 单测（工单 16.5 / ADR D38）：发现纪律（坏 id/缺清单/坏清单逐个跳过）
 * + symlink 逃逸拒载（qwen 安全检查）+ 引擎接线（settings.extensions 名单合成
 * enabled 与启停写盘）。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { Engine } from '../src/engine.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import { discoverExtensions } from '../src/extensions/loader.js'
import type { EngineConfig } from '../src/config.js'

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'spark-ext-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
}

const MANIFEST = JSON.stringify({
  name: '演示扩展包',
  version: '1.0.0',
  description: '示例',
  skills: ['demo-ping'],
})

describe('discoverExtensions（发现纪律）', () => {
  test('extensions 目录不存在 → 空清单', async () => {
    expect(await discoverExtensions(makeRoot({}))).toEqual([])
  })

  test('合法扩展带 enabled:true 与 path；坏 id/缺清单/坏 JSON 逐个跳过不阻塞', async () => {
    const warns: string[] = []
    const root = makeRoot({
      'extensions/good-pack/spark-extension.json': MANIFEST,
      'extensions/Bad_ID/spark-extension.json': MANIFEST,
      'extensions/no-manifest/README.md': '不是扩展',
      'extensions/broken-json/spark-extension.json': '{ 不是 JSON',
    })
    const list = await discoverExtensions(root, {
      warn: (msg) => {
        warns.push(msg)
      },
    })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'good-pack', name: '演示扩展包', enabled: true })
    expect(warns.length).toBe(3)
  })

  test('symlink 逃逸拒载：目录内文件软链到扩展根之外 → 该扩展拒载', async () => {
    if (process.platform === 'win32') return // Windows 无符号链接权限时跳过（CI 走 Linux）
    const root = makeRoot({
      'extensions/evil-pack/spark-extension.json': MANIFEST,
      'outside/secret.txt': '敏感内容',
    })
    symlinkSync(join(root, 'outside'), join(root, 'extensions/evil-pack/steal'))
    const list = await discoverExtensions(root)
    expect(list).toHaveLength(0)
  })
})

describe('引擎接线（settings.extensions 名单合成与启停写盘）', () => {
  function makeConfig(): EngineConfig {
    const ref = { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }
    return {
      spark: {
        server: { port: 4318, host: '127.0.0.1' },
        engine: {
          maxStepsPerTurn: 8,
          maxToolParallel: 8,
          toolTimeoutMs: 120_000,
          permissionTimeoutMs: 300_000,
          progressThrottleMs: 200,
          toolOutputLimitKB: 32,
          compactionThreshold: 0.8,
          checkpoints: false,
          bashSandbox: 'off',
        },
      },
      models: {
        providers: { fake: { apiKeyEnv: null } },
        defaultModel: ref,
        compactionModel: ref,
        fallbacks: [],
        titleModel: ref,
        subagentModel: ref,
        costLimitUsd: undefined,
        defaultEffort: undefined,
        models: [ref],
      },
      permissions: { version: 1, rules: [] },
    }
  }

  test('discover → 启停写盘 → 名单合成 enabled=false；getSettings 回显 extensions 段', async () => {
    const cfg = makeConfig()
    // persistSparkPatch 收口走 loadConfig(root) 重载——root 下须有真实 models.json（与注入配置一致）
    const root = makeRoot({
      'extensions/demo-pack/spark-extension.json': MANIFEST,
      'models.json': JSON.stringify({
        providers: cfg.models.providers,
        defaultModel: cfg.models.defaultModel,
      }),
    })
    const engine = new Engine({ root, gateway: new ScriptedLlm(), config: cfg })
    try {
      await engine.ready()
      expect((await engine.listExtensions())[0]?.enabled).toBe(true)
      await engine.setExtensionEnabled('demo-pack', false)
      expect((await engine.listExtensions())[0]?.enabled).toBe(false)
      expect(engine.getSettings().extensions).toEqual({ disabledExtensions: ['demo-pack'] })
      // spark.json 落盘校验（重启档）
      const spark = JSON.parse(
        readFileSync(join(root, 'spark.json'), 'utf8'),
      ) as { extensions?: { disabledExtensions?: string[] } }
      expect(spark.extensions).toEqual({ disabledExtensions: ['demo-pack'] })
      // 重新启用
      await engine.setExtensionEnabled('demo-pack', true)
      expect((await engine.listExtensions())[0]?.enabled).toBe(true)
    } finally {
      await engine.shutdown()
    }
  })
})
