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
 * 通配匹配的对外面（工单 13.5）：子代理预设档的**工具名 pattern** 复用同一语义
 * （`*` 单段 / `**` 跨段）——单一来源，不另写一份匹配器。
 */
export function patternMatches(pattern: string, value: string): boolean {
  return matches(pattern, value)
}

/**
 * 评估：**层内 findLast、层间 deny 优先**（工单 LA-02 收口，推翻旧的"全部扁平化
 * 后 findLast"——那使项目级 allow 可覆盖用户级 deny，而项目级 permissions.json
 * 可随仓库传播，等于第三方文件压过用户明写的拒绝）。
 * 层序由调用方决定（低→高：用户级 → 项目级 → 会话临时 → 档位预设）；
 * 层内后匹配者胜（opencode 语义保留）；**任一层判 deny 则终判 deny**——
 * deny 是权威否决，优先于层序（档位预设的 plan 兜底 deny 行为不受影响：
 * 其 allow 行在层内 findLast 仍可胜过同层更早的 deny）。无命中默认 'ask'。
 */
export function evaluate(
  action: string,
  resource: string,
  ...rulesets: readonly (readonly PermissionRule[])[]
): Effect {
  let verdict: Effect | undefined
  for (const rules of rulesets) {
    let layerEffect: Effect | undefined
    for (const rule of rules) {
      if (matches(rule.action, action) && matches(rule.resource, resource)) {
        layerEffect = rule.effect
      }
    }
    if (layerEffect === 'deny') return 'deny'
    if (layerEffect !== undefined) verdict = layerEffect
  }
  return verdict ?? 'ask'
}

/**
 * 多 pattern 汇总（§5.7 补强 1，工单 4.7）：任一 deny → deny（fail-closed 短路）；
 * 否则任一 ask → ask；全部 allow → allow。
 */
export function evaluateAll(
  action: string,
  resources: readonly string[],
  ...rulesets: readonly (readonly PermissionRule[])[]
): Effect {
  let worst: Effect = 'allow'
  for (const resource of resources) {
    const effect = evaluate(action, resource, ...rulesets)
    if (effect === 'deny') return 'deny'
    if (effect === 'ask') worst = 'ask'
  }
  return worst
}
