/** 事实数字 — 来源：根 README.md（2026-09 当前值） */
export const FACTS = {
  eventTypes: 27,
  builtinCommands: 23,
  endpoints: 4,
  license: "MIT",
} as const;

/** 外部链接 */
export const LINKS = {
  github: "https://github.com/anthropics/spark",
  docs: "/docs",
  npm: "https://www.npmjs.com/package/@spark/cli",
} as const;

/** 导航项 */
export const NAV_ITEMS = [
  { label: "Features", href: "/features" },
  { label: "Architecture", href: "/architecture" },
  { label: "Quickstart", href: "/quickstart" },
  { label: "Docs", href: "https://spark.dev/docs" },
] as const;
