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
import { SETTINGS_RESTART_REQUIRED, ids, parseEnvelope } from '@spark/protocol'
import { MOCK_COMMANDS, MOCK_MODELS, auditSeed, mockRandom } from './mock-data'
import type {
  AuditEntryDto,
  AuditQuery,
  AutomationCreate,
  AutomationRunDto,
  AutomationTriggerDto,
  CheckpointDto,
  CheckpointId,
  CommandDto,
  ContentItem,
  EventId,
  FsListDto,
  McpServerDto,
  MemoryDto,
  ModelTestResultDto,
  ModelsDto,
  PairCodeDto,
  PairRedeemBody,
  PairStatusDto,
  PairTokenDto,
  RoutingDto,
  RoutingUpdate,
  PermissionPreset,
  PermissionReply,
  PermissionRuleDto,
  ReasoningEffort,
  RequestId,
  SecretStatusDto,
  SessionDto,
  SessionEventsQuery,
  SessionId,
  SessionStatus,
  SearchHitDto,
  SettingsDto,
  SettingsUpdate,
  SkillDto,
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
  /** 最近一次 asked 完整信封（always 固化 alwaysPatterns 的数据源，工单 4.7） */
  private lastAsked: SparkEventEnvelope<'permission.asked'> | null = null
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
    else if (ofType(e, 'permission.asked')) {
      this.lastAskedRequestId = e.data.requestId
      this.lastAsked = e
    }
    this.emitted.push(e)
    for (const h of [...this.handlers]) h(e)
    if (ofType(e, 'turn.completed')) {
      this.currentTurnId = null
      this.emitCheckpoint(e.data.turnId)
      this.scheduleAutoTitle()
    }
  }

  /**
   * turn 边界快照事件（工单 4.6 引擎语义对等演示）：checkpointId 与
   * listCheckpoints 派生规则一致（ckp_mock_<turn 序号>）——徽标与列表可互查。
   */
  private emitCheckpoint(turnId: TurnId): void {
    const n = this.emitted.filter((e) => e.type === 'turn.completed').length
    const rand = mockRandom()
    this.emit({
      id: ids.event(`evt_mock_ckpt_${n}_${rand}`),
      sessionId: this.script.sessionId,
      type: 'checkpoint.created',
      time: Date.now(),
      data: {
        checkpointId: ids.checkpoint(`ckp_mock_${n}`),
        files: ['.spark-checkpoint/session.jsonl'], // 引擎 SESSION_ALIAS（会话文件域）
        turnId,
      },
    })
  }

  /** 会话自动标题（工单 4.4 引擎语义对等演示）：首个 turn.completed 后延迟合成 session.title */
  private scheduleAutoTitle(): void {
    if (this.titleEmitted) return
    this.titleEmitted = true
    const rand = mockRandom()
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
    const rand = mockRandom
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
    const rand = mockRandom
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
    if (reply === 'always' && this.lastAsked !== null) {
      // 工单 4.7 对等演示：按 alwaysPatterns（缺省 patterns ?? [resource]）固化到内存规则表
      const asked = this.lastAsked
      const targets = asked.data.alwaysPatterns ?? asked.data.patterns ?? [asked.data.resource]
      for (const resource of targets) {
        MockTransport.putRule(this.rules, { action: asked.data.action, resource, effect: 'allow' })
      }
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

  // ---- 权限规则管理（工单 4.7 对等演示：内存表，进程生命周期内有效） ----

  private readonly rules: PermissionRuleDto[] = []

  listPermissionRules(): Promise<PermissionRuleDto[]> {
    this.assertNotDisposed()
    return Promise.resolve([...this.rules])
  }

  addPermissionRule(rule: PermissionRuleDto): Promise<void> {
    this.assertNotDisposed()
    MockTransport.putRule(this.rules, rule)
    return Promise.resolve()
  }

  removePermissionRule(action: string, resource: string): Promise<void> {
    return this.removeBy(this.rules, (r) => r.action === action && r.resource === resource, `规则 ${action} ${resource}`)
  }

  /** 精确匹配 action+resource 覆盖，否则追加（与引擎 UserRuleStore.add 同语义） */
  private static putRule(rules: PermissionRuleDto[], rule: PermissionRuleDto): void {
    const idx = rules.findIndex((r) => r.action === rule.action && r.resource === rule.resource)
    if (idx >= 0) rules[idx] = { ...rule }
    else rules.push({ ...rule })
  }

  // ---- 密钥管理（阶段七工单 7.1 对等演示：内存表，进程生命周期内有效） ----

  /** mock 场景无 models.json：固定 provider 集（场景 meta.model 前缀） */
  private static readonly MOCK_PROVIDERS: readonly string[] = ['deepseek', 'openai']

  private readonly secretValues = new Map<string, string>()

  listSecrets(): Promise<SecretStatusDto[]> {
    this.assertNotDisposed()
    return Promise.resolve(
      MockTransport.MOCK_PROVIDERS.map((provider) => ({
        provider,
        source: this.secretValues.has(provider)
          ? ('store' as const)
          : ('none' as const),
      })),
    )
  }

  setSecret(provider: string, value: string): Promise<void> {
    this.assertNotDisposed()
    if (!MockTransport.MOCK_PROVIDERS.includes(provider)) {
      return Promise.reject(new Error(`E_CONFIG: models.json 未配置 provider "${provider}"`))
    }
    this.secretValues.set(provider, value)
    return Promise.resolve()
  }

  removeSecret(provider: string): Promise<void> {
    this.assertNotDisposed()
    if (!this.secretValues.delete(provider)) {
      return Promise.reject(new Error('E_NOT_FOUND: 密钥仓中无此 provider'))
    }
    return Promise.resolve()
  }

  // ---- 权限档位（工单 6.3 对等演示：内存表，随会话 id 记忆；引擎同款语义） ----

  private readonly presets = new Map<SessionId, PermissionPreset>()

  getPermissionPreset(sessionId: SessionId): Promise<PermissionPreset> {
    this.assertNotDisposed()
    const known =
      sessionId === this.script.sessionId || this.forkChildren.some((f) => f.dto.id === sessionId)
    if (!known) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    return Promise.resolve(this.presets.get(sessionId) ?? 'confirm-each')
  }

  setPermissionPreset(sessionId: SessionId, preset: PermissionPreset): Promise<void> {
    this.assertNotDisposed()
    const known =
      sessionId === this.script.sessionId || this.forkChildren.some((f) => f.dto.id === sessionId)
    if (!known) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    if (preset === 'confirm-each') this.presets.delete(sessionId)
    else this.presets.set(sessionId, preset)
    return Promise.resolve()
  }

  // ---- 模型管理（工单 6.5 对等演示：内置目录副本 + 内存换模型，引擎同款语义） ----

  /** 会话级换模型内存表（引擎同款：内存态，进程生命周期内有效） */
  private readonly modelOverrides = new Map<SessionId, string>()

  /** 会话级推理档位内存表（工单 10.6；同引擎内存态纪律） */
  private readonly effortOverrides = new Map<SessionId, ReasoningEffort>()

  listModels(): Promise<ModelsDto> {
    this.assertNotDisposed()
    return Promise.resolve(MOCK_MODELS)
  }

  testModelProvider(providerId: string): Promise<ModelTestResultDto> {
    this.assertNotDisposed()
    const p = MOCK_MODELS.providers.find((x) => x.id === providerId)
    if (p === undefined) {
      return Promise.resolve({
        provider: providerId,
        ok: false,
        message: '未知供应商：不在 models.json providers，也不在内置目录',
      })
    }
    if (!p.configured) {
      return Promise.resolve({
        provider: providerId,
        ok: false,
        message: '未配置：该供应商未写入 models.json providers',
      })
    }
    if (!p.hasKey) {
      return Promise.resolve({
        provider: providerId,
        ok: false,
        message: '缺少 API Key：models.json 未设置 apiKeyEnv',
      })
    }
    return Promise.resolve({
      provider: providerId,
      ok: true,
      latencyMs: 86,
      message: '连通正常',
    })
  }

  setSessionModel(sessionId: SessionId, model: string): Promise<string> {
    this.assertNotDisposed()
    const known =
      sessionId === this.script.sessionId || this.forkChildren.some((f) => f.dto.id === sessionId)
    if (!known) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    const slash = model.indexOf('/')
    if (slash <= 0 || slash === model.length - 1) {
      return Promise.reject(new Error(`E_CONFIG: model "${model}" 须为 provider/model 形式`))
    }
    const provider = model.slice(0, slash)
    const configured = MOCK_MODELS.providers.find((x) => x.id === provider)
    if (configured === undefined || !configured.configured) {
      return Promise.reject(new Error(`E_CONFIG: models.json 未配置 provider "${provider}"`))
    }
    this.modelOverrides.set(sessionId, model)
    return Promise.resolve(model)
  }

  setSessionEffort(sessionId: SessionId, effort: ReasoningEffort): Promise<ReasoningEffort> {
    this.assertNotDisposed()
    const known =
      sessionId === this.script.sessionId || this.forkChildren.some((f) => f.dto.id === sessionId)
    if (!known) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    this.effortOverrides.set(sessionId, effort)
    return Promise.resolve(effort)
  }

  // ---- 模型路由（工单 7.7 / H07）：内存态 mock——回放路由热更新语义 ----

  private routing: RoutingDto = {
    fallbacks: ['deepseek/deepseek-chat'],
    compactionModel: 'deepseek/deepseek-chat',
    titleModel: 'deepseek/deepseek-chat',
    subagentModel: 'deepseek/deepseek-chat',
    costLimitUsd: null,
    usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, exceeded: false },
  }

  getRouting(): Promise<RoutingDto> {
    this.assertNotDisposed()
    return Promise.resolve(this.routing)
  }

  updateRouting(patch: RoutingUpdate): Promise<RoutingDto> {
    this.assertNotDisposed()
    const providerOf = (m: string): string => {
      const slash = m.indexOf('/')
      if (slash <= 0 || slash === m.length - 1) {
        throw new Error(`E_CONFIG: model "${m}" 须为 provider/model 形式`)
      }
      const provider = m.slice(0, slash)
      const configured = MOCK_MODELS.providers.find((x) => x.id === provider)
      if (configured === undefined || !configured.configured) {
        throw new Error(`E_CONFIG: models.json 未配置 provider "${provider}"`)
      }
      return m
    }
    const next: RoutingDto = {
      ...this.routing,
      ...(patch.fallbacks !== undefined ? { fallbacks: patch.fallbacks.map(providerOf) } : {}),
      ...(patch.compactionModel !== undefined ? { compactionModel: providerOf(patch.compactionModel) } : {}),
      ...(patch.titleModel !== undefined ? { titleModel: providerOf(patch.titleModel) } : {}),
      ...(patch.subagentModel !== undefined ? { subagentModel: providerOf(patch.subagentModel) } : {}),
      ...(patch.costLimitUsd !== undefined ? { costLimitUsd: patch.costLimitUsd } : {}),
    }
    this.routing = next
    return Promise.resolve(next)
  }

  resetUsage(): Promise<RoutingDto> {
    this.assertNotDisposed()
    this.routing = {
      ...this.routing,
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, exceeded: false },
    }
    return Promise.resolve(this.routing)
  }

  // ---- 全局设置（工单 10.20 B 类对等演示：GET/PUT /api/settings） ----

  private settings: SettingsDto = {
    server: { port: 4318, host: '127.0.0.1' },
    engine: {
      maxStepsPerTurn: 50,
      maxToolParallel: 4,
      toolTimeoutMs: 120_000,
      permissionTimeoutMs: 300_000,
      progressThrottleMs: 250,
      toolOutputLimitKB: 64,
      compactionThreshold: 0.8,
      checkpoints: true,
      bashSandbox: 'on',
    },
    restartRequired: [...SETTINGS_RESTART_REQUIRED],
    models: { defaultModel: 'deepseek/deepseek-chat', defaultEffort: null },
  }

  getSettings(): Promise<SettingsDto> {
    this.assertNotDisposed()
    return Promise.resolve(this.settings)
  }

  updateSettings(patch: SettingsUpdate): Promise<SettingsDto> {
    this.assertNotDisposed()
    const s = patch.server ?? {}
    const e = patch.engine ?? {}
    const prev = this.settings
    this.settings = {
      ...prev,
      server: {
        port: s.port ?? prev.server.port,
        host: s.host ?? prev.server.host,
      },
      engine: {
        maxStepsPerTurn: e.maxStepsPerTurn ?? prev.engine.maxStepsPerTurn,
        maxToolParallel: e.maxToolParallel ?? prev.engine.maxToolParallel,
        toolTimeoutMs: e.toolTimeoutMs ?? prev.engine.toolTimeoutMs,
        permissionTimeoutMs: e.permissionTimeoutMs ?? prev.engine.permissionTimeoutMs,
        progressThrottleMs: e.progressThrottleMs ?? prev.engine.progressThrottleMs,
        toolOutputLimitKB: e.toolOutputLimitKB ?? prev.engine.toolOutputLimitKB,
        compactionThreshold: e.compactionThreshold ?? prev.engine.compactionThreshold,
        checkpoints: e.checkpoints ?? prev.engine.checkpoints,
        bashSandbox: e.bashSandbox ?? prev.engine.bashSandbox,
      },
      ...(patch.hooks !== undefined ? { ...(patch.hooks === null ? {} : { hooks: patch.hooks }) } : {}),
    }
    return Promise.resolve(this.settings)
  }

  listCommands(): Promise<CommandDto[]> {
    this.assertNotDisposed()
    return Promise.resolve([...MOCK_COMMANDS])
  }

  executeCommand(sessionId: SessionId, name: string, _args?: string): Promise<void> {
    this.assertNotDisposed()
    if (sessionId !== this.script.sessionId && !this.forkChildren.some((f) => f.dto.id === sessionId)) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    if (name === 'compact') return this.compact(sessionId)
    if (name === 'review') {
      // 对等演示：自定义命令展开为 prompt 走正常 turn（sendMessage 假对话回放）
      return this.sendMessage(sessionId).then(() => undefined)
    }
    if (MOCK_COMMANDS.some((c) => c.name === name && c.kind === 'client')) {
      return Promise.reject(new Error(`E_COMMAND_CLIENT: /${name} 是界面命令，由前端执行`))
    }
    return Promise.reject(new Error(`E_NOT_FOUND: 未知命令 /${name}`))
  }

  // ---- 配对鉴权（工单 9.1 / D24 对等演示：内存表，进程生命周期内有效） ----

  private pairSeq = 0
  /** 在途短码（一次性：兑换后失效；与服务端 PairService 同语义） */
  private pairCode: string | null = null
  private readonly pairDevices: { id: string; name: string; createdAt: number; lastSeenAt: number }[] = []

  getPairStatus(): Promise<PairStatusDto> {
    this.assertNotDisposed()
    return Promise.resolve({
      host: '127.0.0.1',
      port: 4318,
      loopback: true,
      authEnabled: this.pairDevices.length > 0,
      devices: [...this.pairDevices],
    })
  }

  createPairCode(): Promise<PairCodeDto> {
    this.assertNotDisposed()
    const code = String((this.pairSeq += 1)).padStart(6, '0')
    this.pairCode = code
    const dto: PairCodeDto = {
      code,
      expiresAt: Date.now() + 60_000,
      qr: `spark://pair?host=127.0.0.1&port=4318&code=${code}`,
    }
    return Promise.resolve(dto)
  }

  redeemPair(body: PairRedeemBody): Promise<PairTokenDto> {
    this.assertNotDisposed()
    if (this.pairCode === null || body.code !== this.pairCode) {
      return Promise.reject(new Error('E_PAIR: 配对码无效或已过期'))
    }
    this.pairCode = null // 一次性：兑换后即失效（重放拒绝）
    const now = Date.now()
    const id = `dev_mock_${this.pairDevices.length + 1}`
    this.pairDevices.push({ id, name: body.name ?? '移动设备', createdAt: now, lastSeenAt: now })
    return Promise.resolve({ token: `spk_mock_${id}` })
  }

  revokePairDevice(id: string): Promise<void> {
    return this.removeBy(this.pairDevices, (d) => d.id === id, `配对设备 ${id}`)
  }

  listMcpServers(): Promise<McpServerDto[]> {
    this.assertNotDisposed()
    return Promise.resolve([
      { name: 'filesystem', connected: true, tools: 3, command: 'npx' },
      { name: 'github', connected: false, tools: 0, command: 'npx' },
    ])
  }

  listSkills(): Promise<SkillDto[]> {
    this.assertNotDisposed()
    return Promise.resolve([
      {
        name: 'demo-ping',
        events: ['plugin.demo.ping'],
        hooks: [{ on: 'session.created', emit: 'plugin.demo.ping' }],
      },
    ])
  }

  // ---- 长期记忆（工单 7.5 对等演示：内存表，进程生命周期内有效） ----

  private readonly memories: MemoryDto[] = [
    { id: 1001, content: '（mock）用户偏好深色主题', createdAt: 1787800000000 },
    { id: 1002, content: '（mock）项目约定用 pnpm 管理依赖', createdAt: 1787800001000 },
  ]

  listMemories(): Promise<MemoryDto[]> {
    this.assertNotDisposed()
    return Promise.resolve([...this.memories])
  }

  removeMemory(id: number): Promise<void> {
    return this.removeBy(this.memories, (m) => m.id === id, `记忆 ${id}`)
  }

  // ---- 自动化触发器（工单 7.6 对等演示：内存表，进程生命周期内有效） ----

  private automationSeq = 0
  private readonly automations: AutomationTriggerDto[] = [
    {
      id: 'mock-auto-1',
      name: '（mock）夜间巡检',
      enabled: true,
      cwd: '/tmp/spark',
      prompt: '检查构建状态',
      cron: '0 3 * * *',
      createdAt: 1787800000000,
    },
  ]
  private readonly automationRuns: AutomationRunDto[] = []

  listAutomation(): Promise<AutomationTriggerDto[]> {
    this.assertNotDisposed()
    return Promise.resolve([...this.automations])
  }

  createAutomation(input: AutomationCreate): Promise<AutomationTriggerDto> {
    this.assertNotDisposed()
    if (input.cron === undefined && input.watch === undefined && input.webhook !== true) {
      return Promise.reject(new Error('E_TRIGGER: 至少启用一种触发条件（cron / watch / webhook）'))
    }
    const t: AutomationTriggerDto = {
      id: `mock-auto-${++this.automationSeq + 1}`,
      enabled: true,
      createdAt: Date.now(),
      ...input,
    }
    this.automations.push(t)
    return Promise.resolve(t)
  }

  removeAutomation(id: string): Promise<void> {
    return this.removeBy(this.automations, (t) => t.id === id, `触发器 ${id}`)
  }

  setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
    this.assertNotDisposed()
    const t = this.automations.find((x) => x.id === id)
    if (t === undefined) return Promise.reject(new Error(`E_NOT_FOUND: 触发器 ${id} 不存在`))
    t.enabled = enabled
    return Promise.resolve()
  }

  listAutomationRuns(limit?: number): Promise<AutomationRunDto[]> {
    this.assertNotDisposed()
    const rows = [...this.automationRuns].reverse() // 存储旧→新，线上形状新→旧
    return Promise.resolve(limit !== undefined ? rows.slice(0, limit) : rows)
  }

  /** 审计演示条目（三类 kind；时间相对调用时刻，保证"今天"等过滤演示有命中） */
  listAudit(query?: AuditQuery): Promise<AuditEntryDto[]> {
    this.assertNotDisposed()
    const now = Date.now()
    const sid = this.script.sessionId
    const entries: AuditEntryDto[] = auditSeed(now, sid)
    const filtered = entries.filter(
      (e) =>
        (query?.since === undefined || e.time >= query.since) &&
        (query?.kind === undefined || e.kind === query.kind) &&
        (query?.result === undefined || e.result === query.result) &&
        (query?.tool === undefined || e.tool === query.tool),
    )
    return Promise.resolve(filtered.slice(-(query?.limit ?? 200)).reverse())
  }

  /** 全文搜索（工单 7.13）：mock 扫脚本 + fork 子会话事件做大小写不敏感子串匹配 */
  search(q: string, limit?: number): Promise<SearchHitDto[]> {
    this.assertNotDisposed()
    const needle = q.trim().toLowerCase()
    if (needle === '') return Promise.resolve([])
    const sources: { sessionId: SessionId; title: string; events: SparkEventEnvelope[] }[] = [
      {
        sessionId: this.script.sessionId,
        title: this.script.created.data.title ?? '',
        events: this.script.lines.flatMap((l) => (l.kind === 'event' ? [l.envelope] : [])),
      },
      ...this.forkChildren.map((f) => ({
        sessionId: f.dto.id,
        title: f.dto.title,
        events: f.events,
      })),
    ]
    const hits: SearchHitDto[] = []
    for (const s of sources) {
      for (const e of s.events) {
        if (e.seq === undefined) continue
        let content = ''
        let type: SearchHitDto['type'] | null = null
        if (e.type === 'user.message') {
          content = (e.data as { text: string }).text
          type = 'user.message'
        } else if (e.type === 'assistant.message') {
          content = (e.data as { content: ContentItem[] }).content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
          if (content === '') continue
          type = 'assistant.message'
        } else if (e.type === 'session.title') {
          content = (e.data as { title: string }).title
          if (content === '') continue
          type = 'session.title'
        } else {
          continue
        }
        const idx = content.toLowerCase().indexOf(needle)
        if (idx === -1) continue
        const start = Math.max(0, idx - 30)
        const end = Math.min(content.length, idx + needle.length + 90)
        hits.push({
          sessionId: s.sessionId,
          sessionTitle: s.title,
          eventId: e.id,
          seq: e.seq,
          type,
          time: e.time,
          snippet: `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`,
        })
      }
    }
    hits.sort((a, b) => b.time - a.time)
    return Promise.resolve(hits.slice(0, limit ?? 20))
  }

  /** 目录列举（工单 10.53）：mock 固定小树——web @ 菜单壳的占位数据源（真实列举见 server /api/sessions/:id/fs） */
  listFs(_sessionId: SessionId, path = ''): Promise<FsListDto> {
    this.assertNotDisposed()
    // 镜像服务端语义：path 末段为前缀，列举其父目录；mock 只回固定三项（目录优先）
    const slash = path.lastIndexOf('/')
    const dir = slash === -1 ? '' : path.slice(0, slash)
    const base = dir === '' ? '' : `${dir}/`
    return Promise.resolve({
      path: dir,
      entries: [
        { name: 'src', path: `${base}src`, isDir: true },
        { name: 'README.md', path: `${base}README.md`, isDir: false },
        { name: 'package.json', path: `${base}package.json`, isDir: false },
      ],
    })
  }

  fireAutomationWebhook(id: string): Promise<void> {
    this.assertNotDisposed()
    const t = this.automations.find((x) => x.id === id)
    if (t === undefined) return Promise.reject(new Error(`E_NOT_FOUND: 触发器 ${id} 不存在`))
    if (!t.enabled) return Promise.reject(new Error('E_TRIGGER_DISABLED: 触发器已停用'))
    if (t.webhook !== true) {
      return Promise.reject(new Error(`E_TRIGGER_KIND: 触发器 ${t.name} 未启用 webhook 入口`))
    }
    return this.recordAutomationRun(t, 'webhook')
  }

  fireAutomationManual(id: string): Promise<void> {
    this.assertNotDisposed()
    const t = this.automations.find((x) => x.id === id)
    if (t === undefined) return Promise.reject(new Error(`E_NOT_FOUND: 触发器 ${id} 不存在`))
    return this.recordAutomationRun(t, 'manual')
  }

  private recordAutomationRun(
    t: AutomationTriggerDto,
    kind: AutomationRunDto['kind'],
  ): Promise<void> {
    this.automationRuns.push({
      id: `mock-run-${this.automationRuns.length + 1}`,
      triggerId: t.id,
      triggerName: t.name,
      at: Date.now(),
      kind,
      finish: 'ok',
    })
    return Promise.resolve()
  }

  /** dtoOf 后叠加会话级覆盖（工单 10.6：换模型 + 推理档位两内存态） */
  private withSessionOverrides(sid: SessionId, dto: SessionDto): SessionDto {
    let out = dto
    const m = this.modelOverrides.get(sid)
    if (m !== undefined) out = { ...out, model: m }
    const e = this.effortOverrides.get(sid)
    if (e !== undefined) out = { ...out, effort: e }
    return out
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
      // 工单 10.6：脚本 session.created 携带的分支/档位真值透传（缺省不携带）
      ...(script.created.data.branch !== undefined ? { branch: script.created.data.branch } : {}),
      ...(script.created.data.effort !== undefined ? { effort: script.created.data.effort } : {}),
    }
  }

  /** 接口完整性实现（mock 下 SessionPage 不走全量回放——流式回放即夹具语义） */
  getSession(sessionId: SessionId, query?: SessionEventsQuery): Promise<SessionDto> {
    this.assertNotDisposed()
    const fork = this.forkChildren.find((f) => f.dto.id === sessionId)
    // 分页（工单 9.3）：before 游标过滤 + limit 升序尾部切片；全缺省 = 全量（红线）
    const page = (events: SparkEventEnvelope[]): SparkEventEnvelope[] => {
      let out = events
      if (query?.before !== undefined) {
        const before = query.before
        out = out.filter((e) => e.seq !== undefined && e.seq < before)
      }
      if (query?.limit !== undefined) out = out.slice(-query.limit)
      return out
    }
    if (fork !== undefined) {
      return Promise.resolve({ ...fork.dto, events: page(fork.events) })
    }
    if (sessionId !== this.script.sessionId) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    // 已回放的事件即"当前态"（含 rollbackCheckpoint 截断后的现状）——
    // 未回放脚本行不上车（mock 会话冷启动走流式回放，不走本全量路径）
    const durable = this.emitted.filter((e) => e.seq !== undefined)
    const events = page(durable)
    const last = durable[durable.length - 1]
    return Promise.resolve(
      this.withSessionOverrides(sessionId, {
        ...MockTransport.dtoOf(this.script, this.status()),
        lastSeq: last?.seq ?? 0,
        updatedAt: last?.time ?? this.script.meta.createdAt,
        events,
      }),
    )
  }

  /** 归档登记（工单 12.4 mock 对等）+ 列表过滤开关（archived=true 只列归档） */
  private readonly archived = new Set<string>()
  private archivedFilter = false

  archiveSession(sessionId: string, archived: boolean): Promise<SessionDto> {
    if (archived) this.archived.add(sessionId)
    else this.archived.delete(sessionId)
    const dto = [...this.listAllDtos()].find((d) => d.id === sessionId)
    if (dto === undefined) return Promise.reject(new Error(`E_NOT_FOUND: 会话 ${sessionId} 不存在`))
    return Promise.resolve(archived ? { ...dto, archivedAt: new Date().toISOString() } : dto)
  }

  deleteSession(sessionId: string): Promise<void> {
    const idx = this.forkChildren.findIndex((f) => f.dto.id === sessionId)
    if (idx !== -1) this.forkChildren.splice(idx, 1)
    this.archived.delete(sessionId)
    return Promise.resolve()
  }

  private *listAllDtos(): Generator<SessionDto> {
    for (const s of MOCK_SCENARIOS) {
      yield this.withSessionOverrides(
        this.parseFor(s).sessionId,
        MockTransport.dtoOf(this.parseFor(s), 'idle'),
      )
    }
    for (const f of this.forkChildren) yield f.dto
  }

  listSessions(archived = false): Promise<SessionDto[]> {
    this.archivedFilter = archived
    return Promise.resolve(
      [
        ...MOCK_SCENARIOS.map((s) =>
          this.withSessionOverrides(
            this.parseFor(s).sessionId,
            MockTransport.dtoOf(this.parseFor(s), 'idle'),
          ),
        ),
        ...this.forkChildren.map((f) => f.dto),
      ].filter((d) => this.archived.has(d.id) === this.archivedFilter),
    )
  }

  /** 场景脚本取用（当前场景用已解析实例，其余按需解析） */
  private parseFor(s: MockScenario): ScenarioScript {
    return s === this.scenario ? this.script : parseScenarioScript(SCRIPTS[s])
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
            .map((f) => ({
              sessionId: f.dto.id,
              title: f.dto.title,
              createdAt: f.dto.createdAt,
              status: f.dto.status,
            })),
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
    const rand = mockRandom()
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

  /**
   * 工单 4.6 checkpoint：按已回放的 turn.completed 边界派生快照列表（引擎语义对等
   * 演示——真实实现为 turn 边界 git 快照，两域 = 工作区 + 会话文件别名）。
   */
  listCheckpoints(sessionId: SessionId): Promise<CheckpointDto[]> {
    this.assertNotDisposed()
    if (sessionId !== this.script.sessionId) {
      return Promise.resolve([]) // fork 子会话为内存态（未走 run-loop），无快照
    }
    let n = 0
    return Promise.resolve(
      this.emitted.flatMap((e) => {
        if (e.type !== 'turn.completed') return []
        n += 1
        return [
          {
            checkpointId: ids.checkpoint(`ckp_mock_${n}`),
            turnId: (e.data as { turnId: TurnId }).turnId,
            createdAt: e.time,
            files: ['.spark-checkpoint/session.jsonl'], // 引擎 SESSION_ALIAS（会话文件域）
          },
        ]
      }),
    )
  }

  /** 工单 4.6 回滚：截断已回放事件到快照边界（内存态；引擎为 reset --hard + 覆写两域） */
  rollbackCheckpoint(sessionId: SessionId, checkpointId: CheckpointId): Promise<SessionDto> {
    this.assertNotDisposed()
    if (sessionId !== this.script.sessionId) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    if (this.timer !== null || this.suspended !== null) {
      return Promise.reject(new Error('E_OPEN_TURN: turn 进行中，不可回滚——请等本轮结束'))
    }
    let n = 0
    const cut = this.emitted.findIndex((e) => {
      if (e.type !== 'turn.completed') return false
      n += 1
      return ids.checkpoint(`ckp_mock_${n}`) === checkpointId
    })
    if (cut === -1) {
      return Promise.reject(new Error(`E_NOT_FOUND: checkpoint ${checkpointId} 不存在`))
    }
    this.emitted.length = cut + 1 // 截断到该 turn.completed（含）
    this.currentTurnId = null
    const durable = this.emitted.filter((e) => e.seq !== undefined)
    const last = durable[durable.length - 1]
    return Promise.resolve({
      ...MockTransport.dtoOf(this.script, this.status()),
      lastSeq: last?.seq ?? 0,
      updatedAt: last?.time ?? this.script.meta.createdAt,
    })
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

  /** 同构删除单点（工单 R-E④）：findIndex 未命中 → E_NOT_FOUND（label 进文案）；命中则移除 */
  private removeBy<T>(list: T[], pred: (item: T) => boolean, label: string): Promise<void> {
    this.assertNotDisposed()
    const idx = list.findIndex(pred)
    if (idx < 0) return Promise.reject(new Error(`E_NOT_FOUND: ${label} 不存在`))
    list.splice(idx, 1)
    return Promise.resolve()
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('E_MOCK_DISPOSED: MockTransport 已 dispose')
  }
}
