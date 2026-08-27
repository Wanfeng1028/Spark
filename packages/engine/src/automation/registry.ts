/**
 * 自动化触发器注册表 + 运行历史（阶段七工单 7.6 / H06 / ADR D26）：
 * - 触发器清单：~/.spark/automation.json（version:1 + triggers[]，原子写）；
 * - 运行历史：~/.spark/automation-runs.jsonl 追加行（触发时间、会话、结果、
 *   失败错误结构化留存——失败闭合：每次触发必有一行终态记录）。
 * 触发执行体不在本模块（AutomationManager 职责）；本模块只管持久化形状。
 */
import { existsSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AutomationRunDto, AutomationTriggerDto } from '@spark/protocol'

/** 触发器内部形状（wire DTO + 启用开关与创建元数据） */
export interface TriggerDef {
  id: string
  name: string
  enabled: boolean
  /** 自动建会话的工作目录 */
  cwd: string
  /** 触发后发送的 prompt */
  prompt: string
  /** 三类触发条件（至少一种；多种并存 = 任一命中即触发） */
  cron?: string | undefined
  watch?: string | undefined
  /** webhook：POST /api/automation/webhook/:id 命中即触发 */
  webhook?: boolean | undefined
  createdAt: number
}

/** 运行历史行（append-only；finish: ok=turn 已受理 / error=触发失败） */
export interface TriggerRun {
  id: string
  triggerId: string
  triggerName: string
  at: number
  kind: 'cron' | 'watch' | 'webhook' | 'manual'
  sessionId?: string | undefined
  finish: 'ok' | 'error'
  error?: string | undefined
}

interface AutomationDoc {
  version: 1
  triggers: TriggerDef[]
}

export class AutomationRegistry {
  private triggers: TriggerDef[] = []
  private readonly triggersPath: string
  private readonly runsPath: string

  constructor(root: string) {
    this.triggersPath = `${root}/automation.json`
    this.runsPath = `${root}/automation-runs.jsonl`
    this.loadTriggers()
  }

  private loadTriggers(): void {
    if (!existsSync(this.triggersPath)) return // 未配置 = 零触发器
    try {
      const doc = JSON.parse(readFileSync(this.triggersPath, 'utf8')) as AutomationDoc
      if (typeof doc !== 'object' || doc === null || !Array.isArray(doc.triggers)) {
        throw new Error('形状不符')
      }
      this.triggers = doc.triggers
    } catch (err) {
      // 配置错误不带病运行（同 loadConfig 纪律）——启动即败交给调用方决定
      throw new Error(
        `E_CONFIG: automation.json 不是合法触发器清单：${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private persist(): void {
    const doc: AutomationDoc = { version: 1, triggers: this.triggers }
    const tmp = `${this.triggersPath}.tmp`
    writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`)
    renameSync(tmp, this.triggersPath)
  }

  list(): AutomationTriggerDto[] {
    return this.triggers.map((t) => ({
      id: t.id,
      name: t.name,
      enabled: t.enabled,
      cwd: t.cwd,
      prompt: t.prompt,
      ...(t.cron !== undefined ? { cron: t.cron } : {}),
      ...(t.watch !== undefined ? { watch: t.watch } : {}),
      ...(t.webhook === true ? { webhook: true } : {}),
      createdAt: t.createdAt,
    }))
  }

  def(id: string): TriggerDef | undefined {
    return this.triggers.find((t) => t.id === id)
  }

  add(input: Omit<TriggerDef, 'id' | 'createdAt' | 'enabled'>): TriggerDef {
    const t: TriggerDef = {
      id: randomUUID(),
      enabled: true,
      createdAt: Date.now(),
      ...input,
    }
    this.triggers.push(t)
    this.persist()
    return t
  }

  remove(id: string): boolean {
    const idx = this.triggers.findIndex((t) => t.id === id)
    if (idx < 0) return false
    this.triggers.splice(idx, 1)
    this.persist()
    return true
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const t = this.triggers.find((x) => x.id === id)
    if (t === undefined) return false
    t.enabled = enabled
    this.persist()
    return true
  }

  /** 运行历史：追加一行（返回带 id 的记录）；limit 读最近 N 行（新→旧） */
  appendRun(run: Omit<TriggerRun, 'id'>): TriggerRun {
    const rec: TriggerRun = { id: randomUUID(), ...run }
    appendFileSync(this.runsPath, `${JSON.stringify(rec)}\n`)
    return rec
  }

  runs(limit: number): AutomationRunDto[] {
    if (!existsSync(this.runsPath)) return []
    const lines = readFileSync(this.runsPath, 'utf8').split('\n').filter((l) => l !== '')
    const rows: TriggerRun[] = []
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line) as TriggerRun)
      } catch {
        // 坏行跳过（历史文件只追加不改写——单行损坏不阻塞列表）
      }
    }
    return rows.slice(-limit).reverse().map((r) => ({
      id: r.id,
      triggerId: r.triggerId,
      triggerName: r.triggerName,
      at: r.at,
      kind: r.kind,
      ...(r.sessionId !== undefined ? { sessionId: r.sessionId } : {}),
      finish: r.finish,
      ...(r.error !== undefined ? { error: r.error } : {}),
    }))
  }
}
