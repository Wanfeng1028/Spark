/**
 * app-store 投影单测（工单 9.2 首批）：applyEvent 典型事件序列快照
 * （session.created → user.message → turn.started → assistant.delta → turn.completed）
 * + durable 去重 + rAF 批处理器（同步调度注入）。
 */
import type { EventId, SparkEventEnvelope } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { useAppStore } from '../src/store/app-store'

const SID = ids.session('ses_store_test')
const TID = ids.turn('trn_store_test_1')

let eventNo = 0
function nextEventId(): EventId {
  eventNo += 1
  return ids.event(`evt_store_test_${eventNo}`)
}

/** 按序构造信封（time 递增；durable 给 seq，live 不给——§6.4 口径） */
function sessionCreated(seq: number): SparkEventEnvelope<'session.created'> {
  return {
    id: nextEventId(),
    sessionId: SID,
    seq,
    time: 1000,
    type: 'session.created',
    data: { title: '', cwd: '/tmp/spark', model: 'test/model' },
  }
}
function userMessage(seq: number, text: string): SparkEventEnvelope<'user.message'> {
  return {
    id: nextEventId(),
    sessionId: SID,
    seq,
    time: 2000,
    type: 'user.message',
    data: { text },
  }
}
function turnStarted(seq: number, userEventId: EventId): SparkEventEnvelope<'turn.started'> {
  return {
    id: nextEventId(),
    sessionId: SID,
    seq,
    time: 3000,
    type: 'turn.started',
    data: { turnId: TID, delivery: 'now', userEventId },
  }
}
function assistantDelta(text: string): SparkEventEnvelope<'assistant.delta'> {
  return {
    id: nextEventId(),
    sessionId: SID,
    time: 4000,
    type: 'assistant.delta',
    data: { turnId: TID, text },
  }
}
function turnCompleted(seq: number): SparkEventEnvelope<'turn.completed'> {
  return {
    id: nextEventId(),
    sessionId: SID,
    seq,
    time: 5000,
    type: 'turn.completed',
    data: { turnId: TID, finish: 'stop' },
  }
}

beforeEach(() => {
  // 清空投影（zustand 单例——按初始形状复位）
  useAppStore.setState({ byId: {}, activeId: null, notice: null })
})

describe('applyEvent 投影（典型事件序列快照）', () => {
  it('一轮完整对话的投影形状', () => {
    const store = useAppStore.getState()
    const um = userMessage(2, '你好')
    store.apply(sessionCreated(1))
    store.apply(um)
    store.apply(turnStarted(3, um.id))
    store.apply(assistantDelta('在的'))

    let slice = useAppStore.getState().byId[SID]
    expect(slice).toBeDefined()
    expect(slice?.meta.model).toBe('test/model')
    expect(slice?.meta.cwd).toBe('/tmp/spark')
    expect(slice?.items.map((it) => it.kind)).toEqual(['user', 'turn', 'assistant'])
    // 流式缓冲：delta 累入 assistant 项 textBuf（turn 项占位 items[1]，工单 10.4② 回合头）
    const assistant = slice?.items[2]
    expect(assistant?.kind === 'assistant' && assistant.streaming?.textBuf).toBe('在的')
    expect(slice?.activeTurn?.turnId).toBe(TID)

    useAppStore.getState().apply(turnCompleted(4))
    slice = useAppStore.getState().byId[SID]
    expect(slice?.activeTurn).toBeNull()
    expect(slice?.lastSeq).toBe(4)
  })

  it('durable 去重：seq <= lastSeq 的事件跳过（回放×直播重叠）', () => {
    const store = useAppStore.getState()
    store.apply(sessionCreated(1))
    const dup = userMessage(1, '重复帧')
    const before = useAppStore.getState().byId
    store.apply(dup)
    expect(useAppStore.getState().byId).toBe(before)
  })

  it('连接态与列表快照操作面', () => {
    const store = useAppStore.getState()
    store.setStatus('open')
    store.setSessions([
      {
        id: SID,
        title: '任务一',
        model: 'test/model',
        cwd: '/tmp/spark',
        createdAt: 1000,
        updatedAt: 2000,
        lastSeq: 0,
        status: 'idle',
      },
    ])
    store.setActiveSession(SID)
    store.setNotice('提示')
    const s = useAppStore.getState()
    expect(s.status).toBe('open')
    expect(s.sessions).toHaveLength(1)
    expect(s.activeSessionId).toBe(SID)
    expect(s.notice).toBe('提示')
  })
})
