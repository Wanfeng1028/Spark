/**
 * 键位覆盖层单测（阶段十九工单 19.39 / V2-22）：合并、未知条目丢弃、解除绑定标记、
 * 冲突判定（键串大小写与空白归一 / 跨 surface 不算撞车 / both 与任一端都算）。
 * 判据是"给用户看的那张生效表"——按下逻辑在各端物理层，本表错一条就是骗用户。
 */
import { describe, expect, test } from 'vitest'
import { KEYMAP, keymapRejected, mergeKeymap } from '../src/keymap.js'

const find = (action: string) => mergeKeymap(undefined).entries.find((e) => e.action === action)

describe('mergeKeymap（内置表 + 用户覆盖）', () => {
  test('无覆盖：逐条等值、全未改、零冲突', () => {
    const r = mergeKeymap(undefined)
    expect(r.entries).toHaveLength(KEYMAP.length)
    expect(r.entries.every((e) => !e.overridden && !e.unbound)).toBe(true)
    expect(r.conflicts).toEqual([])
    expect(r.unknownActions).toEqual([])
  })

  test('改键位只影响合并结果，内置表本体不被就地改写（四端共享常量不得被用户态污染）', () => {
    const r = mergeKeymap([{ action: '发送消息', keys: 'Ctrl+Enter' }])
    expect(r.entries.find((e) => e.action === '发送消息')?.keys).toBe('Ctrl+Enter')
    expect(r.entries.find((e) => e.action === '发送消息')?.overridden).toBe(true)
    expect(KEYMAP.find((k) => k.action === '发送消息')?.keys).toBe('Enter')
  })

  test('未知 action 的覆盖项丢弃并如实回传（不静默生效到别的条目上）', () => {
    const r = mergeKeymap([{ action: '不存在的动作', keys: 'Ctrl+Q' }])
    expect(r.unknownActions).toEqual(['不存在的动作'])
    expect(r.entries.every((e) => !e.overridden)).toBe(true)
  })

  test('空串 = 解除绑定：unbound 为真（各端须显式标"未绑定"，不得静默回落内置键）', () => {
    const r = mergeKeymap([{ action: '清空输入', keys: '' }])
    const e = r.entries.find((x) => x.action === '清空输入')
    expect(e?.unbound).toBe(true)
    expect(e?.overridden).toBe(true)
  })

  test('同一 surface 撞同一键 → 冲突登记（大小写与空白归一后仍算同一键）', () => {
    const r = mergeKeymap([
      { action: '中断当前 turn', keys: 'Ctrl+X' },
      { action: '新建会话（同 /new）', keys: 'ctrl + x' },
    ])
    expect(r.conflicts).toHaveLength(1)
    expect([...(r.conflicts[0]?.actions ?? [])].sort()).toEqual(
      ['中断当前 turn', '新建会话（同 /new）'].sort(),
    )
  })

  test('不同 surface 用同一键不算撞车（web 与 cli 各一套物理键是既定事实）', () => {
    const r = mergeKeymap([
      { action: '命令面板', keys: 'Ctrl+K' }, // 仅 web
      { action: '清空输入', keys: 'Ctrl+K' }, // 仅 cli
    ])
    expect(r.conflicts).toEqual([])
  })

  test('解除绑定的条目不参与冲突判定（腾出的键可以给别的条目用）', () => {
    const r = mergeKeymap([
      { action: '清空输入', keys: '' },
      { action: '中断当前 turn', keys: 'Ctrl+U' },
    ])
    expect(r.conflicts).toEqual([])
    expect(find('清空输入')?.unbound).toBe(true)
  })
})

describe('keymapRejected（保存前判据）', () => {
  test('干净覆盖 → null（可保存）', () => {
    expect(keymapRejected([{ action: '发送消息', keys: 'Ctrl+Enter' }])).toBeNull()
    expect(keymapRejected(undefined)).toBeNull()
  })

  test('冲突或未知条目 → 返回明细供调用方拒存并提示', () => {
    const bad = keymapRejected([{ action: '不存在的动作', keys: 'Ctrl+Q' }])
    expect(bad?.unknownActions).toEqual(['不存在的动作'])
    const clash = keymapRejected([
      { action: '中断当前 turn', keys: 'Ctrl+X' },
      { action: '新建会话（同 /new）', keys: 'CTRLX' },
      { action: '清空输入', keys: 'ctrlx' },
    ])
    expect(clash?.conflicts.length).toBe(1)
  })
})
