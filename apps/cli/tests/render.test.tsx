/**
 * CLI 组件 test-renderer 单测（工单 8.5 / doc/06 §5）：ink-testing-library 渲染断言。
 * 纯逻辑（摘要/截断）直测；组件经 frames 断言关键文案——不依赖真实 tty。
 */
import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { act, createRef } from 'react'
import { BUILTIN_COMMANDS, emptySessionSlice, flowRowsOf, ids } from '@spark/protocol'
import { displayWidth } from '../src/text-width.js'
import type { SessionSlice, UiItem } from '@spark/protocol'
import { StatusBar } from '../src/components/StatusBar.js'
import { MessagePane } from '../src/components/MessagePane.js'
import { ApprovalPrompt } from '../src/components/ApprovalPrompt.js'
import { InputBox, type InputBoxHandle } from '../src/components/InputBox.js'
import { Footer } from '../src/components/Footer.js'
import { LoadingIndicator } from '../src/components/LoadingIndicator.js'
import { BootHeader } from '../src/components/BootHeader.js'
import { filterSlashCommands } from '../src/components/SlashMenu.js'
import { FsMenu, parseAtToken } from '../src/components/FsMenu.js'
import { ItemView, summarizeToolInput, toolOutputText, toolOutputLines, ToolGroupLine } from '../src/components/items.js'
import { rowSettled } from '../src/flow-rows.js'
import { ResumePanel } from '../src/components/ResumePanel.js'

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
    expect(summarizeToolInput({ query: long })).toBe(`${'x'.repeat(59)}…`)
  })

  it('toolOutputText：短输出原样；超长截头保尾', () => {
    expect(toolOutputText('a\nb')).toBe('a\nb')
    const big = Array.from({ length: 60 }, (_, i) => `l${i}`).join('\n')
    const out = toolOutputText(big, 50)
    expect(out.startsWith('...（前 10 行已截断）')).toBe(true)
    expect(out.endsWith('l59')).toBe(true)
  })

  it('summarizeToolInput：CJK 按显示宽度截断（工单 10.19②：一字 2 列）', () => {
    // 30 个 CJK = 60 列，恰好不截
    const exact = '测'.repeat(30)
    expect(summarizeToolInput({ query: exact })).toBe(exact)
    // 31 个 CJK = 62 列 → 截到 59 列内 + …（不切半字）
    const over = summarizeToolInput({ query: '测'.repeat(31) })
    expect(over.endsWith('…')).toBe(true)
    expect(displayWidth(over)).toBeLessThanOrEqual(60)
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
    expect(collapsed).toContain('Thinking')
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

  it('reasoning：有 durationMs 时显示「Thought for N 秒」（工单 10.36 Qwen 对齐）', () => {
    const f = itemOf({
      kind: 'reasoning',
      eventId: ids.event('evt_r2'),
      text: '想了想',
      streaming: false,
      durationMs: 3200,
    })
    expect(f).toContain('Thought for 3s')
    expect(f).toContain('∴')
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
  it('无会话且无 header：空帧（boot 头由 app 层经 header prop 恒印——工单 10.38）', () => {
    const f = render(<MessagePane slice={null} />).lastFrame() ?? ''
    expect(f).not.toContain('ERROR')
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

  it('高度预算（工单 10.33）：live 超预算只渲染尾部 + 折叠提示行；不超则原样', () => {
    const s = slice()
    // 全部未定稿（streaming 带 textBuf——流式文本源；rowSettled 判假）→ 8 行都在 live 区
    const streaming: SessionSlice['items'] = Array.from({ length: 8 }, (_, i) => ({
      kind: 'assistant',
      eventId: ids.event(`evt_l${i}`),
      content: [],
      streaming: { textBuf: `流式片段 ${i}` },
    }))
    s.items = streaming
    const clipped = render(<MessagePane slice={s} maxLiveRows={3} />).lastFrame() ?? ''
    expect(clipped).toContain('↑ 5 行已折叠')
    expect(clipped).toContain('流式片段 7')
    expect(clipped).not.toContain('流式片段 1')
    const full = render(<MessagePane slice={s} maxLiveRows={20} />).lastFrame() ?? ''
    expect(full).toContain('流式片段 1')
    expect(full).not.toContain('行已折叠')
    const unbudget = render(<MessagePane slice={s} />).lastFrame() ?? ''
    expect(unbudget).toContain('流式片段 1')
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

describe('Footer（工单 10.51 单行化，qwen 形态）', () => {
  it('单行：→项目 · 分支 · 模型 · 提交模式 · 帮助/统计入口同帧同行', () => {
    const s = slice()
    s.meta.cwd = '/home/wanfeng/Spark'
    s.meta.branch = 'main'
    const f = render(<Footer slice={s} />).lastFrame() ?? ''
    expect(f).toContain('→Spark')
    expect(f).toContain('git:(main)')
    expect(f).toContain('deepseek/chat')
    expect(f).toContain('[now]')
    expect(f).toContain('? 帮助')
    expect(f).toContain('/stats 明细')
    // 单行化（工单 10.51）：项目信息与提交模式在同一行（不再分两行）
    const footerLine = f.split('\n').find((l) => l.includes('→Spark')) ?? ''
    expect(footerLine).toContain('[now]')
  })

  it('分支缺省不渲染该段（禁假状态）', () => {
    const s = slice()
    s.meta.cwd = '/home/wanfeng/Spark'
    const f = render(<Footer slice={s} />).lastFrame()
    expect(f).not.toContain('git:(')
  })
})

describe('LoadingIndicator（工单 10.52 上游慢链路预警）', () => {
  function runningSlice(startedAgoMs: number): SessionSlice {
    const s = slice()
    s.activeTurn = { turnId: TURN, stepCount: 1, runningTools: new Set(), waiting: false }
    s.items = [
      { kind: 'turn', eventId: ids.event('evt_li1'), turnId: TURN, startedAt: Date.now() - startedAgoMs },
    ]
    return s
  }

  it('>10s 追加上游响应中 + Ctrl+C 可中断（慢链路可感知反馈）', () => {
    const f = render(<LoadingIndicator slice={runningSlice(15000)} />).lastFrame() ?? ''
    expect(f).toContain('上游响应中')
    expect(f).toContain('Ctrl+C 可中断')
  })

  it('<=10s 不出现慢链路预警（禁假状态：未慢不提示），基础尾缀仍在', () => {
    const f = render(<LoadingIndicator slice={runningSlice(2000)} />).lastFrame() ?? ''
    expect(f).not.toContain('上游响应中')
    expect(f).toContain('esc to cancel')
  })
})

describe('BootHeader（工单 10.32 / §13.K K.1 Qwen 首屏还原）', () => {
  it('宽屏双栏：SPARK 渐变 logo 与信息盒同帧 + API Key 行 + 模型提示 + 提示行', () => {
    const s = slice()
    s.meta.cwd = '/home/wanfeng/Spark'
    const f = render(<BootHeader slice={s} models={null} columns={120} />).lastFrame()
    expect(f).toContain('██╔════╝') // logo 字形行（ANSI Regular 风格）在帧内
    expect(f).toContain('>_ Spark')
    expect(f).toContain('API Key |')
    expect(f).toContain('（/model 切换）')
    expect(f).toContain('提示：')
  })

  it('窄屏隐藏 logo、信息盒保留（不堆叠）', () => {
    const s = slice()
    s.meta.cwd = '/home/wanfeng/Spark'
    const f = render(<BootHeader slice={s} models={null} columns={60} />).lastFrame()
    expect(f).not.toContain('██╔════╝')
    expect(f).toContain('_ Spark')
  })

  it('禁假状态：slice=null 且无模型目录显 — 且无模型提示；有缺省模型则显缺省', () => {
    const f = render(<BootHeader slice={null} models={null} columns={120} />).lastFrame()
    expect(f).toContain('—')
    expect(f).not.toContain('（/model 切换）')
    const m = render(
      <BootHeader
        slice={null}
        models={{
          providers: [
            {
              id: 'fake',
              label: 'fake',
              builtin: false,
              configured: true,
              apiKeyEnv: null,
              hasKey: true,
              api: 'openai-completions',
            },
          ],
          models: [{ provider: 'fake', model: 'fake-chat', contextWindow: 100_000 }],
          defaultModel: { provider: 'fake', model: 'fake-chat', contextWindow: 100_000 },
        }}
        columns={120}
      />).lastFrame()
    expect(m).toContain('API Key | fake/fake-chat')
    expect(m).toContain('（/model 切换）')
  })

  it('cwd 超长截断带省略号', () => {
    const s = slice()
    s.meta.cwd = '/home/wanfeng/' + 'x'.repeat(200)
    const f = render(<BootHeader slice={s} models={null} columns={120} />).lastFrame()
    expect(f).toContain('…')
  })
})

describe('聚合与折叠提示（工单 10.9 补齐 / §13.K K.2）', () => {
  function toolItem(
    call: string,
    name: string,
    status: 'running' | 'completed' | 'error',
    output?: unknown,
  ): UiItem {
    return {
      kind: 'tool',
      eventId: ids.event(`evt_${call}`),
      callId: ids.call(call),
      name,
      input: { command: 'ls' },
      status,
      progressBuf: '',
      output,
    }
  }

  it('rowSettled：组行需全组定稿（运行中组滞留活动区——组以整组入 scrollback）', () => {
    const rows = flowRowsOf([toolItem('cal_b1', 'bash', 'completed'), toolItem('cal_b2', 'bash', 'running')])
    expect(rows[0]?.kind).toBe('toolGroup')
    expect(rowSettled(rows[0] as Extract<ReturnType<typeof flowRowsOf>[number], { kind: 'toolGroup' }>)).toBe(false)
  })

  it('toolOutputLines：截断前完整行数', () => {
    expect(toolOutputLines('a\nb')).toBe(2)
    expect(toolOutputLines({ k: 1 })).toBe(3) // JSON.stringify(x, null, 2) = {\n  "k": 1\n}
  })

  it('tool 折叠态：超长输出附 first N lines hidden；短输出/展开态不附', () => {
    const big = Array.from({ length: 12 }, (_, i) => `l${i}`).join('\n')
    const folded = itemOf(toolItem('cal_c1', 'bash', 'completed', big))
    expect(folded).toContain('first 12 lines hidden')

    const short = itemOf(toolItem('cal_c2', 'bash', 'completed', 'ok'))
    expect(short).not.toContain('lines hidden')

    const opened = render(
      <ItemView
        item={toolItem('cal_c3', 'bash', 'completed', big)}
        expandedTools={new Set([ids.call('cal_c3')])}
        expandedReasoning={NO_EXPAND}
      />,
    ).lastFrame()
    expect(opened).toContain('l0')
    expect(opened).not.toContain('lines hidden')
  })

  it('ToolGroupLine：「类别 · N 次」；含拒绝注记；展开逐条工具行', () => {
    const rows = flowRowsOf([
      toolItem('cal_d1', 'bash', 'completed'),
      toolItem('cal_d2', 'bash', 'error', { code: 'E_PERMISSION' }),
    ])
    const row = rows[0]
    expect(row?.kind).toBe('toolGroup')
    const folded = render(
      <ToolGroupLine
        row={row as Extract<ReturnType<typeof flowRowsOf>[number], { kind: 'toolGroup' }>}
        expanded={false}
        expandedTools={NO_EXPAND}
      />,
    ).lastFrame()
    expect(folded).toContain('运行了 ls, ls')
    expect(folded).toContain('含拒绝')

    const opened = render(
      <ToolGroupLine
        row={row as Extract<ReturnType<typeof flowRowsOf>[number], { kind: 'toolGroup' }>}
        expanded
        expandedTools={NO_EXPAND}
      />,
    ).lastFrame()
    expect(opened).toContain('已拒绝')
  })

  it('MessagePane：定稿组行进 Static（聚合单行呈现）', () => {
    const s = slice()
    s.items = [
      { kind: 'user', eventId: ids.event('evt_u9'), text: '连续调用' },
      toolItem('cal_e1', 'bash', 'completed'),
      toolItem('cal_e2', 'bash', 'completed'),
    ]
    const { frames } = render(<MessagePane slice={s} />)
    expect(frames.join('\n')).toContain('运行了 ls, ls')
  })
})

describe('ResumePanel（工单 10.11 Space 预览 / §13.K K.7；10.54 双行）', () => {
  const dto = {
    id: ids.session('ses_res0000000000000001'),
    title: '',
    model: 'deepseek/chat',
    cwd: '/tmp/proj',
    createdAt: 1,
    updatedAt: Date.now(),
    lastSeq: 7,
    status: 'idle',
    branch: 'main',
  } as const

  it('列表行与提示含 Space 预览；preview 传入时渲染详情（档位缺省=自动）', () => {
    const f = render(
      <ResumePanel sessions={[dto]} selected={0} filter="" activeId={null} preview={dto} />,
    ).lastFrame()
    expect(f).toContain('Space 预览')
    expect(f).toContain('新会话')
    expect(f).toContain('deepseek/chat')
    expect(f).toContain('git:(main)')
    expect(f).toContain('档位 自动')
    expect(f).toContain('seq 7')
  })

  it('preview 未传不渲染预览块', () => {
    const f = render(<ResumePanel sessions={[dto]} selected={0} filter="" activeId={null} />).lastFrame()
    expect(f).not.toContain('— 预览')
  })

  it('列表行双行（工单 10.54）：行1标题，行2 相对时间·事件数·git 分支真值', () => {
    const f = render(<ResumePanel sessions={[dto]} selected={0} filter="" activeId={null} />).lastFrame() ?? ''
    expect(f).toContain('新会话')
    expect(f).toContain('7 条事件') // dto.lastSeq=7 真值（非 message 数，如实标注）
    expect(f).toContain('git:(main)') // dto.branch=main
    // 双行：标题与事件数分处两行（不再同一行）
    const titleLine = f.split('\n').find((l) => l.includes('新会话')) ?? ''
    expect(titleLine).not.toContain('条事件')
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

  it('协议词表基线 14 条可过滤（工单 10.18：单一词表下发）', () => {
    expect(BUILTIN_COMMANDS).toHaveLength(14)
    expect(filterSlashCommands([...BUILTIN_COMMANDS], 'effort').map((c) => c.name)).toEqual([
      'effort',
    ])
  })
})

describe('InputBox 宽字符口径（工单 10.19①）', () => {
  it('中文输入：整字插入，Enter 提交全文', () => {
    const submitted: string[] = []
    const { stdin } = render(
      <InputBox active prefix="> " placeholder="输入" onSubmit={(t) => submitted.push(t)} />,
    )
    stdin.write('中文输入')
    stdin.write('\r')
    expect(submitted).toEqual(['中文输入'])
  })

  it('中文退格：一次删一个整字（字位口径）', () => {
    const submitted: string[] = []
    const { stdin } = render(
      <InputBox active prefix="> " placeholder="输入" onSubmit={(t) => submitted.push(t)} />,
    )
    stdin.write('中文')
    stdin.write('\x7F')
    stdin.write('\r')
    expect(submitted).toEqual(['中'])
  })

  it('emoji 代理对：整字位插入与退格，不切半', () => {
    const submitted: string[] = []
    const { stdin } = render(
      <InputBox active prefix="> " placeholder="输入" onSubmit={(t) => submitted.push(t)} />,
    )
    stdin.write('👍')
    stdin.write('\r')
    expect(submitted).toEqual(['👍']) // 切半则提交的是半个代理对
    stdin.write('👍')
    stdin.write('\x7F') // 一次退格删掉整个字位
    stdin.write('\r')
    expect(submitted).toEqual(['👍']) // 退到空 → InputBox 不提交
  })
})

describe('@ token 解析（工单 10.53 parseAtToken）', () => {
  it('尾部 @ 词触发：返回 @ 下标与其后部分路径', () => {
    expect(parseAtToken('@')).toEqual({ start: 0, query: '' })
    expect(parseAtToken('@src/comp')).toEqual({ start: 0, query: 'src/comp' })
  })

  it('句中尾部 @ 词触发：start 指向该词 @（与 web detectMenu 词首语义一致）', () => {
    expect(parseAtToken('解释 @src/foo.ts')).toEqual({ start: 3, query: 'src/foo.ts' })
  })

  it('无 @ / @ 非词首 / 尾部空白 / slash 词 → null（不误触发）', () => {
    expect(parseAtToken('hello')).toBeNull()
    expect(parseAtToken('a@b')).toBeNull() // @ 非词首
    expect(parseAtToken('@src ')).toBeNull() // 尾部空白 → 无活动词（文件补全后关闭）
    expect(parseAtToken('/stats')).toBeNull() // slash 词
    expect(parseAtToken('')).toBeNull()
  })
})

describe('FsMenu 渲染（工单 10.53）', () => {
  const entries = [
    { name: 'src', path: 'src', isDir: true },
    { name: 'package.json', path: 'package.json', isDir: false },
  ]

  it('活动行 > 标记；目录带 / 后缀 + 目录标记，文件 + 文件标记', () => {
    const f = render(<FsMenu entries={entries} selected={0} page={0} />).lastFrame() ?? ''
    expect(f).toContain('> ') // 活动行标记
    expect(f).toContain('src/') // 目录带 / 后缀
    expect(f).toContain('目录')
    expect(f).toContain('package.json')
    expect(f).toContain('文件')
  })

  it('空清单显示无匹配占位（防御性——fsOpen 门控下实际不渲染）', () => {
    const f = render(<FsMenu entries={[]} selected={0} page={0} />).lastFrame() ?? ''
    expect(f).toContain('无匹配路径')
  })
})

describe('InputBox 命令式回写（工单 10.53 setValue）', () => {
  it('外部 setValue 回写值 + 上报 preview（@ 补全选中路径回写）', () => {
    const ref = createRef<InputBoxHandle>()
    const previews: string[] = []
    const { lastFrame } = render(
      <InputBox
        ref={ref}
        active
        prefix="> "
        placeholder="输入"
        onSubmit={() => {}}
        onPreview={(v) => previews.push(v)}
      />,
    )
    // 命令式 ref 更新在 Ink 输入循环外，需 act 环境 + act 包裹才同步 flush（仅本用例开启，避免全局噪声）
    const env = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean | undefined }
    const prev = env.IS_REACT_ACT_ENVIRONMENT
    env.IS_REACT_ACT_ENVIRONMENT = true
    try {
      act(() => {
        ref.current?.setValue('@src/')
      })
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = prev
    }
    expect(lastFrame()).toContain('@src/')
    expect(previews).toEqual(['@src/'])
  })
})
