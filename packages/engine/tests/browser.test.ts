/**
 * browser 工具族单测（阶段七工单 7.10 / H09 / ADR D27）：
 * - BrowserManager：懒启动（open 才建驱动）/ 无页拒绝（click/read/screenshot
 *   E_BROWSER_NO_PAGE 不触发启动）/ close 后可重开；
 * - 工具四路径（假驱动，免真实浏览器）：成功 / 业务失败（URL 校验、选择器
 *   未命中）/ 中断（E_ABORTED）/ 审批拒绝（E_PERMISSION）；
 * - read 正文截断；截图落盘 + Engine.readScreenshot 白名单供图（路径逃逸拒绝）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { SparkEventEnvelope } from '@spark/protocol'
import { ids } from '@spark/protocol'
import type { EngineConfig } from '../src/config.js'
import { Engine } from '../src/engine.js'
import { ScriptedLlm } from '../src/scripted-llm.js'
import type { BrowserDriver } from '../src/browser/driver.js'
import { BrowserManager } from '../src/browser/driver.js'
import { makeBrowserTools } from '../src/tools/builtin/browser.js'
import type { ToolContext } from '../src/tools/definition.js'

let dirs: string[] = []
let engines: Engine[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-browser-'))
  dirs.push(d)
  return d
}

afterEach(async () => {
  for (const e of engines) await e.shutdown()
  engines = []
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      // 句柄占用跳过清理（交系统临时目录回收）
    }
  }
  dirs = []
})

// ---------- 假驱动 ----------

/** 内存假驱动：记录调用，可预置失败/挂起；截图写真实临时文件（测供图链路） */
function makeFakeDriver(shotsDir: string): {
  driver: BrowserDriver
  calls: string[]
  hangOpen: () => void
  releaseOpen: () => void
} {
  const calls: string[] = []
  let url = ''
  let pending: { resolve: () => void } | null = null
  let hanging = false

  const driver: BrowserDriver = {
    async open(target, _timeoutMs) {
      calls.push(`open:${target}`)
      if (hanging) {
        await new Promise<void>((resolve) => {
          pending = { resolve }
        })
      }
      url = target
      return { title: '假页面', finalUrl: target }
    },
    click(selector, _timeoutMs) {
      calls.push(`click:${selector}`)
      if (selector === '#missing') {
        return Promise.reject(
          new Error(`E_BROWSER_SELECTOR: 点击失败——选择器 ${selector} 未命中或不可交互（timeout）`),
        )
      }
      return Promise.resolve({ finalUrl: url })
    },
    readText(selector) {
      calls.push(`read:${selector ?? '<body>'}`)
      if (selector === '#missing') {
        return Promise.reject(
          new Error(`E_BROWSER_SELECTOR: 读取失败——选择器 ${selector} 未命中（timeout）`),
        )
      }
      return Promise.resolve({
        text: selector === '#long' ? '字'.repeat(30_000) : '页面正文内容',
        finalUrl: url,
      })
    },
    async screenshot(selector) {
      calls.push(`screenshot:${selector ?? '<page>'}`)
      const { writeFile } = await import('node:fs/promises')
      const { mkdir } = await import('node:fs/promises')
      await mkdir(shotsDir, { recursive: true })
      const file = 'shot-1700000000000-0.png'
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      await writeFile(join(shotsDir, file), png)
      return { file, bytes: png.length, finalUrl: url }
    },
    currentUrl() {
      return url
    },
    close() {
      calls.push('close')
      return Promise.resolve()
    },
  }

  return {
    driver,
    calls,
    hangOpen: () => {
      hanging = true
    },
    releaseOpen: () => {
      pending?.resolve()
      pending = null
    },
  }
}

function makeCtx(signal?: AbortSignal): ToolContext {
  return {
    sessionId: ids.session('sesBrowserTest00000000000'),
    turnId: ids.turn('trnBrowserTest00000000000'),
    callId: ids.call('calBrowserTest00000000000'),
    signal: signal ?? new AbortController().signal,
    onProgress: () => {},
    cwd: tempDir(),
  }
}

function toolOf(defs: ReturnType<typeof makeBrowserTools>, name: string) {
  const def = defs.find((d) => d.name === name)
  if (def === undefined) throw new Error(`工具 ${name} 未定义`)
  return def
}

// ---------- BrowserManager ----------

describe('BrowserManager（懒启动 + 无页拒绝）', () => {
  test('open 才启动驱动；click/read/screenshot 无页 → E_BROWSER_NO_PAGE 且不启动', async () => {
    let made = 0
    const fake = makeFakeDriver(tempDir())
    const manager = new BrowserManager(() => {
      made += 1
      return Promise.resolve(fake.driver)
    })
    expect(manager.currentUrl()).toBe('')
    await expect(manager.click('#a', 1000)).rejects.toThrow('E_BROWSER_NO_PAGE')
    await expect(manager.readText(undefined)).rejects.toThrow('E_BROWSER_NO_PAGE')
    await expect(manager.screenshot(undefined)).rejects.toThrow('E_BROWSER_NO_PAGE')
    expect(made).toBe(0) // 未触发启动

    const r = await manager.open('https://example.com', 5000)
    expect(r.title).toBe('假页面')
    expect(made).toBe(1)
    expect(manager.currentUrl()).toBe('https://example.com')
    await manager.close()
  })

  test('close 后驱动置空——再操作回到无页拒绝', async () => {
    const fake = makeFakeDriver(tempDir())
    const manager = new BrowserManager(() => Promise.resolve(fake.driver))
    await manager.open('https://example.com', 5000)
    await manager.close()
    await expect(manager.click('#a', 1000)).rejects.toThrow('E_BROWSER_NO_PAGE')
  })
})

// ---------- 工具四路径（假驱动） ----------

describe('browser 工具族（成功 / 业务失败 / 中断）', () => {
  test('browser.open 成功：URL 归一 + 标题返回；审批 action/resource 形状', async () => {
    const fake = makeFakeDriver(tempDir())
    const manager = new BrowserManager(() => Promise.resolve(fake.driver))
    const defs = makeBrowserTools(manager)
    const open = toolOf(defs, 'browser.open')
    expect(open.permission.action).toBe('browser.navigate')
    expect(open.permission.resourceOf({ url: 'https://a.b' }, { cwd: '/' })).toBe('url:https://a.b')
    expect(open.parallelizable).toBe(false)

    const out = await open.execute(makeCtx(), { url: 'https://example.com' })
    expect(out.isError).toBe(false)
    expect(out.output).toMatchObject({ title: '假页面' })
  })

  test('URL 校验：非 http/https 与非法 URL → E_BROWSER_NAVIGATION', async () => {
    const fake = makeFakeDriver(tempDir())
    const manager = new BrowserManager(() => Promise.resolve(fake.driver))
    const open = toolOf(makeBrowserTools(manager), 'browser.open')
    await expect(open.execute(makeCtx(), { url: 'file:///etc/passwd' })).rejects.toThrow(
      'E_BROWSER_NAVIGATION',
    )
    await expect(open.execute(makeCtx(), { url: 'not a url' })).rejects.toThrow(
      'E_BROWSER_NAVIGATION',
    )
    expect(fake.calls.filter((c) => c.startsWith('open:'))).toHaveLength(0) // 校验先于副作用
  })

  test('业务失败：选择器未命中 → E_BROWSER_SELECTOR（isError 由管线捕获）', async () => {
    const fake = makeFakeDriver(tempDir())
    const manager = new BrowserManager(() => Promise.resolve(fake.driver))
    const defs = makeBrowserTools(manager)
    await manager.open('https://example.com', 5000)
    const click = toolOf(defs, 'browser.click')
    await expect(click.execute(makeCtx(), { selector: '#missing' })).rejects.toThrow(
      'E_BROWSER_SELECTOR',
    )
    const read = toolOf(defs, 'browser.read')
    await expect(read.execute(makeCtx(), { selector: '#missing' })).rejects.toThrow(
      'E_BROWSER_SELECTOR',
    )
  })

  test('browser.read 截断：>20000 字符截断 + truncated 标记', async () => {
    const fake = makeFakeDriver(tempDir())
    const manager = new BrowserManager(() => Promise.resolve(fake.driver))
    await manager.open('https://example.com', 5000)
    const read = toolOf(makeBrowserTools(manager), 'browser.read')
    const out = await read.execute(makeCtx(), { selector: '#long' })
    const o = out.output as { text: string; truncated?: boolean }
    expect(o.text.length).toBe(20_000)
    expect(o.truncated).toBe(true)
  })

  test('browser.screenshot：返回文件名与字节数（图片本体不进输出）', async () => {
    const fake = makeFakeDriver(tempDir())
    const manager = new BrowserManager(() => Promise.resolve(fake.driver))
    await manager.open('https://example.com', 5000)
    const shot = toolOf(makeBrowserTools(manager), 'browser.screenshot')
    const out = await shot.execute(makeCtx(), {})
    expect(out.output).toMatchObject({ file: 'shot-1700000000000-0.png', bytes: 8 })
  })

  test('中断：已 aborted 与途中 abort 均 → E_ABORTED', async () => {
    const fake = makeFakeDriver(tempDir())
    const manager = new BrowserManager(() => Promise.resolve(fake.driver))
    const open = toolOf(makeBrowserTools(manager), 'browser.open')

    const pre = new AbortController()
    pre.abort()
    await expect(
      open.execute(makeCtx(pre.signal), { url: 'https://example.com' }),
    ).rejects.toThrow('E_ABORTED')

    // 途中 abort：open 挂起 → 中断即返
    const hang = makeFakeDriver(tempDir())
    hang.hangOpen()
    const manager2 = new BrowserManager(() => Promise.resolve(hang.driver))
    const open2 = toolOf(makeBrowserTools(manager2), 'browser.open')
    const ctrl = new AbortController()
    const p = open2.execute(makeCtx(ctrl.signal), { url: 'https://hang.example' })
    setTimeout(() => ctrl.abort(), 20)
    await expect(p).rejects.toThrow('E_ABORTED')
    hang.releaseOpen()
  })
})

// ---------- Engine 端到端（审批 / 拒绝 / 截图供图） ----------

function makeConfig(): EngineConfig {
  return {
    spark: {
      server: { port: 4318, host: '127.0.0.1' },
      engine: {
        maxStepsPerTurn: 40,
        maxToolParallel: 8,
        toolTimeoutMs: 120_000,
        permissionTimeoutMs: 300_000,
        progressThrottleMs: 200,
        toolOutputLimitKB: 32,
        compactionThreshold: 0.8,
        checkpoints: false,
        bashSandbox: 'off',
      },
    },
    models: {
      providers: { fake: { apiKeyEnv: null } },
      defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      compactionModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      fallbacks: [],
      titleModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      subagentModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
      costLimitUsd: undefined,
      defaultEffort: undefined,
      models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
    },
    permissions: { version: 1, rules: [] },
  }
}

function makeBrowserEngine(opts?: { rules?: EngineConfig['permissions']['rules'] }): {
  root: string
  engine: Engine
  gateway: ScriptedLlm
  events: SparkEventEnvelope[]
  fake: ReturnType<typeof makeFakeDriver>
} {
  const root = tempDir()
  const fake = makeFakeDriver(join(root, 'browser-shots'))
  const gateway = new ScriptedLlm()
  const config = makeConfig()
  if (opts?.rules !== undefined) config.permissions.rules = opts.rules
  const engine = new Engine({
    root,
    gateway,
    config,
    browserDriver: () => Promise.resolve(fake.driver),
  })
  engines.push(engine)
  const events: SparkEventEnvelope[] = []
  engine.subscribe((e) => {
    events.push(e)
  })
  return { root, engine, gateway, events, fake }
}

async function waitFor(pred: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000
  for (;;) {
    if (pred()) return
    if (Date.now() > deadline) throw new Error(`等待 ${what} 超时`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('Engine browser 端到端（审批默认 ask / 拒绝 / 截图供图）', () => {
  test('审批默认 ask：答复 once 后执行，输出经 tool.completed', async () => {
    const f = makeBrowserEngine()
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_browseropen0000000000'),
          name: 'browser.open',
          input: { url: 'https://example.com' },
        },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '已打开' }] })
    const h = await f.engine.createSession()
    await h.send('打开页面')
    await waitFor(() => f.events.some((e) => e.type === 'permission.asked'), 'permission.asked')
    const asked = f.events.find((e) => e.type === 'permission.asked') as SparkEventEnvelope<'permission.asked'>
    expect(asked.data.action).toBe('browser.navigate')
    expect(asked.data.resource).toBe('url:https://example.com')
    expect(await f.engine.replyPermission(asked.data.requestId, 'once')).toBe('ok')
    await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn')

    const completed = f.events.filter((e) => e.type === 'tool.completed')
    expect(completed).toHaveLength(1)
    const out = (completed[0] as SparkEventEnvelope<'tool.completed'>).data.output as { title?: string }
    expect(out.title).toBe('假页面')
    expect(f.fake.calls[0]).toBe('open:https://example.com/')
  })

  test('审批拒绝：E_PERMISSION 闭合，驱动从未启动', async () => {
    const f = makeBrowserEngine()
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_browserdeny0000000000'),
          name: 'browser.open',
          input: { url: 'https://example.com' },
        },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '好的' }] })
    const h = await f.engine.createSession()
    await h.send('打开页面')
    await waitFor(() => f.events.some((e) => e.type === 'permission.asked'), 'permission.asked')
    const asked = f.events.find((e) => e.type === 'permission.asked') as SparkEventEnvelope<'permission.asked'>
    expect(await f.engine.replyPermission(asked.data.requestId, 'reject')).toBe('ok')
    await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn')

    const completed = f.events.find((e) => e.type === 'tool.completed') as SparkEventEnvelope<'tool.completed'>
    expect(completed.data.isError).toBe(true)
    expect((completed.data.output as { code: string }).code).toBe('E_PERMISSION')
    expect(f.fake.calls).toHaveLength(0) // 拒绝后零副作用
  })

  test('deny 规则：不广告路径直达 E_PERMISSION（无 permission.asked）', async () => {
    const f = makeBrowserEngine({
      rules: [{ action: 'browser.navigate', resource: 'url:**', effect: 'deny' }],
    })
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_browserrule0000000000'),
          name: 'browser.open',
          input: { url: 'https://example.com' },
        },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '好的' }] })
    const h = await f.engine.createSession()
    await h.send('打开页面')
    await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn')
    expect(f.events.filter((e) => e.type === 'permission.asked')).toHaveLength(0)
    const completed = f.events.find((e) => e.type === 'tool.completed') as SparkEventEnvelope<'tool.completed'>
    expect((completed.data.output as { code: string }).code).toBe('E_PERMISSION')
  })

  test('截图供图：工具输出只回文件名；readScreenshot 白名单校验（路径逃逸拒绝）', async () => {
    const f = makeBrowserEngine({
      rules: [
        { action: 'browser.navigate', resource: 'url:**', effect: 'allow' },
        { action: 'browser.read', resource: 'url:**', effect: 'allow' },
      ],
    })
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_browseropen0000000001'),
          name: 'browser.open',
          input: { url: 'https://example.com' },
        },
        {
          type: 'toolCall',
          callId: ids.call('cal_browsershot000000000'),
          name: 'browser.screenshot',
          input: {},
        },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '截图完成' }] })
    const h = await f.engine.createSession()
    await h.send('打开并截图')
    await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn')

    const shot = f.events.find(
      (e) =>
        e.type === 'tool.completed' &&
        ((e.data as { output?: unknown }).output as { file?: string } | undefined)?.file !== undefined,
    ) as SparkEventEnvelope<'tool.completed'> | undefined
    expect(shot).toBeDefined()
    const file = (shot?.data.output as { file: string; bytes: number }).file
    expect(file).toBe('shot-1700000000000-0.png')

    // 供图链路：白名单内可读；路径逃逸/非法名一律 null
    expect(f.engine.readScreenshot(file)).not.toBeNull()
    expect(f.engine.readScreenshot('../permissions.json')).toBeNull()
    expect(f.engine.readScreenshot('shot-x.png')).toBeNull()
    expect(f.engine.readScreenshot('nope.png')).toBeNull()
  })

  test('中断：驱动挂起中 interrupt → tool.completed E_ABORTED（失败闭合）', async () => {
    const f = makeBrowserEngine({
      rules: [{ action: 'browser.navigate', resource: 'url:**', effect: 'allow' }],
    })
    f.fake.hangOpen()
    f.gateway.scriptStep({
      content: [
        {
          type: 'toolCall',
          callId: ids.call('cal_browserabort000000000'),
          name: 'browser.open',
          input: { url: 'https://hang.example' },
        },
      ],
    })
    f.gateway.scriptStep({ deltas: [{ kind: 'text', text: '不会到这' }] })
    const h = await f.engine.createSession()
    void h.send('打开页面')
    await waitFor(() => f.events.some((e) => e.type === 'tool.started'), 'tool.started')
    await h.interrupt()
    await waitFor(() => f.events.some((e) => e.type === 'turn.completed'), 'turn')
    const completed = f.events.find((e) => e.type === 'tool.completed') as SparkEventEnvelope<'tool.completed'>
    expect(completed.data.isError).toBe(true)
    expect((completed.data.output as { code: string }).code).toBe('E_ABORTED')
    f.fake.releaseOpen()
  })
})
