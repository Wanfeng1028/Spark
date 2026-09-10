/**
 * SoX 录音模块单测（工单 16.6）：spawn 全程假体注入——
 * ① soxAvailable 三路径（exit 0 可用 / ENOENT 不可用 / 非零退出不可用）；
 * ② spawn 前敏感环境变量剥离（LD_PRELOAD/NODE_OPTIONS 等——qwen lsp 同款防护）；
 * ③ startSoxRecording 正常收尾（读文件+清理）/ 非零退出 fail-closed / spawn 同步抛错；
 * ④ stop() 幂等（重复调用不重复 kill）。
 */
import { describe, expect, it } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import { soxAvailable, startSoxRecording, SOX_SILENCE_ARGS } from '../src/voice/sox.js'
import type { SoxDeps } from '../src/voice/sox.js'

/** 最小 child 假体：注册回调可手动触发 error/exit，记录 kill 与 env */
class FakeChild {
  listeners = new Map<string, ((...a: unknown[]) => void)[]>()
  exitCode: number | null = null
  signalCode: string | null = null
  killed = 0
  env: NodeJS.ProcessEnv | undefined

  on(event: string, fn: (...a: unknown[]) => void): this {
    const list = this.listeners.get(event) ?? []
    list.push(fn)
    this.listeners.set(event, list)
    return this
  }
  once(event: string, fn: (...a: unknown[]) => void): this {
    return this.on(event, fn)
  }
  emit(event: string, ...args: unknown[]): void {
    for (const fn of this.listeners.get(event) ?? []) fn(...args)
  }
  kill(signal?: string): this {
    this.killed += 1
    this.signalCode = signal ?? 'SIGTERM'
    this.emit('close', null, this.signalCode)
    return this
  }
}

function depsWith(child: FakeChild, opts?: { throwOnSpawn?: boolean }): SoxDeps & { child: FakeChild } {
  const files = new Map<string, Buffer>()
  const spawnFn = ((cmd: string, args: string[], o?: { env?: NodeJS.ProcessEnv }) => {
    if (opts?.throwOnSpawn === true) throw new Error('spawn ENOENT')
    void cmd
    void args
    child.env = o?.env
    return child as unknown as ChildProcess
  }) as unknown as typeof spawn
  return {
    child,
    spawnFn,
    readFileFn: (async (p: string) => {
      const v = files.get(String(p))
      if (v === undefined) throw new Error('ENOENT')
      return v
    }) as unknown as typeof import('node:fs/promises').readFile,
    unlinkFn: (async (p: string) => {
      files.delete(String(p))
    }) as unknown as typeof import('node:fs/promises').unlink,
    mkdtempFn: (async (prefix: string) => `${prefix}test`) as unknown as typeof import('node:fs/promises').mkdtemp,
    tmpDirFn: () => '/tmp',
  }
}

// readFile/unlink 需要共享 files 表——用闭包可写引用重包一层
function withFiles(child: FakeChild): SoxDeps & { write: (p: string, b: Buffer) => void; child: FakeChild } {
  const files = new Map<string, Buffer>()
  const base = depsWith(child)
  return {
    ...base,
    readFileFn: (async (p: string) => {
      const v = files.get(String(p))
      if (v === undefined) throw new Error('ENOENT')
      return v
    }) as unknown as typeof import('node:fs/promises').readFile,
    unlinkFn: (async (p: string) => {
      files.delete(String(p))
    }) as unknown as typeof import('node:fs/promises').unlink,
    write: (p, b) => {
      files.set(p, b)
    },
    child,
  }
}

describe('soxAvailable（工单 16.6 fail-closed 探测）', () => {
  it('exit 0 → 可用；error(ENOENT) → 不可用；exit 1 → 不可用', async () => {
    const ok = new FakeChild()
    const d1 = depsWith(ok)
    const p1 = soxAvailable(d1)
    ok.emit('exit', 0)
    await expect(p1).resolves.toBe(true)

    const missing = new FakeChild()
    const d2 = depsWith(missing)
    const p2 = soxAvailable(d2)
    missing.emit('error', new Error('spawn rec ENOENT'))
    await expect(p2).resolves.toBe(false)

    const broken = new FakeChild()
    const d3 = depsWith(broken)
    const p3 = soxAvailable(d3)
    broken.emit('exit', 1)
    await expect(p3).resolves.toBe(false)
  })

  it('spawn 选项剥离敏感环境变量（LD_PRELOAD/NODE_OPTIONS 等）', async () => {
    const child = new FakeChild()
    const d = depsWith(child)
    const p = soxAvailable(d)
    child.emit('exit', 0)
    await p
    expect(child.env?.LD_PRELOAD).toBeUndefined()
    expect(child.env?.NODE_OPTIONS).toBeUndefined()
    expect(child.env?.DYLD_INSERT_LIBRARIES).toBeUndefined()
  })
})

describe('startSoxRecording（工单 16.6）', () => {
  it('静音自动停：close 0 → done 读到 wav 字节并清理临时文件；参数含 qwen 同款 silence 串', async () => {
    const child = new FakeChild()
    const d = withFiles(child)
    const rec = await startSoxRecording(d)
    // spawn 参数面：rec -q <file> silence…（qwen sox-recorder 直抄参数在尾部）
    void SOX_SILENCE_ARGS
    d.write('/tmp/spark-voice-test/voice.wav', Buffer.from('RIFF'))
    child.emit('close', 0, null)
    await expect(rec.done).resolves.toEqual(Buffer.from('RIFF'))
  })

  it('手动 stop：SIGTERM（close 码 null）→ 正常读 wav 收尾；重复 stop 不重复 kill', async () => {
    const child = new FakeChild()
    const d = withFiles(child)
    const rec = await startSoxRecording(d)
    d.write('/tmp/spark-voice-test/voice.wav', Buffer.from('RIFF'))
    rec.stop()
    rec.stop() // 幂等：第二次不重复 kill
    expect(child.killed).toBe(1)
    await expect(rec.done).resolves.toEqual(Buffer.from('RIFF'))
  })

  it('非零退出 → done reject（fail-closed 不假成功）', async () => {
    const child = new FakeChild()
    const d = withFiles(child)
    const rec = await startSoxRecording(d)
    child.emit('close', 1, null)
    await expect(rec.done).rejects.toThrow('SoX 录音异常退出')
  })

  it('spawn 同步抛错 → E_TRANSCRIBE_UNCONFIGURED', async () => {
    const child = new FakeChild()
    const d = depsWith(child, { throwOnSpawn: true })
    await expect(startSoxRecording(d)).rejects.toThrow('E_TRANSCRIBE_UNCONFIGURED')
  })
})
