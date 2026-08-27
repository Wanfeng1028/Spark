/**
 * Logger 单测（doc/02 §5.10）：
 * 1) 双路写入（stdout + 文件）；字段 sid/turnId/callId/code/durMs 正常落日志
 * 2) 固定脱敏三正则：sk-xxx / Bearer xxx / process.env 值出现处 → ***
 * 3) 日志 msg 英文短语可 grep（无中文出现在 msg 字段）
 * 4) Error 对象脱敏（message 与 stack 的敏感值被替换）
 * 5) 敏感值长度 <6 的 process.env 不误伤
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Logger } from '../src/logger.js'
import type { LogFields } from '../src/logger.js'

/** pino-multistream 的 stream flush 需要事件循环；close 结束后给 30ms 让 OS 刷磁盘缓冲 */
async function drain(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 50))
}

function makeRoot(): string {
  const r = mkdtempSync(join(tmpdir(), 'spark-logger-'))
  mkdirSync(join(r, 'sessions'), { recursive: true })
  mkdirSync(join(r, 'logs'), { recursive: true })
  return r
}

/** 内存流：捕获 logger 写入（单测用）——不用传 logger 注入（接口受 pino 约束）
 * 直接在临时 root 建 logger，然后读 engine.log 文件断言。
 */
function collectLines(root: string): string[] {
  try {
    const content = readFileSync(join(root, 'logs', 'engine.log'), 'utf8')
    return content.split('\n').filter((l) => l.length > 0)
  } catch {
    return []
  }
}

let savedEnv: Record<string, string | undefined> = {}
const SECRET_KEYS = ['MY_TEST_APIKEY', 'SHORT_VAL'] as const

beforeEach(() => {
  savedEnv = {}
  for (const k of SECRET_KEYS) {
    savedEnv[k] = process.env[k]
  }
  process.env.MY_TEST_APIKEY = 'sk-myTestSecretTokenValue12345'
  process.env.SHORT_VAL = 'abc' // <6 应被脱敏策略跳过（正则不收集）
})

afterEach(() => {
  for (const k of SECRET_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('Logger 基础', () => {
  it('info/warn/error 写入文件 engine.log；字段与 msg 保留', async () => {
    const root = makeRoot()
    const log = new Logger({ root, level: 'info' })
    try {
      log.info('tool.completed', {
        callId: 'cal_t000000000000000000000001' as never,
        code: 'E_NONE',
        durMs: 42,
        sid: 'ses_t00000000000000000000001' as never,
        turnId: 'trn_t00000000000000000000001' as never,
      })
      log.warn('bus.subscriber.error', { type: 'session.created' })
      log.error('llm.stream.error', { code: 'E_LLM_NETWORK' })
    } finally {
      await log.close(); await drain()
    }
    const lines = collectLines(root)
    expect(lines.length).toBeGreaterThanOrEqual(3)
    // 每行都是合法 JSON
    const parsed: Record<string, unknown>[] = lines.map((l) => JSON.parse(l) as Record<string, unknown>)
    const info = parsed.find((p) => p['msg'] === 'tool.completed')
    expect(info).toBeDefined()
    expect((info as Record<string, unknown>)['code']).toBe('E_NONE')
    expect((info as Record<string, unknown>)['durMs']).toBe(42)
    expect(typeof (info as Record<string, unknown>)['level']).toBe('string') // pino level
    const subErr = parsed.find((p) => p['msg'] === 'bus.subscriber.error')
    expect(subErr).toBeDefined()
    expect((subErr as Record<string, unknown>)['type']).toBe('session.created')
    const llmErr = parsed.find((p) => p['msg'] === 'llm.stream.error')
    expect(llmErr).toBeDefined()
    expect((llmErr as Record<string, unknown>)['code']).toBe('E_LLM_NETWORK')
  })

  it('debug 级别被 info 过滤；改 level=debug 后写出', async () => {
    const root = makeRoot()
    const filtered = new Logger({ root, level: 'info' })
    try {
      filtered.debug('session.list')
    } finally {
      await filtered.close(); await drain()
    }
    expect(collectLines(root).filter((l) => l.includes('session.list')).length).toBe(0)

    const root2 = makeRoot()
    const shown = new Logger({ root: root2, level: 'debug' })
    try {
      shown.debug('session.list')
    } finally {
      await shown.close(); await drain()
    }
    const lines = collectLines(root2).map((l) => JSON.parse(l) as { msg: string })
    expect(lines.some((l) => l.msg === 'session.list')).toBe(true)
  })
})

describe('§5.10 脱敏', () => {
  it('sk-xxx 正则：sk- 开头 20+ 字母数字 → ***', async () => {
    const root = makeRoot()
    const log = new Logger({ root })
    try {
      log.info('llm.stream.start', {
        // fields 中的 apiKey 直写
        apiKey: 'sk-abcdefghijklmnopqrstuvwxyz1234567890',
        text: 'authorization: Bearer sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA and then ok',
      })
    } finally {
      await log.close(); await drain()
    }
    const content = readFileSync(join(root, 'logs', 'engine.log'), 'utf8')
    expect(content).not.toMatch(/sk-[A-Za-z0-9]{20,}/)
    expect(content).toContain('***')
  })

  it('Bearer 正则：Bearer + 非空白 → Bearer ***', async () => {
    const root = makeRoot()
    const log = new Logger({ root })
    try {
      log.warn('server.request.in', {
        headers: 'authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      })
    } finally {
      await log.close(); await drain()
    }
    const content = readFileSync(join(root, 'logs', 'engine.log'), 'utf8')
    expect(content).not.toMatch(/Bearer\s+ey/)
    expect(content).toContain('Bearer ***')
  })

  it('process.env 值域：≥6 非空串出现处替换；<6 跳过', async () => {
    // beforeEach 已设 MY_TEST_APIKEY = sk-myTestSecretTokenValue12345（>=6），SHORT_VAL = abc (<6)
    // 写入 fake 文件包含两段内容
    const root = makeRoot()
    writeFileSync(join(root, 'secrets.txt'), process.env.MY_TEST_APIKEY!)
    const leaked = readFileSync(join(root, 'secrets.txt'), 'utf8')
    const log = new Logger({ root })
    try {
      log.error('llm.stream.error', {
        message: `provider 错误：${leaked} 与 ${process.env.SHORT_VAL} 都出现在日志`,
      })
    } finally {
      await log.close(); await drain()
    }
    const content = readFileSync(join(root, 'logs', 'engine.log'), 'utf8')
    // ≥6 的 apiKey 必须没出现；abc（<6）可以保留
    expect(content).not.toContain('sk-myTestSecretTokenValue12345')
    expect(content).toContain('abc')
    expect(content).toContain('***')
  })

  it('Error 对象脱敏：message 与 stack 中敏感串被替换，保留 Error 原型语义', async () => {
    const root = makeRoot()
    const log = new Logger({ root })
    try {
      const err = new Error('网络错误，token sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ 泄露')
      err.stack = `Error: 网络错误，token sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ 泄露\n    at foo (/tmp/a.ts:1:1)`
      log.error('llm.stream.error', { err })
    } finally {
      await log.close(); await drain()
    }
    const content = readFileSync(join(root, 'logs', 'engine.log'), 'utf8')
    expect(content).not.toContain('sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect(content).toContain('网络错误')
    expect(content).toContain('/tmp/a.ts:1:1')
  })

  it('递归对象：嵌套数组对象内字符串都过脱敏', async () => {
    const root = makeRoot()
    const log = new Logger({ root })
    try {
      const fields: LogFields = {
        sid: 'ses_test000000000000000000000001' as never,
        nested: [
          { auth: 'Bearer token-in-array', key: 'sk-12345678901234567890' },
          { auth: 'plain' },
        ],
      }
      log.warn('tool.start', fields)
    } finally {
      await log.close(); await drain()
    }
    const content = readFileSync(join(root, 'logs', 'engine.log'), 'utf8')
    expect(content).not.toMatch(/Bearer\s+toke/)
    expect(content).not.toContain('sk-12345678901234567890')
    expect(content).toContain('Bearer ***')
    expect(content).toContain('plain')
  })
})

describe('工单 7.1 密钥仓值脱敏（registerSecrets）', () => {
  it('store 值注册后：日志中明文 → ***；<6 跳过', async () => {
    const root = makeRoot()
    const log = new Logger({ root })
    try {
      log.registerSecrets(['raw_store_value_abcdef', 'tiny'])
      log.error('llm.stream.error', {
        message: '网关错误，apiKey raw_store_value_abcdef 泄露',
      })
      log.info('tool.completed', { note: 'tiny 保留（<6 跳过）' })
    } finally {
      await log.close(); await drain()
    }
    const content = readFileSync(join(root, 'logs', 'engine.log'), 'utf8')
    expect(content).not.toContain('raw_store_value_abcdef')
    expect(content).toContain('***')
    expect(content).toContain('tiny')
    expect(content).toContain('网关错误')
  })

  it('registerSecrets 可多次追加；嵌套对象同样过脱敏', async () => {
    const root = makeRoot()
    const log = new Logger({ root })
    try {
      log.registerSecrets(['firstSecretValue1'])
      log.registerSecrets(['secondSecretValue2'])
      log.warn('tool.start', {
        nested: [{ k: 'firstSecretValue1' }, { k: 'secondSecretValue2' }],
      })
    } finally {
      await log.close(); await drain()
    }
    const content = readFileSync(join(root, 'logs', 'engine.log'), 'utf8')
    expect(content).not.toContain('firstSecretValue1')
    expect(content).not.toContain('secondSecretValue2')
    expect(content).toContain('***')
  })
})

describe('文件输出路径', () => {
  it('root 指定时：logs/engine.log 写到 root/logs 子目录', async () => {
    const root = makeRoot()
    const log = new Logger({ root })
    try {
      log.info('engine.start')
    } finally {
      await log.close(); await drain()
    }
    const f = join(root, 'logs', 'engine.log')
    expect(() => readFileSync(f, 'utf8')).not.toThrow()
  })
})
