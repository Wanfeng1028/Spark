/**
 * 敏感文件硬防线（doc/14 #3.6 / #4.3：Kimi Code path-access.ts 的 isSensitiveFile
 * 模式层吸收——晚风 2026-10-05 拍板"doc/14 按建议先做安全三件套"；AGENTS §2.0 安全第一）。
 *
 * 与 resolveInRoot（cwd 硬边界）**正交的一层**：越界判"能不能碰"，本模块判"碰了会不会泄密"——
 * .env / SSH 私钥 / 云凭证及其 .bak/.old/.pem 等变体即使在工作区内，工具也一律拒读写
 * （防"读个配置"顺手把密钥带进模型上下文——上下文会被送出本机给 LLM 供应商，泄露面即出网）。
 * 豁免：.env.example/.sample/.template（模板无真值）与 *.pub（公钥本就公开）。
 *
 * 纯函数、零依赖（node:path）——kimi 原件剥掉 pathe/shellPathBridge 后按本仓风格重写。
 * 消费方：read/write/edit 三工具 execute 前置检查（E_SENSITIVE）+ bash 目标扫描（同判）。
 * 不可分析即拒（fail-closed）——判定面宁窄勿宽，漏报 = 泄密，误报 = 用户手动操作（可恢复）。
 */
import { basename, extname, resolve, sep } from 'node:path'

/** 敏感文件名（小写归一后精确匹配；含无扩展名变体） */
const SENSITIVE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'id_dsa',
  'credentials',
  '.npmrc',
  '.pypirc',
  '.netrc',
  '.git-credentials',
  '.htpasswd',
  'known_hosts',
])

/** 敏感扩展名（.key/.pem/.p12/.pfx/.jks/.keystore/.kdbx 等——证书/密钥库族） */
const SENSITIVE_EXTS = new Set([
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
  '.kdbx',
  '.ppk',
])

/** 敏感后缀变体（编辑器备份即真值副本——.bak/.old/.orig/.save/.swp） */
const BACKUP_EXTS = new Set(['.bak', '.old', '.orig', '.save', '.swp', '.tmp'])

/** 豁免名单：模板与公钥（无真值/本公开） */
const EXEMPT_EXTS = new Set(['.pub', '.example', '.sample', '.template'])

/** 敏感目录段（云凭证惯用路径段——段级命中即敏感，如 .aws/credentials、.ssh/ 下任意文件） */
const SENSITIVE_DIR_SEGMENTS = new Set(['.ssh', '.aws', '.gcp', '.azure', '.kube'])

/** 小写归一（文件名/扩展名判定统一口径） */
function lower(s: string): string {
  return s.toLowerCase()
}

/**
 * 文件名级判定：.env 族精确名 / SSH 私钥名 / credentials / 密钥扩展 / 备份后缀变体
 * （.env.bak、id_rsa.old 即真值副本，同判敏感）。只切一层变体——真值副本是一次备份，
 * 不递归穿两层（notes.key.md 是笔记不是密钥：.key 后缀只在"文件名以 .key 结尾"时命中）。
 */
function isSensitiveName(name: string): boolean {
  const n = lower(name)
  if (SENSITIVE_NAMES.has(n)) return true
  const mainExt = lower(extname(n))
  const stem = n.slice(0, n.length - mainExt.length)
  // 备份后缀形态：主干（.bak/.old 前的真名）命中名单/密钥扩展才判敏感
  if (BACKUP_EXTS.has(mainExt)) {
    const stemExt = lower(extname(stem))
    const trueName = stem.slice(0, stem.length - stemExt.length)
    if (SENSITIVE_NAMES.has(stem) || SENSITIVE_EXTS.has(stemExt)) return true
    if (BACKUP_EXTS.has(stemExt) && (SENSITIVE_NAMES.has(trueName) || SENSITIVE_EXTS.has(lower(extname(trueName))))) return true
    return false
  }
  if (SENSITIVE_EXTS.has(mainExt)) return true
  return false
}

/**
 * 敏感文件判定（纯函数；输入为**相对 cwd 的路径或绝对路径均可**——先 resolve 归一）。
 * true = 工具拒绝读写（E_SENSITIVE）。目录段（.ssh/.aws 等）下任意文件均敏感；
 * 豁免名单（.pub/.example/.sample/.template）优先于一切命中。
 */
export function isSensitiveFile(target: string): boolean {
  const abs = resolve(target)
  const name = basename(abs)
  if (EXEMPT_EXTS.has(lower(extname(name)))) return false
  if (isSensitiveName(name)) return true
  const segments = abs.split(sep)
  for (const seg of segments) {
    if (SENSITIVE_DIR_SEGMENTS.has(lower(seg))) return true
  }
  return false
}

/**
 * 路径校验入口（文件工具统一消费）：cwd 硬边界（调用方既有 resolveInRoot）之外的
 * 第二道闸——敏感命中抛 E_SENSITIVE。绝对/相对统一；越界判定不在本函数（正交分层）。
 */
export function assertNotSensitive(target: string): void {
  if (isSensitiveFile(target)) {
    throw new Error(`E_SENSITIVE: ${basename(resolve(target))} 是敏感凭据文件，工具拒绝读写`)
  }
}
