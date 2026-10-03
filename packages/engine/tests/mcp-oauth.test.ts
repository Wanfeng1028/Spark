/**
 * MCP OAuth 判据与令牌仓单测（CK-5 批 2）：PKCE 形状与 S256 可复算、
 * 元数据/注册响应 schema 拒收、授权 URL 参数齐备、token 交换与刷新请求形状
 * （fetch 打桩断言 method/headers/body，响应解析含 expires_in→绝对到期）、
 * 到期余量判定、令牌仓落盘回环与坏数据拒收（tmp 目录真写）。
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  authorizationServerMetadataSchema,
  buildAuthorizeUrl,
  clientRegistrationSchema,
  exchangeToken,
  isTokenExpiring,
  makePkcePair,
  refreshTokens,
  registerDynamicClient,
  tokenResponseSchema,
} from '../src/mcp/oauth.js'
import { McpTokenStore } from '../src/mcp/token-store.js'

describe('makePkcePair', () => {
  it('verifier 43 字符 base64url；challenge 可由 verifier 复算（S256 无填充）', () => {
    const { verifier, challenge } = makePkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const recomputed = createHash('sha256').update(verifier, 'ascii').digest('base64url')
    expect(challenge).toBe(recomputed)
    // 两次生成不重复（随机源）
    expect(makePkcePair().verifier).not.toBe(verifier)
  })
})

describe('schema 拒收', () => {
  it('元数据缺 token_endpoint 拒收；多余字段 strictObject 拒收', () => {
    expect(() =>
      authorizationServerMetadataSchema.parse({ issuer: 'https://a', authorization_endpoint: 'https://a/authorize' }),
    ).toThrow()
    expect(() =>
      authorizationServerMetadataSchema.parse({
        issuer: 'https://a',
        authorization_endpoint: 'https://a/authorize',
        token_endpoint: 'https://a/token',
        unknown_field: 1,
      }),
    ).toThrow()
  })

  it('token 响应缺 access_token 拒收；expires_in 非正整数拒收', () => {
    expect(() => tokenResponseSchema.parse({})).toThrow()
    expect(() => tokenResponseSchema.parse({ access_token: 'a', expires_in: 0 })).toThrow()
  })

  it('注册响应缺 client_id 拒收', () => {
    expect(() => clientRegistrationSchema.parse({})).toThrow()
  })
})

describe('buildAuthorizeUrl', () => {
  it('response_type/client_id/redirect_uri/challenge/S256/state 六参数齐备；scope 有值才带', () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: 'https://idp.example/authorize',
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:0/callback',
        codeChallenge: 'chk',
        state: 'st-1',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://idp.example/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('code_challenge')).toBe('chk')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe('st-1')
    expect(url.searchParams.has('scope')).toBe(false)
    const withScope = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: 'https://idp.example/authorize',
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:0/callback',
        codeChallenge: 'chk',
        state: 's',
        scope: 'mcp',
      }),
    )
    expect(withScope.searchParams.get('scope')).toBe('mcp')
  })
})

/** fetch 打桩：记录请求并回放预置响应 */
function stubFetch(status: number, body: unknown): {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  calls: Array<{ url: string; init: RequestInit }>
} {
  const calls: Array<{ url: string; init: RequestInit }> = []
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init })
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      } as unknown as Response)
    },
  }
}

describe('exchangeToken / refreshTokens / registerDynamicClient', () => {
  it('交换：form 表单五参数齐备；响应解析含绝对到期', async () => {
    const stub = stubFetch(200, { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, scope: 'mcp' })
    const before = Date.now()
    const set = await exchangeToken(
      {
        tokenEndpoint: 'https://idp.example/token',
        code: 'code-1',
        verifier: 'v'.repeat(43),
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:0/callback',
      },
      stub.fetch,
    )
    expect(stub.calls).toHaveLength(1)
    const init = stub.calls[0]?.init as RequestInit & { body: string }
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' })
    const params = new URLSearchParams(init.body)
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code')).toBe('code-1')
    expect(params.get('code_verifier')).toHaveLength(43)
    expect(params.get('client_id')).toBe('cid')
    expect(params.get('redirect_uri')).toBe('http://127.0.0.1:0/callback')
    expect(set.accessToken).toBe('at-1')
    expect(set.refreshToken).toBe('rt-1')
    expect(set.expiresAt).toBeDefined()
    expect(set.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000)
    expect(set.scope).toBe('mcp')
  })

  it('刷新：grant_type=refresh_token；非 2xx 如实带状态码抛错', async () => {
    const ok = stubFetch(200, { access_token: 'at-2' })
    const set = await refreshTokens(
      { tokenEndpoint: 'https://idp.example/token', refreshToken: 'rt', clientId: 'cid' },
      ok.fetch,
    )
    const params = new URLSearchParams((ok.calls[0]?.init as RequestInit & { body: string }).body)
    expect(params.get('grant_type')).toBe('refresh_token')
    expect(set.refreshToken).toBeUndefined() // 响应没给就不造（沿用旧值由调用方处理）
    const bad = stubFetch(401, { error: 'invalid_grant' })
    await expect(
      refreshTokens({ tokenEndpoint: 'https://idp.example/token', refreshToken: 'rt', clientId: 'cid' }, bad.fetch),
    ).rejects.toThrow('(401)')
  })

  it('动态注册：POST JSON，201/200 都收；client_secret 可选带回', async () => {
    const ok = stubFetch(201, { client_id: 'dyn-1' })
    const reg = await registerDynamicClient(
      'https://idp.example/register',
      { redirectUri: 'http://127.0.0.1:0/callback', clientName: 'spark' },
      ok.fetch,
    )
    expect(reg.clientId).toBe('dyn-1')
    const init = ok.calls[0]?.init as RequestInit & { body: string }
    const body = JSON.parse(init.body) as Record<string, unknown>
    expect(body['grant_types']).toEqual(['authorization_code', 'refresh_token'])
    expect(body['token_endpoint_auth_method']).toBe('none')
    const alsoOk = stubFetch(200, { client_id: 'dyn-2', client_secret: 's3cret' })
    await expect(
      registerDynamicClient('https://idp.example/register', { redirectUri: 'http://x', clientName: 'spark' }, alsoOk.fetch),
    ).resolves.toEqual({ clientId: 'dyn-2', clientSecret: 's3cret' })
  })
})

describe('isTokenExpiring', () => {
  it('expiresAt 缺省 = 无法判定返回 false；余量内为 true', () => {
    expect(isTokenExpiring(undefined, 1000, 60_000)).toBe(false)
    expect(isTokenExpiring(30_000, 0, 60_000)).toBe(true)
    expect(isTokenExpiring(120_000, 0, 60_000)).toBe(false)
  })
})

describe('McpTokenStore', () => {
  const dirs: string[] = []
  function makeStore(): { store: McpTokenStore; file: string } {
    const dir = mkdtempSync(join(tmpdir(), 'spark-mcp-tokens-'))
    dirs.push(dir)
    const file = join(dir, 'mcp-tokens.json')
    return { store: new McpTokenStore(file), file }
  }
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    dirs.length = 0
  })

  it('set/get 回环；文件落盘可被新实例复读（持久化语义）', () => {
    const { store, file } = makeStore()
    expect(store.names()).toEqual([])
    store.set('srv', { clientId: 'cid', accessToken: 'at', refreshToken: 'rt', expiresAt: 123 })
    expect(store.get('srv')).toEqual({ clientId: 'cid', accessToken: 'at', refreshToken: 'rt', expiresAt: 123 })
    expect(existsSync(file)).toBe(true)
    expect(new McpTokenStore(file).get('srv')?.accessToken).toBe('at')
  })

  it('delete 清场（不存在返回 false）；坏 JSON 拒收不带病运行', () => {
    const { store, file } = makeStore()
    store.set('srv', { clientId: 'cid', accessToken: 'at' })
    expect(store.delete('srv')).toBe(true)
    expect(store.delete('srv')).toBe(false)
    rmSync(file)
    writeFileSync(file, '{broken')
    expect(() => new McpTokenStore(file)).toThrow()
  })
})
