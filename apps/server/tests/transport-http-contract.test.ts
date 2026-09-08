/**
 * Transport 契约套件 · HTTP 通道（工单 14.2 产出③）。
 *
 * 通道装配：真实 listen 的 Fastify（`app.inject` 走不了 HttpTransport——它用 fetch 打真地址）
 * + ScriptedLlm 预录回合 + HttpTransport（默认起全局 SSE，直播面由此而来）。
 * InProcess 通道随工单 14.4 接同一份套件（`transport-contract.ts`），双通道 parity 成立。
 */
import { HttpTransport } from '@spark/protocol'
import { makeServer } from './helpers.js'
import { transportContractSuite, type ContractChannel } from './transport-contract.js'

async function makeHttpChannel(): Promise<ContractChannel> {
  const fixture = await makeServer()
  await fixture.app.listen({ port: 0, host: '127.0.0.1' })
  const bound = fixture.app.addresses()[0]
  if (bound === undefined) throw new Error('夹具未取到监听地址（契约套件无法装配 HTTP 通道）')
  const transport = new HttpTransport({ baseUrl: `http://${bound.address}:${bound.port}` })
  return {
    transport,
    scriptTextReply: (text) => {
      fixture.gateway.scriptStep({ deltas: [{ kind: 'text', text }] })
    },
    close: async () => {
      transport.dispose()
      await fixture.app.close()
      await fixture.engine.shutdown()
    },
  }
}

transportContractSuite('HTTP（HttpTransport + 真实 listen）', makeHttpChannel)
