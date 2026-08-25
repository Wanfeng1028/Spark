/**
 * 用户级权限规则仓（doc/02 §5.7.1 / 工单 4.7）：~/.spark/permissions.json 的内存持有
 * 与 always 固化落盘（跨会话生效的持久层）。写 = tmp 文件 + rename 原子替换（半写不
 * 留脏文件）；同步 fs（小文件本地单用户，与 config 加载同风格）。落盘失败向上抛——
 * reply(always) 先固化后放行，写盘失败审批仍挂起（fail-closed，可重试或超时拒绝）。
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PermissionRule } from '../config.js'

/** 规则仓端口（service/engine 只依赖本接口；测试可换内存实现） */
export interface RuleStore {
  list(): readonly PermissionRule[]
  /** 精确匹配 action+resource → 覆盖 effect；否则追加 */
  add(rule: PermissionRule): void
  /** 精确匹配删除；false = 无此规则 */
  remove(action: string, resource: string): boolean
}

export class UserRuleStore implements RuleStore {
  private rules: PermissionRule[]

  constructor(
    private readonly filePath: string,
    initialRules: readonly PermissionRule[],
  ) {
    this.rules = [...initialRules]
  }

  list(): readonly PermissionRule[] {
    return this.rules
  }

  add(rule: PermissionRule): void {
    const idx = this.rules.findIndex(
      (r) => r.action === rule.action && r.resource === rule.resource,
    )
    const next =
      idx >= 0 ? this.rules.map((r, i) => (i === idx ? rule : r)) : [...this.rules, rule]
    this.persist(next)
    this.rules = next
  }

  remove(action: string, resource: string): boolean {
    const next = this.rules.filter((r) => !(r.action === action && r.resource === resource))
    if (next.length === this.rules.length) return false
    this.persist(next)
    this.rules = next
    return true
  }

  /** 先写 tmp 再 rename：进程崩溃只可能留下多余 tmp 文件，主文件恒完整 */
  private persist(rules: readonly PermissionRule[]): void {
    const body = JSON.stringify({ version: 1, rules }, null, 2)
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, body, 'utf8')
    renameSync(tmp, this.filePath)
  }
}
