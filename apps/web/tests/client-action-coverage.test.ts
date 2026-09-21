/**
 * 命令面板入口覆盖（阶段十九 19.21 第一批）：web 端 18 个 client 命令的映射覆盖。
 * /help 刻意不映射（web 无帮助面板）——**未实现端不渲染**是本仓库既定纪律
 * （client-commands.ts 头注），命令面板过滤掉它，禁假状态。
 */
import { describe, expect, test } from 'vitest'
import { BUILTIN_COMMANDS, ClientActionSchema } from '@spark/protocol'
import { CLIENT_ACTIONS } from '@/features/chat/client-commands'

describe('web client 命令映射覆盖（阶段十九 19.21）', () => {
  test('surface 含 web 的 client 命令：17/18 有映射，/help 如实缺席', () => {
    const webClient = BUILTIN_COMMANDS.filter(
      (c) => c.kind === 'client' && c.surface.includes('web') && c.clientAction !== undefined,
    )
    expect(webClient).toHaveLength(18)
    const mapped = webClient.filter((c) => CLIENT_ACTIONS[c.clientAction!] !== undefined)
    expect(mapped).toHaveLength(17)
    const missing = webClient.filter((c) => CLIENT_ACTIONS[c.clientAction!] === undefined)
    expect(missing.map((c) => c.name)).toEqual(['help'])
  })

  test('19.21 补的 7 项映射形状正确', () => {
    expect(CLIENT_ACTIONS['new']).toEqual({ kind: 'new-session' })
    expect(CLIENT_ACTIONS['stats']).toEqual({ kind: 'navigate', path: '/settings/usage' })
    expect(CLIENT_ACTIONS['checkpoint']).toEqual({ kind: 'open-dialog', dialog: 'checkpoint' })
    expect(CLIENT_ACTIONS['tree']).toEqual({ kind: 'open-dialog', dialog: 'tree' })
    expect(CLIENT_ACTIONS['effort']).toEqual({ kind: 'cycle-effort' })
    expect(CLIENT_ACTIONS['fork']).toEqual({ kind: 'fork-last' })
    expect(CLIENT_ACTIONS['rollback']).toEqual({ kind: 'rollback-last' })
  })

  test('映射键都在 ClientAction 封闭枚举内（编译期已强制，运行期复核）', () => {
    for (const key of Object.keys(CLIENT_ACTIONS)) {
      expect(ClientActionSchema.options).toContain(key)
    }
  })
})
