/**
 * 工具定义（doc/02 §5.6.1）：ToolDefinition 六要素——name/description/inputSchema/
 * permission/parallelizable/execute。内置工具在 builtin/，管线在 pipeline.ts。
 */
import { isAbsolute, relative, resolve, dirname, basename } from 'node:path'
import { realpathSync } from 'node:fs'
import type { z } from 'zod'
import type { CallId, EventId, SessionId, TurnId } from '@spark/protocol'
import type { MemoryStore } from '../memory/store.js'
import type { LspExecutor } from '../lsp/manager.js'

export interface ToolContext {
  sessionId: SessionId
  turnId: TurnId
  callId: CallId
  /** 本次调用 tool.started 事件 id（工单 7.8：Task 子代理锚定树视图用；其余工具忽略） */
  sourceEventId?: EventId
  /** interrupt 级联（§5.6.2 ③：已启动的工具跑到静默，工具自行响应 abort） */
  signal: AbortSignal
  /** 引擎 200ms 节流后 emitLive tool.progress（门控队列保证不晚于 completed） */
  onProgress: (chunk: string) => void
  cwd: string
  /**
   * 输出收集上限字节数（AUD-02；管线按 spark.json toolOutputLimitKB 注入）：
   * 流式产出的工具（bash）执行期据此限流收集缓冲——超限停收并标记截断；
   * 管线的 outputs.bound() 仍是最终限界（本值是其 4 倍缓冲语义）。
   * 缺省未注入时工具用内置保守上限。
   */
  outputLimitBytes?: number
  /** 长期记忆仓（工单 7.5 / ADR D25）：memory 工具族使用，其余工具忽略 */
  memory?: MemoryStore
  /**
   * 退出计划模式钩子（工单 16.3）：`exit_plan_mode` 专用，其余工具忽略。
   * 由引擎装配 run-loop 时注入（**工具不持有 Engine**——保持工具可单测、依赖面最小，
   * 与 `memory?` 同一手法）。缺省未注入时工具如实报 E_UNSUPPORTED，不假装已切模式。
   */
  exitPlanMode?: () => Promise<void>
  /**
   * LSP 连接管理（工单 16.9）：`lsp` 工具专用，其余工具忽略。由引擎装配管线时注入
   * （**工具不持有 Engine**——与 `memory?`/`exitPlanMode?` 同一手法）。缺省未注入时
   * 工具如实报 E_LSP_UNAVAILABLE，不假装可查。
   */
  lsp?: LspExecutor
  /** 时间源（memory.save 记 created_at；缺省 Date.now） */
  now?: () => number
}

export interface ToolOutput {
  output: unknown
  isError: boolean
}

export interface ToolDefinition<I = unknown> {
  /** 'read' | 'write' | 'edit' | 'bash' */
  name: string
  /** 给模型的说明（含使用纪律，§5.11） */
  description: string
  inputSchema: z.ZodType<I>
  permission: {
    action: string
    /** 方法签名（双变）：ToolDefinition<具体输入> 可注册进 ToolDefinition<unknown> 表 */
    resourceOf(input: I, ctx: { cwd: string }): string
    /** 复合操作的多 pattern 清单（§5.7 补强 1，工单 4.7）：≥2 段才返回（单段走 resource） */
    patternsOf?(input: I, ctx: { cwd: string }): string[] | undefined
    /** always 固化范围（补强 3）：缺省由服务端回落 patterns ?? [resource] */
    alwaysPatternsOf?(input: I, ctx: { cwd: string }): string[] | undefined
  }
  /** read=true；bash/edit/write=false（串行 barrier） */
  parallelizable: boolean
  /**
   * 执行边界（工单 16.3 第三批；qwen-code 把 enter/exit_plan_mode 当边界的同款语义）：
   * 本工具**成功**执行后，同一 step 剩下的调用一律跳过并如实回 E_MODE_BOUNDARY——
   * 模式/档位已变，同批其余调用是在旧模式的假设下拟定的，留待下一轮模型观察新模式再发。
   * 失败（含审批拒绝）不算边界：什么都没变，后续调用照原路径执行。
   */
  executionBoundary?: boolean
  execute(ctx: ToolContext, input: I): Promise<ToolOutput>
}

/**
 * 路径硬边界（§1.4/§5.6.3）：允许根 = cwd（v1 无 addDir）。
 * AUD-04：在 **realpath（真实路径）** 上做边界判定——词法 resolve/relative 可被
 * 工作区内指向根外的符号链接绕过（read/grep/lsp/write 均会跟随 symlink）；目标
 * 不存在（写类建新文件）时解析最深的现存祖先再拼余段。extensions/loader 的
 * realpath 逃逸检查同手法。Windows 下大小写不敏感语义由 realpath 的实际大小写
 * 归一保底（两侧同源，不再依赖调用方传入 casing）。越出允许根 → E_PATH_OUTSIDE
 * （先于审批兜底）。返回值保持"root 下的词法路径"（调用方读写用它；真实路径已校验）。
 */

/** realpath 结果缓存（仅缓存允许根——进程生命周期内 cwd 目录身份稳定；目标路径不缓存，建新文件须现解析） */
const rootRealpathCache = new Map<string, string>()

function cachedRootRealpath(root: string): string {
  const hit = rootRealpathCache.get(root)
  if (hit !== undefined) return hit
  const real = realpathSync(root)
  rootRealpathCache.set(root, real)
  return real
}

/** 目标的真实路径：存在即 realpath；不存在（ENOENT 等）向上找最深的现存祖先，余段词法拼接 */
function deepestRealpath(abs: string): string {
  try {
    return realpathSync(abs)
  } catch {
    const parent = dirname(abs)
    if (parent === abs) return abs // 已到文件系统根：原样返回（relative 判定兜底）
    return resolve(deepestRealpath(parent), basename(abs))
  }
}

export function resolveInRoot(root: string, target: string): string {
  const realRoot = cachedRootRealpath(root)
  const abs = resolve(root, target)
  const real = deepestRealpath(abs)
  const rel = relative(realRoot, real)
  const outside = rel === '' ? false : rel.startsWith('..') || isAbsolute(rel)
  if (outside) {
    throw new Error(`E_PATH_OUTSIDE: 路径 ${target} 越出允许根 ${root}`)
  }
  return abs
}
