/**
 * client 命令 CLI 端覆盖不变量单测（工单 10.25 / 10.18③ 残项收口）：
 * ① createCliActionHandlers 返回的 Record 键穷尽 ClientAction 枚举（编译期已强制，
 *   运行期复核防 schema options 扩容后映射漂移）；
 * ② BUILTIN_COMMANDS 中 surface 含 cli 的 client 命令，clientAction 必有本端实现——
 *   防 "/model 在 CLI 坏掉" 复发（10.18 教训：菜单列出 client 命令但端无实现面板）。
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_COMMANDS, ClientActionSchema } from '@spark/protocol'
import { createCliActionHandlers } from '../src/client-actions.js'
import type { useCliStore } from '../src/store.js'

/** 测试只取映射键，从不调用 handler——getState 给最小桩即可 */
const stubGetState = (() => ({
  activeSessionId: null,
  setPanel: () => {},
  setNotice: () => {},
})) as unknown as typeof useCliStore.getState

function handlersOf() {
  return createCliActionHandlers({
    getState: stubGetState,
    newSession: () => {},
    forkAtLast: () => {},
    rollbackTo: () => {},
    setEffort: () => {},
  })
}

describe('client 命令 CLI 端覆盖不变量（工单 10.25 / 10.18③）', () => {
  it('映射键穷尽 ClientAction 枚举（编译期 Record 强制的运行期复核）', () => {
    expect(Object.keys(handlersOf()).sort()).toEqual([...ClientActionSchema.options].sort())
  })

  it('surface 含 cli 的 client 命令，clientAction 在本端都有实现映射', () => {
    const handlers = handlersOf()
    for (const c of BUILTIN_COMMANDS) {
      if (c.kind !== 'client' || !c.surface.includes('cli')) continue
      expect(c.clientAction, `/${c.name} 缺 clientAction`).toBeDefined()
      if (c.clientAction === undefined) continue
      expect(
        handlers[c.clientAction],
        `/${c.name} 的 clientAction "${c.clientAction}" 在 CLI 端未实现`,
      ).toBeTypeOf('function')
    }
  })
})
