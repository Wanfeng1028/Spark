/**
 * 内置工具注册（doc/02 §5.6.3）：read/write/edit/bash。
 * ToolDefinition 六要素齐全；错误码见 §5.10 注册表。
 * bash 按配置构造（工单 5.2：sandbox 开关，ADR D15）。
 */
import type { ToolRegistry } from '../registry.js'
import type { BashSandboxMode } from '../sandbox.js'
import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { makeBashTool, bashTool } from './bash.js'
import type { BashToolOptions } from './bash.js'

export { readTool, writeTool, editTool, makeBashTool, bashTool }
export type { BashToolOptions }

export interface BuiltinToolsOptions {
  /** bash 沙箱开关（spark.json engine.bashSandbox；缺省 off = 现行为） */
  bashSandbox?: BashSandboxMode
}

export function registerBuiltinTools(registry: ToolRegistry, opts: BuiltinToolsOptions = {}): void {
  registry.register(readTool)
  registry.register(writeTool)
  registry.register(editTool)
  registry.register(makeBashTool({ sandbox: opts.bashSandbox ?? 'off' }))
}
