/**
 * 公共面不变量网（工单 14.1 / doc/02 §4.6）：
 * ① 公共入口的**值导出**恰为白名单——新增公共导出必须同时改本表与 doc/02 §4.6 裁决表
 *    （扩大对外承诺是有成本的决定，不许悄悄发生）；
 * ② 被收窄的内部件确实不在公共入口上（ScriptedLlm/SessionStore/EventBus/COMPACTION_PROMPT/
 *    CostTracker 等抽验）；
 * ③ 内部入口转出公共面（内部消费者只需一个入口）；
 * ④ **生产代码（apps/*\/src 与 packages/*\/src）不得引用 `@spark/engine/internal`**——
 *    把验收里的"grep 证明"固化成断言，防回归。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import * as publicApi from '../src/index.js'
import * as internalApi from '../src/index-internal.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')

/** 公共入口的值导出白名单（类型导出是编译期的，不在运行时键里——见 doc/02 §4.6 裁决表） */
const PUBLIC_VALUES = [
  'ConfigError',
  'Engine',
  'Logger',
  'SPARK_VERSION',
  'ZERO_USAGE',
  'addUsage',
  'buildTrace',
  'loadConfig',
  'loadMcpConfig',
  'newIds',
  'resolveInRoot',
  'ulid',
  'writeMcpConfig',
] as const

/** 抽验：这些必须是内部件（曾在公共入口裸露，14.1 收窄） */
const INTERNAL_ONLY = [
  'COMPACTION_PROMPT',
  'CompactorImpl',
  'CostTracker',
  'EventBus',
  'EventTree',
  'FallbackGateway',
  'GitCheckpointer',
  'MemoryStore',
  'PermissionServiceImpl',
  'PiGateway',
  'ProjectorImpl',
  'ScriptedLlm',
  'SecretStore',
  'SessionRuntime',
  'SessionStore',
  'ToolPipelineImpl',
  'ToolRegistry',
  'UserHookRunner',
  'mungeDir',
  'runTurn',
] as const

/**
 * 生产代码里的 internal **引用**：只匹配 import/export 的模块标识符，不匹配注释与文档里的
 * 散文提及（engine 自己的 index.ts / index-internal.ts 头注释就写着这个子路径，裸子串扫描会误报）。
 */
const INTERNAL_IMPORT_RE = /(?:from|import)\s*['"]@spark\/engine\/internal['"]/

/** 递归收集目录下指定扩展名的文件（只走 src，不进 node_modules/dist） */
function collectSources(dir: string, exts: readonly string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      collectSources(p, exts, out)
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(p)
    }
  }
  return out
}

describe('公共入口（工单 14.1）', () => {
  test('值导出恰为白名单（多一个少一个都红）', () => {
    expect(Object.keys(publicApi).sort()).toEqual([...PUBLIC_VALUES].sort())
  })

  test('内部件不在公共入口上', () => {
    const leaked = INTERNAL_ONLY.filter((name) => name in publicApi)
    expect(leaked).toEqual([])
  })

  test('内部入口转出公共面 + 承载内部件（单一入口够用）', () => {
    for (const name of PUBLIC_VALUES) {
      expect(name in internalApi, `内部入口缺公共符号 ${name}`).toBe(true)
    }
    for (const name of INTERNAL_ONLY) {
      expect(name in internalApi, `内部入口缺内部件 ${name}`).toBe(true)
    }
  })
})

describe('生产代码不得消费 internal（工单 14.1 验收）', () => {
  test('apps/*/src 与 packages/*/src 无 @spark/engine/internal 引用', () => {
    const exts = ['.ts', '.tsx'] as const
    const roots: string[] = []
    for (const area of ['apps', 'packages']) {
      for (const pkg of readdirSync(join(repoRoot, area))) {
        const src = join(repoRoot, area, pkg, 'src')
        try {
          if (statSync(src).isDirectory()) roots.push(src)
        } catch {
          // 无 src 目录的包（如纯文档包）跳过
        }
      }
    }
    expect(roots.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const root of roots) {
      for (const file of collectSources(root, exts)) {
        if (INTERNAL_IMPORT_RE.test(readFileSync(file, 'utf8'))) {
          offenders.push(file.slice(repoRoot.length + 1))
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
