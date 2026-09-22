/**
 * 日志读取面（阶段十九工单 19.38 / V2-14）：`~/.spark/logs/engine.log` 的尾部解析与过滤。
 * **只读**——写与级别由 pino 侧管，本模块不提供任何写路径。
 *
 * 三条硬约束：
 * ① 只读尾部字节窗口（诊断日志会长到数百 MB，全量 readFile 会打爆常驻的 server）；
 * ② tail 起点落在文件中部 ⇒ 首行必然是半行 ⇒ **丢掉**，不猜也不"尽力解析"；
 * ③ 脱敏在写入侧已完成（logger 的 SECRET/BEARER/env 三类模式）——本模块不二次加工，
 *    解析不出来的行原样以 `msg` 回传并把 `unparsed: true` 标出来：
 *    把"读不懂"伪装成"没有内容"正是诊断页最不该有的行为。
 */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import type { LogEntryDto, LogsDto } from '@spark/protocol'

/** 尾部读取窗口（字节）；约当 500–1500 行 pino 记录 */
const DEFAULT_TAIL_BYTES = 512 * 1024
/** 单次返回条目上限（超限从尾部往前截，truncated 标记为真） */
const MAX_ENTRIES = 500
/** pino 数值级别 → 名称（level 为字符串时走 LEVEL_NAMES 反查） */
const LEVEL_BY_NUM: Readonly<Record<number, LogEntryDto['level']>> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
}
const LEVEL_RANK: Readonly<Record<LogEntryDto['level'], number>> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

export interface ReadLogsQuery {
  /** 键带 `| undefined`：调用方传的是 protocol `LogsQuery`（zod 推导，可选键含 undefined），
   *  exactOptionalPropertyTypes 下不收（sdk inprocess.getLogs 即为此撞红） */
  level?: LogEntryDto['level'] | undefined
  /** 子串匹配（msg 与序列化后的字段一起比，大小写不敏感） */
  match?: string | undefined
  limit?: number | undefined
  /** 尾部窗口字节数（测试与"看更多"用；上限 4 MB） */
  tailBytes?: number | undefined
}

function logPath(root: string): string {
  return join(root, 'logs', 'engine.log')
}

/** 读文件尾部至多 maxBytes（不整体载入内存） */
function readTail(filePath: string, maxBytes: number): { text: string; truncated: boolean } {
  let fd: number
  try {
    fd = openSync(filePath, 'r')
  } catch {
    return { text: '', truncated: false }
  }
  try {
    const size = fstatSync(fd).size
    const start = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - start)
    const got = readSync(fd, buf, 0, buf.length, start)
    return { text: buf.subarray(0, got).toString('utf8'), truncated: start > 0 }
  } finally {
    closeSync(fd)
  }
}

function toEntry(line: string, lineNo: number): LogEntryDto {
  let parsed: Record<string, unknown> | null = null
  try {
    const v: unknown = JSON.parse(line)
    if (typeof v === 'object' && v !== null) parsed = v as Record<string, unknown>
  } catch {
    parsed = null
  }
  if (parsed === null) {
    // 非 JSON 行（崩溃前未换行的 stderr 片段等）：如实呈现，不并入其它条目
    return {
      time: 0,
      level: 'info',
      msg: line,
      fields: { unparsed: true, line: lineNo },
    }
  }
  // pid/hostname/name 是 pino 的信封字段，摘出来不进 fields（改名带 _ 前缀仅为满足 no-unused-vars）
  const {
    time,
    level,
    msg,
    pid: _pid,
    hostname: _hostname,
    name: _name,
    ...rest
  } = parsed
  const numeric = typeof level === 'number' ? LEVEL_BY_NUM[level] : undefined
  const named =
    typeof level === 'string' && level.toLowerCase() in LEVEL_RANK
      ? (level.toLowerCase() as LogEntryDto['level'])
      : undefined
  return {
    time: typeof time === 'number' ? time : 0,
    level: numeric ?? named ?? 'info',
    // 非字符串的 msg（理论不该出现，但坏行不得读成"没有内容"）按 JSON 落，不走 Object 默认字串化
    msg:
      typeof msg === 'string'
        ? msg
        : msg === undefined || msg === null
          ? ''
          : JSON.stringify(msg),
    fields: rest,
  }
}

/**
 * 读取引擎日志尾部。`level` 是"该级别及以上"（pino 语义——只看 error 不等于把 fatal 也滤掉），
 * `match` 是大小写不敏感子串。文件不存在 = 空结果（首次运行前确实没有日志，不是错误）。
 */
export function readLogs(root: string, query: ReadLogsQuery = {}): LogsDto {
  const path = logPath(root)
  const cap = Math.min(query.tailBytes ?? DEFAULT_TAIL_BYTES, 4 * 1024 * 1024)
  const { text, truncated: byBytes } = readTail(path, cap)
  const all = text.split('\n')
  // 字节窗口截在中段 ⇒ 第一行是半行，丢掉（末行可能因文件尾无换行而完整，保留）
  const lines = (byBytes ? all.slice(1) : all).filter((l) => l.trim() !== '')
  let entries = lines.map((l, i) => toEntry(l, i + 1))
  if (query.level !== undefined) {
    const min = LEVEL_RANK[query.level]
    entries = entries.filter((e) => LEVEL_RANK[e.level] >= min)
  }
  const needle = query.match?.trim().toLowerCase() ?? ''
  if (needle !== '') {
    entries = entries.filter((e) =>
      (e.msg + ' ' + JSON.stringify(e.fields)).toLowerCase().includes(needle),
    )
  }
  const limit = Math.min(query.limit ?? MAX_ENTRIES, MAX_ENTRIES)
  const out = entries.slice(-limit)
  return { path, entries: out, truncated: byBytes || entries.length > out.length }
}

export { logPath as engineLogPath, MAX_ENTRIES as LOGS_MAX_ENTRIES }
