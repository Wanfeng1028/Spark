/**
 * 成本计量单测（阶段七工单 7.7 / H07 + 阶段十三工单 13.6）：
 * 总账累加与熔断阈值 · 明细桶按 {本地日, provider, model} 聚合 ·
 * **旧平铺格式向后兼容**（读入不炸、旧账以 unbucketed 如实呈现、不摊进桶）·
 * summary(since) 过滤 · 坏 JSON/形状非法 fail-closed E_CONFIG · reset 清总账与明细。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { Usage } from '@spark/protocol'
import { CostTracker, dayOf } from '../src/cost-tracker.js'

const roots: string[] = []

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'spark-cost-'))
  roots.push(root)
  return root
}

function pathOf(root: string): string {
  return join(root, 'usage.json')
}

/** 固定时钟：2026-09-08 12:00 本地时间（dayOf 用本地日历日，测试与实现同源即确定） */
const FIXED_TS = new Date(2026, 8, 8, 12, 0, 0).getTime()
const NEXT_TS = new Date(2026, 8, 9, 9, 30, 0).getTime()

function usage(input: number, output: number, costUsd: number, cacheRead = 0, cacheWrite = 0): Usage {
  return {
    inputTokens: input,
    outputTokens: output,
    ...(cacheRead > 0 ? { cacheRead } : {}),
    ...(cacheWrite > 0 ? { cacheWrite } : {}),
    ...(costUsd > 0 ? { costUsd } : {}),
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      // 句柄未释放的目录交系统临时目录回收
    }
  }
})

describe('总账五分量与 reset（工单 7.7 基础语义在 tests/routing.test.ts，此处只补 13.6 新增面）', () => {
  test('cache 两分量进总账与明细桶（opencode 三分量契约）', () => {
    const t = new CostTracker(pathOf(makeRoot()), () => FIXED_TS)
    t.add(usage(100, 20, 0.5, 30, 10), { provider: 'fake', model: 'fake-chat' })
    t.add(usage(50, 10, 0.25), { provider: 'fake', model: 'fake-chat' })
    expect(t.spend()).toEqual({
      costUsd: 0.75,
      inputTokens: 150,
      outputTokens: 30,
      cacheRead: 30,
      cacheWrite: 10,
    })
    expect(t.summary().buckets[0]?.cacheRead).toBe(30)
  })

  test('reset 同时清明细桶（不只是总账）', () => {
    const t = new CostTracker(pathOf(makeRoot()), () => FIXED_TS)
    t.add(usage(10, 5, 0.1), { provider: 'fake', model: 'fake-chat' })
    t.reset()
    const s = t.summary()
    expect(s.buckets).toEqual([])
    expect(s.unbucketed.costUsd).toBe(0)
    expect(s.total.costUsd).toBe(0)
  })
})

describe('明细桶聚合（工单 13.6）', () => {
  test('同日同档合并；跨日与跨档各自成桶', () => {
    const root = makeRoot()
    let ts = FIXED_TS
    const t = new CostTracker(pathOf(root), () => ts)
    t.add(usage(100, 10, 0.1, 40), { provider: 'deepseek', model: 'deepseek-chat' })
    t.add(usage(50, 5, 0.05, 10), { provider: 'deepseek', model: 'deepseek-chat' })
    t.add(usage(20, 2, 0.02), { provider: 'deepseek', model: 'deepseek-reasoner' })
    ts = NEXT_TS
    t.add(usage(70, 7, 0.07), { provider: 'deepseek', model: 'deepseek-chat' })

    const s = t.summary()
    // 金额归一（roundUsd）后无 IEEE754 噪声：0.1 + 0.05 = 0.15 而非 0.15000000000000002
    expect(s.buckets.map((b) => [b.day, b.model, b.costUsd])).toEqual([
      [dayOf(FIXED_TS), 'deepseek-chat', 0.15],
      [dayOf(FIXED_TS), 'deepseek-reasoner', 0.02],
      [dayOf(NEXT_TS), 'deepseek-chat', 0.07],
    ])
    expect(s.buckets[0]?.inputTokens).toBe(150)
    expect(s.buckets[0]?.cacheRead).toBe(50)
    // 明细全覆盖 → 无旧账差额
    expect(s.unbucketed.costUsd).toBe(0)
    expect(s.total.inputTokens).toBe(240)
  })

  test('summary(since) 按日过滤（含当日；总账与差额仍是全量）', () => {
    const root = makeRoot()
    let ts = FIXED_TS
    const t = new CostTracker(pathOf(root), () => ts)
    t.add(usage(100, 10, 0.1), { provider: 'fake', model: 'fake-chat' })
    ts = NEXT_TS
    t.add(usage(200, 20, 0.2), { provider: 'fake', model: 'fake-chat' })

    const all = t.summary()
    expect(all.buckets.length).toBe(2)
    const filtered = t.summary(dayOf(NEXT_TS))
    expect(filtered.buckets.length).toBe(1)
    expect(filtered.buckets[0]?.day).toBe(dayOf(NEXT_TS))
    // since 只过滤明细：总账不动（熔断判据同源）
    expect(filtered.total.costUsd).toBe(all.total.costUsd)
  })

  test('持久化 round-trip：写回 v2 形状，重读总账与明细一致', () => {
    const root = makeRoot()
    const t = new CostTracker(pathOf(root), () => FIXED_TS)
    t.add(usage(100, 10, 0.1, 40, 5), { provider: 'fake', model: 'fake-chat' })
    const doc = JSON.parse(readFileSync(pathOf(root), 'utf8')) as Record<string, unknown>
    expect(doc['version']).toBe(2)
    expect(Array.isArray(doc['buckets'])).toBe(true)

    const reloaded = new CostTracker(pathOf(root), () => FIXED_TS)
    expect(reloaded.spend()).toEqual(t.spend())
    expect(reloaded.summary().buckets).toEqual(t.summary().buckets)
  })
})

describe('旧格式向后兼容（迁移路径）', () => {
  test('旧平铺格式读入不炸：总账保留、明细为空、差额 = 全部旧账', () => {
    const root = makeRoot()
    writeFileSync(
      pathOf(root),
      JSON.stringify({ costUsd: 1.25, inputTokens: 900, outputTokens: 300 }),
      'utf8',
    )
    const t = new CostTracker(pathOf(root), () => FIXED_TS)
    expect(t.spend()).toEqual({
      costUsd: 1.25,
      inputTokens: 900,
      outputTokens: 300,
      cacheRead: 0,
      cacheWrite: 0,
    })
    const s = t.summary()
    expect(s.buckets).toEqual([])
    expect(s.unbucketed).toEqual(s.total)
    expect(t.exceeded(1.25)).toBe(true) // 旧账照常参与熔断
  })

  test('旧账 + 新增量：差额只反映无明细的那部分（不摊进桶伪造明细）', () => {
    const root = makeRoot()
    writeFileSync(
      pathOf(root),
      JSON.stringify({ costUsd: 1, inputTokens: 100, outputTokens: 50 }),
      'utf8',
    )
    const t = new CostTracker(pathOf(root), () => FIXED_TS)
    t.add(usage(200, 80, 0.4, 60), { provider: 'fake', model: 'fake-chat' })
    const s = t.summary()
    expect(s.total).toEqual({
      costUsd: 1.4,
      inputTokens: 300,
      outputTokens: 130,
      cacheRead: 60,
      cacheWrite: 0,
    })
    expect(s.buckets.length).toBe(1)
    expect(s.unbucketed).toEqual({
      costUsd: 1,
      inputTokens: 100,
      outputTokens: 50,
      cacheRead: 0,
      cacheWrite: 0,
    })
    // 迁移后写回 v2（旧字段仍在，读端两版都能吃）
    expect(existsSync(pathOf(root))).toBe(true)
    const doc = JSON.parse(readFileSync(pathOf(root), 'utf8')) as Record<string, unknown>
    expect(doc['version']).toBe(2)
  })
})

describe('fail-closed 新增面（坏 JSON / 负数 / 缺字段已在 routing.test.ts）', () => {
  test('未知键 / 坏 day 格式 / 负 cache 分量 → ConfigError', () => {
    const root = makeRoot()
    const cases: unknown[] = [
      { costUsd: 0, inputTokens: 0, outputTokens: 0, nope: 1 },
      { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: -1 },
      {
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        buckets: [
          {
            day: '09/08/2026',
            provider: 'p',
            model: 'm',
            inputTokens: 0,
            outputTokens: 0,
            cacheRead: 0,
            cacheWrite: 0,
            costUsd: 0,
          },
        ],
      },
    ]
    for (const raw of cases) {
      writeFileSync(pathOf(root), JSON.stringify(raw), 'utf8')
      expect(() => new CostTracker(pathOf(root), () => FIXED_TS)).toThrow(/usage\.json 校验失败/)
    }
  })
})

describe('dayOf（本地日历日）', () => {
  test('与本地日期字段一致（跨月补零）', () => {
    expect(dayOf(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05')
    expect(dayOf(new Date(2026, 11, 31, 0, 1).getTime())).toBe('2026-12-31')
  })
})
