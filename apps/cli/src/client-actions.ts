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
  /** /voice（工单 16.6）：语音听写模式切换与录音启停（实现见 hooks/use-voice-cli.ts） */
  voice(args: string | undefined): void
  /** /agents（工单 16.2）：子代理面板（两层清单 + 停用标记，CLI 只读） */
  agents(): void
  /** /trust（工单 16.4）：文件夹信任面板（CLI 只读） */
  trust(): void
  /** /extensions（工单 16.5）：扩展面板（CLI 只读） */
  extensions(): void
  /** /lsp install <id>（阶段十九 19.5）：安装内置清单语言服务器（npm 全局装 + 写 lsp.json） */
  installLsp(id: string): void
  /** /rename <新标题>（阶段十九 19.20）：会话改名（PUT /api/sessions/:id/title） */
  renameSession(args: string | undefined): void
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
    // 会话改名（工单 19.20）：/rename 与 /title 同一 clientAction，标题走参数（无内联编辑器）
    rename: (args) => needSession(() => deps.renameSession(args)),
    tree: () => needSession(() => st.setPanel('tree')),
    // 语言服务器（工单 16.9 + 19.5）：无参开面板；install <id> 子命令触发安装（写 lsp.json）
    lsp: (args) => {
      const m = /^install\s+([A-Za-z0-9_-]+)$/.exec(args ?? '')
      if (m !== null && m[1] !== undefined) {
        deps.installLsp(m[1])
        return
      }
      st.setPanel('lsp')
    },
    agents: () => st.setPanel('agents'),
    trust: () => st.setPanel('trust'),
    extensions: () => st.setPanel('extensions'),
    // 电脑控制面板（阶段十九 19.2）：主开关状态 + 八操作档位只读（开关写入在 web 设置中心）
    computer: () => st.setPanel('computer'),
    // 沙箱与网络面板（阶段十九 19.7）：模式/清单/端口 + 代理运行状态只读（写入在 web 设置中心）
    sandbox: () => st.setPanel('sandbox'),
    // 设置面板（阶段十九 19.23）：可改子集表单（GET/PUT /api/settings + /api/routing）
    settings: () => st.setPanel('settings'),
    voice: (args) => needSession(() => deps.voice(args)),
  }
}
