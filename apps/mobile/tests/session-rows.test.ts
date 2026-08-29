/**
 * 会话页纯函数单测（工单 9.3）：分页合并 / 时间戳分隔判定与格式化 /
 * 消息行构建（含审批事件投影快照）/ Composer 自增高度。
 */
import type { SparkEventEnvelope } from '@spark/protocol'
import { applyEvent, emptySessionSlice, ids } from '@spark/protocol'
import type { ProjectionState } from '@spark/protocol'
import {
  COMPOSER_BASE_HEIGHT,
  COMPOSER_LINE_HEIGHT,
  TIMESTAMP_GAP_MS,
  buildSessionRows,
  composerHeight,
  composerLinesFromContentSize,
  formatTimestamp,
  mergeEventPage,
  shouldInsertTimestamp,
} from '../src/session/session-rows'

const SID = ids.session('ses_rows_test')
const TID = ids.turn('trn_rows_test_1')

let eventNo = 0
function eid(): string {
  eventNo += 1
  return `evt_rows_${eventNo}`
}

function env(
  type: SparkEventEnvelope['type'],
  time: number,
  seq: number | undefined,
  data: SparkEventEnvelope['data'],
): SparkEventEnvelope {
  return {
    id: ids.event(eid()),
    sessionId: SID,
    time,
    ...(seq !== undefined ? { seq } : {}),
    type,
    data,
  }
}

describe('mergeEventPage——分页升序合并', () => {
  const mk = (seq: number) => env('user.message', 1000 + seq, seq, { text: `m${seq}` })

  it('较旧一页并入既有窗口：按 seq 升序输出', () => {
    const older = [mk(1), mk(2)]
    const existing = [mk(3), mk(4), mk(5)]
    const merged = mergeEventPage(older, existing)
    expect(merged.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5])
  })

  it('按 id 去重：重复页幂等（弱网重试安全）', () => {
    const page = [mk(1), mk(2)]
    const once = mergeEventPage(page, [mk(3)])
    const twice = mergeEventPage(page, once)
    expect(twice.length).toBe(once.length)
    expect(twice.map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('live 事件（无 seq）保持到达序置于尾部', () => {
    const live = env('assistant.delta', 9999, undefined, { turnId: TID, text: '增量' })
    const merged = mergeEventPage([mk(1)], [mk(2), live])
    expect(merged.map((e) => e.seq)).toEqual([1, 2, undefined])
  })
})

describe('时间戳分隔判定与格式化', () => {
  it('间隔 >30 分钟插分隔；恰 30 分钟不插；时间缺失不插', () => {
    const base = 1_700_000_000_000
    expect(shouldInsertTimestamp(base, base + TIMESTAMP_GAP_MS + 1)).toBe(true)
    expect(shouldInsertTimestamp(base, base + TIMESTAMP_GAP_MS)).toBe(false)
    expect(shouldInsertTimestamp(undefined, base)).toBe(false)
    expect(shouldInsertTimestamp(base, undefined)).toBe(false)
  })

  it('"7月25日 18:30" 式格式（本机时区）', () => {
    const ms = new Date(2026, 6, 25, 18, 30).getTime()
    expect(formatTimestamp(ms)).toBe('7月25日 18:30')
    const morning = new Date(2026, 11, 3, 8, 5).getTime()
    expect(formatTimestamp(morning)).toBe('12月3日 08:05')
  })
})

describe('buildSessionRows——消息行构建', () => {
  it('相邻消息间隔 >30 分钟插居中时间戳行', () => {
    const t0 = 1_700_000_000_000
    const u1 = env('user.message', t0, 1, { text: '早' })
    const u2 = env('user.message', t0 + 40 * 60 * 1000, 2, { text: '晚' })
    let s: ProjectionState = { byId: {}, activeId: SID }
    s = applyEvent(s, u1)
    s = applyEvent(s, u2)
    const slice = s.byId[SID] ?? emptySessionSlice(SID)
    const timeOf = (id: string) => (id === u1.id ? t0 : t0 + 40 * 60 * 1000)
    const rows = buildSessionRows(slice.items, (id) => timeOf(id))
    expect(rows.map((r) => r.kind)).toEqual(['item', 'timestamp', 'item'])
    const divider = rows[1]
    expect(divider?.kind === 'timestamp' && divider.time).toBe(t0 + 40 * 60 * 1000)
  })

  it('审批事件的投影快照（pending → resolved 行形稳定）', () => {
    const asked = env('permission.asked', 5000, 1, {
      requestId: ids.request('req_rows_1'),
      callId: ids.call('cal_rows_perm'),
      action: 'bash',
      resource: 'rm -rf /tmp/x',
      reason: '命令含删除语义',
    })
    const resolved = env('permission.resolved', 6000, 2, {
      requestId: ids.request('req_rows_1'),
      reply: 'once',
    })
    let s: ProjectionState = { byId: {}, activeId: SID }
    s = applyEvent(s, asked)
    const rowsPending = buildSessionRows((s.byId[SID] ?? emptySessionSlice(SID)).items, () => 5000)
    expect(rowsPending).toMatchSnapshot()
    s = applyEvent(s, resolved)
    const rowsResolved = buildSessionRows((s.byId[SID] ?? emptySessionSlice(SID)).items, () => 5000)
    expect(rowsResolved).toMatchSnapshot()
  })

  it('tool/approval 行 key 以 callId/requestId 稳定化', () => {
    const msg = env(
      'assistant.message',
      1000,
      1,
      {
        turnId: TID,
        content: [{ type: 'toolCall', callId: ids.call('cal_rows_1'), name: 'bash', input: {} }],
      },
    )
    let s: ProjectionState = { byId: {}, activeId: SID }
    s = applyEvent(s, msg)
    const rows = buildSessionRows((s.byId[SID] ?? emptySessionSlice(SID)).items, () => 1000)
    expect(rows.map((r) => r.key)).toContain('tool-cal_rows_1')
  })
})

describe('Composer 自增高度', () => {
  it('单行 52 起、每行 +20、6 行封顶', () => {
    expect(composerHeight(1)).toBe(COMPOSER_BASE_HEIGHT)
    expect(composerHeight(2)).toBe(COMPOSER_BASE_HEIGHT + COMPOSER_LINE_HEIGHT)
    expect(composerHeight(6)).toBe(COMPOSER_BASE_HEIGHT + 5 * COMPOSER_LINE_HEIGHT)
    expect(composerHeight(99)).toBe(COMPOSER_BASE_HEIGHT + 5 * COMPOSER_LINE_HEIGHT)
    expect(composerHeight(0)).toBe(COMPOSER_BASE_HEIGHT)
  })

  it('contentSize 高度 → 行数（1 起步 6 封顶）', () => {
    expect(composerLinesFromContentSize(20)).toBe(1)
    expect(composerLinesFromContentSize(41)).toBe(3)
    expect(composerLinesFromContentSize(400)).toBe(6)
    expect(composerLinesFromContentSize(0)).toBe(1)
  })
})
