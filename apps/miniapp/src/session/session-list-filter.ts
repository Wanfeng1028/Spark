/**
 * 会话列表筛选（工单 19.29 小程序补齐批，DESIGN §13.J.2.2）：三档筛选的
 * 分组与查询参数纯函数——页面只持状态与渲染，档位逻辑在此把关单测。
 *
 * 归档档数据源 = `Transport.listSessions(archived=true)`（工单 12.4 后端已通），
 * 本端不再按 §13.J.2.2 原口径置灰（apps/mobile 端那句"已归档——待后端支撑"的占位
 * 随本批一并作废：后端 12.4 就通了，缺的只是两端没接）。
 * 归档状态点的灰档已由 protocol `dotColor(status, t, archived)` 承载（工单 19.21 尾巴）：
 * 规则单源在 `dotTokenOf`，页面只传归档位；原"先补端主题 sparkMeta token"的注记作废——
 * 两端 ThemeTokens 早有 `mutedForeground`，另立同值同义的第四色只会让人分不清用哪个。
 */
import type { SessionDto } from '@spark/protocol'
import { isToday } from '@spark/protocol'

export type SessionFilter = 'all' | 'project' | 'archived'

/** 分组区块（时间档=今天/更早；项目档=cwd 末段目录名，首现顺序） */
export interface SessionSection {
  key: string
  title: string
  items: SessionDto[]
}

/**
 * 筛选菜单项：文案是端侧短标签，@spark/protocol 字典（19.17 第一批）未收这三键，
 * translate 缺键会回落 key 本身——故此处直写中文，等字典补键后改走 miniT。
 */
export const SESSION_FILTERS: readonly { value: SessionFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'project', label: '按项目' },
  { value: 'archived', label: '已归档' },
]

/** 归档档 → REST 查询参数（缺省 undefined = 服务端排除归档，与 ListSessionsQuery 同口径） */
export function archivedQueryOf(filter: SessionFilter): boolean | undefined {
  return filter === 'archived' ? true : undefined
}

/** 页头标题：与菜单选中态同源（标题写"全部会话"而实际在归档档 = 谎报现状） */
export function listTitleOf(filter: SessionFilter): string {
  switch (filter) {
    case 'all':
      return '全部会话'
    case 'project':
      return '按项目'
    case 'archived':
      return '已归档会话'
  }
}

/** 项目分组键：cwd 末段目录名（数据面只到 cwd，无项目实体；取不到归"未分组"） */
export function projectOf(dto: SessionDto): string {
  const m = /([^/\\]+)[/\\]*$/.exec(dto.cwd.trim())
  const name = m?.[1] ?? ''
  return name === '' ? '未分组' : name
}

/** 时间分组（今天/更早，updatedAt 倒序） */
function timeSections(sorted: readonly SessionDto[]): SessionSection[] {
  const today = sorted.filter((s) => isToday(s.updatedAt))
  const earlier = sorted.filter((s) => !isToday(s.updatedAt))
  const out: SessionSection[] = []
  if (today.length > 0) out.push({ key: 'today', title: '今天', items: today })
  if (earlier.length > 0) out.push({ key: 'earlier', title: '更早', items: earlier })
  return out
}

/**
 * UiSnapshot → 渲染分组。排序键 updatedAt 倒序在档位分叉前统一做（三档同一口径，
 * 不在各分支重复排序）。项目档按首现顺序出组（组内仍 updatedAt 倒序）。
 */
export function buildSections(
  sessions: readonly SessionDto[],
  filter: SessionFilter,
): SessionSection[] {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  if (filter !== 'project') return timeSections(sorted)
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
