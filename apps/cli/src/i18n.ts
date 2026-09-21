/**
 * CLI 文案翻译入口（工单 19.25 消费 19.17 框架）：语言取服务端 `settings.ui.language`
 * 单源（boot 装载 + /settings 改档后随重读刷新），不在端上猜系统语言（四端口径一致）。
 * 缺键回落中文是 protocol translate 的既定语义（19.17 分批迁移纪律）——面板标题与
 * 长尾提示随后续批次接入，本模块只承载已接入的键。
 */
import { translate } from '@spark/protocol'
import { useCliStore } from './store.js'

export function cliT(key: string, vars?: Record<string, string | number>): string {
  return translate(useCliStore.getState().language, key, vars)
}
