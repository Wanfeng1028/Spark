/**
 * 性能基线第三批（工单 19.42 的前置测量）：移动端"往上翻旧消息"的重算成本实测。
 *
 * 为什么先测不改：`session-page.ts` 的 `loadOlder()` 每翻一页都把窗口内全部事件从头
 * 重放一遍（升序红线——旧页不得增量叠在较新投影之后），故翻 k 页累计约
 * pageSize·k²/2 次 applyEvent。W12 把这个 O(n²) 写成了源码注释，19.42 的工单卡据此
 * 要求"缓存已 reduce 的前缀 slice"——但翻页改的正是**前缀**，该句按字面不成立
 * （推演见 doc/02 §8 阶段十九 19.42 行）。要不要用 150–250 行守卫式合并换掉它，
 * 取决于这条路径实际多慢；而 nightly 现有两项量的是服务端读盘回放与引擎内存，
 * 都不覆盖它——这单至今零实测。本文件先把数字拿到。
 *
 * 计时口径：走真实翻页路径（`createSessionPageController` + 内存分页假件，不含网络与
 * 磁盘），3000 条事件按每页 50 条翻到底（60 次 `loadOlder()`）的累计墙钟；另测
 * "一次性全量重放"作对照，两者之比即翻页带来的放大倍数。分页假件按 before 直接切片，
 * 不把 O(n) 过滤记进 fold。
 *
 * 阈值政策：首轮**不设性能门槛断言**——没有历史样本，写死阈值即臆测（AGENTS §4.1
 * "计数以实数为准"的同一口径）。只留一条 `RUNAWAY_MS` 拦数量级事故（挂死/立方级），
 * 真实阈值待 2–3 次 nightly 采样后收紧。断言部分校的是**正确性**：翻页重放的结果须与
 * 一次性全量重放同形（本文件比 items 数与 lastSeq 两项；逐字段深比对属走 A 方案时的
 * "定稿一致性单测"，不在本基线内），否则这串数字测的是个错的东西。
 *
 * 运行面：SPARK_PERF=1 门控——主 CI 跳过，仅 nightly performance job 与本地显式跑
 * （与 apps/server/tests/perf-replay.test.ts、packages/engine/tests/perf-memory.test.ts 同族）。
 */
import { describe, expect, it } from 'vitest'
import {
  applyEvent,
  createSessionPageController,
  emptySessionSlice,
  ids,
  type ProjectionState,
  type SessionDto,
  type SessionPageSnapshot,
  type SparkEventEnvelope,
  type SparkEventMap,
  type SparkEventType,
  type Transport,
} from '../src/index.js'

const PERF = process.env.SPARK_PERF === '1'
/** 每轮 6 条 durable 事件 → 共 3000 条（移动端"长会话"量级） */
const TURNS = 500
/** 与两端实值同口径：apps/mobile SessionScreen.tsx:88 与 apps/miniapp index.tsx:61 均为 50 */
const PAGE_SIZE = 50
/**
 * 数量级护栏（非性能门槛）：首轮跑出的真实值才是定阈值的依据。
 * 放宽到 4 分钟是有意的——fold 是平方级且 applyEvent 每事件复制 items 数组，
 * 真实成本此刻未知；护栏只用来拦"挂死/立方级"这类事故，不用来判优劣。
 */
const RUNAWAY_MS = 240_000
/** vitest 默认单用例 5s，本用例按设计要跑更久 */
const TEST_TIMEOUT_MS = 300_000
/** 翻页次数上限兜底（防假件分页不收敛把用例挂死） */
const MAX_PAGES = (TURNS * 6) / PAGE_SIZE + 5

const sid = ids.session('ses_perfpage0000000000000001')

/** 一轮真实形状的 durable 事件：user → turn.started → assistant → tool started/completed → turn.completed */
function buildEvents(turns: number): SparkEventEnvelope[] {
  const out: SparkEventEnvelope[] = []
  const push = <T extends SparkEventType>(type: T, data: SparkEventMap[T]): void => {
    const seq = out.length + 1
    out.push({
      id: ids.event(`evt_perfpage${String(seq).padStart(15, '0')}`),
      sessionId: sid,
      type,
      time: 1700000000000 + seq,
      seq,
      data,
    })
  }
  for (let i = 1; i <= turns; i += 1) {
    const turnId = ids.turn(`trn_perfpage${String(i).padStart(13, '0')}`)
    const callId = ids.call(`cal_perfpage${String(i).padStart(13, '0')}`)
    push('user.message', { text: `问题 ${i}` })
    // 刚 push 完必非空；noUncheckedIndexedAccess 下索引访问带 undefined，收窄一次
    const userEventId = out.at(-1)?.id
    if (userEventId === undefined) throw new Error('unreachable：上一行刚追加过一条')
    push('turn.started', { turnId, delivery: 'now', userEventId })
    push('assistant.message', {
      turnId,
      content: [{ type: 'text', text: `回答 ${i} ——`.padEnd(40, '字') }],
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

function dto(events: SparkEventEnvelope[]): SessionDto {
  return {
    id: sid,
    title: 'perf',
    model: 'fake/fake-chat',
    cwd: '/tmp/perf',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    lastSeq: (events.at(-1)?.seq ?? 0),
    status: 'idle',
    events,
  }
}

/** 按 before 切页的假件（切片 O(pageSize)，不含全表过滤） */
function makeGetSession(all: SparkEventEnvelope[]): Transport['getSession'] {
  return (_id, query) => {
    const before = query?.before ?? all.length + 1
    const lo = Math.max(0, before - 1 - PAGE_SIZE)
    return Promise.resolve(dto(all.slice(lo, before - 1)))
  }
}

function oneShotFold(all: SparkEventEnvelope[]): ProjectionState {
  let state: ProjectionState = { byId: {}, activeId: sid }
  for (const e of all) state = applyEvent(state, e)
  return state
}

const ms = (v: number | undefined): string => (v === undefined ? 'n/a' : v.toFixed(1))

describe.skipIf(!PERF)('性能基线：移动端翻页 fold（工单 19.42 前置；SPARK_PERF=1 才跑）', () => {
  it(`${TURNS * 6} 条事件、每页 ${PAGE_SIZE} 条翻到底的累计耗时与放大倍数`, async () => {    const all = buildEvents(TURNS)
    // 用对象持有而非裸变量：TS 的闭包赋值不参与控制流收窄，裸 `let snap` 会被判成
    // 恒为 null，循环里的 `snap.hasMore` 直接报"属性不存在于 never"
    const seen: { snap: SessionPageSnapshot | null } = { snap: null }
    const controller = createSessionPageController({
      sessionId: sid,
      pageSize: PAGE_SIZE,
      noticeMs: 0,
      rest: () => ({
        getSession: makeGetSession(all),
        sendMessage: () => Promise.reject(new Error('perf 用例不发送')),
        interrupt: () => Promise.reject(new Error('perf 用例不中断')),
        replyPermission: () => Promise.resolve(),
      }),
      openStream: () => ({ dispose: () => undefined }),
      onUpdate: (s) => {
        seen.snap = s
      },
      schedule: (fn) => void fn(),
    })

    const startAt = performance.now()
    controller.start()
    for (let i = 0; i < 8; i += 1) await Promise.resolve() // start 内是异步 IIFE，微任务排干
    const replayMs = performance.now() - startAt

    const perPage: number[] = []
    let guard = 0
    while (seen.snap !== null && seen.snap.hasMore && guard < MAX_PAGES) {
      const at = performance.now()
      await controller.loadOlder()
      perPage.push(performance.now() - at)
      guard += 1
    }
    const pagingMs = perPage.reduce((sum, v) => sum + v, 0)
    controller.dispose()

    const oneShotAt = performance.now()
    const oneShot = oneShotFold(all)
    const oneShotMs = performance.now() - oneShotAt
    const oneShotSlice = oneShot.byId[sid] ?? emptySessionSlice(sid)

    console.log(
      [
        `[perf:session-page] 事件 ${all.length} 条（${TURNS} 轮）· 每页 ${PAGE_SIZE} · 翻页 ${perPage.length} 次`,
        `  首屏回放 ${ms(replayMs)}ms`,
        `  翻页累计 ${ms(pagingMs)}ms · 首页 ${ms(perPage[0])}ms · 中位 ${ms(perPage[Math.floor(perPage.length / 2)])}ms · 末页 ${ms(perPage[perPage.length - 1])}ms`,
        `  一次性全量重放（对照，非翻页路径） ${ms(oneShotMs)}ms`,
        `  翻页 / 单次全量 = ${(pagingMs / Math.max(oneShotMs, 0.001)).toFixed(1)}×`,
      ].join('\n'),
    )

    // 正确性：翻页重放必须与一次性全量重放同形——否则上面那串数字测的是错的东西
    expect(seen.snap).not.toBeNull()
    const pagedSlice = (seen.snap as SessionPageSnapshot).slice
    expect(pagedSlice.items.length).toBe(oneShotSlice.items.length)
    expect(pagedSlice.lastSeq).toBe(all.length)
    // 数量级护栏（非性能门槛）
    expect(pagingMs).toBeLessThan(RUNAWAY_MS)
  }, TEST_TIMEOUT_MS)
})
