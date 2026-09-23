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
import { MCP_ENV_MASK, SANDBOX_NETWORK_DEFAULTS, SETTINGS_RESTART_REQUIRED, TRANSCRIBE_ALLOWED_MIME, TRANSCRIBE_MAX_AUDIO_BYTES, base64ByteLength, findKnownLspServer, ids, parseEnvelope } from '@spark/protocol'
import { MOCK_COMMANDS, MOCK_MODELS, auditSeed, mockRandom } from './mock-data'
import type { AgentPresetDto, ArenaHistoryDto, ArenaStatusDto, AttachmentDto, AuditEntryDto, AuditQuery, AutomationCreate, AutomationRunDto, AutomationTriggerDto, BrowserCleanupResultDto, CheckpointDto, CheckpointId, Delivery, SendMessageOptions, CommandDto, ContentItem, EventId, ExtensionDto, FeedbackEntryDto, FeedbackInput, FeedbackQuery, FeedbackVote, FsEntryDto, FsListDto, FsTreeDto, IndexStatsDto, LspInstallResultDto, LspServerStatusDto, LogsDto, LogsQuery, McpConfigInput, McpServerDto, MemoryDto, ModelTestResultDto, ModelsDto, PairCodeDto, PairRedeemBody, PairStatusDto, PairTokenDto, PermissionPreset, PermissionReply, PermissionRuleDto, PromptsDto, ReasoningEffort, RebuildResultDto, RebuildVectorsResultDto, RequestId, RoutingDto, RoutingUpdate, SandboxNetworkStatusDto, SearchHitDto, SecretStatusDto, SessionDto, SessionEventsQuery, SessionId, SessionMode, SessionStatus, SettingsDto, SettingsUpdate, SkillDto, SparkEventEnvelope, SparkEventType, SubmitOutcome, TraceDto, TraceTurnDto, TranscribeRequest, TranscribeResultDto, Transport, TreeNodeDto, TrustStatusDto, TurnId, UsageBucketDto, UsageSummaryDto, VacuumResultDto } from '@spark/protocol'
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
interface ScenarioMeta {
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

/**
 * mock 虚拟工作区（19.22 第三批）：`listFs` 与 `listFsTree` 共用这一份。此前两个方法各持一棵
 * 静态树，对同一目录给出不一致的子项（问 `src/` 里有什么，一个答 README.md/package.json、
 * 另一个答 main.tsx/app.tsx/components），据 mock 走查调 @ 补全与文件树会得出错误结论。
 * 路径口径同服务端：相对 cwd、posix 分隔符、不含前导 `./`。
 */
const MOCK_FS: readonly { path: string; isDir: boolean }[] = [
  { path: 'src', isDir: true },
  { path: 'src/components', isDir: true },
  { path: 'src/components/InputBox.tsx', isDir: false },
  { path: 'src/app.tsx', isDir: false },
  { path: 'src/main.tsx', isDir: false },
  { path: 'README.md', isDir: false },
  { path: 'package.json', isDir: false },
]

const mockFsName = (p: string): string => p.slice(p.lastIndexOf('/') + 1)
const mockFsParent = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}
/** 目录优先再字典序——镜像 sessions.ts 两处列举的排序口径 */
const mockFsSort = (
  a: { name: string; isDir: boolean },
  b: { name: string; isDir: boolean },
): number => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1)

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

  sendMessage(sessionId: SessionId, text: string, opts?: SendMessageOptions): Promise<SubmitOutcome> {
    // 19.22 对等修复：会话存在性 + delivery 三态 + expectedTurnId 校验，与 engine
    // input-queue 的 now/steer/queue × idle/running 矩阵同语义（此前 mock 吞掉整个 opts，
    // L.8 提交模式 chip 的排队/插话差异在 mock 走查与 e2e 下永不可见）。
    // 回放内容仍由脚本决定——text 不改变假对话，如实保留该语义。
    const known =
      sessionId === this.script.sessionId || this.forkChildren.some((f) => f.dto.id === sessionId)
    if (!known) {
      return Promise.reject(new Error(`E_NOT_FOUND: 会话不存在：${sessionId}`))
    }
    if (opts?.expectedTurnId !== undefined && opts.expectedTurnId !== this.currentTurnId) {
      return Promise.reject(
        new Error(
          `E_TURN_MISMATCH: steer 目标 turn 已变（期望 ${opts.expectedTurnId}，当前 ${String(this.currentTurnId)}）`,
        ),
      )
    }
    return Promise.resolve(this.submit(opts?.delivery))
  }

  /** 同步受理逻辑（假对话：text 不改变回放内容；delivery 决定运行中是插话还是排队） */
  private submit(delivery: Delivery = 'now'): SubmitOutcome {
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
    if (this.timer !== null) {
      // 运行中：queue 档排队等本 turn 结束，now/steer 档按插话受理（脚本固定，不真正注入）
      return { result: delivery === 'queue' ? 'queued' : 'steered' }
    }
    if (this.cursor >= this.script.lines.length) return { result: 'queued' } // 场景已播完
    this.startSession()
    this.advance()
    return {
      result: 'started',
      ...(this.currentTurnId !== null ? { turnId: this.currentTurnId } : {}),
    }
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

  replyPermission(
    requestId: RequestId,
    reply: PermissionReply,
    feedback?: string,
    _scope?: 'user' | 'project',
  ): Promise<void> {
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

  /** 文件夹信任对等演示（工单 16.4 / ADR D36）：内存表 + cwd=项目根固定值 */
  private readonly trustFolders = new Map<string, 'trusted' | 'untrusted'>()

  getTrust(): Promise<TrustStatusDto> {
    this.assertNotDisposed()
    return Promise.resolve({
      folders: [...this.trustFolders.entries()].map(([path, trust]) => ({ path, trust })),
      current: 'trusted',
    })
  }

  setTrust(path: string, trust: 'trusted' | 'untrusted'): Promise<void> {
    this.assertNotDisposed()
    this.trustFolders.set(path, trust)
    return Promise.resolve()
  }

  /** 扩展管理对等演示（工单 16.5 / ADR D38）：静态两扩展 + 名单启停（内存表） */
  private readonly disabledExtensions = new Set<string>()

  listExtensions(): Promise<ExtensionDto[]> {
    this.assertNotDisposed()
    const make = (id: string, name: string, description: string, manifest: Partial<ExtensionDto>): ExtensionDto => ({
      id,
      name,
      version: '1.0.0',
      description,
      enabled: !this.disabledExtensions.has(id),
      path: `~/.spark/extensions/${id}`,
      ...manifest,
    })
    return Promise.resolve([
      make('demo-pack', '演示扩展包', '一个含技能与子代理声明的示例扩展（mock）', {
        skills: ['demo-ping'],
        agents: ['demo-agent'],
      }),
      make('review-pack', '评审扩展包', '含自定义命令声明的示例扩展（mock）', {
        commands: ['review'],
      }),
    ])
  }

  setExtensionEnabled(id: string, enabled: boolean): Promise<void> {
    this.assertNotDisposed()
    if (enabled) this.disabledExtensions.delete(id)
    else this.disabledExtensions.add(id)
    return Promise.resolve()
  }

  /** 竞答对等演示（工单 16.8 / ADR D42）：静态已完成快照 + 应用/取消幂等（judge 并行真实跑属引擎运行时） */
  /** 演示竞答是否已收口（应用胜者或取消）——收口后 getArena 对任何会话都返回 null */
  private arenaSettled = false

  getArena(sessionId: SessionId): Promise<ArenaStatusDto | null> {
    this.assertNotDisposed()
    // 19.22 对等修复：竞答属于发起它的那个会话——原实现忽略 sessionId，
    // 任意会话都拿到同一场演示竞答（mock 走查会看到幽灵竞答）
    if (sessionId !== this.script.sessionId || this.arenaSettled) return Promise.resolve(null)
    return Promise.resolve({
      arenaId: 'ses_arena_mock0000000000000001',
      prompt: '（mock 演示）为 README 补一节安装说明',
      status: 'done',
      contenders: [
        {
          sessionId: ids.session('ses_arena_mock_a00000000001'),
          model: 'mock/deepseek-chat',
          status: 'done',
          usage: { inputTokens: 1200, outputTokens: 320 },
          durationMs: 18_400,
          diffStat: { files: 2, additions: 24, deletions: 3 },
        },
        {
          sessionId: ids.session('ses_arena_mock_b00000000001'),
          model: 'mock/glm-4',
          status: 'done',
          usage: { inputTokens: 1400, outputTokens: 410 },
          durationMs: 22_100,
          diffStat: { files: 1, additions: 31, deletions: 0 },
        },
      ],
      winner: null,
      applied: null,
    })
  }

  applyArenaWinner(sessionId: SessionId, contenderSessionId: SessionId): Promise<void> {
    this.assertNotDisposed()
    // 无待应用的竞答 → 拒（真实通道 E_NOT_FOUND；原实现无论哪个会话都置位成功）
    if (sessionId !== this.script.sessionId || this.arenaSettled) {
      return Promise.reject(new Error(`E_NOT_FOUND: 该会话无待应用的竞答：${sessionId}`))
    }
    this.arenaSettled = true
    void contenderSessionId
    return Promise.resolve()
  }

  cancelArena(sessionId: SessionId): Promise<void> {
    this.assertNotDisposed()
    if (sessionId !== this.script.sessionId || this.arenaSettled) {
      return Promise.reject(new Error(`E_NOT_FOUND: 该会话无进行中的竞答：${sessionId}`))
    }
    this.arenaSettled = true
    return Promise.resolve()
  }

  /** 竞答历史对等演示（工单 19.10，翻案 D42 内存态）：静态两场（一场已应用胜者 / 一场取消） */
  listArenaHistory(limit?: number): Promise<ArenaHistoryDto> {
    this.assertNotDisposed()
    // 19.22 对等修复：与 server GET /api/arena/history 同口径——缺省 20、上限 100（原吞 limit）
    const cap = Math.min(limit ?? 20, 100)
    const now = Date.now()
    const runs: ArenaHistoryDto['runs'] = [
      {
        arenaId: 'ses_arena_mock0000000000000002',
        sessionId: ids.session('ses_arena_mock_main000001'),
        startedAt: now - 3_600_000,
        completedAt: now - 3_000_000,
        prompt: '（mock 演示）为 README 补一节安装说明',
        models: ['mock/deepseek-chat', 'mock/glm-4'],
        status: 'done',
        winnerModel: 'mock/glm-4',
      },
      {
        arenaId: 'ses_arena_mock0000000000000003',
        sessionId: ids.session('ses_arena_mock_main000001'),
        startedAt: now - 86_400_000,
        completedAt: now - 82_800_000,
        prompt: '（mock 演示）修复设置页保存按钮失焦不生效的问题',
        models: ['mock/glm-4', 'mock/deepseek-chat'],
        status: 'cancelled',
        winnerModel: null,
      },
    ]
    return Promise.resolve({ runs: runs.slice(0, cap) })
  }

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

  // ---- 权限档位与会话模式（工单 6.3 / 16.3 对等演示：内存表，随会话 id 记忆；引擎同款语义） ----

  private readonly presets = new Map<SessionId, PermissionPreset>()
  /** 持续目标状态（工单 16.7 对等演示）：mock 只落事件语义，judge 续跑在引擎侧 */
  private readonly goals = new Map<
    SessionId,
    { goal: string; iterations: number; usedTokens: number; status: 'active' | 'paused' | 'completed' }
  >()
  /** 进 plan 前的档位（引擎 prePlanPreset 的对等演示）：退出计划模式时恢复 */
  private readonly prePlanPresets = new Map<SessionId, PermissionPreset>()

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
    this.applyPreset(sessionId, preset)
    return Promise.resolve()
  }

  /** 当前模式（**由档位派生**——引擎 sessionModeOf 同款，不存第二份状态） */
  private modeOf(sessionId: SessionId): SessionMode {
    return this.presets.get(sessionId) === 'plan' ? 'plan' : 'default'
  }

  /**
   * 档位变更唯一出口（引擎 Engine.applyPreset 的对等演示）：设档 + 只在"是否 plan"变了时
   * 推 durable 事件 `session.mode.changed`。不推事件的话四端的 `slice.mode` 永远停在
   * default（工单 16.3 第三批 B）——mock 下就看不到计划模式指示，/plan 也无法走查。
   */
  private applyPreset(sessionId: SessionId, preset: PermissionPreset): void {
    const previous = this.modeOf(sessionId)
    if (preset === 'confirm-each') this.presets.delete(sessionId)
    else this.presets.set(sessionId, preset)
    const mode = this.modeOf(sessionId)
    if (mode === previous) return
    this.emit({
      id: ids.event(`evt_mock_mode_${mockRandom()}`),
      sessionId,
      type: 'session.mode.changed',
      time: Date.now(),
      data: { mode, previous },
    })
  }

  /** 模式切换（引擎 setSessionMode 的对等演示）：切模式就是切档，幂等，退出恢复原档位 */
  private setMode(sessionId: SessionId, mode: SessionMode): void {
    const current = this.presets.get(sessionId) ?? 'confirm-each'
    if (mode === 'plan') {
      if (current === 'plan') return
      this.prePlanPresets.set(sessionId, current)
      this.applyPreset(sessionId, 'plan')
      return
    }
    if (current !== 'plan') return
    const restore = this.prePlanPresets.get(sessionId) ?? 'confirm-each'
    this.prePlanPresets.delete(sessionId)
    this.applyPreset(sessionId, restore)
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
      // 文案逐字对齐 engine `model-catalog.ts`。真实通道按 apiKeyEnv 是否为 null 分两种说法，
      // 但 MOCK_MODELS 里 hasKey=false 的三个供应商 apiKeyEnv 全为 null（openai/anthropic 更早就
      // 被 !configured 拦下），故只取可达的那一种——不写无夹具可触达的分支。日后若加了
      // "apiKeyEnv 有值但无 key"的供应商，此处要补上另一句「环境变量 X 未设置」。
      return Promise.resolve({
        provider: providerId,
        ok: false,
        message: '缺少 API Key：models.json 未设置 apiKeyEnv，密钥仓亦无条目',
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
    // 新建会话默认模型/档位（阶段十九 19.14 / V2-37）
    defaultModel: 'deepseek/deepseek-chat',
    defaultEffort: null,
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
      ...(patch.defaultModel !== undefined ? { defaultModel: providerOf(patch.defaultModel) } : {}),
      ...(patch.defaultEffort !== undefined ? { defaultEffort: patch.defaultEffort } : {}),
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
      computerUseEnabled: false,
      bashPersistent: false,
    },
    browser: { headless: true, defaultTimeoutMs: 30000, userAgent: '' },
    // 沙箱网络隔离（阶段十九 19.7 / ADR D50）：mock 缺省 off（不拦截）；对等写路径同下
    sandbox: { network: { ...SANDBOX_NETWORK_DEFAULTS } },
    // 语义检索总开关（阶段十九 19.8 / ADR D51）：mock 缺省开（但无提供方 → available:false）
    embedding: { enabled: true },
    // 自动归档策略（阶段十九 19.13）：mock 缺省关 + 30 天
    archive: { autoArchive: false, afterDays: 30 },
    // 全局出网代理（阶段十九 19.13）：mock 缺省空（不设）
    network: { proxy: '', noProxy: '' },
    // 自定义证书（阶段十九 19.13）：mock 无注入 → null
    certificates: { nodeExtraCaCerts: null },
    // 数据目录（阶段十九 19.16）：mock 演示路径
    home: '~/.spark（mock 演示路径）',
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
        computerUseEnabled: e.computerUseEnabled ?? prev.engine.computerUseEnabled,
        bashPersistent: e.bashPersistent ?? prev.engine.bashPersistent,
      },
      ...(patch.browser !== undefined
        ? {
            browser: {
              headless: patch.browser.headless ?? prev.browser?.headless ?? true,
              defaultTimeoutMs: patch.browser.defaultTimeoutMs ?? prev.browser?.defaultTimeoutMs ?? 30000,
              userAgent: patch.browser.userAgent ?? prev.browser?.userAgent ?? '',
            },
          }
        : {}),
      // 自动归档策略（阶段十九 19.13）：逐字段合并，显式 undefined 不覆盖现值
      ...(patch.archive !== undefined
        ? {
            archive: {
              autoArchive: patch.archive.autoArchive ?? prev.archive?.autoArchive ?? false,
              afterDays: patch.archive.afterDays ?? prev.archive?.afterDays ?? 30,
            },
          }
        : {}),
      // 全局出网代理（阶段十九 19.13）：逐字段合并
      ...(patch.network !== undefined
        ? {
            network: {
              proxy: patch.network.proxy ?? prev.network?.proxy ?? '',
              noProxy: patch.network.noProxy ?? prev.network?.noProxy ?? '',
            },
          }
        : {}),
      // 子代理停用名单（19.22 对等修复：此前 mock 丢 agents patch——16.2 停用在 mock 下失效）
      ...(patch.agents !== undefined
        ? {
            agents: {
              disabledAgents: patch.agents.disabledAgents ?? prev.agents?.disabledAgents ?? [],
            },
          }
        : {}),
      // 扩展停用名单（19.22 对等修复：同上，16.5）
      ...(patch.extensions !== undefined
        ? {
            extensions: {
              disabledExtensions: patch.extensions.disabledExtensions ?? prev.extensions?.disabledExtensions ?? [],
            },
          }
        : {}),
      // 界面语言（阶段十九 19.17）：显式 undefined 不覆盖现值
      ...(patch.ui !== undefined
        ? { ui: { language: patch.ui.language ?? prev.ui?.language } }
        : {}),
      // 语义检索总开关（阶段十九 19.8 / ADR D50 同族热档）：显式 undefined 不覆盖现值
      ...(patch.embedding !== undefined
        ? { embedding: { enabled: patch.embedding.enabled ?? prev.embedding?.enabled ?? true } }
        : {}),
      // 沙箱网络隔离（阶段十九 19.7 / ADR D50）：network 逐字段合并——显式 undefined 不覆盖现值
      ...(patch.sandbox !== undefined
        ? {
            sandbox: {
              network: {
                mode: patch.sandbox.network.mode ?? prev.sandbox?.network.mode ?? SANDBOX_NETWORK_DEFAULTS.mode,
                allowlist: patch.sandbox.network.allowlist ?? prev.sandbox?.network.allowlist ?? [],
                port: patch.sandbox.network.port ?? prev.sandbox?.network.port ?? SANDBOX_NETWORK_DEFAULTS.port,
              },
            },
          }
        : {}),
      ...(patch.hooks !== undefined ? { ...(patch.hooks === null ? {} : { hooks: patch.hooks }) } : {}),
    }
    return Promise.resolve(this.settings)
  }

  listCommands(): Promise<CommandDto[]> {
    this.assertNotDisposed()
    return Promise.resolve([...MOCK_COMMANDS])
  }

  executeCommand(sessionId: SessionId, name: string, args?: string): Promise<void> {
    this.assertNotDisposed()
    if (sessionId !== this.script.sessionId && !this.forkChildren.some((f) => f.dto.id === sessionId)) {
      return Promise.reject(new Error(`E_MOCK_UNKNOWN_SESSION: ${sessionId}`))
    }
    if (name === 'compact') return this.compact(sessionId)
    if (name === 'plan') {
      // 对等演示（工单 16.3）：`/plan` 进入、`/plan exit|off` 退出——引擎 executeCommand 同款分支
      const arg = args?.trim().toLowerCase()
      this.setMode(sessionId, arg === 'exit' || arg === 'off' ? 'default' : 'plan')
      return Promise.resolve()
    }
    if (name === 'goal') {
      // 对等演示（工单 16.7）：set/clear/status 的事件语义与引擎一致；judge 续跑循环
      // 属引擎运行时行为（ScriptedLlm 侧），mock 只落状态与事件——四端 reducer 走查可用
      const arg = args?.trim() ?? ''
      const sub = arg.split(/\s+/)[0]?.toLowerCase() ?? ''
      if (sub === 'set') {
        const goalText = arg.slice(sub.length).trim()
        if (goalText.length === 0) {
          return Promise.reject(new Error('E_GOAL_EMPTY: /goal set 需要目标条件（如 /goal set 修好所有失败的测试）'))
        }
        const state = { goal: goalText, iterations: 0, usedTokens: 0, status: 'active' as const }
        this.goals.set(sessionId, state)
        this.emit({
          id: ids.event(`evt_mock_goal_${mockRandom()}`),
          sessionId,
          type: 'goal.set',
          time: Date.now(),
          data: { goal: goalText },
        })
        return Promise.resolve()
      }
      const current = this.goals.get(sessionId)
      if (sub === 'clear') {
        if (current === undefined) {
          return Promise.reject(new Error('E_NO_GOAL: 本会话没有持续目标（/goal set <条件> 先行）'))
        }
        const paused = { ...current, status: 'paused' as const }
        this.goals.set(sessionId, paused)
        this.emit({
          id: ids.event(`evt_mock_goal_${mockRandom()}`),
          sessionId,
          type: 'goal.paused',
          time: Date.now(),
          data: { reason: 'cleared', iterations: paused.iterations, usedTokens: paused.usedTokens },
        })
        return Promise.resolve()
      }
      if (sub === 'status') {
        if (current === undefined) {
          return Promise.reject(new Error('E_NO_GOAL: 本会话没有持续目标（/goal set <条件> 先行）'))
        }
        this.emit({
          id: ids.event(`evt_mock_goal_${mockRandom()}`),
          sessionId,
          type: 'goal.updated',
          time: Date.now(),
          data: { goal: current.goal, iterations: current.iterations, usedTokens: current.usedTokens, status: current.status },
        })
        return Promise.resolve()
      }
      return Promise.reject(new Error('E_GOAL_ARGS: 用法 /goal set <条件> | /goal clear | /goal status'))
    }
    if (name === 'review') {
      // 对等演示：自定义命令展开为 prompt 走正常 turn（sendMessage 假对话回放）
      return this.sendMessage(sessionId, '/review 展开的审查提示词（mock 回放）').then(() => undefined)
    }
    if (MOCK_COMMANDS.some((c) => c.name === name && c.kind === 'client')) {
      return Promise.reject(new Error(`E_COMMAND_CLIENT: /${name} 是界面命令，由前端执行`))
    }
    return Promise.reject(new Error(`E_NOT_FOUND: 未知命令 /${name}`))
  }

  /** 语音转写对等（工单 16.6 / 19.22 第三批）：护栏判据与引擎共用 protocol 同一份常量，
   * 故 E_TRANSCRIBE_UNCONFIGURED / _MIME / _TOO_LARGE 三条失败分支在 mock 走查与 e2e 下也可达
   * ——此前恒返回成功，error-copy 里那三条文案在 web 侧从未被任何通道触发过。
   * 网络面（SSRF 拦截、上游状态码）无从对等：过护栏后返回确定性假文本。
   * 供应商缺省口径同引擎（`defaultModel.provider`），此前回的字面量 'mock' 不是任何真实 id。 */
  transcribe(req: TranscribeRequest): Promise<TranscribeResultDto> {
    this.assertNotDisposed()
    const provider = req.provider ?? MOCK_MODELS.defaultModel.provider
    const p = MOCK_MODELS.providers.find((x) => x.id === provider)
    if (p === undefined) {
      return Promise.reject(new Error(`E_TRANSCRIBE_UNCONFIGURED: 未知的模型供应商：${provider}`))
    }
    if (!TRANSCRIBE_ALLOWED_MIME.has(req.audio.mime)) {
      return Promise.reject(new Error(`E_TRANSCRIBE_MIME: 不支持的录音格式：${req.audio.mime}`))
    }
    if (base64ByteLength(req.audio.dataBase64) > TRANSCRIBE_MAX_AUDIO_BYTES) {
      return Promise.reject(new Error('E_TRANSCRIBE_TOO_LARGE: 录音超过 10MB 上限'))
    }
    return Promise.resolve({
      text: '（mock 转写演示）这是一段语音听写的确定性假文本，接入真实后端后由供应商转写。',
      provider,
      model: 'mock-transcribe',
    })
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

  /** 子代理预设档（工单 13.5 对等演示）：静态两档——真实数据源是两层 agents/*.json（16.2）；
   * 16.2 对等：source 两层归属各标一档，coder 走 settings 停用演示（disabled 合成面） */
  listAgentPresets(): Promise<AgentPresetDto[]> {
    this.assertNotDisposed()
    return Promise.resolve([
      {
        name: 'reader',
        source: 'user',
        tools: { allow: ['read', 'grep'] },
        systemAppend: '# 只读纪律\n不得修改任何文件，只做调研与汇报。',
        title: '只读调研',
      },
      {
        name: 'coder',
        source: 'project',
        tools: { deny: ['bash'] },
        title: '编码子代理',
      },
    ])
  }

  /** 语言服务器状态（工单 16.9 对等演示）：一连接一失败——真实数据源是 ~/.spark/lsp.json */
  listLspServers(): Promise<LspServerStatusDto[]> {
    this.assertNotDisposed()
    return Promise.resolve([
      { language: 'typescript', command: 'typescript-language-server --stdio', connected: true, files: 2, errors: 1, warnings: 3 },
      {
        language: 'python',
        command: 'pyright-langserver --stdio',
        connected: false,
        error: 'E_LSP_CONNECT: initialize 超时（10000ms）',
        files: 0,
        errors: 0,
        warnings: 0,
      },
    ])
  }

  /** 浏览器截图清理（阶段十九 19.12 对等演示）：模拟删除 6 张（真实通道=引擎清 shotsDir） */
  cleanupBrowserArtifacts(): Promise<BrowserCleanupResultDto> {
    this.assertNotDisposed()
    return Promise.resolve({ removed: 6 })
  }

  /** LSP 安装（阶段十九 19.5 对等演示）：内置清单 id → 模拟安装延迟 → 返回写入条目（真实通道=npm 装 + 写 lsp.json） */
  installLspServer(id: string): Promise<LspInstallResultDto> {
    this.assertNotDisposed()
    const known = findKnownLspServer(id)
    if (known === undefined) {
      return Promise.reject(new Error(`E_LSP_UNKNOWN_SERVER: 未知语言服务器 id：${id}`))
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ language: known.language, command: known.command, args: [...known.args], written: true })
      }, 300)
    })
  }

  /**
   * 索引库管理（阶段十九 19.11 对等演示，纯 mock）：静态一笔统计 + 重建/回收延迟回假合理值。
   * 重建后条目数按脚本演示口径减一（模拟重建精简），体积回落——真实通道=引擎 SQLite 全量重扫。
   */
  private mockIndexEntries = 128

  indexStats(): Promise<IndexStatsDto> {
    this.assertNotDisposed()
    // 语义状态派生（19.8）：mock 无真实 embedding 提供方——按总开关演示"未配置"
    // （available:false 是 mock 的如实呈现：没有提供方就没有语义检索）
    const enabled = this.settings.embedding?.enabled ?? true
    return Promise.resolve({
      entries: this.mockIndexEntries,
      sizeBytes: 264_192,
      path: '~/.spark/search.db（mock 演示路径）',
      semantic: {
        available: false,
        provider: null,
        model: null,
        dimensions: null,
        enabled,
        embedded: 0,
      },
    })
  }

  /** 向量补嵌（19.8 对等演示）：mock 无提供方 → 拒执并说明（fail-closed，不假装成功） */
  /** 会话改名（阶段十九 19.20 对等演示）：改脚本会话标题（fork 子会话同名一并改） */
  renameSession(sessionId: SessionId, title: string): Promise<SessionDto> {
    this.assertNotDisposed()
    if (sessionId !== this.script.sessionId && !this.forkChildren.some((f) => f.dto.id === sessionId)) {
      return Promise.reject(new Error(`E_NOT_FOUND: 会话不存在：${sessionId}`))
    }
    const base = MockTransport.dtoOf(this.script, this.status())
    return Promise.resolve({ ...base, id: sessionId, title })
  }

  /** 反馈（阶段十九 19.19 对等演示）：内存仓——同 session+event+vote 幂等，撤回删行 */
  private readonly mockFeedback = new Map<string, { vote: 'up' | 'down'; note: string; createdAt: number }>()

  submitFeedback(input: FeedbackInput): Promise<FeedbackEntryDto> {
    this.assertNotDisposed()
    const key = `${input.sessionId}:${input.eventId}:${input.vote}`
    const prev = this.mockFeedback.get(key)
    const entry = {
      vote: input.vote,
      note: input.note ?? '',
      createdAt: prev?.createdAt ?? Date.now(),
    }
    this.mockFeedback.set(key, entry)
    return Promise.resolve({
      id: this.mockFeedback.size,
      sessionId: input.sessionId,
      eventId: input.eventId,
      vote: entry.vote,
      note: entry.note,
      createdAt: entry.createdAt,
    })
  }

  listFeedback(query: FeedbackQuery = {}): Promise<FeedbackEntryDto[]> {
    this.assertNotDisposed()
    const out: FeedbackEntryDto[] = []
    for (const [key, v] of this.mockFeedback) {
      const [sid, eid, vote] = key.split(':')
      if (query.sessionId !== undefined && sid !== query.sessionId) continue
      if (query.vote !== undefined && vote !== query.vote) continue
      out.push({
        id: out.length + 1,
        sessionId: sid as FeedbackEntryDto['sessionId'],
        eventId: eid as FeedbackEntryDto['eventId'],
        vote: vote === 'up' ? 'up' : 'down',
        note: v.note,
        createdAt: v.createdAt,
      })
    }
    return Promise.resolve(out.reverse().slice(0, query.limit ?? 100))
  }

  withdrawFeedback(sessionId: SessionId, eventId: EventId, vote: FeedbackVote): Promise<boolean> {
    this.assertNotDisposed()
    const key = `${sessionId}:${eventId}:${vote}`
    return Promise.resolve(this.mockFeedback.delete(key))
  }

  /** 提示词模板快照（阶段十九 19.18 对等演示）：三槽位内置内容 + 未覆盖 */
  promptsInfo(): Promise<PromptsDto> {
    this.assertNotDisposed()
    return Promise.resolve({
      slots: [
        { slot: 'base', path: null, content: '（mock：内置 base 模板演示）', overridden: false },
        { slot: 'compaction', path: null, content: '（mock：内置 compaction 模板演示）', overridden: false },
        { slot: 'title', path: null, content: '（mock：内置 title 模板演示）', overridden: false },
      ],
      placeholders: ['{{cwd}}', '{{model}}', '{{platform}}'],
    })
  }

  /** 写槽位模板（19.18 对等演示）：mock 不落盘——拒执并说明（fail-closed，不假装已写） */
  updatePrompt(): Promise<PromptsDto> {
    this.assertNotDisposed()
    return Promise.reject(new Error('E_MOCK_READONLY: mock 通道不写模板文件——真实通道走引擎'))
  }

  rebuildVectors(): Promise<RebuildVectorsResultDto> {
    this.assertNotDisposed()
    return Promise.reject(
      new Error('E_EMBEDDING_UNAVAILABLE: mock 未配置 embedding 提供方——语义检索不可用'),
    )
  }

  /**
   * 沙箱网络隔离代理状态（阶段十九 19.7 对等演示）：mock 无真实代理——按设置档位
   * 派生（allowlist 档 = 演示"过滤中"，off = 未启动）。端口占用/绑定失败只发生在
   * 真实引擎，mock 不假装。
   */
  sandboxNetworkStatus(): Promise<SandboxNetworkStatusDto> {
    this.assertNotDisposed()
    const net = this.settings.sandbox?.network
    const enabled = net?.mode === 'allowlist'
    return Promise.resolve({
      ready: enabled,
      reason: null,
      activeConnections: 0,
      port: net?.port ?? SANDBOX_NETWORK_DEFAULTS.port,
    })
  }

  rebuildIndex(): Promise<RebuildResultDto> {
    this.assertNotDisposed()
    return new Promise((resolve) => {
      setTimeout(() => {
        // mock：重建精简一成条目（演示数字，真实通道=JSONL 全量重扫的实数）
        this.mockIndexEntries = Math.max(0, Math.floor(this.mockIndexEntries * 0.9))
        resolve({ entries: this.mockIndexEntries })
      }, 600)
    })
  }

  vacuumIndex(): Promise<VacuumResultDto> {
    this.assertNotDisposed()
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ sizeBytesBefore: 264_192, sizeBytesAfter: 237_568 })
      }, 600)
    })
  }

  /**
   * 成本看板（工单 13.6 对等演示）：两日明细 + 一笔无明细旧账——total = buckets + unbucketed
   * 恒成立（与引擎语义同形：since 只过滤明细，总账与差额仍是全量）。
   */
  usageSummary(since?: string): Promise<UsageSummaryDto> {
    this.assertNotDisposed()
    const buckets: UsageBucketDto[] = [
      {
        day: '2026-09-07',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 12000,
        outputTokens: 3400,
        cacheRead: 4200,
        cacheWrite: 0,
        costUsd: 0.0312,
      },
      {
        day: '2026-09-08',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 20000,
        outputTokens: 5100,
        cacheRead: 9800,
        cacheWrite: 1200,
        costUsd: 0.0521,
      },
    ]
    const unbucketed = {
      costUsd: 0.0041,
      inputTokens: 1500,
      outputTokens: 400,
      cacheRead: 0,
      cacheWrite: 0,
    }
    const sum = (pick: (b: UsageBucketDto) => number): number =>
      buckets.reduce((acc, b) => acc + pick(b), 0)
    const total = {
      costUsd: sum((b) => b.costUsd) + unbucketed.costUsd,
      inputTokens: sum((b) => b.inputTokens) + unbucketed.inputTokens,
      outputTokens: sum((b) => b.outputTokens) + unbucketed.outputTokens,
      cacheRead: sum((b) => b.cacheRead) + unbucketed.cacheRead,
      cacheWrite: sum((b) => b.cacheWrite) + unbucketed.cacheWrite,
    }
    return Promise.resolve({
      total,
      buckets: since !== undefined ? buckets.filter((b) => b.day >= since) : buckets,
      unbucketed,
      costLimitUsd: 5,
      exceeded: false,
    })
  }

  /**
   * 会话链路（工单 13.7 对等演示）：第一回合含工具失败重试 + 审批挂起 + 护栏告警 + 记忆注入标记，
   * 第二回合干净——组件两态（正常回合 / 含重试回合）与 mock 走查都吃这份数据。
   */
  getSessionTrace(sessionId: SessionId): Promise<TraceDto> {
    this.assertNotDisposed()
    const t0 = 1788800000000
    const cleanUsage = { costUsd: 0.0008, inputTokens: 900, outputTokens: 120, cacheRead: 700, cacheWrite: 0 }
    const retryTurn: TraceTurnDto = {
      turnId: ids.turn('trn_01J8ZK0Q7M3X9V2T5R8W4Y6B1D'),
      delivery: 'now',
      startedAt: t0,
      durationMs: 4200,
      finish: 'stop',
      steps: [
        {
          index: 0,
          at: t0 + 900,
          durationMs: 2100,
          toolCalls: 2,
          usage: { costUsd: 0.0021, inputTokens: 1800, outputTokens: 260, cacheRead: 900, cacheWrite: 0 },
        },
        {
          index: 1,
          at: t0 + 3000,
          durationMs: 1200,
          toolCalls: 0,
          usage: { costUsd: 0.0012, inputTokens: 2100, outputTokens: 180, cacheRead: 1500, cacheWrite: 0 },
        },
      ],
      tools: [
        {
          callId: ids.call('call_mock_write_1'),
          name: 'write',
          startedAt: t0 + 1000,
          durationMs: 120,
          isError: true,
          retry: false,
          approvalAsked: true,
          warnings: [],
        },
        {
          callId: ids.call('call_mock_write_2'),
          name: 'write',
          startedAt: t0 + 1400,
          durationMs: 95,
          isError: false,
          retry: true,
          approvalAsked: false,
          warnings: ['secret'],
        },
      ],
      marks: [{ at: t0 + 200, kind: 'memory', label: '注入 2 条记忆' }],
      errors: [{ at: t0 + 1150, scope: 'tool', message: 'E_IO: 目标路径只读（演示数据）', fatal: false }],
      usage: { costUsd: 0.0033, inputTokens: 3900, outputTokens: 440, cacheRead: 2400, cacheWrite: 0 },
    }
    const cleanTurn: TraceTurnDto = {
      turnId: ids.turn('trn_01J8ZK9R2N4P6Q8S0T1V3W5X7Z'),
      delivery: 'now',
      startedAt: t0 + 60000,
      durationMs: 1500,
      finish: 'stop',
      steps: [{ index: 0, at: t0 + 61200, durationMs: 1500, toolCalls: 0, usage: cleanUsage }],
      tools: [],
      marks: [],
      errors: [],
      usage: cleanUsage,
    }
    return Promise.resolve({
      sessionId,
      totals: {
        turns: 2,
        steps: 3,
        toolCalls: 2,
        toolErrors: 1,
        errors: 1,
        durationMs: 5700,
        usage: { costUsd: 0.0041, inputTokens: 4800, outputTokens: 560, cacheRead: 3100, cacheWrite: 0 },
      },
      turns: [retryTurn, cleanTurn],
      looseErrors: [],
    })
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

  /** 递归文件树（工单 12.5 mock 对等；判据镜像 server `sessions.ts` 的 `/fs/tree`）：
   * 未知会话拒执、越出 cwd 抛 E_PATH_OUTSIDE——该端点与 `/fs` 不同（后者越界回空清单不报错），
   * 这处不对称是服务端既有语义，mock 照抄而不是"统一成更合理的一种"。
   * `truncated` 恒 false：虚拟树够不着服务端 4 层/500 条上限。 */
  listFsTree(sessionId: SessionId, path = ''): Promise<FsTreeDto> {
    this.assertNotDisposed()
    if (sessionId !== this.script.sessionId && !this.forkChildren.some((f) => f.dto.id === sessionId)) {
      return Promise.reject(new Error(`E_NOT_FOUND: 会话不存在：${sessionId}`))
    }
    if (path.split('/').includes('..')) {
      return Promise.reject(new Error(`E_PATH_OUTSIDE: 路径 ${path} 越出会话工作目录`))
    }
    const prefix = path === '' ? '' : `${path}/`
    const entries: FsEntryDto[] = MOCK_FS.filter((e) => e.path.startsWith(prefix))
      .map((e) => ({ name: mockFsName(e.path), path: e.path, isDir: e.isDir }))
      .sort(mockFsSort)
    return Promise.resolve({ path, entries, truncated: false })
  }

  private readonly attachmentStore = new Map<string, { mime: string; bytes: Buffer }>()
  /** MCP 配置（PUT 后读回一致；跨实例不持久 = 重启语义如实） */
  private mcpConfig: McpConfigInput = {
    version: 1,
    servers: {
      filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/spark'] },
      github: { command: 'npx' },
    },
  }

  /** GET /api/mcp/config（RT3-07 mock 对等）：读回本次实例写入的配置（19.22 修复前恒为
   * 初始静态值）；mock 无 env 真值可掩码——与真实通道的掩码回读差异如实保留 */
  getMcpConfig(): Promise<McpConfigInput> {
    this.assertNotDisposed()
    // 19.22 对等修复：真实通道读回时 env/headers 值一律替换为 MCP_ENV_MASK（凭据不出引擎）。
    // 初值虽无 env，但用户经 updateMcpConfig 存过 env 后，原实现会把明文回吐给表单——
    // 与真实通道行为不一致，且下一次保存会把明文再写一遍（掩码合并语义在 mock 下失效）。
    const maskMap = (m: Record<string, string> | undefined): Record<string, string> | undefined =>
      m === undefined ? undefined : Object.fromEntries(Object.keys(m).map((k) => [k, MCP_ENV_MASK]))
    const servers: McpConfigInput['servers'] = {}
    for (const [name, s] of Object.entries(this.mcpConfig.servers)) {
      const env = maskMap(s.env)
      const headers = maskMap(s.headers)
      servers[name] = {
        ...s,
        ...(env !== undefined ? { env } : {}),
        ...(headers !== undefined ? { headers } : {}),
      }
    }
    return Promise.resolve({ version: this.mcpConfig.version, servers })
  }

  /** PUT /api/mcp（工单 12.6 mock 对等）：**内存持久**（19.22 修复：此前写后读回恒初始值，
   * 表单"保存—重开"看起来像丢配置）；跨实例不持久 = 重启语义如实为不生效 */
  updateMcpConfig(config: McpConfigInput): Promise<{ ok: true }> {
    this.assertNotDisposed()
    this.mcpConfig = config
    return Promise.resolve({ ok: true })
  }

  uploadAttachment(
    _sessionId: SessionId,
    file: { name: string; mime: string; bytes: Uint8Array },
  ): Promise<AttachmentDto> {
    // 上传（mock 对等）：内存存储，返回 dto（缩略渲染走 objectURL 由调用方处理）
    const id = globalThis.crypto.randomUUID().replaceAll('-', '')
    const fileKey = id + '.' + (file.mime.split('/')[1] ?? 'png')
    this.attachmentStore.set(fileKey, { mime: file.mime, bytes: Buffer.from(file.bytes) })
    return Promise.resolve({ id, file: fileKey, mime: file.mime, size: file.bytes.length, name: file.name })
  }

  /** 目录列举（工单 10.53 mock 对等；判据镜像 server `sessions.ts` 的 `/fs`）：反斜杠归一 →
   * 末段作前缀过滤、列举其父目录（此前注释声称镜像前缀语义，实际根本没过滤）。
   * **越界与不存在的目录一律回空清单、不报错**——补全 UI 不因输入中断，也不泄露 cwd 外任何项；
   * 与 listFsTree 的抛错口径刻意不同，两处不对称都照抄服务端。 */
  listFs(sessionId: SessionId, path = ''): Promise<FsListDto> {
    this.assertNotDisposed()
    if (sessionId !== this.script.sessionId && !this.forkChildren.some((f) => f.dto.id === sessionId)) {
      return Promise.reject(new Error(`E_NOT_FOUND: 会话不存在：${sessionId}`))
    }
    const rel = path.replace(/\\/g, '/')
    const slash = rel.lastIndexOf('/')
    const dir = slash === -1 ? '' : rel.slice(0, slash)
    const prefix = slash === -1 ? rel : rel.slice(slash + 1)
    if (dir.split('/').includes('..')) return Promise.resolve({ path: dir, entries: [] })
    const entries: FsEntryDto[] = MOCK_FS.filter(
      (e) => mockFsParent(e.path) === dir && mockFsName(e.path).startsWith(prefix),
    )
      .map((e) => ({ name: mockFsName(e.path), path: e.path, isDir: e.isDir }))
      .sort(mockFsSort)
    return Promise.resolve({ path: dir, entries })
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
      // 工单 19.36 mock 对等：listSessions 列出的其它场景会话必须可 GET（真实 server 任意
      // sid 都能打开——辅助会话抽屉在 mock 下点选它们此前全落 E_MOCK_UNKNOWN_SESSION）。
      // 给静态脚本投影：只读历史、无直播流（假流只有一条，绑在当前场景会话上——
      // 在抽屉里发消息仍如实拒执，不把事件错灌进主会话）
      const other = MOCK_SCENARIOS.filter((s) => s !== this.scenario)
        .map((s) => this.parseFor(s))
        .find((sc) => sc.sessionId === sessionId)
      if (other !== undefined) {
        const otherDurable = other.lines.flatMap((l) =>
          l.kind === 'event' && l.envelope.seq !== undefined ? [l.envelope] : [],
        )
        return Promise.resolve({ ...MockTransport.dtoOf(other, 'idle'), events: page(otherDurable) })
      }
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

  /**
   * 引擎日志尾部（工单 19.38 mock 对等）：mock 不起引擎、没有 engine.log，故回一份**合成日志**——
   * 但级别/子串/limit 三道过滤与真实通道同一套判据（诊断页在 mock 下要能真走查过滤交互）。
   * path 明示是合成来源，不伪装成某个真实文件。
   */
  getLogs(query?: LogsQuery): Promise<LogsDto> {
    const base = Date.now()
    const synthetic: LogsDto['entries'] = [
      { time: base - 60_000, level: 'info', msg: 'engine.start', fields: { root: '~/.spark' } },
      { time: base - 50_000, level: 'info', msg: 'session.create', fields: { sid: 'ses_mock' } },
      { time: base - 40_000, level: 'warn', msg: 'llm.stream.retry', fields: { attempt: 2 } },
      { time: base - 30_000, level: 'error', msg: 'tool.completed', fields: { code: 'E_TOOL_TIMEOUT' } },
      { time: base - 20_000, level: 'info', msg: 'turn.completed', fields: {} },
    ]
    const rank: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 }
    let entries = synthetic
    if (query?.level !== undefined) {
      const min = rank[query.level] ?? 30
      entries = entries.filter((e) => (rank[e.level] ?? 30) >= min)
    }
    const needle = query?.match?.trim().toLowerCase() ?? ''
    if (needle !== '') {
      entries = entries.filter((e) =>
        (e.msg + ' ' + JSON.stringify(e.fields)).toLowerCase().includes(needle),
      )
    }
    const limit = Math.min(query?.limit ?? 500, 500)
    return Promise.resolve({
      path: '(mock) 合成日志——浏览器形态无引擎进程，真实来源是 ~/.spark/logs/engine.log',
      entries: entries.slice(-limit),
      truncated: false,
    })
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

  /** 置顶登记（工单 19.41 mock 对等）：与真实通道同口径——仅已置顶携带 true，列表置顶优先 */
  private readonly pinned = new Set<string>()

  pinSession(sessionId: string, pinned: boolean): Promise<SessionDto> {
    if (pinned) this.pinned.add(sessionId)
    else this.pinned.delete(sessionId)
    const dto = [...this.listAllDtos()].find((d) => d.id === sessionId)
    if (dto === undefined) return Promise.reject(new Error(`E_NOT_FOUND: 会话 ${sessionId} 不存在`))
    return Promise.resolve(pinned ? { ...dto, pinned: true } : dto)
  }

  deleteSession(sessionId: string): Promise<void> {
    // 19.22 对等修复：未知 id 拒执（真实通道 404 E_NOT_FOUND）——mock 此前静默 resolve
    const isFork = this.forkChildren.some((f) => f.dto.id === sessionId)
    const isScript = sessionId === this.script.sessionId
    if (!isFork && !isScript) {
      return Promise.reject(new Error(`E_NOT_FOUND: 会话不存在：${sessionId}`))
    }
    const idx = this.forkChildren.findIndex((f) => f.dto.id === sessionId)
    if (idx !== -1) this.forkChildren.splice(idx, 1)
    this.archived.delete(sessionId)
    this.pinned.delete(sessionId)
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
      ].filter((d) => this.archived.has(d.id) === this.archivedFilter)
        .map((d) => (this.pinned.has(d.id) ? { ...d, pinned: true } : d))
        // 置顶第一键（稳定排序：同档保持脚本序，与引擎 ORDER BY pinned DESC, updated_at DESC 同口径）
        .sort((a, b) => (b.pinned === true ? 1 : 0) - (a.pinned === true ? 1 : 0)),
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

  createSession(opts?: { title?: string; model?: string; cwd?: string }): Promise<SessionDto> {
    this.assertNotDisposed()
    this.startSession()
    const dto = MockTransport.dtoOf(this.script, this.status())
    // 19.22 对等修复：opts 不再丢弃——显式 title/model 覆盖演示脚本值（cwd 只读展示面）
    return Promise.resolve({
      ...dto,
      ...(opts?.title !== undefined && opts.title !== '' ? { title: opts.title } : {}),
      ...(opts?.model !== undefined && opts.model !== '' ? { model: opts.model } : {}),
    })
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
