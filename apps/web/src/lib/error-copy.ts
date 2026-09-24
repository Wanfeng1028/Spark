/**
 * web 侧错误文案出口（单源仍在 `@spark/protocol`；本文件是 web 内 `@/lib/error-copy` 的导入面）。
 *
 * 为什么在这里持语言、而不是给调用点传 lang：web 有约 40 处 `errorMessageOf`，且都在**错误发生的
 * 那一刻**就把人话文案存进 state（`setOpError(...)` / `setError(...)`），渲染时已拿不到原始错误——
 * 想按语言渲染就得改成存原始消息再在渲染层翻译，那是远大于本批的重构。给 40 处各传一个 lang
 * 则是 19.17 工单明令禁止的"拆散"。语言是应用级状态而非组件级，故用模块单例：
 * **唯一写者** = I18nProvider（lang 变化时 `setUiLanguage`），**唯一读者** = 本文件两个包装。
 * 缺省 zh-CN，与 provider 挂载前的首帧一致（不闪英文）。
 */
import {
  ERROR_COPY,
  errorMessageOf as errorMessageOfForLang,
  humanizeError as humanizeErrorForLang,
  type ErrorCopy,
  type Language,
} from '@spark/protocol'

export { ERROR_COPY }

let lang: Language = 'zh-CN'

/** 界面语言同步入口——只该由 I18nProvider 调用 */
export function setUiLanguage(next: Language): void {
  lang = next
}

export function humanizeError(msg: string): ErrorCopy {
  return humanizeErrorForLang(msg, lang)
}

export function errorMessageOf(err: unknown): string {
  return errorMessageOfForLang(err, lang)
}
