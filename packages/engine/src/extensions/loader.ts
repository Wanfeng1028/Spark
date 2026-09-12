/**
 * 扩展发现与启停（工单 16.5 / ADR D38；qwen extensionManager 参考设计大幅裁剪——
 * 只取发现/启停两动作，v1 无安装/下载/网络源）：
 * 扩展 = `~/.spark/extensions/<id>/` 目录 + spark-extension.json 声明清单
 * （skills/agents/commands/mcpServers 相对路径声明）——**不执行任意代码**（D18 红线）。
 *
 * 安全（qwen symlink 检查思路）：扩展目录或其内文件 realpath 后逃逸出扩展根 → 拒载
 * （防 staging 目录逃逸 / 软链指向敏感位置）；坏清单逐个 warn 跳过（同 commands/skills 纪律）。
 *
 * 启停（同 16.2 agents 同构）：settings.extensions.disabledExtensions 名单，
 * 重启档——清单 enabled 即时合成可见，但 MCP/技能注册表的装配在构造期（深度热插拔
 * 不做，登记限制）；**v1 清单每次现扫**（目录数小，无缓存即天然反映磁盘变化）。
 */
import { readdir, readFile, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { SparkExtensionManifestSchema } from '@spark/protocol'
import type { ExtensionDto, SparkExtensionManifest } from '@spark/protocol'
import { errText } from '../errs.js'

/** 扩展 id 纪律（同 agents/commands：小写字母数字连字符——防路径与注入花样） */
const EXTENSION_ID_RE = /^[a-z0-9][a-z0-9-]*$/

export interface ExtensionLoaderLogger {
  warn(msg: string, fields?: Record<string, unknown>): void
}

/** symlink/逃逸检查：目录 realpath 与其下文件 realpath 都须仍在扩展根内 */
async function containedInRoot(root: string, logger?: ExtensionLoaderLogger): Promise<boolean> {
  try {
    const realRoot = await realpath(root)
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      const child = join(root, entry.name)
      const real = await realpath(child)
      if (!real.startsWith(realRoot + sep) && real !== realRoot) {
        logger?.warn('extensions.load.skip', { id: root, reason: '文件逃逸扩展根（symlink？）' })
        return false
      }
    }
    return true
  } catch (err) {
    logger?.warn('extensions.load.skip', { id: root, reason: errText(err) })
    return false
  }
}

/**
 * 发现 `~/.spark/extensions/` 全部合法扩展（每次调用现扫——无缓存即热）。
 * 返回按 id 字典序的清单（enabled 由调用方按 settings 名单合成）。
 */
export async function discoverExtensions(
  root: string,
  logger?: ExtensionLoaderLogger,
): Promise<ExtensionDto[]> {
  const extRoot = join(root, 'extensions')
  if (!existsSync(extRoot)) return []
  let entries: string[]
  try {
    entries = await readdir(extRoot)
  } catch {
    return []
  }
  const out: ExtensionDto[] = []
  for (const id of entries) {
    const dir = join(extRoot, id)
    if (!EXTENSION_ID_RE.test(id)) {
      logger?.warn('extensions.load.skip', { id, reason: 'id 须匹配 ^[a-z0-9][a-z0-9-]*$' })
      continue
    }
    const manifestPath = join(dir, 'spark-extension.json')
    if (!existsSync(manifestPath)) {
      logger?.warn('extensions.load.skip', { id, reason: '缺 spark-extension.json' })
      continue
    }
    if (!(await containedInRoot(dir, logger))) continue
    try {
      const raw: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
      const manifest: SparkExtensionManifest = SparkExtensionManifestSchema.parse(raw)
      out.push({ id, enabled: true, path: dir, ...manifest })
    } catch (err) {
      logger?.warn('extensions.load.skip', { id, err: errText(err) })
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}
