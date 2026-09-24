/**
 * 会话列表控制器（工单 19.27）：筛选档切换 + 数据源二选一 + 失败闭合。
 *
 * 与 protocol session-page 同纪律（回调式状态机、REST 由端侧工厂注入、零 React 依赖），
 * 因为本仓库的会话页状态机在 protocol（四端共享核）而列表页状态机各端形态不同
 * （web 侧栏 / cli / mobile / miniapp 各有一份筛选档），下沉需四端同批改——本单只动 mobile。
 *
 * 已归档档（V2-23 消解）：数据源 = `listSessions(true)`，此前 UI 置灰占位的理由
 * （"无后端支撑"）已由工单 12.4 推翻，本控制器是把它接真的那一半。
 */
import type { SessionDto, Transport } from '@spark/protocol'
import { isToday } from '@spark/protocol'
// 错误文案经本端语言收口（工单 19.17）：读 store 当前语言，store 是同步全局态、单测可直接 setLanguage
import { mobileErrorMessageOf } from '../i18n'

/** 筛选档（DESIGN §13.J.2.2：全部 / 按项目 / 已归档——三档皆真数据源，无占位档） */
export type SessionFilter = 'all' | 'project' | 'archived'

export interface SessionListSnapshot {
  filter: SessionFilter
  /** 最近一次成功取到的快照；失败时保持旧值（不拿空列表冒充"没有会话"） */
  sessions: SessionDto[]
  refreshing: boolean
  notice: string | null
  /** 装载是否完成（首屏区分"加载中"与"确实为空"） */
  loaded: boolean
}

export type SessionListRest = () => Pick<Transport, 'listSessions'> | null

export interface SessionListController {
  refresh(): Promise<void>
  /** 切档即重取——已归档档与其余两档是两次不同的 REST，不是本地过滤 */
  setFilter(filter: SessionFilter): void
  dispose(): void
}

/** 分组段（列表渲染单位；键供 FlatList） */
export interface SessionSection {
  key: string
  title: string
  items: SessionDto[]
}

/** cwd → 项目名（末级目录名；取不到归"未分组"——会话页页头副标题同源，J.2.3） */
export function projectNameOf(cwd: string): string {
  const m = /([^/\\]+)[/\\]*$/.exec(cwd.trim())
  const name = m?.[1] ?? ''
  return name === '' ? '未分组' : name
}

/** "按项目"档分组键 */
function projectOf(dto: SessionDto): string {
  return projectNameOf(dto.cwd)
}

/**
 * 列表分段：全部/已归档按时间（今天/更早），按项目按 cwd 目录名。
 * 排序键 updatedAt 倒序在分组前统一做——组内顺序即列表顺序。
 * `todayOf` 注入仅为单测可造"今天/更早"两组数据，缺省走 protocol 单源 isToday。
 */
export function groupSessions(
  sessions: readonly SessionDto[],
  filter: SessionFilter,
  todayOf: (ts: number) => boolean = (ts) => isToday(ts),
): SessionSection[] {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  if (filter === 'project') {
    const groups = new Map<string, SessionDto[]>()
    for (const dto of sorted) {
      const key = projectOf(dto)
      const list = groups.get(key)
      if (list === undefined) groups.set(key, [dto])
      else list.push(dto)
    }
    return [...groups.entries()].map(([name, items]) => ({
      key: `project:${name}`,
      title: name,
      items,
    }))
  }
  const today = sorted.filter((s) => todayOf(s.updatedAt))
  const earlier = sorted.filter((s) => !todayOf(s.updatedAt))
  const out: SessionSection[] = []
  if (today.length > 0) out.push({ key: 'today', title: '今天', items: today })
  if (earlier.length > 0) out.push({ key: 'earlier', title: '更早', items: earlier })
  return out
}
// 默认日期判定走 protocol 单源（注入参数只为单测可造"今天/更早"两组数据）
export function createSessionListController(opts: {
  rest: SessionListRest
  onUpdate: (s: SessionListSnapshot) => void
  /** 未配置服务器时的提示文案（端侧措辞，不进共享文案表） */
  unconfiguredNotice: string
  noticeMs?: number
}): SessionListController {
  const noticeMs = opts.noticeMs ?? 5000
  let state: SessionListSnapshot = {
    filter: 'all',
    sessions: [],
    refreshing: false,
    notice: null,
    loaded: false,
  }
  let disposed = false
  let noticeTimer: ReturnType<typeof setTimeout> | null = null
  /** 取号闸门：切档与在途请求并发时，只有最新一轮的结果能写回 */
  let epoch = 0

  const emit = (): void => {
    if (disposed) return
    opts.onUpdate({ ...state, sessions: [...state.sessions] })
  }

  const setNotice = (message: string): void => {
    if (disposed) return
    state = { ...state, notice: message }
    emit()
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      if (disposed) return
      noticeTimer = null
      state = { ...state, notice: null }
      emit()
    }, noticeMs)
  }

  return {
    async refresh() {
      const transport = opts.rest()
      if (transport === null) {
        // 未配置：如实提示并结束装载态（列表页据此呈现引导文案，不转圈）
        state = { ...state, refreshing: false, loaded: true }
        emit()
        setNotice(opts.unconfiguredNotice)
        return
      }
      const mine = ++epoch
      state = { ...state, refreshing: true }
      emit()
      try {
        const list = await transport.listSessions(state.filter === 'archived')
        if (disposed || mine !== epoch) return
        state = { ...state, sessions: list, refreshing: false, loaded: true, notice: null }
        emit()
      } catch (err: unknown) {
        if (disposed || mine !== epoch) return
        // 失败闭合：保留旧快照，只把错误如实挂到细条
        state = { ...state, refreshing: false, loaded: true }
        emit()
        setNotice(mobileErrorMessageOf(err))
      }
    },

    setFilter(filter) {
      if (filter === state.filter) return
      state = { ...state, filter, sessions: [], loaded: false }
      emit()
      void this.refresh()
    },

    dispose() {
      disposed = true
      if (noticeTimer !== null) clearTimeout(noticeTimer)
      noticeTimer = null
    },
  }
}
