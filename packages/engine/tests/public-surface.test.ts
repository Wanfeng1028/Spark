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
  // 多数据目录迁移（工单 19.16 / ADR D54）：apps/cli/src/migrate.ts 是真实生产消费者
  // （`spark migrate` 两段式确认），故 plan/run/错误类进公共面；home 侧只放 sparkHome，
  // SPARK_HOME_DIR 与 hasExplicitSparkHome/isCurrentHome 留在源模块由本包单测直打
  'MigrationError',
  'SPARK_VERSION',
  'ZERO_USAGE',
  'addUsage',
  // 附件目录单源（工单 19.37）：apps/server 上传/下载两条路由是真实消费者
  'attachmentsDir',
  'buildTrace',
  'loadConfig',
  'loadMcpConfig',
  // MCP 配置读回/掩码合并（RT3-07）：server 路由与 sdk inprocess 共用的装配纯函数
  'maskMcpConfigForClient',
  'mergeMaskedMcpConfig',
  'newIds',
  'planMigration',
  'resolveInRoot',
  'runMigration',
  // DTO 装配纯函数（工单 14.4 / ADR D31）：server 路由与 sdk 的 InProcessTransport 共用
  'sessionDtoOf',
  'sessionMetaDtoOf',
  'sessionTreeToDto',
  // 数据根子路径单源（工单 19.37）：与其为每个子项加一次性 getter，不如放出这两个通用取径
  // 函数——server 的 devices.json 与 CLI 后续都是真实消费者
  'sparkDir',
  'sparkFile',
  // 数据目录占用统计（工单 19.37 第二批）：server GET /api/storage/report 经 Engine 门面消费；
  // 纯函数直出供 CLI/脚本复用，类型 StorageReport/StorageBucket/StorageSkipped 为编译期导出
  'storageReport',
  // 数据维护（工单 19.37 第三批）：web 数据管理页清理/导出/导入经 Engine 门面消费
  'CLEANABLE_BUCKETS',
  'cleanupBucket',
  'fetchLinkPreview',
  'isPrivateAddress',
  'exportSessionsBundle',
  'importSessionsBundle',
  'sparkHome',
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
