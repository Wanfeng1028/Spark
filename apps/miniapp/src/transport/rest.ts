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
  AttachmentDto,
  PairRedeemBody,
  PairTokenDto,
  PermissionReply,
  RequestId,
  SessionDto,
  SettingsDto,
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

/** 原始字节请求体（附件上传通道——服务端读 raw body，content-type 即图片 mime） */
interface RawBody {
  bytes: Uint8Array
  mime: string
  /** 原始文件名：x-file-name 头承载（服务端 decodeURIComponent 后入库展示） */
  name: string
}

/** 图片上传超时（10MB 上限的局域网直传，15s 短请求缺省会误杀大图） */
const UPLOAD_TIMEOUT_MS = 60_000

/** Uint8Array → ArrayBuffer（Taro.request 的 data 只认 ArrayBuffer/字符串/对象，不看视图） */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export class MiniRestClient {
  constructor(private readonly opts: MiniRestOptions) {}

  /** 统一请求：非 2xx 抛 `code: message`（与 HttpTransport.req 同一 errorFromResponse 单源） */
  private async req<T>(
    path: string,
    init?: { method?: 'GET' | 'POST'; body?: string; raw?: RawBody },
  ): Promise<T> {
    // content-type 仅随 body 携带（工单 10.27 口径对齐 transport-node）：带 json 头的空 body
    // 会被 Fastify 5 拒 400 FST_ERR_CTP_EMPTY_JSON_BODY，不依赖 server 宽容解析器兜底
    const header: Record<string, string> = {}
    if (init?.body !== undefined) header['content-type'] = 'application/json'
    if (init?.raw !== undefined) {
      header['content-type'] = init.raw.mime
      header['x-file-name'] = encodeURIComponent(init.raw.name)
    }
    if (this.opts.token !== undefined) header['Authorization'] = `Bearer ${this.opts.token}`
    const raw = init?.raw
    let res: Taro.request.SuccessCallbackResult
    try {
      res = await Taro.request({
        url: `${this.opts.baseUrl}${path}`,
        method: init?.method ?? 'GET',
        header,
        ...(raw !== undefined
          ? { data: toArrayBuffer(raw.bytes), timeout: UPLOAD_TIMEOUT_MS }
          : {
              ...(init?.body !== undefined ? { data: init.body } : {}),
              timeout: this.opts.timeoutMs ?? 15_000,
            }),
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

  /** 设置读取（阶段十九 19.2 / J.2.11：电脑控制指示行数据源——只取引擎段，单方法入 D21 体积预算） */
  getSettings(): Promise<SettingsDto> {
    return this.req<SettingsDto>('/api/settings')
  }

  /** archived=true 只列已归档（工单 12.4；缺省排除归档——Transport.listSessions 同口径） */
  listSessions(archived?: boolean): Promise<SessionDto[]> {
    return this.req<SessionDto[]>(`/api/sessions${archived === true ? '?archived=true' : ''}`)
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
    // 与 HttpTransport 同口径不带 attachments：server SendMessageBody 是 strictObject，
    // 多塞字段只换 400（引擎 SessionHandle.send 尚无该形参）。端侧待发附件的如实呈现
    // 见 session/attachments.ts 头注释与 README「附件通道现状」段。
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

  /**
   * POST /api/sessions/:id/attachments：raw 图片字节上传（工单 12.2a 既有方法，
   * 本端补齐消费面——请求形状与 HttpTransport.uploadAttachment 逐字同：
   * content-type = 图片 mime、x-file-name = encodeURIComponent(原始名)）。
   */
  uploadAttachment(
    sessionId: SessionId,
    file: { name: string; mime: string; bytes: Uint8Array },
  ): Promise<AttachmentDto> {
    return this.req<AttachmentDto>(`/api/sessions/${sessionId}/attachments`, {
      method: 'POST',
      raw: { bytes: file.bytes, mime: file.mime, name: file.name },
    })
  }
}
