/**
 * 提示词模板装载与渲染（工单 13.3 / V2-16）：三处硬编码提示词（base / compaction / title）
 * 可经 spark.json 的 `prompts` 段指向模板文件覆盖；缺省 = 引擎内置模板，渲染结果逐字节不变。
 *
 * 纪律：
 * - 占位符白名单是封闭集（单一来源 = protocol PROMPT_PLACEHOLDERS）；非白名单 `{{...}}`、
 *   模板文件缺失、读取失败一律 ConfigError（E_CONFIG）——宁拒启动不静默降级（ARCHITECTURE §9.2）。
 * - 模板在引擎构造期装载一次（重启档语义，同 D28 的构造期注入类）；**渲染在使用点**——
 *   `{{model}}` 随路由档/会话级换模型热变化，构造期渲染会把旧模型名冻进提示词（假状态）。
 * - 提示词不进事件流、不进日志（§5.11 既有口径），本模块也不打印模板内容。
 */
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { platform } from 'node:os'
import { PROMPT_PLACEHOLDERS, type SettingsPrompts } from '@spark/protocol'
import { ConfigError } from './config.js'
import { errText } from './errs.js'

/** 三处可配提示词（值 = 模板原文，未渲染） */
export interface PromptTemplates {
  base: string
  compaction: string
  title: string
}

/** 渲染变量（platform 由本模块自取——三处使用点不必各传一遍） */
export interface PromptVars {
  cwd: string
  /** `provider/model` 形式（与 SessionMeta.model 同口径） */
  model: string
}

const KNOWN_PLACEHOLDERS = new Set<string>(PROMPT_PLACEHOLDERS)

/** 任何 `{{...}}`（不跨嵌套）——逐个查白名单，非白名单即拒启动 */
const ANY_PLACEHOLDER = /\{\{[^{}]*\}\}/g

/**
 * 装载三处模板：未配置的键沿用 defaults；配置的路径相对 `dir`（= spark.json 所在目录，
 * 缺省 ~/.spark），绝对路径原样用。任一文件读不到或含非白名单占位符 → ConfigError。
 */
export function loadPromptTemplates(
  dir: string,
  prompts: SettingsPrompts | undefined,
  defaults: PromptTemplates,
): PromptTemplates {
  if (prompts === undefined) return defaults
  return {
    base: readTemplate(dir, prompts.base, defaults.base, 'prompts.base'),
    compaction: readTemplate(dir, prompts.compaction, defaults.compaction, 'prompts.compaction'),
    title: readTemplate(dir, prompts.title, defaults.title, 'prompts.title'),
  }
}

function readTemplate(
  dir: string,
  path: string | undefined,
  fallback: string,
  key: string,
): string {
  if (path === undefined) return fallback
  const abs = isAbsolute(path) ? path : join(dir, path)
  let raw: string
  try {
    raw = readFileSync(abs, 'utf8')
  } catch (err) {
    throw new ConfigError(`${key} 模板文件读取失败（${abs}）：${errText(err)}`)
  }
  assertPlaceholders(raw, key)
  return raw
}

/** 占位符校验：非白名单 `{{...}}`（含带空格的 `{{ cwd }}`）→ E_CONFIG，防注入面扩大 */
export function assertPlaceholders(template: string, source: string): void {
  for (const m of template.matchAll(ANY_PLACEHOLDER)) {
    if (!KNOWN_PLACEHOLDERS.has(m[0])) {
      throw new ConfigError(
        `${source} 含非白名单占位符 ${m[0]}（白名单：${PROMPT_PLACEHOLDERS.join(' ')}）`,
      )
    }
  }
}

/** 渲染：三个白名单占位符精确替换；无占位符时原样返回（缺省模板逐字节不变的保证点） */
export function renderPromptTemplate(template: string, vars: PromptVars): string {
  return template
    .replaceAll('{{cwd}}', vars.cwd)
    .replaceAll('{{model}}', vars.model)
    .replaceAll('{{platform}}', platform())
}
