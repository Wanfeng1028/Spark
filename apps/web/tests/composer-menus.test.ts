/**
 * Composer 菜单纯逻辑单测（DESIGN §13.E，工单 6.3）：
 * detectMenu 触发检测（@ 句中可触 / 仅行首触发、路径防误触）、filterCommands 过滤、
 * 权限档位表（四档/id 对齐/warn 唯一）、segmentDisplay 分段显示值推导。
 * 纯函数无 React 渲染——组件层键盘导航由 Playwright 组件测试覆盖（doc/06）。
 */
import { describe, expect, test } from 'vitest'
import type { PermissionPreset } from '@spark/protocol'
import {
  COMMAND_PENDING_HINT,
  PERMISSION_TIERS,
  SLASH_COMMANDS,
  detectMenu,
  filterCommands,
  segmentDisplay,
  tierOf,
} from '../src/features/chat/composer-menus'

describe('detectMenu（§13.E 触发词检测）', () => {
  test('@ 词触发 at 菜单（含过滤词与起点）', () => {
    expect(detectMenu('帮我读 @src/comp', 13)).toEqual({
      kind: 'at',
      query: 'src/comp',
      start: 4,
    })
  })

  test('句中词不含 @ → 不触发', () => {
    expect(detectMenu('帮我读 src/comp 文件', 13)).toBeNull()
  })

  test('/ 仅行首触发（路径防误触）', () => {
    expect(detectMenu('/comp', 5)).toEqual({ kind: 'slash', query: 'comp', start: 0 })
    expect(detectMenu('看 /etc/hosts 文件', 12)).toBeNull()
  })

  test('/ 在第二行行首也触发（多行草稿）', () => {
    expect(detectMenu('第一行\n/com', 9)).toEqual({ kind: 'slash', query: 'com', start: 4 })
  })

  test('光标停在触发符末尾：@ 句中空查询触发；行首 / 空查询触发；裸词不触发', () => {
    expect(detectMenu('看看 @', 4)).toEqual({ kind: 'at', query: '', start: 3 })
    expect(detectMenu('/', 1)).toEqual({ kind: 'slash', query: '', start: 0 })
    expect(detectMenu('普通文本', 4)).toBeNull()
  })
})

describe('filterCommands（/ 菜单命令过滤）', () => {
  test('空查询 → 全量内置基线（六条）', () => {
    expect(filterCommands('')).toEqual(SLASH_COMMANDS)
    expect(SLASH_COMMANDS).toHaveLength(6)
  })

  test('按名称过滤（大小写不敏感）', () => {
    expect(filterCommands('COMP')).toEqual([
      { name: 'compact', description: '压缩上下文（保留摘要，释放窗口）', available: true },
    ])
  })

  test('按描述过滤（中文包含）', () => {
    const hit = filterCommands('模型')
    expect(hit.map((c) => c.name)).toEqual(['model'])
  })

  test('无匹配 → 空列表', () => {
    expect(filterCommands('不存在的命令')).toEqual([])
  })

  test('只有 compact 可执行（available=true，其余阶段七 7.4）', () => {
    expect(SLASH_COMMANDS.filter((c) => c.available).map((c) => c.name)).toEqual(['compact'])
    expect(COMMAND_PENDING_HINT).toContain('7.4')
  })
})

describe('PERMISSION_TIERS（§13.E 权限四档表）', () => {
  test('四档且 id 与协议枚举对齐、顺序稳定', () => {
    expect(PERMISSION_TIERS.map((t) => t.id)).toEqual<PermissionPreset[]>([
      'confirm-each',
      'auto-edit',
      'plan',
      'full-access',
    ])
  })

  test('仅完全访问档 warn=true（琥珀警示，实测 ZCode）', () => {
    expect(PERMISSION_TIERS.filter((t) => t.warn).map((t) => t.id)).toEqual(['full-access'])
  })

  test('tierOf 已知档命中 / 未知值回落缺省档', () => {
    expect(tierOf('plan').id).toBe('plan')
    expect(tierOf('auto-edit').label).toBe('自动编辑')
    expect(tierOf('unknown' as PermissionPreset).id).toBe('confirm-each')
  })
})

describe('segmentDisplay（提交模式分段显示值）', () => {
  test('空闲恒 now（steer/queue 无轮可注入）', () => {
    expect(segmentDisplay('steer', false, 'steer')).toBe('now')
    expect(segmentDisplay('queue', false, 'queue')).toBe('now')
  })

  test('运行中 now 不可选：回落设置默认档（now 视作 steer）', () => {
    expect(segmentDisplay('now', true, 'now')).toBe('steer')
    expect(segmentDisplay('now', true, 'steer')).toBe('steer')
    expect(segmentDisplay('now', true, 'queue')).toBe('queue')
  })

  test('运行中非 now 档原样透传（用户显式选择）', () => {
    expect(segmentDisplay('steer', true, 'queue')).toBe('steer')
    expect(segmentDisplay('queue', true, 'steer')).toBe('queue')
  })
})
