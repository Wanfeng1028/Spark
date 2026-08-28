/**
 * 自动化触发器单测（阶段七工单 7.6 / H06 / ADR D26）：
 * - cron：5 字段解析（通配/步长/范围/列表、周 7→0 折算）+ 各错误路径 + 匹配判定；
 * - registry：持久化往返 / 删除 / 启停 / 坏 JSON fail-closed / 运行历史追加+坏行跳过；
 * - manager：cron 分钟去重 / watch 基线+变更触发+不可达路径 / webhook 三拒绝 /
 *   手动触发 / 会话工厂失败闭合 / 创建期校验 / stop 后不再触发；
 * - 集成一条：触发 → 会话工厂被调（title/cwd 透传）且运行历史记录 sessionId。
 */
import { appendFileSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import {
  AutomationManager,
  AutomationRegistry,
  cronMatches,
  parseCron,
} from '../src/index.js'

let dirs: string[] = []
const managers: AutomationManager[] = []

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'spark-auto-'))
  dirs.push(d)
  return d
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 固定本地时间 2026-06-15 09:30:00（构造用本地分量，跨时区确定） */
const NOW_0930 = new Date(2026, 5, 15, 9, 30, 0).getTime()
const NOW_0931 = NOW_0930 + 60_000

interface FakeFactory {
  createSession: (opts: { title: string; cwd: string }) => Promise<{
    id: ReturnType<typeof ids.session>
    send: (text: string) => Promise<unknown>
  }>
  created: { title: string; cwd: string; prompt: string }[]
  failNext: () => void
}

function makeFactory(): FakeFactory {
  const created: { title: string; cwd: string; prompt: string }[] = []
  let failing = false
  return {
    created,
    failNext: () => {
      failing = true
    },
    createSession: ({ title, cwd }) => {
      if (failing) return Promise.reject(new Error('E_FAKE: 建会话失败'))
      created.push({ title, cwd, prompt: '' })
      const id = ids.session(`s_auto_${created.length}`)
      return Promise.resolve({
        id,
        send: (text: string) => {
          const last = created[created.length - 1]
          if (last !== undefined) last.prompt = text
          return Promise.resolve({ accepted: true })
        },
      })
    },
  }
}

function makeManager(opts: { now: () => number }): {
  manager: AutomationManager
  factory: FakeFactory
  root: string
} {
  const root = tempDir()
  const factory = makeFactory()
  const manager = new AutomationManager(new AutomationRegistry(root), {
    createSession: factory.createSession,
    now: opts.now,
    tickMs: 5,
  })
  managers.push(manager)
  return { manager, factory, root }
}

afterEach(async () => {
  for (const m of managers) await m.stop() // 等在途 tick 收尾，再删临时目录（防写已删目录）
  managers.length = 0
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

describe('cron 解析与匹配', () => {
  it('通配 + 步长：*/5 分钟域命中 0/5/.../55（12 值）', () => {
    const spec = parseCron('*/5 * * * *')
    expect(spec.minutes.size).toBe(12)
    expect(spec.minutes.has(0)).toBe(true)
    expect(spec.minutes.has(55)).toBe(true)
    expect(spec.minutes.has(3)).toBe(false)
    expect(spec.hours.size).toBe(24)
  })

  it('列表 + 范围：0,30 / 9-17 / 1-5 各自展开', () => {
    const spec = parseCron('0,30 9-17 * * 1-5')
    expect([...spec.minutes].sort((a, b) => a - b)).toEqual([0, 30])
    expect(spec.hours.size).toBe(9)
    expect(spec.hours.has(9)).toBe(true)
    expect(spec.hours.has(17)).toBe(true)
    expect(spec.hours.has(18)).toBe(false)
    expect(spec.daysOfWeek.has(1)).toBe(true)
    expect(spec.daysOfWeek.has(5)).toBe(true)
    expect(spec.daysOfWeek.has(6)).toBe(false)
  })

  it('范围步长：1-10/3 命中 1/4/7/10', () => {
    const spec = parseCron('1-10/3 * * * *')
    expect([...spec.minutes].sort((a, b) => a - b)).toEqual([1, 4, 7, 10])
  })

  it('周字段 7 折算为 0（周日两种写法等价）', () => {
    expect([...parseCron('0 0 * * 7').daysOfWeek]).toEqual([0])
    expect([...parseCron('0 0 * * 0').daysOfWeek]).toEqual([0])
  })

  it.each([
    ['字段数不是 5', '* * * *'],
    ['值越界（分）', '60 * * * *'],
    ['范围越界（时）', '0 24 * * *'],
    ['范围反向', '5-1 * * * *'],
    ['步长为 0', '*/0 * * * *'],
    ['无法识别的字段', 'abc * * * *'],
  ])('错误路径：%s → 抛 E_CRON', (_name, expr) => {
    expect(() => parseCron(expr)).toThrowError(/E_CRON/)
  })

  it('cronMatches：分/时命中即真，任一字段不命中即假', () => {
    const spec = parseCron('30 9 * * *')
    expect(cronMatches(spec, new Date(NOW_0930))).toBe(true)
    expect(cronMatches(spec, new Date(NOW_0931))).toBe(false)
  })
})

describe('AutomationRegistry 持久化与运行历史', () => {
  it('add → list 线上形状一致，新实例重载读回（原子写往返）', () => {
    const root = tempDir()
    const reg = new AutomationRegistry(root)
    const t = reg.add({ name: '夜间巡检', cwd: '/tmp/x', prompt: '跑一下', cron: '0 3 * * *' })
    expect(t.enabled).toBe(true)
    expect(reg.list()).toHaveLength(1)
    expect(reg.list()[0]).toMatchObject({
      id: t.id,
      name: '夜间巡检',
      cron: '0 3 * * *',
    })

    const reload = new AutomationRegistry(root)
    expect(reload.list()).toHaveLength(1)
    expect(reload.list()[0]?.id).toBe(t.id)
  })

  it('remove / setEnabled 语义：无此条返回 false，命中即持久', () => {
    const root = tempDir()
    const reg = new AutomationRegistry(root)
    const t = reg.add({ name: 'a', cwd: '/tmp', prompt: 'p', webhook: true })
    expect(reg.remove('nope')).toBe(false)
    expect(reg.setEnabled('nope', false)).toBe(false)
    expect(reg.setEnabled(t.id, false)).toBe(true)
    expect(reg.list()[0]?.enabled).toBe(false)
    expect(reg.remove(t.id)).toBe(true)
    expect(reg.list()).toHaveLength(0)
  })

  it('坏 automation.json → 构造即抛 E_CONFIG（不带病运行）', () => {
    const root = tempDir()
    writeFileSync(join(root, 'automation.json'), '{not json')
    expect(() => new AutomationRegistry(root)).toThrowError(/E_CONFIG/)
  })

  it('运行历史：追加即落盘；runs(limit) 新→旧；坏行跳过不阻塞', () => {
    const root = tempDir()
    const reg = new AutomationRegistry(root)
    reg.appendRun({ triggerId: 't1', triggerName: 'a', at: 1, kind: 'cron', finish: 'ok' })
    reg.appendRun({ triggerId: 't1', triggerName: 'a', at: 2, kind: 'cron', finish: 'error', error: 'x' })
    // 追加一行正常 + 一行坏行（历史只追加——单行损坏不阻塞列表）
    appendFileSync(
      join(root, 'automation-runs.jsonl'),
      `${JSON.stringify({ id: 'r3', triggerId: 't1', triggerName: 'a', at: 3, kind: 'manual', finish: 'ok' })}\n{oops\n`,
    )
    const runs = reg.runs(10)
    expect(runs.map((r) => r.at)).toEqual([3, 2, 1])
    expect(runs[1]).toMatchObject({ finish: 'error', error: 'x' })
    expect(reg.runs(1)).toHaveLength(1)
  })
})

describe('AutomationManager 触发纪律', () => {
  it('创建校验：无触发条件 → E_TRIGGER；坏 cron → E_CRON（均不入库）', () => {
    const current = NOW_0930
    const { manager } = makeManager({ now: () => current })
    expect(() => manager.add({ name: 'x', cwd: '/tmp', prompt: 'p' })).toThrowError(/E_TRIGGER/)
    expect(() =>
      manager.add({ name: 'x', cwd: '/tmp', prompt: 'p', cron: 'bad expr' }),
    ).toThrowError(/E_CRON/)
    expect(manager.list()).toHaveLength(0)
    void current
  })

  it('cron：命中分钟触发一次（分钟去重），未命中分钟不再触发', async () => {
    let current = NOW_0930
    const { manager, factory } = makeManager({ now: () => current })
    manager.add({ name: '每分钟', cwd: '/tmp/w', prompt: '干活', cron: '30 9 * * *' })
    manager.start()

    await sleep(60)
    expect(manager.runs(10)).toHaveLength(1)
    expect(factory.created).toHaveLength(1)
    expect(factory.created[0]).toMatchObject({ title: '自动化：每分钟', cwd: '/tmp/w', prompt: '干活' })

    await sleep(40) // 同一分钟再来多个 tick——去重，仍只一次
    expect(manager.runs(10)).toHaveLength(1)

    current = NOW_0931 // 分钟不命中（30 分 → 31 分）
    await sleep(40)
    expect(manager.runs(10)).toHaveLength(1)

    const run = manager.runs(10)[0]
    expect(run).toMatchObject({ kind: 'cron', finish: 'ok' })
    expect(run?.sessionId).toBe('s_auto_1') // 集成：会话工厂接线，运行历史带 sessionId
  })

  it('watch：首见记基线不触发；mtime 变化触发；路径不可达落 error 行', async () => {
    const root = tempDir()
    const watched = join(root, 'data.txt')
    writeFileSync(watched, 'v1')
    const { manager, factory } = makeManager({ now: () => NOW_0930 })
    manager.add({ name: '盯文件', cwd: root, prompt: '变了', watch: watched })
    manager.start()

    await sleep(60) // 首见只记基线
    expect(manager.runs(10)).toHaveLength(0)

    utimesSync(watched, new Date(), new Date(Date.now() + 5000))
    await sleep(60)
    expect(manager.runs(10)).toHaveLength(1)
    expect(manager.runs(10)[0]).toMatchObject({ kind: 'watch', finish: 'ok' })
    expect(factory.created).toHaveLength(1)

    // 不可达路径：新建触发器指向不存在文件 → error 行（每 tick 重试留痕）
    manager.add({ name: '盯不到', cwd: root, prompt: 'x', watch: join(root, 'nope.txt') })
    await sleep(60)
    const bad = manager.runs(10).filter((r) => r.finish === 'error')
    expect(bad.length).toBeGreaterThan(0)
    expect(bad[0]?.error).toMatch(/E_WATCH/)
  })

  it('webhook 三拒绝：未知 404 / 停用 409 / 非 webhook 触发器 400（语义错误前缀）', async () => {
    const { manager } = makeManager({ now: () => NOW_0930 })
    const cronOnly = manager.add({ name: 'c', cwd: '/tmp', prompt: 'p', cron: '0 0 1 1 *' })
    const hooked = manager.add({ name: 'w', cwd: '/tmp', prompt: 'p', webhook: true })

    await expect(manager.fireWebhook('nope')).rejects.toThrowError(/E_NOT_FOUND/)
    await expect(manager.fireWebhook(cronOnly.id)).rejects.toThrowError(/E_TRIGGER_KIND/)
    manager.setEnabled(hooked.id, false)
    await expect(manager.fireWebhook(hooked.id)).rejects.toThrowError(/E_TRIGGER_DISABLED/)
    manager.setEnabled(hooked.id, true)
    await expect(manager.fireWebhook(hooked.id)).resolves.toBeUndefined()
    expect(manager.runs(10)[0]).toMatchObject({ kind: 'webhook', finish: 'ok' })
  })

  it('手动触发：会话工厂失败 → 运行历史落 error 行（失败闭合，不抛出）', async () => {
    const { manager, factory } = makeManager({ now: () => NOW_0930 })
    const t = manager.add({ name: 'm', cwd: '/tmp', prompt: 'p', webhook: true })
    factory.failNext()
    await expect(manager.fireManual(t.id)).resolves.toBeUndefined()
    const run = manager.runs(10)[0]
    expect(run).toMatchObject({ kind: 'manual', finish: 'error' })
    expect(run?.error).toMatch(/E_FAKE/)
    expect(run?.sessionId).toBeUndefined()
  })

  it('stop 后不再触发（关停纪律：先停触发器再关会话）', async () => {
    const { manager } = makeManager({ now: () => NOW_0930 })
    manager.add({ name: '每分钟', cwd: '/tmp', prompt: 'p', cron: '30 9 * * *' })
    manager.start()
    await sleep(50)
    expect(manager.runs(10)).toHaveLength(1)
    await manager.stop()
    await sleep(50)
    expect(manager.runs(10)).toHaveLength(1)
  })
})
