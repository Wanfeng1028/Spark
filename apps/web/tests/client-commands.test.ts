/**
 * client 命令覆盖不变量单测（工单 10.18③）：协议词表声明 surface 含 web 的
 * 每条 client 命令，其 clientAction 在 web 端都有实现映射——防 /model 在
 * web 坏掉复发的回归网（各端自证本端覆盖，协议层只保单一词表）。
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_COMMANDS } from '@spark/protocol'
import { CLIENT_ACTIONS, clientActionOf, isClientCommand } from '@/features/chat/client-commands'

describe('client 命令 web 端覆盖不变量（工单 10.18③）', () => {
  it('surface 含 web 的 client 命令，clientAction 在 CLIENT_ACTIONS 都有实现', () => {
    for (const c of BUILTIN_COMMANDS) {
      if (c.kind !== 'client' || !c.surface.includes('web')) continue
      expect(c.clientAction, `/${c.name} 缺 clientAction`).toBeDefined()
      expect(
        c.clientAction !== undefined ? CLIENT_ACTIONS[c.clientAction] : undefined,
        `/${c.name} 的 clientAction "${String(c.clientAction)}" 在 web 端未实现`,
      ).toBeDefined()
    }
  })

  it('clientActionOf：已实现命令命中；未实现/未知返 undefined', () => {
    expect(clientActionOf('model')).toEqual({ kind: 'navigate', path: '/settings/models' })
    expect(clientActionOf('resume')).toEqual({ kind: 'palette' })
    expect(clientActionOf('new')).toBeUndefined() // surface 无 web
    expect(clientActionOf('nope')).toBeUndefined()
  })

  it('isClientCommand：按注册表 kind 判定', () => {
    expect(isClientCommand('model', [...BUILTIN_COMMANDS])).toBe(true)
    expect(isClientCommand('compact', [...BUILTIN_COMMANDS])).toBe(false)
  })
})
