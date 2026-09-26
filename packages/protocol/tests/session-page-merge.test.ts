/**
 * 守卫式 prefix-merge 一致性单测（工单 19.42 A / W12-FOLLOW）：
 * ① 守卫成立时翻页合并结果与"同一批事件从头全量 fold"深度相等；
 * ② 守卫①（跨段载荷 id 相交）破坏时回落全量重放且结果不变；
 * ③ 守卫②（前缀未落在回合边界）破坏时回落且结果不变；
 * ④ mergePrefixSlice 的 usageTotal/meta 合并规则逐字段对齐。
 */
import { describe, expect, it } from 'vitest'
import { ids, type SessionDto, type SparkEventEnvelope, type SparkEventMap, type SparkEventType, type Transport } from '../src/index.js'
import { applyEvent, emptySessionSlice, type ProjectionState } from '../src/apply-event.js'
import {
  createSessionPageController,
  mergePrefixSlice,
  type SessionPageSnapshot,
} from '../src/session-page.js'

const sid = ids.session('ses_mergepg000000000000001')
const PAGE_SIZE = 12

/** 一轮真实形状的 durable 事件（与 perf-session-page 同构） */
function buildTurns(turns: number, tag: string): SparkEventEnvelope[] {
  const out: SparkEventEnvelope[] = []
  const push = <T extends SparkEventType>(type: T, data: SparkEventMap[T]): void => {
    const seq = out.length + 1
    out.push({
      id: ids.event(`evt_${tag}${String(seq).padStart(14, '0')}`),
      sessionId: sid,
      type,
      time: 1700000000000 + seq,
      seq,
      data,
    })
  }
  for (let i = 1; i <= turns; i += 1) {
    const turnId = ids.turn(`trn_${tag}${String(i).padStart(12, '0')}`)
    const callId = ids.call(`cal_${tag}${String(i).padStart(12, '0')}`)
    push('user.message', { text: `问题 ${i}` })
    const userEventId = out.at(-1)?.id
    if (userEventId === undefined) throw new Error('unreachable：刚 push 过一条')
    push('turn.started', { turnId, delivery: 'now', userEventId })
    push('assistant.message', {
      turnId,
      content: [{ type: 'text', text: `回答 ${i}`.padEnd(20, '字') }],
      usage: { inputTokens: 800, outputTokens: 320 },
    })
    push('tool.started', { turnId, callId, name: 'read', input: { path: `src/f${i}.ts` } })
    push('tool.completed', {
      turnId,
      callId,
      output: `file ${i} contents`.repeat(6),
      isError: false,
      durationMs: 12,
    })
    push('turn.completed', { turnId, finish: 'stop', usage: { inputTokens: 800, outputTokens: 320 } })
  }
  return out
}

function renumber(events: SparkEventEnvelope[]): SparkEventEnvelope[] {
  return events.map((e, idx) => ({ ...e, seq: idx + 1 }))
}

function dto(all: SparkEventEnvelope[]): SessionDto {
  return {
    id: sid,
    title: 'merge',
    model: 'fake/fake-chat',
    cwd: '/tmp/merge',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    lastSeq: (all.at(-1)?.seq ?? 0),
    status: 'idle',
    events: all,
  }
}

function makeGetSession(all: SparkEventEnvelope[]): Transport['getSession'] {
  return (_id, query) => {
    const before = query?.before ?? all.length + 1
    const lo = Math.max(0, (before ?? all.length + 1) - 1 - PAGE_SIZE)
    return Promise.resolve(dto(all.slice(lo, (before ?? all.length + 1) - 1)))
  }
}

function oneShot(all: SparkEventEnvelope[]): ProjectionState {
  let state: ProjectionState = { byId: {}, activeId: sid }
  for (const e of all) state = applyEvent(state, e)
  return state
}

/** 走真实控制器：装载最后一页 → loadOlder 翻完 → 回落终帧 */
async function pagedSliceOf(all: SparkEventEnvelope[]): Promise<SessionPageSnapshot['slice']> {
  const seen: { snap: SessionPageSnapshot | null } = { snap: null }
  const controller = createSessionPageController({
    sessionId: sid,
    pageSize: PAGE_SIZE,
    noticeMs: 0,
    rest: () => ({
      getSession: makeGetSession(all),
      sendMessage: () => Promise.reject(new Error('测试不发送')),
      interrupt: () => Promise.reject(new Error('测试不中断')),
      replyPermission: () => Promise.resolve(),
    }),
    openStream: () => ({ dispose: () => undefined }),
    onUpdate: (s) => {
      seen.snap = s
    },
    schedule: (fn) => void fn(),
  })
  controller.start()
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  let guard = 0
  while (seen.snap !== null && seen.snap.hasMore && guard < 64) {
    await controller.loadOlder()
    guard += 1
  }
  controller.dispose()
  if (seen.snap === null) throw new Error('控制器未产出快照')
  return seen.snap.slice
}

describe('守卫成立：翻页合并与全量 fold 深度相等（19.42 A 验收①）', () => {
  it('4 轮完整回合、两页翻完——守卫式合并路径', async () => {
    const all = buildTurns(4, 'mgda')
    const paged = await pagedSliceOf(all)
    const whole = oneShot(all).byId[sid] ?? emptySessionSlice(sid)
    expect(paged.items).toEqual(whole.items)
    expect(paged.lastSeq).toBe(whole.lastSeq)
    expect(paged.usageTotal).toEqual(whole.usageTotal)
    expect(paged.activeTurn).toEqual(whole.activeTurn)
    expect(paged.mode).toBe(whole.mode)
  })
})

describe('守卫破坏：回落全量重放且结果不变（19.42 A 验收②③）', () => {
  it('守卫①：窗口的 tool.completed 命中旧页的 tool.started（跨段 callId 相交）', async () => {
    // 构造跨段配对：前缀页有 tool.started(callId X)，窗口页有其 tool.completed
    const older = buildTurns(1, 'mgx1')
    const turnId = ids.turn('trn_mgxx000000000000001')
    const callId = ids.call('cal_mgxx000000000000001')
    const win: SparkEventEnvelope[] = []
    let seq = older.length
    const push = <T extends SparkEventType>(type: T, data: SparkEventMap[T]): void => {
      seq += 1
      win.push({
        id: ids.event(`evt_mgxw${String(seq).padStart(14, '0')}`),
        sessionId: sid,
        type,
        time: 1700000000000 + seq,
        seq,
        data,
      })
    }
    push('tool.completed', { turnId, callId, output: 'x'.repeat(40), isError: false, durationMs: 5 })
    push('turn.completed', { turnId, finish: 'stop', usage: { inputTokens: 10, outputTokens: 5 } })
    push('user.message', { text: '第二轮' })
    const userEventId = win.at(-1)?.id
    if (userEventId === undefined) throw new Error('unreachable')
    push('turn.started', { turnId: ids.turn('trn_mgxx000000000000002'), delivery: 'now', userEventId })
    push('assistant.message', {
      turnId: ids.turn('trn_mgxx000000000000002'),
      content: [{ type: 'text', text: '第二轮回答' }],
      usage: { inputTokens: 20, outputTokens: 10 },
    })
    const all = renumber([...older, ...win])
    // 页大小 12：首屏取窗口（含 tool.completed），翻页拿到含 tool.started 的旧页 → 守卫①相交
    const paged = await pagedSliceOf(all)
    const whole = oneShot(all).byId[sid] ?? emptySessionSlice(sid)
    expect(paged.items).toEqual(whole.items)
    expect(paged.usageTotal).toEqual(whole.usageTotal)
  })

  it('守卫②：前缀页未落在回合边界（无 turn.completed 收尾）', async () => {
    const older = buildTurns(1, 'mgy1').slice(0, 4) // user/turn.started/assistant/tool.started——无收尾
    const win: SparkEventEnvelope[] = []
    let seq = older.length
    const turnId = ids.turn('trn_mgyy000000000000001')
    const callId = ids.call('cal_mgyy000000000000001')
    const push = <T extends SparkEventType>(type: T, data: SparkEventMap[T]): void => {
      seq += 1
      win.push({
        id: ids.event(`evt_mgyw${String(seq).padStart(14, '0')}`),
        sessionId: sid,
        type,
        time: 1700000000000 + seq,
        seq,
        data,
      })
    }
    push('tool.completed', { turnId, callId, output: 'y'.repeat(40), isError: false, durationMs: 5 })
    push('turn.completed', { turnId, finish: 'stop', usage: { inputTokens: 10, outputTokens: 5 } })
    const all = renumber([...older, ...win])
    const paged = await pagedSliceOf(all)
    const whole = oneShot(all).byId[sid] ?? emptySessionSlice(sid)
    expect(paged.items).toEqual(whole.items)
  })
})

describe('mergePrefixSlice 合并规则逐字段（19.42 A 验收④）', () => {
  it('usageTotal 相加、items 前后拼接、lastSeq 取 max', () => {
    const P = { ...emptySessionSlice(sid), lastSeq: 10, items: [{ kind: 'user' as const, eventId: ids.event('evt_p00000000000000001'), text: 'p' }], usageTotal: { inputTokens: 100, outputTokens: 50 } }
    const E = { ...emptySessionSlice(sid), lastSeq: 20, items: [{ kind: 'user' as const, eventId: ids.event('evt_e00000000000000001'), text: 'e' }], usageTotal: { inputTokens: 30, outputTokens: 70 } }
    const m = mergePrefixSlice(P, E)
    expect(m.items.map((i) => (i as { text: string }).text)).toEqual(['p', 'e'])
    expect(m.lastSeq).toBe(20)
    expect(m.usageTotal).toEqual({ inputTokens: 130, outputTokens: 120, reasoningTokens: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 })
  })

  it('meta 非缺省者胜 + createdAt 取 min + updatedAt 取 max + branch/effort 缺省回退', () => {
    const P = {
      ...emptySessionSlice(sid),
      meta: { id: sid, title: '原名', model: 'fake/a', cwd: '/w', createdAt: 100, updatedAt: 200, branch: 'main', effort: 'high' as const },
    }
    const E = {
      ...emptySessionSlice(sid),
      meta: { id: sid, title: '改名', model: '', cwd: '', createdAt: 150, updatedAt: 500 },
    }
    const m = mergePrefixSlice(P, E)
    expect(m.meta.title).toBe('改名') // E 非缺省胜
    expect(m.meta.model).toBe('fake/a') // E 缺省 → P
    expect(m.meta.cwd).toBe('/w')
    expect(m.meta.createdAt).toBe(100) // 两侧非零取 min
    expect(m.meta.updatedAt).toBe(500) // max
    expect(m.meta.branch).toBe('main') // E 缺省 → P
    expect(m.meta.effort).toBe('high')
  })

  it('歧义字段恒取 E（守卫③保证 P 侧全缺省）', () => {
    const P = { ...emptySessionSlice(sid), mode: 'plan' as const, topBanner: { kind: 'turn-error' as const, turnId: ids.turn('trn_bad0000000000000001') } }
    const E = { ...emptySessionSlice(sid), mode: 'default' as const, topBanner: null }
    const m = mergePrefixSlice(P, E)
    expect(m.mode).toBe('default')
    expect(m.topBanner).toBeNull()
  })
})
