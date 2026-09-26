/**
 * 数据维护（阶段十九工单 19.37 第三批 / V2-13）：桶清理与 JSONL 打包导出/导入。
 *
 * **清理的 §2.10 纪律**：除 `trash` 本身（清空回收站即其语义）外，一切清理都是
 * **rename 进 ~/.spark/trash/<桶>/**——同盘原子、可人工找回；不真删任何数据。
 * 可清理桶是**封闭白名单**（名与 storageReport 的目录发现名一致）：`sessions/checkpoints`
 * （turn 边界快照，可重建的最大头）、`toolOutputs`、`browser-shots`、`trash`。
 * 会话正文不在列（有自己的 deleteSession 流程），数据库文件不在列（memory/search
 * 各有维护入口）——白名单外如实抛 E_STORAGE_UNCLEANABLE，不设假开关。
 *
 * **导出/导入格式 = 原生 JSONL 逐字打包**：marker 行 `{"sparkBundle":1,"file":"<文件名>"}`
 * 开启一段，其后**逐字原样**保留该会话文件的 header 行与事件行（不重序列化——
 * 导出的字节就是盘上的字节，回导后与原件逐行一致）。同名会话已存在 → skipped；
 * 坏段（文件名无合法 id / 首行非合法 header）→ failed——imported/skipped/failed
 * 三计数如实上报，不静默混过。
 */
import { existsSync, renameSync, rmSync } from 'node:fs'
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { findSessionFile, idOfFileName } from '../session/scan.js'
import { mungeDir, sessionFileName } from '../session/store.js'
import { sparkDir } from './paths.js'
import { CLEANABLE_BUCKETS } from './report.js'

// 可清理桶白名单单一来源在 report.ts（目录发现的同款名字），此处 re-export 维持公共面
export { CLEANABLE_BUCKETS } from './report.js'

export interface StorageCleanupResult {
  bucket: string
  /** 移入 trash（trash 桶 = 永久删除）的条目数 */
  moved: number
  /** 单条失败数（Windows 打开句柄挡 rename 等；逐条 fail-soft，下次清理可再试） */
  failed: number
  /** true = 永久删除（仅 trash 桶）；false = 已移入 trash 可找回 */
  permanent: boolean
}

export interface StorageExportResult {
  /** 打包 JSONL（marker 行 + 原始行逐字保留）；体量与全库成正比——本地单用户量级 */
  bundle: string
  files: number
}

export interface StorageImportResult {
  imported: number
  skipped: number
  failed: number
}

/** 递归收集目录下全部条目（绝对路径，不含 dir 自身；目录不存在 = 空） */
async function listEntries(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    out.push(join(dir, ent.name))
  }
  return out.sort()
}

/** 收集 sessions 树下全部 checkpoints 目录（跨 cwd 目录聚合——与报告的聚合桶同名同义） */
async function listCheckpointDirs(sessionsRoot: string): Promise<string[]> {
  const out: string[] = []
  if (!existsSync(sessionsRoot)) return out
  for (const proj of await readdir(sessionsRoot, { withFileTypes: true })) {
    if (!proj.isDirectory()) continue
    const projDir = join(sessionsRoot, proj.name)
    for (const sess of await readdir(projDir, { withFileTypes: true })) {
      if (!sess.isDirectory()) continue
      const ckpt = join(projDir, sess.name, 'checkpoints')
      if (existsSync(ckpt)) out.push(ckpt)
    }
  }
  return out.sort()
}

/**
 * 清理一个桶。非 trash 桶 = 条目逐个 rename 进 `trash/<桶名>/`（§2.10：只移不删）；
 * trash 桶 = 逐条永久删除（回收站语义）。单条失败计数不中断（fail-soft 逐条、
 * 整体如实上报 moved/failed）。
 */
export async function cleanupBucket(
  root: string,
  bucket: string,
  now: () => number = Date.now,
): Promise<StorageCleanupResult> {
  if (!CLEANABLE_BUCKETS.includes(bucket)) {
    throw new Error(
      `E_STORAGE_UNCLEANABLE: 桶 ${bucket} 不可清理——可清理面：${CLEANABLE_BUCKETS.join('、')}`,
    )
  }
  const trashDir = sparkDir(root, 'trash')
  const permanent = bucket === 'trash'
  const destDir = join(trashDir, bucket.replace('/', '_'))
  let moved = 0
  let failed = 0

  let entries: string[] = []
  if (bucket === 'sessions/checkpoints') {
    entries = await listCheckpointDirs(sparkDir(root, 'sessions'))
  } else if (bucket === 'toolOutputs') {
    entries = await listEntries(sparkDir(root, 'toolOutputs'))
  } else if (bucket === 'browser-shots') {
    entries = await listEntries(sparkDir(root, 'browserShots'))
  } else {
    entries = await listEntries(trashDir)
  }

  if (!permanent) await mkdir(destDir, { recursive: true })
  // 目标名带序号：同毫秒多个同名条目（跨会话的 checkpoints 目录同名）不互相覆盖
  let seq = 0
  for (const entry of entries) {
    try {
      if (permanent) {
        rmSync(entry, { recursive: true, force: true })
      } else {
        renameSync(entry, join(destDir, `${now()}-${seq}-${basename(entry)}`))
        seq += 1
      }
      moved += 1
    } catch {
      failed += 1
    }
  }
  return { bucket, moved, failed, permanent }
}

/**
 * 打包导出：全部会话文件 → 单个 JSONL。
 * marker 行开段，其后 header 行与事件行**逐字原样**（读原文件按行转发，不重序列化）。
 */
export async function exportSessionsBundle(root: string): Promise<StorageExportResult> {
  const sessionsRoot = sparkDir(root, 'sessions')
  const lines: string[] = []
  let files = 0
  for (const dir of await listEntries(sessionsRoot)) {
    let names: string[] = []
    try {
      names = (await readdir(dir)).filter((f) => f.endsWith('.jsonl')).sort()
    } catch {
      continue
    }
    for (const name of names) {
      let body: string
      try {
        body = await readFile(join(dir, name), 'utf8')
      } catch {
        continue
      }
      lines.push(JSON.stringify({ sparkBundle: 1, file: name }))
      lines.push(body.replace(/\n+$/, ''))
      files += 1
    }
  }
  return { bundle: lines.length > 0 ? lines.join('\n') + '\n' : '', files }
}

/**
 * 回导：按 marker 分段；段首行须为合法 header（cwd/createdAt/model 齐备），文件名须含
 * 合法会话 id。同名会话已存在 → skipped；坏段 → failed；其余按原生命名规则落盘
 * （`sessions/<mungeDir(cwd)>/<ts>_<sid>.jsonl`）→ imported。落盘后由调用方触发索引重建。
 */
export async function importSessionsBundle(
  root: string,
  bundle: string,
): Promise<StorageImportResult> {
  const sessionsRoot = sparkDir(root, 'sessions')
  let imported = 0
  let skipped = 0
  let failed = 0
  let current: { name: string; lines: string[] } | null = null

  const flush = async (): Promise<void> => {
    if (current === null) return
    const seg = current
    current = null
    const id = idOfFileName(seg.name)
    if (id === null || seg.lines.length === 0) {
      failed += 1
      return
    }
    let header: { cwd?: unknown; createdAt?: unknown; model?: unknown }
    try {
      header = JSON.parse(seg.lines[0] ?? '') as typeof header
    } catch {
      failed += 1
      return
    }
    if (
      typeof header.cwd !== 'string' ||
      typeof header.createdAt !== 'number' ||
      typeof header.model !== 'string'
    ) {
      failed += 1
      return
    }
    if ((await findSessionFile(sessionsRoot, id)) !== null) {
      skipped += 1
      return
    }
    const path = join(
      sessionsRoot,
      mungeDir(header.cwd),
      sessionFileName(header.createdAt, id),
    )
    try {
      await mkdir(dirname(path), { recursive: true })
      await appendFile(path, seg.lines.join('\n') + '\n', 'utf8')
      imported += 1
    } catch {
      failed += 1
    }
  }

  for (const line of bundle.split('\n')) {
    if (line === '') continue
    let parsed: { sparkBundle?: unknown; file?: unknown } | null = null
    try {
      parsed = JSON.parse(line) as { sparkBundle?: unknown; file?: unknown }
    } catch {
      parsed = null
    }
    if (parsed !== null && parsed.sparkBundle === 1 && typeof parsed.file === 'string') {
      await flush()
      current = { name: parsed.file, lines: [] }
      continue
    }
    if (current === null) {
      failed += 1
      continue
    }
    current.lines.push(line)
  }
  await flush()
  return { imported, skipped, failed }
}
