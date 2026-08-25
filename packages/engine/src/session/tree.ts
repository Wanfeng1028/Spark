/**
 * EventTree（doc/02 §5.8.2）：id/parentId 树 + leaf 指针。
 * v1 线性追加（append 只落 leaf）；fork 的 branch() 只移指针（pi：分叉零拷贝）。
 * 孤儿 parentId（指向不存在的事件）fail-closed 拒绝（dsh 读端纪律，§5.8.1 对照注记）。
 */
import type { EventId, SparkEventEnvelope, SparkEventType } from '@spark/protocol'

interface TreeNode {
  readonly event: SparkEventEnvelope
  readonly parentId: EventId | null
}

export class EventTree {
  private readonly nodes = new Map<EventId, TreeNode>()
  private leaf: EventId | null = null

  get leafId(): EventId | null {
    return this.leaf
  }

  /** 落 leaf（v1 线性追加）；parentId 缺省取当前 leaf。返回事件 id */
  append(event: SparkEventEnvelope, parentId: EventId | null = this.leaf): EventId {
    if (parentId !== null && !this.nodes.has(parentId)) {
      throw new Error(`E_TREE_ORPHAN: parentId ${parentId} 不存在（fail-closed）`)
    }
    this.nodes.set(event.id, { event, parentId })
    this.leaf = event.id
    return event.id
  }

  /** 分叉：只移 leafId 指针（零拷贝）；指针回退后新 append 从该点生长 */
  branch(fromEventId: EventId): void {
    if (!this.nodes.has(fromEventId)) {
      throw new Error(`E_TREE_NO_NODE: 事件 ${fromEventId} 不在树中`)
    }
    this.leaf = fromEventId
  }

  /** 节点存在性（fork 边界校验用，§5.8.6） */
  has(eventId: EventId): boolean {
    return this.nodes.has(eventId)
  }

  /** 全部节点（seq 升序；v1 线性 = 路径序）——树视图数据源 */
  list(): { event: SparkEventEnvelope; parentId: EventId | null }[] {
    return [...this.nodes.values()]
      .sort((a, b) => (a.event.seq ?? 0) - (b.event.seq ?? 0))
      .map((n) => ({ event: n.event, parentId: n.parentId }))
  }

  /** leaf（或指定事件）→ root 回溯后反转：root → leaf 序的路径 */
  pathToRoot(eventId?: EventId): SparkEventEnvelope[] {
    let cursor: EventId | null = eventId ?? this.leaf
    const out: SparkEventEnvelope[] = []
    while (cursor !== null) {
      const node = this.nodes.get(cursor)
      if (node === undefined) {
        throw new Error(`E_TREE_NO_NODE: 事件 ${cursor} 不在树中`)
      }
      out.push(node.event)
      cursor = node.parentId
    }
    return out.reverse()
  }

  /** 路径上最新某类事件（compaction 定位锚点用）；从 leaf 端往回找 */
  latestOf(type: SparkEventType, path?: SparkEventEnvelope[]): SparkEventEnvelope | undefined {
    const p = path ?? this.pathToRoot()
    for (let i = p.length - 1; i >= 0; i--) {
      const e = p[i]
      if (e?.type === type) return e
    }
    return undefined
  }
}
