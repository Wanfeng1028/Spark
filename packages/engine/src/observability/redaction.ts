/**
 * 脱敏正则单一来源（doc/02 §5.10 三层 + 工单 7.2 复用）：
 * logger（日志面）与 tools/guard（模型输入面）共用同一组模式，
 * 防"日志脱敏了、工具输出进上下文却没脱"的双标漂移。
 */
export const SECRET_RE = /sk-[A-Za-z0-9]{20,}/g
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
