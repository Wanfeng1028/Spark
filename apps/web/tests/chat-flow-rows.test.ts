/**
 * web 端会话流派生单测（工单 R-B 下沉后仅留端特有）：搜索跳转的行定位。
 * 共享核（toolCategoryOf / flowRowsOf + 显示选项）的用例已随实现移入
 * packages/protocol/tests/flow-rows.test.ts——此处只留 web 独有派生的回归网。
 */
import { describe, expect, it } from 'vitest'
import { flowRowsOf, ids } from '@spark/protocol'
import type { UiItem } from '@spark/protocol'
import { rowIndexOfEvent } from '@/features/chat/chat-flow-rows'

function tool(name: string, n: number): UiItem {
  return {
    kind: 'tool',
    eventId: ids.event(`evt_tool00${n}`),
    callId: ids.call(`cal_tool00${n}`),
    name,
    input: {},
    status: 'completed',
    progressBuf: '',
  }
}

function user(n: number): UiItem {
  return { kind: 'user', eventId: ids.event(`evt_user00${n}`), text: 'x' }
}

describe('rowIndexOfEvent（搜索跳转行定位）', () => {
  it('命中组内工具与单项', () => {
    const rows = flowRowsOf([user(1), tool('bash', 1), tool('bash', 2)])
    expect(rowIndexOfEvent(rows, 'evt_user001')).toBe(0)
    expect(rowIndexOfEvent(rows, 'evt_tool002')).toBe(1)
    expect(rowIndexOfEvent(rows, 'evt_none000')).toBe(-1)
  })
})
