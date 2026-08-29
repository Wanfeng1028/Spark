/**
 * CLI 入口（工单 8.2）：--api <baseUrl> / SPARK_API 环境变量；
 * 缺省 http://127.0.0.1:4318（server §7.1 缺省端口，本地刻意不暴露公网）。
 * 冷启预算 <1s（doc/06 L4）：模块装载后直接渲染，无加载占位屏。
 */
import { render } from 'ink'
import { cliKeymapText } from '@spark/protocol'
import { App } from './app.js'

const USAGE = `Spark CLI（Ink TUI）

用法：
  spark-cli [--api <baseUrl>]

参数：
  --api <url>   API 基址（或 SPARK_API 环境变量；缺省 http://127.0.0.1:4318）
  -h, --help    显示本帮助

键位（单一来源 @spark/protocol keymap）：
${cliKeymapText()}
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

// exitOnCtrlC:false——双击 Ctrl+C 退出由 App 层接管（在途 turn 先中断，工单 8.4）
render(<App baseUrl={baseUrlOf(argv)} />, { exitOnCtrlC: false })
