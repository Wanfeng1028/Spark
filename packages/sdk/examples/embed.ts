/**
 * 嵌入示例（工单 14.4 要求 5：≤30 行——建引擎 → 订阅 → 发消息 → 审批应答 → 关闭）。
 * 跑法：`pnpm --filter @spark/sdk embed`（走真实引擎与 ~/.spark/models.json 的供应商，
 * 不打桩：需要至少一个可用 provider 与密钥，否则 loadConfig/首回合会如实报错）。
 * 六段说明见 doc/02 §4.8；进程内通道语义见 ADR D30/D31。
 */
import { Engine, loadConfig } from '@spark/engine'
import { ids } from '@spark/protocol'
import { createInProcessClient } from '../src/inprocess.js'

// ① 生命周期：引擎由宿主构造与关闭（sdk 不代劳）；② 装配进程内通道客户端
const engine = new Engine({ root: process.cwd(), config: loadConfig() })
const client = createInProcessClient(engine)

// ③ 事件订阅：durable 与 live 同一批信封，按 type 取用（投影可用 protocol 的 applyEvent）
client.events.subscribe((e) => {
  if (e.type === 'assistant.message') {
    const content = (e.data as { content: Array<{ type: string; text?: string }> }).content
    for (const block of content) if (block.type === 'text') process.stdout.write(block.text ?? '')
  }
  // ④ 审批接管：permission.asked 由宿主决定（此处一律放行一次；生产请按自己的策略判断）
  if (e.type === 'permission.asked') {
    const requestId = ids.request((e.data as { requestId: string }).requestId)
    void client.approvals.resolve(requestId, 'once', '嵌入示例：一律放行')
  }
})
// 回合结束的等待要先订阅再发消息（否则可能错过 turn.completed）
const finished = new Promise<void>((resolve) => {
  const off = client.events.subscribe((e) => {
    if (e.type !== 'turn.completed') return
    off()
    resolve()
  })
})

await engine.ready() // ⑤ 就绪：MCP / skills / 命令 / 预设档装载完成后再干活
const session = await client.sessions.create({ cwd: process.cwd() })
await client.sessions.send(session.id, '用一句话介绍你自己')
await finished

client.close() // ⑥ 收口：先退订客户端，再关引擎（顺序不可颠倒——迟到的事件不该再进回调）
await engine.shutdown()
