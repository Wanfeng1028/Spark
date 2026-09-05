/**
 * grep 工具单测（阶段十二工单 12.1 / new-tool 流程第 7 步）：
 * 四路径——命中 / 零命中 / 越界 E_PATH_OUTSIDE / 限界截断，
 * 另含 glob 过滤、二进制跳过与非法正则 E_BAD_PATTERN。
 * 管线级（审批域）集成在 pipeline.test.ts 既有覆盖（fs.read 域同 read 工具）。
 */
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { ToolContext } from '../src/tools/definition.js'
import { grepTool, type GrepResult } from '../src/tools/builtin/grep.js'

async function makeCwd(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'spark-grep-'))
  return cwd
}

function makeCtx(cwd: string): ToolContext {
  return {
    sessionId: ids.session('ses_greptest'),
    turnId: ids.turn('trn_greptest'),
    callId: ids.call('cal_greptest'),
    signal: new AbortController().signal,
    onProgress: () => undefined,
    cwd,
  }
}

describe('grep（工单 12.1）', () => {
  test('命中：递归多文件 + 行号 + 相对路径 posix', async () => {
    const cwd = await makeCwd()
    await mkdir(join(cwd, 'src'), { recursive: true })
    await writeFile(join(cwd, 'src', 'a.ts'), 'const E_FAIL_CLOSED = 1\nconst ok = 2\n', 'utf8')
    await writeFile(join(cwd, 'b.md'), '引用 E_FAIL_CLOSED 的文档\n', 'utf8')
    await mkdir(join(cwd, 'skipme'), { recursive: true })
    await writeFile(join(cwd, 'skipme', 'x.ts'), '记录 E_FAIL_CLOSED 的普通目录（不在名单内）\n', 'utf8')

    const r = await grepTool.execute(makeCtx(cwd), { pattern: 'E_FAIL_CLOSED' })
    expect(r.isError).toBe(false)
    const out = r.output as GrepResult
    expect(out.truncated).toBe(false)
    // 顺序断言松绑为集合断言（readdir 顺序平台差异不属本用例契约）
    expect(out.matches).toHaveLength(3)
    expect(out.matches).toContainEqual({ file: 'src/a.ts', line: 1, text: 'const E_FAIL_CLOSED = 1' })
    expect(out.matches).toContainEqual({ file: 'b.md', line: 1, text: '引用 E_FAIL_CLOSED 的文档' })
    expect(out.matches).toContainEqual({ file: 'skipme/x.ts', line: 1, text: '记录 E_FAIL_CLOSED 的普通目录（不在名单内）' })
  })

  test('零命中：空 matches 不截断', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'a.txt'), 'nothing here\n', 'utf8')
    const r = await grepTool.execute(makeCtx(cwd), { pattern: '不存在的内容xyz' })
    expect(r.isError).toBe(false)
    expect(r.output).toEqual({ matches: [], truncated: false })
  })

  test('越界：path 逃逸 cwd → E_PATH_OUTSIDE（硬边界先于审批）', async () => {
    const cwd = await makeCwd()
    await expect(
      grepTool.execute(makeCtx(cwd), { pattern: 'x', path: '../../etc/passwd' }),
    ).rejects.toThrow('E_PATH_OUTSIDE')
  })

  test('限界截断：maxResults=1 且两处命中 → truncated=true', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'a.txt'), 'hit one\nhit two\n', 'utf8')
    const r = await grepTool.execute(makeCtx(cwd), { pattern: 'hit', maxResults: 1 })
    const out = r.output as GrepResult
    expect(out.matches).toHaveLength(1)
    expect(out.truncated).toBe(true)
  })

  test('glob 过滤：*.md 只查 markdown', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'a.ts'), 'target in ts\n', 'utf8')
    await writeFile(join(cwd, 'b.md'), 'target in md\n', 'utf8')
    const r = await grepTool.execute(makeCtx(cwd), { pattern: 'target', glob: '*.md' })
    const out = r.output as GrepResult
    expect(out.matches).toEqual([{ file: 'b.md', line: 1, text: 'target in md' }])
  })

  test('跳过名单：node_modules 与 .git 不入扫；二进制 NUL 文件跳过', async () => {
    const cwd = await makeCwd()
    await mkdir(join(cwd, 'node_modules', 'dep'), { recursive: true })
    await writeFile(join(cwd, 'node_modules', 'dep', 'i.js'), 'target hidden\n', 'utf8')
    await mkdir(join(cwd, '.git'), { recursive: true })
    await writeFile(join(cwd, '.git', 'config'), 'target hidden\n', 'utf8')
    await writeFile(join(cwd, 'bin.dat'), Buffer.from([0x00, 0x01, 0x02]), 'utf8')
    const r = await grepTool.execute(makeCtx(cwd), { pattern: 'target' })
    expect(r.output).toEqual({ matches: [], truncated: false })
  })

  test('非法正则 → E_BAD_PATTERN', async () => {
    const cwd = await makeCwd()
    await expect(grepTool.execute(makeCtx(cwd), { pattern: '([unclosed' })).rejects.toThrow(
      'E_BAD_PATTERN',
    )
  })
})
