/**
 * 项目层 hook 信任门（CK-2 批 2 ⑤ / ZC-Q3 拍板：默认 Claude Code 姿态 + 多模式切换）。
 *
 * 背景：项目声明 `<cwd>/.spark/hooks.json` 与用户级 spark.json hooks 段同 schema——
 * 克隆别人的项目就带着别人的自动化脚本，加载前必须过信任门（Claude Code workspace
 * trust 同型：泄露源码 `shouldSkipHookDueToTrust` 的纵深防御教训——拒绝对话框后
 * SessionEnd hook 仍执行过，故 hooks 快照在对话框前捕获、运行时统一复查）。
 *
 * 三种信任策略档（settings `hooks.projectTrust.mode`，缺省 'claude'）：
 * - claude（缺省）：每项目一次信任确认；信任后全量加载；内容变更不重审（路径级布尔）。
 * - gemini：claude + 指纹——声明内容 sha256，变更即视为新 untrusted 重审
 *   （Gemini CLI trustedHooks 同思路，键从明文 name:command 升级为哈希）。
 * - qwen：gemini + 加固——信任文件损坏/非法 → E_CONFIG 硬停机（不带病运行，Qwen 同款）；
 *   旧版无指纹的 trusted 条目视为无效（档位升级强制重审）。
 *
 * 信任存储 `~/.spark/trust.json`（0o600 同 secrets 口径）：per 规范化路径条目 +
 * 可选指纹。父目录就近继承（pi project-trust 同思路：精确命中优先，否则向上遍历）。
 * 无 UI fail-closed：未决/不可判定 = ask（不加载项目 hooks——pi/Qwen 共同判）。
 * scope 不对称（Qwen 原则）：项目声明只能收窄安全面，不能放大——由消费侧保证。
 */
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { parseOrThrow, readJsonFile } from '../config.js'
import { atomicWriteJson } from '../fsutil.js'
import { SettingsHooksSchema, type SettingsHooks } from '@spark/protocol'

export type TrustMode = 'claude' | 'gemini' | 'qwen'
/** trusted = 加载项目 hooks；untrusted = 明确拒绝；ask = 未决（弹信任确认） */
export type TrustDecision = 'trusted' | 'untrusted' | 'ask'

/** 项目声明文件（`<cwd>/.spark/hooks.json`）——与用户级 SettingsHooks 同 schema */
export const ProjectHooksFileSchema = z.strictObject({
  version: z.literal(1),
  hooks: SettingsHooksSchema,
})

export type ProjectHooksFile = z.infer<typeof ProjectHooksFileSchema>

/** 信任文件条目 */
const trustEntrySchema = z.strictObject({
  trust: z.enum(['trusted', 'untrusted']),
  /** gemini/qwen 档的声明指纹——内容变更即失效重审 */
  fingerprint: z.string().min(1).optional(),
})

const trustFileSchema = z.strictObject({
  version: z.literal(1),
  folders: z.record(z.string().min(1), trustEntrySchema),
})

export type TrustEntry = z.infer<typeof trustEntrySchema>

export class ProjectTrustStore {
  private readonly path: string
  private readonly folders = new Map<string, TrustEntry>()

  constructor(path: string) {
    this.path = path
    const raw = readJsonFile(dirname(path), basename(path))
    if (raw === undefined) return
    const parsed = parseOrThrow(trustFileSchema, raw, 'trust.json')
    for (const [folder, entry] of Object.entries(parsed.folders)) {
      this.folders.set(folder, entry)
    }
  }

  /** 精确查询（不做继承——继承在 resolve 层） */
  get(folder: string): TrustEntry | undefined {
    return this.folders.get(folder)
  }

  set(folder: string, entry: TrustEntry): void {
    const parsed = trustEntrySchema.parse(entry)
    this.folders.set(folder, parsed)
    this.persist()
  }

  delete(folder: string): boolean {
    if (!this.folders.delete(folder)) return false
    this.persist()
    return true
  }

  names(): string[] {
    return [...this.folders.keys()]
  }

  private persist(): void {
    atomicWriteJson(
      this.path,
      { version: 1, folders: Object.fromEntries(this.folders) },
      { mode: 0o600 },
    )
  }
}


/** 规范化绝对路径（信任键统一形态；大小写与分隔符随 OS——同 trustKey 口径） */
export function normalizeTrustPath(cwd: string): string {
  return resolve(cwd)
}

/**
 * 声明指纹（gemini/qwen 档）：规范化 hooks JSON 的 sha256——
 * 内容变更（增删改任一挂点的任一 hook 命令）即指纹失效，重新弹信任确认。
 */
export function hooksFingerprint(hooks: SettingsHooks): string {
  return createHash('sha256').update(JSON.stringify(hooks), 'utf8').digest('hex')
}

/** 项目声明探测与装载：`.spark/hooks.json` 存在且合法 → 返回 hooks + 指纹 */
export function loadProjectHooks(cwd: string): {
  hooks: SettingsHooks
  fingerprint: string
} | null {
  const file = join(normalizeTrustPath(cwd), '.spark', 'hooks.json')
  if (!existsSync(file)) return null
  const raw = readJsonFile(dirname(file), basename(file))
  if (raw === undefined) return null
  const parsed = parseOrThrow(ProjectHooksFileSchema, raw, '.spark/hooks.json')
  return {
    hooks: parsed.hooks,
    fingerprint: hooksFingerprint(parsed.hooks),
  }
}

/**
 * 父目录就近继承（pi project-trust 同思路）：cwd 无条目时向上逐级找——
 * 子目录继承最近祖先的信任判定；跨盘/到根即止。返回命中条目或 undefined。
 */
export function resolveInherited(
  folders: ReadonlyMap<string, TrustEntry>,
  cwd: string,
): TrustEntry | undefined {
  let cur = normalizeTrustPath(cwd)
  for (;;) {
    const hit = folders.get(cur)
    if (hit !== undefined) return hit
    const parent = dirname(cur)
    if (parent === cur) return undefined
    cur = parent
  }
}

/**
 * 信任判定（纯判据——模式策略集中在此，消费方只看 TrustDecision）：
 * - claude：路径级布尔（条目 trust 字段），无指纹概念；
 * - gemini：trusted + 指纹匹配才 trusted；指纹不匹配 = ask（重审）；
 * - qwen：同 gemini，且旧版无指纹的 trusted 条目也视为 ask（档位升级强制重审）。
 * 继承：cwd 精确条目优先，否则最近祖先（含 trusted/untrusted 两种判定都能继承）。
 */
export function resolveTrust(input: {
  cwd: string
  mode: TrustMode
  fingerprint: string | undefined
  store: ProjectTrustStore
}): TrustDecision {
  const inherited = resolveInherited(input.store.names().length > 0 ? trustMapOf(input.store) : new Map(), input.cwd)
  if (inherited === undefined) return 'ask'

  if (input.mode === 'claude') {
    return inherited.trust // 路径级布尔——内容变更不重审（Claude Code 同款）
  }
  // gemini / qwen：指纹闸
  if (inherited.trust !== 'trusted') return 'untrusted'
  if (inherited.fingerprint === undefined) {
    // qwen 档：无指纹的 trusted = 旧档升级残留，强制重审
    return input.mode === 'qwen' ? 'ask' : 'trusted'
  }
  if (input.fingerprint === undefined) return 'trusted' // 无声明可比对（不应到达——调用方有 hooks 才判）
  return inherited.fingerprint === input.fingerprint ? 'trusted' : 'ask'
}

/** store → Map 视图（resolveInherited 消费形态） */
function trustMapOf(store: ProjectTrustStore): Map<string, TrustEntry> {
  return new Map(store.names().map((n) => [n, store.get(n) as TrustEntry]))
}
