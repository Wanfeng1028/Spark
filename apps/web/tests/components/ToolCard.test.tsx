// @vitest-environment jsdom
/**
 * ToolCard 组件测试（doc/06 §1 L2 首批：工具卡三态——doc/02 §6.3 / DESIGN §8）。
 * 断言「事件→渲染 DOM」：running/completed/error 三态摘要、progress 尾部、
 * 错误默认展开、bash 展开区 exit code。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ToolCard } from '@/features/chat/ToolCard'
import './dom-stubs'

afterEach(cleanup)

describe('ToolCard 三态摘要行', () => {
  it('running：显示「运行中…」，折叠态可见 progress 尾部片段', () => {
    render(
      <ToolCard
        name="bash"
        input={{ command: 'pnpm test' }}
        status="running"
        progressBuf={'正在编译…\nPASS 42 例\nFAIL 0 例'}
        isError={false}
      />,
    )
    expect(screen.getByText('运行中…')).toBeTruthy()
    expect(screen.getByText('FAIL 0 例')).toBeTruthy()
  })

  it('completed：显示「完成 · 耗时」，默认折叠', () => {
    render(
      <ToolCard
        name="bash"
        input={{ command: 'pnpm test' }}
        status="completed"
        output={{ code: 0, head: 'PASS', tail: '42 例', lines: 42 }}
        isError={false}
        durationMs={1200}
      />,
    )
    expect(screen.getByText(/完成 · 1\.2s/)).toBeTruthy()
    // 折叠态：展开区（exit 0 元数据行）不可见
    expect(screen.queryByText(/exit 0/)).toBeNull()
  })

  it('error：显示「失败」且默认展开（DESIGN §8）', () => {
    render(
      <ToolCard
        name="bash"
        input={{ command: 'pnpm test' }}
        status="error"
        output={{ code: 1, tail: 'AssertionError: expected 1 to be 2', lines: 3 }}
        isError
      />,
    )
    expect(screen.getByText('失败')).toBeTruthy()
    expect(screen.getByText(/exit 1/)).toBeTruthy()
    expect(screen.getByText(/AssertionError/)).toBeTruthy()
  })
})

describe('ToolCard 展开区', () => {
  it('点击摘要行展开 bash 输出：行数/截断标记/exit code', () => {
    render(
      <ToolCard
        name="bash"
        input={{ command: 'ls -R' }}
        status="completed"
        output={{ code: 0, head: 'src', tail: 'tests', lines: 100, truncated: true }}
        isError={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /bash/ }))
    expect(screen.getByText(/100 行/)).toBeTruthy()
    expect(screen.getByText(/exit 0/)).toBeTruthy()
    expect(screen.getByText(/中间输出已截断/)).toBeTruthy()
  })

  it('bash 资源摘要取 command；非 bash 取 path', () => {
    const { unmount } = render(
      <ToolCard name="read" input={{ path: 'src/index.ts' }} status="completed" output={{ path: 'src/index.ts', lines: 10 }} isError={false} />,
    )
    expect(screen.getByText('src/index.ts')).toBeTruthy()
    unmount()

    render(
      <ToolCard name="bash" input={{ command: 'echo hi' }} status="completed" output={{ code: 0, lines: 1 }} isError={false} />,
    )
    expect(screen.getByText('echo hi')).toBeTruthy()
  })

  it('completed 无 output：展开显示「无输出」', () => {
    render(
      <ToolCard name="bash" input={{ command: 'true' }} status="completed" isError={false} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /bash/ }))
    expect(screen.getByText('无输出')).toBeTruthy()
  })

  it('耗时格式：<1s 用 ms，≥1s 用一位小数秒', () => {
    const { unmount } = render(
      <ToolCard name="read" input={{ path: 'a.ts' }} status="completed" output={{ path: 'a.ts' }} isError={false} durationMs={250} />,
    )
    expect(screen.getByText(/完成 · 250ms/)).toBeTruthy()
    unmount()

    render(
      <ToolCard name="read" input={{ path: 'b.ts' }} status="completed" output={{ path: 'b.ts' }} isError={false} durationMs={4700} />,
    )
    expect(screen.getByText(/完成 · 4\.7s/)).toBeTruthy()
  })
})
