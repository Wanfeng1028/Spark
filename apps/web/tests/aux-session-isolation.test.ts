/**
 * 辅助会话并发互不串流（工单 19.36 / V2-09 验收项）：
 * 一屏两个 SessionSurface 实例时，两实例的投影来自同一个 session store 的 byId 分片，
 * reducer 按 envelope.sessionId 落片——断言打在真实落点（web store 绑定 + protocol reducer）：
 * ① 交错喂两条会话的事件，各自 items / activeTurn / meta / lastSeq 互不影响；
 * ② 水位按会话各自计（A 的迟到重复事件既不在 A 内重复追加，也不吞 B 的新事件）；
 * ③ resetSlice(A) 只清 A（辅助抽屉重开原位复位不伤主会话）；
 * ④ setActiveId 只改「当前会话」指针，不动任何投影（侧栏状态点跟主会话，本身无副作用）。
 * live-only 事件（assistant.delta，无 seq 不落盘）也在列内——它只改 items，是最容易串流的通道。
 */
import { describe, expect, it } from 'vitest'
import type { SessionId, SparkEventEnvelope, SparkEventType } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { useSessionStore } from '@/stores/session'

const MAIN = ids.session('ses_main0000000000000001')
const AUX = ids.session('ses_aux0000000000000001')
const TURN_MAIN = ids.turn('trn_main00000000000001')
const TURN_AUX = ids.turn('trn_aux00000000000001')

function fresh(): void {
  useSessionStore.setState({ byId: {}, activeId: null })
}

let evtN = 0

/**
 * 测试信封：seq 由用例显式给（durable），live=true 则不带 seq（live-only 三条之一的语义）。
 * 两条会话各自从 1 起计——真实引擎就是一 session 一条水位线，共用 seq 即串流征兆。
 */
function ev<T extends SparkEventType>(
  sid: SessionId,
  type: T,
  data: SparkEventEnvelope<T>['data'],
  opts: { seq?: number; live?: boolean } = {},
): SparkEventEnvelope<T> {
  evtN += 1
  const e: SparkEventEnvelope<T> = {
    id: ids.event(`evt_aux${String(evtN).padStart(4, '0')}`),
    sessionId: sid,
    time: 1000 + evtN,
    type,
    data,
  }
  if (opts.seq !== undefined) e.seq = opts.seq
  return e
}

function apply(...events: SparkEventEnvelope[]): void {
  for (const e of events) useSessionStore.getState().applyEvent(e)
}

const slice = (sid: SessionId) => useSessionStore.getState().byId[sid]

/** 两条会话的开局事件（各自 seq 1；主会话 seq 2 = user.message，辅助会话 seq 2 = user.message） */
function openBoth(): void {
  fresh()
  apply(
    ev(MAIN, 'session.created', { title: '主会话', cwd: '/work/main', model: 'deepseek/chat' }, { seq: 1 }),
    ev(AUX, 'session.created', { title: '辅助会话', cwd: '/work/aux', model: 'deepseek/chat' }, { seq: 1 }),
  )
}

describe('辅助会话并发互不串流（工单 19.36）', () => {
  it('交错喂两条会话事件 → 投影分片互不影响', () => {
    openBoth()
    apply(
      ev(MAIN, 'user.message', { text: '主区提问' }, { seq: 2 }),
      ev(AUX, 'user.message', { text: '抽屉提问' }, { seq: 2 }),
      ev(MAIN, 'turn.started', { turnId: TURN_MAIN, delivery: 'now', userEventId: ids.event('evt_main0001') }, { seq: 3 }),
      ev(AUX, 'assistant.delta', { turnId: TURN_AUX, text: '抽屉回答' }, { live: true }),
    )
    const main = slice(MAIN)
    const aux = slice(AUX)
    expect(main?.meta.title).toBe('主会话')
    expect(aux?.meta.title).toBe('辅助会话')
    expect(main?.meta.cwd).toBe('/work/main')
    expect(aux?.meta.cwd).toBe('/work/aux')
    const mainText = JSON.stringify(main?.items)
    const auxText = JSON.stringify(aux?.items)
    // items 只含本会话内容：主区看不到"抽屉提问"，抽屉看不到"主区提问"
    expect(mainText).toContain('主区提问')
    expect(mainText).not.toContain('抽屉提问')
    expect(auxText).toContain('抽屉回答')
    expect(auxText).not.toContain('主区提问')
    // 水位各自计：live 事件不抬水位
    expect(main?.lastSeq).toBe(3)
    expect(aux?.lastSeq).toBe(2)
    // 活跃 turn 只在 MAIN——辅助会话的流式预览不污染主会话运行态，反之亦然
    expect(main?.activeTurn?.turnId).toBe(TURN_MAIN)
    expect(aux?.activeTurn).toBeNull()
  })

  it('去重水位按会话独立：重复 seq 只在所属会话内被吞', () => {
    openBoth()
    apply(ev(MAIN, 'user.message', { text: '主区第一条' }, { seq: 2 }))
    const itemsBefore = slice(MAIN)?.items.length
    // 同 seq 重放（回放×直播重叠）→ 主会话内跳过
    apply(ev(MAIN, 'user.message', { text: '主区重复' }, { seq: 2 }))
    expect(slice(MAIN)?.items.length).toBe(itemsBefore)
    expect(JSON.stringify(slice(MAIN)?.items)).not.toContain('主区重复')
    // 同一条事件号在辅助会话是水位的未知高位 → 照常落片（两线互不牵制）
    apply(ev(AUX, 'user.message', { text: '抽屉同号' }, { seq: 2 }))
    expect(JSON.stringify(slice(AUX)?.items)).toContain('抽屉同号')
    apply(ev(MAIN, 'user.message', { text: '主区迟到高位' }, { seq: 9 }))
    expect(slice(MAIN)?.lastSeq).toBe(9)
    expect(slice(AUX)?.lastSeq).toBe(2)
  })

  it('resetSlice 只清目标会话（辅助抽屉原位复位不伤主会话投影）', () => {
    openBoth()
    apply(
      ev(MAIN, 'user.message', { text: '主区提问' }, { seq: 2 }),
      ev(AUX, 'user.message', { text: '抽屉提问' }, { seq: 2 }),
    )
    useSessionStore.getState().resetSlice(AUX)
    expect(slice(AUX)?.items.length).toBe(0)
    expect(slice(AUX)?.lastSeq).toBe(0)
    expect(slice(AUX)?.meta.title).toBe('')
    expect(slice(MAIN)?.items.length).toBe(1) // 主会话分片仍是 created + 一条 user.message
    expect(JSON.stringify(slice(MAIN)?.items)).toContain('主区提问')
  })

  it('setActiveId 只动「当前会话」指针，不改任何投影', () => {
    openBoth()
    const before = useSessionStore.getState().byId
    useSessionStore.getState().setActiveId(MAIN)
    const after = useSessionStore.getState().byId
    expect(useSessionStore.getState().activeId).toBe(MAIN)
    expect(after[MAIN]).toBe(before[MAIN])
    expect(after[AUX]).toBe(before[AUX])
  })
})
