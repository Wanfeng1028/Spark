/**
 * `~/.spark` 子路径单源单测（阶段十九工单 19.37 第一批）。
 *
 * 测的是**磁盘契约**，不是实现细节：这些字面量一改，用户目录里的数据位置就跟着改，
 * 老数据读不到（`~/.spark/trash` 改名成 `~/.spark/deleted` 不会报错，只会让回收站变空）。
 * 所以先把每个值钉成断言——要改必须先过这条测试，也就是必须有意识地写一次迁移。
 *
 * 另钉两条结构性事实：
 * ① 检查点目录**不在根级**（嵌在 `sessions/<cwd 派生目录>/<sid>/checkpoints/`），
 *    故 `checkpointsRootOf` 收的是会话文件路径而非 root——按根级清单去拼必然拼错；
 * ② `index.db`（会话索引）与 `search.db`（全文搜索）、`memory.db`（长期记忆）、
 *    `vectors.db`（向量检索）是**四个不同的库**，历史上名字相近容易拼串，键名分得很明。
 */
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  attachmentsDir,
  checkpointsRootOf,
  engineLogFile,
  projectPermissionsFile,
  projectSparkDir,
  PROJECT_SPARK_DIR,
  sparkDir,
  sparkFile,
  SPARK_DIR,
  SPARK_FILE,
} from '../src/storage/paths.js'

const ROOT = 'spark-root-fixture'

describe('磁盘契约：文件名与目录名不得随意改', () => {
  test('根级文件名字面量', () => {
    expect(SPARK_FILE).toEqual({
      settings: 'spark.json',
      models: 'models.json',
      mcp: 'mcp.json',
      lsp: 'lsp.json',
      permissions: 'permissions.json',
      secrets: 'secrets.json',
      trusted: 'trusted.json',
      usage: 'usage.json',
      audit: 'audit.jsonl',
      memoryDb: 'memory.db',
      vectorsDb: 'vectors.db',
      searchDb: 'search.db',
      sessionIndexDb: 'index.db',
      feedbackDb: 'feedback.db',
      devices: 'devices.json',
    })
  })

  test('根级目录名字面量', () => {
    expect(SPARK_DIR).toEqual({
      sessions: 'sessions',
      checkpoints: 'checkpoints',
      logs: 'logs',
      trash: 'trash',
      attachments: 'attachments',
      arena: 'arena',
      skills: 'skills',
      commands: 'commands',
      extensions: 'extensions',
      agents: 'agents',
      browserShots: 'browser-shots',
      toolOutputs: 'tool-outputs',
    })
  })

  test('四个 sqlite 库各是各的，名字不互相顶（会话索引≠搜索≠记忆≠向量）', () => {
    const dbs = Object.values(SPARK_FILE).filter((n) => n.endsWith('.db'))
    expect(new Set(dbs).size).toBe(dbs.length)
    expect(dbs.sort()).toEqual(['feedback.db', 'index.db', 'memory.db', 'search.db', 'vectors.db'])
  })
})

describe('路径拼装', () => {
  test('根级文件与目录都在 root 之下（不掺子路径）', () => {
    expect(sparkFile(ROOT, 'settings')).toBe(join(ROOT, 'spark.json'))
    expect(sparkDir(ROOT, 'sessions')).toBe(join(ROOT, 'sessions'))
    expect(attachmentsDir(ROOT)).toBe(join(ROOT, 'attachments'))
  })

  test('引擎日志是两层：目录名与文件名各自单源，拼法只在这里出现一次', () => {
    expect(engineLogFile(ROOT)).toBe(join(ROOT, 'logs', 'engine.log'))
    expect(engineLogFile(ROOT)).toBe(join(sparkDir(ROOT, 'logs'), 'engine.log'))
  })

  test('检查点根与 JSONL 同级（不是 sparkHome 的子项）', () => {
    const sessionFile = join(ROOT, 'sessions', 'E-code-proj-1a2b', 'ses_abc.jsonl')
    expect(checkpointsRootOf(sessionFile)).toBe(
      join(ROOT, 'sessions', 'E-code-proj-1a2b', 'checkpoints'),
    )
    // 关键反例：按"根级目录"去拼会得到完全不同的位置，而它不存在——快照写进去后读不回
    expect(checkpointsRootOf(sessionFile)).not.toBe(sparkDir(ROOT, 'checkpoints'))
  })

  test('项目级 permissions.json 读写同源，且与用户级同名文件是两个不同文件', () => {
    const cwd = join('home', 'repo')
    // 读侧 loadProjectRules 与写侧 UserRuleStore 必须拼出同一个路径：
    // 任一侧改字面量的表现是「设置里保存成功、重载后规则消失」，不报错
    expect(projectPermissionsFile(cwd)).toBe(join(projectSparkDir(cwd), SPARK_FILE.permissions))
    expect(projectPermissionsFile(cwd)).toBe(join(cwd, PROJECT_SPARK_DIR, 'permissions.json'))
    expect(projectPermissionsFile(cwd)).not.toBe(sparkFile(cwd, 'permissions'))
  })
})
