/**
 * examples/sdk-bot 入口（工单 14.5 要求 2）：解析 argv/env → 装配客户端 → 跑 bot → 收口。
 * 业务在 `bot.ts`（通道无关、可复用、可测）；本文件只做"脚本的壳"。
 *
 * 跑法：
 *   pnpm --filter @spark/example-bot start                     # HTTP 通道（需 server 在跑）
 *   pnpm --filter @spark/example-bot start "读 README 并总结"   # 指定任务
 *   SPARK_DEMO=1 pnpm --filter @spark/example-bot start        # 演示模式（离线，ScriptedLlm）
 *   BOT_LOG=bot.log pnpm --filter @spark/example-bot start     # 结果追加写文件
 * 退出码：0 = turn 正常收尾（finish=stop）；1 = error/aborted 或异常。
 */
import { makeClient, runBot, type BotOptions } from './bot.js'

const taskArg = process.argv[2]
const logFile = process.env['BOT_LOG']
const opts: BotOptions = {
  task: taskArg !== undefined && taskArg !== '' ? taskArg : '用一句话说明你能做什么',
  ...(logFile !== undefined && logFile !== '' ? { logFile } : {}),
}

const handle = await makeClient()
try {
  const result = await runBot(handle.client, opts)
  process.exitCode = result.finish === 'stop' ? 0 : 1
} catch (err) {
  process.stderr.write(`sdk-bot: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
} finally {
  await handle.close()
}
