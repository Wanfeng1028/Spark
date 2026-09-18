/**
 * 全量回放代际协调器单测（AUD-08）：防旧快照覆盖直播事件。
 * 真 zustand store（vanilla getState 在 node 可用）+ 手写延迟 transport stub
 * （只实现协调器用到的 getSession 面，不落网络）。
 * 覆盖：快照在途直播事件缓冲→提交后生效不丢 / 两代并发旧代丢弃 / 失败时
 * buffering 复位且直播数据补进 store。
 * seq 纪律：快照事件 seq < 直播事件 seq（与真实时序一致，命中 applyEvent 去重语义）。
 */
import { describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import type { SessionDto, SparkEventEnvelope, Transport } from '@spark/protocol'
import { createReplayCoordinator } from '@/transports/replay'
import { useSessionStore } from '@/stores/session'

const sid = ids.session('ses_replaytest0000001')

let seqCounter = 0
function msgEvent(text: string): SparkEventEnvelope {
  seqCounter += 1
  return {
    id: ids.event(`evtReplayTest${String(seqCounter).padStart(16, '0')}`),
    sessionId: sid,
    type: 'user.message',
    time: 1700000000000 + seqCounter,
    seq: seqCounter,
    data: { text },
  }
}

/** 快照 DTO：协调器只读 events 字段 */
function dtoOf(events: SparkEventEnvelope[]): SessionDto {
  return { events } as unknown as SessionDto
}

interface DeferredGet {
  resolve: (dto: SessionDto) => void
  reject: (err: unknown) => void
}

/** 延迟 transport stub：每次 getSession 挂起，由测试逐个放行（放行顺序 = 调用顺序） */
function makeTransport(gets: DeferredGet[]): Transport {
  return {
    getSession: () =>
      new Promise<SessionDto>((resolve, reject) => {
        gets.push({ resolve, reject })
      }),
  } as unknown as Transport // 只备协调器消费的 getSession 面，其余方法不可达
}

describe('createReplayCoordinator（AUD-08 回放代际协调）', () => {
  it('快照在途时到达的直播事件进缓冲，快照提交后生效不丢', async () => {
    useSessionStore.setState({ byId: {} })
    const gets: DeferredGet[] = []
    const coordinator = createReplayCoordinator()
    const snap1 = msgEvent('snap-1') // seq 1：快照内容
    const live = msgEvent('live-1') // seq 2：快照窗口之外的直播事件
    const replaying = coordinator.replay(makeTransport(gets), sid)
    expect(coordinator.ingest(live)).toBe(true) // buffering：进 pending
    expect(useSessionStore.getState().byId[sid]).toBeUndefined() // 未直接写 store
    gets[0]?.resolve(dtoOf([snap1]))
    await replaying
    const slice = useSessionStore.getState().byId[sid]
    expect(slice?.items).toHaveLength(2) // 快照 1 条 + 缓冲直播 1 条
    expect(slice?.lastSeq).toBe(live.seq) // 直播事件未被旧快照抹掉
  })

  it('两代并发：旧代提交被整体丢弃，最新代快照与缓冲生效', async () => {
    useSessionStore.setState({ byId: {} })
    const gets: DeferredGet[] = []
    const coordinator = createReplayCoordinator()
    const stale = msgEvent('stale') // seq 1：旧代快照内容
    const a = msgEvent('a') // seq 2：最新代快照
    const b = msgEvent('b') // seq 3：最新代快照
    const live = msgEvent('live-gen2') // seq 4：直播事件
    const transport = makeTransport(gets)
    const first = coordinator.replay(transport, sid)
    const second = coordinator.replay(transport, sid) // 新代际取代第一代
    expect(coordinator.ingest(live)).toBe(true) // 缓冲进第二代的 pending
    gets[0]?.resolve(dtoOf([stale])) // 旧代快照先返回
    await first
    expect(useSessionStore.getState().byId[sid]).toBeUndefined() // 旧代未提交、未抹数据
    gets[1]?.resolve(dtoOf([a, b]))
    await second
    const slice = useSessionStore.getState().byId[sid]
    expect(slice?.items).toHaveLength(3) // 快照 2 条 + 缓冲 1 条
    expect(slice?.lastSeq).toBe(live.seq)
  })

  it('getSession 失败：错误如实上抛，buffering 复位且直播数据补进 store 不丢', async () => {
    useSessionStore.setState({ byId: {} })
    const gets: DeferredGet[] = []
    const coordinator = createReplayCoordinator()
    const live = msgEvent('live-before-fail')
    const replaying = coordinator.replay(makeTransport(gets), sid)
    expect(coordinator.ingest(live)).toBe(true)
    gets[0]?.reject(new Error('E_NET: 取快照失败'))
    await expect(replaying).rejects.toThrow('E_NET')
    const slice = useSessionStore.getState().byId[sid]
    expect(slice?.items).toHaveLength(1) // 失败时缓冲的直播事件补进 store（旧快照未提交不抹数据）
    expect(slice?.lastSeq).toBe(live.seq)
    expect(coordinator.ingest(msgEvent('after-fail'))).toBe(false) // buffering 已复位，直播通道恢复常规路径
  })
})
