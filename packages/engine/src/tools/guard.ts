/**
 * I/O 护栏（doc/02 §8 阶段七工单 7.2 / H02，P0）：
 * 工具输出 → 模型上下文通道上的两道防线（不阻断 turn——告警闭合，非失败闭合）：
 * 1) 注入检测：标记协议 = 结构化规则名（不回传原文，防注入内容经告警二次广播）；
 * 2) 敏感过滤：复用 pino 三层脱敏正则（redaction.ts 单一来源）+ 密钥仓 store 值。
 * 挂点：pipeline.runOne 成功路径输出限界之后（tool.completed 事件与 run-loop
 * toolResult 回填同源——事件流与模型上下文一次过滤两面覆盖）。
 */
import { BEARER_RE, REPLACEMENT, SECRET_RE, buildEnvPatterns, escapeRegex } from '../observability/redaction.js'

/** 注入可疑模式集（保守小集——规则名进事件流，原文不进） */
const INJECTION_RULES: readonly { id: string; re: RegExp }[] = [
  {
    id: 'injection.ignore-instructions',
    re: /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)/i,
  },
  {
    id: 'injection.disregard-context',
    re: /disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|the\s+above)/i,
  },
  {
    id: 'injection.reveal-system',
    re: /(?:reveal|show|print|repeat|output|expose)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules)/i,
  },
  { id: 'injection.fake-tag', re: /<\/?(?:system|assistant|developer)>/i },
  { id: 'injection.role-hijack', re: /you\s+are\s+now\s+(?:a|an)\s+\S/i },
  {
    id: 'injection.exfiltrate',
    re: /(?:api[_\s-]?key|secret|password|access[_\s-]?token)[^\n]{0,40}?(?:send|upload|post|curl|wget|https?\/\/)/i,
  },
]

/** 敏感层名（与 redaction 三层 + store 值对应；规则名进事件流） */
type SecretLayer = 'secret.sk-token' | 'secret.bearer' | 'secret.env-value' | 'secret.store-value'

/** 共享 /g 正则的 test 需先复位 lastIndex（防跨调用状态泄漏漏检） */
function hits(re: RegExp, s: string): boolean {
  re.lastIndex = 0
  return re.test(s)
}

export interface IoWarning {
  kind: 'injection' | 'secret'
  rules: string[]
  /** kind=secret：替换处数 */
  redacted?: number
}

export interface GuardDeps {
  /** 密钥仓值（动态取——setSecret 后即时纳入，7.1 同纪律） */
  secretValues?: () => Iterable<string>
  /** env 注入（仅为可测性；缺省 process.env） */
  env?: Record<string, string | undefined>
}

export class IoGuard {
  private readonly envPatterns: readonly RegExp[]
  private readonly secretValues: (() => Iterable<string>) | undefined

  constructor(deps: GuardDeps = {}) {
    this.envPatterns = buildEnvPatterns(deps.env)
    this.secretValues = deps.secretValues
  }

  /** 输出过滤 + 注入扫描（递归 string 字段；对象形状保留，非字符串原子不动） */
  apply(output: unknown): { output: unknown; warnings: IoWarning[] } {
    const injectionRules = new Set<string>()
    const secretLayers = new Set<SecretLayer>()
    let redacted = 0
    const cleaned = this.sanitize(output, injectionRules, secretLayers, () => {
      redacted += 1
    })
    const warnings: IoWarning[] = []
    if (injectionRules.size > 0) {
      warnings.push({ kind: 'injection', rules: [...injectionRules] })
    }
    if (secretLayers.size > 0) {
      warnings.push({ kind: 'secret', rules: [...secretLayers], redacted })
    }
    return { output: cleaned, warnings }
  }

  private sanitize(
    value: unknown,
    injectionRules: Set<string>,
    secretLayers: Set<SecretLayer>,
    onRedact: () => void,
  ): unknown {
    if (typeof value === 'string') return this.sanitizeString(value, injectionRules, secretLayers, onRedact)
    if (Array.isArray(value)) {
      return value.map((v) => this.sanitize(v, injectionRules, secretLayers, onRedact))
    }
    if (value !== null && typeof value === 'object') {
      const proto: unknown = Object.getPrototypeOf(value)
      if (proto === Object.prototype || proto === null) {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          out[k] = this.sanitize(v, injectionRules, secretLayers, onRedact)
        }
        return out
      }
      // 非 plain object（Error/Map/Buffer…）：保守不动（工具输出约定为 JSON 形状）
      return value
    }
    return value
  }

  private sanitizeString(
    s: string,
    injectionRules: Set<string>,
    secretLayers: Set<SecretLayer>,
    onRedact: () => void,
  ): string {
    for (const rule of INJECTION_RULES) {
      if (hits(rule.re, s)) injectionRules.add(rule.id)
    }
    let out = s
    if (hits(SECRET_RE, s)) {
      out = out.replace(SECRET_RE, REPLACEMENT)
      secretLayers.add('secret.sk-token')
      onRedact()
    }
    if (hits(BEARER_RE, s)) {
      out = out.replace(BEARER_RE, `Bearer ${REPLACEMENT}`)
      secretLayers.add('secret.bearer')
      onRedact()
    }
    for (const re of this.envPatterns) {
      if (hits(re, s)) {
        out = out.replace(re, REPLACEMENT)
        secretLayers.add('secret.env-value')
        onRedact()
      }
    }
    if (this.secretValues !== undefined) {
      for (const v of this.secretValues()) {
        if (!v || v.length < 6) continue
        const re = this.compileSecret(v)
        if (re !== undefined && hits(re, s)) {
          out = out.replace(re, REPLACEMENT)
          secretLayers.add('secret.store-value')
          onRedact()
        }
      }
    }
    return out
  }

  private readonly secretCache = new Map<string, RegExp>()

  private compileSecret(v: string): RegExp | undefined {
    let re = this.secretCache.get(v)
    if (re === undefined) {
      try {
        re = new RegExp(escapeRegex(v), 'g')
        this.secretCache.set(v, re)
      } catch {
        return undefined
      }
    }
    re.lastIndex = 0 // 全局标志复用需复位
    return re
  }
}
