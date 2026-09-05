/**
 * 日志器（doc/02 §5.10）：
 * - pino v10，info 级别，stdout + `~/.spark/logs/engine.log` 双路
 * - 固定字段（sid/turnId/callId/code/durMs）+ msg 英文短语
 * - 写入前脱敏：/sk-[A-Za-z0-9]{20,}/、/Bearer\s+\S+/、process.env 非空短值（≥6）出现处 → ***
 */
import { mkdirSync, createWriteStream, type WriteStream } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import type { BaseLogger, LevelWithSilent } from 'pino'
import type { CallId, SessionId, TurnId } from '@spark/protocol'
import { BEARER_RE, REPLACEMENT, SECRET_RE, buildEnvPatterns, escapeRegex } from './observability/redaction.js'

export interface LogFields {
  sid?: SessionId
  turnId?: TurnId
  callId?: CallId
  code?: string
  durMs?: number
  [k: string]: unknown
}

/** §5.10 字段表：可 grep msg 短语（全部英文小写，点号连接） */
export type LogMsg =
  | 'engine.start'
  | 'engine.shutdown.start'
  | 'engine.shutdown.done'
  | 'engine.shutdown.error'
  | 'session.create'
  | 'session.resume'
  | 'session.list'
  | 'turn.start'
  | 'turn.completed'
  | 'llm.stream.start'
  | 'llm.stream.retry'
  | 'llm.stream.done'
  | 'llm.stream.error'
  | 'tool.start'
  | 'tool.completed'
  | 'tool.output.oversize'
  | 'tool.output.spilled'
  | 'permission.asked'
  | 'permission.resolved'
  | 'permission.timeout'
  | 'store.tail.torn'
  | 'store.eventtree.orphan'
  | 'bus.subscriber.error'
  | 'compaction.run'
  | 'compaction.summary'
  | 'server.request.in'
  | 'server.request.out'
  | 'server.sse.connected'
  | 'server.sse.closed'
  | (string & Record<never, never>)

export interface SparkLogger {
  readonly level: LevelWithSilent
  info(msg: LogMsg, fields?: LogFields): void
  warn(msg: LogMsg, fields?: LogFields): void
  error(msg: LogMsg, fields?: LogFields): void
  debug(msg: LogMsg, fields?: LogFields): void
  /**
   * 注册需脱敏的密钥值（阶段七工单 7.1：密钥仓 store 值不在 process.env，
   * 须单点注册进脱敏层；≥6 才收集，与 env 值同阈值防误伤）。
   * 可选方法：注入的自定义 logger 不实现则跳过（脱敏兜底仍由三层正则承担）。
   */
  registerSecrets?(values: Iterable<string>): void
  /** 用于 child 派生（测试内存流注入场景用） */
  readonly inner: BaseLogger
  /** 销毁时关文件句柄（写流 finish 后 resolve；确保磁盘日志可读到） */
  close(): Promise<void>
}

interface LoggerDeps {
  /** 根目录（缺省 ~/.spark）；测试传临时目录避免写 home */
  root?: string
  /** pino level（缺省 info） */
  level?: LevelWithSilent
  /** 测试注入：跳过文件输出，只用给定 pino 实例 */
  logger?: BaseLogger
  /** 测试注入：文件输出流替代磁盘文件 */
  fileStream?: WriteStream
  /** stdout 路开关（工单 12.3：spark -p 机器可读 stdout 需 file-only；缺省 true 现行为不变） */
  stdout?: boolean
}

/** 递归遍历对象所有字符串值并做脱敏（不修改原对象） */
function sanitizeObject(obj: unknown, patterns: readonly RegExp[]): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') return sanitizeString(obj, patterns)
  if (Array.isArray(obj)) return obj.map((i) => sanitizeObject(i, patterns))
  if (typeof obj === 'object') {
    const proto: unknown = Object.getPrototypeOf(obj)
    if (proto !== Object.prototype && proto !== null) {
      // Error 实例：保留 stack/message（已单独过 sanitizeString），避免把 Error 变成普通 {} 丢信息
      if (obj instanceof Error) {
        const e = new Error(sanitizeString(obj.message, patterns))
        e.name = obj.name
        if (obj.stack !== undefined) e.stack = sanitizeString(obj.stack, patterns)
        return e
      }
      // 其他对象（Map/Set/Buffer 等）：保守转字符串再过一次
      return sanitizeString(Object.prototype.toString.call(obj), patterns)
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = sanitizeObject(v, patterns)
    }
    return out
  }
  return obj // number/boolean/bigint/symbol
}

function sanitizeString(s: string, patterns: readonly RegExp[]): string {
  let out = s.replace(SECRET_RE, REPLACEMENT).replace(BEARER_RE, `Bearer ${REPLACEMENT}`)
  for (const re of patterns) out = out.replace(re, REPLACEMENT)
  return out
}

export class Logger implements SparkLogger {
  readonly inner: BaseLogger
  private readonly fileStream: WriteStream | null
  private readonly envPatterns: readonly RegExp[]
  /** 密钥仓注册值（工单 7.1）：与 env 值同规则转义收集，运行时可追加 */
  private readonly secretPatterns: RegExp[] = []

  constructor(deps: LoggerDeps = {}) {
    this.envPatterns = buildEnvPatterns()
    const level = deps.level ?? 'info'
    if (deps.logger !== undefined) {
      this.inner = deps.logger
      this.fileStream = deps.fileStream ?? null
      return
    }
    const root = deps.root ?? join(homedir(), '.spark')
    const logDir = join(root, 'logs')
    mkdirSync(logDir, { recursive: true })
    const logFile = join(logDir, 'engine.log')
    this.fileStream =
      deps.fileStream ??
      createWriteStream(logFile, { flags: 'a', encoding: 'utf8' })
    this.inner = pino(
      { level, formatters: { level: (label) => ({ level: label }) } },
      pino.multistream([
        ...(deps.stdout === false ? [] : [{ stream: process.stdout, level }]),
        { stream: this.fileStream, level },
      ]),
    )
  }

  get level(): LevelWithSilent {
    return this.inner.level as LevelWithSilent
  }

  info(msg: LogMsg, fields?: LogFields): void {
    this.emit('info', msg, fields)
  }
  warn(msg: LogMsg, fields?: LogFields): void {
    this.emit('warn', msg, fields)
  }
  error(msg: LogMsg, fields?: LogFields): void {
    this.emit('error', msg, fields)
  }
  debug(msg: LogMsg, fields?: LogFields): void {
    this.emit('debug', msg, fields)
  }

  registerSecrets(values: Iterable<string>): void {
    for (const v of values) {
      if (!v || v.length < 6) continue
      try {
        this.secretPatterns.push(new RegExp(escapeRegex(v), 'g'))
      } catch {
        // 非法模式跳过（与 buildEnvPatterns 同判）
      }
    }
  }

  close(): Promise<void> {
    if (this.fileStream === null || this.fileStream.closed) return Promise.resolve()
    return new Promise((res, rej) => {
      const s = this.fileStream as WriteStream
      s.once('finish', () => res())
      s.once('error', rej)
      s.end()
    })
  }

  private emit(level: 'info' | 'warn' | 'error' | 'debug', msg: LogMsg, fields: LogFields | undefined): void {
    const patterns = this.secretPatterns.length > 0
      ? [...this.envPatterns, ...this.secretPatterns]
      : this.envPatterns
    const cleanMsg = sanitizeString(msg, patterns)
    const cleanFields =
      fields === undefined
        ? undefined
        : (sanitizeObject(fields, patterns) as LogFields)
    if (cleanFields === undefined) this.inner[level](cleanMsg)
    else this.inner[level](cleanFields, cleanMsg)
  }
}
