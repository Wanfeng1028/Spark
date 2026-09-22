// @vitest-environment jsdom
/**
 * 会话状态点灰档（工单 19.21）：已归档会话未装载、引擎 statusOf 一律回 'idle'，
 * 若仍画绿点等于谎称它在你工作区里活跃——归档位取 SessionMetaDto.archivedAt（12.4）。
 */
import './dom-stubs'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SessionStatusDot } from '@/components/layout/Sidebar'

function dotClass(
  status: 'idle' | 'running' | 'waiting-approval',
  archived = false,
): string {
  const { container } = render(<SessionStatusDot status={status} archived={archived} />)
  const el = container.firstChild
  return el instanceof HTMLElement ? el.className : ''
}

describe('SessionStatusDot（19.21 归档灰档）', () => {
  it('未归档：三态各自取色（绿空闲 / accent 运行且脉冲 / amber 待审批）', () => {
    expect(dotClass('idle')).toContain('bg-[var(--spark-ok)]')
    expect(dotClass('running')).toContain('bg-[var(--spark-accent)]')
    expect(dotClass('running')).toContain('animate-pulse')
    expect(dotClass('waiting-approval')).toContain('bg-[var(--spark-warn)]')
  })

  it('已归档：压过状态色走灰，idle 不得画绿点、running 不得脉冲', () => {
    expect(dotClass('idle', true)).toContain('bg-muted-foreground')
    expect(dotClass('idle', true)).not.toContain('spark-ok')
    expect(dotClass('running', true)).not.toContain('animate-pulse')
    expect(dotClass('waiting-approval', true)).not.toContain('spark-warn')
  })

  it('archived 缺省为 false（既有调用点不传即维持原语义）', () => {
    expect(dotClass('idle')).toBe(dotClass('idle', false))
  })
})
