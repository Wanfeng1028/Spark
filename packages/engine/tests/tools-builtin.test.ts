/**
 * 内置四工具单测（doc/02 §5.6.3 / §8.6：四工具 × 四路径——成功/越界/超时/错误码）。
 * 直接驱动 execute（管线级行为在 pipeline.test.ts）。
 */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { ToolContext } from '../src/tools/definition.js'
import { readTool } from '../src/tools/builtin/read.js'
import { writeTool } from '../src/tools/builtin/write.js'
import { editTool } from '../src/tools/builtin/edit.js'
import { bashTool } from '../src/tools/builtin/bash.js'

async function makeCwd(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'spark-tools-'))
}

function makeCtx(cwd: string, onProgress: (chunk: string) => void = () => {}): ToolContext {
  return {
    sessionId: ids.session('ses_tooltest'),
    turnId: ids.turn('trn_tooltest'),
    callId: ids.call('cal_tooltest'),
    signal: new AbortController().signal,
    onProgress,
    cwd,
  }
}

describe('read（§5.6.3）', () => {
  test('成功：行号前缀 + 相对路径基于 cwd', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'a.txt'), 'alpha\nbeta\ngamma\n', 'utf8')
    const r = await readTool.execute(makeCtx(cwd), { path: 'a.txt' })
    expect(r.isError).toBe(false)
    expect(r.output).toBe('1→alpha\n2→beta\n3→gamma')
  })

  test('越界：E_PATH_OUTSIDE', async () => {
    const cwd = await makeCwd()
    await expect(
      readTool.execute(makeCtx(cwd), { path: '../../etc/passwd' }),
    ).rejects.toThrow('E_PATH_OUTSIDE')
  })

  test('不存在：E_NOT_FOUND', async () => {
    const cwd = await makeCwd()
    await expect(readTool.execute(makeCtx(cwd), { path: 'nope.txt' })).rejects.toThrow(
      'E_NOT_FOUND',
    )
  })

  test('二进制（NUL 采样）：E_BINARY', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'bin.dat'), Buffer.from([0x61, 0x00, 0x62]))
    await expect(readTool.execute(makeCtx(cwd), { path: 'bin.dat' })).rejects.toThrow('E_BINARY')
  })

  test('超大文件：E_TOO_LARGE', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'big.txt'), 'x'.repeat(2 * 1024 * 1024 + 1))
    await expect(readTool.execute(makeCtx(cwd), { path: 'big.txt' })).rejects.toThrow(
      'E_TOO_LARGE',
    )
  })

  test('行数超 limit：尾部窗口 + 头部提示', async () => {
    const cwd = await makeCwd()
    const lines = Array.from({ length: 21 }, (_, i) => `line${i + 1}`)
    await writeFile(join(cwd, 'long.txt'), `${lines.join('\n')}\n`, 'utf8')
    const r = await readTool.execute(makeCtx(cwd), { path: 'long.txt', limit: 5 })
    expect(r.isError).toBe(false)
    expect(r.output).toContain('仅显示末尾 5 行')
    expect(r.output).toContain('17→line17')
    expect(r.output).toContain('21→line21')
    expect(r.output).not.toContain('1→line1')
  })

  test('offset 分页', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'p.txt'), 'a\nb\nc\nd\n', 'utf8')
    const r = await readTool.execute(makeCtx(cwd), { path: 'p.txt', offset: 2, limit: 2 })
    expect(r.output).toBe('3→c\n4→d')
  })
})

describe('write（§5.6.3）', () => {
  test('成功：写入并返回字节数；父目录自动创建', async () => {
    const cwd = await makeCwd()
    const r = await writeTool.execute(makeCtx(cwd), {
      path: 'src/deep/x.txt',
      content: '你好',
    })
    expect(r.isError).toBe(false)
    expect(r.output).toEqual({ bytes: 6 })
    expect(await readFile(join(cwd, 'src/deep/x.txt'), 'utf8')).toBe('你好')
  })

  test('越界：E_PATH_OUTSIDE', async () => {
    const cwd = await makeCwd()
    await expect(
      writeTool.execute(makeCtx(cwd), { path: '../out.txt', content: 'x' }),
    ).rejects.toThrow('E_PATH_OUTSIDE')
  })

  test('写入被 OS 拒绝：E_WRITE_DENIED（目标是目录）', async () => {
    const cwd = await makeCwd()
    // 沙箱常以 root 运行（chmod 权限位被无视），用「目标是目录」构造必然的写入拒绝
    await mkdir(join(cwd, 'adir'))
    await expect(
      writeTool.execute(makeCtx(cwd), { path: 'adir', content: 'new' }),
    ).rejects.toThrow('E_WRITE_DENIED')
  })
})

describe('edit（§5.6.3）', () => {
  test('成功：唯一命中替换并返回 unified diff', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'c.ts'), 'const MAX_RETRY = 3\nconst other = 1\n', 'utf8')
    const r = await editTool.execute(makeCtx(cwd), {
      path: 'c.ts',
      oldString: 'MAX_RETRY',
      newString: 'RETRY_LIMIT',
    })
    expect(r.isError).toBe(false)
    expect(r.output).toContain('-const MAX_RETRY = 3')
    expect(r.output).toContain('+const RETRY_LIMIT = 3')
    expect(await readFile(join(cwd, 'c.ts'), 'utf8')).toContain('RETRY_LIMIT')
  })

  test('0 命中：E_NOT_FOUND', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'c.ts'), 'aaa\n', 'utf8')
    await expect(
      editTool.execute(makeCtx(cwd), { path: 'c.ts', oldString: 'zzz', newString: 'y' }),
    ).rejects.toThrow('E_NOT_FOUND')
  })

  test('多命中未 replaceAll：E_AMBIGUOUS', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'c.ts'), 'x\nx\n', 'utf8')
    await expect(
      editTool.execute(makeCtx(cwd), { path: 'c.ts', oldString: 'x', newString: 'y' }),
    ).rejects.toThrow('E_AMBIGUOUS')
  })

  test('replaceAll：全部替换', async () => {
    const cwd = await makeCwd()
    await writeFile(join(cwd, 'c.ts'), 'x\nx\n', 'utf8')
    const r = await editTool.execute(makeCtx(cwd), {
      path: 'c.ts',
      oldString: 'x',
      newString: 'y',
      replaceAll: true,
    })
    expect(r.isError).toBe(false)
    expect(await readFile(join(cwd, 'c.ts'), 'utf8')).toBe('y\ny\n')
  })

  test('越界：E_PATH_OUTSIDE', async () => {
    const cwd = await makeCwd()
    await expect(
      editTool.execute(makeCtx(cwd), {
        path: '../c.ts',
        oldString: 'a',
        newString: 'b',
      }),
    ).rejects.toThrow('E_PATH_OUTSIDE')
  })
})

describe('bash（§5.6.3）', () => {
  test('成功：echo 输出', async () => {
    const cwd = await makeCwd()
    const r = await bashTool.execute(makeCtx(cwd), { command: 'echo hello' })
    expect(r.isError).toBe(false)
    expect(r.output).toBe('hello\n')
  })

  test('非零退出：E_EXIT_CODE 且 output 保留', async () => {
    const cwd = await makeCwd()
    const r = await bashTool.execute(makeCtx(cwd), { command: 'echo out; echo err >&2; exit 3' })
    expect(r.isError).toBe(true)
    const out = r.output as { code: string; exitCode: number | null; output: string }
    expect(out.code).toBe('E_EXIT_CODE')
    expect(out.exitCode).toBe(3)
    expect(out.output).toContain('out')
    expect(out.output).toContain('err')
  })

  test('超时：E_TIMEOUT（SIGTERM 树杀）', async () => {
    const cwd = await makeCwd()
    const r = await bashTool.execute(makeCtx(cwd), {
      command: 'sleep 5',
      timeoutMs: 100,
    })
    expect(r.isError).toBe(true)
    expect(r.output).toMatchObject({ code: 'E_TIMEOUT' })
  })

  test('abort 级联：signal 已中止 → 树杀 + E_ABORTED', async () => {
    const cwd = await makeCwd()
    const ac = new AbortController()
    const ctx: ToolContext = { ...makeCtx(cwd), signal: ac.signal }
    const p = bashTool.execute(ctx, { command: 'sleep 5' })
    setTimeout(() => ac.abort(), 100)
    const r = await p
    expect(r.isError).toBe(true)
    expect(r.output).toMatchObject({ code: 'E_ABORTED' })
  })

  test('spawn 失败：E_SPAWN（工作目录不存在，resolve 通过但 spawn ENOENT）', async () => {
    const cwd = await makeCwd()
    const r = await bashTool.execute(makeCtx(cwd), { command: 'echo x', cwd: 'no-such-dir' })
    expect(r.isError).toBe(true)
    expect(r.output).toMatchObject({ code: 'E_SPAWN' })
  })

  test('progress 流式：stdout/stderr 合流 + 16KB 帧截断', async () => {
    const cwd = await makeCwd()
    const chunks: string[] = []
    const r = await bashTool.execute(
      makeCtx(cwd, (c) => chunks.push(c)),
      { command: "node -e \"process.stdout.write('a'.repeat(40*1024))\"" },
    )
    expect(r.isError).toBe(false)
    expect((r.output as string).length).toBe(40 * 1024)
    // 40KB → 至少 3 帧（16KB/帧截断）
    expect(chunks.length).toBeGreaterThanOrEqual(3)
  })
})
