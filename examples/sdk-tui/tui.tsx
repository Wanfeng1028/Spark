/**
 * examples/sdk-tui —— 自定义 TUI 骨架（工单 14.5 要求 3：≤300 行，Ink + applyEvent 驱动四区极简版）。
 *
 * 论点：**自己写一个终端前端，需要的是 SDK + 四端同款 reducer，不是 Spark 的内部件**。
 * 本文件只用了三样东西：`createClient`（HTTP 通道）、protocol 的 `applyEvent`（投影）、Ink（渲染）。
 * 与 apps/cli 的区别：cli 是产品级 TUI（命令面板/审批键位/上下文水位/整屏重印…），
 * 这里是**骨架**——四区各一小段，够跑通"发一句、看到流式回复、能审批提示"，供第三方照抄改造。
 *
 * 四区（对应 DESIGN §13.K 的纯单栏形态，极简版）：
 *   ① 头部：基址 + 会话标题 + 运行态（从 activeTurn 派生，不从 meta 读）
 *   ② 流：applyEvent 投影出的 UiItem 尾部若干条
 *   ③ 输入：单行草稿
 *   ④ 底部：键位提示 + 错误如实呈现（失败闭合，不吞不装）
 *
 * 跑法：先 `pnpm --filter server dev`，再 `pnpm --filter @spark/example-tui start`
 * （基址用 SPARK_API 覆盖，缺省 http://127.0.0.1:4318）。Ctrl+C 退出。
 */
import { useEffect, useMemo, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { applyEvent, emptySessionSlice } from '@spark/protocol'
import type { ProjectionState, SessionId, UiItem } from '@spark/protocol'
import { createClient } from '@spark/sdk'

/** 流的可见条数（骨架不做滚动/整屏重印——真要做参考 apps/cli 的 staticEpoch 机制） */
const VISIBLE_ITEMS = 12

const baseUrl = process.env['SPARK_API'] ?? 'http://127.0.0.1:4318'

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** UiItem → 一行文本（骨架版：不做工具归类、不做流式光标，够看清形状即可） */
function lineOf(item: UiItem): { label: string; text: string; dim: boolean } {
  switch (item.kind) {
    case 'user':
      return { label: '你', text: item.text, dim: false }
    case 'assistant': {
      const parts: string[] = []
      for (const block of item.content) if (block.type === 'text') parts.push(block.text)
      // 流式增量已由 applyEvent 攒进 streaming.textBuf（本页不必自己拼 delta）
      if (item.streaming !== undefined) parts.push(item.streaming.textBuf)
      return { label: 'AI', text: parts.join(''), dim: false }
    }
    case 'reasoning':
      return { label: '思考', text: item.text, dim: true }
    case 'tool': {
      const cost = item.durationMs !== undefined ? ` · ${Math.round(item.durationMs)}ms` : ''
      return { label: '工具', text: `${item.name} · ${item.status}${cost}`, dim: true }
    }
    case 'approval': {
      const state = item.status === 'pending' ? '待决' : `已决（${item.reply ?? '-'}）`
      return { label: '审批', text: `${state}：${item.action} ${item.resource}——${item.reason}`, dim: false }
    }
    case 'turn':
      return {
        label: '回合',
        text: item.finish === undefined ? '进行中…' : `结束（${item.finish}）`,
        dim: true,
      }
    default:
      // 词表新增 kind 而本骨架没跟上时：如实显示"未识别"而不静默丢行
      // （渲染层的失败闭合；与引擎对 ignorable 事件的态度一致：不认识就明说）
      return { label: '未识别', text: '（本骨架未覆盖的新事件项）', dim: true }
  }
}

function App() {
  const { exit } = useApp()
  // 客户端只装配一次（App 级资源；不随重渲重建，否则会重复起 SSE）
  const client = useMemo(() => createClient(baseUrl), [])
  const [state, setState] = useState<ProjectionState>({ byId: {}, activeId: null })
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  // 直播 + 冷启动回放：与四端同一条路径（同一个 reducer，重叠靠 seq 吸附去重）
  useEffect(() => {
    const off = client.events.subscribe((e) => {
      setState((s) => applyEvent(s, e))
    })
    let cancelled = false
    void (async () => {
      try {
        const sessions = await client.sessions.list()
        const first = sessions[0]
        const sid: SessionId = first !== undefined ? first.id : (await client.sessions.create()).id
        const dto = await client.events.replay(sid)
        if (cancelled) return
        setState((s) => {
          let next: ProjectionState = {
            ...s,
            activeId: sid,
            byId: { ...s.byId, [sid]: s.byId[sid] ?? emptySessionSlice(sid) },
          }
          for (const e of dto.events ?? []) next = applyEvent(next, e)
          return next
        })
      } catch (err) {
        if (!cancelled) setNotice(messageOf(err))
      }
    })()
    return () => {
      cancelled = true
      off()
      client.close() // 只退订（客户端资源）；引擎在 server 那边，与本进程无关
    }
  }, [client])

  async function submit(): Promise<void> {
    const text = draft.trim()
    if (text === '') return
    setDraft('')
    try {
      // 没会话就现建一个（骨架不做会话选择；多会话切换参考 apps/cli 的 /resume）
      const sid = state.activeId ?? (await client.sessions.create()).id
      if (state.activeId === null) {
        setState((s) => ({ ...s, activeId: sid, byId: { ...s.byId, [sid]: emptySessionSlice(sid) } }))
      }
      await client.sessions.send(sid, text, { delivery: 'now' })
      setNotice(null)
    } catch (err) {
      setNotice(messageOf(err)) // 失败如实呈现，不清空草稿以外的状态
    }
  }

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit()
      return
    }
    if (key.return) {
      void submit()
      return
    }
    if (key.backspace || key.delete) {
      setDraft((d) => d.slice(0, -1))
      return
    }
    // 单码元判定（同 apps/cli 的做法）：IME 组合输入会一次给多码元，直接拼会串字
    if (input.length === 1 && !key.ctrl && !key.meta) setDraft((d) => d + input)
  })

  const sid = state.activeId
  const slice = sid === null ? undefined : state.byId[sid]
  const turn = slice?.activeTurn ?? null
  const busy = turn === null ? '空闲' : turn.waiting ? '等审批' : `进行中（第 ${turn.stepCount} 步）`
  const items = slice?.items ?? []
  const visible = items.slice(-VISIBLE_ITEMS)

  return (
    <Box flexDirection="column">
      {/* ① 头部 */}
      <Box>
        <Text bold>Spark TUI 骨架</Text>
        <Text dimColor>
          {'  '}
          {baseUrl} · {slice?.meta.title === '' || slice === undefined ? '新会话' : slice.meta.title} · {busy}
        </Text>
      </Box>

      {/* ② 流（投影结果；骨架只显尾部若干条） */}
      <Box flexDirection="column" marginTop={1}>
        {visible.length === 0 ? <Text dimColor>（暂无内容，输入一句话试试）</Text> : null}
        {visible.map((item) => {
          const line = lineOf(item)
          return (
            <Box key={item.id}>
              <Text dimColor={line.dim}>{`${line.label} `}</Text>
              <Text dimColor={line.dim} wrap="wrap">
                {line.text}
              </Text>
            </Box>
          )
        })}
      </Box>

      {/* ③ 输入 */}
      <Box marginTop={1}>
        <Text>{`› ${draft}`}</Text>
      </Box>

      {/* ④ 底部：键位 + 错误 */}
      <Box flexDirection="column">
        <Text dimColor>Enter 发送 · Backspace 删除 · Ctrl+C 退出</Text>
        {notice !== null ? <Text color="red">{notice}</Text> : null}
      </Box>
    </Box>
  )
}

void render(<App />).waitUntilExit()
