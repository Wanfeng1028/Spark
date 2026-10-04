/**
 * 项目层 hook 信任门单测（CK-2 批 2 ⑤）：store 0600 回环、父目录就近继承、
 * 三种信任策略档（claude 路径级布尔/gemini 指纹闸/qwen 加固）、指纹变更重审、
 * 未知路径 ask、项目声明探测。
 */
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectTrustStore, hooksFingerprint, loadProjectHooks, normalizeTrustPath, resolveInherited, resolveTrust } from '../src/hooks/trust.js'
import type { TrustEntry } from '../src/hooks/trust.js'
import { SettingsHooksSchema } from '@spark/protocol'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
})

function makeStore(): { store: ProjectTrustStore; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'spark-trust-'))
  dirs.push(dir)
  const file = join(dir, 'trust.json')
  return { store: new ProjectTrustStore(file), file }
}

function makeProject(cwd: string, hooks?: object): void {
  const dir = join(cwd, '.spark')
  mkdirSync(dir, { recursive: true })
  if (hooks !== undefined) {
    writeFileSync(join(dir, 'hooks.json'), JSON.stringify({ version: 1, hooks }))
  }
}

const SAMPLE_HOOKS = SettingsHooksSchema.parse({
  session_start: [{ command: 'echo trusted' }],
})

describe('hooksFingerprint', () => {
  it('同内容同指纹；内容变更指纹变', () => {
    const a = SettingsHooksSchema.parse({ session_start: [{ command: 'echo a' }] })
    const b = SettingsHooksSchema.parse({ session_start: [{ command: 'echo b' }] })
    expect(hooksFingerprint(a)).toBe(hooksFingerprint(a))
    expect(hooksFingerprint(a)).not.toBe(hooksFingerprint(b))
  })
})

describe('resolveInherited', () => {
  it('cwd 精确命中优先；无条目向上遍历父目录', () => {
    const folders = new Map<string, TrustEntry>([
      [normalizeTrustPath('/home/user/proj'), { trust: 'trusted', fingerprint: undefined }],
      [normalizeTrustPath('/home/user'), { trust: 'untrusted', fingerprint: undefined }],
    ])
    // 子目录无条目 → 继承父 /home/user/proj 的 trusted
    expect(resolveInherited(folders, normalizeTrustPath('/home/user/proj/sub'))?.trust).toBe('trusted')
    // 自身有条目 → 优先于父
    expect(resolveInherited(folders, normalizeTrustPath('/home/user/proj'))?.trust).toBe('trusted')
    // 全链无 → undefined
    expect(resolveInherited(folders, normalizeTrustPath('/other'))).toBeUndefined()
  })
})

describe('resolveTrust 三档', () => {
  const fp = hooksFingerprint(SAMPLE_HOOKS)
  const cwd = normalizeTrustPath('/home/user/proj')

  function makeWith(entry: TrustEntry | undefined): ProjectTrustStore {
    const { store } = makeStore()
    if (entry !== undefined) store.set(cwd, entry)
    return store
  }

  it('claude 档：路径级布尔——trusted 即信任，无指纹概念', () => {
    const store = makeWith({ trust: 'trusted' })
    expect(resolveTrust({ cwd, mode: 'claude', fingerprint: 'different', store })).toBe('trusted')
  })

  it('gemini 档：指纹匹配 trusted；不匹配 ask 重审；untrusted 不变', () => {
    expect(resolveTrust({ cwd, mode: 'gemini', fingerprint: fp, store: makeWith({ trust: 'trusted', fingerprint: fp }) })).toBe('trusted')
    expect(resolveTrust({ cwd, mode: 'gemini', fingerprint: 'changed', store: makeWith({ trust: 'trusted', fingerprint: fp }) })).toBe('ask')
    expect(resolveTrust({ cwd, mode: 'gemini', fingerprint: fp, store: makeWith({ trust: 'untrusted', fingerprint: fp }) })).toBe('untrusted')
  })

  it('qwen 档：旧版无指纹的 trusted 强制重审（档位升级）', () => {
    expect(resolveTrust({ cwd, mode: 'qwen', fingerprint: fp, store: makeWith({ trust: 'trusted' }) })).toBe('ask')
    expect(resolveTrust({ cwd, mode: 'qwen', fingerprint: fp, store: makeWith({ trust: 'trusted', fingerprint: fp }) })).toBe('trusted')
  })

  it('未知路径（无条目无继承）→ ask（无 UI fail-closed）', () => {
    expect(resolveTrust({ cwd: normalizeTrustPath('/other'), mode: 'claude', fingerprint: fp, store: makeWith() })).toBe('ask')
  })
})

describe('loadProjectHooks', () => {
  it('hooks.json 合法 → 返回 hooks + 指纹；不存在 → null；坏 JSON → 抛错', () => {
    const cwd = normalizeTrustPath(mkdtempSync(join(tmpdir(), 'spark-proj-')))
    dirs.push(cwd)
    expect(loadProjectHooks(cwd)).toBeNull()
    makeProject(cwd, { session_start: [{ command: 'echo hi' }] })
    const result = loadProjectHooks(cwd)
    expect(result).not.toBeNull()
    expect(result?.hooks.session_start).toHaveLength(1)
    expect(result?.fingerprint).toBe(hooksFingerprint(SettingsHooksSchema.parse({ session_start: [{ command: 'echo hi' }] })))
    // 坏 JSON
    writeFileSync(join(cwd, '.spark', 'hooks.json'), '{broken')
    expect(() => loadProjectHooks(cwd)).toThrow()
  })
})

describe('ProjectTrustStore', () => {
  it('set/get 回环 + 文件持久化（新实例复读）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spark-trust-rw-'))
    dirs.push(dir)
    const file = join(dir, 'trust.json')
    const store = new ProjectTrustStore(file)
    store.set('/proj', { trust: 'trusted' })
    expect(existsSync(file)).toBe(true)
    expect(new ProjectTrustStore(file).get('/proj')?.trust).toBe('trusted')
  })
})
