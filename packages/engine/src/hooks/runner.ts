/**
 * 用户侧 hooks（阶段七工单 7.3 / H03 / doc/02 §8.6）：spark.json 声明四挂点
 * （turn.before / turn.after / permission.resolved / tool.completed）→ 两种触发：
 * - command：外部命令（shell 解释，cwd = 会话工作目录，stdin 收 JSON 载荷；
 *   Claude Code settings hooks 同信任模型——用户显式写进自己的配置，不走审批门）；
 * - skill：emit 该 skill 清单声明的插件事件（data 形状与作者侧声明式钩子同源，
 *   ADR D18：{skill, sourceEventId, sourceType}，无自定义构造器）。
 *
 * 纪律：fire-and-forget——spawn 失败 / 非零退出 / 超时 / skill 未加载只 warn
 * 闭合，绝不阻断主流程（同 D18 与 MCP 单点失败纪律）。载荷不含工具 output
 * （可能超大或含敏感内容，脱敏口径不外泄）。
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { EventId, SessionId } from '@spark/protocol'
import type { EventBus } from '../bus.js'
import type { LoadedSkill } from '../skills/loader.js'

/** 四挂点（doc/02 §8.6 工单 7.3 定稿；新增挂点须同步文档） */
export type HookPoint = 'turn.before' | 'turn.after' | 'permission.resolved' | 'tool.completed'

/** 外部命令触发（timeoutMs 缺省 DEFAULT_HOOK_TIMEOUT_MS） */
export interface UserHookCommandDef {
  command: string
  timeoutMs?: number | undefined
}

/** skill 触发（emit 须在该 skill 清单的 events 表中声明） */
export interface UserHookSkillDef {
  skill: string
  emit: string
}

export type UserHookDef = UserHookCommandDef | UserHookSkillDef

/** spark.json `hooks` 段形状（缺省 = 无任何挂点；值显式 undefined 同缺省） */
export type UserHooksConfig = {
  readonly [P in HookPoint]?: readonly UserHookDef[] | undefined
}

/** fire 载荷：命令触发时整体 JSON 写入 stdin；skill 触发取 sourceEventId/sourceType */
export interface HookFirePayload {
  sessionId: SessionId
  /** 会话工作目录（外部命令的 cwd） */
  cwd: string
  /** 触发源事件 id（turn.before 先于任何事件 → null） */
  sourceEventId: EventId | null
  data: Record<string, unknown>
}

export const DEFAULT_HOOK_TIMEOUT_MS = 10_000

/** 结构化 warn 出口（同 loader 的 SkillLogger 先例——只依赖用到的成员） */
export interface HookLogger {
  warn(msg: string, fields?: Record<string, unknown>): void
}

export interface UserHookRunnerDeps {
  bus: EventBus
  logger: HookLogger
  /** 已加载 skills（引擎 skillsReady 后非空；fire 时现读） */
  skills: () => readonly LoadedSkill[]
  /** command 缺省超时（DEFAULT_HOOK_TIMEOUT_MS） */
  defaultTimeoutMs: number
}

export class UserHookRunner {
  /** shutdown 收口（工单 10.24）：置位后所有 warn 出口静默——迟到的子进程 close 回调
   * 不再写已关闭的 logger 流（pino "write after end"，全套件并发下曾致 user-hooks.test 偶发红） */
  private disposed = false
  /** 在途命令子进程（dispose 时逐一 kill；close/error 回调里移除） */
  private readonly inflight = new Set<ChildProcess>()

  constructor(
    private readonly defs: UserHooksConfig,
    private readonly deps: UserHookRunnerDeps,
  ) {}

  /** 引擎 shutdown / 配置重建时调用：先于 logger.close 执行（engine.ts doShutdown 步骤 6.8） */
  dispose(): void {
    this.disposed = true
    for (const child of this.inflight) child.kill()
    this.inflight.clear()
  }

  /** 统一 warn 出口：disposed 后静默（收口纪律，见类注释） */
  private warn(msg: string, fields?: Record<string, unknown>): void {
    if (this.disposed) return
    this.deps.logger.warn(msg, fields)
  }

  /** 同步入口：内部异步自闭合，调用点不 await（不阻断主流程是规格要求） */
  fire(point: HookPoint, payload: HookFirePayload): void {
    if (this.disposed) return
    const defs = this.defs[point]
    if (defs === undefined) return
    for (const def of defs) {
      if ('command' in def) this.runCommand(point, def, payload)
      else this.runSkill(point, def, payload)
    }
  }

  private runCommand(
    point: HookPoint,
    def: UserHookCommandDef,
    payload: HookFirePayload,
  ): void {
    const timeoutMs = def.timeoutMs ?? this.deps.defaultTimeoutMs
    const fields = { point, command: def.command, sid: payload.sessionId }
    let child
    try {
      child = spawn(def.command, {
        shell: true,
        cwd: payload.cwd,
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true,
      })
    } catch (err) {
      this.warn('userhook.error', { ...fields, err })
      return
    }
    this.inflight.add(child)
    const timer = setTimeout(() => {
      child.kill()
      this.warn('userhook.timeout', { ...fields, timeoutMs })
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      this.inflight.delete(child)
      this.warn('userhook.error', { ...fields, err: err.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      this.inflight.delete(child)
      // code=null = 被信号杀死（超时 kill 路径已有 timeout warn，此处不重复）
      if (code !== 0 && code !== null) {
        this.warn('userhook.exit', { ...fields, code: String(code) })
      }
    })
    if (child.stdin === null) {
      clearTimeout(timer)
      this.warn('userhook.error', { ...fields, err: 'stdin 不可用' })
      return
    }
    // EPIPE = 命令先行退出（不读 stdin）：忽略——退出码语义已由 close 承担
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify({ point, ...payload }))
  }

  private runSkill(point: HookPoint, def: UserHookSkillDef, payload: HookFirePayload): void {
    const fields = { point, skill: def.skill, emit: def.emit, sid: payload.sessionId }
    const skill = this.deps.skills().find((s) => s.name === def.skill)
    if (skill === undefined) {
      this.warn('userhook.skill.unknown', fields)
      return
    }
    if (!skill.events.includes(def.emit)) {
      this.warn('userhook.emit.unknown', fields)
      return
    }
    void this.deps.bus
      .emitExtended(payload.sessionId, def.emit, {
        skill: def.skill,
        sourceEventId: payload.sourceEventId ?? '',
        sourceType: point,
      })
      .catch((err: unknown) => {
        this.warn('userhook.skill.error', { ...fields, err })
      })
  }
}
