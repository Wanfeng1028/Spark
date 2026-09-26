/**
 * 文件系统小助手（叶子 util，仅依赖 node:fs）。
 * - 原子写：先写同名 .tmp 再 rename——进程崩溃只可能留下多余 tmp 文件，主文件恒完整；
 * - JSONL：追加一行 / 读取全部（坏行跳过——历史文件只追加不改写，单行损坏不阻塞列表）。
 */
import { appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'

/** 原子写原始文本或字节（调用方自管序列化形状，如 permission store 无尾换行的历史格式）。
 * LA-40：openSync+writeSync+fsyncSync 替代 writeFileSync——rename 前 data 落盘，
 * 掉电不再可能得到空/半截主文件。tmp 仍用同目录（跨盘 rename 会 EXDEV 破坏原子性，
 * "tmp 移出用户工作区防 checkpoint git add -A 吸入"登记为已知限制：写入窗口为
 * 同一同步 tick 内的微秒级，且 rename 与 write 原子衔接）。 */
export function atomicWriteFile(
  filePath: string,
  data: string | Uint8Array,
  opts?: { mode?: number },
): void {
  const tmp = `${filePath}.tmp`
  const fh = openSync(tmp, 'w', opts?.mode)
  try {
    writeSync(fh, data)
    fsyncSync(fh)
  } finally {
    closeSync(fh)
  }
  if (opts?.mode !== undefined) {
    try {
      chmodSync(tmp, opts.mode)
    } catch {
      // Windows 无 POSIX chmod（D15 同判：平台差异尽力而为，不 fail）
    }
  }
  renameSync(tmp, filePath)
}

/** 原子写 JSON 文档（两空格缩进 + 尾换行——spark.json/models.json 等配置文件的统一形状） */
export function atomicWriteJson(filePath: string, doc: unknown, opts?: { mode?: number }): void {
  atomicWriteFile(filePath, `${JSON.stringify(doc, null, 2)}\n`, opts)
}

/** JSONL 追加一行（调用方自管脱敏与错误语义——审计旁路吞错、触发器历史直抛） */
export function appendJsonLine(filePath: string, line: string): void {
  appendFileSync(filePath, `${line}\n`)
}

/** 读 JSONL 全部行（坏行跳过静默降级；文件不存在 → 空表） */
export function readJsonLines<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return []
  const lines = readFileSync(filePath, 'utf8').split('\n').filter((l) => l !== '')
  const rows: T[] = []
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line) as T)
    } catch {
      // 坏行跳过（单行损坏不阻塞列表）
    }
  }
  return rows
}
