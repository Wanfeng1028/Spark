/**
 * RunawayGuard（CK-3）：循环/空转指纹检测——run-loop step 边界的引擎内存态观察器
 * （不出协议事件；判据取 MiniMax runaway-guard 六信号 + Gemini CLI loopDetection 的
 * 本仓取舍）。
 *
 * 六信号（窗口 = 最近 12 条 action 记录，全部"连续末段"判定）：
 *  1. exact_action_repeat     同 action（工具 + 归一化输入）连读 ≥3
 *  2. exact_result_repeat     同 action 且同结果连读 ≥3
 *  3. same_error_family       同族错误（首个 E_* 码）连读 ≥3
 *  4. abab_action_cycle       A,B,A,B 交替循环（末 4 条）
 *  5. polling_repeat          读族工具同 action 连读 ≥4（轮询语义，只提醒不升级）
 *  6. unchanged_progress_repeat 同 action 连读 ≥3 且输出长度都在 ±10% 带内（形状没变）
 *
 * 响应：命中 → steer 通道注入纠偏提醒（每信号每 turn 至多一次；文案自带防持久化
 * 子句）；**连续 ≥2 轮有命中且本轮再命中非轮询信号** → shouldEscalate()=true，
 * 由 run-loop 以 error 事件终止本轮（fail-closed；"询问用户"的升级面随 CK-6
 * 结构化提问工具落地，先以终止兜底——不静默放行）。
 * 豁免：task_output 是后台任务的法定轮询面（CK-1），整工具豁免。
 */
export type RunawaySignal =
  | 'exact_action_repeat'
  | 'exact_result_repeat'
  | 'same_error_family'
  | 'abab_action_cycle'
  | 'polling_repeat'
  | 'unchanged_progress_repeat'

export interface RunawayHit {
  signal: RunawaySignal
  /** 人话细节（进提醒文案） */
  detail: string
  /** 是否计入升级判定（polling_repeat 只提醒——防误报长跑任务） */
  escalateEligible: boolean
}

/** 观察窗口（最近 N 条；MiniMax 流式历史 5000 是 token 级，本仓按 action 条数取小窗） */
export const RUNAWAY_WINDOW = 12
/** 连读判定的公共阈值 */
const REPEAT_K = 3
const POLLING_K = 4
/** unchanged_progress 的长度带（±10%） */
const PROGRESS_BAND = 0.1

/** 读族工具（polling_repeat 的判定域；browser.read 经 makeBrowserTools 同名注册） */
const READ_FAMILY_TOOLS = new Set(['read', 'grep', 'browser.read', 'lsp'])
/** 整工具豁免（法定轮询面——重复是语义本身） */
export const RUNAWAY_EXEMPT_TOOLS = new Set(['task_output'])

interface ActionRecord {
  toolName: string
  actionHash: string
  resultHash: string
  isError: boolean
  errorFamily: string
  outputChars: number
}

/** 稳定序列化（键排序——对象键序不参与指纹） */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return String(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${stableStringify(val)}`).join(',')}}`
}

/** FNV-1a 32 位（指纹只做相等比较，不承载语义） */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** bash 命令归一：去首尾空白 + 压缩连续空白——`ls  -la` 与 `ls -la` 同指纹 */
export function normalizeActionInput(toolName: string, input: unknown): string {
  const raw =
    toolName === 'bash' && input !== null && typeof input === 'object' && 'command' in input
      ? String(input.command)
      : stableStringify(input)
  return raw.trim().replace(/\s+/g, ' ')
}

function errorFamilyOf(output: unknown, isError: boolean): string {
  if (!isError) return ''
  const m = stableStringify(output).match(/E_[A-Z0-9_]+/)
  return m !== null ? m[0] : 'generic_error'
}

function lastSame<T>(records: readonly T[], k: number, key: (r: T) => string): boolean {
  if (records.length < k) return false
  const head = key(records[records.length - k] as T)
  for (let i = records.length - k + 1; i < records.length; i++) {
    if (key(records[i] as T) !== head) return false
  }
  return true
}

export class RunawayGuard {
  private records: ActionRecord[] = []
  /** 本 turn 已提醒过的信号（每信号每 turn 一次） */
  private alerted = new Set<RunawaySignal>()
  /** 本 turn 是否有命中（endTurn 时结转连续计数） */
  private hitThisTurn = false
  /** 连续有命中的轮数（跨 turn；无命中轮即清零） */
  private consecutiveTurnHits = 0

  /**
   * step 边界观察 + 检测：追加本 step 的 action 记录后跑六信号。
   * 返回需要 steer 的命中（已提醒过的信号返回 null——限频在调用方无感）。
   */
  observeAndDetect(
    actions: readonly { name: string; input: unknown }[],
    results: readonly { output: unknown; isError: boolean }[],
  ): RunawayHit | null {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      if (action === undefined || RUNAWAY_EXEMPT_TOOLS.has(action.name)) continue
      const result = results[i]
      const normalized = normalizeActionInput(action.name, action.input)
      const outputText = result === undefined ? '' : stableStringify(result.output)
      this.records.push({
        toolName: action.name,
        actionHash: fnv1a(`${action.name}|${normalized}`),
        resultHash: fnv1a(outputText),
        isError: result?.isError === true,
        errorFamily: errorFamilyOf(result?.output, result?.isError === true),
        outputChars: outputText.length,
      })
    }
    if (this.records.length > RUNAWAY_WINDOW) {
      this.records = this.records.slice(-RUNAWAY_WINDOW)
    }
    const hit = this.detect()
    if (hit === null || this.alerted.has(hit.signal)) return null
    this.alerted.add(hit.signal)
    // 仅升级资格信号计入连续命中（polling_repeat 只提醒——轮询轮不延续升级链）
    if (hit.escalateEligible) this.hitThisTurn = true
    return hit
  }

  /** 升级判定：连续 ≥2 轮有命中且本轮再命中升级资格信号——由 run-loop 终止本轮 */
  shouldEscalate(): boolean {
    return this.consecutiveTurnHits >= 1 && this.hitThisTurn
  }

  /** turn 收尾：结转连续计数、重置 turn-local 影子状态（MiniMax 同语义） */
  endTurn(): void {
    this.consecutiveTurnHits = this.hitThisTurn ? this.consecutiveTurnHits + 1 : 0
    this.hitThisTurn = false
    this.alerted.clear()
    this.records = []
  }

  /** 六信号检测（优先级：错误族 > 同结果 > 交替环 > 轮询 > 形状不变 > 同动作） */
  private detect(): RunawayHit | null {
    const r = this.records
    if (r.length >= REPEAT_K) {
      const last3 = r.slice(-REPEAT_K)
      if (lastSame(r, REPEAT_K, (x) => x.errorFamily) && last3.every((x) => x.isError)) {
        return {
          signal: 'same_error_family',
          detail: `连续 ${REPEAT_K} 次同族错误（${last3[0]?.errorFamily}）`,
          escalateEligible: true,
        }
      }
      if (lastSame(r, REPEAT_K, (x) => `${x.actionHash}|${x.resultHash}`)) {
        return {
          signal: 'exact_result_repeat',
          detail: `同一操作连续 ${REPEAT_K} 次返回完全相同的结果`,
          escalateEligible: true,
        }
      }
      if (
        lastSame(r, REPEAT_K, (x) => x.actionHash) &&
        last3.every((x) => !x.isError) &&
        (() => {
          const lens = last3.map((x) => x.outputChars)
          const min = Math.min(...lens)
          const max = Math.max(...lens)
          return min > 0 && max / min <= 1 + PROGRESS_BAND
        })()
      ) {
        return {
          signal: 'unchanged_progress_repeat',
          detail: `同一操作连续 ${REPEAT_K} 次且输出规模没有实质变化（±10% 带内）`,
          escalateEligible: true,
        }
      }
      if (lastSame(r, REPEAT_K, (x) => x.actionHash)) {
        return {
          signal: 'exact_action_repeat',
          detail: `同一操作连续 ${REPEAT_K} 次原样重发`,
          escalateEligible: true,
        }
      }
    }
    if (r.length >= 4) {
      const n = r.length
      const a = r[n - 4] as ActionRecord
      const b = r[n - 3] as ActionRecord
      const a2 = r[n - 2] as ActionRecord
      const b2 = r[n - 1] as ActionRecord
      if (
        a.actionHash === a2.actionHash &&
        b.actionHash === b2.actionHash &&
        a.actionHash !== b.actionHash
      ) {
        return {
          signal: 'abab_action_cycle',
          detail: '两个操作在交替打环（A→B→A→B）',
          escalateEligible: true,
        }
      }
      const p = r.slice(-POLLING_K)
      if (
        lastSame(r, POLLING_K, (x) => x.actionHash) &&
        p.every((x) => READ_FAMILY_TOOLS.has(x.toolName))
      ) {
        return {
          signal: 'polling_repeat',
          detail: `读族工具 ${p[0]?.toolName} 连续 ${POLLING_K} 次同参数轮询`,
          escalateEligible: false, // 轮询只提醒不升级（防误报长跑任务）
        }
      }
    }
    return null
  }
}
