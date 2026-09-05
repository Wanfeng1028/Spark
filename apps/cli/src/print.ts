/**
 * spark -p 一次性模式（阶段十二工单 12.3；doc/08 §12.3）：
 * 进程内装配 Engine（eval real 同款——不经 HTTP、不起 server），createSession →
 * send → 等 turn.completed → stdout 输出后优雅 shutdown。审批挂起超时走引擎
 * fail-closed 缺省拒绝并如实进输出。退出码：0 = finish 正常；1 = error/异常。
 * 输出：--output-format json = 全 durable 事件数组（jq 可解析）；缺省 text = 最终
 * assistant 文本（无则提示行）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SparkEventEnvelope } from '@spark/protocol'
import { Engine, Logger, loadConfig, type EngineConfig, type LlmGateway } from '@spark/engine'

export const PRINT_USAGE = `

一次性模式（headless 脚本面——不进 TUI、跑完即出）：
  spark -p "<prompt>"            进程内跑一轮并输出结果后退出
  --output-format <text|json>    输出格式（缺省 text=最终 assistant 文本；
                                 json=全 durable 事件数组，可被 jq 解析）
  --cwd <dir>                    工作区（缺省当前目录；会话数据落临时 root 不污染）
`

export interface PrintOptions {
  prompt: string
  outputFormat: 'text' | 'json'
  cwd: string
  /** 模型配置注入（测试用；缺省 loadConfig()——用户 ~/.spark） */
  config?: EngineConfig
  /** 网关注入（测试用 ScriptedLlm；缺省 PiGateway 兜底 fallback） */
  gateway?: LlmGateway
}

export interface PrintOutcome {
  exitCode: number
}

export async function runPrint(opts: PrintOptions): Promise<PrintOutcome> {
  const root = mkdtempSync(join(tmpdir(), 'spark-print-'))
  let engine: Engine | null = null
  try {
    engine = new Engine({
      root,
      config: opts.config ?? loadConfig(),
      logger: new Logger({ root, stdout: false }),
      ...(opts.gateway !== undefined ? { gateway: opts.gateway } : {}),
    })
    const events: SparkEventEnvelope[] = []
    engine.subscribe((e) => {
      events.push(e)
    })
    await engine.ready()
    const handle = await engine.createSession({ cwd: opts.cwd })
    void handle.send(opts.prompt, 'now')
    // 等 turn.completed（审批挂起超时由引擎 fail-closed 拒绝并落 error 事件——如实输出）
    const current = engine
    if (current === null) throw new Error('E_INTERNAL: 引擎未装配')
    const finish = await new Promise<'stop' | 'error' | 'aborted'>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('E_PRINT_TIMEOUT: 等待 turn 完成超时（10 分钟）')),
        600_000,
      )
      const un = current.subscribe((e: SparkEventEnvelope) => {
        if (e.sessionId !== handle.id) return
        if (e.type === 'turn.completed') {
          clearTimeout(timer)
          un.unsubscribe()
          resolve((e.data as { finish: 'stop' | 'error' | 'aborted' }).finish)
        }
      })
    })

    if (opts.outputFormat === 'json') {
      process.stdout.write(`${JSON.stringify(events, null, 2)}\n`)
    } else {
      const texts: string[] = []
      for (const e of events) {
        if (e.sessionId !== handle.id || e.type !== 'assistant.message') continue
        const blocks = (e.data as { content: Array<{ type: string; text?: string }> }).content
        for (const b of blocks) {
          if (b.type === 'text' && typeof b.text === 'string' && b.text !== '') texts.push(b.text)
        }
      }
      process.stdout.write(texts.length > 0 ? `${texts.join('\n')}\n` : '(无文本输出)\n')
    }
    await engine.shutdown()
    return { exitCode: finish === 'stop' ? 0 : 1 }
  } catch (err) {
    process.stderr.write(`spark -p: ${err instanceof Error ? err.message : String(err)}\n`)
    if (engine !== null) {
      try {
        await engine.shutdown()
      } catch {
        // 已失败的引擎关闭异常不影响退出码
      }
    }
    return { exitCode: 1 }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/** -p 模式参数解析：命中返回解析结果；未命中返回 null（走 TUI 路径） */
export function parsePrintArgs(argv: readonly string[]): PrintOptions | null {
  const pIndex = argv.indexOf('-p')
  const pLong = argv.indexOf('--print')
  const flagIndex = pIndex !== -1 ? pIndex : pLong
  if (flagIndex === -1) return null
  const prompt = argv[flagIndex + 1]
  if (prompt === undefined || prompt === '' || prompt.startsWith('--')) {
    throw new Error('E_USAGE: -p/--print 需要跟 prompt 文本')
  }
  let outputFormat: 'text' | 'json' = 'text'
  const fIndex = argv.indexOf('--output-format')
  if (fIndex !== -1) {
    const v = argv[fIndex + 1]
    if (v !== 'text' && v !== 'json') {
      throw new Error('E_USAGE: --output-format 只接受 text|json')
    }
    outputFormat = v
  }
  let cwd = process.cwd()
  const cIndex = argv.indexOf('--cwd')
  if (cIndex !== -1) {
    const v = argv[cIndex + 1]
    if (v !== undefined && v !== '') cwd = v
  }
  return { prompt, outputFormat, cwd }
}
