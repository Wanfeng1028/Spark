/**
 * examples/sdk-viewer —— 最小 web viewer（工单 14.5 要求 1：≤150 行）。
 *
 * 论点：**第三方 UI 就是事件流的投影**。本页没有一行 Spark 业务逻辑——只有三件事：
 * `createClient`（拿事件）、protocol 的 `applyEvent`（四端同款 reducer）、渲染 DOM。
 * 会话状态、工具归类与耗时、审批状态、流式增量全由 applyEvent 算出来；本页**只读不写**
 * （要发消息就 `client.sessions.send`，本例刻意不做，以突出"只读投影"这一点）。
 *
 * 跑法：先 `pnpm --filter server dev`，再 `pnpm --filter @spark/example-viewer dev`
 * （`vite.config.ts` 把 /api 与 SSE 代理到 127.0.0.1:4318，故 baseUrl 用同源空串）。
 */
import { applyEvent, emptySessionSlice, ids } from '@spark/protocol'
import type { ProjectionState, SessionId, UiItem } from '@spark/protocol'
import { createClient } from '@spark/sdk'

const client = createClient(import.meta.env.VITE_SPARK_API ?? '')

let state: ProjectionState = { byId: {}, activeId: null }

/** 骨架元素必存（不存就是页面写错了）——用帮助函数拿到非空类型，就不用非空断言 */
function need<T>(value: T | null, selector: string): T {
  if (value === null) throw new Error(`viewer: 页面骨架缺 ${selector}`)
  return value
}

const picker = need(document.querySelector<HTMLSelectElement>('#picker'), '#picker')
const statusEl = need(document.querySelector<HTMLSpanElement>('#status'), '#status')
const stream = need(document.querySelector<HTMLDivElement>('#stream'), '#stream')

function text(value: string): Text {
  return document.createTextNode(value)
}

function who(label: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.className = 'who'
  el.append(text(label))
  return el
}

/** UiItem → DOM。一律 textContent/createTextNode 写值，不拿用户数据拼 innerHTML（XSS） */
function rowOf(item: UiItem): HTMLElement {
  const el = document.createElement('div')
  el.className = 'row'
  switch (item.kind) {
    case 'user':
      el.append(who('你'), text(item.text))
      break
    case 'assistant': {
      el.append(who('AI'))
      for (const block of item.content) if (block.type === 'text') el.append(text(block.text))
      // 流式增量：applyEvent 已把 assistant.delta 攒进 streaming.textBuf（本页不必自己拼）
      if (item.streaming !== undefined) el.append(text(item.streaming.textBuf))
      break
    }
    case 'reasoning':
      el.className = 'row muted'
      el.append(who('思考'), text(item.text))
      break
    case 'tool': {
      el.className = 'row muted'
      const cost = item.durationMs !== undefined ? ` · ${Math.round(item.durationMs)}ms` : ''
      el.append(text(`工具 ${item.name} · ${item.status}${cost}`))
      break
    }
    case 'approval': {
      // 只读提示：本例不应答审批（应答是宿主的责任，见 doc/02 §4.8 ④）
      el.className = 'row approval'
      const reply = item.reply !== undefined ? ` → ${item.reply}` : ''
      const label = item.status === 'pending' ? '待决' : '已决'
      el.append(text(`审批${label}：${item.action} ${item.resource}${reply}`))
      el.append(document.createElement('br'), text(item.reason))
      break
    }
    case 'turn':
      el.className = 'turn'
      el.append(text(item.finish === undefined ? '回合进行中…' : `回合结束（${item.finish}）`))
      break
  }
  return el
}

function render(): void {
  const sid = state.activeId
  stream.replaceChildren()
  if (sid === null) {
    statusEl.textContent = '未选会话'
    return
  }
  const slice = state.byId[sid]
  if (slice === undefined) return
  // 运行态从投影派生（不从 meta 读）：SessionMeta 没有 status 字段——四端的"忙不忙"
  // 一律由 activeTurn 算出（waiting = 等审批），这正是"UI = 事件流投影"的具体体现
  const turn = slice.activeTurn
  const busy = turn === null ? '空闲' : turn.waiting ? '等审批' : `进行中（第 ${turn.stepCount} 步）`
  statusEl.textContent = `${slice.meta.title === '' ? '新会话' : slice.meta.title} · ${busy}`
  if (slice.items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'row muted'
    empty.append(text('（暂无内容）'))
    stream.append(empty)
    return
  }
  for (const item of slice.items) stream.append(rowOf(item))
}

/** 打开一个会话：先回放（与四端同一条冷启动路径），之后直播增量由订阅推 */
async function open(sid: SessionId): Promise<void> {
  const seeded = state.byId[sid] === undefined ? emptySessionSlice(sid) : state.byId[sid]
  state = { ...state, activeId: sid, byId: { ...state.byId, [sid]: seeded } }
  const dto = await client.events.replay(sid)
  for (const e of dto.events ?? []) state = applyEvent(state, e) // seq 去重由 reducer 负责
  render()
}

// 直播：同一个 reducer、同一份状态——回放与直播重叠靠 seq 吸附（doc/02 §6.4）
client.events.subscribe((e) => {
  state = applyEvent(state, e)
  if (e.sessionId === state.activeId) render()
})

const sessions = await client.sessions.list()
for (const s of sessions) {
  const opt = document.createElement('option')
  opt.value = s.id
  opt.textContent = s.title === '' ? '新会话' : s.title
  picker.append(opt)
}
picker.addEventListener('change', () => {
  void open(ids.session(picker.value))
})
if (sessions[0] !== undefined) {
  await open(sessions[0].id)
} else {
  statusEl.textContent = '没有会话（先在 web 或 cli 里建一个）'
}
