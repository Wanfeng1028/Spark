/**
 * 内置四工具注册（doc/02 §5.6.3）：read/write/edit/bash。
 * ToolDefinition 六要素齐全；错误码见 §5.10 注册表。
 */
import type { ToolRegistry } from '../registry.js'
import { readTool } from './read.js'
import { writeTool } from './write.js'
import { editTool } from './edit.js'
import { bashTool } from './bash.js'

export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.register(readTool)
  registry.register(writeTool)
  registry.register(editTool)
  registry.register(bashTool)
}
