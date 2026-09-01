/**
 * CLI 端 clientAction 分派映射（工单 10.18② 落位 / 工单 10.25 回归网）：
 * 按描述符 clientAction 映射到本端实现。Record 键穷举 ClientAction 由 TS 编译期
 * 强制（协议枚举扩容时缺键即 typecheck 红）；运行期回归网 = tests/client-actions.test.ts
 * （10.18③ 不变量：surface 含 cli 的 client 命令必有本端实现映射）。
 */
import type { ClientAction } from '@spark/protocol'
import type { useCliStore } from './store.js'

/** 分派依赖：store 取态器 + 组件侧动作（状态全部经 getState() 快照读写，无 hook 依赖） */
export interface CliActionDeps {
  getState: typeof useCliStore.getState
  newSession(): void
  forkAtLast(): void
  rollbackTo(args: string | undefined): void
  setEffort(args: string | undefined): void
}

export type CliActionHandler = (args: string | undefined) => void

export function createCliActionHandlers(deps: CliActionDeps): Record<ClientAction, CliActionHandler> {
  const st = deps.getState()
  const needSession = (fn: () => void): void => {
    if (st.activeSessionId === null) {
      st.setNotice('该命令需要激活会话')
      return
    }
    fn()
  }
  return {
    new: () => deps.newSession(),
    resume: () => st.setPanel('resume'),
    stats: () => st.setPanel('stats'),
    help: () => st.setPanel('help'),
    model: () => needSession(() => st.setPanel('model')),
    mcp: () => st.setPanel('mcp'),
    skills: () => st.setPanel('skills'),
    usage: () => st.setPanel('usage'),
    fork: () => needSession(() => deps.forkAtLast()),
    checkpoint: () => needSession(() => st.setPanel('checkpoints')),
    rollback: (args) => needSession(() => deps.rollbackTo(args)),
    effort: (args) => needSession(() => deps.setEffort(args)),
    tree: () => needSession(() => st.setPanel('tree')),
  }
}
