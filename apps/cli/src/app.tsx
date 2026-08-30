/**
 * App（阶段八工单 8.2 四区骨架 / 8.3 核心交互 / 8.4 续播与优雅退出）：
 * 会话列表侧栏（<80 列隐藏）/ 消息流 / 输入框 / 状态细条。
 * 数据通道：HttpTransport（REST-only）+ SessionEventSource（会话级 since=seq 续播流）；
 * UI 状态只来自事件流（AGENTS §2.7）——侧栏为连接/重连时刻 REST 快照。
 */
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HttpTransport, SessionEventSource, errorMessageOf, humanizeError } from '@spark/protocol'
import type { RequestId, SparkEventEnvelope } from '@spark/protocol'
import { useCliStore } from './store.js'
import { Sidebar } from './components/Sidebar.js'
import { MessagePane } from './components/MessagePane.js'
import { InputBox } from './components/InputBox.js'
import { StatusBar } from './components/StatusBar.js'
import { ApprovalPrompt } from './components/ApprovalPrompt.js'
import type { ApprovalItem } from './components/ApprovalPrompt.js'

/** 双击 Ctrl+C 判定窗口 */
const CTRL_C_WINDOW_MS = 800
/** resize 判定（ADR D19：<80 列隐藏侧栏） */
const SIDEBAR_MIN_COLUMNS = 80

export function App({ baseUrl }: { baseUrl: string }) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 80
  const rows = stdout?.rows ?? 24

  // REST-only transport（事件流走会话级 SessionEventSource——since=seq 续播，工单 8.4）
  const transport = useMemo(() => new HttpTransport({ baseUrl, eventStream: false }), [baseUrl])
  const exitingRef = useRef(false)

  const activeSessionId = useCliStore((s) => s.activeSessionId)
  const delivery = useCliStore((s) => s.delivery)
  const notice = useCliStore((s) => s.notice)
  const slice = useCliStore((s) =>
    s.activeSessionId === null ? null : (s.byId[s.activeSessionId] ?? null),
  )

  /** 挂起审批（至多一条待答——引擎审批串行；取第一条 pending） */
  const pendingApproval = useMemo(
    () =>
      (slice?.items.find(
        (it): it is ApprovalItem => it.kind === 'approval' && it.status === 'pending',
      ) ?? null),
    [slice],
  )

  /** 拒绝反馈模式（n 之后展开——工单 8.3） */
  const [rejecting, setRejecting] = useState<RequestId | null>(null)
  const lastCtrlCRef = useRef(0)

  // ---------- 启动：会话列表 + 模型目录 ----------

  useEffect(() => {
    let disposed = false
    transport
      .listSessions()
      .then((list) => {
        if (disposed) return
        useCliStore.getState().setSessions(list)
        const first = [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        if (first !== undefined) {
          useCliStore.getState().setActiveSession(first.id)
        } else {
          return transport.createSession().then((dto) => {
            if (disposed) return
            useCliStore.getState().setSessions([dto])
            useCliStore.getState().setActiveSession(dto.id)
          })
        }
      })
      .catch((err: unknown) => {
        if (!disposed) useCliStore.getState().setNotice(errorMessageOf(err))
      })
    // 模型目录：水位计算用；失败静默（水位如实缺省，不阻塞）
    transport
      .listModels()
      .then((m) => {
        if (!disposed) useCliStore.getState().setModels(m)
      })
      .catch(() => undefined)
    return () => {
      disposed = true
    }
  }, [transport])

  // ---------- 会话级事件流（含断线退避重连 + since=seq 续播） ----------

  useEffect(() => {
    if (activeSessionId === null) return
    const store = useCliStore.getState()
    const source = new SessionEventSource({
      baseUrl,
      sessionId: activeSessionId,
      since: 0,
      onStatus: (s) => {
        useCliStore.getState().setStatus(s)
        // 连接/重连成功：刷新侧栏快照（自动化等外部新建会话于此可见）
        if (s === 'open') {
          transport
            .listSessions()
            .then((list) => useCliStore.getState().setSessions(list))
            .catch(() => undefined)
        }
      },
      onEvent: (e: SparkEventEnvelope) => {
        store.apply(e)
      },
    })
    return () => {
      source.dispose()
    }
  }, [activeSessionId, baseUrl, transport])

  // ---------- 优雅退出（工单 8.4：无悬挂 turn） ----------

  const quit = useMemo(
    () => (): void => {
      if (exitingRef.current) return
      exitingRef.current = true
      const sid = useCliStore.getState().activeSessionId
      const turn = sid === null ? null : (useCliStore.getState().byId[sid]?.activeTurn ?? null)
      const done = (): void => {
        transport.dispose()
        exit()
      }
      if (sid !== null && turn !== null) {
        // 在途 turn 先中断再退——不悬挂（失败不阻塞退出）
        void transport.interrupt(sid).finally(done)
      } else {
        done()
      }
    },
    [transport, exit],
  )

  useEffect(() => {
    process.on('SIGINT', quit)
    return () => {
      process.removeListener('SIGINT', quit)
    }
  }, [quit])

  // ---------- 交互 ----------

  function replyApproval(
    requestId: RequestId,
    reply: 'once' | 'always' | 'reject',
    feedback?: string,
  ): void {
    transport
      .replyPermission(requestId, reply, feedback)
      .catch((err: unknown) => useCliStore.getState().setNotice(errorMessageOf(err)))
  }

  function switchSession(offset: 1 | -1): void {
    const { sessions: list, activeSessionId: sid, setActiveSession } = useCliStore.getState()
    if (list.length === 0) return
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt)
    const i = sorted.findIndex((s) => s.id === sid)
    const next = sorted[(i + offset + sorted.length) % sorted.length]
    if (next !== undefined) setActiveSession(next.id)
  }

  function submit(text: string): void {
    const { activeSessionId: sid, delivery: mode, setNotice } = useCliStore.getState()
    setNotice(null)
    if (sid === null) return

    // 命令路径（工单 7.4 注册表）：/ 前缀走 executeCommand（/compact 与自定义 .md 同端点）
    if (text.startsWith('/')) {
      const body = text.slice(1)
      const sp = body.indexOf(' ')
      const name = sp === -1 ? body : body.slice(0, sp)
      const args = sp === -1 ? undefined : body.slice(sp + 1).trim()
      if (name === '') return
      transport
        .executeCommand(sid, name, args !== '' ? args : undefined)
        .catch((err: unknown) => setNotice(errorMessageOf(err)))
      return
    }

    transport
      .sendMessage(sid, text, { delivery: mode })
      .catch((err: unknown) => setNotice(errorMessageOf(err)))
  }

  useInput((input, key) => {
    // Ctrl+C 双击退出（工单 8.3）；单击提示
    if (key.ctrl && input === 'c') {
      const now = Date.now()
      if (now - lastCtrlCRef.current < CTRL_C_WINDOW_MS) {
        quit()
      } else {
        lastCtrlCRef.current = now
        useCliStore.getState().setNotice('再按一次 Ctrl+C 退出')
      }
      return
    }
    if (key.escape) {
      if (rejecting !== null) {
        setRejecting(null) // 拒绝反馈中途取消
        return
      }
      // Esc 中断 turn（工单 8.3）；无 turn 时清提示
      const { activeSessionId: sid } = useCliStore.getState()
      if (sid !== null) {
        transport.interrupt(sid).catch((err: unknown) => {
          useCliStore.getState().setNotice(errorMessageOf(err))
        })
      }
      return
    }
    if (key.tab) {
      useCliStore.getState().cycleDelivery()
      return
    }
    if (key.ctrl && input === 'n') {
      transport
        .createSession()
        .then((dto) => {
          const st = useCliStore.getState()
          st.setSessions([...st.sessions, dto])
          st.setActiveSession(dto.id)
        })
        .catch((err: unknown) => useCliStore.getState().setNotice(errorMessageOf(err)))
      return
    }
    if (key.pageUp || key.pageDown) {
      switchSession(key.pageUp ? -1 : 1)
      return
    }
    if (key.ctrl && input === 'o') {
      // 展开/折叠最近一个工具或思考条目（工单 8.3）
      const s = useCliStore.getState()
      const items2 = s.activeSessionId === null ? [] : (s.byId[s.activeSessionId]?.items ?? [])
      for (let i = items2.length - 1; i >= 0; i--) {
        const it = items2[i]
        if (it === undefined) continue
        if (it.kind === 'tool') {
          s.toggleTool(it.callId)
          return
        }
        if (it.kind === 'reasoning') {
          s.toggleReasoning(it.eventId)
          return
        }
      }
      return
    }
    // 审批键（挂起且非反馈模式时接管——工单 8.3：y 一次 / a 总是 / n 拒绝）
    if (pendingApproval !== null && rejecting === null) {
      if (input === 'y') {
        replyApproval(pendingApproval.requestId, 'once')
        return
      }
      if (input === 'a') {
        replyApproval(pendingApproval.requestId, 'always')
        return
      }
      if (input === 'n') {
        setRejecting(pendingApproval.requestId)
      }
    }
  })

  // ---------- 提示行：REST 失败优先；引擎 error 事件人话化（共享文案表） ----------

  const errorLine = useMemo(() => {
    if (notice !== null) return notice
    const le = slice?.lastError
    if (le !== undefined && le !== null) return humanizeError(le.message).title
    return null
  }, [notice, slice])

  const inputActive = pendingApproval === null || rejecting !== null

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexGrow={1}>
        {columns >= SIDEBAR_MIN_COLUMNS ? <Sidebar /> : null}
        <MessagePane slice={slice} />
      </Box>
      {errorLine !== null ? <Text color="red">{errorLine}</Text> : null}
      {pendingApproval !== null && rejecting === null ? (
        <ApprovalPrompt item={pendingApproval} />
      ) : null}
      {rejecting !== null ? (
        <InputBox
          active
          prefix="拒绝理由："
          placeholder="填写后 Enter 确认拒绝，Esc 取消"
          onSubmit={(text) => {
            replyApproval(rejecting, 'reject', text)
            setRejecting(null)
          }}
        />
      ) : (
        <InputBox
          active={inputActive}
          prefix={`[${delivery}] > `}
          placeholder={
            pendingApproval !== null
              ? '等待审批——y 允许一次 / a 总是允许 / n 拒绝'
              : '输入消息，Enter 发送；/ 开头为命令；? 见键位'
          }
          onSubmit={submit}
        />
      )}
      <StatusBar slice={slice} />
    </Box>
  )
}
