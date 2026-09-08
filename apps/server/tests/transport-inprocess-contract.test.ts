/**
 * Transport 契约套件 · 进程内通道（工单 14.4 / ADR D31）：与 HTTP 通道跑**同一份**断言。
 *
 * 通道装配：临时 root + ScriptedLlm + 真 Engine（`ready()` 后直连），不起 server、不占端口。
 * 与 `transport-http-contract.test.ts` 并列——两份文件唯一的不同就是 `makeChannel`，
 * 这正是双通道 parity 的机器对照（ADR D31 结论 2）：断言写一次，两个实现都得过。
 *
 * 另附**通道特有语义**三例（不进双通道套件，因为它们本就是单通道的性质）：
 * 服务端专有能力必抛 E_UNSUPPORTED（禁假实现）、close 不关引擎（生命周期属宿主）、
 * 收口后受理即拒（失败闭合）。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { Engine } from '@spark/engine'
import { ScriptedLlm } from '@spark/engine/internal'
import { ids } from '@spark/protocol'
import type { Transport } from '@spark/protocol'
import { createInProcessClient } from '@spark/sdk/inprocess'
import { makeConfig } from './helpers.js'
import { transportContractSuite, type ContractChannel } from './transport-contract.js'

async function makeEmbed(): Promise<{
  engine: Engine
  gateway: ScriptedLlm
  client: ReturnType<typeof createInProcessClient>
}> {
  const root = await mkdtemp(join(tmpdir(), 'spark-inprocess-'))
  const gateway = new ScriptedLlm()
  const engine = new Engine({ root, gateway, config: makeConfig() })
  await engine.ready()
  return { engine, gateway, client: createInProcessClient(engine) }
}

async function makeInProcessChannel(): Promise<ContractChannel> {
  const embed = await makeEmbed()
  return {
    transport: embed.client.transport,
    scriptTextReply: (text) => {
      embed.gateway.scriptStep({ deltas: [{ kind: 'text', text }] })
    },
    close: async () => {
      embed.client.close()
      await embed.engine.shutdown()
    },
  }
}

transportContractSuite('InProcess（createInProcessClient 直连 Engine）', makeInProcessChannel)

describe('进程内通道的通道特有语义（工单 14.4）', () => {
  test('服务端专有能力如实 E_UNSUPPORTED（不返回空值、不静默成功、不本地模拟）', async () => {
    const { engine, client } = await makeEmbed()
    // 以 Transport 接口视角调用：具体实现刻意不收这些参数（本通道根本不用）
    const t: Transport = client.transport
    const sid = ids.session('ses_inprocesscontract1')
    // redeemPair 不列入：它的 PairRedeemBody 形状属配对面，本通道永远不消费，构造假 body 无意义
    const cases: Array<[string, () => Promise<unknown>]> = [
      ['listFs', () => t.listFs(sid)],
      ['listFsTree', () => t.listFsTree(sid)],
      [
        'uploadAttachment',
        () => t.uploadAttachment(sid, { name: 'a.png', mime: 'image/png', bytes: new Uint8Array(1) }),
      ],
      ['getPairStatus', () => t.getPairStatus()],
      ['createPairCode', () => t.createPairCode()],
      ['revokePairDevice', () => t.revokePairDevice('dev_1')],
    ]
    for (const [name, run] of cases) {
      await expect(run(), name).rejects.toThrow(/E_UNSUPPORTED/)
    }
    client.close()
    await engine.shutdown()
  })

  test('close() 只退订不关引擎（引擎生命周期属宿主，sdk 无权代决）', async () => {
    const { engine, client } = await makeEmbed()
    client.close()
    // 引擎仍可用：宿主直接调门面不抛（若被 sdk 关掉会命中引擎的 assertNotShutdown）
    expect(() => engine.listModels()).not.toThrow()
    await engine.shutdown()
  })

  test('收口后受理即拒（失败闭合，不静默成功）', async () => {
    const { engine, client } = await makeEmbed()
    client.close()
    await expect(client.transport.listSessions()).rejects.toThrow(/E_DISPOSED/)
    await expect(client.sessions.create()).rejects.toThrow(/E_DISPOSED/)
    await engine.shutdown()
  })
})
