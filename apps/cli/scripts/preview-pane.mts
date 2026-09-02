// MessagePane 高度预算调试/预览器（工单 10.33 伴随）：构造 8 条未定稿流式行，
// 对比 maxLiveRows=3 与无预算两态的帧——验证窗口化（尾部保留 + 折叠行）。
// `pnpm -C apps/cli exec tsx scripts/preview-pane.mts`
import React from 'react'
import { render } from 'ink-testing-library'
import { ids, emptySessionSlice } from '@spark/protocol'
import { MessagePane } from '../src/components/MessagePane.js'

const s = emptySessionSlice(ids.session('ses_dbg00000000000001'))
s.items = Array.from({ length: 8 }, (_, i) => ({
  kind: 'assistant',
  eventId: ids.event(`evt_l${i}`),
  content: [],
  streaming: { textBuf: `流式片段 ${i}` },
}))

const { lastFrame } = render(React.createElement(MessagePane, { slice: s, maxLiveRows: 3 }))
console.log('=== maxLiveRows=3 ===')
console.log(lastFrame())
const unbudget = render(React.createElement(MessagePane, { slice: s })).lastFrame() ?? ''
console.log('=== 无预算（行数）===', unbudget.split('\n').length)
