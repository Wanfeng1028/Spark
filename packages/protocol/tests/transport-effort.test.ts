/**
 * HttpTransport.setSessionEffort 直测（工单 10.6 补齐——提交 e7ab636 的测试
 * 曾落在 apps/web applyEvent 用例，协议包自身无直测；此处补齐 PUT 链路断言）：
 * mock fetch 断言方法/路径/body，回显 effort；非 2xx 走 req 统一错误映射。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpTransport, ids } from '../src/index'
import type { ReasoningEffort } from '../src/index'

const SID = ids.session('ses_effort00000000000001')

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HttpTransport.setSessionEffort（工单 10.6）', () => {
  it('PUT /api/sessions/:id/effort——方法/路径/body 正确，回显 effort', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ effort: 'high' })))
    vi.stubGlobal('fetch', fetchMock)
    const t = new HttpTransport({ baseUrl: 'http://127.0.0.1:4318', eventStream: false })
    const got: ReasoningEffort = await t.setSessionEffort(SID, 'high')
    expect(got).toBe('high')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe(`http://127.0.0.1:4318/api/sessions/${SID}/effort`)
    expect(call[1].method).toBe('PUT')
    expect(JSON.parse(call[1].body as string)).toEqual({ effort: 'high' })
  })

  it('三档枚举值均按 body 原样透传（low/medium/high）', async () => {
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) =>
      Promise.resolve(
        jsonResponse({ effort: (JSON.parse(String(init?.body as string)) as { effort: ReasoningEffort }).effort }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const t = new HttpTransport({ baseUrl: 'http://127.0.0.1:4318', eventStream: false })
    for (const effort of ['low', 'medium', 'high'] as const) {
      await expect(t.setSessionEffort(SID, effort)).resolves.toBe(effort)
    }
  })

  it('非 2xx 抛 `code: message`（req 统一错误映射——失败闭合）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ code: 'E_NOT_FOUND', message: '会话不存在' }, 404))),
    )
    const t = new HttpTransport({ baseUrl: 'http://127.0.0.1:4318', eventStream: false })
    await expect(t.setSessionEffort(SID, 'low')).rejects.toThrow('E_NOT_FOUND: 会话不存在')
  })
})
