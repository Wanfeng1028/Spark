/**
 * CLI 入口（工单 8.2）：--api <baseUrl> / SPARK_API 环境变量；
 * 缺省 http://127.0.0.1:4318（server §7.1 缺省端口，本地刻意不暴露公网）。
 * 工单 11.6：新增 `spark up`——本机拉起 server bundle 并进入 TUI（src/up.ts）。
 * 冷启预算 <1s（doc/06 L4）：模块装载后直接渲染，无加载占位屏。
 */
import { render } from 'ink'
import { cliKeymapText } from '@spark/protocol'
import { App } from './app.js'
import { startUp } from './up.js'
import { PRINT_USAGE, parsePrintArgs, runPrint } from './print.js'

const USAGE = `Spark CLI（Ink TUI）

用法：
  spark                 直接进入 TUI（连 --api/SPARK_API 指向的 server）
  spark up              本机拉起 server（bundle 产物）并进入 TUI；已有 server 则复用，
                        TUI 退出连带回收本命令拉起的子进程
  spark [--api <url>]   --api 与 up 可组合：spark up --api <url> 自定义基址

参数：
  --api <url>   API 基址（或 SPARK_API 环境变量；缺省 http://127.0.0.1:4318）
  -h, --help    显示本帮助

键位（单一来源 @spark/protocol keymap）：
${cliKeymapText()}
${PRINT_USAGE}
`

function baseUrlOf(argv: readonly string[]): string {
  const i = argv.indexOf('--api')
  if (i !== -1) {
    const v = argv[i + 1]
    if (v !== undefined && v !== '') return v.replace(/\/+$/, '')
  }
  return (process.env.SPARK_API ?? 'http://127.0.0.1:4318').replace(/\/+$/, '')
}

const argv = process.argv.slice(2)
if (argv.includes('-h') || argv.includes('--help')) {
  process.stdout.write(USAGE)
  process.exit(0)
}

// 一次性模式（工单 12.3）：spark -p "prompt"——进程内跑完即出，不进 TUI
{
  let parsed
  try {
    parsed = parsePrintArgs(argv)
  } catch (err) {
    process.stderr.write(`spark: ${err instanceof Error ? err.message : String(err)}
`)
    process.exit(1)
  }
  if (parsed !== null) {
    const { exitCode } = await runPrint(parsed)
    process.exit(exitCode)
  }
}

// exitOnCtrlC:false——双击 Ctrl+C 退出由 App 层接管（在途 turn 先中断，工单 8.4）
if (argv[0] === 'up') {
  const rest = argv.slice(1)
  const handle = await startUp()
  const baseUrl = rest.includes('--api') ? baseUrlOf(rest) : handle.baseUrl
  const instance = render(<App baseUrl={baseUrl} />, { exitOnCtrlC: false })
  // TUI 退出（含双击 Ctrl+C 正常路径）→ 回收本命令拉起的 server 子进程
  void instance.waitUntilExit().then(() => handle.stop())
} else {
  render(<App baseUrl={baseUrlOf(argv)} />, { exitOnCtrlC: false })
}
