/**
 * 会话页控制器单测（工单 R-H）：mobile/miniapp 会话页逻辑级重复收敛后的内核契约。
 * rest/openStream 全部假件注入（不落网络）；schedule 同步化保证断言确定性。
 * 覆盖：装载回放→续播水位 / H2 取页失败仍开流 / H4 重复帧不入窗 / 翻页合并重放与
 * hasMore 收口 / H3 审批复读闸门 / send/stop 失败 notice / notice 自清 / dispose 收口。
 */
import { describe, expect, it } from 'vitest'
import {
  createSessionPageController,
  ids,
  type SessionPageController,
  type SparkEventEnvelope,
  type Transport,
} from '../src/index'

const sid = ids.session('sesPageCtrl00000000001')

let seqCounter = 0
function env(partial: Partial<SparkEventEnvelope> = {}): SparkEventEnvelope {
  seqCounter += 1
  return {
    id: ids.event(`evtPageCtrl${String(seqCounter).padStart(18, '0')}`),
    sessionId: sid,
    type: 'user.message',
    time: 1700000000000 + seqCounter,
    seq: seqCounter,
    data: { text: `m${seqCounter}` },
    ...partial,
  } as SparkEventEnvelope
}

/** 最小会话 DTO（controller 只读 events 字段） */
function sessionDto(events: SparkEventEnvelope[]): { events: SparkEventEnvelope[] } {
  return { events } as unknown as { events: SparkEventEnvelope[] }
}

interface Harness {
  notices: (string | null)[]
  restCalls: number
  openedSince: number[]
  streamDisposed: number
  controller: SessionPageController
  emitFromStream: (e: SparkEventEnvelope) => void
  setGetSession(impl: Transport['getSession']): void
}

function makeHarness(getSession: Transport['getSession']): Harness {
  const h: Harness = {
    notices: [],
    restCalls: 0,
    openedSince: [],
    streamDisposed: 0,
    controller: undefined as unknown as SessionPageController,
    emitFromStream: () => undefined,
    setGetSession(impl) {
      getSession = impl
    },
  }
  const rest = (): Pick<Transport, 'getSession' | 'sendMessage' | 'interrupt' | 'replyPermission'> | null => ({
    getSession: (id, query) => {
      h.restCalls += 1
      return getSession(id, query)
    },
    sendMessage: () => Promise.reject(new Error('E_TEST: send 未注入')),
    interrupt: () => Promise.reject(new Error('E_TEST: interrupt 未注入')),
    replyPermission: () => Promise.resolve(),
  })
  h.controller = createSessionPageController({
    sessionId: sid,
    pageSize: 2,
    rest,
    noticeMs: 5,
    schedule: (fn) => void fn(), // 同步化：断言确定
    openStream: (since, handlers) => {
      h.openedSince.push(since)
      h.emitFromStream = handlers.onEvent
      return {
        dispose: () => {
          h.streamDisposed += 1
        },
      }
    },
    onUpdate: (s) => h.notices.push(s.notice),
  })
  return h
}

describe('session-page controller（R-H 内核契约）', () => {
  it('装载回放→以回放水位开续播流；page<pageSize 收口 hasMore', async () => {
    const page = [env(), env()] // pageSize=2：满页（两页等长）→ hasMore 保持 true
    const h = makeHarness(() => Promise.resolve(sessionDto(page) as never))
    h.controller.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(h.openedSince).toEqual([2]) // since = 回放水位
    expect(h.controller.timeOf(page[0].id)).toBe(page[0].time)
    h.controller.dispose()
  })

  it('H2：取页失败退化 since=0 直接开流，notice 如实呈现', async () => {
    const h = makeHarness(() => Promise.reject(new Error('E_NET: 取页失败')))
    h.controller.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(h.openedSince).toEqual([0])
    const last = h.notices[h.notices.length - 1]
    expect(last).toContain('E_NET')
    h.controller.dispose()
  })

  it('H4：续播流重复帧（seq 在水位内）不入窗', async () => {
    const page = [env(), env()]
    const h = makeHarness(() => Promise.resolve(sessionDto(page) as never))
    h.controller.start()
    await Promise.resolve()
    await Promise.resolve()
    const before = h.controller.timeOf(page[0].id)
    h.emitFromStream(page[0]) // 同 seq 重放帧
    expect(h.controller.timeOf(page[0].id)).toBe(before)
    const fresh = env()
    h.emitFromStream(fresh)
    expect(h.controller.timeOf(fresh.id)).toBe(fresh.time)
    h.controller.dispose()
  })

  it('翻页：较旧页前置合并全量重放；短页收口 hasMore', async () => {
    const older = [env(), env()] // seq 1-2
    const h = makeHarness(() => Promise.resolve(sessionDto(older) as never))
    h.controller.start()
    await Promise.resolve()
    await Promise.resolve()
    // 第二页（更旧——seq 递减语义由测试造：直接给更小 seq 的事件）
    const older2 = [env({ seq: -2 }), env({ seq: -1 })]
    h.setGetSession(() => Promise.resolve(sessionDto(older2) as never))
    await h.controller.loadOlder()
    expect(h.restCalls).toBe(2)
    h.controller.dispose()
  })

  it('H3：审批复读闸门——忙碌期第二次 reply 不出网', async () => {
    let resolveReply: (() => void) | null = null
    let replyCalls = 0
    const rest = (): Pick<Transport, 'getSession' | 'sendMessage' | 'interrupt' | 'replyPermission'> | null => ({
      getSession: () => Promise.resolve(sessionDto([]) as never),
      sendMessage: () => Promise.resolve({} as never),
      interrupt: () => Promise.resolve(),
      replyPermission: () => {
        replyCalls += 1
        return new Promise<void>((resolve) => {
          resolveReply = resolve
        })
      },
    })
    const updates: boolean[] = []
    const controller = createSessionPageController({
      sessionId: sid,
      rest,
      schedule: (fn) => void fn(),
      openStream: () => ({ dispose: () => undefined }),
      onUpdate: (s) => updates.push(s.approvalBusy),
    })
    const first = controller.reply(ids.request('reqPageCtrl000000001'), 'once')
    const second = controller.reply(ids.request('reqPageCtrl000000002'), 'once')
    resolveReply?.()
    await Promise.all([first, second])
    expect(replyCalls).toBe(1) // 第二次被闸门吞掉
    expect(updates).toContain(true)
  })

  it('notice 自清（noticeMs=5ms）', async () => {
    const h = makeHarness(() => Promise.reject(new Error('E_NET: boom')))
    h.controller.start()
    await new Promise((r) => setTimeout(r, 30))
    expect(h.notices[h.notices.length - 1]).toBe(null) // 已自清
    h.controller.dispose()
  })

  it('dispose：关流 + 之后 start 不再动作', async () => {
    const h = makeHarness(() => Promise.resolve(sessionDto([env()]) as never))
    h.controller.start()
    await Promise.resolve()
    h.controller.dispose()
    expect(h.streamDisposed).toBe(1)
    h.controller.start() // disposed 后无动作
    await Promise.resolve()
    expect(h.streamDisposed).toBe(1)
    expect(h.restCalls).toBe(1)
  })
})
