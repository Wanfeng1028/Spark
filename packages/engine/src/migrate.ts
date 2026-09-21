/**
 * 数据目录迁移（阶段十九 19.16）：老目录整体搬迁 + 校验。
 *
 * 纪律（与 §2.10 禁删一致 + 失败闭合）：
 * - **不删源**：搬完校验通过才把源改名 `<src>.bak-<ts>`（人工确认后可自行处置）；
 *   校验任何一步不过 → 源原样保留、目标侧已复制内容清掉，抛错（fail-closed）。
 * - **拒迁运行中的引擎自己的目录**：目标 = 当前数据目录，或源 = 当前数据目录且引擎
 *   在跑（SQLite 句柄/水位都在旧路径上），调用方负责前置校验（isCurrentHome）。
 * - **拒绝覆盖**：目标已存在且非空 → 拒迁（不猜测用户想合并还是覆盖）。
 */
import { cp, rename, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { sparkHome } from './home.js'

export interface MigrationPlan {
  from: string
  to: string
  /** 源目录条目数（顶层） */
  entries: number
  /** 源目录总字节（递归） */
  bytes: number
}

export class MigrationError extends Error {
  readonly code: string
  constructor(message: string, code = 'E_MIGRATE_FAILED') {
    super(message)
    this.name = 'MigrationError'
    this.code = code
  }
}

/** 源不存在/不是目录 → 拒迁（无迁不了的东西） */
async function statDir(p: string): Promise<{ entries: number }> {
  try {
    const s = await stat(p)
    if (!s.isDirectory()) throw new MigrationError(`源路径不是目录：${p}`, 'E_MIGRATE_NOT_DIR')
    const { readdir } = await import('node:fs/promises')
    const entries = (await readdir(p)).length
    return { entries }
  } catch (err) {
    if (err instanceof MigrationError) throw err
    throw new MigrationError(`源目录不存在或不可读：${p}`, 'E_MIGRATE_NO_SOURCE')
  }
}

/** 目标已存在且非空 → 拒迁（不覆盖用户数据） */
async function assertTargetClear(to: string): Promise<void> {
  try {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(to)
    if (entries.length > 0) {
      throw new MigrationError(`目标目录已存在且非空（${String(entries.length)} 项）——拒迁，不覆盖`, 'E_MIGRATE_TARGET_EXISTS')
    }
  } catch (err) {
    if (err instanceof MigrationError) throw err
    // 目标不存在 = 可迁（ENOENT）
  }
}

/** 递归统计字节数（校验基线） */
async function dirBytes(p: string): Promise<number> {
  const { readdir } = await import('node:fs/promises')
  let total = 0
  for (const e of await readdir(p, { withFileTypes: true })) {
    const full = join(p, e.name)
    if (e.isDirectory()) total += await dirBytes(full)
    else total += (await stat(full)).size
  }
  return total
}

/** 目标是否是当前进程的数据目录（引擎在跑时拒迁自己） */
export function isCurrentHome(target: string, env: Record<string, string | undefined> = process.env): boolean {
  return resolve(target) === sparkHome(env)
}

/** 规划（只读校验，不落地）：源可读、目标可写、目标非当前目录 */
export async function planMigration(from: string, to: string): Promise<MigrationPlan> {
  const src = resolve(from)
  const dst = resolve(to)
  if (src === dst) throw new MigrationError('源与目标相同，无需迁移', 'E_MIGRATE_SAME')
  if (isCurrentHome(dst)) throw new MigrationError('目标即当前数据目录——引擎正在使用，拒迁', 'E_MIGRATE_TARGET_IS_CURRENT')
  const { entries } = await statDir(src)
  await assertTargetClear(dst)
  const bytes = await dirBytes(src)
  return { from: src, to: dst, entries, bytes }
}

/**
 * 执行迁移：复制 → 字节校验 → 源改名 `<src>.bak-<ts>`（不删）。
 * 任何一步失败：清掉目标侧已复制内容，源原样保留，抛 MigrationError（fail-closed）。
 */
export async function runMigration(plan: MigrationPlan, now: () => number = Date.now): Promise<{ backup: string }> {
  const backup = `${plan.from}.bak-${String(now())}`
  try {
    await cp(plan.from, plan.to, { recursive: true })
    const copied = await dirBytes(plan.to)
    if (copied !== plan.bytes) {
      throw new MigrationError(
        `字节校验不符：源 ${String(plan.bytes)} ≠ 目标 ${String(copied)}——迁移作废`,
        'E_MIGRATE_VERIFY',
      )
    }
    await rename(plan.from, backup)
    return { backup }
  } catch (err) {
    // 目标侧清场（尽力而为——源始终未被触碰过，失败即回到迁移前状态）
    try {
      await rm(plan.to, { recursive: true, force: true })
    } catch {
      // 清理失败不掩盖原错误（用户可按错误信息手工处置）
    }
    if (err instanceof MigrationError) throw err
    throw new MigrationError(`迁移失败：${err instanceof Error ? err.message : String(err)}`)
  }
}
