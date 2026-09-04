/**
 * 错误码→人话文案表（工单 6.7 建表 / 工单 8.1 下沉至此 / D22 四端共享资产之一 / doc/07 H14）：
 * 单一来源——server §7.4 全部错误码 + transport/mock 特有码；四端（web/desktop/cli/mobile）
 * 一律从 @spark/protocol 导入。
 * 约定：传输层错误统一形如 "E_CODE: 原始消息"（transport-node req / 各端 mock 同构）；
 * 引擎 error 事件的 message 本就是人话（无码前缀原样返回）。
 * 该形状 Error 的构造亦在此单源：errorFromResponse（工单 R-B 下沉——transport-node req
 * 与 miniapp rest.ts req 两份同构收敛）。
 */

/** 错误码 → 人话文案（title 级，一句可行动的描述） */
export const ERROR_COPY: Record<string, string> = {
  // ---- server §7.4 错误映射表 ----
  E_VALIDATION: '请求参数不合法，请检查输入后重试',
  E_NOT_FOUND: '目标不存在（会话/请求/快照可能已被清理）',
  E_ALREADY_RESOLVED: '该审批已答复过，无需重复操作',
  E_TURN_ACTIVE: '本轮对话仍在进行中，请等待结束后再操作',
  E_TURN_MISMATCH: '要插话的目标轮已变化，请重新发送',
  E_INVALID_BOUNDARY: '所选分叉位置不存在，请刷新会话树后重试',
  E_OPEN_TURN: '本轮对话尚未结束，暂不可分叉',
  E_ALREADY_EXISTS: '目标会话已存在',
  E_CHECKPOINT_ROLLBACK: '回滚失败：git 操作异常，详情见服务端日志',
  E_CONFIG: '模型配置无效：须为已配置供应商的 provider/model',
  E_SHUTTING_DOWN: '引擎正在关闭，请稍后重启应用',
  E_AUTH: '连接未通过鉴权：请重新配对设备或检查 token',
  E_PAIR: '配对码无效或已过期，请在桌面端重新获取',
  E_PAIR_DISABLED: '配对鉴权未启用：请先在桌面端设置页添加设备',
  E_COMMAND_CLIENT: '这是界面命令，由界面执行——不经引擎（检查命令面分派）',
  E_INTERNAL: '服务内部错误，请重试；若持续出现请查看服务端日志',
  // ---- transport / mock 特有 ----
  E_MOCK_UNKNOWN_SESSION: '会话不存在或已被清理',
  E_MOCK_DISPOSED: '演示通道已关闭，请刷新页面',
  E_HTTP_DISPOSED: '连接已释放，请重启应用',
}

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

/** 错误消息 → {title 人话, code, detail 折叠原码} */
export function humanizeError(msg: string): ErrorCopy {
  const { code, rest } = parseCode(msg)
  if (code === null) return { title: msg, code: null, detail: null }
  const copy = ERROR_COPY[code]
  // 命中：title 用文案；未命中：title 用原始消息（保持可读），码进折叠详情
  return {
    title: copy ?? (rest !== '' ? rest : msg),
    code,
    detail: copy !== undefined ? (rest !== '' ? `${code}: ${rest}` : code) : msg,
  }
}

/** unknown 错误 → 人话 title（hint/toast 等纯文本出口用） */
export function errorMessageOf(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return humanizeError(msg).title
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
