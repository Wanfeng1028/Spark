/**
 * 管理面板纯判据（工单 19.28 批 1）：树扁平化 / arena 候选行 / agents 启停名单合成。
 * 零 React/Taro 依赖——面板组件只做拉取与渲染，判定在这里把关单测
 * （同 session-rows/session-list 的分工纪律）。
 */
import type { AgentPresetDto, ArenaStatusDto, TreeNodeDto } from '@spark/protocol'

/** 树扁平渲染行：depth 供缩进，node 原样携带（label/seq/forks 由组件读） */
export interface TreeRow {
  depth: number
  node: TreeNodeDto
}

/**
 * TreeNodeDto[] → 深度优先后序不敏感的扁平行（parentId 挂链；父缺失按根处理防环）。
 * 引擎返回顺序即时间序，按 childIds 挂链保持兄弟顺序；已访问标记防脏数据死循环。
 */
export function treeRowsOf(nodes: readonly TreeNodeDto[]): TreeRow[] {
  const byParent = new Map<string, TreeNodeDto[]>()
  const seenId = new Set<string>()
  for (const n of nodes) {
    seenId.add(n.id)
    const key = n.parentId ?? ''
    const list = byParent.get(key)
    if (list === undefined) byParent.set(key, [n])
    else list.push(n)
  }
  const out: TreeRow[] = []
  const visit = (parentKey: string, depth: number): void => {
    for (const n of byParent.get(parentKey) ?? []) {
      out.push({ depth, node: n })
      // 子键不在本批节点集内（越界引用）就不再深入——防环防假子树
      if (seenId.has(n.id) && depth < 64) visit(n.id, depth + 1)
    }
  }
  visit('', 0)
  return out
}

/** arena 候选单行摘要：`模型名 · 状态 · 时长s`（无 usage 时省略 token 分量，不造 0） */
export function contenderLineOf(
  c: ArenaStatusDto['contenders'][number],
): string {
  const parts = [c.model, c.status]
  if (c.durationMs !== undefined) parts.push(`${Math.round(c.durationMs / 1000)}s`)
  return parts.join(' · ')
}

/** 启停判定（web SubagentsSettingsPage 同口径）：不在禁用名单且预设自身未声明 disabled */
export function agentEnabledOf(p: AgentPresetDto, disabledNames: ReadonlySet<string>): boolean {
  return !disabledNames.has(p.name) && p.disabled !== true
}

/**
 * 计算新禁用名单（settings.agents.disabledAgents 全量覆盖语义）：
 * 关某档 = 追加名字；开某档 = 从名单移除。**不动名单里未知名字**（服务端可能有
 * 本端看不到的层来源，全量重写时丢掉它们 = 越权改写用户配置）。
 */
export function updateDisabledAgents(
  current: readonly string[],
  name: string,
  enable: boolean,
): string[] {
  const has = current.includes(name)
  if (enable) return current.filter((n) => n !== name)
  return has ? [...current] : [...current, name]
}
