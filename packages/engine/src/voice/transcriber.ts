/**
 * 语音转写（工单 16.6，消解 V2-28）：OpenAI 兼容 /audio/transcriptions 直调
 * （无 DashScope 专有依赖——任何兼容端点均可配；本地 whisper.cpp 分发模型太重不进首期）。
 * 安全：端点来自用户可写 models.json，fetch 前过 assertPublicUrl SSRF 防护（voice/ssrf.ts，
 * qwen voice-transcriber 必抄项）——内网/环回/IPv6 过渡地址一律拒（fail-closed）。
 * 失败语义：一切异常都以 E_TRANSCRIBE_* 错误码抛出（不吞不猜），端上按 error-copy 人话呈现。
 * 音频纪律：音频本体 live 不落盘（不进 JSONL/日志/模型上下文）——只有转写文本返回给端侧，
 * 用户主动发送后才经 user.message 进模型历史（surface 纪律双面成立）。
 */
import { resolveApiKey } from '../secrets/store.js'
import type { SecretStore } from '../secrets/store.js'
import type { ModelsConfig } from '../config.js'
import { assertPublicUrl } from './ssrf.js'

/** 音频字节上限（10MB，与附件 12.2a 同量级护栏；base64 前口径） */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024

/** 转写容器白名单（OpenAI 兼容端点公开支持的 mime） */
const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mpga',
  'audio/m4a',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
])

/** mime → 上传文件扩展名（FormData 文件名后缀；provider 按后缀嗅探格式） */
const MIME_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mpga': 'mpga',
  'audio/m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
}

export interface TranscribeDeps {
  models: ModelsConfig
  secrets: SecretStore
  /** 环境变量（缺省 process.env；测试注入） */
  env?: Record<string, string | undefined>
  /** fetch 替身（测试注入；缺省全局 fetch） */
  fetchImpl?: typeof fetch
}

export interface TranscribeInput {
  /** 供应商（缺省 = defaultModel.provider） */
  provider?: string | undefined
  mime: string
  dataBase64: string
}

export interface TranscribeOutput {
  text: string
  provider: string
  model: string
}

function base64Bytes(dataBase64: string): number {
  // base64 长度 → 原始字节数（去 padding；3/4 比例，够护栏判断用，不做完整解码）
  const cleaned = dataBase64.replace(/[^A-Za-z0-9+/=]/g, '')
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding)
}

/** 转写主流程：配置解析 → mime/体积护栏 → SSRF 校验 → multipart 上传 → 解析 text */
export async function transcribeAudio(
  deps: TranscribeDeps,
  input: TranscribeInput,
): Promise<TranscribeOutput> {
  const provider = input.provider ?? deps.models.defaultModel.provider
  const p = deps.models.providers[provider]
  if (p === undefined) {
    throw new Error(`E_TRANSCRIBE_UNCONFIGURED: 未知的模型供应商：${provider}`)
  }
  const endpoint =
    p.transcription?.endpoint ??
    (p.baseUrl !== undefined ? `${p.baseUrl.replace(/\/+$/, '')}/audio/transcriptions` : undefined)
  if (endpoint === undefined || endpoint === '') {
    throw new Error(
      `E_TRANSCRIBE_UNCONFIGURED: 供应商 ${provider} 未配置转写端点（models.json 补 baseUrl 或 transcription.endpoint）`,
    )
  }
  const model = p.transcription?.model ?? 'whisper-1'

  if (!ALLOWED_MIME.has(input.mime)) {
    throw new Error(`E_TRANSCRIBE_MIME: 不支持的录音格式：${input.mime}`)
  }
  if (base64Bytes(input.dataBase64) > MAX_AUDIO_BYTES) {
    throw new Error('E_TRANSCRIBE_TOO_LARGE: 录音超过 10MB 上限')
  }

  // SSRF 防护（qwen 必抄项）：解析 DNS 并拒内网/环回/IPv6 过渡地址
  await assertPublicUrl(endpoint)

  const { apiKey } = resolveApiKey(deps.secrets, provider, p.apiKeyEnv, deps.env)
  if (apiKey === undefined) {
    throw new Error(`E_TRANSCRIBE_UNCONFIGURED: 供应商 ${provider} 未配置 apiKey（env/store 均无）`)
  }

  const bytes = Buffer.from(input.dataBase64, 'base64')
  const ext = MIME_EXT[input.mime] ?? 'audio'
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(bytes)], { type: input.mime }), `audio.${ext}`)
  form.append('model', model)

  let res: Response
  try {
    res = await (deps.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch (err) {
    throw new Error(`E_TRANSCRIBE_UPSTREAM: 转写请求失败：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) {
    // 上游错误人话化：只透出状态码与截断的原因（响应体可能含敏感回显，不整段透传）
    const reason = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`E_TRANSCRIBE_UPSTREAM: 转写服务返回 ${res.status}${reason === '' ? '' : `：${reason}`}`)
  }
  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    throw new Error('E_TRANSCRIBE_UPSTREAM: 转写服务响应不是 JSON')
  }
  const text =
    typeof parsed === 'object' && parsed !== null && 'text' in parsed && typeof parsed.text === 'string'
      ? parsed.text
      : null
  if (text === null) {
    throw new Error('E_TRANSCRIBE_UPSTREAM: 转写服务响应缺 text 字段')
  }
  return { text, provider, model }
}
