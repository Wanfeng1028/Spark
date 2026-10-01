/**
 * spark -p 一次性模式（阶段十二工单 12.3；工单 14.4 改走 SDK 进程内通道）：
 * 宿主侧装配 Engine（不起 server、不经 HTTP），**会话/发消息/事件订阅均经
 * `@spark/sdk/inprocess` 的同一份 Transport 合同**（与 web、cli TUI、外部脚本同一条路径，
 * 消掉原本直连 Engine 的重复装配）；createSession → send → 等 turn.completed →
 * stdout 输出后优雅 shutdown。审批挂起超时走引擎 fail-closed 缺省判 deny 并如实进输出。
 * 退出码：0 = finish 正常；1 = error/异常；2 = --output-schema 校验不过（CK-14）。
 * 输出：--output-format json = 全 durable 事件数组（jq 可解析）；缺省 text = 最终
 * assistant 文本（无则提示行）。--output-schema <file> = 最终文本按 JSON Schema
 * 校验（Codex 同思路）：合格输出 JSON 值、不合格 stderr 说明 + exit 2。
 * --resume-last（CK-14）：免记 session id——把 prompt 续跑进 ~/.spark 最近一个
 * 会话（root 随之用真实家目录，不再用临时 root；显式 flag 即用户对落点的知情选择）。
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { SparkEventEnvelope } from '@spark/protocol'
import { Engine, Logger, loadConfig, sparkHome, type EngineConfig, type LlmGateway } from '@spark/engine'
import { createInProcessClient } from '@spark/sdk/inprocess'

export const PRINT_USAGE = `

一次性模式（headless 脚本面——不进 TUI、跑完即出）：
  spark -p "<prompt>"            进程内跑一轮并输出结果后退出
  --output-format <text|json>    输出格式（缺省 text=最终 assistant 文本；
                                 json=全 durable 事件数组，可被 jq 解析）
  --output-schema <file>         最终文本按 JSON Schema 文件校验（CK-14；合格输出
                                 格式化 JSON，不合格 stderr 说明 + exit 2）
  --resume-last                  免记 session id——续跑 ~/.spark 最近一个会话
                                 （CK-14；root 用真实家目录而非临时目录）
  --cwd <dir>                    工作区（缺省当前目录；会话数据落临时 root 不污染）
`

export interface PrintOptions {
  prompt: string
  outputFormat: 'text' | 'json'
  cwd: string
  /** CK-14：JSON Schema 文件路径（最终文本按其校验） */
  outputSchemaPath?: string
  /** CK-14：续跑 ~/.spark 最近一个会话（root 用真实家目录） */
  resumeLast?: boolean
  /** 模型配置注入（测试用；缺省 loadConfig()——用户 ~/.spark） */
  config?: EngineConfig
  /** 网关注入（测试用 ScriptedLlm；缺省 PiGateway 兜底 fallback） */
  gateway?: LlmGateway
  /** root 注入（测试用；缺省 temp root / resumeLast 时 sparkHome） */
  root?: string
}

export interface PrintOutcome {
  exitCode: number
}

/** 提取最终 assistant 文本（text / --output-schema 两条路径共用） */
function finalTextOf(events: readonly SparkEventEnvelope[], sessionId: string): string {
  const texts: string[] = []
  for (const e of events) {
    if (e.sessionId !== sessionId || e.type !== 'assistant.message') continue
    const blocks = (e.data as { content: Array<{ type: string; text?: string }> }).content
    for (const b of blocks) {
      if (b.type === 'text' && typeof b.text === 'string' && b.text !== '') texts.push(b.text)
    }
  }
  return texts.join('\n')
}

export async function runPrint(opts: PrintOptions): Promise<PrintOutcome> {
  // --resume-last 用真实家目录（最近会话在那里）；否则临时 root（不污染 ~/.spark）
  const tempRoot = opts.resumeLast || opts.root !== undefined ? null : mkdtempSync(join(tmpdir(), 'spark-print-'))
  const root = opts.root ?? tempRoot ?? sparkHome()
  let engine: Engine | null = null
  try {
    engine = new Engine({
      root,
      config: opts.config ?? loadConfig(),
      logger: new Logger({ root, stdout: false }),
      ...(opts.gateway !== undefined ? { gateway: opts.gateway } : {}),
    })
    // 工单 14.4：改走 SDK 的进程内通道——订阅/建会话/发消息都经同一份 Transport 合同，
    // 不再直连 Engine 门面（消重）。引擎仍由本模块构造与 shutdown：CLI 就是宿主，
    // 引擎生命周期属宿主（ADR D30/D31；client.close() 只退订、不关引擎）。
    const client = createInProcessClient(engine)
    const events: SparkEventEnvelope[] = []
    client.events.subscribe((e) => {
      events.push(e)
    })
    await engine.ready()

    // CK-14：resume-last = 最近一个未归档会话（createdAt 降序取首）；无会话如实报错
    let sessionId: string
    if (opts.resumeLast === true) {
      const sessions = await client.sessions.list()
      const last = [...sessions].sort((a, b) => b.createdAt - a.createdAt)[0]
      if (last === undefined) {
        throw new Error('E_PRINT_RESUME_EMPTY: ~/.spark 中没有可续跑的会话（--resume-last 需要至少一个既有会话）')
      }
      sessionId = last.id
    } else {
      const created = await client.sessions.create({ cwd: opts.cwd })
      sessionId = created.id
    }
    void client.sessions.send(sessionId, opts.prompt, { delivery: 'now' })
    // 等 turn.completed（审批挂起超时由引擎 fail-closed 判 deny 并落 error 事件——如实输出）
    const finish = await new Promise<'stop' | 'error' | 'aborted'>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('E_PRINT_TIMEOUT: 等待 turn 完成超时（10 分钟）')),
        600_000,
      )
      const off = client.events.subscribe((e) => {
        if (e.sessionId !== sessionId) return
        if (e.type === 'turn.completed') {
          clearTimeout(timer)
          off()
          resolve((e.data as { finish: 'stop' | 'error' | 'aborted' }).finish)
        }
      })
    })

    if (opts.outputFormat === 'json') {
      process.stdout.write(`${JSON.stringify(events, null, 2)}\n`)
    } else if (opts.outputSchemaPath !== undefined) {
      // CK-14：--output-schema——最终文本必须是符合 schema 的 JSON（Codex 同思路）
      const text = finalTextOf(events, sessionId)
      let schema: z.ZodType
      try {
        schema = z.fromJSONSchema(JSON.parse(readFileSync(opts.outputSchemaPath, 'utf8')))
      } catch (err) {
        throw new Error(
          `E_OUTPUT_SCHEMA: schema 文件不可读或非法 JSON Schema（${opts.outputSchemaPath}）：${err instanceof Error ? err.message : String(err)}`,
        )
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        process.stderr.write(
          `E_OUTPUT_SCHEMA: 最终输出不是合法 JSON——请让模型直接输出 JSON（--output-schema 生效时不要附加说明文字）\n`,
        )
        client.close()
        await engine.shutdown()
        return { exitCode: 2 }
      }
      const check = schema.safeParse(parsed)
      if (!check.success) {
        process.stderr.write(`E_OUTPUT_SCHEMA: 输出未通过 schema 校验：${check.error.message}\n`)
        client.close()
        await engine.shutdown()
        return { exitCode: 2 }
      }
      process.stdout.write(`${JSON.stringify(check.data, null, 2)}\n`)
    } else {
      const text = finalTextOf(events, sessionId)
      process.stdout.write(text !== '' ? `${text}\n` : '(无文本输出)\n')
    }
    client.close()
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
    if (tempRoot !== null) rmSync(tempRoot, { recursive: true, force: true })
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
  // CK-14：--output-schema <file> / --resume-last（布尔旗标）
  let outputSchemaPath: string | undefined
  const sIndex = argv.indexOf('--output-schema')
  if (sIndex !== -1) {
    const v = argv[sIndex + 1]
    if (v === undefined || v === '' || v.startsWith('--')) {
      throw new Error('E_USAGE: --output-schema 需要跟 schema 文件路径')
    }
    outputSchemaPath = v
  }
  const resumeLast = argv.includes('--resume-last')
  // WO-040：未知 flag 一律 E_USAGE——静默丢弃会让用户以为参数生效（如把 --project
  // 当 --cwd 用，一次性模式跑错工作区还无提示）
  const KNOWN = new Set([
    '-p',
    '--print',
    '--output-format',
    '--cwd',
    '--output-schema',
    '--resume-last',
  ])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a !== undefined && a.startsWith('--') && !KNOWN.has(a)) {
      throw new Error(
        `E_USAGE: 未知参数 ${a}（一次性模式只支持 -p/--print、--output-format、--output-schema、--resume-last、--cwd）`,
      )
    }
  }
  return {
    prompt,
    outputFormat,
    cwd,
    ...(outputSchemaPath !== undefined ? { outputSchemaPath } : {}),
    ...(resumeLast ? { resumeLast: true } : {}),
  }
}
