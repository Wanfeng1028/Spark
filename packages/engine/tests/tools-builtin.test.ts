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
import { bashTool, makeBashTool, splitCommandPatterns } from '../src/tools/builtin/bash.js'
import { bwrapArgs, resolveSandboxWrapper, seatbeltProfile } from '../src/tools/sandbox.js'

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
  // 命令一律用 node -e 表达：跨 shell 可移植（Windows 无真实 bash 时工具回落
  // powershell，bash 方言如 sleep/>&2 不可用），测的是工具机制不是 shell 方言。
  test('成功：echo 输出', async () => {
    const cwd = await makeCwd()
    const r = await bashTool.execute(makeCtx(cwd), {
      command: "node -e \"process.stdout.write('hello\\n')\"",
    })
    expect(r.isError).toBe(false)
    expect(r.output).toBe('hello\n')
  })

  test('非零退出：E_EXIT_CODE 且 output 保留', async () => {
    const cwd = await makeCwd()
    // 显式 `exit 3`：powershell -Command 不传播内部原生命令退出码（非零一律转 1）
    const r = await bashTool.execute(makeCtx(cwd), {
      command: "node -e \"console.log('out'); console.error('err')\"; exit 3",
    })
    expect(r.isError).toBe(true)
    const out = r.output as { code: string; exitCode: number | null; output: string }
    expect(out.code).toBe('E_EXIT_CODE')
    expect(out.exitCode).toBe(3)
    expect(out.output).toContain('out')
    expect(out.output).toContain('err')
  })

  test('超时：E_TIMEOUT（SIGTERM 树杀）', { timeout: 10000 }, async () => {
    // timeout 10000：树杀与派生竞态时孤儿最长活满子命令 5s 自然退出，压默认 5s 上限会被负载抖成假红
    const cwd = await makeCwd()
    const r = await bashTool.execute(makeCtx(cwd), {
      command: 'node -e "setTimeout(()=>{},5000)"',
      timeoutMs: 100,
    })
    expect(r.isError).toBe(true)
    expect(r.output).toMatchObject({ code: 'E_TIMEOUT' })
  })

  test('abort 级联：signal 已中止 → 树杀 + E_ABORTED', { timeout: 10000 }, async () => {
    const cwd = await makeCwd()
    const ac = new AbortController()
    const ctx: ToolContext = { ...makeCtx(cwd), signal: ac.signal }
    const p = bashTool.execute(ctx, { command: 'node -e "setTimeout(()=>{},5000)"' })
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

describe('bash 沙箱（工单 5.2，ADR D15）', () => {
  test('bwrap 参数：根只读 + cwd 可写 + dev/proc/tmp + 终止符', () => {
    expect(bwrapArgs('/work/dir')).toEqual([
      '--ro-bind', '/', '/',
      '--bind', '/work/dir', '/work/dir',
      '--dev', '/dev',
      '--proc', '/proc',
      '--tmpfs', '/tmp',
      '--',
    ])
  })

  test('Seatbelt profile：默认放行 + 写限 cwd 与 tmpdir', () => {
    expect(seatbeltProfile('/work/dir', '/private/tmp')).toBe(
      '(version 1)(allow default)(deny file-write*)' +
        '(allow file-write* (subpath "/work/dir")(subpath "/private/tmp"))',
    )
  })

  test('平台 wrapper 路线：linux=bwrap / darwin=sandbox-exec / win32=null', () => {
    expect(resolveSandboxWrapper('linux', { cwd: '/w', tmpdir: '/t' })?.file).toBe('bwrap')
    expect(resolveSandboxWrapper('darwin', { cwd: '/w', tmpdir: '/t' })?.file).toBe('sandbox-exec')
    expect(resolveSandboxWrapper('win32', { cwd: 'C:\\w', tmpdir: 'C:\\t' })).toBeNull()
  })

  test("sandbox on + wrapper 不可用：E_SANDBOX_UNAVAILABLE（fail-closed 不降级裸跑）", async () => {
    const cwd = await makeCwd()
    const tool = makeBashTool({ sandbox: 'on', isWrapperAvailable: () => false })
    const r = await tool.execute(makeCtx(cwd), { command: 'echo hello' })
    expect(r.isError).toBe(true)
    expect(r.output).toMatchObject({ code: 'E_SANDBOX_UNAVAILABLE' })
  })
})

describe('bash 复合命令分段（§5.7 补强 1，工单 4.7）', () => {
  test('&& / || / ; / | 切分并 trim；<2 段返回 undefined（走单一 resource 路径）', () => {
    expect(
      splitCommandPatterns('git status && git push origin main'),
    ).toEqual(['cmd:git status', 'cmd:git push origin main'])
    expect(splitCommandPatterns('echo a; echo b')).toEqual(['cmd:echo a', 'cmd:echo b'])
    expect(splitCommandPatterns('cat a | grep b | wc -l')).toEqual([
      'cmd:cat a',
      'cmd:grep b',
      'cmd:wc -l',
    ])
    expect(splitCommandPatterns('git status || exit 1')).toEqual(['cmd:git status', 'cmd:exit 1'])
    // 单段：不声明多 pattern（审批与固化都走原 resource 形状）
    expect(splitCommandPatterns('git status')).toBeUndefined()
    // 分号收尾过滤空段后仅剩 1 段：同样回落 undefined
    expect(splitCommandPatterns('git add .;')).toBeUndefined()
  })

  test('patternsOf/alwaysPatternsOf 声明一致（逐段评估 = 逐段固化范围候选）', () => {
    const input = { command: 'git pull && npm test' }
    expect(bashTool.permission.patternsOf?.(input, { cwd: '.' })).toEqual(
      bashTool.permission.alwaysPatternsOf?.(input, { cwd: '.' }),
    )
  })
})
