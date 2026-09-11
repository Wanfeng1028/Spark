/**
 * 语音转写单测（工单 16.6）：SSRF 黑名单矩阵 + assertPublicUrl 三路径 +
 * transcribeAudio 全失败面（未配置/mime/体积/SSRF/上游）与成功路径（fetch 假体）。
 * 端点来自用户可写 models.json——SSRF 防护（qwen 必抄项）是本模块的安全核心。
 */
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isBlockedAddress, assertPublicUrl } from '../src/voice/ssrf.js'
import { transcribeAudio } from '../src/voice/transcriber.js'
import type { TranscribeDeps } from '../src/voice/transcriber.js'
import { SecretStore } from '../src/secrets/store.js'
import type { ModelsConfig } from '../src/config.js'

describe('isBlockedAddress（SSRF 黑名单矩阵）', () => {
  const blocked = [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.9',
    '172.31.255.1',
    '192.168.1.1',
    '169.254.169.254', // 云元数据
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:10.0.0.1', // IPv4-mapped 过渡
    '::ffff:127.0.0.1',
    '64:ff9b::7f00:1', // NAT64 过渡
    '64:ff9b:1::10',
    '2002:0a00:0001::', // 6to4 内嵌私网 v4
  ]
  const allowed = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111', '2620:fe::fe']

  it.each(blocked)('拒绝 %s', (addr) => {
    expect(isBlockedAddress(addr)).toBe(true)
  })
  it.each(allowed)('放行 %s', (addr) => {
    expect(isBlockedAddress(addr)).toBe(false)
  })
  it('非 IP 输入 fail-closed（解析不出即拒）', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true)
  })
})

describe('assertPublicUrl', () => {
  const lookupOk = () => Promise.resolve([{ address: '93.184.216.34' }])

  it('协议白名单：http/https 之外拒绝', async () => {
    await expect(assertPublicUrl('ftp://example.com')).rejects.toThrow('E_TRANSCRIBE_UNCONFIGURED')
  })

  it('IP 字面量直查黑名单；合法公网 IP 通过', async () => {
    await expect(assertPublicUrl('http://127.0.0.1:8080/v1/x')).rejects.toThrow('E_TRANSCRIBE_BLOCKED')
    await expect(assertPublicUrl('https://8.8.8.8/v1/x')).resolves.toBeInstanceOf(URL)
  })

  it('域名解析到私网/混合地址 → 拒绝（多栈任一命中即拒）；公网 → 通过', async () => {
    await expect(
      assertPublicUrl('https://internal.example.com/x', {
        lookupFn: () => Promise.resolve([{ address: '10.0.0.5' }]),
      }),
    ).rejects.toThrow('E_TRANSCRIBE_BLOCKED')
    await expect(
      assertPublicUrl('https://mixed.example.com/x', {
        lookupFn: () => Promise.resolve([{ address: '93.184.216.34' }, { address: '192.168.0.9' }]),
      }),
    ).rejects.toThrow('E_TRANSCRIBE_BLOCKED')
    await expect(
      assertPublicUrl('https://ok.example.com/x', { lookupFn: lookupOk }),
    ).resolves.toBeInstanceOf(URL)
  })

  it('解析失败 → E_TRANSCRIBE_UPSTREAM；非法 URL → E_TRANSCRIBE_UNCONFIGURED', async () => {
    await expect(
      assertPublicUrl('https://nope.example.com/x', {
        lookupFn: () => {
          throw new Error('ENOTFOUND')
        },
      }),
    ).rejects.toThrow('E_TRANSCRIBE_UPSTREAM')
    await expect(assertPublicUrl('not a url')).rejects.toThrow('E_TRANSCRIBE_UNCONFIGURED')
  })
})

// ---- transcribeAudio ----

function modelsFixture(providers: ModelsConfig['providers']): ModelsConfig {
  return {
    providers,
    defaultModel: { provider: 'openai', model: 'gpt-x', contextWindow: 100_000 },
    compactionModel: { provider: 'openai', model: 'gpt-x', contextWindow: 100_000 },
    fallbacks: [],
    titleModel: { provider: 'openai', model: 'gpt-x', contextWindow: 100_000 },
    subagentModel: { provider: 'openai', model: 'gpt-x', contextWindow: 100_000 },
    costLimitUsd: undefined,
    defaultEffort: undefined,
    models: [],
  }
}

function depsFixture(opts?: {
  providers?: ModelsConfig['providers']
  fetchImpl?: typeof fetch
}): TranscribeDeps {
  const providers =
    opts?.providers ??
    ({
      openai: { apiKeyEnv: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1/' },
    } satisfies ModelsConfig['providers'])
  // 空密钥仓：SecretStore 构造只读缺失文件 → 空表（无磁盘写）；apiKey 走 env 注入
  const secrets = new SecretStore(join(tmpdir(), `spark-voice-test-${Date.now()}`, 'secrets.json'))
  return {
    models: modelsFixture(providers),
    secrets,
    env: { OPENAI_API_KEY: 'sk-test' },
    fetchImpl:
      opts?.fetchImpl ??
      (() =>
        Promise.resolve(new Response(JSON.stringify({ text: '你好世界' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }))) as unknown as typeof fetch,
  }
}

describe('transcribeAudio（工单 16.6）', () => {
  it('baseUrl 拼接缺省端点 + Bearer 密钥 + multipart 上传；成功返回文本', async () => {
    const captured: { current: { url: string; init: RequestInit } | null } = { current: null }
    const d = depsFixture({
      fetchImpl: ((url: string, init?: RequestInit) => {
        captured.current = { url, init: init ?? {} }
        return Promise.resolve(new Response(JSON.stringify({ text: '你好世界' }), { status: 200 }))
      }) as typeof fetch,
    })
    const out = await transcribeAudio(d, { mime: 'audio/wav', dataBase64: 'RIFF' })
    expect(out).toEqual({ text: '你好世界', provider: 'openai', model: 'whisper-1' })
    const call = captured.current
    expect(call?.url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(((call?.init.headers ?? {}) as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('显式 transcription.endpoint/model 优先；store 密钥进 Authorization', async () => {
    let url = ''
    let auth = ''
    const d = depsFixture({
      providers: {
        openai: {
          apiKeyEnv: null,
          baseUrl: 'https://api.openai.com/v1',
          transcription: { endpoint: 'https://gw.example.com/audio', model: 'paraformer-v2' },
        },
      },
      fetchImpl: ((u: string, init?: RequestInit) => {
        url = u
        auth = ((init?.headers ?? {}) as Record<string, string>).Authorization ?? ''
        return Promise.resolve(new Response(JSON.stringify({ text: 'ok' }), { status: 200 }))
      }) as typeof fetch,
    })
    const out = await transcribeAudio(d, { mime: 'audio/webm', dataBase64: 'x' })
    expect(out.model).toBe('paraformer-v2')
    expect(url).toBe('https://gw.example.com/audio')
    expect(auth).toBe('Bearer sk-test')
  })

  it('provider 缺省取 defaultModel.provider；未知 provider 拒绝', async () => {
    const d = depsFixture()
    const out = await transcribeAudio(d, { provider: 'openai', mime: 'audio/wav', dataBase64: 'x' })
    expect(out.provider).toBe('openai')
    await expect(
      transcribeAudio(d, { provider: 'nope', mime: 'audio/wav', dataBase64: 'x' }),
    ).rejects.toThrow('E_TRANSCRIBE_UNCONFIGURED')
  })

  it('无 baseUrl 无 endpoint → E_TRANSCRIBE_UNCONFIGURED（fail-closed）', async () => {
    const d = depsFixture({
      providers: { openai: { apiKeyEnv: null } } satisfies ModelsConfig['providers'],
    })
    await expect(transcribeAudio(d, { mime: 'audio/wav', dataBase64: 'x' })).rejects.toThrow(
      'E_TRANSCRIBE_UNCONFIGURED',
    )
  })

  it('mime 白名单 / 体积 10MB 上限 / SSRF 内网端点——三类拒绝先于 fetch', async () => {
    const d = depsFixture({
      providers: {
        openai: { apiKeyEnv: null, baseUrl: 'http://127.0.0.1:9999' },
      } satisfies ModelsConfig['providers'],
    })
    await expect(transcribeAudio(d, { mime: 'video/mp4', dataBase64: 'x' })).rejects.toThrow(
      'E_TRANSCRIBE_MIME',
    )
    await expect(transcribeAudio(d, { mime: 'audio/wav', dataBase64: 'A'.repeat(14_000_000) })).rejects.toThrow(
      'E_TRANSCRIBE_TOO_LARGE',
    )
    await expect(transcribeAudio(d, { mime: 'audio/wav', dataBase64: 'x' })).rejects.toThrow(
      'E_TRANSCRIBE_BLOCKED',
    )
  })

  it('上游非 2xx / 非 JSON / 缺 text → E_TRANSCRIBE_UPSTREAM（状态码透出）', async () => {
    const fail = depsFixture({
      fetchImpl: (() => Promise.resolve(new Response('{"error":"boom"}', { status: 503 }))) as unknown as typeof fetch,
    })
    await expect(transcribeAudio(fail, { mime: 'audio/wav', dataBase64: 'x' })).rejects.toThrow('503')
    const notJson = depsFixture({
      fetchImpl: (() => Promise.resolve(new Response('<html/>', { status: 200 }))) as unknown as typeof fetch,
    })
    await expect(transcribeAudio(notJson, { mime: 'audio/wav', dataBase64: 'x' })).rejects.toThrow(
      'E_TRANSCRIBE_UPSTREAM',
    )
    const noText = depsFixture({
      fetchImpl: (() => Promise.resolve(new Response('{"nope":1}', { status: 200 }))) as unknown as typeof fetch,
    })
    await expect(transcribeAudio(noText, { mime: 'audio/wav', dataBase64: 'x' })).rejects.toThrow(
      'E_TRANSCRIBE_UPSTREAM',
    )
  })
})
