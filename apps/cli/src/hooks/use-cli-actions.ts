/**
 * 会话与命令操作（工单 10.43，自 app.tsx 抽取）：newSession/confirmResume/switchSession/
 * forkAtLast/rollbackTo/setEffort/pickModel/replyApproval/submit/runClientAction/boot。
 * 依赖显式传参（transport/clearScreen/resume 焦点态）；状态读写一律走 useCliStore.getState()
 * （与 app 组件解耦，键位层与命令分派共用同一组动作）。
 */
import { useCallback, useMemo } from 'react'
import type { RequestId, SessionId } from '@spark/protocol'
import { errorMessageOf } from '@spark/protocol'
import { ids } from '@spark/protocol'
import { createCliActionHandlers, type ClientAction } from '../client-actions.js'
import { parseEffort } from './effort.js'
import { useCliStore } from '../store.js'
import type { HttpTransport } from '@spark/protocol'

export interface UseCliActionsOptions {
  transport: HttpTransport
  /** /new、/resume 的整屏重印（app 层 staticEpoch 机制） */
  clearScreen: () => void
  /** /resume 面板的过滤结果与选中项（confirmResume 目标） */
  resumeFiltered: Array<{ id: SessionId }>
  resumeSelected: number
}

export function useCliActions({ transport, clearScreen, resumeFiltered, resumeSelected }: UseCliActionsOptions) {
  /** 启动（工单 10.17①④）：快照装载，失败显式错误屏+重试 */
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
    // 模型目录：水位 + 信息盒真值数据源（工单 10.38 门控下 models===null 会阻塞面板
    // 渲染）——失败每 2s 重试直至成功（10.42 实测：启动期瞬时失败曾致界面永久"连接中"）
    const loadModels = (): void => {
      transport
        .listModels()
        .then((m) => {
          if (!disposed) useCliStore.getState().setModels(m)
        })
        .catch(() => {
          if (!disposed) setTimeout(loadModels, 2000)
        })
    }
    loadModels()
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
        // /new 语义对齐 Qwen clearCommand（工单 10.35/10.38）：新会话 = 整屏清空回到
        // 欢迎首屏——ANSI 清屏 + Static 重挂（BootHeader 首项重印）+ UI 态归位。
        // 旧会话保留在 /resume 可回。
        const s2 = useCliStore.getState()
        s2.resetUi()
        clearScreen()
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

  /** 恢复会话（工单 10.11）：切激活触发 since=0 全量重放；10.38 起清屏重印（header+历史） */
  function confirmResume(): void {
    const target = resumeFiltered[resumeSelected]
    if (target === undefined) return
    const st = useCliStore.getState()
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
    if (useCliStore.getState().panel === 'resume') {
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
      const name = sp === -1 ? body : body.slice(0, sp)
      const args = sp === -1 ? undefined : body.slice(sp + 1).trim()
      if (name === '') return
      const cmd = useCliStore.getState().commands.find((c) => c.name === name)
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
        // 发送失败记录原文（Ctrl+R 重试数据源——工单 10.11 / §13.K K.8）
        useCliStore.getState().setLastFailed(text)
        useCliStore.getState().setNotice(errorMessageOf(err))
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
    [boot, transport, clearScreen, resumeFiltered, resumeSelected],
  )
}
