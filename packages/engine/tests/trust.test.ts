/**
 * 文件夹信任单测（工单 16.4 / ADR D37）：
 * trustLevelOf 深匹配算法（祖先链最深者胜/顺序无关/Windows 大小写归一/无命中 none）+
 * tightens 收紧面（只 shell.exec/mcp.call、trusted 不收紧）+
 * 引擎端到端（未信任 cwd 下用户 always 规则的 bash 收紧为 ask；trusted 目录不收紧）+
 * setTrust 原子写（trusted.json 落盘与归一化键）。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import { ancestorKeys, loadTrustDoc, saveTrustDoc, tightens, trustLevelOf, trustKey } from '../src/trust.js'
import { Engine } from '../src/engine.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import type { EngineConfig } from '../src/config.js'

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

describe('trustLevelOf（深匹配算法，qwen trust-precedence 语义）', () => {
  const folders = {
    '/home/u/work': 'trusted',
    '/home/u/work/danger': 'untrusted',
    '/home/u/other': 'untrusted',
  }

  test('最深命中者胜：danger 子目录取 untrusted；work 父目录取 trusted', () => {
    expect(trustLevelOf('/home/u/work/danger/repo', folders)).toBe('untrusted')
    expect(trustLevelOf('/home/u/work/repo', folders)).toBe('trusted')
  })

  test('顺序无关：folders 键序不影响结果（纯函数）', () => {
    const reversed = Object.fromEntries(Object.entries(folders).reverse())
    expect(trustLevelOf('/home/u/work/danger/repo', reversed)).toBe('untrusted')
    expect(trustLevelOf('/home/u/work/repo', reversed)).toBe('trusted')
  })

  test('无命中 = none；部分祖先命中', () => {
    expect(trustLevelOf('/opt/random', folders)).toBe('none')
    expect(trustLevelOf('/home/u', folders)).toBe('none')
  })

  test('Windows 大小写不敏感归一（trustKey 平台分支按 process.platform）', () => {
    const a = trustKey('C:\\Users\\U\\Project')
    const b = trustKey('c:/users/u/project')
    if (process.platform === 'win32') {
      expect(a).toBe(b)
    } else {
      // 非 Windows 平台大小写敏感：两键不同
      expect(a).not.toBe(b)
    }
  })

  test('ancestorKeys：深 → 浅且含根', () => {
    const keys = ancestorKeys('/home/u/work')
    expect(keys[0]).toBe('/home/u/work')
    expect(keys.at(-1)).toBe('/home/u')
  })
})

describe('tightens（收紧面，产出②）', () => {
  test('只收紧 shell.exec/mcp.call；trusted 档不收紧；ask/deny 不经此路径', () => {
    expect(tightens('shell.exec', 'none')).toBe(true)
    expect(tightens('mcp.call', 'none')).toBe(true)
    expect(tightens('shell.exec', 'trusted')).toBe(false)
    expect(tightens('fs.read', 'none')).toBe(false)
  })
})

describe('TrustDoc 存取（原子写 + 坏文件降级）', () => {
  test('save → load 往返；坏 JSON → 空表不抛', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-trust-'))
    roots.push(root)
    saveTrustDoc(root, { version: 1, folders: { '/repo': 'untrusted' } })
    expect(loadTrustDoc(root)).toEqual({ version: 1, folders: { '/repo': 'untrusted' } })
    writeFileSync(join(root, 'trusted.json'), '{ broken', 'utf8')
    expect(loadTrustDoc(root)).toEqual({ version: 1, folders: {} })
  })
})

// ---- 引擎端到端：未信任 cwd 收紧 always 规则（真实审批链路：send → asked → reply） ----

const fixtures: { root: string; engine: Engine }[] = []

describe('引擎端到端（工单 16.4 验收：未信任目录 bash 默认 ask）', () => {
  afterEach(async () => {
    for (const f of fixtures.splice(0)) await f.engine.shutdown()
  })

  test('未信任 cwd：用户 allow 规则下的 bash 请求挂起审批（收紧为 ask）而非自动放行', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-trust-engine-'))
    roots.push(root)
    const gateway = new ScriptedLlm()
    gateway.scriptStep({
      content: [
        { type: 'toolCall', callId: ids.call('cal_trusttest001'), name: 'bash', input: { command: 'echo hi' } },
      ],
    })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
    const engine = new Engine({ root, gateway, config: makeConfig() })
    fixtures.push({ root, engine })
    await engine.ready()
    const handle = await engine.createSession({ cwd: root })
    const events: SparkEventEnvelope[] = []
    engine.subscribe((e) => {
      if (e.sessionId === handle.id) events.push(e)
    })
    await handle.send('跑个命令')
    const deadline = Date.now() + 2000
    while (!events.some((e) => e.type === 'permission.asked')) {
      if (Date.now() > deadline) throw new Error('等待 permission.asked 超时（未信任目录未收紧）')
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(handle.status()).toBe('waiting-approval')
    const asked = events.find((e) => e.type === 'permission.asked') as SparkEventEnvelope<'permission.asked'>
    await engine.replyPermission(asked.data.requestId, 'once')
  })

  test('trusted 目录：同一 allow 规则自动放行（收紧不误伤信任面）；setTrust 原子落盘', async () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-trust-engine-'))
    roots.push(root)
    const gateway = new ScriptedLlm()
    gateway.scriptStep({
      content: [
        { type: 'toolCall', callId: ids.call('cal_trusttest002'), name: 'bash', input: { command: 'echo hi' } },
      ],
    })
    gateway.scriptStep({ deltas: [{ kind: 'text', text: '完成' }] })
    const engine = new Engine({ root, gateway, config: makeConfig() })
    fixtures.push({ root, engine })
    await engine.ready()
    engine.setTrust(root, 'trusted')
    expect(JSON.parse(readFileSync(join(root, 'trusted.json'), 'utf8'))).toMatchObject({
      folders: { [trustKey(root)]: 'trusted' },
    })
    expect(engine.getTrust().current).toBe('trusted')
    const handle = await engine.createSession({ cwd: root })
    const events: SparkEventEnvelope[] = []
    engine.subscribe((e) => {
      if (e.sessionId === handle.id) events.push(e)
    })
    await handle.send('跑个命令')
    await new Promise((r) => setTimeout(r, 300))
    expect(events.some((e) => e.type === 'permission.asked')).toBe(false) // 规则层快路径放行
    expect(handle.status()).toBe('idle')
  })
})
