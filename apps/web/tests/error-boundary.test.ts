// @vitest-environment jsdom
/**
 * ErrorBoundary 单测（AUD-13）：抛错子树被捕获 → 默认兜底块 / 自定义 fallback；
 * componentDidCatch 如实进 console.error（不吞）；无错误时正常渲染子树。
 * 设施全部来自既有 devDependencies（@testing-library/react + jsdom），零新增依赖。
 * React 对被捕获错误自身也会 console.error——spy 一并静音，断言我们的记录在其中。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

afterEach(cleanup)

function Bomb(): never {
  throw new Error('E_BOMB: 爆炸')
}

describe('ErrorBoundary（AUD-13 渲染韧性）', () => {
  it('无错误时正常渲染子树', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary label="应用">
        <p>正常内容</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('正常内容')).toBeTruthy()
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('子树抛错 → 默认兜底块（此区块渲染出错 + 重新加载按钮）', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary label="应用">
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('此区块渲染出错')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy()
    // componentDidCatch 如实记录：含边界 label 与原始错误（不吞）
    const joined = errorSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(joined).toContain('[ErrorBoundary:应用]')
    expect(joined).toContain('E_BOMB')
    errorSpy.mockRestore()
  })

  it('自定义 fallback 优先于默认兜底块（行级轻量降级）', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary label="消息" fallback={<div>此消息渲染出错</div>}>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('此消息渲染出错')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重新加载' })).toBeNull() // 行级 fallback 不带整页刷新钮
    errorSpy.mockRestore()
  })
})
