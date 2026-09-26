/**
 * 官网 i18n 基础设施（19.47 批 2）。
 *
 * 路由方案：静态导出（output: "export"）无服务端，cookie/Accept-Language 协商
 * 不可用——采用目录树方案：`/`（中文，既有路由）+ `/en/`（英文路由树），
 * 每语言独立 URL 利 SEO；切换器按路径对跳（localePath）。
 *
 * 文案落点：**每个 section 组件自带 COPY = { zh, en } 文案对**（自包含，键不跨
 * 文件引用，漏译在该组件内类型可见）——官网文案按 section 天然分组，无四端
 * 共享需求，不建全局巨型字典（对齐 protocol i18n.ts 的显式键纪律在组件内生效）。
 */

export type Lang = "zh" | "en";

/** html lang 属性值（根 layout 全局 zh-CN；en 页靠 metadata alternates 补 hreflang，缺憾已登记） */
export const HTML_LANG: Record<Lang, string> = { zh: "zh-CN", en: "en" } as const;

/**
 * 语言切换的对跳路径：同一页面在另一语言下的 URL。
 * 中文根路径 `/features` ↔ 英文 `/en/features`；首页 `/` ↔ `/en`。
 */
export function localePath(target: Lang, currentPath: string): string {
  const path = currentPath.replace(/^\/en(?=\/|$)/, "") || "/";
  return target === "en" ? `/en${path === "/" ? "" : path}` : path;
}
