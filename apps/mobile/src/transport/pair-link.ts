/**
 * 配对深链解析（DESIGN §13.J.2.9：QR 内容 `spark://pair?host=<host>&port=<port>&code=<短码>`）。
 * 纯函数——深链（Linking）与手输兜底共用同一解析口径；单独单测（工单 9.2）。
 */

export interface PairLink {
  host: string
  port: number
  /** 6 位数字短码（60s 有效，服务端二次校验） */
  code: string
}

/** 合法主机段：白名单（字母/数字/点/连字符，评审 G7）——黑名单会漏 `:` 与 `\` */
function isValidHost(host: string): boolean {
  return /^[A-Za-z0-9.-]+$/.test(host)
}

/** 仅匹配 `spark://pair?<query>` 形态（不依赖 RN 的 URL 全局——其对自定义 scheme 支持不全） */
const PAIR_LINK_RE = /^spark:\/\/pair\?([^#]*)$/

/** 手工解析查询段（decodeURIComponent 逐对；坏转义返回 null） */
function parseQuery(query: string): Map<string, string> | null {
  const params = new Map<string, string>()
  for (const pair of query.split('&')) {
    if (pair === '') continue
    const eq = pair.indexOf('=')
    const rawKey = eq === -1 ? pair : pair.slice(0, eq)
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1)
    try {
      params.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue))
    } catch {
      return null
    }
  }
  return params
}

/**
 * 解析配对深链；任何不合法（协议/路径/缺参/坏值）一律返回 null——
 * 调用方按"未识别"处理（不做半截配置），失败闭合。
 */
export function parsePairLink(input: string): PairLink | null {
  const m = PAIR_LINK_RE.exec(input.trim())
  if (m === null) return null
  const params = parseQuery(m[1] ?? '')
  if (params === null) return null

  const host = (params.get('host') ?? '').trim()
  const portRaw = (params.get('port') ?? '').trim()
  const code = (params.get('code') ?? '').trim()
  if (host === '' || portRaw === '' || code === '') return null
  if (!isValidHost(host)) return null
  if (!/^\d{1,5}$/.test(portRaw)) return null
  const port = Number(portRaw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  if (!/^\d{6}$/.test(code)) return null

  return { host, port, code }
}

/** 配对参数 → 服务器基址（传输构造共用口径） */
export function baseUrlOf(host: string, port: number): string {
  return `http://${host}:${port}`
}
