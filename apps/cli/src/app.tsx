/**
 * App（阶段十工单 10.8 纯单栏重构 / 10.10 面板族 / 10.11 收口，§13.K）：
 * 单栏会话优先（ADR D19 修订——砍会话列表侧栏）：消息流 / 输入框 / footer 双行；
 * 会话管理退 /new 与 /resume（§13.K 决策③）；面板族（帮助 ? / 恢复 / 统计）覆盖内容区；
 * slash 菜单悬于输入区上方（/ 前缀即开，↑↓ 选择，(1/N) 分页）。
 * 数据通道：HttpTransport（REST-only）+ SessionEventSource（会话级 since=seq 续播流）；
 * UI 状态只来自事件流（AGENTS §2.7）——会话快照为连接/重连时刻 REST 快照。
 */
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HttpTransport, SessionEventSource, errorMessageOf, humanizeError } from '@spark/protocol'
import type { RequestId, SessionId, SparkEventEnvelope } from '@spark/protocol'
import { flowRowsOf } from './flow-rows.js'
import { useCliStore } from './store.js'
import { MessagePane } from './components/MessagePane.js'
import { InputBox } from './components/InputBox.js'
import { Footer } from './components/Footer.js'
import { BootHeader } from './components/BootHeader.js'
import { ApprovalPrompt } from './components/ApprovalPrompt.js'
import type { ApprovalItem } from './components/ApprovalPrompt.js'
import { HelpPanel } from './components/HelpPanel.js'
import { ResumePanel } from './components/ResumePanel.js'
import { StatsPanel } from './components/StatsPanel.js'
import { SlashMenu, SLASH_PAGE_SIZE, filterSlashCommands } from './components/SlashMenu.js'

/** 双击 Ctrl+C 判定窗口 */
const CTRL_C_WINDOW_MS = 800

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
  const panel = useCliStore((s) => s.panel)
  const sessions = useCliStore((s) => s.sessions)
  const models = useCliStore((s) => s.models)
  const commands = useCliStore((s) => s.commands)
  const draftPreview = useCliStore((s) => s.draftPreview)
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

  /** 拒绝反馈模式（3 之后展开——工单 8.3/10.9） */
  const [rejecting, setRejecting] = useState<RequestId | null>(null)
  /** /resume 预览态（工单 10.11 补齐 / §13.K K.7：Space 切换，选中即预览对象） */
  const [resumePreview, setResumePreview] = useState(false)
  /** 最近一次发送失败的文本（Ctrl+R 重试数据源——发送失败时引擎无 user 事件可回溯） */
  const lastFailedRef = useRef<string | null>(null)
  const lastCtrlCRef = useRef(0)

  // ---------- slash 菜单派生态（工单 10.10）：/ 前缀且未含空格即开 ----------

  const slashQuery =
    panel === 'none' && draftPreview.startsWith('/') && !draftPreview.includes(' ')
      ? draftPreview.slice(1)
      : null
  const slashItems = useMemo(
    () => (slashQuery === null ? [] : filterSlashCommands(commands, slashQuery)),
    [slashQuery, commands],
  )
  const [slashSelected, setSlashSelected] = useState(0)
  useEffect(() => {
    setSlashSelected(0) // 过滤词变化回位首项
  }, [slashQuery])
  const slashOpen = slashQuery !== null && commands.length > 0

  // ---------- /resume 面板派生态（工单 10.11）：过滤 = 输入框内容 ----------

  const resumeFiltered = useMemo(() => {
    const q = panel === 'resume' ? draftPreview.trim().toLowerCase() : ''
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    if (q === '') return sorted
    return sorted.filter((s) =>
      (s.title === '' ? '新会话' : s.title).toLowerCase().includes(q),
    )
  }, [panel, draftPreview, sessions])
  const [resumeSelected, setResumeSelected] = useState(0)
  useEffect(() => {
    setResumeSelected(0)
  }, [panel, draftPreview])
  // 预览态随面板关闭复位（预览对象只在 resume 面板内有意义）
  useEffect(() => {
    if (panel !== 'resume') setResumePreview(false)
  }, [panel])

  // ---------- 启动：会话快照 + 模型目录 + 命令注册表 ----------

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
    // 命令注册表（工单 10.10）：帮助面板与 slash 菜单数据源；失败如实空清单
    transport
      .listCommands()
      .then((c) => {
        if (!disposed) useCliStore.getState().setCommands(c)
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
        // 连接/重连成功：刷新会话快照（自动化等外部新建会话于此可见）
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

  // ---------- 动作 ----------

  function replyApproval(
    requestId: RequestId,
    reply: 'once' | 'always' | 'reject',
    feedback?: string,
  ): void {
    transport
      .replyPermission(requestId, reply, feedback)
      .catch((err: unknown) => useCliStore.getState().setNotice(errorMessageOf(err)))
  }

  function newSession(): void {
    transport
      .createSession()
      .then((dto) => {
        const st = useCliStore.getState()
        st.setSessions([...st.sessions, dto])
        st.setActiveSession(dto.id)
      })
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

  /** 恢复会话（工单 10.11）：切激活即触发事件流 since=0 全量重放（引擎既有回放路径） */
  function confirmResume(): void {
    const target = resumeFiltered[resumeSelected]
    if (target === undefined) return
    useCliStore.getState().setActiveSession(target.id)
    useCliStore.getState().setPanel('none')
    useCliStore.getState().setDraftPreview('')
  }

  function submit(text: string): void {
    const { delivery: mode, setNotice, setPanel: openPanel } = useCliStore.getState()
    setNotice(null)

    // /resume 面板内：Enter = 恢复选中会话（过滤文本不入命令通道）
    if (panel === 'resume') {
      confirmResume()
      return
    }

    const sid = useCliStore.getState().activeSessionId
    if (sid === null) return

    // 客户端命令（工单 10.8/10.11）：/new /resume /stats /help 本地执行，不进引擎
    if (text.startsWith('/')) {
      const body = text.slice(1)
      const sp = body.indexOf(' ')
      const rawName = sp === -1 ? body : body.slice(0, sp)
      // slash 菜单选中项优先于裸输入（工单 10.10）
      const name = (() => {
        if (slashOpen && slashItems.length > 0) {
          const sel = slashItems[slashSelected] ?? slashItems[0]
          return sel !== undefined ? sel.name : rawName
        }
        return rawName
      })()
      const args = sp === -1 ? undefined : body.slice(sp + 1).trim()
      if (name === '') return
      if (name === 'new') {
        newSession()
        return
      }
      if (name === 'resume') {
        openPanel('resume')
        return
      }
      if (name === 'stats') {
        openPanel('stats')
        return
      }
      if (name === 'help') {
        openPanel('help')
        return
      }
      // 引擎命令（工单 7.4 注册表）：/compact 与自定义 .md 同端点
      transport
        .executeCommand(sid, name, args !== '' ? args : undefined)
        .catch((err: unknown) => setNotice(errorMessageOf(err)))
      return
    }

    transport
      .sendMessage(sid, text, { delivery: mode })
      .catch((err: unknown) => {
        lastFailedRef.current = text // Ctrl+R 重试数据源（工单 10.11 / §13.K K.8）
        useCliStore.getState().setNotice(errorMessageOf(err))
      })
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
      // 面板优先关闭（键位表纪律：Esc 面板开放时先关面板）
      if (panel !== 'none') {
        useCliStore.getState().setPanel('none')
        useCliStore.getState().setDraftPreview('')
        return
      }
      if (rejecting !== null) {
        setRejecting(null) // 拒绝反馈中途取消
        return
      }
      // Esc 中断 turn（工单 8.3）；无 turn 时清提示
      const st = useCliStore.getState()
      if (st.activeSessionId !== null) {
        transport.interrupt(st.activeSessionId).catch((err: unknown) => {
          st.setNotice(errorMessageOf(err))
        })
      }
      st.setNotice(null)
      return
    }
    if (key.tab) {
      // 帮助面板内 Tab/Shift+Tab 切 tab（§13.K K.6）；其余循环提交模式
      if (panel === 'help') {
        useCliStore.getState().cycleHelpTab(key.shift ? -1 : 1)
        return
      }
      useCliStore.getState().cycleDelivery()
      return
    }
    // ? 帮助面板（工单 10.10）：仅输入为空时唤起——避免吞掉正文输入
    if (input === '?' && panel === 'none' && draftPreview === '' && pendingApproval === null) {
      useCliStore.getState().setPanel('help')
      return
    }
    // ↑↓：slash 菜单 / resume 面板导航（面板外 = 翻页切换会话保留，工单 8.3 键位）
    if (key.upArrow || key.downArrow) {
      const dir = key.upArrow ? -1 : 1
      if (slashOpen && slashItems.length > 0) {
        const total = slashItems.length
        const next = (slashSelected + dir + total) % total
        setSlashSelected(next)
        return
      }
      if (panel === 'resume' && resumeFiltered.length > 0) {
        const total = resumeFiltered.length
        const next = (resumeSelected + dir + total) % total
        setResumeSelected(next)
        return
      }
      // 面板外 ↑↓ 无动作（切换会话 = PageUp/PageDown，键位表单一来源）
      return
    }
    if (key.ctrl && input === 'n') {
      newSession()
      return
    }
    if (key.pageUp || key.pageDown) {
      switchSession(key.pageUp ? -1 : 1)
      return
    }
    if (key.ctrl && input === 'o') {
      // 展开/折叠最近一个工具或思考条目（工单 8.3）；工具在聚合组内时切换整组（工单 10.9）
      const s = useCliStore.getState()
      const items2 = s.activeSessionId === null ? [] : (s.byId[s.activeSessionId]?.items ?? [])
      const rows = flowRowsOf(items2)
      for (let i = items2.length - 1; i >= 0; i--) {
        const it = items2[i]
        if (it === undefined) continue
        if (it.kind === 'tool') {
          const group = rows.find(
            (r) => r.kind === 'toolGroup' && r.tools.some((t) => t.callId === it.callId),
          )
          if (group !== undefined) {
            s.toggleToolGroup(group.key)
            return
          }
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
    if (key.ctrl && input === 'r') {
      // 重试最近一次发送（工单 10.11 / §13.K K.8）：错误提示存在、无在途 turn 时重发
      const s = useCliStore.getState()
      const sid: SessionId | null = s.activeSessionId
      if (sid === null) return
      if ((s.byId[sid]?.activeTurn ?? null) !== null) return
      const text =
        lastFailedRef.current ??
        (() => {
          const items2 = s.byId[sid]?.items ?? []
          for (let i = items2.length - 1; i >= 0; i--) {
            const it = items2[i]
            if (it !== undefined && it.kind === 'user') return it.text
          }
          return null
        })()
      if (text === null || text === '') return
      s.setNotice(null)
      transport
        .sendMessage(sid, text, { delivery: s.delivery })
        .catch((err: unknown) => {
          lastFailedRef.current = text
          useCliStore.getState().setNotice(errorMessageOf(err))
        })
      return
    }
    // 审批键（工单 10.9：1/2/3 数字键直达，y/a/n 别名；挂起且非反馈模式时接管）
    if (pendingApproval !== null && rejecting === null) {
      if (input === '1' || input === 'y') {
        replyApproval(pendingApproval.requestId, 'once')
        return
      }
      if (input === '2' || input === 'a') {
        replyApproval(pendingApproval.requestId, 'always')
        return
      }
      if (input === '3' || input === 'n') {
        setRejecting(pendingApproval.requestId)
      }
    }
  })

  // ---------- 提示行：REST 失败优先；引擎 error 事件人话化（共享文案表，§13.K K.8） ----------

  const errorInfo = useMemo(() => {
    if (notice !== null) return { title: notice, code: null as string | null, detail: null as string | null }
    const le = slice?.lastError
    if (le !== undefined && le !== null) return humanizeError(le.message)
    return null
  }, [notice, slice])

  const inputActive = pendingApproval === null || rejecting !== null
  const emptySession = slice !== null && slice.items.length === 0

  return (
    <Box flexDirection="column" height={rows}>
      {panel === 'help' ? (
        <HelpPanel columns={columns} />
      ) : panel === 'resume' ? (
        <ResumePanel
          sessions={resumeFiltered}
          selected={resumeSelected}
          filter={panel === 'resume' ? draftPreview : ''}
          activeId={activeSessionId}
          preview={resumePreview ? resumeFiltered[resumeSelected] : undefined}
        />
      ) : panel === 'stats' ? (
        <StatsPanel slice={slice} />
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {slice === null ? (
            <Box flexGrow={1} justifyContent="center" alignItems="center">
              <Text color="gray">连接中——装载会话...</Text>
            </Box>
          ) : emptySession ? (
            <Box flexGrow={1} justifyContent="center">
              <BootHeader slice={slice} models={models} />
            </Box>
          ) : (
            <MessagePane slice={slice} />
          )}
        </Box>
      )}
      {slashOpen && slashItems.length > 0 && panel === 'none' ? (
        <SlashMenu
          items={slashItems}
          selected={slashSelected}
          page={Math.floor(slashSelected / SLASH_PAGE_SIZE)}
        />
      ) : null}
      {errorInfo !== null ? (
        <Box flexDirection="column">
          <Text color="red">{errorInfo.title}</Text>
          {/* 细节行（§13.K K.8）：原错误码折叠呈现 + 重试键位提示 */}
          <Text color="gray">
            {errorInfo.code !== null ? `${errorInfo.detail ?? errorInfo.code} · ` : ''}Ctrl+R 重试
          </Text>
        </Box>
      ) : null}
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
          key={panel}
          active={inputActive && panel !== 'help' && panel !== 'stats'}
          prefix={panel === 'resume' ? '过滤：' : `[${delivery}] > `}
          placeholder={
            panel === 'resume'
              ? '输入关键词过滤会话，↑↓ 选择，Space 预览，Enter 恢复'
              : pendingApproval !== null
                ? '等待审批——1 允许一次 / 2 总是允许 / 3 拒绝'
                : '输入任务，Enter 发送；/ 命令；? 帮助'
          }
          onSubmit={submit}
          onPreview={(v) => useCliStore.getState().setDraftPreview(v)}
          {...(panel === 'resume'
            ? {
                onSpace: () =>
                  setResumePreview((v) => !v), // Space 预览（工单 10.11 / §13.K K.7）
              }
            : {})}
        />
      )}
      <Footer slice={slice} />
    </Box>
  )
}
