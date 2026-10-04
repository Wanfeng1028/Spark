/**
 * 项目级权限规则层缓存（LA-01/LA-03 收口；自 engine.ts 门面拆出——doc/13 §5.4 第一步）：
 * 一个 cwd 一层，按 trustKey(cwd) 缓存；信任门 + 家目录撞路径守卫 + 惰性建层
 * 全部收在本类单点（门面只留一层委托）。
 * - **未信任 = 整层不进评估**（LA-01）：项目 permissions.json 可随仓库传播，
 *   用户首次打开未信任仓库即被第三方写好审批规则，不能成立；文件里确有规则时
 *   warn + 审计各一条（每个 cwd 只记一次）。
 * - **家目录撞路径不设层**（LA-03②）：defaultCwd = 家目录时 <cwd>/.spark/
 *   permissions.json 与用户级文件同路径——两个内存数组重写同一文件互相丢规则，
 *   且"本项目"此刻就是全局；project 作用域固化将如实报 E_PERMISSION_SCOPE。
 * - 坏形状文件降级为空层跳过（warn），不阻塞审批主链路（用户级与会话层照常生效）。
 */
import { resolve } from 'node:path'
import { errText } from '../errs.js'
import type { AuditLog } from '../audit/log.js'
import type { SparkLogger } from '../logger.js'
import { loadProjectRules, type PermissionRule } from '../config.js'
import { projectPermissionsFile, sparkFile } from '../storage/paths.js'
import { trustKey, trustLevelOf } from '../trust.js'
import type { FolderTrust } from '../trust.js'
import { UserRuleStore } from './store.js'
import type { ProjectLayer } from './service.js'

export class ProjectLayerCache {
  /** trustKey(cwd) → 层 */
  private readonly layers = new Map<string, ProjectLayer>()
  /** 未信任目录"有规则被停用"的告警去重（每个 cwd 只记一次） */
  private readonly warned = new Set<string>()

  constructor(
    private readonly deps: {
      /** spark 根目录（与用户级 permissions.json 同路径判定用） */
      root: string
      /** trusted.json 内存表（setTrust 就地改——现取防快照过期） */
      trustFolders: () => Record<string, FolderTrust>
      logger: SparkLogger
      audit: AuditLog
    },
  ) {}

  /** 会话 cwd 的项目层；未信任 / 家目录撞路径 → undefined（调用方按"无层"处理） */
  for(cwd: string): ProjectLayer | undefined {
    const key = trustKey(cwd)
    if (trustLevelOf(cwd, this.deps.trustFolders()) !== 'trusted') {
      if (!this.warned.has(key)) {
        this.warned.add(key)
        const count = this.readLenient(cwd).length
        if (count > 0) {
          this.deps.logger.warn('permission.projectRules.untrusted', { cwd, count })
          this.deps.audit.record({
            time: Date.now(),
            kind: 'permission.rule',
            actor: 'system',
            result: 'ok',
            source: 'project-untrusted-skipped',
            resource: cwd,
            note: `未信任目录：${count} 条项目规则整层停用`,
          })
        }
      }
      return undefined
    }
    const cached = this.layers.get(key)
    if (cached !== undefined) return cached
    const projectFile = projectPermissionsFile(cwd)
    if (resolve(projectFile) === resolve(sparkFile(this.deps.root, 'permissions'))) {
      this.deps.logger.warn('permission.projectRules.homeCollision', { cwd })
      return undefined
    }
    const rules = this.readLenient(cwd)
    const layer: ProjectLayer = { rules, store: new UserRuleStore(projectFile, rules), key }
    this.layers.set(key, layer)
    if (rules.length > 0) {
      this.deps.audit.record({
        time: Date.now(),
        kind: 'permission.rule',
        actor: 'system',
        result: 'ok',
        source: 'project-loaded',
        resource: cwd,
        note: `读到 ${rules.length} 条项目规则`,
      })
    }
    return layer
  }

  /** loadProjectRules 的降级读：坏形状如实 warn 后按空表处理（不阻塞会话审批链路） */
  private readLenient(cwd: string): PermissionRule[] {
    try {
      return loadProjectRules(cwd)
    } catch (err) {
      this.deps.logger.warn('permission.projectRules.invalid', { cwd, err: errText(err) })
      return []
    }
  }
}
