/**
 * 最小连接示例（工单 14.3 要求 3：≤10 行连接 + 订阅 + 发送）。
 * 跑法：先 `pnpm --filter server dev`，再 `pnpm --filter @spark/sdk example`
 * （= `tsx examples/minimal.ts`；写成包脚本而不是只写在注释里，knip 才能看到 tsx 真被用）。
 * 基址可用 SPARK_API 覆盖（缺省 127.0.0.1:4318）；有配对 token 时传 { token }。
 */
import { createClient } from '../src/index.js'

const client = createClient(process.env['SPARK_API'] ?? 'http://127.0.0.1:4318')
client.events.subscribe((e) => console.log(e.type, e.seq ?? '-'))
const session = await client.sessions.create()
await client.sessions.send(session.id, '你好 Spark')
setTimeout(() => client.close(), 30_000) // 留 30s 看事件流，然后收口
