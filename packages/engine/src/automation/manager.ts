/**
 * 自动化触发器引擎（阶段七工单 7.6 / H06 / ADR D26）：
 * 单 tick 循环（缺省 5s，测试注入短间隔）驱动三类触发——
 * - cron：tick-match 当前分钟（分钟去重——同一分钟只发一次）；
 * - watch：path stat mtime 变化（文件内容/目录结构变化时 mtime 更新；首见只记基线不触发）；
 * - webhook：外部 POST 命中（由 server 路由调 fireWebhook，不经 tick）。
 * 触发执行 = 自动建会话（cwd）→ send(prompt)（走正常 turn 通道——事件流完整可回放）；
 * 运行历史每次触发必落一行（finish ok/error——失败闭合，错误结构化留存）。
 * 纪律：单触发器 fire 失败不中断 tick 循环（逐触发器 try-catch 闭合）。
 */
import { stat } from 'node:fs/promises'
import type { AutomationRunDto, AutomationTriggerDto, SessionId } from '@spark/protocol'
import { AutomationRegistry } from './registry.js'
import type { TriggerDef, TriggerRun } from './registry.js'
import { cronMatches, parseCron } from './cron.js'

/** 触发器执行的会话工厂（Engine 装配注入——本模块不感知 Engine 全貌） */
export interface FireDeps {
  createSession: (opts: { title: string; cwd: string }) => Promise<{
    id: SessionId
    send: (text: string) => Promise<unknown>
  }>
  now: () => number
  /** tick 间隔（缺省 5s；测试注入短间隔） */
  tickMs?: number
}

export class AutomationManager {
  private readonly registry: AutomationRegistry
  private readonly deps: FireDeps
  /** cron 预解析缓存（触发器增删时重建） */
  private cronSpecs = new Map<string, ReturnType<typeof parseCron>>()
  /** cron 分钟去重：triggerId → 上次触发的分钟值 */
  private lastCronMinute = new Map<string, number>()
  /** watch 基线：triggerId → 上次观察的 mtimeMs（undefined = 首见记基线） */
  private watchBaselines = new Map<string, number>()
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false

  constructor(registry: AutomationRegistry, deps: FireDeps) {
    this.registry = registry
    this.deps = deps
    this.rebuildCronSpecs()
  }

  private rebuildCronSpecs(): void {
    this.cronSpecs.clear()
    for (const t of this.registry.list()) {
      if (t.cron === undefined) continue
      try {
        this.cronSpecs.set(t.id, parseCron(t.cron))
      } catch {
        // 坏表达式跳过该触发器（运行历史记录失败；其余触发器不受影响）
        this.recordRun(t, 'cron', 'error', { error: `E_CRON: 表达式不合法 ${t.cron}` })
      }
    }
  }

  /** 启动 tick 循环（幂等）；server listen 前调用 */
  start(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => void this.tick(), this.deps.tickMs ?? 5000)
    this.timer.unref?.() // 不阻止进程退出（shutdown 由 Engine 序列驱动）
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 单次 tick：cron 分钟匹配 + watch mtime 检查（并发重入保护） */
  private async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      const now = new Date(this.deps.now())
      const minuteKey = now.getHours() * 60 + now.getMinutes()
      for (const t of this.registry.list()) {
        if (!t.enabled) continue
        if (t.cron !== undefined && this.cronSpecs.has(t.id)) {
          const last = this.lastCronMinute.get(t.id)
          if (last !== minuteKey && cronMatches(this.cronSpecs.get(t.id) as never, now)) {
            this.lastCronMinute.set(t.id, minuteKey)
            await this.fire(t, 'cron')
          }
        }
        if (t.watch !== undefined) {
          await this.checkWatch(t)
        }
      }
    } finally {
      this.ticking = false
    }
  }

  private async checkWatch(t: AutomationTriggerDto): Promise<void> {
    const path = t.watch
    if (path === undefined) return
    let mtime: number
    try {
      mtime = (await stat(path)).mtimeMs
    } catch (err) {
      // 首见即不存在 = 记失败行（如实留痕），下一 tick 重试同样路径
      this.recordRun(t, 'watch', 'error', {
        error: `E_WATCH: 路径不可访问 ${path}：${err instanceof Error ? err.message : String(err)}`,
      })
      return
    }
    const base = this.watchBaselines.get(t.id)
    if (base === undefined || base === mtime) {
      this.watchBaselines.set(t.id, mtime) // 首见/未变化
      return
    }
    this.watchBaselines.set(t.id, mtime)
    await this.fire(t, 'watch')
  }

  /** webhook / 手动入口（不经 tick 去重——每次调用即触发） */
  async fireWebhook(triggerId: string): Promise<void> {
    const t = this.registry.def(triggerId)
    if (t === undefined) throw new Error(`E_NOT_FOUND: 触发器 ${triggerId} 不存在`)
    if (!t.enabled) throw new Error('E_TRIGGER_DISABLED: 触发器已停用')
    if (t.webhook !== true) {
      throw new Error(`E_TRIGGER_KIND: 触发器 ${t.name} 未启用 webhook 入口`)
    }
    await this.fire(t, 'webhook')
  }

  /** 手动触发（测试/调试入口；不限触发类型） */
  async fireManual(triggerId: string): Promise<void> {
    const t = this.registry.def(triggerId)
    if (t === undefined) throw new Error(`E_NOT_FOUND: 触发器 ${triggerId} 不存在`)
    await this.fire(t, 'manual')
  }

  /** 触发执行：建会话 → send(prompt)；失败落 error 行（失败闭合） */
  private async fire(t: TriggerDef | AutomationTriggerDto, kind: TriggerRun['kind']): Promise<void> {
    try {
      const handle = await this.deps.createSession({ title: `自动化：${t.name}`, cwd: t.cwd })
      await handle.send(t.prompt)
      this.recordRun(t, kind, 'ok', { sessionId: handle.id })
    } catch (err) {
      this.recordRun(t, kind, 'error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private recordRun(
    t: TriggerDef | AutomationTriggerDto,
    kind: TriggerRun['kind'],
    finish: 'ok' | 'error',
    extra: { sessionId?: string; error?: string },
  ): TriggerRun {
    return this.registry.appendRun({
      triggerId: t.id,
      triggerName: t.name,
      at: this.deps.now(),
      kind,
      finish,
      ...(extra.sessionId !== undefined ? { sessionId: extra.sessionId } : {}),
      ...(extra.error !== undefined ? { error: extra.error } : {}),
    })
  }

  // ---- 管理面透传（增删/启停后重建 cron 缓存） ----

  add(input: Omit<TriggerDef, 'id' | 'createdAt' | 'enabled'>): AutomationTriggerDto {
    const t = this.registry.add(input)
    this.rebuildCronSpecs()
    return this.list().find((x) => x.id === t.id) as AutomationTriggerDto
  }

  remove(id: string): boolean {
    const ok = this.registry.remove(id)
    if (ok) this.rebuildCronSpecs()
    return ok
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const ok = this.registry.setEnabled(id, enabled)
    if (ok) this.rebuildCronSpecs()
    return ok
  }

  list(): AutomationTriggerDto[] {
    return this.registry.list()
  }

  runs(limit: number): AutomationRunDto[] {
    return this.registry.runs(limit)
  }
}
