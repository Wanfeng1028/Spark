/**
 * App（阶段十工单 10.8 纯单栏 / 10.10 面板族 / 10.11 收口 / 10.17 启动强化 /
 * 10.18 命令描述符分派，§13.K）：
 * 单栏会话优先（ADR D19 修订）：消息流 / 输入框 / footer 双行；会话管理退 /new 与
 * /resume；面板族（帮助/恢复/统计 + 10.18 模型/MCP/技能/用量/快照/树）覆盖内容区。
 * 命令分派（工单 10.18）：词表单一来源 = 注册表快照（协议描述符经 GET /api/commands
 * 下发），按 clientAction 分派；未实现动作不可达（清单即注册表面向），禁假状态。
 * 启动策略（工单 10.17，取舍见提交说明）：装载会话快照——有则激活最近更新会话，
 * 无则新建空会话；三态（连接中/失败/就绪）一律渲染 boot 骨架，失败给显式错误屏+重试。
 * 键位分层（工单 10.19④）：输入框有焦点时文本键由 InputBox 消费，App 全局键只识别
 * 单码元输入（组字串作原子文本插入，不猜键）；面板激活时 ↑↓/Enter 归面板。
 */
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HttpTransport, SessionEventSource, errorMessageOf, humanizeError, ids } from '@spark/protocol'
import type {
  ClientAction,
  ReasoningEffort,
  RequestId,
  SessionId,
  SparkEventEnvelope,
} from '@spark/protocol'
import { flowRowsOf } from './flow-rows.js'
import { createCliActionHandlers } from './client-actions.js'
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
import {
  CheckpointsPanel,
  McpPanel,
  ModelPanel,
  SkillsPanel,
  TreePanel,
  UsagePanel,
} from './components/CommandPanels.js'
import { SlashMenu, SLASH_PAGE_SIZE, filterSlashCommands } from './components/SlashMenu.js'

/** 双击 Ctrl+C 判定窗口 */
const CTRL_C_WINDOW_MS = 800

/** effort 参数解析（/effort <low|medium|high>） */
function parseEffort(arg: string | undefined): ReasoningEffort | null {
  if (arg === 'low' || arg === 'medium' || arg === 'high') return arg
  return null
}

export function App({ baseUrl }: { baseUrl: string }) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 80
  const rows = stdout?.rows ?? 24

  // REST-only transport（事件流走会话级 SessionEventSource——since=seq 续播，工单 8.4）
  const transport = useMemo(() => new HttpTransport({ baseUrl, eventStream: false }), [baseUrl])
  const exitingRef = useRef(false)

  const activeSessionId = useCliStore((s) => s.activeSessionId)
  const connStatus = useCliStore((s) => s.status)
  const delivery = useCliStore((s) => s.delivery)
  const notice = useCliStore((s) => s.notice)
  const panel = useCliStore((s) => s.panel)
  const sessions = useCliStore((s) => s.sessions)
  const models = useCliStore((s) => s.models)
  const commands = useCliStore((s) => s.commands)
  const draftPreview = useCliStore((s) => s.draftPreview)
  const bootError = useCliStore((s) => s.bootError)
  const bootEcho = useCliStore((s) => s.bootEcho)
  const replayNonce = useCliStore((s) => s.replayNonce)
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
  /** /resume 预览态（工单 10.11 / §13.K K.7：Space 切换，选中即预览对象） */
  const [resumePreview, setResumePreview] = useState(false)
  /** 最近一次发送失败的文本（Ctrl+R 重试数据源——发送失败时引擎无 user 事件可回溯） */
  const lastFailedRef = useRef<string | null>(null)
  const lastCtrlCRef = useRef(0)
  /** resume/回滚后 boot 重现的基准水位（新事件到达即退场——工单 10.17③） */
  const echoBaseSeqRef = useRef(0)

  // ---------- resize 重渲染（工单 10.17③：终端尺寸变化即时重排，不错行） ----------

  const [, setResizeNonce] = useState(0)
  useEffect(() => {
    const onResize = () => setResizeNonce((n) => n + 1)
    stdout?.on('resize', onResize)
    return () => {
      stdout?.off('resize', onResize)
    }
  }, [stdout])

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
  const slashOpen = slashQuery !== null && slashItems.length > 0

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

  // ---------- 启动（工单 10.17①④）：快照装载，失败显式错误屏+重试 ----------

  /**
   * 启动策略（工单 10.17①，取舍见提交说明）：装载会话快照——有则激活最近更新会话，
   * 无则新建空会话（不采用"一律新建"：会丢用户上次工作现场）。
   */
  const boot = useCallback((): (() => void) => {
    let disposed = false
    const st = useCliStore.getState()
    st.setBootError(null)
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
        // 工单 10.17④：显式错误屏+重试键位，不再只挂 notice
        if (!disposed) useCliStore.getState().setBootError(errorMessageOf(err))
      })
    // 模型目录：水位计算用；失败静默（水位如实缺省，不阻塞）
    transport
      .listModels()
      .then((m) => {
        if (!disposed) useCliStore.getState().setModels(m)
      })
      .catch(() => undefined)
    // 命令注册表（工单 10.10/10.18）：帮助面板与 slash 菜单数据源；失败如实空清单
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

  useEffect(() => boot(), [boot])

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
    // replayNonce：回滚后 seq 倒退，需 since=0 重订阅重放（工单 10.18 /rollback）
  }, [activeSessionId, baseUrl, transport, replayNonce])

  // boot 重现退场：新事件到达（水位越过基准）即让位会话流（工单 10.17③）
  useEffect(() => {
    if (!bootEcho || slice === null) return
    if (slice.lastSeq > echoBaseSeqRef.current) useCliStore.getState().setBootEcho(false)
  }, [bootEcho, slice])

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

  /** 恢复会话（工单 10.11）：切激活即触发事件流 since=0 全量重放 + boot 头重现一次 */
  function confirmResume(): void {
    const target = resumeFiltered[resumeSelected]
    if (target === undefined) return
    const st = useCliStore.getState()
    echoBaseSeqRef.current = st.byId[target.id]?.lastSeq ?? 0
    st.setActiveSession(target.id)
    st.setPanel('none')
    st.setDraftPreview('')
    st.setBootEcho(true) // DESIGN K.1：resume 后 boot 头部重现一次（工单 10.17③）
  }

  /** 从最近事件分叉（/fork）：走引擎既有端点（工单 4.5），成功后切新会话 */
  function forkAtLast(): void {
    const st = useCliStore.getState()
    const sid = st.activeSessionId
    if (sid === null) return
    const items = st.byId[sid]?.items ?? []
    const last = items[items.length - 1]
    if (last === undefined) {
      st.setNotice('空会话无可分叉事件')
      return
    }
    transport
      .fork(sid, last.eventId)
      .then((dto) => {
        const st2 = useCliStore.getState()
        st2.setSessions([...st2.sessions, dto])
        st2.setActiveSession(dto.id)
        st2.setNotice(`已分叉新会话 ${dto.id}`)
      })
      .catch((err: unknown) => useCliStore.getState().setNotice(errorMessageOf(err)))
  }

  /** 回滚到快照（/rollback <id>）：回滚后 seq 倒退，resetSlice + 重订阅重放 */
  function rollbackTo(arg: string | undefined): void {
    const st = useCliStore.getState()
    const sid = st.activeSessionId
    if (sid === null) return
    if (arg === undefined || arg === '') {
      st.setNotice('用法：/rollback <checkpoint-id>（/checkpoint 查看列表）')
      return
    }
    transport
      .rollbackCheckpoint(sid, ids.checkpoint(arg))
      .then(() => {
        const st2 = useCliStore.getState()
        st2.resetSlice(sid) // 清旧投影，重放重建（回滚后 seq 倒退）
        st2.bumpReplay() // 事件流 since=0 重订阅
        st2.setNotice('已回滚，重放中')
      })
      .catch((err: unknown) => useCliStore.getState().setNotice(errorMessageOf(err)))
  }

  /** 设置推理档位（/effort <low|medium|high>）：走既有 setSessionEffort 端点 */
  function setEffort(arg: string | undefined): void {
    const st = useCliStore.getState()
    const sid = st.activeSessionId
    if (sid === null) return
    const effort = parseEffort(arg)
    if (effort === null) {
      st.setNotice('用法：/effort low|medium|high')
      return
    }
    transport
      .setSessionEffort(sid, effort)
      .then((applied) => useCliStore.getState().setNotice(`推理档位已设 ${applied}（下一轮生效）`))
      .catch((err: unknown) => useCliStore.getState().setNotice(errorMessageOf(err)))
  }

  /**
   * client 命令分派（工单 10.18② / 10.25）：映射表抽至 client-actions.ts——Record 键
   * 穷举由编译期强制，覆盖不变量由 tests/client-actions.test.ts 断言（10.18③ 残项收口）；
   * sessionRequired 命令无激活会话时拒绝（禁假状态）。
   */
  function runClientAction(action: ClientAction, args: string | undefined): void {
    const handlers = createCliActionHandlers({
      getState: useCliStore.getState,
      newSession,
      forkAtLast,
      rollbackTo,
      setEffort,
    })
    handlers[action](args)
  }

  function submit(text: string): void {
    const { delivery: mode, setNotice } = useCliStore.getState()
    setNotice(null)

    // /resume 面板内：Enter = 恢复选中会话（过滤文本不入命令通道）
    if (panel === 'resume') {
      confirmResume()
      return
    }

    const sid = useCliStore.getState().activeSessionId
    if (sid === null) return

    // 命令（工单 10.18 描述符分派）：词表单一来源 = 注册表快照（协议描述符下发）
    if (text.startsWith('/')) {
      const body = text.slice(1)
      const sp = body.indexOf(' ')
      // 工单 10.18④：选中项不再覆盖裸输入——执行的就是输入的文本
      // （原实现输 /s 回车实跑 /skills；选中项只是视觉引导）
      const name = sp === -1 ? body : body.slice(0, sp)
      const args = sp === -1 ? undefined : body.slice(sp + 1).trim()
      if (name === '') return
      const cmd = commands.find((c) => c.name === name)
      if (cmd !== undefined && cmd.kind === 'client') {
        if (cmd.clientAction !== undefined) {
          runClientAction(cmd.clientAction, args !== '' ? args : undefined)
        } else {
          setNotice('该命令本端未实现') // 清单面向本端过滤后不应出现——兜底不假执行
        }
        return
      }
      // action（compact）与 prompt（.md 自定义）走引擎统一入口（工单 7.4）
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

  /** 面板内模型切换（/model 面板确认——走既有 setSessionModel 端点） */
  function pickModel(model: string): void {
    const st = useCliStore.getState()
    const sid = st.activeSessionId
    if (sid === null) return
    transport
      .setSessionModel(sid, model)
      .then((applied) => {
        useCliStore.getState().setPanel('none')
        useCliStore.getState().setNotice(`模型已切 ${applied}（下一轮生效）`)
      })
      .catch((err: unknown) => useCliStore.getState().setNotice(errorMessageOf(err)))
  }

  useInput((input, key) => {
    // boot 重现态：任意键退场（工单 10.17③）
    if (bootEcho) useCliStore.getState().setBootEcho(false)

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
    // Ctrl+R 重试（工单 10.11 / §13.K K.8）：启动失败重试优先（工单 10.17④）
    if (key.ctrl && input === 'r') {
      if (bootError !== null) {
        boot()
        return
      }
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
      // 帮助面板内 Tab/Shift+Tab 切 tab（§13.K K.6）；面板外循环提交模式
      if (panel === 'help') {
        useCliStore.getState().cycleHelpTab(key.shift ? -1 : 1)
        return
      }
      if (panel === 'none') useCliStore.getState().cycleDelivery()
      return
    }
    // /resume 面板：Enter 由 App 层接管（工单 10.17⑤——修空过滤词 Enter 被吞）
    if (key.return && panel === 'resume') {
      confirmResume()
      return
    }
    // ? 帮助面板（工单 10.10）：仅输入为空时唤起——避免吞掉正文输入
    if (input === '?' && panel === 'none' && draftPreview === '' && pendingApproval === null) {
      useCliStore.getState().setPanel('help')
      return
    }
    // ↑↓：slash 菜单 / resume 面板导航；其余面板 ↑↓ 归面板自身（CommandPanels）
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
    // 审批键（工单 10.9：1/2/3 数字键直达，y/a/n 别名；挂起且非反馈模式时接管）。
    // 键位分层（工单 10.19④）：只识别单码元输入——组字串（多字符块）作原子文本
    // 由 InputBox 插入，不猜键（防组字期 1/2/y/n 劫持；? 同口径见上；
    // IME 深层残余挂 V2-26 不在本工单）
    if (pendingApproval !== null && rejecting === null && [...input].length === 1) {
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
  // 输入框只在主界面与 resume 过滤态激活（其余面板 ↑↓/Enter 归面板——键位分层）
  const inputBoxActive = inputActive && (panel === 'none' || panel === 'resume')

  // ---------- 渲染：启动错误屏优先 / 面板族 / boot 骨架 / 会话流 ----------

  /**
   * live 区行数预算（工单 10.33）：终端行数 − 底部固定件（menu 模式面板按行计不进
   * 此列——面板态 MessagePane 不渲染；此处只算与会话流同帧共存的件）：
   * InputBox 1 行 + Footer 2 行（+断线异常行 1）+ slash 菜单（开着才计，1 页 8 行 +
   * 计数行）+ 错误区 2 行（出现才计）+ 审批框（挂起才计，3-6 行按保守 6）。
   * live 折叠提示行也占预算——再减 1。floor 到 1 保证最窄终端仍渲染最新一行。
   */
  const slashRows = slashOpen && slashItems.length > 0 && panel === 'none' ? SLASH_PAGE_SIZE + 1 : 0
  const errorRows = errorInfo !== null ? 2 : 0
  const approvalRows = pendingApproval !== null ? 6 : 0
  const abnormalRows = connStatus !== 'open' ? 1 : 0
  const liveBudget = Math.max(
    1,
    rows - 1 - 2 - abnormalRows - slashRows - errorRows - approvalRows - 1,
  )

  if (bootError !== null) {
    return (
      <Box flexDirection="column" height={rows}>
        <BootHeader slice={null} models={null} columns={columns} />
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">启动失败：{bootError}</Text>
          <Text color="gray">Ctrl+R 重试 · Ctrl+C ×2 退出</Text>
        </Box>
      </Box>
    )
  }

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
      ) : panel === 'model' ? (
        <ModelPanel
          models={models}
          current={slice !== null && slice.meta.model !== '' ? slice.meta.model : null}
          onPick={pickModel}
        />
      ) : panel === 'mcp' ? (
        <McpPanel transport={transport} />
      ) : panel === 'skills' ? (
        <SkillsPanel transport={transport} />
      ) : panel === 'usage' ? (
        <UsagePanel transport={transport} />
      ) : panel === 'checkpoints' ? (
        activeSessionId !== null ? (
          <CheckpointsPanel transport={transport} sessionId={activeSessionId} />
        ) : null
      ) : panel === 'tree' ? (
        activeSessionId !== null ? (
          <TreePanel transport={transport} sessionId={activeSessionId} />
        ) : null
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {slice === null || slice.items.length === 0 || bootEcho ? (
            // boot 骨架三态通吃（工单 10.17①）：连接中/空会话/resume 重现
            <Box flexGrow={1} justifyContent="center">
              <BootHeader slice={slice} models={models} columns={columns} />
            </Box>
          ) : (
            <MessagePane slice={slice} maxLiveRows={liveBudget} />
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
          maxWidth={columns}
          onSubmit={(text) => {
            replyApproval(rejecting, 'reject', text)
            setRejecting(null)
          }}
        />
      ) : (
        <InputBox
          key={panel}
          active={inputBoxActive}
          maxWidth={columns}
          prefix={panel === 'resume' ? '过滤：' : `[${delivery}] > `}
          placeholder={
            panel === 'resume'
              ? '输入关键词过滤会话，↑↓ 选择，Space 预览，Enter 恢复'
              : pendingApproval !== null
                ? '等待审批——1 允许一次 / 2 总是允许 / 3 拒绝'
                : '输入您的消息或 @ 文件路径'
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
