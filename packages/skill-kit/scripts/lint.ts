/**
 * spark skill lint（工单 15.3）：校验 skill.json——清单字段（@spark/protocol 的
 * SkillManifestSchema，引擎 loader 同源）+ 钩子 on 词表合法性 + emit 声明存在 +
 * data JSON Schema 可转换。输出人话错误，非零退出码。
 * 用法：pnpm --filter @spark/skill-kit lint <skill 目录 | skill.json 路径>
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { lintManifest } from '../src/lib.js'

const argv = process.argv.slice(2)
const target = argv[0]

if (target === undefined || target === '') {
  process.stderr.write('用法：pnpm --filter @spark/skill-kit lint <skill 目录 | skill.json 路径>\n')
  process.exit(1)
}

const abs = resolve(target)
let file: string
if (existsSync(abs) && statSync(abs).isDirectory()) {
  file = join(abs, 'skill.json')
} else if (abs.endsWith('.json')) {
  file = isAbsolute(abs) ? abs : resolve(abs)
} else {
  process.stderr.write(`E_LINT_TARGET: ${abs} 不是目录也不是 .json 路径\n`)
  process.exit(1)
}

if (!existsSync(file)) {
  process.stderr.write(`E_LINT_MISSING: 清单不存在（${file}）\n`)
  process.exit(1)
}

let raw: unknown
try {
  raw = JSON.parse(readFileSync(file, 'utf8'))
} catch (err) {
  process.stderr.write(`E_SKILL_JSON: 清单不是合法 JSON（${err instanceof Error ? err.message : String(err)}）\n`)
  process.exit(1)
}

const result = lintManifest(raw)
if (!result.ok) {
  process.stderr.write(`E_SKILL_INVALID: ${file}\n${result.errors.map((e) => `  - ${e}`).join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`OK：${file}（skill "${result.manifest?.name}"；事件 ${Object.keys(result.manifest?.events ?? {}).length} 个，钩子 ${result.manifest?.hooks?.length ?? 0} 条）\n`)
