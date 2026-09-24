# Spark 产品官网设计与执行方案（v2 — Next.js 技术栈）

## 一、技术选型判决

### 1.1 行业调研结论

对 17 个头部 AI/开发者产品官网进行框架指纹探测，结果：

| 产品 | 框架 | CSS | 动画 | 部署 |
|------|------|-----|------|------|
| OpenAI | Next.js | Tailwind | Motion | Cloudflare |
| Vercel / v0 | Next.js (Turbopack) | Tailwind + Geist | Motion | Vercel |
| Cursor | Next.js | Tailwind | Motion | Vercel |
| Linear | Next.js (Vinext) | Tailwind | Motion | 自建 CDN |
| Raycast | Next.js (Turbopack) | Tailwind | Motion | Vercel |
| Supabase | Next.js | Tailwind + shadcn | Motion | Vercel |
| Arc | Next.js | Tailwind | Motion | Vercel |
| Claude.ai | Next.js | — | — | — |
| shadcn/ui | Next.js (Turbopack) | Tailwind | Motion | Vercel |
| AI Elements | Next.js | Tailwind + shadcn | Motion | Vercel |
| Magic UI | Next.js | Tailwind | Motion | Vercel |
| React.dev | Next.js | Tailwind | Motion | Vercel |
| Tailwind CSS | Next.js (Turbopack) | Tailwind v4 | Motion | Vercel |
| Next.js | Next.js (Turbopack) | Tailwind + Geist | Motion | Vercel |

**结论：Next.js + Tailwind + Motion 占 76%+ 份额，是 AI 产品官网的绝对主流。**

### 1.2 最终技术栈

| 层 | 选型 | 版本 | 理由 |
|----|------|------|------|
| 框架 | **Next.js** (App Router) | 15+ | 行业共识；SSG/ISR 灵活；SEO 一流 |
| UI 库 | **React** | 19 | 与 apps/web 一致 |
| 样式 | **Tailwind CSS** | v4 | 与产品端一致，复用 token |
| 组件 | **shadcn/ui** + **AI Elements** | latest | copy-in 模式；AI Elements 原生 Next.js |
| 微交互 | **Magic UI** | latest | Shimmer Button / Blur Fade / Marquee（克制精致，不触 §12） |
| 文本动画 | **react-bits** | latest | BlurText / SplitText（RSC 友好，零 Framer 客户端包） |
| 动画引擎 | **Motion**（Framer Motion） | 12+ | 行业事实标准（Vercel/Cursor/Linear/Raycast 全在用） |
| 字体 | 系统栈 + IBM Plex Mono | — | 本地打包，零 CDN |
| 部署 | **Vercel** | — | 一键部署；或 `next export` 纯静态到 GH Pages |
| TypeScript | strict | 5.x | 与仓库一致 |

### 1.3 AI 组件策略

**主力组件来源**：

| 库 | 用途 | 与 §12 兼容度 |
|----|------|---------------|
| **AI Elements** (Vercel 官方) | Agent 演示区块：Conversation / Message / Tool / Task / Confirmation | ★★★★★ 完全兼容 |
| **shadcn/ui** | 基础 UI：Button / Card / Badge / Tabs | ★★★★★ 完全兼容 |
| **Magic UI** | 微交互：Shimmer Button / Blur Fade / Marquee / Number Ticker | ★★★★☆ 挑选使用 |
| **react-bits** | 文本动画：BlurText / SplitText / TextType | ★★★★☆ RSC 友好 |
| ~~Aceternity UI~~ | ~~Background Beams / Spotlight / 3D Card / Bento~~ | ❌ **禁用** — 直接撞 §12 P0 |

**关键优势**：AI Elements 原生为 Next.js 设计，官网用 Next.js 后**不再需要删 `"use client"`**，消除了 `doc/08 §10` 登记的"AI Elements Next.js 漂移"风险。

### 1.4 仓库集成边界
- **不入** `pnpm-workspace.yaml`（README.md 第 77 行已声明"独立于产品各端"）
- **不受** 根 CI 约束（`check_doc_links.py` SKIP_DIRS 含 `official`）
- 独立 `package.json` + `pnpm-lock.yaml`
- 可选：独立 GitHub Actions workflow（`.github/workflows/official.yml`，路径过滤 `official/**`）

---

## 二、视觉设计系统

### 2.1 设计调性
**对标**：Linear.app / Vercel.com / Cursor.com / Raycast.com 的开发者工具冷调极简
**反面对标**：v0.dev 模板风 / Aceternity 默认效果 / 任何蓝紫渐变+毛玻璃+居中大标题+三卡的页面

### 2.2 色彩方案（继承产品 token）

| Token | 亮色值 | 暗色值 | 用途 |
|-------|--------|--------|------|
| background | `#ffffff` | `#09090b` | 页面基底 |
| foreground | `#18181b` | `#fafafa` | 主文字 |
| muted | `#71717a` | `#a1a1aa` | 辅助说明 |
| accent | `#4f46e5` | `#818cf8` | 链接/选中态（小面积） |
| border | `#e4e4e7` | `#27272a` | 分隔线 |
| card | `#f4f4f5` | `#18181b` | 卡片/代码背景 |

**严禁**：蓝紫渐变、暖棕/米色、渐变文字（`bg-clip-text`）、Tailwind blue-600 主按钮

### 2.3 字体方案
- UI：`system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", sans-serif`
- 代码：`"IBM Plex Mono"`（@fontsource 本地打包）
- **严禁**：Inter / Poppins / Space Grotesk / Geist 做默认主字体（§12.3 P1）
- **严禁**：外部字体 CDN（`fonts.googleapis`）

### 2.4 排版尺度（官网专用）

| 层级 | 字号 | 字重 | 备注 |
|------|------|------|------|
| Display | 40-44px | semibold(600) | Hero 标题，**左对齐** |
| Heading | 28-30px | semibold(600) | Section 标题 |
| Subheading | 18-20px | medium(500) | 段落标题 |
| Body | 15-16px | normal(400) | 正文 |
| Caption | 13px | normal(400) | 辅助标注 |
| Code | 14px | mono | IBM Plex Mono |

**严禁**：`text-5xl`/`text-6xl`/`text-7xl`（§12.3 P0）

### 2.5 动效方案（Motion + Magic UI）

| 动效类型 | 实现 | 用途 |
|----------|------|------|
| 入场 reveal | Motion `whileInView` + `viewport={{ once: true }}` | Section 进入视口时 fade-up |
| 文本动画 | react-bits `BlurText` / `SplitText` | Hero 标题逐字显现 |
| 微交互 | Magic UI `ShimmerButton` / `BlurFade` | CTA 按钮、卡片入场 |
| 数字跳动 | Magic UI `NumberTicker` | FactBar 数字滚动到位 |
| Hover | Motion `whileHover` | 卡片微上浮 translateY(-2px) |
| 页面转场 | Next.js View Transitions | 路由切换淡入淡出 |
| 终端演示 | Motion + 自定义打字逻辑 | Hero 右侧终端动画 |

**全部动效必须**：
- 尊重 `prefers-reduced-motion: reduce`（Motion 内置支持）
- 不使用 `animate-pulse`/`animate-bounce` 无意义循环
- 时长控制在 150-400ms（入场）/ 120ms（hover）

### 2.6 间距与圆角
- Section 间距：120-160px
- 组件间距：24-48px
- 内容最大宽度：1200px，正文 max-w-prose (65ch)
- 圆角档位（继承 §13.B 封闭集）：`rounded-full` / `rounded-lg`(8px) / `rounded-xl`(12px) / `rounded-2xl`(16px)
- **严禁**：`rounded-3xl` 及以上

---

## 三、页面架构与 Section 设计

### 3.1 路由结构

| 路由 | 页面 | 渲染模式 |
|------|------|----------|
| `/` | 首页（单页长滚动 6 Section） | SSG (`force-static`) |
| `/features` | 核心能力展开 | SSG |
| `/architecture` | 架构 + 事件模型 + 四端 | SSG |
| `/quickstart` | 安装 + 配置 + 首次运行 | SSG |
| `/demo` | AI Elements 活演示（可选，v1.1） | CSR |
| `/404` | 404 | SSG |

### 3.2 首页 Section 设计（6 区域）

**Section 1 — Hero**
- 布局：**左对齐非对称 60/40**（严禁居中 hero + 徽章 pill + CTA 三件套 §12.5 P0）
- 左侧：
  - react-bits `BlurText` 一句话宣言："引擎 headless 的 Agent 工作台"（19.44 改：原"跑在你自己机器上的"属第二人称喊话）
  - 副标：一句技术定位（"引擎 headless，UI 是事件流的投影"）
  - CTA 区：命令块 `npm i -g @spark/cli`（带 CopyButton）+ GitHub 链接
  - **不用 "Get Started" / "开始使用" 营销按钮**（§12.7）
- 右侧：
  - **真实产品截图**（web 会话流界面）或
  - **终端动画**（AI Elements Terminal 组件 + Motion 打字效果，模拟 `spark up` 启动流）
- 背景：纯色，无装饰图形

**Section 2 — FactBar（事实数字）**
- 4 个真实数字横排：27 事件词表 / 23 内置命令 / 4 端形态 / MIT
- Magic UI `NumberTicker` 滚动到位动画
- 每个数字**必须有仓库真实来源**（避 §12.5 "假仪表盘"）
- 样式：mono 数字 + 灰色标注，不包裹卡片

**Section 3 — 核心能力（四件事）**
- 布局：**纵向堆叠 + 交替图文**（左图右文 / 右图左文 交替）
- **严禁**：恰好三张特性卡一行、bento 网格（§12.5 P1）
- 四项：
  1. 流式对话 — token 级增量渲染，27 种事件实时投影
  2. 工具调用可视化 — 每一步可追溯，审批 fail-closed
  3. 人工审批 — 硬边界先行，超时一律拒绝
  4. 四端同一协议 — Web / Desktop / CLI / Mobile 共享 protocol
- 每项：真实截图 + 2-3 句技术描述 + 代码片段
- 动效：Motion `whileInView` fade-up 入场

**Section 4 — 架构一览**
- 内嵌 SVG 分层架构图（从 README ASCII 图转化）
- 五层：apps/* → @spark/protocol → apps/server → @spark/engine → sessions/*.jsonl
- 交互：hover 各层高亮（Motion `animate` 或 CSS transition）
- 节点 mono 字体、1px border、无阴影无渐变

**Section 5 — 安全模型 / 设计原则**
- 4 条纵向排列的承诺（纯文字列表，不包裹卡片）
- 缺省绑定回环 / fail-closed / 硬边界先行 / durable 可审计（19.44 改：首位原为口号标签"本地优先"）
- 每条一句说明 + 一行事实证据
- **不用** icon-in-rounded-square（§12.4 P1）

**Section 6 — Quick Start CTA**
- 终端命令块：`npm i -g @spark/cli` → `spark up` → 配模型
- GitHub Star 按钮（Magic UI ShimmerButton，克制配色）
- 文档站深链（→ apps/docs VitePress）
- **不用**大渐变背景、不用营销腔文案

### 3.3 Header
- Logo：纯文字 wordmark "Spark"（或单色极简 SVG）
- 导航：Features / Architecture / Quickstart / Docs / GitHub
- 主题切换（light/dark）
- **严禁毛玻璃导航栏**（§12.2 P0）：固定顶栏用 `bg-background/95 border-b` 纯色+底部边线
- Motion `AnimatePresence` 做移动端菜单展开

### 3.4 Footer
- 单行/双行：版权 + GitHub / LICENSE / CHANGELOG / CONTRIBUTING
- **严禁**四列营销链接墙

### 3.5 暗色/亮色主题
- 复用产品 token（`:root` 亮色 / `.dark` 暗色）
- `next-themes` 库持久化 + `prefers-color-scheme` 监听
- `<Script>` 内联在 `<head>` 防闪白（同 apps/web 模式）
- View Transitions API 主题切换动画（圆形扩展）

---

## 四、文件结构

```
official/
├── README.md                        ← 重写：图文并茂的项目展示 README
├── LEGACY-README-2026-09-13.md      ← 旧冻结快照 git mv（不删除）
├── package.json                     ← 独立依赖
├── pnpm-lock.yaml                   ← 独立锁文件
├── next.config.ts                   ← Next.js 配置（output: 'export' 可选）
├── tsconfig.json                    ← strict
├── tailwind.config.ts               ← Tailwind v4（或 CSS-first）
├── postcss.config.mjs
├── public/
│   ├── favicon.svg
│   ├── fonts/                       ← IBM Plex Mono woff2
│   ├── og-image.png                 ← 社交分享图
│   └── screenshots/                 ← 产品真实截图
│       ├── web-session.png
│       ├── cli-tui.png
│       ├── mobile-chat.png
│       └── desktop-shell.png
├── src/
│   ├── app/
│   │   ├── layout.tsx               ← Root layout（字体/meta/主题/Provider）
│   │   ├── page.tsx                 ← 首页
│   │   ├── features/page.tsx        ← 特性页
│   │   ├── architecture/page.tsx    ← 架构页
│   │   ├── quickstart/page.tsx      ← 快速上手
│   │   ├── not-found.tsx            ← 404
│   │   └── globals.css              ← Tailwind 入口 + token + 动效
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx           ← 导航栏
│   │   │   ├── Footer.tsx           ← 页脚
│   │   │   └── ThemeToggle.tsx      ← 主题切换
│   │   ├── sections/
│   │   │   ├── Hero.tsx             ← 首屏
│   │   │   ├── FactBar.tsx          ← 事实数字条
│   │   │   ├── FeatureShowcase.tsx  ← 核心能力（交替图文）
│   │   │   ├── ArchitectureDiagram.tsx ← SVG 架构图
│   │   │   ├── SecurityModel.tsx    ← 安全模型
│   │   │   └── QuickStartCTA.tsx    ← 页尾 CTA
│   │   ├── ui/                      ← shadcn/ui + AI Elements copy-in
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── code-block.tsx       ← Shiki 高亮 + 复制
│   │   │   └── terminal.tsx         ← AI Elements Terminal
│   │   ├── magicui/                 ← Magic UI copy-in（精选）
│   │   │   ├── shimmer-button.tsx
│   │   │   ├── blur-fade.tsx
│   │   │   ├── number-ticker.tsx
│   │   │   └── marquee.tsx
│   │   └── animations/
│   │       ├── BlurText.tsx         ← react-bits copy-in
│   │       └── SplitText.tsx        ← react-bits copy-in
│   ├── lib/
│   │   ├── utils.ts                 ← cn() helper
│   │   └── constants.ts             ← 事实数字/链接/导航
│   └── styles/
│       └── tokens.css               ← 从 apps/web 复制的设计 token
└── .github/
    └── workflows/
        └── official.yml             ← 独立 CI（可选）
```

---

## 五、README 重写方案

### 5.1 旧文件处置
- `git mv official/README.md official/LEGACY-README-2026-09-13.md`（§2.10 不删除）
- 新写 `official/README.md`

### 5.2 新 README 设计（图文并茂，对标 Astro/Vite/Tailwind README）

结构：
1. **顶部居中**：Logo + 标题 + 一句 slogan + badge 行 + 导航链接
2. **产品截图区**：多端真实截图（HTML table 排版 或 单张大图）
3. **核心能力**：4 项精炼列表 + 每项一句技术描述
4. **架构一览**：SVG 或 ASCII 架构图
5. **Quick Start**：3 步命令块
6. **技术栈表格**
7. **文档导航**：深链各文档
8. **贡献**：简要 + 链接 CONTRIBUTING.md
9. **License**：MIT

要求：至少 3 张截图 + 2 个代码块 + 1 个架构图 + badge 行，避免纯文字墙。

---

## 六、文案纪律（§12.7 合规）

**严禁**：
- Elevate / Seamless / Powerful / Effortless / Revolutionize
- 轻松 / 强大 / 无缝 / 一站式 / 赋能
- "Get Started" / "开始使用" 通用 CTA
- 按钮末尾箭头："开始 →"
- 营销腔感叹号
- **（工单 19.44 补）第二人称喊话式定位句**："跑在你自己机器上的" / "两条路，都在你自己的机器上" / "属于你的"；同义词轮播（"Agent 工作台 / AI 编码搭档 / 自动化队友"）同禁
- **（工单 19.44 补）把架构事实当口号标签**："本地优先" / "数据不出本机" / "无云端依赖" / "Local-first"——事实照说（"默认只监听 127.0.0.1"），标签不写。本仓已四次清查该词，判据见 DESIGN §12.7

**正确做法**：
- 具体技术描述："27 种事件类型"、"token 级增量渲染"、"默认绑定 127.0.0.1"
- CTA 用实际命令/动作："安装 CLI" / "查看源码" / "阅读架构文档"
- 动词具体化：查看 / 阅读 / 安装 / 浏览

---

## 七、性能目标

| 指标 | 目标 | 手段 |
|------|------|------|
| FCP | < 1.0s | SSG 预渲染 + Critical CSS |
| LCP | < 1.5s | Hero 文案是 HTML；截图 next/image 优化 |
| CLS | = 0 | 所有图片/动画预设尺寸 |
| TBT | < 100ms | Motion tree-shaking；岛屿最小化 |
| Lighthouse | 90+ | SSG + 字体 preload + 图片 AVIF/WebP |
| 外部请求 | 0 | 字体本地、零 CDN、零埋点 |
| Bundle | < 80KB JS (gzip) | Motion + React 19 + Next.js 最小化 |

---

## 八、执行步骤与依赖

### Step 1：脚手架搭建
- `official/package.json`（独立，不入 workspace）
- `next.config.ts`（`output: 'export'` 纯静态导出）
- `tsconfig.json` / `tailwind.config.ts` / `postcss.config.mjs`
- 目录结构建立
- 依赖：`next@15`、`react@19`、`react-dom@19`、`tailwindcss@4`、`motion`、`next-themes`、`@fontsource/ibm-plex-mono`、`lucide-react`、`clsx`、`tailwind-merge`、`class-variance-authority`

### Step 2：设计 Token 与全局样式
- 从 `apps/web/src/styles/tokens.css` 复制 token
- 编写 `globals.css`（Tailwind 入口 + token + 排版尺度 + 动效基类）
- 配置 light/dark 主题变量
- 依赖：Step 1

### Step 3：组件库搭建（shadcn/ui + Magic UI + react-bits）
- shadcn/ui 初始化（Button / Card / Badge / Tabs）
- Magic UI copy-in 精选组件（ShimmerButton / BlurFade / NumberTicker / Marquee）
- react-bits copy-in（BlurText / SplitText）
- AI Elements copy-in（Terminal 组件，用于 Hero 演示）
- **每个组件过 §12 黑名单自查**
- 依赖：Step 2

### Step 4：布局骨架
- `layout.tsx`（Root：字体 preload + ThemeProvider + Header + Footer）
- `Header.tsx`（导航 + ThemeToggle + 移动端菜单）
- `Footer.tsx`（版权 + 链接）
- 依赖：Step 3

### Step 5：首页 Section 组件
- `Hero.tsx`（左文右图 + BlurText + 终端动画/截图）
- `FactBar.tsx`（NumberTicker 数字条）
- `FeatureShowcase.tsx`（交替图文 + Motion whileInView）
- `ArchitectureDiagram.tsx`（SVG + hover 交互）
- `SecurityModel.tsx`（纯文字列表）
- `QuickStartCTA.tsx`（命令块 + ShimmerButton）
- 依赖：Step 4

### Step 6：页面组装
- `page.tsx`（首页组合全部 Section）
- `features/page.tsx`（展开版）
- `architecture/page.tsx`（完整版）
- `quickstart/page.tsx`（详细步骤）
- `not-found.tsx`（404）
- 依赖：Step 5

### Step 7：图片资产与截图
- 产品截图占位（web/cli/mobile/desktop）
- `favicon.svg`（单色极简）
- `og-image.png`（社交分享）
- Logo SVG
- 依赖：无（可全程并行）

### Step 8：README 重写
- `git mv official/README.md official/LEGACY-README-2026-09-13.md`
- 编写新 README（图文并茂，含截图引用、badge、代码块）
- 依赖：Step 7

### Step 9：交付前合规自查
- §12.8 grep 硬检查表（11 项全部零命中）
- §12.7 文案自查（无禁止词）
- 布局自查（非居中 hero / 非三卡 / 非 bento / 非编号步骤行）
- 代码质量（TS strict / 零 any / 无空 catch / boring code）
- Magic UI 组件逐个过黑名单（确认无渐变/无玻璃/无发光）
- 依赖：Step 6 + Step 8

### 依赖图
```
Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6 → Step 9
                                                      ↗
Step 7 (全程并行) ──────────────────→ Step 8 ─────────┘
```

---

## 九、§12.8 交付前 grep 硬检查表

在 `official/src/` 范围内**全部零命中**：

```
bg-gradient-to / bg-linear-     → 渐变背景
from-purple / from-indigo / from-violet / to-blue-  → 蓝紫渐变
bg-clip-text                     → 渐变文字
backdrop-blur                    → 毛玻璃
rounded-3xl                      → 超大圆角
shadow-lg / shadow-2xl          → 装饰性大阴影
text-5xl / text-6xl / text-7xl  → 超大标题
animate-pulse / animate-bounce  → 无意义循环
Inter / Poppins / Space Grotesk / Geist → 禁止字体
fonts.googleapis / cdn.         → 外部资源
✨🚀⚡🎉                         → emoji 装饰
```

**注意**：Magic UI 某些组件默认含渐变/发光效果（如 ShimmerButton 的 shimmer 动画），copy-in 时**必须修改为中性色 shimmer**（用 `--foreground` 而非蓝紫渐变），否则触发 grep 检查。

---

## 十、风险与缓解

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| Magic UI 组件默认样式含 §12 禁止项（渐变/发光） | 高 | copy-in 后逐个审查，改为中性色；不直接用 npx 引入 |
| Aceternity 组件误用（Background Beams 等） | P0 | **明确禁用 Aceternity**，不 copy-in 任何其组件 |
| Next.js node_modules 体积大（~300MB） | 低 | official/ 独立，不影响主仓库 CI/开发体验 |
| Motion (Framer Motion) 客户端包体积 | 中 | tree-shaking + `LazyMotion` + `domAnimation` feature bundle |
| 产品截图缺失 | 中 | 用灰色占位框 + 文字说明；后续从 e2e 产物补充 |
| ESLint 根配置扫描 official/ | 中 | 确认 eslint.config.js ignores 含 `official/**` |
| 事实数字漂移 | 中 | v1 手动对齐根 README；v1.1 可引入生成器脚本 |
| AI Elements 组件含 `"use client"` | 低 | Next.js App Router 原生支持，无需删除 |

---

## 十一、Rejected Alternatives

| 方案 | 否决理由 |
|------|----------|
| **Astro 5** | 用户明确排除；AI Elements 需适配；islands 架构对重交互不友好 |
| **Vite + React SPA** | 非头部产品官网主流选择（17 个站仅 0 个用此方案做营销站）；SEO 需自拼 |
| **VitePress** | 文档站模板，视觉自由度低；职责已被 apps/docs 覆盖 |
| **SvelteKit** | 与主栈 React 完全不同；AI Elements/shadcn 无法复用 |
| **Webflow** | 无代码所有权；无法嵌入活的 agent 演示 |
| **Aceternity UI 重度使用** | 标志性视效（Beams/Spotlight/3D/Bento）逐条撞 §12 P0 黑名单 |

---

## 十二、参考站点（仅在线浏览，§2.12 禁克隆）

| 站点 | 学习点 |
|------|--------|
| linear.app | 左对齐 hero、暗色基调、产品截图即主视觉 |
| vercel.com | 命令块 CTA、极致排版、Geist 设计系统 |
| cursor.com | AI 产品官网调性、Motion 动效克制运用 |
| raycast.com | 功能纵向叙事、开发者工具质感 |
| supabase.com | shadcn 风格官网、暗色主题实现 |
| ui.shadcn.com | 组件展示方式、代码块交互 |
| elements.ai-sdk.dev | AI Elements 官方展示、Agent 演示区块 |
| magicui.design | 微交互组件参考 |
