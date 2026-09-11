/**
 * 内置工具注册（doc/02 §5.6.3）：read/write/edit/bash。
 * ToolDefinition 六要素齐全；错误码见 §5.10 注册表。
 * bash 按配置构造（工单 5.2：sandbox 开关，ADR D15）。
 */
import type { ToolRegistry } from '../registry.js'
import type { BashSandboxMode } from '../sandbox.js'
import { readTool } from './read.js'
import { grepTool } from './grep.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { makeBashTool, bashTool } from './bash.js'
import type { BashToolOptions } from './bash.js'
import { makeTaskTool } from './task.js'
import type { TaskInput, TaskRunner } from './task.js'
import { exitPlanModeTool } from './exit-plan-mode.js'
import { lspTool } from './lsp.js'

export { readTool, grepTool, writeTool, editTool, makeBashTool, bashTool, makeTaskTool, exitPlanModeTool }
export type { BashToolOptions, TaskInput, TaskRunner }

export interface BuiltinToolsOptions {
  /** bash 沙箱开关（spark.json engine.bashSandbox；缺省 off = 现行为） */
  bashSandbox?: BashSandboxMode
}

export function registerBuiltinTools(registry: ToolRegistry, opts: BuiltinToolsOptions = {}): void {
  registry.register(readTool)
  registry.register(grepTool)
  registry.register(writeTool)
  registry.register(editTool)
  registry.register(makeBashTool({ sandbox: opts.bashSandbox ?? 'off' }))
  // 工单 16.3：计划模式退出工具（非计划模式不进广告面——engine 侧 hiddenTools getter 控）
  registry.register(exitPlanModeTool)
  // 工单 16.9：lsp 工具恒广告（browser 工具族同判例——未配置时执行期 E_LSP_UNCONFIGURED
  // fail-closed，缺配置不是静默降级的理由；连接管理经 ToolContext.lsp 注入）
  registry.register(lspTool)
}
