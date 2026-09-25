/**
 * 数据目录占用统计（阶段十九工单 19.37 / V2-13 第一批）。
 *
 * **按目录发现，不按声明清单**——这是本模块最要紧的一条设计选择，理由写在这里以免后人
 * 又改回一张表：引擎往 `~/.spark` 里写东西的路径是各调用点现拼的（`join(this.root,'memory.db')`
 * 之类，二十来处，无单源）。若本模块自备一张"该有哪些条目"的清单，那么引擎新增一个子路径时
 * 报表会**安静地漏掉它**——数字看着齐、实则少一项，正是最难被发现的那类错。改成读实际目录后，
 * 任何新条目都会自己冒出来（以它自己的名字成桶），最坏是"名字没被翻译成中文标签"，不是"数据不见了"。
 *
 * 分桶规则（保持总量守恒）：
 * - 顶层一个条目 = 一桶，桶名用**相对 home 的 POSIX 路径**（稳定键，给人看的标签在渲染层，
 *   引擎不产 UI 文案——19.17 的语言单源在 protocol，这里塞中文就等于把文案第二源头开回引擎）；
 * - `sessions/` 拆两桶：`sessions`（会话正文）与 `sessions/checkpoints`（检查点快照仓）。
 *   拆开的理由是**这正是要清理的东西里最大的一块**：检查点是 turn 边界的全量 git 快照，
 *   嵌在 `sessions/<cwd 目录名>/<sid>/checkpoints/` 下，与 JSONL 混成一桶就看不出该清谁。
 *   跨多个 cwd 目录的同名 checkpoints 子树**聚合进同一桶**（分 20 行列它们没有信息量）。
 *
 * 三条口径：
 * ① **符号链接一律不跟随**——跟出去就不是在算 `~/.spark` 的占用，且环回目录会让遍历不终止；
 *    链接本身计入 `skipped`（说明原因），不当成 0 字节悄悄抹掉；
 * ② 读不动的条目（权限/遍历中途消失）进 `skipped` 带原因——**不静默跳过**，
 *    少算 1 GB 和"这一项没算上"是两件事，后者用户能判断，前者不能；
 * ③ 目录不存在（全新安装、SPARK_HOME 指错）如实回 `exists: false`，不回一张空表装作"占用为零"。
 */
import { opendir, lstat } from 'node:fs/promises'
import { join } from 'node:path'

/** 一个桶：`~/.spark` 下一个条目（或 sessions 下的一类内容）的合计 */
export interface StorageBucket {
  /** 相对 home 的 POSIX 路径，作稳定键（标签在渲染层映射） */
  name: string
  bytes: number
  /** 计入的文件数（目录为其内递归之和） */
  files: number
  /** 桶内最近修改时间；空桶缺省该键（不塞 0 假装 1970） */
  newestAt?: number
}

/** 未计入统计的条目与原因 */
export interface StorageSkipped {
  /** 相对 home 的 POSIX 路径 */
  name: string
  reason: string
}

export interface StorageReport {
  home: string
  /** 目录是否存在（false = 尚未创建/指错；此时 buckets 必空、totalBytes 必 0） */
  exists: boolean
  totalBytes: number
  totalFiles: number
  buckets: StorageBucket[]
  skipped: StorageSkipped[]
  generatedAt: number
}

/** sessions 下检查点子树的聚合桶名（与 `sessions` 正文桶配对；两者相加 = sessions 总量） */
export const CHECKPOINT_BUCKET = 'sessions/checkpoints'

interface Accumulator {
  bytes: number
  files: number
  newestAt: number | undefined
}

function newAcc(): Accumulator {
  return { bytes: 0, files: 0, newestAt: undefined }
}

function addTo(acc: Accumulator, bytes: number, mtimeMs: number): void {
  acc.bytes += bytes
  acc.files += 1
  if (acc.newestAt === undefined || mtimeMs > acc.newestAt) acc.newestAt = mtimeMs
}

function rel(name: string, entry: string): string {
  return name === '' ? entry : `${name}/${entry}`
}

function errReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 递归累计一个目录树。`inSessions` 为真时，遇到名为 `checkpoints` 的子目录就把它
 * 单独累到 `checkpoint` 桶而不再计入所在桶——只在 sessions 子树里生效，别的目录
 * 恰好同名不会被误分流（那也是它自己的占用）。
 */
async function accumulate(
  absDir: string,
  prefix: string,
  bucket: Accumulator,
  skipped: StorageSkipped[],
  opts: { readonly inSessions: boolean; readonly checkpoint?: Accumulator },
): Promise<void> {
  let dir
  try {
    dir = await opendir(absDir)
  } catch (err: unknown) {
    skipped.push({ name: prefix, reason: `目录不可读：${errReason(err)}` })
    return
  }
  for await (const ent of dir) {
    const childAbs = join(absDir, ent.name)
    const childRel = rel(prefix, ent.name)
    let st
    try {
      st = await lstat(childAbs)
    } catch (err: unknown) {
      skipped.push({ name: childRel, reason: `取状态失败：${errReason(err)}` })
      continue
    }
    // ① 符号链接不跟随：既不算它的目标，也不当它是 0 字节——如实标出
    if (st.isSymbolicLink()) {
      skipped.push({ name: childRel, reason: '符号链接未跟随（不属本目录占用）' })
      continue
    }
    if (st.isDirectory()) {
      const divertToCheckpoint =
        opts.inSessions && ent.name === 'checkpoints' && opts.checkpoint !== undefined
      await accumulate(
        childAbs,
        childRel,
        divertToCheckpoint ? opts.checkpoint : bucket,
        skipped,
        {
          inSessions: opts.inSessions && ent.name !== 'checkpoints',
          // 条件展开：exactOptionalPropertyTypes 下可选字段不收显式 undefined
          ...(opts.checkpoint !== undefined ? { checkpoint: opts.checkpoint } : {}),
        },
      )
      continue
    }
    if (st.isFile()) {
      // 普通文件之外的类型（socket/fifo/设备）不计——它们不占磁盘块，也不是可清理的数据
      addTo(bucket, st.size, st.mtimeMs)
    }
  }
}

function bucketOf(name: string, acc: Accumulator): StorageBucket {
  return {
    name,
    bytes: acc.bytes,
    files: acc.files,
    ...(acc.newestAt !== undefined ? { newestAt: acc.newestAt } : {}),
  }
}

/**
 * 统计 `root`（通常是 `sparkHome()`）的占用。
 * 只读——本函数不建目录、不清理、不写任何文件。
 */
export async function storageReport(root: string, now: () => number = Date.now): Promise<StorageReport> {
  const generatedAt = now()
  let homeStat
  try {
    homeStat = await lstat(root)
  } catch {
    return {
      home: root,
      exists: false,
      totalBytes: 0,
      totalFiles: 0,
      buckets: [],
      skipped: [],
      generatedAt,
    }
  }
  if (!homeStat.isDirectory() || homeStat.isSymbolicLink?.() === true) {
    // 根就不是目录：没有"占用"可算，如实回 exists:false（不抛——调用方是设置页，不是启动路径）
    return {
      home: root,
      exists: false,
      totalBytes: 0,
      totalFiles: 0,
      buckets: [],
      skipped: [{ name: '', reason: '数据根不是目录' }],
      generatedAt,
    }
  }

  const skipped: StorageSkipped[] = []
  const top = new Map<string, Accumulator>()
  let dir
  try {
    dir = await opendir(root)
  } catch (err: unknown) {
    return {
      home: root,
      exists: true,
      totalBytes: 0,
      totalFiles: 0,
      buckets: [],
      skipped: [{ name: '', reason: `根目录不可读：${errReason(err)}` }],
      generatedAt,
    }
  }

  for await (const ent of dir) {
    const abs = join(root, ent.name)
    let st
    try {
      st = await lstat(abs)
    } catch (err: unknown) {
      skipped.push({ name: ent.name, reason: `取状态失败：${errReason(err)}` })
      continue
    }
    if (st.isSymbolicLink()) {
      skipped.push({ name: ent.name, reason: '符号链接未跟随（不属本目录占用）' })
      continue
    }
    const acc = newAcc()
    if (st.isDirectory()) {
      if (ent.name === 'sessions') {
        const checkpoints = newAcc()
        await accumulate(abs, ent.name, acc, skipped, {
          inSessions: true,
          checkpoint: checkpoints,
        })
        if (checkpoints.files > 0) top.set(CHECKPOINT_BUCKET, checkpoints)
      } else {
        await accumulate(abs, ent.name, acc, skipped, { inSessions: false })
      }
    } else if (st.isFile()) {
      addTo(acc, st.size, st.mtimeMs)
    } else {
      continue
    }
    // 空目录（或只含符号链接/子目录读取全失败的目录）也保留一行 0 值——
    // "建了这个目录但没内容"是事实，抹掉它就看不出目录为什么存在
    top.set(ent.name, acc)
  }

  const buckets = [...top.entries()]
    .map(([name, acc]) => bucketOf(name, acc))
    // 占用大的在前：这页第一眼要看的就是"谁吃的盘"
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))

  return {
    home: root,
    exists: true,
    totalBytes: buckets.reduce((sum, b) => sum + b.bytes, 0),
    totalFiles: buckets.reduce((sum, b) => sum + b.files, 0),
    buckets,
    skipped,
    generatedAt,
  }
}
