/**
 * 错误码→人话文案表（工单 6.7 建表 / 工单 8.1 下沉至此 / D22 四端共享资产之一 / doc/07 H14）：
 * 单一来源——server §7.4 全部错误码 + transport/mock 特有码；四端（web/desktop/cli/mobile）
 * 一律从 @spark/protocol 导入。
 * 约定：传输层错误统一形如 "E_CODE: 原始消息"（transport-node req / 各端 mock 同构）；
 * 引擎 error 事件的 message 本就是人话（无码前缀原样返回）。
 * 该形状 Error 的构造亦在此单源：errorFromResponse（工单 R-B 下沉——transport-node req
 * 与 miniapp rest.ts req 两份同构收敛）。
 */

import { ERROR_COPY_ZH, errorCopyOf, type Language } from './i18n.js'

/**
 * 错误码 → 人话文案（title 级，一句可行动的描述）。
 * 19.17 第二批起本表**由 i18n 的 zh-CN 字典派生**（`ERROR_COPY_ZH`），不再在此并列第二份——
 * 两份表必然漂移，而漂移的表现是"某码在某端显示另一端的旧文案"，很难被注意到。
 * 取其它语言走 `errorCopyOf(code, lang)`；本常量仍是 zh-CN 的公开读面（既有消费者不变）。
 */
export const ERROR_COPY: Record<string, string> = { ...ERROR_COPY_ZH }

export interface ErrorCopy {
  /** 人话文案（表中命中；未命中且无码 = 原始消息） */
  title: string
  /** 命中的错误码（null = 消息无 E_ 前缀） */
  code: string | null
  /** 折叠详情："码: 原始消息"（title 已含信息时仍保留原样供排查） */
  detail: string | null
}

/** 解析 "E_CODE: rest" 前缀（或整条恰为裸码）；无码返回 null */
function parseCode(msg: string): { code: string | null; rest: string } {
  const m = /^([A-Z][A-Z0-9_]{2,})(?::\s*(.*))?$/s.exec(msg)
  if (m === null) return { code: null, rest: msg }
  return { code: m[1] ?? '', rest: m[2] ?? '' }
}

/** 错误消息 → {title 人话, code, detail 折叠原码}。
 *  `lang` 是**尾部可选参数**、缺省 zh-CN：全仓 139 处调用点一行不改，只有渲染点按需传语言
 *  （把 lang 穿到每个调用点就是工单明令禁止的"拆散"）。 */
export function humanizeError(msg: string, lang: Language = 'zh-CN'): ErrorCopy {
  const { code, rest } = parseCode(msg)
  if (code === null) return { title: msg, code: null, detail: null }
  const copy = errorCopyOf(code, lang)
  // 命中：title 用文案；未命中：title 用原始消息（保持可读），码进折叠详情
  return {
    title: copy ?? (rest !== '' ? rest : msg),
    code,
    detail: copy !== undefined ? (rest !== '' ? `${code}: ${rest}` : code) : msg,
  }
}

/** unknown 错误 → 人话 title（hint/toast 等纯文本出口用）；lang 同上为尾部可选参数 */
export function errorMessageOf(err: unknown, lang: Language = 'zh-CN'): string {
  const msg = err instanceof Error ? err.message : String(err)
  return humanizeError(msg, lang).title
}

/**
 * 非 2xx 响应 → `Error("code: message")`（工单 R-B 下沉：transport-node HttpTransport.req
 * 与 miniapp MiniRestClient.req 两份同构收敛单源）。server 错误体（§7.4）{code, message} 字段为 string 则取用，
 * 否则落 `HTTP_<status>` + statusText（Taro 无 statusText，缺省空串即与现状逐字同）。
 * 出口形状与本文件 parseCode 的前缀解析配套——调用方一律经 errorMessageOf/ERROR_COPY 人话化。
 */
export function errorFromResponse(status: number, body: unknown, statusText = ''): Error {
  let code = `HTTP_${status}`
  let message = statusText
  if (typeof body === 'object' && body !== null) {
    const b = body as { code?: unknown; message?: unknown }
    if (typeof b.code === 'string') code = b.code
    if (typeof b.message === 'string') message = b.message
  }
  return new Error(`${code}: ${message}`)
}
