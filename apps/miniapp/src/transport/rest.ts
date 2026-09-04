/**
 * REST 客户端（工单 9.4——小程序无 fetch，Taro.request 封装）。
 * 只实现本壳用到的方法子集（不引 HttpTransport 全家桶——体积纪律，D21）。
 * 错误映射走 @spark/protocol errorFromResponse 单源（工单 R-B：原与 HttpTransport.req 两份同构）：
 * 非 2xx 读错误体 {code, message} 抛 `Error("code: message")`——调用方经 errorMessageOf/ERROR_COPY 人话化。
 * 鉴权：Authorization: Bearer 头（REST 口径；SSE 走 ?token= 查询，双口径同 9.1）。
 */
import Taro from '@tarojs/taro'
import { errorFromResponse } from '@spark/protocol'
import type {
  PairRedeemBody,
  PairTokenDto,
  PermissionReply,
  RequestId,
  SessionDto,
  SessionEventsQuery,
  SessionId,
  SubmitOutcome,
} from '@spark/protocol'

export interface MiniRestOptions {
  baseUrl: string
  /** 配对长效 token（非环回必需；环回缺省形态可省） */
  token?: string
  /** 请求超时（ms）；REST 短请求缺省 15s */
  timeoutMs?: number
}

export class MiniRestClient {
  constructor(private readonly opts: MiniRestOptions) {}

  /** 统一请求：非 2xx 抛 `code: message`（与 HttpTransport.req 同一 errorFromResponse 单源） */
  private async req<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: string }): Promise<T> {
    // content-type 仅随 body 携带（工单 10.27 口径对齐 transport-node）：带 json 头的空 body
    // 会被 Fastify 5 拒 400 FST_ERR_CTP_EMPTY_JSON_BODY，不依赖 server 宽容解析器兜底
    const header: Record<string, string> = {}
    if (init?.body !== undefined) header['content-type'] = 'application/json'
    if (this.opts.token !== undefined) header['Authorization'] = `Bearer ${this.opts.token}`
    let res: Taro.request.SuccessCallbackResult
    try {
      res = await Taro.request({
        url: `${this.opts.baseUrl}${path}`,
        method: init?.method ?? 'GET',
        header,
        ...(init?.body !== undefined ? { data: init.body } : {}),
        timeout: this.opts.timeoutMs ?? 15_000,
      })
    } catch (err: unknown) {
      // 网络层失败（超时/拒连/域名不合法）：无 HTTP 语义，给人话出口
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`无法连接服务器：请检查地址与网络（${msg}）`)
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T
    }
    // Taro 已自动解析响应体（无 statusText——缺省空串，与原实现逐字同）
    throw errorFromResponse(res.statusCode, res.data)
  }

  listSessions(): Promise<SessionDto[]> {
    return this.req<SessionDto[]>('/api/sessions')
  }

  /** GET /api/sessions/:id：分页参数缺省 = 不带查询串（缺省全量红线，与四端同口径） */
  getSession(sessionId: SessionId, query?: SessionEventsQuery): Promise<SessionDto> {
    const parts: string[] = []
    if (query !== undefined) {
      if (query.limit !== undefined) parts.push(`limit=${query.limit}`)
      if (query.before !== undefined) parts.push(`before=${query.before}`)
    }
    const qs = parts.join('&')
    return this.req<SessionDto>(`/api/sessions/${sessionId}${qs !== '' ? `?${qs}` : ''}`)
  }

  createSession(): Promise<SessionDto> {
    return this.req<SessionDto>('/api/sessions', { method: 'POST', body: '{}' })
  }

  sendMessage(sessionId: SessionId, text: string): Promise<SubmitOutcome> {
    return this.req<SubmitOutcome>(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, delivery: 'now' }),
    })
  }

  interrupt(sessionId: SessionId): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/sessions/${sessionId}/interrupt`, {
      method: 'POST',
    }).then(() => undefined)
  }

  replyPermission(requestId: RequestId, reply: PermissionReply): Promise<void> {
    return this.req<{ ok: boolean }>(`/api/permissions/${requestId}`, {
      method: 'POST',
      body: JSON.stringify({ reply }),
    }).then(() => undefined)
  }

  /** POST /api/pair：短码兑长效 token（鉴权自举口，无需 token；9.1 / D24） */
  redeemPair(body: PairRedeemBody): Promise<PairTokenDto> {
    return this.req<PairTokenDto>('/api/pair', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }
}
