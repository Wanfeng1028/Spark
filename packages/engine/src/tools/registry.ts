/**
 * 工具注册表（doc/02 §5.6.1）：register 重复名抛错；materialize 广告给模型的
 * 清单（zod v4 内置 toJSONSchema，无三方依赖）；resolve 供管线查找。
 * deny 工具不广告（§5.7 对照第 5 条）由 Pipeline 接 PermissionService 时过滤。
 */
import { z } from 'zod'
import type { ToolDefinition } from './definition.js'

export interface AdvertisedTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export class ToolRegistry {
  private readonly defs = new Map<string, ToolDefinition>()

  register(def: ToolDefinition): void {
    if (this.defs.has(def.name)) {
      throw new Error(`E_TOOL_DUPLICATE: 工具 ${def.name} 已注册`)
    }
    this.defs.set(def.name, def)
  }

  /** 广告清单：zod → JSON Schema（io 默认宽松，忽略不可描述类型） */
  materialize(): AdvertisedTool[] {
    return [...this.defs.values()].map((def) => ({
      name: def.name,
      description: def.description,
      parameters: z.toJSONSchema(def.inputSchema, { io: 'input' }) as Record<string, unknown>,
    }))
  }

  resolve(name: string): ToolDefinition | undefined {
    return this.defs.get(name)
  }

  get size(): number {
    return this.defs.size
  }
}
