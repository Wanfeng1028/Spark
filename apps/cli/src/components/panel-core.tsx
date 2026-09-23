/**
 * 面板共用原语（阶段十九 19.24，自 CommandPanels 抽出）：壳 / 装载 / 写回 / 列表导航 / 二次确认。
 * 管理态三条纪律做进 hook，面板不各自发明一套：
 * ① 写成功才改口——写完立即重取（revision 递增）拿服务端回显，禁乐观更新；
 * ② 失败原样呈现 errorMessageOf（禁假状态、禁吞异常），busy 期间吞键防连击；
 * ③ 破坏性动作（删除 / 回滚 / 应用胜者）走二次确认：同一目标连按两次 Enter 才执行，
 *    换目标即撤销待确认态——防"手滑 Enter"改坏用户数据。
 */
import { Box, Text, useInput } from 'ink'
import { useEffect, useRef, useState } from 'react'
import { errorMessageOf } from '@spark/protocol'
import type { ReactNode } from 'react'
import { cliT } from '../i18n.js'

/** 面板壳：标题 + 关闭提示 + 内容 */
export function PanelShell({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text>
        {title}
        <Text color="gray">  {hint} · {cliT('cli.escClose')}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  )
}

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

/** 装载态文案（失败如实呈现，禁假状态） */
export function LoadState<T>({
  state,
  render,
}: {
  state: Loadable<T>
  render: (data: T) => ReactNode
}) {
  if (state.status === 'loading') return <Text color="gray">{cliT('cli.loading')}</Text>
  if (state.status === 'error') return <Text color="red">{state.message}</Text>
  return <>{render(state.data)}</>
}

/**
 * 装载（revision 变化即重取——写回后由面板递增触发，读回服务端真值）。
 * 缺省 revision=0 时等价于"打开即快照"（原只读面板语义，行为不变）。
 */
export function useLoad<T>(load: () => Promise<T>, revision = 0): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' })
  useEffect(() => {
    let disposed = false
    load()
      .then((data) => {
        if (!disposed) setState({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (!disposed) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      disposed = true
    }
    // load 是调用处闭包（依赖 transport 与 sessionId），重取由 revision 显式驱动——
    // 放进依赖数组会让每次渲染都重新装载
  }, [revision])
  return state
}

/** 面板底部一行反馈（写入结果与确认提示同源；成功与失败都必须占位） */
export function usePanelWrite(): {
  busy: boolean
  msg: string | null
  setMsg: (s: string | null) => void
  run: (action: () => Promise<unknown>, okMessage: string, after?: () => void) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const run = async (
    action: () => Promise<unknown>,
    okMessage: string,
    after?: () => void,
  ): Promise<void> => {
    setBusy(true)
    try {
      await action()
      after?.()
      setMsg(okMessage)
    } catch (err: unknown) {
      setMsg(`${cliT('cli.failed')}：${errorMessageOf(err)}`)
    } finally {
      setBusy(false)
    }
  }
  return { busy, msg, setMsg, run }
}

/**
 * 破坏性动作的二次确认：首次按只挂"再按一次确认"，同一条再按才执行。
 * pending 存目标键——选到别的条目即自然失效（不留悬空确认）。
 */
export function useConfirm(notify: (s: string | null) => void): {
  pending: string | null
  arm: (key: string, label: string, action: () => void) => void
} {
  const [pending, setPending] = useState<string | null>(null)
  const arm = (key: string, label: string, action: () => void): void => {
    if (pending === key) {
      setPending(null)
      action()
      return
    }
    setPending(key)
    notify(cliT('cli.confirmAgain', { label }))
  }
  return { pending, arm }
}

/** ↑↓ 选择 + Enter 动作；返回当前下标供渲染反白 */
export function useListNav<T>(items: readonly T[], onAct: (item: T, index: number) => void): number {
  const [index, setIndex] = useState(0)
  useInput((_input, key) => {
    if (items.length === 0) return
    if (key.upArrow) {
      setIndex((i) => (i - 1 + items.length) % items.length)
      return
    }
    if (key.downArrow) {
      setIndex((i) => (i + 1) % items.length)
      return
    }
    if (key.return) {
      const at = Math.min(index, items.length - 1)
      const item = items[at]
      if (item !== undefined) onAct(item, at)
    }
  })
  return index
}

/** 列表行前缀：选中 '> '，未选 '  ' */
export function rowMark(selected: boolean): string {
  return selected ? '> ' : '  '
}

/**
 * 行内文本编辑器（窄屏表单原语）：`handle` 必须在面板自己的键位分支**之前**调用——
 * 返回 true 表示该键已被编辑器消费（导航与写入不得抢编辑中的字符）。
 * 面板层负责把 `active` 同步到 `store.panelEditing`，App 层据此让位 Esc（工单 19.23 契约）。
 */
export interface InlineEditor {
  active: boolean
  buf: string
  begin: (initial: string) => void
  end: () => void
  handle: (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1], onCommit: (buf: string) => void) => boolean
}

export function useEditor(): InlineEditor {
  const [state, setState] = useState<{ active: boolean; buf: string }>({ active: false, buf: '' })
  /**
   * 键处理读 ref、渲染读 state（InputBox 文件头同款判例）：同一批键位是逐键同步回调，
   * 渲染闭包里的 state 尚未提交——连打几个字符后立刻按 Enter，读 state.buf 会拿到空串，
   * 于是提交空值（模型面板丢密钥、成本上限丢数字）。ref 保证逐键累积不漏。
   */
  const cur = useRef(state)
  const commit = (next: { active: boolean; buf: string }): void => {
    cur.current = next
    setState(next)
  }
  return {
    active: state.active,
    buf: state.buf,
    begin: (initial) => commit({ active: true, buf: initial }),
    end: () => commit({ active: false, buf: cur.current.buf }),
    handle: (input, key, onCommit) => {
      if (!cur.current.active) return false
      if (key.escape) {
        commit({ active: false, buf: '' })
        return true
      }
      if (key.return) {
        const committed = cur.current.buf
        commit({ active: false, buf: '' })
        onCommit(committed)
        return true
      }
      if (key.backspace || key.delete) {
        commit({ active: true, buf: cur.current.buf.slice(0, -1) })
        return true
      }
      // 导航键与控制键在编辑期一律吞下（不移动光标选中行、不触发端上快捷键）
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.ctrl || key.meta) {
        return true
      }
      if (input !== '') commit({ active: true, buf: cur.current.buf + input })
      return true
    },
  }
}
