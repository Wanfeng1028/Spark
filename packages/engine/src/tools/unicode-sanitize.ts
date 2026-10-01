/**
 * Unicode 隐写防御（CK-9，设计照 Claude Code sanitization.ts 重写——HackerOne
 * #3086545：ASCII smuggling 经 MCP 内容注入的真实案例）：
 * NFKC 归一化 + 剥不可见字符（Cf 格式符 / Co 私用区 / Cn 未分配 + 零宽/方向
 * 控制显式范围）+ 迭代上限（NFKC 重排理论上 1-2 轮收敛，上限兜底）。
 * 纯函数、无依赖——接入面：IoGuard（全部工具输出，含 bash/MCP/browser/memory）
 * 与 MCP callTool 入参（模型 → 外部 server 方向）。
 * 静默消毒纪律：被剥字符按定义不可见，剥除不改变可见内容——不发 io.warning
 * （warning 词表是 injection/secret 封闭集，不为静默改善扩协议面）。
 */

/** 迭代上限（照 Claude Code 同值：10） */
export const UNICODE_SANITIZE_MAX_PASSES = 10

/** 不可见字符集：Cf 格式符（含 ZWJ/零宽/方向）、Co 私用区、Cn 未分配 + 显式兜底范围 */
const INVISIBLE_RE = /[\p{Cf}\p{Co}\p{Cn}\u200B-\u200F\u202A-\u202E\u2066-\u2069]/gu

export interface SanitizeUnicodeResult {
  text: string
  /** 被剥除的不可见字符总数（NFKC 归一化产生的变化不计——那不是"剥除"） */
  removed: number
}

/**
 * 全角 ASCII 形式（FF01-FF5E）中**仅字母与数字**映射回 ASCII——藏匿面（全角字母
 * 数字拼指令绕过注入检测）照旧归一；**全角标点不动**（NFKC 会把中文全角冒号/
 * 逗号半角化，破坏正常中文文本——CI 实测判例）。
 */
function normalizeFullwidthAscii(text: string): string {
  return text.replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )
}

/** 单字符串消毒：全角字母数字归一 → 剥不可见 → 收敛判定（结果不再变化即停；上限兜底） */
export function sanitizeUnicode(text: string): SanitizeUnicodeResult {
  let current = text
  let removed = 0
  for (let pass = 0; pass < UNICODE_SANITIZE_MAX_PASSES; pass++) {
    const normalized = normalizeFullwidthAscii(current)
    let passRemoved = 0
    const cleaned = normalized.replace(INVISIBLE_RE, () => {
      passRemoved += 1
      return ''
    })
    removed += passRemoved
    if (cleaned === current) return { text: cleaned, removed }
    current = cleaned
  }
  // 上限未收敛（构造性输入）：以最后一次结果为准——NFKC 幂等，剥除后长度单调不增，
  // 实务上 1-2 轮收敛，10 轮是防御深度不是常规路径
  return { text: current, removed }
}

/** 深度消毒：递归处理对象/数组/键/字符串值（Claude Code recursivelySanitizeUnicode 同语义） */
export function sanitizeUnicodeDeep<T>(value: T): { value: T; removed: number } {
  let deepRemoved = 0
  function deep(v: unknown): unknown {
    if (typeof v === 'string') {
      const r = sanitizeUnicode(v)
      deepRemoved += r.removed
      return r.text
    }
    if (Array.isArray(v)) return v.map(deep)
    if (v !== null && typeof v === 'object') {
      const proto: unknown = Object.getPrototypeOf(v)
      if (proto === Object.prototype || proto === null) {
        const out: Record<string, unknown> = {}
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          const kr = sanitizeUnicode(k)
          deepRemoved += kr.removed
          out[kr.text] = deep(val)
        }
        return out
      }
    }
    return v
  }
  return { value: deep(value) as T, removed: deepRemoved }
}
