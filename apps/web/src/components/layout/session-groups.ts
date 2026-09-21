/**
 * 侧栏分组的排序规则（工单 19.41 自 Sidebar.tsx 抽出）：抽出只为让"置顶单列首组"这条
 * 跨 groupMode 的规则可单测——留在组件里就得靠 DOM 断言。
 * **分组键与段序由调用方传入**（Sidebar 的 projectOf / timeGroupOf / TIME_GROUP_ORDER 仍是单一来源），
 * 本模块不复制任何口径。
 *
 * 规则：① 标题子串过滤（空标题按"新会话"参与匹配）；② `pinned === true` 提出并合成首个
 * 「置顶」组（分组视图里"列表第一"没有意义——置顶的语义是不受分组与时间流逝影响）；
 * ③ 其余归组后组内 updatedAt 倒序，组间按 orderOf 索引（有时间固定段序）或
 * 各组最近活动倒序（项目模式；工单 10.5② 原语义不变）。
 */
import type { SessionDto } from '@spark/protocol'

export interface SidebarGroupLike {
  name: string
  sessions: SessionDto[]
}

export function groupSessionsForSidebar(
  sessions: readonly SessionDto[],
  query: string,
  keyOf: (s: SessionDto) => string,
  /** 组名在固定段序里的下标；-1 = 无固定段序（按各组最近活动排） */
  orderOf: (name: string) => number,
): SidebarGroupLike[] {
  const needle = query.trim().toLowerCase()
  const hits = sessions.filter((s) =>
    (s.title === '' ? '新会话' : s.title).toLowerCase().includes(needle),
  )
  const byRecency = (a: SessionDto, b: SessionDto): number => b.updatedAt - a.updatedAt
  const pinned = hits.filter((s) => s.pinned === true).sort(byRecency)
  const byKey = new Map<string, SessionDto[]>()
  for (const s of hits) {
    if (s.pinned === true) continue
    const key = keyOf(s)
    const list = byKey.get(key)
    if (list === undefined) byKey.set(key, [s])
    else list.push(s)
  }
  const entries = [...byKey.entries()].map(([name, list]) => ({
    name,
    sessions: [...list].sort(byRecency),
  }))
  entries.sort((a, b) => {
    const oa = orderOf(a.name)
    const ob = orderOf(b.name)
    if (oa !== -1 || ob !== -1) return oa - ob
    return (b.sessions[0]?.updatedAt ?? 0) - (a.sessions[0]?.updatedAt ?? 0)
  })
  return pinned.length === 0 ? entries : [{ name: '置顶', sessions: pinned }, ...entries]
}
