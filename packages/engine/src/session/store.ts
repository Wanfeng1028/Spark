/**
 * SessionStore（doc/02 §5.8.1/§5.8.4）：单写者 JSONL——会话文件只经本类写。
 * 文件 = 首行 header + 每行 durable 事件（信封带 parentId；磁盘行与 wire 同构）。
 * 文件名 = `<ISO 时间戳(冒号转-)>_<ses_id>.jsonl`（列表排序免读 header，pi 做法）。
 * 坏行策略：尾行坏 = 崩溃半写丢弃 warn；非尾行坏 / 未知 type 无 ignorable /
 *   seq 断洞 → 拒绝加载（fail-closed）。ignorable 未知事件跳过但占行号
 *   （seq == 文件事件行号，dsh "seq = log.length" contiguity contract）。
 * 磁盘格式迁移（§5.8.4）：旧版 compaction.completed{keptFromSeq}（阶段三词表）在
 * read 时按行号回查事件 id 原位转为 keptFromEventId——幂等内存迁移，文件不重写
 * （重写引入崩溃窗口；schema 保持严格，适配只在磁盘读取边界）。
 */
import { createHash } from 'node:crypto'
import { mkdir, open, readFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname } from 'node:path'
import { eventSchemaOf, parseEnvelope } from '@spark/protocol'
import type {
  EventId,
  SessionId,
  SparkEventEnvelope,
  SparkEventMap,
  TurnId,
} from '@spark/protocol'
import type { EventSink } from '../bus.js'
import { EventTree } from './tree.js'

/** 脚本/文件首行：会话元数据（非事件；样例见 doc/02 §4.8） */
export interface SessionHeader {
  sparkVersion: string
  cwd: string
  createdAt: number
  model: string
  /** 创建时 cwd 的 git 分支快照（只读探测；取不到不写入——工单 10.6） */
  branch?: string
  /** fork 来源（§5.8.6，阶段四）：父会话 id + 源文件路径 + 分叉边界事件 id */
  parentSession?: SessionId
  parentPath?: string
  parentEventId?: EventId
}

export interface SessionFile {
  header: SessionHeader
  events: SparkEventEnvelope[]
}

/**
 * 阶段三旧格式 compaction.completed{keptFromSeq} → keptFromEventId（工单 4.1 词表演进）。
 * 仅接受确凿的旧形状（有 keptFromSeq、无 keptFromEventId）；锚点行未读到或 seq 不符
 * → undefined（调用方按原错误拒绝加载，fail-closed 不放松）。转换结果仍走严校验。
 */
function migrateLegacyCompaction(
  raw: unknown,
  events: readonly SparkEventEnvelope[],
): SparkEventEnvelope | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as { type?: unknown; data?: unknown }
  if (r.type !== 'compaction.completed' || typeof r.data !== 'object' || r.data === null) {
    return undefined
  }
  const d = r.data as Record<string, unknown>
  if (typeof d.keptFromSeq !== 'number' || 'keptFromEventId' in d) return undefined
  const anchor = events[d.keptFromSeq - 1] // seq == 事件行号（header 占第 0 行）
  if (anchor === undefined || anchor.seq !== d.keptFromSeq) return undefined
  return {
    ...(raw as Record<string, unknown>),
    data: {
      summary: d.summary,
      keptFromEventId: anchor.id,
      tokensBefore: d.tokensBefore,
    },
  } as SparkEventEnvelope
}

/** cwd → 目录名（确定性、防碰撞）：非 [A-Za-z0-9] 连续段合并为 -，截断 48，尾缀 sha1 前 8 位 */
export function mungeDir(cwd: string): string {
  const base = cwd.replace(/[^A-Za-z0-9]+/g, '-')
  const truncated = base.length > 48 ? base.slice(0, 48) : base
  const hash = createHash('sha1').update(cwd).digest('hex').slice(0, 8)
  return `${truncated}-${hash}`
}

/** 会话文件名：时间戳前缀（冒号转 -，文件系统安全）+ 会话 id */
export function sessionFileName(createdAt: number, sessionId: SessionId): string {
  const ts = new Date(createdAt).toISOString().replace(/:/g, '-')
  return `${ts}_${sessionId}.jsonl`
}

function parseHeader(raw: string): SessionHeader {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('E_SESSION_BAD_HEADER: 首行不是合法 JSON')
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as SessionHeader).sparkVersion !== 'string' ||
    typeof (parsed as SessionHeader).cwd !== 'string' ||
    typeof (parsed as SessionHeader).createdAt !== 'number' ||
    typeof (parsed as SessionHeader).model !== 'string'
  ) {
    throw new Error('E_SESSION_BAD_HEADER: 首行缺 sparkVersion/cwd/createdAt/model')
  }
  const h = parsed as SessionHeader
  // 分支快照（工单 10.6）：出现即须为 string（坏 header fail-closed，不静默丢弃）
  if (h.branch !== undefined && typeof h.branch !== 'string') {
    throw new Error('E_SESSION_BAD_HEADER: branch 字段类型错误')
  }
  // fork 来源字段（§5.8.6）：出现即须为 string（坏 header fail-closed，不静默丢弃）
  if (
    (h.parentSession !== undefined && typeof h.parentSession !== 'string') ||
    (h.parentPath !== undefined && typeof h.parentPath !== 'string') ||
    (h.parentEventId !== undefined && typeof h.parentEventId !== 'string')
  ) {
    throw new Error('E_SESSION_BAD_HEADER: fork 来源字段（parentSession 等）类型错误')
  }
  return h
}

export class SessionStore implements EventSink {
  readonly tree = new EventTree()
  private fh: FileHandle | null = null
  /** 单写者串行链：全部文件写经此队列（AGENTS 引擎铁律） */
  private queue: Promise<unknown> = Promise.resolve()

  private constructor(
    readonly path: string,
    readonly header: SessionHeader,
    private readonly onTailTorn?: (reason: string) => void,
  ) {}

  /** 新会话：建目录、写 header 行 */
  static async create(
    path: string,
    header: SessionHeader,
    opts: { onTailTorn?: (reason: string) => void } = {},
  ): Promise<SessionStore> {
    await mkdir(dirname(path), { recursive: true })
    const store = new SessionStore(path, header, opts.onTailTorn)
    store.fh = await open(path, 'a')
    await store.writeLine(JSON.stringify(header))
    return store
  }

  /** resume：全量读（坏行策略 §5.8.4）→ 重建 EventTree */
  static async resume(
    path: string,
    opts: { onTailTorn?: (reason: string) => void } = {},
  ): Promise<SessionStore> {
    const file = await SessionStore.read(path, opts.onTailTorn)
    const store = new SessionStore(path, file.header, opts.onTailTorn)
    store.fh = await open(path, 'a')
    for (const e of file.events) {
      store.tree.append(e, e.parentId ?? null)
    }
    return store
  }

  /** 全量读（v1 文件小，不做反向扫描优化） */
  static async read(
    path: string,
    onTailTorn?: (reason: string) => void,
  ): Promise<SessionFile> {
    const content = await readFile(path, 'utf8')
    const rawLines = content.split('\n')
    if (rawLines[rawLines.length - 1] === '') rawLines.pop() // 文件以 \n 收尾的空尾串
    if (rawLines.length === 0) {
      throw new Error('E_SESSION_EMPTY: 会话文件为空')
    }
    const header = parseHeader(rawLines[0] as string)

    const events: SparkEventEnvelope[] = []
    for (let i = 1; i < rawLines.length; i++) {
      const lineNo = i // 事件行号（header 占第 0 行）——seq == 行号
      const line = rawLines[i] as string
      const isLast = i === rawLines.length - 1

      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        if (isLast) {
          const reason = `尾行（第 ${lineNo} 行）半写，丢弃`
          onTailTorn?.(reason)
          // stderr 直打（避免循环依赖 logger；engine create/resume 会通过 onTailTorn 同时落日志）
          process.stderr.write(`E_SESSION_TAIL_TORN: ${reason}\n`)
          break
        }
        throw new Error(`E_SESSION_BAD_LINE: 第 ${lineNo} 事件行损坏（fail-closed）`)
      }

      // 未知 type（内置词表与扩展注册表均无）：ignorable:true 跳过（占行号）；否则拒绝加载
      const type = (parsed as { type?: unknown }).type
      if (typeof type !== 'string' || eventSchemaOf(type) === undefined) {
        if ((parsed as { ignorable?: unknown }).ignorable === true) continue
        throw new Error(`E_SESSION_UNKNOWN_EVENT: 第 ${lineNo} 行未知事件 type "${String(type)}"`)
      }

      let envelope: SparkEventEnvelope
      try {
        envelope = parseEnvelope(parsed)
      } catch (err) {
        // 已知 type 但 data 是旧版磁盘形状 → 尝试迁移后重过严校验；否则原样拒绝
        const migrated = migrateLegacyCompaction(parsed, events)
        if (migrated === undefined) throw err
        envelope = parseEnvelope(migrated)
      }
      if (envelope.seq !== lineNo) {
        throw new Error(
          `E_SESSION_SEQ_GAP: 第 ${lineNo} 行事件 seq=${envelope.seq} 断洞（fail-closed）`,
        )
      }
      events.push(envelope)
    }
    return { header, events }
  }

  /** EventSink：填 parentId（tree.leafId）→ 落盘成功后才进树 → 返回最终信封 */
  append(e: SparkEventEnvelope): Promise<SparkEventEnvelope> {
    const task = this.queue.then(async () => {
      if (this.fh === null) {
        throw new Error('E_SESSION_CLOSED: 会话文件已关闭，禁止追加（fail-closed）')
      }
      const parentId = this.tree.leafId
      const final = { ...e, parentId }
      await this.fh.appendFile(`${JSON.stringify(final)}\n`, 'utf8')
      // 先盘后树：写失败时树/磁盘不分裂（事件未持久化 = 未发生，失败闭合）
      this.tree.append(e, parentId)
      return final
    })
    this.queue = task.catch(() => undefined) // 链不断：失败由调用方处理
    return task
  }

  /**
   * fork 种子写入（§5.8.6）：批量落盘既定信封——sessionId/seq/parentId 已由调用方
   * 重写（事件 id 保留源值：compaction 锚点与引用完整性）。不经 bus——历史复制
   * 不产生新广播（客户端经 POST /fork 响应 + GET 回放获取）。
   */
  seed(events: readonly SparkEventEnvelope[]): Promise<void> {
    const task = this.queue.then(async () => {
      if (this.fh === null) {
        throw new Error('E_SESSION_CLOSED: 会话文件已关闭，禁止追加（fail-closed）')
      }
      for (const e of events) {
        await this.fh.appendFile(`${JSON.stringify(e)}\n`, 'utf8')
        this.tree.append(e, e.parentId ?? null)
      }
    })
    this.queue = task.catch(() => undefined) // 链不断：失败由调用方处理
    return task
  }

  /** fsync（会话切换/引擎退出） */
  async flush(): Promise<void> {
    await this.queue
    await this.fh?.sync()
  }

  async close(): Promise<void> {
    await this.flush()
    await this.fh?.close()
    this.fh = null
  }

  private async writeLine(line: string): Promise<void> {
    await this.fh?.appendFile(`${line}\n`, 'utf8')
  }
}

/**
 * §5.8.4 resume 补闭合：turn.started 无对应 turn.completed → 崩溃遗留的悬挂 turn。
 * 返回悬挂 turnId（按出现序）；resumeSession 对每个补 emit
 * turn.completed{finish:'aborted'}（Codex interrupted 语义）。
 */
export function danglingTurnIds(events: readonly SparkEventEnvelope[]): TurnId[] {
  const started: TurnId[] = []
  const closed = new Set<TurnId>()
  for (const e of events) {
    // 非泛型信封不判别收窄（protocol 不为此加类型），按 type 取字段后局部断言
    if (e.type === 'turn.started') {
      started.push((e.data as SparkEventMap['turn.started']).turnId)
    } else if (e.type === 'turn.completed') {
      closed.add((e.data as SparkEventMap['turn.completed']).turnId)
    }
  }
  return started.filter((id) => !closed.has(id))
}
