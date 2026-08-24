/**
 * 规则评估（doc/02 §5.7.1）：wildcard 匹配 + 多层 rulesets findLast。
 * 层序由调用方决定（服务里是 [用户级, 项目级, 会话临时]——排后者优先）；
 * 无命中默认 'ask'（opencode 语义）。
 * 段 = '/'：* 不跨段；** 跨段。cmd 资源（空格分词）同样适用——
 * 'cmd:git *' 匹配 'cmd:git push origin main'（无斜杠即单段），fail-closed 方向。
 */
import type { PermissionRule } from '../config.js'

export type Effect = 'allow' | 'deny' | 'ask'

/** 正则元字符转义（* 与 ** 已先被拆出，不在此处理） */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** pattern → 正则：** 跨段（.*），* 单段（[^/]*） */
function patternToRegex(pattern: string): RegExp {
  const cross = pattern.split('**')
  const body = cross.map((seg) => seg.split('*').map(escapeRegex).join('[^/]*')).join('.*')
  return new RegExp(`^${body}$`)
}

function matches(pattern: string, value: string): boolean {
  return patternToRegex(pattern).test(value)
}

/**
 * 评估：rulesets 依序扁平化后 findLast 胜出（doc/02 §5.7 补强 4）。
 * 规则的 action 与 resource 都是 pattern，同一匹配器。
 */
export function evaluate(
  action: string,
  resource: string,
  ...rulesets: readonly (readonly PermissionRule[])[]
): Effect {
  let verdict: Effect | undefined
  for (const rules of rulesets) {
    for (const rule of rules) {
      if (matches(rule.action, action) && matches(rule.resource, resource)) {
        verdict = rule.effect
      }
    }
  }
  return verdict ?? 'ask'
}
