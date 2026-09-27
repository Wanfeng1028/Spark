/**
 * 会话与命令操作（工单 10.43，自 app.tsx 抽取）：newSession/confirmResume/switchSession/
 * forkAtLast/rollbackTo/setEffort/pickModel/replyApproval/submit/runClientAction/boot。
 * 依赖显式传参（transport/clearScreen/resume 焦点态）；状态读写一律走 useCliStore.getState()
 * （与 app 组件解耦，键位层与命令分派共用同一组动作）。
 */
import { useCallback, useMemo, useRef } from 'react'
import type { ClientAction, CommandDto, RequestId, SessionId } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { createCliActionHandlers } from '../client-actions.js'
import { cliErrorMessageOf } from '../i18n.js'
import { parseEffort } from './effort.js'
import { resumeFilteredOf } from './use-resume-panel.js'
import { useCliStore } from '../store.js'
import type { HttpTransport } from '@spark/protocol'

/**
 * 本端可见命令过滤（工单 19.25）：`surface` 含 cli（旧载荷无该字段时按可见处理），
 * 且 client 命令必须带 clientAction——无 clientAction 的 client 命令 CLI 无法分派，
 * 列进 slash 菜单只会点了没反应（禁假入口）。过滤在装载处一次做，端上不再兜底。
 */
export function visibleToCli(list: readonly CommandDto[]): CommandDto[] {
  return list.filter(
    (c) =>
      (c.surface === undefined || c.surface.includes('cli')) &&
      (c.kind !== 'client' || c.clientAction !== undefined),
  )
}

export interface UseCliActionsOptions {
  transport: HttpTransport
  /** /new、/resume 的整屏重印（app 层 staticEpoch 机制） */
  clearScreen: () => void
  /** /voice（工单 16.6）：语音状态机入口（hooks/use-voice-cli.ts；需 inputRef 与 transport） */
  voice: (args: string | undefined) => void
  /** /agents（工单 16.2）：子代理面板 */
  agents: () => void
  /** /trust（工单 16.4）：文件夹信任面板 */
  trust: () => void
  /** /extensions（工单 16.5）：扩展面板 */
  extensions: () => void
}

export function useCliActions({
  transport,
  clearScreen,
  voice,
  agents,
  trust,
  extensions,
}: UseCliActionsOptions) {
  // LA-45：boot 幂等双守卫——bootedRef 记成功（错误屏重试不受阻），inFlight 防并发重入
  //（memo 依赖收缩前 actions 每键重建 → useEffect([actions]) 每键重跑 boot，请求数随键数涨）
  const bootedRef = useRef(false)
  const bootInFlightRef = useRef(false)
  /** LA-45：模型重试链单链守卫——重跑 boot 不叠加并行 2s 重试链 */
  const modelsRetryChainRef = useRef(false)
  /** 启动（工单 10.17①④）：快照装载，失败显式错误屏+重试 */
  const boot = useCallback((): (() => void) => {
    if (bootedRef.current || bootInFlightRef.current) return () => {}
    bootInFlightRef.current = true
    let disposed = false
    const st = useCliStore.getState()
    st.setBootError(null)
    transport
      .listSessions()
      .then((list) => {
        if (disposed) return
        bootInFlightRef.current = false
        useCliStore.getState().setSessions(list)
        const first = [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        if (first !== undefined) {
          // LA-45：只在无激活会话时落位——重跑/重连不得抢走用户已切换的会话
          if (useCliStore.getState().activeSessionId === null) {
            useCliStore.getState().setActiveSession(first.id)
          }
          bootedRef.current = true
        } else {
          // bootedRef 只在完整成功（含空清单的建会话兜底）后置位——
          // createSession 失败要留给错误屏重试
          return transport.createSession().then((dto) => {
            if (disposed) return
            useCliStore.getState().setSessions([dto])
            useCliStore.getState().setActiveSession(dto.id)
            bootedRef.current = true
          })
        }
      })
      .catch((err: unknown) => {
        // 工单 10.17④：显式错误屏+重试键位，不再只挂 notice（失败不清 booted——重试可达）
        if (!disposed) {
          bootInFlightRef.current = false
          useCliStore.getState().setBootError(cliErrorMessageOf(err))
        }
      })
    // 模型目录：水位 + 信息盒真值数据源（工单 10.38 门控下 models===null 会阻塞面板
    // 渲染）——失败每 2s 重试直至成功（10.42 实测：启动期瞬时失败曾致界面永久"连接中"）。
    // LA-45：重试链全局单链（hook 级 ref）——重跑 boot 不再叠加并行重试链。
    if (!modelsRetryChainRef.current) {
      modelsRetryChainRef.current = true
      const loadModels = (): void => {
        transport
          .listModels()
          .then((m) => {
            modelsRetryChainRef.current = false // 链终态：成功（重跑可再起链）
            if (!disposed) useCliStore.getState().setModels(m)
          })
          .catch(() => {
            if (!disposed) setTimeout(loadModels, 2000)
            else modelsRetryChainRef.current = false // 链终态：随 boot dispose 消亡
          })
      }
      loadModels()
    }
    // 命令注册表（工单 10.10/10.18）：帮助面板与 slash 菜单数据源；失败如实空清单
    transport
      .listCommands()
      .then((c) => {
        // 工单 19.25：清单按本端可见性过滤——原"该命令本端未实现"兜底因此不可达（已删）
        if (!disposed) useCliStore.getState().setCommands(visibleToCli(c))
      })
      .catch(() => undefined)
    // 界面语言与键位覆盖层（工单 19.25 / 19.39）：服务端 settings.ui 单源；读不到保持缺省
    transport
      .getSettings()
      .then((s) => {
        if (disposed) return
        const st = useCliStore.getState()
        st.setLanguage(s.ui?.language ?? 'zh-CN')
        st.setKeymapOverrides(s.ui?.keymap?.overrides ?? [])
      })
      .catch(() => undefined)
    return () => {
      disposed = true
    }
  }, [transport])

  function replyApproval(
    requestId: RequestId,
    reply: 'once' | 'always' | 'reject',
    feedback?: string,
    scope?: 'user' | 'project',
  ): void {
    transport
      .replyPermission(requestId, reply, feedback, scope)
      .catch((err: unknown) => useCliStore.getState().setNotice(cliErrorMessageOf(err)))
  }

  function newSession(): void {
    transport
      .createSession()
      .then((dto) => {
        const st = useCliStore.getState()
        st.setSessions([...st.sessions, dto])
        st.setActiveSession(dto.id)
        // /new 语义对齐 Qwen clearCommand（工单 10.35/10.38）：新会话 = 整屏清空回到
        // 欢迎首屏——ANSI 清屏 + Static 重挂（BootHeader 首项重印）+ UI 态归位。
        // 旧会话保留在 /resume 可回。
        const s2 = useCliStore.getState()
        s2.resetUi()
        clearScreen()
      })
      .catch((err: unknown) => useCliStore.getState().setNotice(cliErrorMessageOf(err)))
  }

  function switchSession(offset: 1 | -1): void {
    const { sessions: list, activeSessionId: sid, setActiveSession } = useCliStore.getState()
    if (list.length === 0) return
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt)
    const i = sorted.findIndex((s) => s.id === sid)
    const next = sorted[(i + offset + sorted.length) % sorted.length]
    if (next !== undefined) setActiveSession(next.id)
  }

  /** 恢复会话（工单 10.11）：切激活触发 since=0 全量重放；10.38 起清屏重印（header+历史）。
   * LA-45：目标在调用时经 getState() 现算（resumeFilteredOf 纯函数 + store 的
   * resumeSelected/draftPreview/sessions 单源）——本 hook 不再依赖组件 memo 的
   * resume 态，actions 对象不随键入重建。 */
  function confirmResume(): void {
    const st = useCliStore.getState()
    const filtered = resumeFilteredOf(st.sessions, st.panel === 'resume' ? st.draftPreview : '')
    const target = filtered[st.resumeSelected]
    if (target === undefined) return
    st.setActiveSession(target.id)
    st.setPanel('none')
    st.setDraftPreview('')
    st.resetUi()
    clearScreen()
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
      .catch((err: unknown) => useCliStore.getState().setNotice(cliErrorMessageOf(err)))
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
      .catch((err: unknown) => useCliStore.getState().setNotice(cliErrorMessageOf(err)))
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
      .catch((err: unknown) => useCliStore.getState().setNotice(cliErrorMessageOf(err)))
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
      .catch((err: unknown) => useCliStore.getState().setNotice(cliErrorMessageOf(err)))
  }

  /** /lsp install <id>（阶段十九 19.5）：安装语言服务器（npm 全局装 + 写 lsp.json；notice 反馈） */
  function installLsp(id: string): void {
    useCliStore.getState().setNotice(`正在安装 ${id}（npm 全局装，可能数分钟）…`)
    void transport
      .installLspServer(id)
      .then((r) => {
        useCliStore
          .getState()
          .setNotice(`已${r.written ? '安装并写入' : '配置'} ${r.language}（${r.command}）——下次使用该语言工具时连接`)
      })
      .catch((err: unknown) => useCliStore.getState().setNotice(cliErrorMessageOf(err)))
  }

  /** 会话改名（/rename <新标题>，工单 19.20）：PUT /api/sessions/:id/title，
   *  列表与索引经 session.title 事件同步——CLI 不做内联编辑器，标题走命令参数 */
  function renameSession(arg: string | undefined): void {
    const st = useCliStore.getState()
    const sid = st.activeSessionId
    if (sid === null) return
    const title = arg?.trim() ?? ''
    if (title === '') {
      st.setNotice('用法：/rename <新标题>（1–200 字符）')
      return
    }
    transport
      .renameSession(sid, title)
      .then(() => useCliStore.getState().setNotice(`已改名为「${title}」`))
      .catch((err: unknown) => useCliStore.getState().setNotice(cliErrorMessageOf(err)))
  }

  function runClientAction(action: ClientAction, args: string | undefined): void {
    const handlers = createCliActionHandlers({
      getState: useCliStore.getState,
      newSession,
      forkAtLast,
      rollbackTo,
      setEffort,
      voice,
      agents,
      trust,
      extensions,
      installLsp,
      renameSession,
    })
    handlers[action](args)
  }

  function submit(text: string): void {
    const { delivery: mode, setNotice } = useCliStore.getState()
    setNotice(null)

    // /resume 面板内：Enter = 恢复选中会话（过滤文本不入命令通道）
    if (useCliStore.getState().panel === 'resume') {
      confirmResume()
      return
    }

    // 工单 19.25：client 命令不再被"无激活会话"前置挡掉——/agents /mcp /settings /help
    // 与会话无关（原实现在此 return，令全部 client 命令在无会话时静默失效）；
    // 需要会话的命令仍由各端 handler 的 needSession 闸门把关
    const sid = useCliStore.getState().activeSessionId

    // 命令（工单 10.18 描述符分派）：词表单一来源 = 注册表快照（协议描述符下发）
    if (text.startsWith('/')) {
      const body = text.slice(1)
      const sp = body.indexOf(' ')
      // 工单 10.18④：选中项不再覆盖裸输入——执行的就是输入的文本
      const name = sp === -1 ? body : body.slice(0, sp)
      const args = sp === -1 ? undefined : body.slice(sp + 1).trim()
      if (name === '') return
      const cmd = useCliStore.getState().commands.find((c) => c.name === name)
      if (cmd !== undefined && cmd.kind === 'client' && cmd.clientAction !== undefined) {
        runClientAction(cmd.clientAction, args !== '' ? args : undefined)
        return
      }
      // action（compact）与 prompt（.md 自定义）走引擎统一入口（工单 7.4）——需激活会话
      if (sid === null) {
        setNotice('该命令需要激活会话')
        return
      }
      transport
        .executeCommand(sid, name, args !== '' ? args : undefined)
        .then(() => {
          // /arena 发起成功即打开竞答面板（快照轮询只读——工单 16.8）
          if (name === 'arena') useCliStore.getState().setPanel('arena')
        })
        .catch((err: unknown) => setNotice(cliErrorMessageOf(err)))
      return
    }

    // 正文发送需激活会话（client 命令已在上面分派，不受此限）
    if (sid === null) return
    transport
      .sendMessage(sid, text, { delivery: mode })
      .catch((err: unknown) => {
        // 发送失败记录原文（Ctrl+R 重试数据源——工单 10.11 / §13.K K.8）
        useCliStore.getState().setLastFailed(text)
        useCliStore.getState().setNotice(cliErrorMessageOf(err))
      })
  }

  return useMemo(
    () => ({
      boot,
      replyApproval,
      newSession,
      switchSession,
      confirmResume,
      forkAtLast,
      rollbackTo,
      setEffort,
      pickModel,
      runClientAction,
      submit,
    }),
    // LA-45：resume 态不再进依赖——那是"每键重建 actions → boot 每键重跑"的根因
    [boot, transport, clearScreen],
  )
}
