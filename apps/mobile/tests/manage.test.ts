/**
 * 管理面板纯判据单测（19.28 批 1）：树扁平化（挂链/环防护/兄弟序）、
 * arena 候选行、agents 启停判定与名单合成（未知名字保护——禁越权改写）。
 */
import { describe, expect, it } from 'vitest'
import {
  agentEnabledOf,
  contenderLineOf,
  treeRowsOf,
  updateDisabledAgents,
} from '../src/session/manage'
import type { AgentPresetDto, ArenaStatusDto, TreeNodeDto } from '@spark/protocol'

function node(id: string, parentId: string | undefined, label = id): TreeNodeDto {
  return {
    id,
    ...(parentId !== undefined ? { parentId } : {}),
    seq: 0,
    type: 'message',
    time: 0,
    label,
    childIds: [],
    forks: [],
  } as unknown as TreeNodeDto
}

describe('treeRowsOf', () => {
  it('按 parentId 挂链深度优先展开，兄弟保持引擎时间序', () => {
    const rows = treeRowsOf([
      node('a', undefined, '根'),
      node('b', undefined, '根2'),
      node('a1', 'a'),
      node('a2', 'a'),
      node('a1x', 'a1'),
    ])
    expect(rows.map((r) => `${r.depth}:${r.node.id}`)).toEqual([
      '0:a',
      '1:a1',
      '2:a1x',
      '1:a2',
      '0:b',
    ])
  })

  it('父缺失的孤儿按根处理；环不致死循环（a↔b 互指时各自只渲染一次）', () => {
    const a = { ...node('a', 'b') }
    const b = { ...node('b', 'a') }
    const rows = treeRowsOf([a, b])
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.depth === 0)).toBe(true)
  })

  it('空树出空列表', () => {
    expect(treeRowsOf([])).toEqual([])
  })
})

describe('contenderLineOf', () => {
  it('模型/状态/时长三段；无时长省略不造 0', () => {
    const base = { sessionId: 's1', model: 'm1', status: 'running' } as ArenaStatusDto['contenders'][number]
    expect(contenderLineOf(base)).toBe('m1 · running')
    expect(contenderLineOf({ ...base, durationMs: 9500 })).toBe('m1 · running · 10s')
  })
})

describe('agentEnabledOf / updateDisabledAgents', () => {
  const preset = { name: 'planner' } as AgentPresetDto

  it('启停判定：名单命中或 preset 自身 disabled 都算停用', () => {
    expect(agentEnabledOf(preset, new Set())).toBe(true)
    expect(agentEnabledOf(preset, new Set(['planner']))).toBe(false)
    expect(agentEnabledOf({ ...preset, disabled: true }, new Set())).toBe(false)
  })

  it('关 = 追加（幂等）；开 = 移除', () => {
    expect(updateDisabledAgents([], 'planner', false)).toEqual(['planner'])
    expect(updateDisabledAgents(['planner'], 'planner', false)).toEqual(['planner'])
    expect(updateDisabledAgents(['planner'], 'planner', true)).toEqual([])
  })

  it('名单里未知名字原样保留（全量覆盖语义下不越权改写服务端配置）', () => {
    expect(updateDisabledAgents(['planner', 'ghost-x'], 'planner', false)).toEqual([
      'planner',
      'ghost-x',
    ])
    expect(updateDisabledAgents(['planner', 'ghost-x'], 'planner', true)).toEqual(['ghost-x'])
  })
})
