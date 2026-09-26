/**
 * 脱敏正则单一来源（doc/02 §5.10 三层 + 工单 7.2 复用）：
 * logger（日志面）与 tools/guard（模型输入面）共用同一组模式，
 * 防"日志脱敏了、工具输出进上下文却没脱"的双标漂移。
 */
export const SECRET_RE = /sk-[A-Za-z0-9_-]{20,}/g
export const BEARER_RE = /Bearer\s+\S+/g
export const REPLACEMENT = '***'

/** 转义正则特殊字符（用于 env/store 值精确匹配） */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 收集需脱敏的环境变量值正则（长度 ≥ 6 防误伤普通短值） */
export function buildEnvPatterns(
  env: Record<string, string | undefined> = process.env,
): readonly RegExp[] {
  const out: RegExp[] = []
  for (const [, v] of Object.entries(env)) {
    if (!v || v.length < 6) continue
    try {
      out.push(new RegExp(escapeRegex(v), 'g'))
    } catch {
      // 非法模式跳过（极罕见）
    }
  }
  return out
}

/**
 * 文本脱敏（AUD-06）：事件发射路径的兜底——error 事件文案可能回显 provider 错误体
 * （含 Authorization 头 / sk- 密钥原文），而脱敏单一来源的消费方只有 logger/audit/
 * guard 三处，run-loop 的 error emit 不在覆盖内。与 guard 同一模式集（sk- / Bearer /
 * env 值），防"日志脱敏了、事件流没脱"的双标漂移。extra 供调用方追加精确匹配。
 */
export function redactSecretText(text: string, extra?: readonly RegExp[]): string {
  let out = text.replace(SECRET_RE, REPLACEMENT).replace(BEARER_RE, `Bearer ${REPLACEMENT}`)
  for (const re of extra ?? []) {
    out = out.replace(re, REPLACEMENT)
  }
  return out
}

/**
 * LA-34（AUD-06 残留收口）：error 事件单点脱敏的完整模式集——env 活取 + 密钥仓值
 * 活取 + 静态形状。secretValues 每次调用现取（store 可经 API 运行时变更，不能构造期
 * 快照）；resolveApiKey 优先级 store > env，store 值此前不在 run-loop 的兜底覆盖内。
 */
export function redactErrorMessage(
  message: string,
  secretValues: Iterable<string | undefined> = [],
): string {
  const extra: RegExp[] = [...buildEnvPatterns()]
  for (const v of secretValues) {
    if (!v || v.length < 6) continue
    try {
      extra.push(new RegExp(escapeRegex(v), 'g'))
    } catch {
      // 非法模式跳过（与 buildEnvPatterns 同判）
    }
  }
  return redactSecretText(message, extra)
}
