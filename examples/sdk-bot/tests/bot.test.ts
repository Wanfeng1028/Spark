/**
 * sdk-bot 演示模式冒烟测试（工单 14.5 验收"三例在真实 server（ScriptedLlm）下跑通"里
 * **CI 可执行的那一部分**）：`SPARK_DEMO=1` → 进程内 Engine + ScriptedLlm，不出网、
 * 不打真实模型、不需 server，于是 bot 的核心逻辑在 CI 里被真跑一遍。
 *
 * 剩下两例（viewer / tui）与 HTTP 模式的走查归人工（需浏览器与 TTY，且要打真实 server），
 * 记录口径见 examples/README.md 与 doc/08 §14.5。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { Transport } from '@spark/protocol'
import type { SparkClient } from '@spark/sdk'
import { makeClient, runBot } from '../bot.js'

type Handle = { client: SparkClient<Transport>; close: () => Promise<void> }

let handle: Handle | null = null

beforeEach(() => {
  process.env['SPARK_DEMO'] = '1'
})

afterEach(async () => {
  if (handle !== null) await handle.close()
  handle = null
  delete process.env['SPARK_DEMO']
})

describe('sdk-bot（演示模式 = 进程内通道 + ScriptedLlm）', () => {
  test('建会话 → 发任务 → 拿到预录回答与 turn.completed(stop)', async () => {
    handle = await makeClient()
    const result = await runBot(handle.client, { task: '报一下包名' })

    expect(result.finish).toBe('stop')
    expect(result.text).toContain('ScriptedLlm') // 预录回答确实经事件流回到了 bot
    expect(result.sessionId.startsWith('ses_')).toBe(true)
  })

  test('回放面也能看到同一批 durable 事件（bot 不依赖直播才成立）', async () => {
    handle = await makeClient()
    const result = await runBot(handle.client, { task: '再跑一次' })

    // sessionId 已是品牌化的 SessionId（bot 原样透出），直接喂回放面不需转换
    const dto = await handle.client.events.replay(result.sessionId)
    const types = (dto.events ?? []).map((e) => e.type)
    expect(types).toContain('user.message')
    expect(types).toContain('turn.completed')
  })
})
