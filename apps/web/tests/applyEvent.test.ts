/**
 * applyEvent reducer 单测（doc/02 §6.4 处理表 20 种事件逐条覆盖，AGENTS §2.8）。
 * reduce 为纯函数——直接构造状态与事件断言，无 React 绑定。
 */
import { describe, expect, it } from 'vitest'
import type { SparkEventEnvelope, SparkEventType } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { reduce } from '../src/stores/session'
import type { SessionStoreState } from '../src/stores/session'

const SID = ids.session('ses_test0001')
const TURN = ids.turn('trn_test0001')

let evtSeq = 0
let timeSeq = 1000

/** 构造测试信封：durable 时带递增 seq（模拟 JSONL 行号） */
function ev<T extends SparkEventType>(
  type: T,
  data: SparkEventEnvelope<T>['data'],
  opts: { seq?: number; sessionId?: ReturnType<typeof ids.session> } = {},
): SparkEventEnvelope<T> {
  evtSeq += 1
  timeSeq += 1
  const e: SparkEventEnvelope<T> = {
    id: ids.event(`evt_test${String(evtSeq).padStart(4, '0')}`),
    sessionId: opts.sessionId ?? SID,
    time: timeSeq,
    type,
    data,
  }
  if (opts.seq !== undefined) e.seq = opts.seq
  return e
}

function fresh(): SessionStoreState {
  return { byId: {}, activeId: null, applyEvent: () => {}, resetSlice: () => {}, setActiveId: () => {} }
}

/** 从 session.created 起步的常规状态 */
function seeded(): SessionStoreState {
  return reduce(
    fresh(),
    ev('session.created', { title: '测试会话', cwd: '/tmp', model: 'deepseek/chat' }, { seq: 1 }),
  )
}

function itemsOf(s: SessionStoreState) {
  return s.byId[SID]?.items ?? []
}

describe('session.created / resumed / title', () => {
  it('created：初始化 slice，activeId 空则激活', () => {
    const s = reduce(fresh(), ev('session.created', { cwd: '/w', model: 'm' }, { seq: 1 }))
    expect(s.activeId).toBe(SID)
    const slice = s.byId[SID]
    expect(slice?.meta).toMatchObject({ id: SID, title: '', model: 'm', cwd: '/w' })
    expect(slice?.lastSeq).toBe(1)
  })

  it('created：activeId 已有则不抢', () => {
    const s1 = reduce(fresh(), ev('session.created', { cwd: '/a', model: 'm' }, { seq: 1 }))
    const OTHER = ids.session('ses_other0001')
    const s2 = reduce(
      s1,
      ev('session.created', { cwd: '/b', model: 'm' }, { seq: 1, sessionId: OTHER }),
    )
    expect(s2.activeId).toBe(SID)
    expect(s2.byId[OTHER]).toBeDefined()
  })

  it('resumed：未知会话也建 slice（回放随后逐条应用）', () => {
    const s = reduce(fresh(), ev('session.resumed', { fromSeq: 0 }, { seq: 1 }))
    expect(s.byId[SID]).toBeDefined()
  })

  it('title：meta.title 更新', () => {
    const s = reduce(seeded(), ev('session.title', { title: '新标题' }, { seq: 2 }))
    expect(s.byId[SID]?.meta.title).toBe('新标题')
  })
})

describe('turn 生命周期', () => {
  it('turn.started：建 activeTurn，清上轮错误横幅', () => {
    let s = seeded()
    s = reduce(s, ev('turn.completed', { turnId: TURN, finish: 'error' }, { seq: 2 }))
    expect(s.byId[SID]?.topBanner).toEqual({ kind: 'turn-error', turnId: TURN })
    s = reduce(
      s,
      ev(
        'turn.started',
        { turnId: ids.turn('trn_t2'), delivery: 'now', userEventId: ids.event('evt_u2') },
        { seq: 3 },
      ),
    )
    const at = s.byId[SID]?.activeTurn
    expect(at).toMatchObject({ turnId: ids.turn('trn_t2'), stepCount: 0, waiting: false })
    expect(at?.runningTools.size).toBe(0)
    expect(s.byId[SID]?.topBanner).toBeNull()
  })

  it('turn.completed：activeTurn 清空 + usage 累计 + finish=error 设横幅', () => {
    let s = seeded()
    s = reduce(
      s,
      ev(
        'turn.started',
        { turnId: TURN, delivery: 'now', userEventId: ids.event('evt_u1') },
        { seq: 2 },
      ),
    )
    s = reduce(
      s,
      ev(
        'turn.completed',
        {
          turnId: TURN,
          finish: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, cacheRead: 1 },
        },
        { seq: 3 },
      ),
    )
    expect(s.byId[SID]?.activeTurn).toBeNull()
    expect(s.byId[SID]?.usageTotal).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      cacheRead: 1,
    })
    expect(s.byId[SID]?.topBanner).toBeNull()

    s = reduce(
      s,
      ev(
        'turn.started',
        { turnId: ids.turn('trn_t2'), delivery: 'now', userEventId: ids.event('evt_u2') },
        { seq: 4 },
      ),
    )
    s = reduce(
      s,
      ev(
        'turn.completed',
        { turnId: ids.turn('trn_t2'), finish: 'error', usage: { inputTokens: 1, outputTokens: 1 } },
        { seq: 5 },
      ),
    )
    expect(s.byId[SID]?.topBanner).toEqual({ kind: 'turn-error', turnId: ids.turn('trn_t2') })
    expect(s.byId[SID]?.usageTotal.inputTokens).toBe(11)
  })
})

describe('消息流：user / assistant / reasoning', () => {
  it('user.message：push user item', () => {
    const s = reduce(seeded(), ev('user.message', { text: '你好' }, { seq: 2 }))
    const items = itemsOf(s)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'user', text: '你好' })
  })

  it('assistant.delta→message：streaming 缓冲累积后定稿清 streaming', () => {
    let s = seeded()
    s = reduce(s, ev('assistant.delta', { turnId: TURN, text: 'He' }))
    s = reduce(s, ev('assistant.delta', { turnId: TURN, text: 'llo' }))
    let items = itemsOf(s)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'assistant', streaming: { textBuf: 'Hello' } })

    s = reduce(
      s,
      ev(
        'assistant.message',
        { turnId: TURN, content: [{ type: 'text', text: 'Hello!' }] },
        { seq: 3 },
      ),
    )
    items = itemsOf(s)
    const a = items[0]
    expect(a?.kind).toBe('assistant')
    if (a?.kind === 'assistant') {
      expect(a.streaming).toBeUndefined()
      expect(a.content).toEqual([{ type: 'text', text: 'Hello!' }])
    }
  })

  it('assistant.message 含 toolCall：定稿 + 展开 tool running', () => {
    const CALL = ids.call('cal_test0001')
    const s = reduce(
      seeded(),
      ev(
        'assistant.message',
        {
          turnId: TURN,
          content: [{ type: 'toolCall', callId: CALL, name: 'read', input: { path: '/a' } }],
        },
        { seq: 2 },
      ),
    )
    const items = itemsOf(s)
    expect(items.map((i) => i.kind)).toEqual(['assistant', 'tool'])
    expect(items[1]).toMatchObject({ kind: 'tool', callId: CALL, name: 'read', status: 'running' })
  })

  it('assistant.message：activeTurn.stepCount 递增', () => {
    let s = seeded()
    s = reduce(
      s,
      ev(
        'turn.started',
        { turnId: TURN, delivery: 'now', userEventId: ids.event('evt_u1') },
        { seq: 2 },
      ),
    )
    s = reduce(
      s,
      ev(
        'assistant.message',
        { turnId: TURN, content: [{ type: 'text', text: 'ok' }] },
        { seq: 3 },
      ),
    )
    expect(s.byId[SID]?.activeTurn?.stepCount).toBe(1)
  })

  it('reasoning.delta→ended：流式累积后以 ended 定稿全文', () => {
    let s = seeded()
    s = reduce(s, ev('reasoning.delta', { turnId: TURN, text: '想一' }))
    s = reduce(s, ev('reasoning.delta', { turnId: TURN, text: '想' }))
    expect(itemsOf(s)[0]).toMatchObject({ kind: 'reasoning', text: '想一想', streaming: true })
    s = reduce(s, ev('reasoning.ended', { turnId: TURN, text: '想一想（完整）' }, { seq: 2 }))
    expect(itemsOf(s)[0]).toMatchObject({
      kind: 'reasoning',
      text: '想一想（完整）',
      streaming: false,
    })
  })

  it('reasoning.ended 先于 delta 到达（回放乱序防御）：ended 直接定稿', () => {
    const s = reduce(seeded(), ev('reasoning.ended', { turnId: TURN, text: '全文' }, { seq: 2 }))
    expect(itemsOf(s)[0]).toMatchObject({ kind: 'reasoning', text: '全文', streaming: false })
  })
})

describe('tool 状态机', () => {
  const CALL = ids.call('cal_tool0001')

  function started(): SessionStoreState {
    let s = seeded()
    s = reduce(
      s,
      ev(
        'turn.started',
        { turnId: TURN, delivery: 'now', userEventId: ids.event('evt_u1') },
        { seq: 2 },
      ),
    )
    s = reduce(
      s,
      ev(
        'tool.started',
        { turnId: TURN, callId: CALL, name: 'bash', input: { cmd: 'ls' } },
        { seq: 3 },
      ),
    )
    return s
  }

  it('tool.started：push running + runningTools.add', () => {
    const s = started()
    expect(itemsOf(s)[0]).toMatchObject({
      kind: 'tool',
      callId: CALL,
      status: 'running',
      progressBuf: '',
    })
    expect(s.byId[SID]?.activeTurn?.runningTools.has(CALL)).toBe(true)
  })

  it('tool.started 在 assistant.message 展开后到达：不重复建 item，仍入 runningTools', () => {
    let s = seeded()
    s = reduce(
      s,
      ev(
        'turn.started',
        { turnId: TURN, delivery: 'now', userEventId: ids.event('evt_u1') },
        { seq: 2 },
      ),
    )
    s = reduce(
      s,
      ev(
        'assistant.message',
        {
          turnId: TURN,
          content: [{ type: 'toolCall', callId: CALL, name: 'bash', input: { cmd: 'ls' } }],
        },
        { seq: 3 },
      ),
    )
    s = reduce(
      s,
      ev(
        'tool.started',
        { turnId: TURN, callId: CALL, name: 'bash', input: { cmd: 'ls' } },
        { seq: 4 },
      ),
    )
    const tools = itemsOf(s).filter((i) => i.kind === 'tool')
    expect(tools).toHaveLength(1)
    expect(s.byId[SID]?.activeTurn?.runningTools.has(CALL)).toBe(true)
  })

  it('tool.progress：chunk 追加；>2000 行截头保尾', () => {
    let s = started()
    s = reduce(s, ev('tool.progress', { turnId: TURN, callId: CALL, chunk: 'a\nb\n' }))
    expect(itemsOf(s)[0]).toMatchObject({ kind: 'tool', progressBuf: 'a\nb\n' })

    const big = Array.from({ length: 2100 }, (_, i) => `line-${i}`).join('\n')
    s = reduce(s, ev('tool.progress', { turnId: TURN, callId: CALL, chunk: big }))
    const tool = itemsOf(s)[0]
    if (tool?.kind !== 'tool') throw new Error('unreachable')
    // 已有 'a\nb\n' 的尾 \n 成为分隔符：拼接后 2+2100=2102 行 → 截 102 保 2000
    expect(tool.progressBuf.startsWith('…（前 102 行已截断）')).toBe(true)
    expect(tool.progressBuf.endsWith('line-2099')).toBe(true)
    expect(tool.progressBuf.split('\n')).toHaveLength(2001) // 提示行 + 2000 行
  })

  it('tool.completed：成功定稿 completed + output；错误定稿 error；runningTools 删除', () => {
    let s = started()
    s = reduce(
      s,
      ev(
        'tool.completed',
        { turnId: TURN, callId: CALL, output: 'done', isError: false, durationMs: 12 },
        { seq: 4 },
      ),
    )
    expect(itemsOf(s)[0]).toMatchObject({ kind: 'tool', status: 'completed', output: 'done' })
    expect(s.byId[SID]?.activeTurn?.runningTools.has(CALL)).toBe(false)

    const CALL2 = ids.call('cal_tool0002')
    s = reduce(
      s,
      ev('tool.started', { turnId: TURN, callId: CALL2, name: 'edit', input: {} }, { seq: 5 }),
    )
    s = reduce(
      s,
      ev(
        'tool.completed',
        { turnId: TURN, callId: CALL2, output: 'boom', isError: true, durationMs: 3 },
        { seq: 6 },
      ),
    )
    const items = itemsOf(s)
    expect(items[1]).toMatchObject({ kind: 'tool', status: 'error', output: 'boom' })
  })
})

describe('审批', () => {
  const REQ = ids.request('req_test0001')
  const CALL = ids.call('cal_apr00001')

  it('permission.asked→resolved：pending→resolved，activeTurn.waiting 置位/复位', () => {
    let s = seeded()
    s = reduce(
      s,
      ev(
        'turn.started',
        { turnId: TURN, delivery: 'now', userEventId: ids.event('evt_u1') },
        { seq: 2 },
      ),
    )
    s = reduce(
      s,
      ev(
        'permission.asked',
        {
          requestId: REQ,
          callId: CALL,
          action: 'write',
          resource: '/a.txt',
          reason: '编辑文件',
          patterns: ['/a.txt', '/a/*'],
          alwaysPatterns: ['/a.txt'],
        },
        { seq: 3 },
      ),
    )
    expect(itemsOf(s).at(-1)).toMatchObject({
      kind: 'approval',
      requestId: REQ,
      status: 'pending',
      patterns: ['/a.txt', '/a/*'],
      alwaysPatterns: ['/a.txt'],
    })
    expect(s.byId[SID]?.activeTurn?.waiting).toBe(true)

    s = reduce(s, ev('permission.resolved', { requestId: REQ, reply: 'once' }, { seq: 4 }))
    expect(itemsOf(s).at(-1)).toMatchObject({ kind: 'approval', status: 'resolved', reply: 'once' })
    expect(s.byId[SID]?.activeTurn?.waiting).toBe(false)
  })
})

describe('io.warning（工单 7.2 I/O 护栏）', () => {
  const CALL = ids.call('cal_guard001')

  function toolStarted(): SessionStoreState {
    let s = seeded()
    s = reduce(
      s,
      ev(
        'turn.started',
        { turnId: TURN, delivery: 'now', userEventId: ids.event('evt_u1') },
        { seq: 2 },
      ),
    )
    s = reduce(
      s,
      ev('tool.started', { turnId: TURN, callId: CALL, name: 'bash', input: { cmd: 'ls' } }, { seq: 3 }),
    )
    return s
  }

  it('injection：挂对应 tool 项 guard；turn 状态机不受影响（不阻断）', () => {
    let s = toolStarted()
    s = reduce(
      s,
      ev(
        'io.warning',
        {
          turnId: TURN,
          callId: CALL,
          tool: 'bash',
          kind: 'injection',
          rules: ['injection.ignore-instructions'],
        },
        { seq: 4 },
      ),
    )
    expect(itemsOf(s)[0]).toMatchObject({
      kind: 'tool',
      callId: CALL,
      guard: { kind: 'injection', rules: ['injection.ignore-instructions'] },
    })
    // 告警不改状态机：tool 仍 running、activeTurn 保持
    expect(itemsOf(s)[0]).toMatchObject({ status: 'running' })
    expect(s.byId[SID]?.activeTurn?.runningTools.has(CALL)).toBe(true)
  })

  it('secret：guard 含 redacted 计数；后到覆盖前到（保留最后一条）', () => {
    let s = toolStarted()
    s = reduce(
      s,
      ev(
        'io.warning',
        { turnId: TURN, callId: CALL, tool: 'read', kind: 'injection', rules: ['injection.fake-tag'] },
        { seq: 4 },
      ),
    )
    s = reduce(
      s,
      ev(
        'io.warning',
        { turnId: TURN, callId: CALL, tool: 'read', kind: 'secret', rules: ['secret.sk-token'], redacted: 3 },
        { seq: 5 },
      ),
    )
    expect(itemsOf(s)[0]).toMatchObject({
      guard: { kind: 'secret', rules: ['secret.sk-token'], redacted: 3 },
    })
  })

  it('callId 无对应 tool 项：不崩不建 item', () => {
    const s = toolStarted()
    const out = reduce(
      s,
      ev(
        'io.warning',
        { turnId: TURN, callId: ids.call('cal_nobody1'), tool: 'bash', kind: 'injection', rules: ['x'] },
        { seq: 4 },
      ),
    )
    expect(itemsOf(out)).toHaveLength(1) // 只有原 tool 项
    expect(itemsOf(out)[0]).not.toHaveProperty('guard')
  })
})

describe('compaction / checkpoint / error', () => {
  it('compaction.started/completed：compacting 开关（顶部细条数据源）', () => {
    let s = seeded()
    s = reduce(s, ev('compaction.started', {}, { seq: 2 }))
    expect(s.byId[SID]?.compacting).toBe(true)
    s = reduce(
      s,
      ev(
        'compaction.completed',
        { summary: '…', keptFromEventId: ids.event('evt_anchor1'), tokensBefore: 100 },
        { seq: 3 },
      ),
    )
    expect(s.byId[SID]?.compacting).toBe(false)
  })

  it('checkpoint.created：lastCheckpoint 记录（StatusBar 徽标数据源）', () => {
    const s = reduce(
      seeded(),
      ev(
        'checkpoint.created',
        { checkpointId: ids.checkpoint('ckp_test0001'), files: ['/a'], turnId: TURN },
        { seq: 2 },
      ),
    )
    expect(s.byId[SID]?.lastCheckpoint).toEqual({ checkpointId: 'ckp_test0001', turnId: TURN })
  })

  it('error：lastError 记录，fatal 透传（toast / 全屏错误态数据源）', () => {
    const s = reduce(
      seeded(),
      ev('error', { scope: 'llm', message: '429', fatal: true }, { seq: 2 }),
    )
    expect(s.byId[SID]?.lastError).toEqual({ scope: 'llm', message: '429', fatal: true })
  })
})

describe('去重规则（回放×直播重叠，§6.4）', () => {
  it('durable seq <= lastSeq 跳过（全局直播先到、REST 回放后到不重复应用）', () => {
    let s = seeded() // lastSeq=1
    s = reduce(s, ev('user.message', { text: '直播先到' }, { seq: 5 }))
    expect(itemsOf(s)).toHaveLength(1)
    // 回放的同一行（seq=5，<= lastSeq）再到达 → 跳过
    s = reduce(s, ev('user.message', { text: '直播先到' }, { seq: 5 }))
    expect(itemsOf(s)).toHaveLength(1)
    // 乱序旧 durable（seq=3）也被吸附
    s = reduce(s, ev('user.message', { text: '乱序旧事件' }, { seq: 3 }))
    expect(itemsOf(s)).toHaveLength(1)
  })

  it('live 事件无 seq：无条件应用（delta 不去重）', () => {
    let s = seeded()
    s = reduce(s, ev('user.message', { text: 'durable' }, { seq: 9 }))
    s = reduce(s, ev('assistant.delta', { turnId: TURN, text: 'a' }))
    s = reduce(s, ev('assistant.delta', { turnId: TURN, text: 'b' }))
    const a = itemsOf(s).at(-1)
    expect(a).toMatchObject({ kind: 'assistant', streaming: { textBuf: 'ab' } })
  })

  it('lastSeq 单调推进（max 而非盲写）', () => {
    let s = seeded() // lastSeq=1
    s = reduce(s, ev('user.message', { text: 'x' }, { seq: 7 }))
    expect(s.byId[SID]?.lastSeq).toBe(7)
    s = reduce(s, ev('user.message', { text: 'y' }, { seq: 4 })) // 吸附，不改写 lastSeq
    expect(s.byId[SID]?.lastSeq).toBe(7)
  })
})

describe('全链路：normal 场景形状串联', () => {
  it('user→reasoning→assistant delta→tool→approval→turn 完成', () => {
    const CALL = ids.call('cal_full0001')
    const REQ = ids.request('req_full0001')
    let s = seeded()
    const seq = () => ({ seq: (s.byId[SID]?.lastSeq ?? 0) + 1 })

    s = reduce(s, ev('user.message', { text: '改一下配置' }, seq()))
    s = reduce(
      s,
      ev('turn.started', { turnId: TURN, delivery: 'now', userEventId: ids.event('evt_u') }, seq()),
    )
    s = reduce(s, ev('reasoning.delta', { turnId: TURN, text: '先读' }))
    s = reduce(s, ev('reasoning.ended', { turnId: TURN, text: '先读文件' }, seq()))
    s = reduce(
      s,
      ev(
        'assistant.message',
        {
          turnId: TURN,
          content: [{ type: 'toolCall', callId: CALL, name: 'edit', input: { path: '/c' } }],
        },
        seq(),
      ),
    )
    s = reduce(
      s,
      ev(
        'permission.asked',
        { requestId: REQ, callId: CALL, action: 'edit', resource: '/c', reason: '编辑' },
        seq(),
      ),
    )
    s = reduce(s, ev('permission.resolved', { requestId: REQ, reply: 'once' }, seq()))
    s = reduce(
      s,
      ev(
        'tool.started',
        { turnId: TURN, callId: CALL, name: 'edit', input: { path: '/c' } },
        seq(),
      ),
    )
    s = reduce(s, ev('tool.progress', { turnId: TURN, callId: CALL, chunk: 'wrote 3 lines' }))
    s = reduce(
      s,
      ev(
        'tool.completed',
        { turnId: TURN, callId: CALL, output: 'ok', isError: false, durationMs: 5 },
        seq(),
      ),
    )
    s = reduce(s, ev('assistant.delta', { turnId: TURN, text: '已改好' }))
    s = reduce(
      s,
      ev(
        'assistant.message',
        { turnId: TURN, content: [{ type: 'text', text: '已改好。' }] },
        seq(),
      ),
    )
    s = reduce(
      s,
      ev(
        'turn.completed',
        { turnId: TURN, finish: 'stop', usage: { inputTokens: 3, outputTokens: 4 } },
        seq(),
      ),
    )

    const slice = s.byId[SID]
    expect(slice?.activeTurn).toBeNull()
    // §6.4：usage 只在 turn.completed 累计（assistant.message 的 usage 不重复计）
    expect(slice?.usageTotal).toMatchObject({ inputTokens: 3, outputTokens: 4 })
    expect(itemsOf(s).map((i) => i.kind)).toEqual([
      'user',
      'reasoning',
      'assistant',
      'tool',
      'approval',
      'assistant',
    ])
  })
})
