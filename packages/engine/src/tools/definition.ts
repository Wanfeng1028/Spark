/**
 * 工具定义（doc/02 §5.6.1）：ToolDefinition 六要素——name/description/inputSchema/
 * permission/parallelizable/execute。内置工具在 builtin/，管线在 pipeline.ts。
 */
import { isAbsolute, relative, resolve } from 'node:path'
import type { z } from 'zod'
import type { CallId, EventId, SessionId, TurnId } from '@spark/protocol'
import type { MemoryStore } from '../memory/store.js'

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
  /** 长期记忆仓（工单 7.5 / ADR D25）：memory 工具族使用，其余工具忽略 */
  memory?: MemoryStore
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
  execute(ctx: ToolContext, input: I): Promise<ToolOutput>
}

/**
 * 路径硬边界（§1.4/§5.6.3）：允许根 = cwd（v1 无 addDir）。
 * resolve 归一后越出允许根 → E_PATH_OUTSIDE（先于审批兜底）。
 * Windows 下大小写不敏感比较（§5.6.3 跨平台规则）。
 */
export function resolveInRoot(root: string, target: string): string {
  const abs = resolve(root, target)
  const rel = relative(root, abs)
  const outside = rel === '' ? false : rel.startsWith('..') || isAbsolute(rel)
  if (outside) {
    throw new Error(`E_PATH_OUTSIDE: 路径 ${target} 越出允许根 ${root}`)
  }
  return abs
}
