/**
 * EventTree 单测（doc/02 §5.8.2）：线性追加 / branch 零拷贝 / pathToRoot / latestOf。
 */
import { describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope } from '@spark/protocol'
import { EventTree } from '../src/session/tree.js'

const SID = ids.session('ses_tree000000000000000000000')

function env(n: number): SparkEventEnvelope {
  return {
    id: ids.event(`evt_tree${String(n).padStart(4, '0')}`),
    sessionId: SID,
    seq: n,
    version: 1,
    time: 1000 + n,
    type: 'session.title',
    data: { title: `t${n}` },
  }
}

describe('append（v1 线性）', () => {
  it('leafId 随追加演进；pathToRoot 为 root→leaf 序', () => {
    const tree = new EventTree()
    const a = env(1)
    const b = env(2)
    const c = env(3)
    tree.append(a)
    tree.append(b)
    tree.append(c)

    expect(tree.leafId).toBe(c.id)
    const path = tree.pathToRoot()
    expect(path.map((e) => e.id)).toEqual([a.id, b.id, c.id])
  })

  it('显式 parentId 落树', () => {
    const tree = new EventTree()
    const a = env(1)
    tree.append(a)
    const b = env(2)
    tree.append(b, a.id)

    expect(tree.leafId).toBe(b.id)
    expect(tree.pathToRoot(b.id).map((e) => e.id)).toEqual([a.id, b.id])
  })

  it('孤儿 parentId 拒绝（fail-closed）', () => {
    const tree = new EventTree()
    expect(() => tree.append(env(1), ids.event('evt_missing000000000000000'))).toThrow(
      /E_TREE_ORPHAN/,
    )
  })

  it('pathToRoot 传入不存在 id 抛错', () => {
    const tree = new EventTree()
    expect(() => tree.pathToRoot(ids.event('evt_missing000000000000000'))).toThrow(
      /E_TREE_NO_NODE/,
    )
  })
})

describe('branch（fork 用）', () => {
  it('只移指针：pathToRoot 回到分叉点', () => {
    const tree = new EventTree()
    const a = env(1)
    const b = env(2)
    tree.append(a)
    tree.append(b)

    tree.branch(a.id)

    expect(tree.leafId).toBe(a.id)
    expect(tree.pathToRoot().map((e) => e.id)).toEqual([a.id])
  })

  it('branch 后 append 从该点生长', () => {
    const tree = new EventTree()
    const a = env(1)
    const b = env(2)
    tree.append(a)
    tree.append(b)

    tree.branch(a.id)
    const c = env(3)
    tree.append(c)

    expect(tree.pathToRoot().map((e) => e.id)).toEqual([a.id, c.id])
    expect(tree.pathToRoot(b.id).map((e) => e.id)).toEqual([a.id, b.id]) // 旧分支仍可回溯
  })

  it('branch 不存在的 id 抛错', () => {
    const tree = new EventTree()
    expect(() => tree.branch(ids.event('evt_missing000000000000000'))).toThrow(/E_TREE_NO_NODE/)
  })
})

describe('latestOf', () => {
  it('返回路径上最新该类事件（leaf 端往回找）', () => {
    const tree = new EventTree()
    tree.append({ ...env(1), type: 'session.title', data: { title: 'first' } })
    tree.append(env(2))
    tree.append({ ...env(3), type: 'session.title', data: { title: 'second' } })

    const latest = tree.latestOf('session.title')
    expect((latest?.data as { title: string }).title).toBe('second')
  })

  it('无该类事件返回 undefined；支持外部 path', () => {
    const tree = new EventTree()
    tree.append(env(1))
    expect(tree.latestOf('compaction.completed')).toBeUndefined()
    expect(tree.latestOf('session.title', tree.pathToRoot())).toBeDefined()
  })
})
