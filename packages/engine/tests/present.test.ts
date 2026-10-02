/**
 * present 工具单测（CK-13 批 1）：正常声明（相对路径 resolve + emit 回执）/
 * 不存在文件 E_DELIVERABLE_MISSING / cwd 外 E_PATH_OUTSIDE / 多文件部分缺失整单拒绝。
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import { makePresentTool } from '../src/tools/builtin/present.js'
import type { ToolContext } from '../src/tools/definition.js'

const SID = ids.session('ses_presenttest00000000000')

function makeCtx(cwd: string): ToolContext {
  return {
    sessionId: SID,
    turnId: ids.turn('trn_presenttest000000000001'),
    callId: ids.call('cal_presenttest00000000001'),
    signal: new AbortController().signal,
    onProgress: () => {},
    cwd,
  }
}

describe('present 工具（CK-13 批 1）', () => {
  test('正常声明：相对路径 resolve 成绝对 + emit 回执（含 summary）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'spark-present-'))
    await writeFile(join(cwd, 'out.md'), '# 交付\n', 'utf8')
    const emitted: Array<{ files: string[]; summary?: string }> = []
    const tool = makePresentTool((sid, files, summary) => {
      emitted.push({ files, ...(summary !== undefined ? { summary } : {}) })
      return Promise.resolve()
    })
    const r = await tool.execute(makeCtx(cwd), { files: ['out.md'], summary: '最终文档' })
    expect(r.isError).toBe(false)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.files).toEqual([join(cwd, 'out.md')])
    expect(emitted[0]?.summary).toBe('最终文档')
  })

  test('不存在的文件 → E_DELIVERABLE_MISSING（不假装已交付）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'spark-present-'))
    const tool = makePresentTool(() => Promise.resolve())
    const r = await tool.execute(makeCtx(cwd), { files: ['nope.md'] })
    expect(r.isError).toBe(true)
    expect((r.output as { code: string }).code).toBe('E_DELIVERABLE_MISSING')
  })

  test('cwd 外路径 → E_PATH_OUTSIDE（硬边界优先）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'spark-present-'))
    const tool = makePresentTool(() => Promise.resolve())
    await expect(tool.execute(makeCtx(cwd), { files: ['../out.md'] })).rejects.toThrow('E_PATH_OUTSIDE')
  })

  test('多文件声明：部分缺失整单拒绝（不部分交付）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'spark-present-'))
    await writeFile(join(cwd, 'a.md'), 'a', 'utf8')
    const emitted: unknown[] = []
    const tool = makePresentTool((_sid, files) => {
      emitted.push(files)
      return Promise.resolve()
    })
    const r = await tool.execute(makeCtx(cwd), { files: ['a.md', 'missing.md'] })
    expect(r.isError).toBe(true)
    expect((r.output as { code: string }).code).toBe('E_DELIVERABLE_MISSING')
    expect(emitted).toHaveLength(0)
  })
})
