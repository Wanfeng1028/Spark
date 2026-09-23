// @vitest-environment jsdom
/**
 * 诊断页测试（阶段十九 19.38 第二批）：级别过滤（"该级别及以上"语义）、子串匹配、
 * 日志来源路径如实回显、导出**当前视图**（判别性断言：被过滤掉的条目不得出现在导出里）。
 * 数据源是 MockTransport 的合成五条日志（info×3 / warn×1 / error×1）。
 */
import './dom-stubs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TestTransportContext } from '@/transports/context'
import { MockTransport } from '@/transports/mock'
import { DiagnosticsSettingsPage, logLineOf } from '@/features/settings/DiagnosticsSettingsPage'

let capturedBlob: Blob | null = null
let capturedDownload = ''

afterEach(() => {
  cleanup()
  capturedBlob = null
  capturedDownload = ''
  vi.restoreAllMocks()
})

function renderPage(): void {
  const transport = new MockTransport('normal')
  // jsdom 无 createObjectURL；导出走浏览器 Blob，此处只截获产物做断言
  URL.createObjectURL = ((b: Blob) => {
    capturedBlob = b
    return 'blob:stub'
  }) as typeof URL.createObjectURL
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    capturedDownload = this.download
  })
  render(
    <MemoryRouter>
      <TestTransportContext.Provider
        value={{ transport, mock: true, scenario: 'normal', setScenario: () => {} }}
      >
        <DiagnosticsSettingsPage />
      </TestTransportContext.Provider>
    </MemoryRouter>,
  )
}

describe('DiagnosticsSettingsPage（阶段十九 19.38 第二批）', () => {
  it('日志来源路径如实回显——mock 合成来源不得伪装成真实文件', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('engine.start')).toBeTruthy())
    expect(screen.getByText(/\(mock\) 合成日志/)).toBeTruthy()
    expect(screen.getByText(/~\/\.spark\/logs\/engine\.log/)).toBeTruthy()
  })

  it('级别过滤取"该级别及以上"：选 warn 后 info 三条消失、warn 与 error 留下', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('engine.start')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('级别'), { target: { value: 'warn' } })
    await waitFor(() => expect(screen.queryByText('engine.start')).toBeNull())
    expect(screen.getByText('llm.stream.retry')).toBeTruthy()
    expect(screen.getByText('tool.completed')).toBeTruthy()
    expect(screen.queryByText('turn.completed')).toBeNull()
  })

  it('子串匹配比 msg 与字段', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('engine.start')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('子串匹配'), { target: { value: 'retry' } })
    await waitFor(() => expect(screen.queryByText('engine.start')).toBeNull())
    expect(screen.getByText('llm.stream.retry')).toBeTruthy()
  })

  it('导出的是当前视图而非全量：过滤后导出不得含被过滤掉的条目', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('engine.start')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('级别'), { target: { value: 'warn' } })
    await waitFor(() => expect(screen.queryByText('engine.start')).toBeNull())
    // 按钮文案带条数，导出的是"当前视图"这件事在 UI 上就得说得出口
    fireEvent.click(screen.getByRole('button', { name: '导出当前 2 条' }))
    expect(capturedBlob).not.toBeNull()
    const text = await (capturedBlob as Blob).text()
    expect(text).toContain('llm.stream.retry')
    expect(text).toContain('tool.completed')
    expect(text).not.toContain('engine.start')
    expect(text).not.toContain('turn.completed')
    expect(capturedDownload).toMatch(/^spark-diagnostics-.+\.log$/)
  })

  it('logLineOf：ISO 时间 + 定宽级别 + msg + fields（无字段不留尾空格）', () => {
    expect(logLineOf({ time: 0, level: 'warn', msg: 'a.b', fields: { k: 1 } })).toBe(
      '1970-01-01T00:00:00.000Z WARN  a.b {"k":1}',
    )
    expect(logLineOf({ time: 0, level: 'info', msg: 'x', fields: {} })).toBe(
      '1970-01-01T00:00:00.000Z INFO  x',
    )
  })
})
