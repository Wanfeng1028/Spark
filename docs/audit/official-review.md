# Spark Official Website — Code Review Report

> **项目**: `official/` — Next.js 15 官网（独立项目，不在 pnpm workspace）
> **技术栈**: Next.js 15.3 + React 19.1 + Tailwind v4 + Motion 12 + next-themes
> **审查日期**: 2026-09-18
> **审查范围**: 配置文件、5 个页面路由、6 个 Section 组件、布局组件、UI/Magic UI/动画组件、lib 工具、CI 配置

---

## 目录

- [P0 — 阻断级问题](#p0--阻断级问题)
- [P1 — 高优先级问题](#p1--高优先级问题)
- [P2 — 改进建议](#p2--改进建议)
- [附录：正面实践总结](#附录正面实践总结)

---

## P0 — 阻断级问题

### P0-1. metadataBase 缺失导致 OG / canonical URL 全部失效

- **文件**: `src/app/layout.tsx`，第 7–29 行
- **严重程度**: P0
- **问题**: 根 `metadata` 未设置 `metadataBase`。Next.js 在生成绝对 URL（OG image、canonical、alternates）时需要此基址。当前 `openGraph` 和 `twitter` 配置中没有 `images` 字段，即使后续补上 `/og-image.png`，没有 `metadataBase` 也会输出相对路径，社交平台爬虫无法拉取。
- **修复建议**:
  ```ts
  export const metadata: Metadata = {
    metadataBase: new URL("https://spark.example.com"), // 替换为实际部署域名
    // ...
  };
  ```

### P0-2. OG / Twitter 卡片无实际图片

- **文件**: `src/app/layout.tsx`，第 17–28 行
- **严重程度**: P0
- **问题**: `twitter.card` 设为 `summary_large_image`，但 `openGraph` 和 `twitter` 均未配置 `images` 字段。代码注释（第 17 行）已标注 TODO，但 `public/og-image.svg` 实际存在且尺寸为 1200×630。社交平台（Twitter/WeChat/Discord）不解析 SVG，必须转成 PNG/JPG。当前状态下所有社交分享预览均为空白卡片。
- **修复建议**:
  1. 将 `og-image.svg` 转为 1200×630 PNG（可用 `sharp` 或在线工具）；
  2. 在 `openGraph.images` 和 `twitter.images` 中补上：
     ```ts
     openGraph: {
       // ...
       images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Spark" }],
     },
     twitter: {
       card: "summary_large_image",
       images: ["/og-image.png"],
     },
     ```

### P0-3. 页面标题双重追加 "— Spark"（title template 冲突）

- **文件**: `src/app/layout.tsx` 第 8–11 行；`src/app/features/page.tsx` 第 6 行；`src/app/architecture/page.tsx` 第 7 行；`src/app/quickstart/page.tsx` 第 17 行
- **严重程度**: P0
- **问题**: Layout 设置了 `title.template: "%s — Spark"`，但三个子页面的 `metadata.title` 已经写了 `"核心能力 — Spark"`、`"架构 — Spark"`、`"快速上手 — Spark"`。Next.js 会将子页面 title 填入 `%s`，最终渲染为：
  - `核心能力 — Spark — Spark`
  - `架构 — Spark — Spark`
  - `快速上手 — Spark — Spark`
- **修复建议**: 子页面 title 去掉 `— Spark` 后缀，只保留页面名：
  ```ts
  // features/page.tsx
  title: "核心能力",
  // architecture/page.tsx
  title: "架构",
  // quickstart/page.tsx
  title: "快速上手",
  ```

---

## P1 — 高优先级问题

### P1-1. 缺少 sitemap

- **文件**: `src/app/`（应新增 `src/app/sitemap.ts`）
- **严重程度**: P1
- **问题**: 项目有 5 条路由（`/`、`/features`、`/architecture`、`/quickstart`、`/not-found`），但没有 `sitemap.ts` 或 `public/sitemap.xml`。对于产品官网，sitemap 是 SEO 基础设施。
- **修复建议**: 新建 `src/app/sitemap.ts`：
  ```ts
  import type { MetadataRoute } from "next";

  export default function sitemap(): MetadataRoute.Sitemap {
    const base = "https://spark.example.com";
    return [
      { url: base, lastModified: new Date() },
      { url: `${base}/features`, lastModified: new Date() },
      { url: `${base}/architecture`, lastModified: new Date() },
      { url: `${base}/quickstart`, lastModified: new Date() },
    ];
  }
  ```
  > 注：`output: "export"` 静态导出下，sitemap.ts 会在 build 时生成 `sitemap.xml`。

### P1-2. 缺少 robots.txt / robots metadata

- **文件**: `src/app/layout.tsx`（metadata）；`public/robots.txt`（缺失）
- **严重程度**: P1
- **问题**: 既无 `robots` metadata 字段，也无 `public/robots.txt`。虽然默认允许爬虫，但显式声明更规范，且应指向 sitemap。
- **修复建议**:
  1. 在 layout metadata 中加：`robots: { index: true, follow: true }`；
  2. 新建 `public/robots.txt`：
     ```
     User-agent: *
     Allow: /
     Sitemap: https://spark.example.com/sitemap.xml
     ```

### P1-3. 移动端菜单缺少焦点陷阱（Focus Trap）

- **文件**: `src/components/layout/Header.tsx`，第 135–175 行
- **严重程度**: P1
- **问题**: 移动菜单展开时有 ESC 关闭、初始 focus 移入第一个链接（Bug#6.3），但没有 **焦点陷阱**——键盘用户可以 Tab 到菜单背后的页面元素。这违反 WCAG 2.4.3（Focus Order）。
- **修复建议**: 在菜单展开期间拦截 Tab 键，将焦点循环限制在菜单项内：
  ```ts
  React.useEffect(() => {
    if (!mobileOpen) return;
    const menu = document.getElementById(MOBILE_MENU_ID);
    const focusable = menu?.querySelectorAll<HTMLElement>("a[href], button");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [mobileOpen]);
  ```

### P1-4. 未使用的死代码组件（4 个）

- **文件**:
  - `src/components/ui/terminal.tsx` — 全文件未被任何页面/组件 import
  - `src/components/animations/split-text.tsx` — 全文件未被 import
  - `src/components/magicui/marquee.tsx` — 全文件未被 import
  - `src/components/ui/badge.tsx` + `src/components/ui/card.tsx` — shadcn 模板组件，全项目未使用
- **严重程度**: P1
- **问题**: 共 6 个文件、约 200+ 行死代码。`Terminal` 和 `SplitText` 还是 `"use client"` 组件，会被打进客户端 bundle（即使未路由到）。
- **修复建议**: 删除未使用的文件，或在有实际使用场景后再引入。`Badge` 和 `Card` 作为 shadcn 预设组件可保留但建议移到 `ui/` 下并确认是否真的不需要。

### P1-5. package.json 缺少 `packageManager` 字段

- **文件**: `package.json`，第 1–34 行
- **严重程度**: P1
- **问题**: CI workflow 注释（`.github/workflows/official.yml`）明确指出"official/package.json 未声明 packageManager，故沿用根声明"。这意味着本地开发者可以用任意 pnpm 版本安装，可能产生不一致的 lockfile 结构或行为差异。
- **修复建议**: 在 `package.json` 中加：
  ```json
  "packageManager": "pnpm@9.15.9"
  ```
  与根仓库保持一致。

### P1-6. QuickStartCTA 底部文字使用 `/70` 透明度，对比度不达标

- **文件**: `src/components/sections/QuickStartCTA.tsx`，第 70 行
- **严重程度**: P1
- **问题**: 代码为 `<p className="font-mono text-xs text-muted-foreground/70">`。项目其他地方（ArchitectureDiagram 第 93–94 行注释、SecurityModel 第 137 行注释）已明确记录 Bug#5 修复：`text-muted-foreground/70` 在亮色主题下对比度仅 ~2.7:1，不满足 WCAG AA。但此处仍残留。
- **修复建议**: 改为 `text-muted-foreground`（亮色 4.9:1 / 暗色 7.6:1）。

### P1-7. 缺少 skip-to-content 链接

- **文件**: `src/app/layout.tsx`，第 36–46 行
- **严重程度**: P1
- **问题**: 页面有固定 Header + 导航，键盘/屏幕阅读器用户每次需要 Tab 穿过全部导航链接才能到达主内容。缺少"跳到主内容"链接是 WCAG 2.4.1（Bypass Blocks）的常见违反项。
- **修复建议**: 在 `<body>` 开头加：
  ```tsx
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded bg-background px-4 py-2"
  >
    跳到主内容
  </a>
  ```
  并给 `<main>` 加 `id="main-content"`。

---

## P2 — 改进建议

### P2-1. 字体通过 CSS `@import` 加载，阻塞渲染

- **文件**: `src/app/globals.css`，第 2–3 行
- **严重程度**: P2
- **问题**: `@import "@fontsource/ibm-plex-mono/400.css"` 和 `@import ".../500.css"` 是 CSS 级 `@import`，会阻塞渲染——浏览器必须先下载并解析这些 CSS，再下载字体文件。对于以代码/终端视觉为核心的站点，字体加载影响 LCP。
- **修复建议**: 使用 `next/font/local` 加载 IBM Plex Mono（@fontsource 包内的 woff2 文件可直接引用）：
  ```ts
  // src/app/layout.tsx
  import { IBM_Plex_Mono } from "next/font/google"; // 或 next/font/local
  const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-mono" });
  ```
  或至少在 `next/font/local` 中配置 `preload: true`。

### P2-2. `output: "export"` 下 `dynamic = "force-static"` 冗余

- **文件**: `src/app/page.tsx` 第 8 行；`src/app/features/page.tsx` 第 10 行；`src/app/architecture/page.tsx` 第 11 行；`src/app/quickstart/page.tsx` 第 21 行
- **严重程度**: P2
- **问题**: `next.config.ts` 已设 `output: "export"`，Next.js 会将所有路由静态导出，`force-static` 指令完全多余。
- **修复建议**: 删除所有 `export const dynamic = "force-static"` 行，减少冗余噪音。

### P2-3. tsconfig 缺少 `noUnusedLocals` / `noUnusedParameters`

- **文件**: `tsconfig.json`，第 2–22 行
- **严重程度**: P2
- **问题**: `strict: true` 不包含未使用变量检查。项目已存在死代码（P1-4），开启此选项可在 typecheck 阶段拦截。
- **修复建议**: 在 `compilerOptions` 中加：
  ```json
  "noUnusedLocals": true,
  "noUnusedParameters": true
  ```

### P2-4. 无 ESLint 配置但代码中有 `eslint-disable` 注释

- **文件**: 全项目（如 `FeatureShowcase.tsx` 第 132 行 `eslint-disable-next-line @next/next/no-img-element`）
- **严重程度**: P2
- **问题**: 代码中有 ESLint 禁用注释，但项目根目录无 `.eslintrc.*`、`eslint.config.*`，package.json 中也无 `eslint` 依赖和 lint script。这些注释是无效的——没有 ESLint 在跑。
- **修复建议**: 要么引入 `eslint` + `eslint-config-next` 并加 `"lint": "next lint"` script，要么删除所有 eslint-disable 注释。

### P2-5. quickstart 页 `language` prop 误用为文件路径标签

- **文件**: `src/app/quickstart/page.tsx`，第 149 行
- **严重程度**: P2
- **问题**: `<CodeBlock language="~/.spark/models.json" />`。CodeBlock 的 `language` prop 文档写的是"可选语言标记，仅作为视觉徽标展示"。传入文件路径在语义上不准确，且 CodeBlock 不做语法高亮，该 prop 纯展示。
- **修复建议**: 将 prop 重命名为 `label` 或 `filename`，或在传值时用 `"json"` 并在上方单独标注文件名。

### P2-6. package.json 缺少 `engines` 字段

- **文件**: `package.json`
- **严重程度**: P2
- **问题**: QuickStart 文档要求 Node.js ≥ 24，CI 也用 Node 24，但 package.json 未声明 `engines`。`npm`/`pnpm` 不会阻止旧版 Node 安装。
- **修复建议**:
  ```json
  "engines": { "node": ">=24" }
  ```

### P2-7. `Terminal` 组件使用数组索引作为 key

- **文件**: `src/components/ui/terminal.tsx`，第 30 行
- **严重程度**: P2
- **问题**: `{lines.map((line, i) => <div key={i}>...`。虽然此组件当前未使用（P1-4），但如果未来启用，索引 key 在列表变动时会导致 React 渲染问题。
- **修复建议**: 给 `TerminalLine` 接口加 `id` 字段，或用 `line.text` 作为 key。

### P2-8. ArchitectureDiagram 在首页和架构页重复渲染

- **文件**: `src/app/page.tsx` 第 4 行 import + 第 16 行使用；`src/app/architecture/page.tsx` 第 2 行 import + 第 66 行使用
- **严重程度**: P2
- **问题**: `ArchitectureDiagram` 组件在首页和 `/architecture` 页都渲染了一份。功能上没问题，但首页已经很长（6 个 Section），架构图对首页访客可能信息过载。这是产品设计决策而非代码 bug，值得确认是否有意为之。
- **修复建议**: 确认设计意图。如果首页想精简，可考虑首页只放架构图缩略图或摘要，引导用户到 `/architecture` 看完整图。

### P2-9. `Marquee` 组件 `aria-hidden` 标记可改进

- **文件**: `src/components/magicui/marquee.tsx`，第 31 行
- **严重程度**: P2
- **问题**: 第一个副本 `aria-hidden="false"`，第二个副本 `aria-hidden="true"`。这是正确模式（重复内容只让辅助技术读一份），但第一个副本没有额外的 `aria-label` 或 `role` 说明滚动内容是什么。
- **修复建议**: 此组件当前未使用（P1-4），如果未来启用，在容器上加 `role="region" aria-label="..."`。

### P2-10. 缺少 `viewport` 和 `themeColor` 显式配置

- **文件**: `src/app/layout.tsx`
- **严重程度**: P2
- **问题**: Next.js 15 推荐将 `viewport` 和 `themeColor` 从 `metadata` 中拆出为独立导出。当前依赖 Next.js 默认 viewport meta（`width=device-width, initial-scale=1`），功能正常但不够显式。深色模式下也无 `theme-color` meta 标签。
- **修复建议**:
  ```ts
  export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    ],
  };
  ```

### P2-11. CI 无缓存命中保证（无锁文件）

- **文件**: `.github/workflows/official.yml`
- **严重程度**: P2
- **问题**: workflow 注释已指出 official/ 无 lockfile，`pnpm install --no-frozen-lockfile --ignore-workspace` 每次全量安装。pnpm store 内容寻址可部分命中，但 official 的依赖少（仅 next/react/motion 等），全量安装耗时不短。
- **修复建议**: 可考虑提交一份 `pnpm-lock.yaml`（即使不在 workspace 内），让 CI 缓存真正可复现。或接受当前状态（注释已说明理由）。

---

## 附录：正面实践总结

以下方面做得很好，值得肯定：

1. **Server / Client Component 边界划分清晰**：`FactBar`、`FeatureShowcase`、`ArchitectureDiagram` 正确移除了 `"use client"`，将交互逻辑（BlurFade、NumberTicker）作为客户端边界，静态数据留在服务端 bundle。

2. **可访问性基础扎实**：
   - 所有 Section 用 `aria-labelledby` 关联标题；
   - 装饰性元素（终端窗口、序号、图标）正确使用 `aria-hidden`；
   - `useReducedMotion` 降级在 Hero、SecurityModel、BlurFade、NumberTicker、BlurText 中全覆盖；
   - `@media (prefers-reduced-motion: reduce)` 在 globals.css 中有 CSS 级兜底；
   - no-JS 场景有 `@media (scripting: none)` + `[data-reveal]` 还原可见态。

3. **响应式设计完整**：
   - Hero 用 `lg:grid-cols-5` 做 60/40 非对称布局，移动端单列堆叠；
   - 移动端菜单用 `md:hidden` + `AnimatePresence`，不推挤页面内容；
   - 长文本（如 SecurityModel evidence 路径）用 `[overflow-wrap:anywhere]` 防横向溢出；
   - 截图统一 `max-h-[420px]` + `object-contain` + `width/height` 属性消除 CLS。

4. **代码事实可验证**：所有命令、端口、文件路径、事件名均标注源码出处（如 `packages/protocol/src/events.ts`），注释中记录了 Bug 编号和修复理由，代码自文档化程度高。

5. **主题切换无 FOUC**：`next-themes` + `suppressHydrationWarning` + `disableTransitionOnChange` + mounted 检查，深色/浅色切换无闪烁。

6. **复制功能有降级**：CodeBlock 用 `navigator.clipboard` + `execCommand` fallback，非安全上下文也能用。
