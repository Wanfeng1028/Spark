/**
 * CLI 小件批单测（阶段十九 19.25 第一批）：InputBox 编辑键位表 + 命令清单 surface 过滤
 * + i18n 框架消费（cli.* 两语字典与回落）。
 */
import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { BUILTIN_COMMANDS, translate } from '@spark/protocol'
import type { CommandDto } from '@spark/protocol'
import { InputBox } from '../src/components/InputBox.js'
import { visibleToCli } from '../src/hooks/use-cli-actions.js'
import { cliT } from '../src/i18n.js'
import { useCliStore } from '../src/store.js'

const KEYS = {
  home: '\x1b[H',
  end: '\x1b[F',
  ctrlA: '\x01',
  ctrlE: '\x05',
  ctrlK: '\x0b',
  ctrlW: '\x17',
} as const

/** 逐段写入并收集 onPreview 上报的整值（每段之间让出事件循环——Ink 的 stdin 解析是异步的） */
async function type(segments: readonly string[]): Promise<string[]> {
  const previews: string[] = []
  const { stdin } = render(
    <InputBox active prefix="" placeholder="" onSubmit={() => {}} onPreview={(v) => previews.push(v)} />,
  )
  const write = stdin as unknown as { write: (s: string) => void }
  for (const s of segments) {
    write.write(s)
    await new Promise((r) => setTimeout(r, 5))
  }
  return previews
}

describe('InputBox 编辑键扩展（工单 19.25）', () => {
  it('Ctrl+W 删前一个词（按空格分词，保留词间空格）', async () => {
    const previews = await type(['alpha beta', KEYS.ctrlW])
    expect(previews.at(-1)).toBe('alpha ')
  })

  it('Ctrl+A 移到行首后 Ctrl+K 删到行尾 = 清空', async () => {
    const previews = await type(['keep this', KEYS.ctrlA, KEYS.ctrlK])
    expect(previews.at(-1)).toBe('')
  })

  it('Home/End 移首尾且不改动文本', async () => {
    expect((await type(['abc', KEYS.home])).at(-1)).toBe('abc')
    expect((await type(['abc', KEYS.end, 'd'])).at(-1)).toBe('abcd')
  })

  it('Ctrl+E 等同 End：光标到末尾后继续输入接在尾部', async () => {
    expect((await type(['ab', KEYS.ctrlE, 'c'])).at(-1)).toBe('abc')
  })
})

describe('命令清单按 surface 过滤（工单 19.25）', () => {
  it('无 surface 字段的旧载荷按可见处理；不含 cli 的剔除；client 命令缺 clientAction 剔除', () => {
    const legacy = { name: 'legacy', description: '', kind: 'action' } as CommandDto
    const cliOnly: CommandDto = {
      name: 'mcp',
      description: '',
      kind: 'client',
      group: 'info',
      surface: ['cli'],
      sessionRequired: false,
      clientAction: 'mcp',
    }
    const webOnly: CommandDto = { ...cliOnly, name: 'webonly', surface: ['web'] }
    const clientNoAction: CommandDto = {
      ...cliOnly,
      name: 'broken',
      clientAction: undefined,
    }
    expect(visibleToCli([legacy, cliOnly, webOnly, clientNoAction]).map((c) => c.name)).toEqual([
      'legacy',
      'mcp',
    ])
  })

  it('词表实数经本端过滤后不含"无 clientAction 的 client 命令"（兜底文案已删）', () => {
    const filtered = visibleToCli(BUILTIN_COMMANDS)
    expect(filtered.some((c) => c.kind === 'client' && c.clientAction === undefined)).toBe(false)
    // 与会话无关的 client 命令必须在清单里（/agents /settings 曾被子系统前置挡掉）
    expect(filtered.map((c) => c.name)).toContain('settings')
    expect(filtered.map((c) => c.name)).toContain('agents')
  })
})

describe('i18n 框架消费（工单 19.25，cli.* 命名空间）', () => {
  it('cli.* 两语齐备（缺任一键 translate 会回落中文——en 端将静默不翻）', () => {
    const keys = [
      'cli.loading',
      'cli.writing',
      'cli.saved',
      'cli.failed',
      'cli.confirmAgain',
      'cli.escClose',
      'cli.restartBadge',
      'cli.navHint',
      'cli.editHint',
    ]
    for (const key of keys) {
      expect(translate('en', key)).not.toBe(key)
      expect(translate('zh-CN', key)).not.toBe(key)
      expect(translate('en', key)).not.toBe(translate('zh-CN', key))
    }
  })

  it('占位符替换 + 缺键回落 key 本身', () => {
    expect(translate('en', 'cli.confirmAgain', { label: '删除 drop' })).toContain('drop')
    expect(translate('en', 'cli.nope')).toBe('cli.nope')
  })

  it('cliT 跟随 store.language 切换', () => {
    const prev = useCliStore.getState().language
    try {
      useCliStore.getState().setLanguage('en')
      expect(cliT('cli.loading')).toBe('Loading…')
      useCliStore.getState().setLanguage('zh-CN')
      expect(cliT('cli.loading')).toBe('装载中…')
    } finally {
      useCliStore.getState().setLanguage(prev)
    }
  })
})
