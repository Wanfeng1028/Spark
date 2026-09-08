/**
 * Transport 接口契约套件（工单 14.2 产出③ / doc/06 §1 L1.5）。
 *
 * **参数化**：任何 Transport 实现都跑同一组语义断言——HTTP 通道（本目录
 * `transport-http-contract.test.ts`）先接，InProcess 通道随工单 14.4 接同一份，
 * 双通道 parity（doc/08 §4 决策三）由此成立，而不是各写各的测试。
 *
 * 断言的是**传输层语义**（会话生命周期 / 事件投递与回放 / 退订 / 错误形状），
 * 不是实现细节：
 * - 不测 SSE 时序、心跳、背压、bye 帧——那是 `sse.test.ts` 的手写领域（doc/06 §4 明确保留）；
 * - 不测 DTO 形状——那由 protocol 的契约生成物覆盖（`packages/protocol/tests/contract/`）；
 * - 不测审批与工具语义——那在引擎层由 evals core 套件覆盖（通道无关）；`replyPermission`
 *   的路由 parity 随 14.4 双通道落地时补进本套件（届时两个实现同时在场，断言才有对照意义）。
 *
 * 通道实现只需提供三件事：transport 实例、让引擎产出一个确定文本回合的方法、收口。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import type { SparkEventEnvelope, Transport } from '@spark/protocol'

export interface ContractChannel {
  transport: Transport
  /** 预录一次纯文本回复（各通道自己决定怎么喂底层引擎；HTTP 通道用 ScriptedLlm） */
  scriptTextReply(text: string): void
  /** 收口：关流 + 关服务 + 关引擎（不泄漏句柄，否则 vitest 挂着不退） */
  close(): Promise<void>
}

/** 轮询等待（谓词可为异步）；超时抛错——契约套件里"等不到"就是失败，不静默放过 */
async function waitFor(what: string, predicate: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await predicate()) return
    if (Date.now() > deadline) throw new Error(`契约套件超时：等不到 ${what}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

function hasType(events: readonly SparkEventEnvelope[] | undefined, type: string): boolean {
  return (events ?? []).some((e) => e.type === type)
}

export function transportContractSuite(name: string, makeChannel: () => Promise<ContractChannel>): void {
  describe(`Transport 契约：${name}`, () => {
    let channel: ContractChannel

    beforeEach(async () => {
      channel = await makeChannel()
    })

    afterEach(async () => {
      await channel.close()
    })

    test('会话生命周期：create → list → archive → 归档过滤 → delete', async () => {
      const t = channel.transport
      const created = await t.createSession({ title: '契约会话' })
      expect(created.title).toBe('契约会话')
      expect((await t.listSessions()).some((s) => s.id === created.id)).toBe(true)

      const archived = await t.archiveSession(created.id, true)
      expect(typeof archived.archivedAt).toBe('string')
      // 缺省列表排除归档、archived=true 只列归档（工单 12.4 语义，跨通道一致）
      expect((await t.listSessions()).some((s) => s.id === created.id)).toBe(false)
      expect((await t.listSessions(true)).some((s) => s.id === created.id)).toBe(true)

      await t.archiveSession(created.id, false)
      expect((await t.listSessions()).some((s) => s.id === created.id)).toBe(true)

      await t.deleteSession(created.id)
      // 删除后取会话必须失败，且错误消息带原码（6.7 人话化 + 原码折叠的既有合同）
      await expect(t.getSession(created.id)).rejects.toThrow(/E_[A-Z_]+/)
    })

    test('未知会话 → E_NOT_FOUND（错误码跨通道同形）', async () => {
      await expect(channel.transport.getSession(ids.session('ses_contractunknown1'))).rejects.toThrow(
        /E_NOT_FOUND/,
      )
    })

    test('回合与事件流：订阅收到直播事件，回放给出同一批 durable 且 seq 升序', async () => {
      const t = channel.transport
      const seen: SparkEventEnvelope[] = []
      const off = t.onEvent((e) => seen.push(e))
      const session = await t.createSession()

      channel.scriptTextReply('契约答复')
      const outcome = await t.sendMessage(session.id, '契约提问')
      expect(outcome.result).toBe('started')
      await waitFor('turn.completed（直播）', () => hasType(seen, 'turn.completed'))
      off()

      // 回放面（冷启动数据源）：durable 三件套齐备且 seq 升序——去重靠 seq（doc/02 §6.4）
      const dto = await t.getSession(session.id)
      expect(hasType(dto.events, 'user.message')).toBe(true)
      expect(hasType(dto.events, 'assistant.message')).toBe(true)
      expect(hasType(dto.events, 'turn.completed')).toBe(true)
      const seqs = (dto.events ?? [])
        .map((e) => e.seq)
        .filter((n): n is number => n !== undefined)
      expect(seqs.length).toBeGreaterThan(0)
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
      // 直播面确实收到过（不是只有回放才有数据）
      expect(hasType(seen, 'assistant.message')).toBe(true)
    })

    test('退订后不再投递（onEvent 返回的退订函数是有效的）', async () => {
      const t = channel.transport
      const seen: string[] = []
      const off = t.onEvent((e) => seen.push(e.type))
      const session = await t.createSession()
      off()

      channel.scriptTextReply('退订后的答复')
      await t.sendMessage(session.id, '退订后的提问')
      // 以回放面确认回合真的跑完了，再断言直播面一条没收到（否则是"没跑"而不是"没投递"）
      await waitFor('turn.completed（回放）', async () =>
        hasType((await t.getSession(session.id)).events, 'turn.completed'),
      )
      expect(seen).not.toContain('turn.completed')
      expect(seen).not.toContain('assistant.message')
    })
  })
}
