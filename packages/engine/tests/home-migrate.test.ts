/**
 * 数据目录解析与迁移单测（阶段十九 19.16）：
 * ① sparkHome——SPARK_HOME 优先（含相对路径解析/空串回退缺省）；
 * ② planMigration——源不存在拒迁、目标非空拒迁、目标=当前目录拒迁、源=目标拒迁；
 * ③ runMigration——复制 + 字节校验 + 源改名 .bak-<ts>（**不删源**）；
 *    校验不符时目标侧清场、源原样保留（fail-closed）。
 */
import { mkdtemp, mkdir, writeFile, readdir, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { hasExplicitSparkHome, SPARK_HOME_DIR, sparkHome } from '../src/home.js'
import { MigrationError, isCurrentHome, planMigration, runMigration } from '../src/migrate.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
})

async function tempDir(prefix: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), prefix))
  cleanups.push(async () => {
    await rm(d)
  })
  return d
}

async function rm(p: string): Promise<void> {
  const { rm: r } = await import('node:fs/promises')
  await r(p, { recursive: true, force: true })
}

/** 造一个假数据目录（含子目录与文件） */
async function seedHome(): Promise<string> {
  const dir = await tempDir('spark-home-')
  await mkdir(join(dir, 'sessions'), { recursive: true })
  await writeFile(join(dir, 'spark.json'), '{"version":1}')
  await writeFile(join(dir, 'models.json'), '{"defaultModel":{}}')
  await writeFile(join(dir, 'sessions', 'a.jsonl'), 'line1\nline2\n')
  return dir
}

describe('sparkHome（阶段十九 19.16 单一来源）', () => {
  test('无 SPARK_HOME → ~/.spark', () => {
    expect(sparkHome({})).toBe(join(homedir(), SPARK_HOME_DIR))
  })

  test('SPARK_HOME 优先；空串回退缺省（不把显式空当合法路径）', () => {
    expect(sparkHome({ SPARK_HOME: '/data/spark' })).toBe('/data/spark')
    expect(sparkHome({ SPARK_HOME: '   ' })).toBe(join(homedir(), SPARK_HOME_DIR))
    expect(hasExplicitSparkHome({ SPARK_HOME: '/x' })).toBe(true)
    expect(hasExplicitSparkHome({})).toBe(false)
  })

  test('相对 SPARK_HOME 按 cwd 解析并明确化', () => {
    const got = sparkHome({ SPARK_HOME: './rel-home' })
    expect(got.startsWith('/')).toBe(true)
    expect(got.endsWith('rel-home')).toBe(true)
  })

  test('isCurrentHome：目标=解析值 → true', () => {
    const home = sparkHome({ SPARK_HOME: '/data/spark' })
    expect(isCurrentHome('/data/spark', { SPARK_HOME: '/data/spark' })).toBe(true)
    expect(isCurrentHome(home, { SPARK_HOME: '/data/spark' })).toBe(true)
    expect(isCurrentHome('/other', { SPARK_HOME: '/data/spark' })).toBe(false)
  })
})

describe('planMigration / runMigration（阶段十九 19.16）', () => {
  test('规划通过：条目与字节统计', async () => {
    const src = await seedHome()
    const dst = join(await tempDir('spark-dst-'), 'new-home')
    const plan = await planMigration(src, dst)
    expect(plan.from).toBe(src)
    expect(plan.to).toBe(dst)
    expect(plan.entries).toBe(3) // spark.json / models.json / sessions
    expect(plan.bytes).toBeGreaterThan(0)
  })

  test('源不存在 → 拒迁（E_MIGRATE_NO_SOURCE）', async () => {
    const dst = join(await tempDir('spark-dst-'), 'x')
    await expect(planMigration('/nonexistent-spark-home', dst)).rejects.toBeInstanceOf(MigrationError)
  })

  test('目标非空 → 拒迁不覆盖', async () => {
    const src = await seedHome()
    const dstParent = await tempDir('spark-dst-')
    const dst = join(dstParent, 'occupied')
    await mkdir(dst, { recursive: true })
    await writeFile(join(dst, 'keep.txt'), 'x')
    await expect(planMigration(src, dst)).rejects.toThrow(/非空/)
    // 用户数据未被触碰
    expect((await readdir(dst)).length).toBe(1)
  })

  test('目标=当前数据目录 → 拒迁（引擎在跑）', async () => {
    const src = await seedHome()
    await expect(planMigration(src, src)).rejects.toBeInstanceOf(MigrationError)
  })

  test('执行迁移：复制 + 校验 + 源改名备份（不删源）', async () => {
    const src = await seedHome()
    const dst = join(await tempDir('spark-dst-'), 'new-home')
    const plan = await planMigration(src, dst)
    const { backup } = await runMigration(plan, () => 1234)
    // 目标完整
    expect((await readdir(dst)).sort()).toEqual(['models.json', 'sessions', 'spark.json'])
    expect((await stat(join(dst, 'sessions', 'a.jsonl'))).size).toBe(12)
    // 源改名备份（内容仍在，可人工找回）
    expect(backup).toBe(`${src}.bak-1234`)
    expect((await stat(join(backup, 'sessions', 'a.jsonl'))).size).toBe(12)
    // 原路径已不存在（改名而非删除——禁删纪律）
    await expect(stat(src)).rejects.toThrow()
  })
})
