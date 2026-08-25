/**
 * MockTransport（doc/02 §4.7 / §6.6）：预录场景脚本驱动的事件流回放——后端未就绪时的假数据通道。
 * 脚本 = examples/mock-sessions/*.jsonl（首行会话元数据，其后事件行与锚点行混排）。
 * 锚点行语义（§4.7 表）：
 *   {"@wait":"approval"} 回放至此挂起，直到 replyPermission（requestId 取脚本内预置值）
 *   {"@wait":"message"}  挂起直到下一次 sendMessage（steer 演示：注入后继续回放）
 *   {"@delay":N}         其后事件间隔固定 N ms（覆盖默认 30~80ms 随机抖动）
 *   {"@speed":N}         全局倍率（实际间隔 = delay / speed）
 * sendMessage 不合成事件——脚本预录的 user.message 原样回放（假对话：文本以脚本为准）。
 */
import { ids, parseEnvelope } from '@spark/protocol'
import type {
  EventId,
  PermissionReply,
  RequestId,
  SessionDto,
  SessionId,
  SessionStatus,
  SparkEventEnvelope,
  SparkEventType,
  SubmitOutcome,
  TreeNodeDto,
  Transport,
  TurnId,
} from '@spark/protocol'
import rawNormal from '../../../../examples/mock-sessions/normal.jsonl?raw'
import rawLongOutput from '../../../../examples/mock-sessions/long-output.jsonl?raw'
import rawReject from '../../../../examples/mock-sessions/reject.jsonl?raw'
import rawErrorFinish from '../../../../examples/mock-sessions/error-finish.jsonl?raw'

export type MockScenario = 'normal' | 'long-output' | 'reject' | 'error-finish'

export const MOCK_SCENARIOS: readonly MockScenario[] = [
  'normal',
  'long-output',
  'reject',
  'error-finish',
]

const SCRIPTS: Record<MockScenario, string> = {
  normal: rawNormal,
  'long-output': rawLongOutput,
  reject: rawReject,
  'error-finish': rawErrorFinish,
}

/** 脚本首行：会话元数据（非事件） */
export interface ScenarioMeta {
  sparkVersion: string
  cwd: string
  createdAt: number
  model: string
}

type ScriptLine =
  | { kind: 'event'; envelope: SparkEventEnvelope }
  | { kind: 'wait'; target: 'approval' | 'message' }
  | { kind: 'delay'; ms: number }
  | { kind: 'speed'; factor: number }

export interface ScenarioScript {
  meta: ScenarioMeta
  lines: ScriptLine[]
  /** 脚本 sessionId（取首事件信封；全脚本一致） */
  sessionId: SessionId
  /** 脚本内 session.created 事件（createSession 吐它） */
  created: SparkEventEnvelope<'session.created'>
}

const ANCHOR_KEYS = { '@wait': 1, '@delay': 1, '@speed': 1 } as const

function isAnchorKey(k: string): k is keyof typeof ANCHOR_KEYS {
  return k in ANCHOR_KEYS
}

/** 解析场景脚本：行形状错误直接抛（脚本随产物打包，坏行 = 开发期错误，fail loudly） */
export function parseScenarioScript(raw: string): ScenarioScript {
  const rows = raw.split('\n').filter((l) => l.trim().length > 0)
  const first = rows[0]
  if (first === undefined) throw new Error('E_MOCK_EMPTY_SCRIPT: 场景脚本为空')

  const metaRow = JSON.parse(first) as unknown
  if (typeof metaRow !== 'object' || metaRow === null || !('sparkVersion' in metaRow)) {
    throw new Error('E_MOCK_BAD_META: 脚本首行缺 sparkVersion 元数据')
  }
  const meta = metaRow as ScenarioMeta

  const lines: ScriptLine[] = []
  for (const row of rows.slice(1)) {
    const parsed = JSON.parse(row) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      const head = Object.keys(parsed)[0]
      if (head !== undefined && isAnchorKey(head)) {
        const anchor = parsed as Record<string, unknown>
        if (head === '@wait' && (anchor['@wait'] === 'approval' || anchor['@wait'] === 'message')) {
          lines.push({ kind: 'wait', target: anchor['@wait'] })
        } else if (head === '@delay' && typeof anchor['@delay'] === 'number') {
          lines.push({ kind: 'delay', ms: anchor['@delay'] })
        } else if (head === '@speed' && typeof anchor['@speed'] === 'number') {
          lines.push({ kind: 'speed', factor: anchor['@speed'] })
        } else {
          throw new Error(`E_MOCK_BAD_ANCHOR: 未知锚点 ${row}`)
        }
        continue
      }
    }
    lines.push({ kind: 'event', envelope: parseEnvelope(parsed) })
  }

  const firstEvent = lines.find(
    (l): l is { kind: 'event'; envelope: SparkEventEnvelope } => l.kind === 'event',
  )
  if (!firstEvent) throw new Error('E_MOCK_NO_EVENTS: 脚本无事件行')
  const created = lines.find(
    (l): l is { kind: 'event'; envelope: SparkEventEnvelope<'session.created'> } =>
      l.kind === 'event' && l.envelope.type === 'session.created',
  )
  if (!created) throw new Error('E_MOCK_NO_SESSION_CREATED: 脚本缺 session.created 事件')
  return { meta, lines, sessionId: firstEvent.envelope.sessionId, created: created.envelope }
}

const jitter = () => 30 + Math.floor(Math.random() * 51) // 30~80ms（§4.7）

/** 事件渲染摘要（树视图 label，工单 4.5）：文本类取 text，其余用类型名（与 server labelOf 同规则简化版） */
function mockLabelOf(e: SparkEventEnvelope): string {
  const data = e.data as Record<string, unknown>
  const text =
    typeof data.text === 'string'
      ? data.text
      : typeof data.title === 'string'
        ? data.title
        : typeof data.summary === 'string'
          ? data.summary
          : ''
  const raw = text.length > 0 ? text : e.type
  return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw
}

/** 按词表窄化事件类型（SparkEventEnvelope 是接口非联合，TS 不做判别收窄） */
function ofType<T extends SparkEventType>(e: SparkEventEnvelope, t: T): e is SparkEventEnvelope<T> {
  return e.type === t
}

export class MockTransport implements Transport {
  private readonly handlers = new Set<(e: SparkEventEnvelope) => void>()
  private script: ScenarioScript
  private scenario: MockScenario
  private cursor = 0 // 下一待处理行
  private delayMs: number | null = null // null = 抖动
  private speedFactor = 1
  private timer: ReturnType<typeof setTimeout> | null = null
  private suspended: 'approval' | 'message' | null = null
  private sessionStarted = false
  private disposed = false
  private currentTurnId: TurnId | null = null
  private lastAskedRequestId: RequestId | null = null
  /** 自动标题已合成（首个 turn.completed 后一次性；引擎语义对等演示） */
  private titleEmitted = false
  /** 已 emit 事件（compact 合成 keptFromEventId/tokensBefore 的数据源） */
  private readonly emitted: SparkEventEnvelope[] = []
  /** fork 子会话（工单 4.5 引擎语义对等演示）：内存态（真实实现落盘 + header 记 parentSession） */
  private readonly forkChildren: { fromEventId: EventId; dto: SessionDto; events: SparkEventEnvelope[] }[] = []

  constructor(scenario: MockScenario = 'normal') {
    this.scenario = scenario
    this.script = parseScenarioScript(SCRIPTS[scenario])
  }

  get currentScenario(): MockScenario {
    return this.scenario
  }

  /** sid 是否为当前脚本会话（流式回放体）；fork 子会话走 getSession 全量回放（工单 4.5） */
  isLiveScriptSession(sid: SessionId): boolean {
    return sid === this.script.sessionId
  }

  /** 场景切换：重置回放状态（不吐事件——新会话由 createSession 发起） */
  setScenario(scenario: MockScenario): void {
    if (scenario === this.scenario) return
    this.stopTimer()
    this.scenario = scenario
    this.script = parseScenarioScript(SCRIPTS[scenario])
    this.cursor = 0
    this.delayMs = null
    this.speedFactor = 1
    this.suspended = null
    this.sessionStarted = false
    this.currentTurnId = null
    this.titleEmitted = false
  }

  onEvent(handler: (e: SparkEventEnvelope) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private emit(e: SparkEventEnvelope): void {
    // 跟踪未闭合 turn 与最近审批请求（interrupt 合成闭合事件用）
    if (ofType(e, 'turn.started')) this.currentTurnId = e.data.turnId
    else if (ofType(e, 'turn.completed')) {
      this.currentTurnId = null
      this.scheduleAutoTitle()
    } else if (ofType(e, 'permission.asked')) this.lastAskedRequestId = e.data.requestId
    this.emitted.push(e)
    for (const h of [...this.handlers]) h(e)
  }

  /** 会话自动标题（工单 4.4 引擎语义对等演示）：首个 turn.completed 后延迟合成 session.title */
  private scheduleAutoTitle(): void {
    if (this.titleEmitted) return
    this.titleEmitted = true
    const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    setTimeout(() => {
      if (this.disposed) return
      this.emit({
        id: ids.event(`evt_mock_title_${rand}`),
        sessionId: this.script.sessionId,
        type: 'session.title',
        time: Date.now(),
        data: { title: '（mock）自动生成的会话标题' },
      })
    }, 400)
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** 下一事件的实际间隔：@delay 固定值或 30~80ms 抖动，除以 @speed 倍率 */
  private nextInterval(): number {
    const base = this.delayMs ?? jitter()
    return Math.max(1, Math.round(base / this.speedFactor))
  }

  /** 回放循环：处理锚点后吐下一事件；遇 @wait 挂起，脚本尾自然停止 */
  private advance(): void {
    // 消化连续锚点（delay/speed 即刻生效，wait 挂起返回）
    while (this.cursor < this.script.lines.length) {
      const line = this.script.lines[this.cursor]
      if (line === undefined) return // 索引收窄（noUncheckedIndexedAccess）；循环条件保证不可达
      if (line.kind === 'delay') {
        this.delayMs = line.ms
        this.cursor++
        continue
      }
      if (line.kind === 'speed') {
        this.speedFactor = line.factor
        this.cursor++
        continue
      }
      if (line.kind === 'wait') {
        this.suspended = line.target
        this.cursor++
        return
      }
      this.cursor++
      this.timer = setTimeout(() => {
        this.timer = null
        this.emit(line.envelope)
        this.advance()
      }, this.nextInterval())
      return
    }
    // 脚本耗尽：回放自然结束（等待切场景或耗尽后的 sendMessage 语义见下）
  }

  sendMessage(_sessionId: SessionId): Promise<SubmitOutcome> {
    // 单场景回放：sessionId 即脚本会话（调用方传当前路由 sid；mock 不校验——夹具宽松）
    return Promise.resolve(this.submit())
  }

  /** 同步受理逻辑（假对话：text 不改变回放内容） */
  private submit(): SubmitOutcome {
    this.assertNotDisposed()
    if (this.suspended === 'message') {
      this.suspended = null
      this.advance()
      return { result: 'steered' }
    }
    if (this.suspended === 'approval') {
      // 审批挂起中 sendMessage = steer/queue 受理，但不解除审批挂起（须 replyPermission）
      return { result: 'queued' }
    }
    if (this.timer !== null) return { result: 'steered' } // 回放进行中：受理为插话（脚本固定，不真正注入）
    if (this.cursor >= this.script.lines.length) return { result: 'queued' } // 场景已播完
    this.startSession()
    this.advance()
    return { result: 'started' }
  }

  /** 首次交互补吐 session.created（若未吐） */
  private startSession(): void {
    if (this.sessionStarted) return
    this.sessionStarted = true
    this.emit(this.script.created)
    const idx = this.script.lines.findIndex(
      (l) => l.kind === 'event' && l.envelope.id === this.script.created.id,
    )
    this.cursor = Math.max(this.cursor, idx + 1)
  }

  interrupt(_sessionId: SessionId): Promise<void> {
    this.stopTimer()
    const rand = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    // 失败闭合（引擎铁律）：挂起中的审批合成拒绝、进行中的 turn 合成 aborted——事件流不悬空
    if (this.suspended === 'approval') {
      const req = this.lastAskedRequestId
      if (req !== null) {
        this.emit({
          id: ids.event(`evt_mock_interrupt_reject_${rand()}`),
          sessionId: this.script.sessionId,
          type: 'permission.resolved',
          time: Date.now(),
          data: { requestId: req, reply: 'reject' },
        })
      }
    }
    const turnId = this.currentTurnId
    if (turnId !== null) {
      this.emit({
        id: ids.event(`evt_mock_aborted_${rand()}`),
        sessionId: this.script.sessionId,
        type: 'turn.completed',
        time: Date.now(),
        data: { turnId, finish: 'aborted' },
      })
    }
    this.suspended = null
    // 跳过本 turn 剩余脚本：cursor 快进到下一个 user.message（或脚本尾），会话回到空闲
    let target = -1
    for (let i = this.cursor; i < this.script.lines.length; i++) {
      const l = this.script.lines[i]
      if (l !== undefined && l.kind === 'event' && l.envelope.type === 'user.message') {
        target = i
        break
      }
    }
    this.cursor = target === -1 ? this.script.lines.length : target
    return Promise.resolve()
  }

  /** 手动压缩（工单 4.3）：合成 started → 600ms → completed 事件对（假摘要） */
  compact(_sessionId: SessionId): Promise<void> {
    this.assertNotDisposed()
    const rand = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    this.emit({
      id: ids.event(`evt_mock_compact_start_${rand()}`),
      sessionId: this.script.sessionId,
      type: 'compaction.started',
      time: Date.now(),
      data: {},
    })
    // 锚点 = 最近回放的 surface 事件（尚无 → session.created 首事件）；tokensBefore 字符近似
    const surfaces = this.emitted.filter(
      (e) => e.type === 'user.message' || e.type === 'assistant.message',
    )
    const lastSurface = surfaces[surfaces.length - 1]
    const keptFromEventId: EventId = lastSurface !== undefined ? lastSurface.id : this.script.created.id
    const tokensBefore = Math.ceil(
      surfaces.reduce((acc, e) => acc + JSON.stringify(e.data).length, 0) / 4,
    )
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.disposed) {
          resolve()
          return
        }
        this.emit({
          id: ids.event(`evt_mock_compact_done_${rand()}`),
          sessionId: this.script.sessionId,
          type: 'compaction.completed',
          time: Date.now(),
          data: {
            summary: '（mock）已压缩此前的对话：保留了目标与当前任务状态。',
            keptFromEventId,
            tokensBefore,
          },
        })
        resolve()
      }, 600)
    })
  }

  replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void> {
    this.assertNotDisposed()
    if (this.suspended !== 'approval') {
      console.warn(`[mock] replyPermission 在无审批挂起时被调用（requestId=${requestId}）——已忽略`)
      return Promise.resolve()
    }
    // 覆写脚本中紧随的 permission.resolved，使 UI 呈现与用户实际选择一致
    const next = this.script.lines
      .slice(this.cursor)
      .find(
        (l): l is { kind: 'event'; envelope: SparkEventEnvelope<'permission.resolved'> } =>
          l.kind === 'event' && l.envelope.type === 'permission.resolved',
      )
    if (next) {
      next.envelope.data = { requestId, reply, ...(feedback !== undefined ? { feedback } : {}) }
    }
    this.suspended = null
    this.advance()
    return Promise.resolve()
  }

  /** 由脚本静态构造 SessionDto（listSessions / createSession 共用） */
  private static dtoOf(script: ScenarioScript, status: SessionStatus): SessionDto {
    const durable = script.lines.flatMap((l) =>
      l.kind === 'event' && l.envelope.seq !== undefined ? [l.envelope] : [],
    )
    const last = durable[durable.length - 1]
    return {
      id: script.sessionId,
      title: script.created.data.title ?? '',
      model: script.meta.model,
      cwd: script.meta.cwd,
      createdAt: script.meta.createdAt,
      updatedAt: last?.time ?? script.meta.createdAt,
      lastSeq: last?.seq ?? 0,
      status,
    }
  }

  /** 接口完整性实现（mock 下 SessionPage 不走全量回放——流式回放即夹具语义） */
  getSession(sessionId: SessionId): Promise<SessionDto> {
    this.assertNotDisposed()
    const fork = this.forkChildren.find((f) => f.dto.id === sessionId)
    if (fork !== undefined) {
      return Promise.resolve({ ...fork.dto, events: fork.events })
    }
    if (sessionId !== this.script.sessionId) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    const dto = MockTransport.dtoOf(this.script, this.status())
    const durable = this.durableLines()
    return Promise.resolve({ ...dto, events: durable })
  }

  listSessions(): Promise<SessionDto[]> {
    return Promise.resolve([
      ...MOCK_SCENARIOS.map((s) =>
        MockTransport.dtoOf(
          s === this.scenario ? this.script : parseScenarioScript(SCRIPTS[s]),
          'idle',
        ),
      ),
      ...this.forkChildren.map((f) => f.dto),
    ])
  }

  /** 脚本 durable 事件（seq 升序线性链——树视图与 fork 复制的数据源） */
  private durableLines(): SparkEventEnvelope[] {
    return this.script.lines.flatMap((l) =>
      l.kind === 'event' && l.envelope.seq !== undefined ? [l.envelope] : [],
    )
  }

  /** 工单 4.5 树视图：脚本 durable 事件 → 线性链节点（fork 子会话标注在边界事件上） */
  getTree(sessionId: SessionId): Promise<TreeNodeDto[]> {
    this.assertNotDisposed()
    let events: SparkEventEnvelope[]
    let forks: { fromEventId: EventId; dto: SessionDto }[]
    if (sessionId === this.script.sessionId) {
      events = this.durableLines()
      forks = this.forkChildren.map((f) => ({ fromEventId: f.fromEventId, dto: f.dto }))
    } else {
      const fork = this.forkChildren.find((f) => f.dto.id === sessionId)
      if (fork === undefined) {
        return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
      }
      events = fork.events
      forks = []
    }
    return Promise.resolve(
      events.map((e, i) => {
        const prev = i > 0 ? events[i - 1]?.id ?? null : null
        const next = events[i + 1]?.id
        return {
          id: e.id,
          parentId: prev,
          seq: e.seq ?? 0,
          type: e.type,
          time: e.time,
          label: mockLabelOf(e),
          childIds: next !== undefined ? [next] : [],
          forks: forks
            .filter((f) => f.fromEventId === e.id)
            .map((f) => ({ sessionId: f.dto.id, title: f.dto.title, createdAt: f.dto.createdAt })),
        }
      }),
    )
  }

  /** 工单 4.5 fork：内存复制边界前路径（引擎语义对等——三拒绝码同构） */
  fork(sessionId: SessionId, fromEventId: EventId): Promise<SessionDto> {
    this.assertNotDisposed()
    if (sessionId !== this.script.sessionId) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    if (this.timer !== null || this.suspended !== null) {
      return Promise.reject(new Error('E_OPEN_TURN: turn 进行中，不可分叉——请等本轮结束'))
    }
    const durable = this.durableLines()
    const idx = durable.findIndex((e) => e.id === fromEventId)
    if (idx === -1) {
      return Promise.reject(new Error(`E_INVALID_BOUNDARY: 分叉边界事件 ${fromEventId} 不存在`))
    }
    const kept = durable.slice(0, idx + 1)
    const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    const forkId = ids.session(`ses_mock_fork_${rand}`)
    const last = kept[kept.length - 1]
    const dto: SessionDto = {
      id: forkId,
      title: `${this.script.created.data.title ?? '会话'}（分叉）`,
      model: this.script.meta.model,
      cwd: this.script.meta.cwd,
      createdAt: Date.now(),
      updatedAt: last?.time ?? this.script.meta.createdAt,
      lastSeq: idx + 1,
      status: 'idle',
    }
    this.forkChildren.push({ fromEventId, dto, events: kept })
    return Promise.resolve(dto)
  }

  createSession(): Promise<SessionDto> {
    this.assertNotDisposed()
    this.startSession()
    return Promise.resolve(MockTransport.dtoOf(this.script, this.status()))
  }

  status(): SessionStatus {
    if (this.suspended === 'approval') return 'waiting-approval'
    if (this.timer !== null) return 'running'
    return 'idle'
  }

  dispose(): void {
    this.disposed = true
    this.stopTimer()
    this.handlers.clear()
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('E_MOCK_DISPOSED: MockTransport 已 dispose')
  }
}
