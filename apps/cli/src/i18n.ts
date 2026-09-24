/**
 * CLI 文案翻译入口（工单 19.25 消费 19.17 框架）：语言取服务端 `settings.ui.language`
 * 单源（boot 装载 + /settings 改档后随重读刷新），不在端上猜系统语言（四端口径一致）。
 * 缺键回落中文是 protocol translate 的既定语义（19.17 分批迁移纪律）——面板标题与
 * 长尾提示随后续批次接入，本模块只承载已接入的键。
 */
import { errorMessageOf, translate } from '@spark/protocol'
import { useCliStore } from './store.js'

export function cliT(key: string, vars?: Record<string, string | number>): string {
  return translate(useCliStore.getState().language, key, vars)
}

/**
 * 错误文案的唯一收口（19.17 第三批；与 web `lib/error-copy.ts` 同形态）：读 store 当前语言。
 * 端内约 20 处调用点都在失败那刻就把人话串写进 notice/bootError，渲染时已拿不到原始错误，
 * 逐个传 lang 就是本工单明令禁止的"拆散"；改存原始错误则是远大于本批的重构。
 * 渲染点若已订阅语言（app.tsx 的 lastError 栏）就直接 `humanizeError(msg, language)`，
 * 不经本收口——那里有真实的响应式上下文，绕一层反而要额外把语言塞进 deps 才不漏更新。
 */
export function cliErrorMessageOf(err: unknown): string {
  return errorMessageOf(err, useCliStore.getState().language)
}
