/**
 * 键位覆盖层单测（阶段十九工单 19.39 / V2-22）：合并、未知条目丢弃、解除绑定标记、
 * 冲突判定（键串大小写与空白归一 / 跨 surface 不算撞车 / both 与任一端都算）。
 * 判据是"给用户看的那张生效表"——按下逻辑在各端物理层，本表错一条就是骗用户。
 */
import { describe, expect, test } from 'vitest'
import {
  KEYMAP,
  KEYMAP_ACTIONS,
  effectiveSpecOf,
  keymapRejected,
  keymapUnparseable,
  mergeKeymap,
  parseKeySpec,
  specMatchesStroke,
} from '../src/keymap.js'

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
    // 断言打在刚合并出的 r 上：文件顶部的 find() 走的是 mergeKeymap(undefined)（无覆盖），
    // 用它查 unbound 恒为 false
    expect(r.entries.find((e) => e.action === '清空输入')?.unbound).toBe(true)
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

describe('机器可读键规格（19.39 第二批：覆盖层要真生效，就得能解析用户写的那串字）', () => {
  test('KEYMAP_ACTIONS 每个值都钉在 KEYMAP 上且带 spec——action 是覆盖层身份，端侧抄错一个字符就静默废掉一个快捷键', () => {
    for (const action of Object.values(KEYMAP_ACTIONS)) {
      const entry = KEYMAP.find((k) => k.action === action)
      expect(entry, `KEYMAP 里没有「${action}」——KEYMAP_ACTIONS 已漂移`).toBeDefined()
      expect(entry?.spec, `「${action}」没有 spec，端侧无从比对按键`).toBeDefined()
    }
  })

  test('parseKeySpec：认 Ctrl+G / Ctrl/Cmd+K / Shift+Enter / 单键，大小写与空白归一', () => {
    expect(parseKeySpec('Ctrl/Cmd+K')).toEqual({ key: 'k', ctrlOrMeta: true, shift: false, alt: false })
    expect(parseKeySpec('ctrl + cmd + k')).toEqual({ key: 'k', ctrlOrMeta: true, shift: false, alt: false })
    expect(parseKeySpec('Shift+Enter')).toEqual({ key: 'Enter', ctrlOrMeta: false, shift: true, alt: false })
    expect(parseKeySpec('/')).toEqual({ key: '/', ctrlOrMeta: false, shift: false, alt: false })
    expect(parseKeySpec('Ctrl/Cmd+,')).toEqual({ key: ',', ctrlOrMeta: true, shift: false, alt: false })
  })

  test('parseKeySpec：解析不出一律 null——计数写法/空串/只有修饰键/多主键/非法主键', () => {
    // 'Ctrl+C ×2' 若被放过就成 key='C ×2' 的死绑定（永不匹配任何真实按键 = 静默解绑）
    expect(parseKeySpec('Ctrl+C ×2')).toBeNull()
    expect(parseKeySpec('Home / End / Ctrl+A / Ctrl+E')).toBeNull()
    expect(parseKeySpec('')).toBeNull()
    expect(parseKeySpec('   ')).toBeNull()
    expect(parseKeySpec('Ctrl+')).toBeNull()
    expect(parseKeySpec('Ctrl')).toBeNull()
    expect(parseKeySpec('A+B')).toBeNull()
    expect(parseKeySpec('Ctrl+随便什么')).toBeNull()
  })

  test('specMatchesStroke：主键小写归一、Ctrl 与 Cmd 任一即算、四个修饰位全等才命中', () => {
    const spec = parseKeySpec('Ctrl/Cmd+K')
    expect(spec).not.toBeNull()
    if (spec === null) return
    expect(specMatchesStroke(spec, { key: 'k', ctrl: true, meta: false, shift: false, alt: false })).toBe(true)
    expect(specMatchesStroke(spec, { key: 'K', ctrl: false, meta: true, shift: false, alt: false })).toBe(true)
    // 多一个 Shift 不算：可改键位后必须精确匹配，否则改绑到 Ctrl+Shift+K 会与旧的宽松匹配同时命中
    expect(specMatchesStroke(spec, { key: 'k', ctrl: true, meta: false, shift: true, alt: false })).toBe(false)
    expect(specMatchesStroke(spec, { key: 'j', ctrl: true, meta: false, shift: false, alt: false })).toBe(false)
    expect(specMatchesStroke(spec, { key: 'k', ctrl: false, meta: false, shift: false, alt: false })).toBe(false)
  })

  test('effectiveSpec：覆盖后按新键串解析；解绑为 null；无 spec 的行永远 null（改了也不生效）', () => {
    const rebound = mergeKeymap([{ action: KEYMAP_ACTIONS.palette, keys: 'Ctrl+J' }])
    expect(effectiveSpecOf(rebound.entries, KEYMAP_ACTIONS.palette)).toEqual({
      key: 'j',
      ctrlOrMeta: true,
      shift: false,
      alt: false,
    })
    // 改后旧键必须不再命中，否则一个动作两个键都能触发
    const stroke = (key: string): { key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean } => ({
      key,
      ctrl: true,
      meta: false,
      shift: false,
      alt: false,
    })
    const spec = effectiveSpecOf(rebound.entries, KEYMAP_ACTIONS.palette)
    expect(spec).not.toBeNull()
    if (spec !== null) {
      expect(specMatchesStroke(spec, stroke('j'))).toBe(true)
      expect(specMatchesStroke(spec, stroke('k'))).toBe(false)
    }
    expect(effectiveSpecOf(mergeKeymap([{ action: KEYMAP_ACTIONS.palette, keys: '' }]).entries, KEYMAP_ACTIONS.palette)).toBeNull()
    // '发送消息' 在内置表里没有 spec（Composer 的 Enter 未接覆盖层）：写了合法键串也回 null
    expect(effectiveSpecOf(mergeKeymap([{ action: '发送消息', keys: 'Ctrl+Enter' }]).entries, '发送消息')).toBeNull()
  })

  test('keymapUnparseable：已接 spec 的行写成解析不出的键串 → 拒存（放行等于静默解绑）', () => {
    expect(keymapUnparseable([{ action: KEYMAP_ACTIONS.palette, keys: 'Ctrl+C ×2' }])).toEqual([
      { action: KEYMAP_ACTIONS.palette, keys: 'Ctrl+C ×2' },
    ])
    expect(keymapUnparseable([{ action: KEYMAP_ACTIONS.palette, keys: 'Ctrl+J' }])).toEqual([])
    // 解绑（空串）是用户的显式意图，不算"解析不出"
    expect(keymapUnparseable([{ action: KEYMAP_ACTIONS.palette, keys: '' }])).toEqual([])
    // 无 spec 的行不归这条判据管（它本就不可改，由编辑面只读挡住）
    expect(keymapUnparseable([{ action: '发送消息', keys: '×××' }])).toEqual([])
    // 未知 action 归 keymapRejected 管，这里不重复报
    expect(keymapUnparseable([{ action: '不存在的动作', keys: '×××' }])).toEqual([])
  })
})
