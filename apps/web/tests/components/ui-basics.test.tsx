// @vitest-environment jsdom
/**
 * ui 基础件渲染冒烟（工单 18.3）：Input/Textarea/Badge/Card 四件 copy-in 后的
 * 最小行为断言——受控输入可键入、disabled 口径生效、Badge variant 类落位、
 * Card 三档圆角 variant 渲染。对齐 tests/components 既有模式（jsdom + RTL）。
 */
import './dom-stubs'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'

afterEach(cleanup)

describe('ui/Input', () => {
  it('受控键入回显，placeholder 可达', () => {
    render(<Input placeholder="输入关键词" aria-label="关键词" />)
    const input = screen.getByLabelText('关键词') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'spark' } })
    expect(input.value).toBe('spark')
    expect(screen.getByPlaceholderText('输入关键词')).toBeTruthy()
  })

  it('disabled 时不接受输入', () => {
    render(<Input disabled aria-label="禁用输入" />)
    const input = screen.getByLabelText('禁用输入') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'x' } })
    expect(input.value).toBe('')
    expect(input.disabled).toBe(true)
  })
})

describe('ui/Textarea', () => {
  it('受控键入回显', () => {
    render(<Textarea aria-label="备注" />)
    const area = screen.getByLabelText('备注') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: '每行一条' } })
    expect(area.value).toBe('每行一条')
  })
})

describe('ui/Badge', () => {
  it('默认 default variant，子内容可见', () => {
    render(<Badge>计划模式</Badge>)
    const el = screen.getByText('计划模式')
    expect(el.className).toContain('rounded-full')
    expect(el.className).toContain('bg-primary')
  })

  it('outline variant 走细边框 meta 前景', () => {
    render(<Badge variant="outline">ckpt</Badge>)
    const el = screen.getByText('ckpt')
    expect(el.className).toContain('border-border')
    expect(el.className).toContain('text-muted-foreground')
  })
})

describe('ui/Card', () => {
  it('默认 grouped 档 12px，标题与说明渲染', () => {
    render(
      <Card>
        <CardTitle>模型路由</CardTitle>
        <CardDescription>fallback 链与任务档位</CardDescription>
        <CardContent>正文</CardContent>
      </Card>,
    )
    expect(screen.getByText('模型路由')).toBeTruthy()
    expect(screen.getByText('fallback 链与任务档位')).toBeTruthy()
    expect(screen.getByText('正文')).toBeTruthy()
  })

  it('info / flush 两档 variant 类名落位', () => {
    const { rerender } = render(<Card variant="info" data-testid="card" />)
    const el = () => screen.getByTestId('card')
    expect(el().className).toContain('rounded-2xl')
    expect(el().className).toContain('bg-card')
    rerender(<Card variant="flush" data-testid="card" />)
    expect(el().className).toContain('bg-secondary')
    expect(el().className).toContain('border-0')
  })
})
