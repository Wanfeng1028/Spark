/**
 * 事实数字（FactBar 数据源，禁 mock 数字——DESIGN §12.5 假仪表盘）。
 * **手工抄自源码实数**：check_doc_links.py 检查 7（LA-51）把 eventTypes/builtinCommands
 * 与源码实数（EventSchemas 顶层键数 / BUILTIN_COMMANDS 条目数）对照，不符即 CI 红；
 * 「NN 个方法」类表述同闸（LA-50/51）——原"没有任何自动门"的注记作废。
 * eventTypes：`packages/protocol/src/events.ts` EventSchemas 键数（权威断言
 *   packages/protocol/tests/events.test.ts:133 = 27）。
 * builtinCommands：`packages/protocol/src/commands.ts` BUILTIN_COMMANDS 条目数（权威断言
 *   packages/protocol/tests/commands.test.ts:49 = 28；19.2 /computer 与 19.23 /settings 等
 *   逐单加进来之后从 23 涨到现在）。
 * endpoints：web / desktop / cli / mobile（含小程序），见根 README「四端一览」。
 * license：根 LICENSE（MIT）。
 */
export const FACTS = {
  eventTypes: 27,
  builtinCommands: 28,
  endpoints: 4,
  license: "MIT",
} as const;

/**
 * 外部链接。只放确实存在的地址——文档站（apps/docs，VitePress）尚未公网部署，
 * 因此指向仓库内目录而不是编一个域名。
 */
export const LINKS = {
  github: "https://github.com/Wanfeng1028/Spark",
  docs: "https://github.com/Wanfeng1028/Spark/tree/main/apps/docs",
} as const;

/** 导航项（Docs 是外链，Header 用 isExternal 判定后走 <a target="_blank">） */
export const NAV_ITEMS = [
  { label: "Features", href: "/features" },
  { label: "Architecture", href: "/architecture" },
  { label: "Quickstart", href: "/quickstart" },
  { label: "Docs", href: LINKS.docs },
] as const;
