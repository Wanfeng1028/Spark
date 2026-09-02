/**
 * App 层全局键位（工单 10.43，自 app.tsx 抽取）：Ctrl+C（中断/双击退出）、Ctrl+R 重试、
 * Esc（面板关闭 > 拒绝取消 > 中断回合）、Tab（帮助 tab / 提交模式循环）、Enter（resume 确认）、
 * ? 帮助、↑↓（slash/resume 导航）、Ctrl+N 新建、PageUp/PageDown 切会话、Ctrl+O 展开、
 * 审批键位（1/2/3 + y/a/n，单码元判定防 IME 劫持——工单 10.19④）。
 * 输入框内文本编辑键由 InputBox 消费（键位分层，工单 10.19④）。
 */
import { useInput } from 'ink'
import type { SessionId } from '@spark/protocol'
import { errorMessageOf, type HttpTransport, type RequestId } from '@spark/protocol'
import { flowRowsOf } from '../flow-rows.js'
import { useCliStore } from '../store.js'
import { CTRL_C_WINDOW_MS } from './constants.js'

export interface UseCliKeysOptions {
  transport: HttpTransport
  /** 启动失败重试（Ctrl+R 优先——工单 10.17④） */
  boot: () => void
  /** 双击 Ctrl+C 退出（app 层优雅退出流程） */
  quit: () => void
  /** /resume 面板派生态 */
  resumeFiltered: Array<{ id: SessionId }>
  resumeSelected: number
  setResumeSelected: (n: number) => void
  /** slash 菜单派生态 */
  slashOpen: boolean
  slashItems: ReadonlyArray<{ name: string }>
  slashSelected: number
  setSlashSelected: (n: number) => void
  /** 挂起审批与拒绝反馈模式（审批键位接管判定） */
  pendingApproval: { requestId: RequestId } | null
  rejecting: RequestId | null
  setRejecting: (id: RequestId | null) => void
  /** 发送失败原文引用（Ctrl+R 数据源——app 层 ref） */
  lastFailedRef: { current: string | null }
  /** 动作集（use-cli-actions） */
  actions: {
    replyApproval: (requestId: RequestId, reply: 'once' | 'always' | 'reject', feedback?: string) => void
    newSession: () => void
    switchSession: (offset: 1 | -1) => void
    confirmResume: () => void
  }
  /** 主界面派生态 */
  panel: string
  draftPreview: string
}

export function useCliKeys(opts: UseCliKeysOptions): void {
  const {
    transport,
    boot,
    quit,
    resumeFiltered,
    resumeSelected,
    setResumeSelected,
    slashOpen,
    slashItems,
    slashSelected,
    setSlashSelected,
    lastFailedRef,
    pendingApproval,
    rejecting,
    setRejecting,
    actions,
    panel,
    draftPreview,
  } = opts

  useInput((input, key) => {
    // Ctrl+C：turn 运行中首击=中断当前回合（工单 10.41）；双击窗口内退出（工单 8.3）
    if (key.ctrl && input === 'c') {
      const now = Date.now()
      const lastCtrlCRef = useCliStore.getState().lastCtrlC
      if (now - lastCtrlCRef < CTRL_C_WINDOW_MS) {
        quit()
      } else {
        useCliStore.getState().setLastCtrlC(now)
        const s = useCliStore.getState()
        const sid = s.activeSessionId
        if (sid !== null && (s.byId[sid]?.activeTurn ?? null) !== null) {
          void transport.interrupt(sid).catch(() => undefined)
          useCliStore.getState().setNotice('已请求中断当前回合 · 再按一次 Ctrl+C 退出')
        } else {
          useCliStore.getState().setNotice('再按一次 Ctrl+C 退出')
        }
      }
      return
    }
    // Ctrl+R 重试（工单 10.11 / §13.K K.8）：启动失败重试优先（工单 10.17④）
    if (key.ctrl && input === 'r') {
      if (useCliStore.getState().bootError !== null) {
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
        .sendMessage(sid, text, { delivery: useCliStore.getState().delivery })
        .catch((err: unknown) => {
          useCliStore.getState().setLastFailed(text)
          useCliStore.getState().setNotice(errorMessageOf(err))
        })
      return
    }
    if (key.escape) {
      // 面板优先关闭（键位表纪律：Esc 面板开放时先关面板）
      if (useCliStore.getState().panel !== 'none') {
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
      actions.confirmResume()
      return
    }
    // ? 帮助面板（工单 10.10）：仅输入为空时唤起——避免吞掉正文输入
    if (input === '?' && panel === 'none' && draftPreview === '' && pendingApproval === null) {
      useCliStore.getState().setPanel('help')
      return
    }
    // ↑↓：slash 菜单 / resume 面板导航
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
      actions.newSession()
      return
    }
    if (key.pageUp || key.pageDown) {
      actions.switchSession(key.pageUp ? -1 : 1)
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
    // 由 InputBox 插入，不猜键（防组字期 1/2/y/n 劫持；? 同口径见上）
    if (pendingApproval !== null && rejecting === null && [...input].length === 1) {
      if (input === '1' || input === 'y') {
        actions.replyApproval(pendingApproval.requestId, 'once')
        return
      }
      if (input === '2' || input === 'a') {
        actions.replyApproval(pendingApproval.requestId, 'always')
        return
      }
      if (input === '3' || input === 'n') {
        setRejecting(pendingApproval.requestId)
      }
    }
  })
}
