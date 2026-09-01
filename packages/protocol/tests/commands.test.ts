/**
 * 命令描述符不变量单测（工单 10.18③）：词表单一来源的回归网——
 * 名字唯一 / 描述符过 schema / client 命令必带 clientAction / 带参命令必有 args /
 * surface 非空。各端"该端 surface 的 client 命令都有实现映射"的覆盖不变量
 * 由各端自己的测试断言（web: tests/client-commands 覆盖；cli: tests/client-actions 覆盖）。
 */
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_COMMANDS,
  CommandDescriptorSchema,
  type CommandDescriptor,
} from '../src/commands'

describe('BUILTIN_COMMANDS 不变量（工单 10.18③）', () => {
  it('名字唯一（词表单一来源，重名即分派歧义）', () => {
    const names = BUILTIN_COMMANDS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每条描述符过 CommandDescriptorSchema', () => {
    for (const c of BUILTIN_COMMANDS) {
      expect(CommandDescriptorSchema.safeParse(c).success).toBe(true)
    }
  })

  it('client 命令必带 clientAction；action/prompt 不带', () => {
    for (const c of BUILTIN_COMMANDS) {
      if (c.kind === 'client') {
        expect(c.clientAction).toBeDefined()
      } else {
        expect(c.clientAction).toBeUndefined()
      }
    }
  })

  it('带参命令必有 args（placeholder+hint）', () => {
    for (const c of BUILTIN_COMMANDS) {
      if (c.args !== undefined) {
        expect(c.args.placeholder).not.toBe('')
        expect(c.args.hint).not.toBe('')
      }
    }
  })

  it('surface 至少一端；v1 基线数量与 10.18a 判决表一致（14 条）', () => {
    for (const c of BUILTIN_COMMANDS) {
      expect(c.surface.length).toBeGreaterThanOrEqual(1)
    }
    expect(BUILTIN_COMMANDS).toHaveLength(14)
  })

  it('clientAction 与命令名封闭映射（分派表键空间）', () => {
    const actions = new Set(
      BUILTIN_COMMANDS.filter((c): c is CommandDescriptor & { clientAction: string } =>
        c.clientAction !== undefined,
      ).map((c) => c.clientAction),
    )
    // 每个 client 命令的动作键不重复（一命令一动作）
    expect(actions.size).toBe(BUILTIN_COMMANDS.filter((c) => c.kind === 'client').length)
  })
})
