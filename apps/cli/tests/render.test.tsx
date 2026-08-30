/**
 * CLI 组件 test-renderer 单测（工单 8.5 / doc/06 §5）：ink-testing-library 渲染断言。
 * 纯逻辑（摘要/截断）直测；组件经 frames 断言关键文案——不依赖真实 tty。
 */
import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { emptySessionSlice, ids } from '@spark/protocol'
import type { SessionSlice, UiItem } from '@spark/protocol'
import { StatusBar } from '../src/components/StatusBar.js'
import { MessagePane } from '../src/components/MessagePane.js'
import { ApprovalPrompt } from '../src/components/ApprovalPrompt.js'
import { InputBox } from '../src/components/InputBox.js'
import { Footer } from '../src/components/Footer.js'
import { filterSlashCommands } from '../src/components/SlashMenu.js'
import { ItemView, summarizeToolInput, toolCategoryOf, toolOutputText } from '../src/components/items.js'

const SID = ids.session('ses_cli00001')
const TURN = ids.turn('trn_cli00001')

function slice(): SessionSlice {
  const s = emptySessionSlice(SID)
  s.meta.model = 'deepseek/chat'
  s.lastSeq = 5
  return s
}

const NO_EXPAND: ReadonlySet<string> = new Set()

function itemOf(item: UiItem) {
  return render(
    <ItemView item={item} expandedTools={NO_EXPAND} expandedReasoning={NO_EXPAND} />,
  ).lastFrame()
}

describe('纯逻辑', () => {
  it('summarizeToolInput：常见键取值、单行化、60 字截断', () => {
    expect(summarizeToolInput({ command: 'ls  -la\n/tmp' })).toBe('ls -la /tmp')
    expect(summarizeToolInput({ file_path: '/a.ts' })).toBe('/a.ts')
    expect(summarizeToolInput({ other: 1 })).toBe('')
    expect(summarizeToolInput(null)).toBe('')
    const long = 'x'.repeat(80)
    expect(summarizeToolInput({ query: long })).toBe(`${'x'.repeat(57)}...`)
  })

  it('toolCategoryOf：内置映射人话类别词；未知保留原名（禁假状态）', () => {
    expect(toolCategoryOf('bash')).toBe('终端')
    expect(toolCategoryOf('read')).toBe('读取')
    expect(toolCategoryOf('write')).toBe('写入')
    expect(toolCategoryOf('edit')).toBe('改写')
    expect(toolCategoryOf('task')).toBe('子代理')
    expect(toolCategoryOf('memory.save')).toBe('记忆')
    expect(toolCategoryOf('browser.open')).toBe('浏览')
    expect(toolCategoryOf('mcp__github__search')).toBe('mcp__github__search')
  })

  it('toolOutputText：短输出原样；超长截头保尾', () => {
    expect(toolOutputText('a\nb')).toBe('a\nb')
    const big = Array.from({ length: 60 }, (_, i) => `l${i}`).join('\n')
    const out = toolOutputText(big, 50)
    expect(out.startsWith('...（前 10 行已截断）')).toBe(true)
    expect(out.endsWith('l59')).toBe(true)
  })
})

describe('ItemView', () => {
  it('user：> 前缀原文', () => {
    const f = itemOf({ kind: 'user', eventId: ids.event('evt_u1'), text: '你好' })
    expect(f).toContain('> 你好')
  })

  it('assistant：流式取 textBuf，定稿取 content text', () => {
    const streaming = itemOf({
      kind: 'assistant',
      eventId: ids.event('evt_a1'),
      content: [],
      streaming: { textBuf: '正在写' },
    })
    expect(streaming).toContain('正在写')
    const final = itemOf({
      kind: 'assistant',
      eventId: ids.event('evt_a2'),
      content: [{ type: 'text', text: '写完了' }],
    })
    expect(final).toContain('写完了')
  })

  it('reasoning：默认折叠一行（含时长与快捷键提示）；展开多行', () => {
    const collapsed = itemOf({
      kind: 'reasoning',
      eventId: ids.event('evt_r1'),
      text: '想一想',
      streaming: false,
    })
    expect(collapsed).toContain('思考（3 字）')
    expect(collapsed).toContain('ctrl+o 展开/收起')

    const expanded = render(
      <ItemView
        item={{ kind: 'reasoning', eventId: ids.event('evt_r1'), text: '全文', streaming: false }}
        expandedTools={NO_EXPAND}
        expandedReasoning={new Set(['evt_r1'])}
      />,
    ).lastFrame()
    expect(expanded).toContain('全文')
  })

  it('reasoning：有 durationMs 时显示「持续 N 秒」（工单 10.9）', () => {
    const f = itemOf({
      kind: 'reasoning',
      eventId: ids.event('evt_r2'),
      text: '想了想',
      streaming: false,
      durationMs: 3200,
    })
    expect(f).toContain('持续 3 秒')
  })

  it('turn：完成定格「已工作 N 秒」；进行中「工作中」（工单 10.9 回合头）', () => {
    const done = itemOf({
      kind: 'turn',
      eventId: ids.event('evt_t0'),
      turnId: TURN,
      startedAt: 1000,
      finishedAt: 4000,
      finish: 'stop',
    })
    expect(done).toContain('已工作 3 秒')
    const running = itemOf({
      kind: 'turn',
      eventId: ids.event('evt_t1'),
      turnId: TURN,
      startedAt: Date.now(),
    })
    expect(running).toContain('工作中')
  })

  it('tool：运行中「… 类别词 · esc to cancel」；完成「✓」（工单 10.9 人话头部）', () => {
    const base = {
      kind: 'tool',
      eventId: ids.event('evt_t1'),
      callId: ids.call('cal_c1'),
      name: 'bash',
      input: { command: 'ls' },
      progressBuf: '',
    } as const
    const running = itemOf({ ...base, status: 'running' })
    expect(running).toContain('终端')
    expect(running).toContain('ls')
    expect(running).toContain('esc to cancel')
    expect(running).not.toContain('运行中')

    const done = render(
      <ItemView
        item={{ ...base, status: 'completed', output: 'ok-line' }}
        expandedTools={new Set(['cal_c1'])}
        expandedReasoning={NO_EXPAND}
      />,
    ).lastFrame()
    expect(done).toContain('✓')
    expect(done).toContain('ok-line')
  })

  it('tool：审批拒绝（output.code=E_PERMISSION）整行删除线+「已拒绝」（工单 10.9）', () => {
    const f = itemOf({
      kind: 'tool',
      eventId: ids.event('evt_t2'),
      callId: ids.call('cal_c2'),
      name: 'bash',
      input: { command: 'rm -rf /' },
      status: 'error',
      progressBuf: '',
      output: { code: 'E_PERMISSION' },
    })
    expect(f).toContain('已拒绝')
    expect(f).toContain('\u001b[9m') // ANSI 删除线包裹
    expect(f).not.toContain('失败')
  })

  it('approval 已解决：[审批] 行 + 答复文案；拒绝带删除线', () => {
    const once = itemOf({
      kind: 'approval',
      eventId: ids.event('evt_p1'),
      requestId: ids.request('req_r1'),
      action: 'write',
      resource: '/a.txt',
      reason: '写入',
      status: 'resolved',
      reply: 'once',
    })
    expect(once).toContain('[审批]')
    expect(once).toContain('允许一次')
    const rejected = itemOf({
      kind: 'approval',
      eventId: ids.event('evt_p1b'),
      requestId: ids.request('req_r1b'),
      action: 'write',
      resource: '/a.txt',
      reason: '写入',
      status: 'resolved',
      reply: 'reject',
    })
    expect(rejected).toContain('已拒绝')
    expect(rejected).toContain('\u001b[9m')
  })
})

describe('ApprovalPrompt', () => {
  it('挂起审批：动作/资源/数字键三选项 + 理由行（工单 10.9）', () => {
    const f = render(
      <ApprovalPrompt
        item={{
          kind: 'approval',
          eventId: ids.event('evt_p2'),
          requestId: ids.request('req_r2'),
          action: 'bash',
          resource: 'rm -rf /tmp/x',
          reason: '清理临时目录',
          status: 'pending',
        }}
      />,
    ).lastFrame()
    expect(f).toContain('[审批]')
    expect(f).toContain('rm -rf /tmp/x')
    expect(f).toContain('1 是，允许一次（y）')
    expect(f).toContain('2 总是允许（a）')
    expect(f).toContain('3 否，建议更改（n，esc 取消）')
    expect(f).toContain('清理临时目录')
  })
})

describe('StatusBar', () => {
  it('口径字段齐：连接 · 模型 · seq · 提交模式；水位缺省不渲染', () => {
    const f = render(<StatusBar slice={slice()} />).lastFrame()
    expect(f).toContain('deepseek/chat')
    expect(f).toContain('seq 5')
    expect(f).toContain('[now]')
    expect(f).not.toContain('水位') // models 未装载 → 窗口未知，禁假状态
  })

  it('无会话：模型位显 — 不断言其他', () => {
    const f = render(<StatusBar slice={null} />).lastFrame()
    expect(f).toContain('—')
  })

  it('turn 进行中：step 与等待审批', () => {
    const s = slice()
    s.activeTurn = { turnId: TURN, stepCount: 2, runningTools: new Set(), waiting: true }
    const f = render(<StatusBar slice={s} />).lastFrame()
    expect(f).toContain('step 2')
    expect(f).toContain('等待审批')
  })
})

describe('MessagePane', () => {
  it('无会话：提示新建', () => {
    const f = render(<MessagePane slice={null} />).lastFrame()
    expect(f).toContain('无会话')
  })

  it('定稿条目进 Static，挂起审批不在消息流重复', () => {
    const s = slice()
    s.items = [
      { kind: 'user', eventId: ids.event('evt_u1'), text: '第一句' },
      {
        kind: 'approval',
        eventId: ids.event('evt_p3'),
        requestId: ids.request('req_r3'),
        action: 'write',
        resource: '/b.txt',
        reason: '写',
        status: 'pending',
      },
    ]
    const { frames } = render(<MessagePane slice={s} />)
    const all = frames.join('\n')
    expect(all).toContain('第一句')
    // 挂起审批由 ApprovalPrompt 专渲——消息流不重复出现资源串
    expect(all).not.toContain('/b.txt')
  })
})

describe('InputBox', () => {
  it('字符输入后 Enter 提交并清空', () => {
    const submitted: string[] = []
    const { stdin, lastFrame } = render(
      <InputBox active prefix="> " placeholder="输入" onSubmit={(t) => submitted.push(t)} />,
    )
    stdin.write('hi')
    stdin.write('\r')
    expect(submitted).toEqual(['hi'])
    expect(lastFrame()).toContain('> ') // 提交后回输入框（值为空显 placeholder）
  })

  it('退格删字符；空白输入 Enter 不提交', () => {
    const submitted: string[] = []
    const { stdin } = render(
      <InputBox active prefix="> " placeholder="输入" onSubmit={(t) => submitted.push(t)} />,
    )
    stdin.write('ab')
    stdin.write('\x7F') // backspace
    stdin.write('\r')
    expect(submitted).toEqual(['a'])
    stdin.write(' \r')
    expect(submitted).toEqual(['a']) // 纯空白不提交
  })

  it('active=false 不接收输入', () => {
    const submitted: string[] = []
    const { stdin } = render(
      <InputBox active={false} prefix="> " placeholder="输入" onSubmit={(t) => submitted.push(t)} />,
    )
    stdin.write('x\r')
    expect(submitted).toEqual([])
  })
})

describe('Footer（工单 10.8 / §13.K K.4 双行）', () => {
  it('第 1 行：→项目 · 模型 · 分支真值；第 2 行：提交模式 + 帮助/统计入口', () => {
    const s = slice()
    s.meta.cwd = '/home/wanfeng/Spark'
    s.meta.branch = 'main'
    const f = render(<Footer slice={s} />).lastFrame()
    expect(f).toContain('→Spark')
    expect(f).toContain('git:(main)')
    expect(f).toContain('deepseek/chat')
    expect(f).toContain('[now]')
    expect(f).toContain('? 帮助')
    expect(f).toContain('/stats 明细')
  })

  it('分支缺省不渲染该段（禁假状态）', () => {
    const s = slice()
    s.meta.cwd = '/home/wanfeng/Spark'
    const f = render(<Footer slice={s} />).lastFrame()
    expect(f).not.toContain('git:(')
  })
})

describe('slash 菜单过滤（工单 10.10）', () => {
  const commands = [
    { name: 'compact', description: '压缩上下文', kind: 'action' as const },
    { name: 'model', description: '换模型', kind: 'client' as const },
    { name: 'review', description: '自定义评审', kind: 'prompt' as const },
  ]

  it('空查询全列出；按名称与描述子串过滤', () => {
    expect(filterSlashCommands(commands, '')).toHaveLength(3)
    expect(filterSlashCommands(commands, 'com').map((c) => c.name)).toEqual(['compact'])
    expect(filterSlashCommands(commands, '评审').map((c) => c.name)).toEqual(['review'])
    expect(filterSlashCommands(commands, 'zzz')).toEqual([])
  })
})
