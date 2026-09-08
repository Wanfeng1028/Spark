/**
 * 任务级场景定义（工单 13.1 第三批）：单轮场景拆成 seed / prompt / judge / scripted 四段单一来源，
 * 两个驱动共用同一份定义——
 * - scenarios.ts：真实模型驱动（--real --suite tasks），judge 判模型真实产物；
 * - smoke.ts：ScriptedLlm 驱动（core 套件，CI 无 key 也跑），预录终态工具调用后 judge 必须 pass，
 *   且未修状态下 judge 必须 fail——判分函数双向确定性自测（doc/08 §13.1 验收第 1 条）。
 * 交互类四维（审批拒绝 2 / 压缩中途 2）不进本表：它们的流程含人工回复与多轮压缩，
 * 由 core 套件既有 ScriptedLlm 场景覆盖同语义（approval/default-ask-and-reject、
 * compaction/manual-compact-reprojection），本表只收单轮任务。
 */
import { execFileSync } from 'node:child_process'
import { ids, type SparkEventEnvelope } from '@spark/protocol'
import type { PermissionRule } from '@spark/engine'
import type { ScriptedStep } from '@spark/engine/internal'
import { fail, pass, type EvalOutcome } from '../harness.js'
import { seedSampleRepo, type FixtureRepo } from './fixtures.js'

export interface TaskDef {
  /** 场景标识（ASCII，报告与 nightly 日志的锚点） */
  name: string
  /** 预置 fixture 仓库 */
  seed: (repo: FixtureRepo) => void
  /** 发给模型的任务指令 */
  prompt: string
  /** 判分：只看仓库终态与最终应答文本（确定性，不许"看起来对"） */
  judge: (repo: FixtureRepo, answer: string) => EvalOutcome
  /** 预录终态：ScriptedLlm 冒烟用（写类场景直写终态文件，不依赖 edit 的 oldString 精确匹配） */
  scripted: () => ScriptedStep[]
}

/**
 * fixture 作用域规则：读/写/bash 全放行（临时目录 + 无人值守必需）。
 * 资源 pattern 用 `file:**` 而非拼仓库绝对路径：Windows 下 resolveInRoot 出来的资源是反斜杠路径，
 * 而 pattern 里的 `/` 是字面量——拼路径会匹配不上而落缺省 ask（挂到 permissionTimeoutMs）。
 * 不担心过宽：工具侧 resolveInRoot 硬边界已把可触及范围锁在会话 cwd（=fixture 仓库）内。
 */
export function fixtureRules(): PermissionRule[] {
  return [
    { action: 'fs.read', resource: 'file:**', effect: 'allow' },
    { action: 'fs.write', resource: 'file:**', effect: 'allow' },
    { action: 'shell.exec', resource: 'cmd:**', effect: 'allow' },
  ]
}

/** 在 fixture 仓库内跑 node（判分用：不信任模型自述"已跑绿"，独立重跑一次） */
export function runInRepo(repo: FixtureRepo, args: string[]): { ok: boolean; out: string } {
  try {
    return {
      ok: true,
      // stdio 三项显式给全：子进程 stderr 不透到父进程（否则负向自检的报错栈污染 eval 报告）
      out: execFileSync(process.execPath, args, {
        cwd: repo.root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    }
  } catch (err) {
    // execFileSync 非零退出把子进程输出挂在错误对象上（只取展示用的两段）
    const e = err as { stdout?: string; stderr?: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.slice(0, 300) }
  }
}

/** 事件流里的最终应答文本（assistant.message 的 text 块拼接；两个驱动共用） */
export function collectAnswerText(events: SparkEventEnvelope[], base = 0): string {
  const texts: string[] = []
  for (const e of events.slice(base)) {
    if (e.type !== 'assistant.message') continue
    const data = (e as SparkEventEnvelope<'assistant.message'>).data
    for (const c of data.content) {
      if (c.type === 'text' && c.text !== '') texts.push(c.text)
    }
  }
  return texts.join('\n')
}

/** 预录「读文件 → 回答」两步（答问类场景） */
function scriptReadAnswer(path: string, answer: string, callBase: string): ScriptedStep[] {
  return [
    {
      content: [{ type: 'toolCall', callId: ids.call(`${callBase}-0`), name: 'read', input: { path } }],
    },
    { deltas: [{ kind: 'text', text: answer }] },
  ]
}

/** 预录「写终态文件 → 收尾」两步（修改类场景；write 串行执行，多文件一步给全） */
function scriptWrites(files: ReadonlyArray<readonly [string, string]>, callBase: string): ScriptedStep[] {
  return [
    {
      content: files.map(([path, content], i) => ({
        type: 'toolCall' as const,
        callId: ids.call(`${callBase}-${i}`),
        name: 'write',
        input: { path, content },
      })),
    },
    { deltas: [{ kind: 'text', text: '完成' }] },
  ]
}

export const taskDefs: TaskDef[] = [
  // ---------- 维度一：读代码→答问 ----------
  {
    name: 'task/read-code-answer',
    seed: seedSampleRepo,
    prompt: '读 src/calc.ts，回答：div 函数在除数为零时抛出的错误码是什么？只回答错误码本身。',
    judge: (_repo, answer) =>
      answer.includes('E_DIV_ZERO')
        ? pass('正确答出错误码')
        : fail(`应答未含 E_DIV_ZERO：${answer.slice(0, 160)}`),
    scripted: () => scriptReadAnswer('src/calc.ts', 'E_DIV_ZERO', 'smoke-read-code'),
  },
  {
    name: 'task/read-structure',
    seed: seedSampleRepo,
    prompt: '列出本仓库 src/ 目录下的文件名（不含扩展名也要列），用逗号分隔。',
    judge: (_repo, answer) =>
      answer.includes('calc') && answer.includes('format')
        ? pass('正确列出两个模块')
        : fail(`应答缺模块名：${answer.slice(0, 160)}`),
    scripted: () => scriptReadAnswer('src/calc.ts', 'calc, format', 'smoke-read-structure'),
  },
  {
    name: 'task/read-doc-grep',
    seed: (repo) => {
      seedSampleRepo(repo)
      repo.write('docs/notes.md', '约定：所有错误一律使用 E_ 前缀错误码。\n')
    },
    prompt: 'docs/notes.md 里约定的错误码前缀是什么？只回答前缀。',
    judge: (_repo, answer) =>
      answer.includes('E_') ? pass('正确答出前缀约定') : fail(`应答未含 E_ 前缀：${answer.slice(0, 160)}`),
    scripted: () => scriptReadAnswer('docs/notes.md', 'E_', 'smoke-read-doc'),
  },

  // ---------- 维度二：单文件修改 ----------
  {
    name: 'task/edit-single-file',
    seed: seedSampleRepo,
    prompt: '修改 src/format.ts：给 slugify 增加对空字符串输入返回空串的保护（s === "" 时直接返回 ""）。',
    judge: (repo, answer) => {
      const src = repo.read('src/format.ts')
      if (src === undefined) return fail('src/format.ts 不存在（被判分读取）')
      if (src.includes("''") && src.includes('s ===')) return pass(`已加保护：${answer.slice(0, 80)}`)
      return fail('slugify 未出现空串保护分支')
    },
    scripted: () =>
      scriptWrites(
        [
          [
            'src/format.ts',
            [
              'export function slugify(s: string): string {',
              "  if (s === '') return ''",
              "  return s.trim().toLowerCase().replaceAll(' ', '-')",
              '}',
              '',
            ].join('\n'),
          ],
        ],
        'smoke-edit-single',
      ),
  },
  {
    name: 'task/create-new-file',
    seed: seedSampleRepo,
    prompt: '新建 src/answer.ts，导出一个常量 MAGIC = 42（TypeScript，带 export）。',
    judge: (repo, answer) => {
      const src = repo.read('src/answer.ts')
      if (src !== undefined && src.includes('42') && src.includes('export')) {
        return pass(`answer.ts 创建且导出 42：${answer.slice(0, 60)}`)
      }
      return fail('src/answer.ts 未创建或缺 MAGIC 导出')
    },
    scripted: () => scriptWrites([['src/answer.ts', 'export const MAGIC = 42\n']], 'smoke-create-file'),
  },
  {
    name: 'task/edit-off-by-one',
    seed: (repo) => {
      repo.write(
        'src/range.ts',
        [
          'export function range(n: number): number[] {',
          '  const out: number[] = []',
          '  for (let i = 0; i <= n; i++) out.push(i)',
          '  return out',
          '}',
          '',
        ].join('\n'),
      )
    },
    prompt: 'src/range.ts 的 range(n) 应该返回 n 个元素（0 到 n-1），现在多返一个。只改这一处循环边界，修好它。',
    judge: (repo, answer) => {
      const src = repo.read('src/range.ts')
      if (src === undefined) return fail('src/range.ts 不存在')
      if (src.includes('i <= n')) return fail('边界未修（仍为 i <= n）')
      if (!src.includes('i < n')) return fail(`未改成预期边界 i < n：${src.slice(0, 160)}`)
      return pass(`off-by-one 已修（i < n）：${answer.slice(0, 60)}`)
    },
    scripted: () =>
      scriptWrites(
        [
          [
            'src/range.ts',
            [
              'export function range(n: number): number[] {',
              '  const out: number[] = []',
              '  for (let i = 0; i < n; i++) out.push(i)',
              '  return out',
              '}',
              '',
            ].join('\n'),
          ],
        ],
        'smoke-off-by-one',
      ),
  },
  {
    name: 'task/edit-add-function',
    seed: seedSampleRepo,
    prompt:
      '在 src/format.ts 里新增一个导出函数 capitalize(s: string): string，返回首字母大写、其余不变的字符串（空串原样返回）。不要改已有的 slugify。',
    judge: (repo, answer) => {
      const src = repo.read('src/format.ts')
      if (src === undefined) return fail('src/format.ts 不存在')
      if (!src.includes('export function capitalize')) return fail('未新增导出 capitalize')
      if (!src.includes('slugify')) return fail('原有 slugify 被误删')
      return pass(`capitalize 已新增且 slugify 保留：${answer.slice(0, 60)}`)
    },
    scripted: () =>
      scriptWrites(
        [
          [
            'src/format.ts',
            [
              'export function slugify(s: string): string {',
              "  return s.trim().toLowerCase().replaceAll(' ', '-')",
              '}',
              '',
              'export function capitalize(s: string): string {',
              "  if (s === '') return ''",
              '  return s[0].toUpperCase() + s.slice(1)',
              '}',
              '',
            ].join('\n'),
          ],
        ],
        'smoke-add-function',
      ),
  },

  // ---------- 维度三：bash 调试修复 ----------
  {
    name: 'task/bash-debug',
    seed: (repo) => {
      seedSampleRepo(repo)
      repo.write(
        'test/broken.mjs',
        ['const x = 1', 'x = 2 // TypeError: Assignment to constant variable.', ''].join('\n'),
      )
    },
    prompt: '运行 node test/broken.mjs 会报错。读该文件找出原因并修复它（改成能跑通的等价逻辑），修复后重跑确认退出码 0。',
    judge: (repo, answer) => {
      const fixed = repo.read('test/broken.mjs')
      if (fixed !== undefined && !fixed.includes('const x = 1')) {
        return pass(`已修复常量赋值错误：${answer.slice(0, 80)}`)
      }
      return fail('broken.mjs 未被修复（仍含对 const 的再赋值）')
    },
    scripted: () =>
      scriptWrites(
        [['test/broken.mjs', ['let x = 1', 'x = 2', 'console.log(x)', ''].join('\n')]],
        'smoke-bash-debug',
      ),
  },
  {
    name: 'task/bash-syntax-error',
    seed: (repo) => {
      seedSampleRepo(repo)
      // 缺右括号 = SyntaxError；修好后应打印 OK
      repo.write('scripts/broken.mjs', ["console.log('OK'", ''].join('\n'))
    },
    prompt: '运行 node scripts/broken.mjs 会报语法错误。修好该文件，使它执行后向标准输出打印 OK（退出码 0），修完重跑确认。',
    judge: (repo, answer) => {
      const ran = runInRepo(repo, ['scripts/broken.mjs'])
      if (!ran.ok) return fail(`修复后仍不能执行：${ran.out}`)
      if (!ran.out.includes('OK')) return fail(`执行成功但未打印 OK：${ran.out.slice(0, 120)}`)
      return pass(`语法错误已修，独立重跑退出码 0 且输出 OK：${answer.slice(0, 60)}`)
    },
    scripted: () =>
      scriptWrites([['scripts/broken.mjs', "console.log('OK')\n"]], 'smoke-bash-syntax'),
  },
  {
    name: 'task/bash-make-tests-pass',
    seed: (repo) => {
      // .mjs 夹具：不依赖 Node 类型剥离开关，判分在任何 Node 24 上确定
      repo.write(
        'src/sum.mjs',
        [
          'export function sumTo(n) {',
          '  let total = 0',
          '  for (let i = 1; i < n; i++) total += i',
          '  return total',
          '}',
          '',
        ].join('\n'),
      )
      repo.write(
        'test/sum.test.mjs',
        [
          "import { test } from 'node:test'",
          "import { strict as assert } from 'node:assert'",
          "import { sumTo } from '../src/sum.mjs'",
          '',
          "test('sumTo(3) = 6', () => {",
          '  assert.equal(sumTo(3), 6)',
          '})',
          '',
        ].join('\n'),
      )
    },
    prompt:
      '在仓库根目录运行 node --test test/sum.test.mjs 会有一个用例失败。修复 src/sum.mjs（不要改测试文件）使全部用例通过，然后重跑确认。',
    judge: (repo, answer) => {
      // 显式测试文件路径（不用 `--test test/`）：Windows 下目录参数与尾斜杠会被当模块路径解析
      const ran = runInRepo(repo, ['--test', 'test/sum.test.mjs'])
      if (!ran.ok) return fail(`测试仍不绿：${ran.out}`)
      if (ran.out.includes('fail 1') || ran.out.includes('# fail')) {
        return fail(`输出仍含失败用例：${ran.out.slice(0, 200)}`)
      }
      return pass(`独立重跑 node --test 全绿：${answer.slice(0, 60)}`)
    },
    scripted: () =>
      scriptWrites(
        [
          [
            'src/sum.mjs',
            [
              'export function sumTo(n) {',
              '  let total = 0',
              '  for (let i = 1; i <= n; i++) total += i',
              '  return total',
              '}',
              '',
            ].join('\n'),
          ],
        ],
        'smoke-bash-tests',
      ),
  },

  // ---------- 维度五：多文件重构 ----------
  {
    name: 'task/refactor-rename-across-files',
    seed: (repo) => {
      seedSampleRepo(repo)
      repo.write(
        'src/index.ts',
        ["export { slugify } from './format.ts'", '', "console.log(slugify('Hello World'))", ''].join('\n'),
      )
      repo.write(
        'test/format.test.ts',
        [
          "import { test } from 'node:test'",
          "import { strict as assert } from 'node:assert'",
          "import { slugify } from '../src/format.ts'",
          '',
          "test('format', () => {",
          "  assert.equal(slugify('A B'), 'a-b')",
          '})',
          '',
        ].join('\n'),
      )
    },
    prompt:
      '把 src/format.ts 中的 slugify 函数重命名为 toSlug，并同步更新仓库内所有引用它的文件（src/index.ts 与 test/format.test.ts）。',
    judge: (repo, answer) => {
      const files = ['src/format.ts', 'src/index.ts', 'test/format.test.ts']
      const missing = files.filter((f) => repo.read(f) === undefined)
      if (missing.length > 0) return fail(`文件缺失：${missing.join(', ')}`)
      const stale = files.filter((f) => (repo.read(f) ?? '').includes('slugify'))
      if (stale.length > 0) return fail(`旧名 slugify 残留：${stale.join(', ')}`)
      const renamed = files.filter((f) => (repo.read(f) ?? '').includes('toSlug'))
      if (renamed.length !== files.length) {
        return fail(`toSlug 未覆盖全部三文件（命中 ${renamed.length}/3）`)
      }
      return pass(`三文件重命名一致，无旧名残留：${answer.slice(0, 60)}`)
    },
    scripted: () =>
      scriptWrites(
        [
          [
            'src/format.ts',
            [
              'export function toSlug(s: string): string {',
              "  return s.trim().toLowerCase().replaceAll(' ', '-')",
              '}',
              '',
            ].join('\n'),
          ],
          ['src/index.ts', ["export { toSlug } from './format.ts'", '', "console.log(toSlug('Hello World'))", ''].join('\n')],
          [
            'test/format.test.ts',
            [
              "import { test } from 'node:test'",
              "import { strict as assert } from 'node:assert'",
              "import { toSlug } from '../src/format.ts'",
              '',
              "test('format', () => {",
              "  assert.equal(toSlug('A B'), 'a-b')",
              '})',
              '',
            ].join('\n'),
          ],
        ],
        'smoke-rename',
      ),
  },
  {
    name: 'task/refactor-extract-shared-const',
    seed: (repo) => {
      repo.write(
        'src/retry.ts',
        ['const RETRY_LIMIT = 3', '', 'export function attempts(): number {', '  return RETRY_LIMIT', '}', ''].join('\n'),
      )
      repo.write(
        'src/fetcher.ts',
        ['const RETRY_LIMIT = 3', '', 'export function maxTries(): number {', '  return RETRY_LIMIT + 1', '}', ''].join('\n'),
      )
    },
    prompt:
      '把 src/retry.ts 与 src/fetcher.ts 里重复定义的 RETRY_LIMIT 常量抽到新文件 src/constants.ts 中导出，并让这两个文件改为从 src/constants.ts 导入，不要再各自定义。',
    judge: (repo, answer) => {
      const shared = repo.read('src/constants.ts')
      if (shared === undefined || !shared.includes('RETRY_LIMIT')) {
        return fail('src/constants.ts 未创建或未导出 RETRY_LIMIT')
      }
      const consumers = ['src/retry.ts', 'src/fetcher.ts']
      const notImporting = consumers.filter((f) => !(repo.read(f) ?? '').includes('constants'))
      if (notImporting.length > 0) return fail(`未改为导入 constants：${notImporting.join(', ')}`)
      const stillLocal = consumers.filter((f) => (repo.read(f) ?? '').includes('const RETRY_LIMIT'))
      if (stillLocal.length > 0) return fail(`仍各自定义常量：${stillLocal.join(', ')}`)
      return pass(`常量已单源，两处改为导入：${answer.slice(0, 60)}`)
    },
    scripted: () =>
      scriptWrites(
        [
          ['src/constants.ts', 'export const RETRY_LIMIT = 3\n'],
          [
            'src/retry.ts',
            [
              "import { RETRY_LIMIT } from './constants.ts'",
              '',
              'export function attempts(): number {',
              '  return RETRY_LIMIT',
              '}',
              '',
            ].join('\n'),
          ],
          [
            'src/fetcher.ts',
            [
              "import { RETRY_LIMIT } from './constants.ts'",
              '',
              'export function maxTries(): number {',
              '  return RETRY_LIMIT + 1',
              '}',
              '',
            ].join('\n'),
          ],
        ],
        'smoke-extract-const',
      ),
  },
  {
    name: 'task/refactor-signature-all-callsites',
    seed: (repo) => {
      repo.write(
        'src/math.ts',
        ['export function add(a: number, b: number): number {', '  return a + b', '}', ''].join('\n'),
      )
      repo.write(
        'src/index.ts',
        ["import { add } from './math.ts'", '', 'console.log(add(1, 2))', 'console.log(add(3, 4))', ''].join('\n'),
      )
      repo.write(
        'test/math.test.ts',
        [
          "import { test } from 'node:test'",
          "import { strict as assert } from 'node:assert'",
          "import { add } from '../src/math.ts'",
          '',
          "test('math', () => {",
          '  assert.equal(add(2, 2), 4)',
          '})',
          '',
        ].join('\n'),
      )
    },
    prompt:
      '给 src/math.ts 的 add 增加第三个必填参数 tag: string（函数体内可忽略它），并更新仓库内全部三处调用点，各传一个字符串实参。',
    judge: (repo, answer) => {
      const files = ['src/math.ts', 'src/index.ts', 'test/math.test.ts']
      if (!(repo.read('src/math.ts') ?? '').includes('tag')) return fail('签名未出现 tag 参数')
      // 确定性形状判分：全仓 add(...) 共 4 处（1 定义 + 3 调用），每处至少两个逗号 = 三参
      const hits = files.flatMap((f) => (repo.read(f) ?? '').match(/add\([^)]*\)/g) ?? [])
      if (hits.length !== 4) return fail(`add(...) 出现 ${hits.length} 次（期望 4：1 定义 + 3 调用）`)
      const short = hits.filter((h) => (h.match(/,/g) ?? []).length < 2)
      if (short.length > 0) return fail(`仍有少于三参的定义/调用：${short.join(' | ')}`)
      return pass(`签名与三处调用点全部改为三参：${answer.slice(0, 60)}`)
    },
    scripted: () =>
      scriptWrites(
        [
          [
            'src/math.ts',
            [
              'export function add(a: number, b: number, tag: string): number {',
              '  void tag',
              '  return a + b',
              '}',
              '',
            ].join('\n'),
          ],
          [
            'src/index.ts',
            [
              "import { add } from './math.ts'",
              '',
              "console.log(add(1, 2, 'a'))",
              "console.log(add(3, 4, 'b'))",
              '',
            ].join('\n'),
          ],
          [
            'test/math.test.ts',
            [
              "import { test } from 'node:test'",
              "import { strict as assert } from 'node:assert'",
              "import { add } from '../src/math.ts'",
              '',
              "test('math', () => {",
              "  assert.equal(add(2, 2, 't'), 4)",
              '})',
              '',
            ].join('\n'),
          ],
        ],
        'smoke-signature',
      ),
  },
]
