/**
 * spark skill init（工单 15.3）：生成 skill.json 骨架 + README 模板——纯 node 脚手架。
 * 用法：pnpm --filter @spark/skill-kit init <dir> [--name <skill-name>]
 * 防覆盖：目标目录已有 skill.json / README.md 一律拒绝（不覆盖既有文件——与文件删除
 * 保护同族的写纪律）；骨架产出交由 lint 校验（单测覆盖"init 产出过 lint"）。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { SKILL_NAME_RE, skeletonFiles } from '../src/lib.js'

const argv = process.argv.slice(2)
const dirArg = argv[0]
const nameIndex = argv.indexOf('--name')

if (dirArg === undefined || dirArg === '') {
  process.stderr.write('用法：pnpm --filter @spark/skill-kit init <dir> [--name <skill-name>]\n')
  process.exit(1)
}

const dir = resolve(dirArg)
const name = nameIndex !== -1 ? (argv[nameIndex + 1] ?? '') : basename(dir)
if (!SKILL_NAME_RE.test(name)) {
  process.stderr.write(
    `E_SKILL_NAME: skill 名 "${name}" 不合法——须为小写字母/数字开头的小写字母-数字-连字符串（skill.json name 字段同规则）\n`,
  )
  process.exit(1)
}

for (const file of ['skill.json', 'README.md']) {
  if (existsSync(join(dir, file))) {
    process.stderr.write(`E_INIT_EXISTS: ${join(dir, file)} 已存在——init 不覆盖既有文件，请换目录或先人工处理\n`)
    process.exit(1)
  }
}

mkdirSync(dir, { recursive: true })
for (const [file, content] of Object.entries(skeletonFiles(name))) {
  writeFileSync(join(dir, file), content)
}

process.stdout.write(
  `已生成 ${dir}/skill.json 与 README.md（skill 名：${name}）。\n下一步：\n` +
    `  1. pnpm --filter @spark/skill-kit lint ${dir}\n` +
    `  2. 放到引擎数据根 skills/ 下（缺省 ~/.spark/skills/${name}/）\n` +
    `  3. 重启引擎后 GET /api/skills 验证\n`,
)
