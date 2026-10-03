/**
 * MCP OAuth 纯判据（CK-5 批 2；出处 Gemini CLI packages/core/src/mcp/oauth-provider.ts
 * 的 PKCE + 动态客户端注册 + refresh 思路，按本仓"判据/装配分离"重写）：
 * - makePkcePair：RFC 7636 code_verifier（43-128 字符 base64url）+ S256 challenge；
 * - parseAuthorizationServerMetadata：RFC 8414 子集（issuer/authorization_endpoint/
 *   token_endpoint 必需，registration_endpoint/scope 可选）；
 * - buildAuthorizeUrl / exchangeToken / refreshTokenRequest：标准端点请求构造与
 *   token 响应解析（HTTP 发取经注入的 fetchLike，判据层零 I/O 依赖——单测打桩）；
 * - isTokenExpiring：到期前余量判定（manager 装配层在调用前静默刷新）。
 * 真实 OAuth server 全流程走查留用户（工单验收口径）；令牌落盘纪律见 token-store.ts。
 */
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

export interface PkcePair {
  /** RFC 7636：43-128 字符，[A-Za-z0-9-._~] */
  verifier: string
  /** BASE64URL-ENCODE(SHA256(ASCII(verifier)))，无填充 */
  challenge: string
}

/** 授权服务器元数据（RFC 8414 子集——本实现消费的字段；多余字段忽略） */
/** 授权服务器元数据（RFC 8414 子集——本实现消费的字段；多余字段忽略）。
 *  类型从 schema 推导（手写副本在 exactOptionalPropertyTypes 下与 .optional() 推断漂移——CI 判例）。 */
export const authorizationServerMetadataSchema = z.strictObject({
  issuer: z.string().min(1),
  authorization_endpoint: z.string().min(1),
  token_endpoint: z.string().min(1),
  registration_endpoint: z.string().min(1).optional(),
  scopes_supported: z.array(z.string()).optional(),
})

export type AuthorizationServerMetadata = z.infer<typeof authorizationServerMetadataSchema>

export interface TokenSet {
  accessToken: string
  /** 无 refresh 的 server（公共客户端静默注册失败回退）如实缺省——到期重走授权 */
  refreshToken?: string
  /** 绝对到期毫秒（签发时刻 + expires_in；server 未给 expires_in 时不设——每次调用前判缺省） */
  expiresAt?: number
  scope?: string
}

export const tokenResponseSchema = z.strictObject({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
})

export interface DynamicClientRegistration {
  clientId: string
  clientSecret?: string
}

export const clientRegistrationSchema = z.strictObject({
  client_id: z.string().min(1),
  client_secret: z.string().min(1).optional(),
})

const CODE_VERIFIER_BYTES = 32 // 32 随机字节 → base64url 43 字符（RFC 7636 下限正好达标）

/** PKCE 对：verifier 取 32 随机字节 base64url（无填充），challenge = S256(verifier) */
export function makePkcePair(): PkcePair {
  const verifier = randomBytes(CODE_VERIFIER_BYTES).toString('base64url')
  const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url')
  return { verifier, challenge }
}

/** 解析并校验授权服务器元数据（非 200 / 形状不符如实抛错——不带病拿端点） */
export function parseAuthorizationServerMetadata(raw: unknown): AuthorizationServerMetadata {
  return authorizationServerMetadataSchema.parse(raw)
}

export interface AuthorizeUrlParams {
  authorizationEndpoint: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  /** CSRF 防 L9：请求时生成、回调时对账（manager 装配层持有） */
  state: string
  scope?: string
}

/** 构造授权端点 URL（response_type=code 固定；PKCE S256 强制——不落 implicit 型） */
export function buildAuthorizeUrl(p: AuthorizeUrlParams): string {
  const url = new URL(p.authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', p.clientId)
  url.searchParams.set('redirect_uri', p.redirectUri)
  url.searchParams.set('code_challenge', p.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', p.state)
  if (p.scope !== undefined && p.scope !== '') url.searchParams.set('scope', p.scope)
  return url.toString()
}

export interface TokenExchangeParams {
  tokenEndpoint: string
  code: string
  verifier: string
  clientId: string
  clientSecret?: string
  redirectUri: string
}

/** fetch 判据注入（单测打桩；生产传 globalThis.fetch 绑定） */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** 授权码换 token（application/x-www-form-urlencoded；confidential 客户端带 Basic 之外的 secret 字段——按 RFC 6749 §4.1.3 用 body 传） */
export async function exchangeToken(
  p: TokenExchangeParams,
  fetchLike: FetchLike,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: p.code,
    code_verifier: p.verifier,
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
  })
  if (p.clientSecret !== undefined) body.set('client_secret', p.clientSecret)
  const res = await fetchLike(p.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  return parseTokenResponse(p.tokenEndpoint, res)
}

export interface TokenRefreshParams {
  tokenEndpoint: string
  refreshToken: string
  clientId: string
  clientSecret?: string
}

/** refresh 换新 token（grant_type=refresh_token；响应无新 refresh_token 时沿用旧值由调用方处理） */
export async function refreshTokens(
  p: TokenRefreshParams,
  fetchLike: FetchLike,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: p.refreshToken,
    client_id: p.clientId,
  })
  if (p.clientSecret !== undefined) body.set('client_secret', p.clientSecret)
  const res = await fetchLike(p.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  return parseTokenResponse(p.tokenEndpoint, res)
}

/** 动态客户端注册（RFC 7591：POST registration_endpoint，redirect_uri 回传） */
export async function registerDynamicClient(
  registrationEndpoint: string,
  p: { redirectUri: string; clientName: string },
  fetchLike: FetchLike,
): Promise<DynamicClientRegistration> {
  const res = await fetchLike(registrationEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: p.clientName,
      redirect_uris: [p.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  })
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`OAuth 动态注册失败（${res.status}）——server 不支持 RFC 7591 时请改用静态 client_id`)
  }
  const parsed = clientRegistrationSchema.parse(await res.json())
  return {
    clientId: parsed.client_id,
    ...(parsed.client_secret !== undefined ? { clientSecret: parsed.client_secret } : {}),
  }
}

/** 到期前余量判定：expiresAt 缺省 = 无法判定（返回 false，调用方在 401 时走重授权路径） */
export function isTokenExpiring(expiresAt: number | undefined, now: number, marginMs: number): boolean {
  if (expiresAt === undefined) return false
  return expiresAt - now <= marginMs
}

/** token 响应解析：非 2xx 如实带状态码抛错（脱敏在日志层，响应体可能含错误描述） */
async function parseTokenResponse(endpoint: string, res: Response): Promise<TokenSet> {
  if (!res.ok) {
    throw new Error(`OAuth token 端点失败（${res.status}）——${endpoint}`)
  }
  const parsed = tokenResponseSchema.parse(await res.json())
  return {
    accessToken: parsed.access_token,
    ...(parsed.refresh_token !== undefined ? { refreshToken: parsed.refresh_token } : {}),
    ...(parsed.expires_in !== undefined ? { expiresAt: Date.now() + parsed.expires_in * 1000 } : {}),
    ...(parsed.scope !== undefined ? { scope: parsed.scope } : {}),
  }
}
