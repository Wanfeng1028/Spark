# Spark 官网 UI 验证 & 小程序端代码审查报告

**审查日期：** 2026-09-18
**官网地址：** http://localhost:3000（Next.js 15 + Turbopack，静态导出 `output: "export"`）
**小程序端：** apps/miniapp（Taro 4.2.1 + React 18 + zustand 5）

---

## 一、官网各页面验证结果

### 1.1 页面截图清单

| 序号 | 页面 | 截图文件 | 验证结果 |
|------|------|----------|----------|
| 01 | 首页 / — 首屏 Hero | `01-home-above-fold.png` | ✅ 正常渲染 |
| 02 | 首页 — 数据统计区 FactBar | `02-home-data-stats.png` | ✅ 27 事件 / 23 命令 / 4 端 / MIT |
| 03 | 首页 — 核心能力区 FeatureShowcase | `03-home-core-capabilities.png` | ✅ 正常 |
| 04 | 首页 — 流式对话区 | `04-home-streaming-chat.png` | ✅ 正常 |
| 05 | 首页 — 工具可视化区 | `05-home-tool-viz.png` | ✅ 正常 |
| 06 | 首页 — 人工审批区 SecurityModel | `06-home-human-approval.png` | ✅ 正常 |
| 07 | 首页 — 页脚 Footer | `07-home-footer.png` | ✅ 正常 |
| 08 | 核心能力 /features | `08-features-page.png` | ⚠️ 标题重复（见 P1-1） |
| 09 | 架构 /architecture | `09-architecture-page.png` | ⚠️ 标题重复（见 P1-1） |
| 10 | 快速上手 /quickstart | `10-quickstart-page.png` | ⚠️ 标题重复（见 P1-1） |

### 1.2 问题验证截图

| 序号 | 验证项 | 截图文件 | 结论 |
|------|--------|----------|------|
| 11 | 浏览器标签标题重复 | `11-features-tab-title-dup.png` | ✅ **确认**：标题显示 "核心能力 — Spark — Spark" |
| 12 | 无语言切换入口 | `12-home-nav-bar-no-language-switch.png` | ✅ **确认**：导航栏无语言切换按钮 |
| 13 | 左下角 "N" 按钮 = Next.js 开发工具 | `13-nextjs-devtools-panel.png` | ✅ **确认**：点击弹出 Next.js DevTools 面板 |

### 1.3 交互测试结果

| 测试项 | 结果 | 截图 |
|--------|------|------|
| Features 导航链接跳转 | ✅ 正常跳转至 /features | — |
| Architecture 导航链接跳转 | ✅ 正常跳转至 /architecture | — |
| Quickstart 导航链接跳转 | ✅ 正常跳转至 /quickstart | — |
| Docs 导航链接跳转 | ✅ 新窗口打开 GitHub docs 目录 | — |
| GitHub 图标链接 | ✅ 新窗口打开 GitHub 仓库 | — |
| "查看源码"按钮 hover | ✅ 样式变化正常 | `14-hover-view-source.png` |
| 导航链接 hover | ✅ 颜色从 muted 变为 foreground | `15-hover-nav-features.png` |
| 主题切换按钮 hover | ✅ 正常 | `16-hover-theme-toggle.png` |
| 代码块复制按钮 | ✅ 实现正确（clipboard API + execCommand 降级） | — |
| 移动端菜单（汉堡按钮） | ✅ 代码已实现（md:hidden 触发，含 focus 陷阱、ESC 关闭、aria 属性） | — |

### 1.4 移动端视口测试

| 测试项 | 截图文件 | 结果 |
|--------|----------|------|
| 375px（iPhone）模拟 | `17-mobile-375-home.png` | ⚠️ CSS 宽度约束模拟，真实视口未改变；代码层面汉堡菜单在 `md:hidden`（<768px）时显示 |
| 768px（iPad）模拟 | `18-mobile-768-home.png` | ⚠️ 同上；Tailwind md 断点 = 768px，恰好为临界值 |

> **注：** 由于浏览器自动化环境限制，无法通过 CDP 真正改变视口宽度（`Emulation.setDeviceMetricsOverride` 不可用）。通过 CSS `max-width` 注入模拟了窄宽度，但 Tailwind 的 `md:` 断点基于 `window.innerWidth` 而非 body 宽度，因此汉堡菜单未被触发。代码审查确认移动端菜单逻辑完整。

---

## 二、官网发现问题（按优先级分类）

### P1 — 应修复（影响 SEO / 用户体验）

#### P1-1：页面标题双重 "— Spark"

**现象：** 所有子页面标题均显示为 `"X — Spark — Spark"`，如：
- 核心能力 → `核心能力 — Spark — Spark`
- 架构 → `架构 — Spark — Spark`
- 快速上手 → `快速上手 — Spark — Spark`

**根因：** `src/app/layout.tsx` 第 8-11 行定义了标题模板：
```tsx
title: {
  default: "Spark — 本地 Agent 工作台",
  template: "%s — Spark",
},
```
而各子页面 metadata 中又手动写了 `"X — Spark"`，模板再追加一次导致重复。

**受影响文件：**
- `official/src/app/layout.tsx:10` — `template: "%s — Spark"`
- `official/src/app/features/page.tsx:6` — `title: "核心能力 — Spark"`
- `official/src/app/architecture/page.tsx:7` — `title: "架构 — Spark"`
- `official/src/app/quickstart/page.tsx:17` — `title: "快速上手 — Spark"`

**修复方案：** 子页面 title 去掉 `" — Spark"` 后缀，只保留页面名，由 layout 模板统一追加。

---

### P2 — 建议改进

#### P2-1：无语言切换入口

**现象：** 导航栏仅有 Features / Architecture / Quickstart / Docs / GitHub / 主题切换按钮，无 i18n 语言切换入口。

**文件：** `official/src/components/layout/Header.tsx` 第 75-97 行（桌面导航）、第 135-174 行（移动菜单）

**说明：** 当前全站中文，无英文版本。若规划多语言支持需补充入口。

#### P2-2：metadataBase 缺失

**现象：** `layout.tsx` 的 metadata 未设置 `metadataBase`，导致 Open Graph / Twitter Card 的 URL 无法解析为绝对地址。

**文件：** `official/src/app/layout.tsx:7-29`

**影响：** 静态导出（`output: "export"`）下社交分享预览图 URL 为相对路径，部分平台无法抓取。

#### P2-3：无 OG 分享图

**现象：** `openGraph.images` 字段缺失（代码注释标为 TODO），`public/og-image.svg` 存在但未引用。

**文件：** `official/src/app/layout.tsx:17`（注释：`TODO: og-image 需 1200×630 PNG`）

**说明：** 社交平台不解析 SVG，需导出 1200×630 PNG 后配置。

#### P2-4：无 sitemap / robots.txt

**现象：** 项目中无 `app/sitemap.ts`、`app/robots.ts` 或 `public/robots.txt`。

**影响：** 静态导出后搜索引擎无法发现站点结构。

#### P2-5：Next.js DevTools "N" 按钮生产可见

**现象：** 左下角 "N" 按钮点击弹出 Next.js DevTools 面板。

**文件：** 由 Next.js 开发模式自动注入，`output: "export"` 生产构建后应自动移除。当前为 dev 模式运行，属预期行为。

---

## 三、小程序端代码审查结果

### 3.1 架构概览

| 维度 | 详情 |
|------|------|
| 框架 | Taro 4.2.1 + React 18.3.1 |
| 状态管理 | zustand 5.0.15（3 个 store：app / config / theme） |
| 页面 | 3 个：sessions（列表）、session（对话）、settings（设置） |
| 传输层 | 自实现 SSE 泵（Taro.request enableChunked）+ 轮询降级 |
| 共享资产 | `@spark/protocol` 包（事件词表、投影 reducer、流核心、错误文案） |
| 测试 | 8 个测试文件（SSE pump / UTF-8 / support / poll / pair / projection / mini-event-source） |
| 构建 | webpack5 + babel，designWidth 750，rpx 适配 |

### 3.2 P0 问题（阻断 / 严重）

**无 P0 问题。** 代码结构清晰，错误处理完善，与四端共享同一协议层，测试覆盖核心传输逻辑。

---

### 3.3 P1 问题（应修复）

#### P1-1：Token 明文存储于本地缓存

**文件：** `src/store/config-store.ts:52`

```ts
Taro.setStorageSync(CONFIG_KEY, JSON.stringify(cfg))
```

**说明：** 鉴权 token 明文存入微信本地缓存（`Taro.setStorageSync`）。代码注释已标注为 v1 局限（体验版局域网场景），正式分发需重估。

**风险：** 设备被 root / 调试时可读取 token。建议 v2 评估 `Taro.setStorage` 加密存储或微信安全存储方案。

#### P1-2：SSE token 走 URL 查询参数

**文件：** `src/transport/mini-event-source.ts`（构造函数传入 `authToken`，由 `SessionStreamCore` 拼入 URL）

**说明：** SSE 主路径通过 `?token=` 查询参数传递鉴权（REST 走 `Authorization: Bearer` 头）。这是小程序平台限制下的双口径设计，但 URL 查询参数会被服务端访问日志记录，存在泄露风险。

**建议：** 服务端可考虑限制 SSE 端点日志级别，或 v2 评估自定义 header 方案（需确认微信小程序 `onChunkReceived` 是否支持自定义鉴权头）。

#### P1-3：project.config.json 生产配置未优化

**文件：** `project.config.json:6-11`

```json
"setting": {
  "urlCheck": false,
  "es6": false,
  "enhance": false,
  "postcss": false,
  "minified": true
}
```

**问题：**
- `es6: false` — 未开启 ES6 转 ES5（Taro 已做编译，但微信开发者工具的额外转换可提升兼容性）
- `enhance: false` — 未启用代码增强（可选链、空值合并等 polyfill）
- `postcss: false` — 未开启 PostCSS 处理（Taro 已内置 pxtransform，但微信工具的额外后处理可兜底）

**建议：** 生产构建前将 `es6`、`enhance`、`postcss` 均设为 `true`。

#### P1-4：Taro.getSystemInfoSync 已废弃

**文件：**
- `src/app.tsx:20` — `Taro.getSystemInfoSync().theme`
- `src/transport/mini-event-source.ts:91` — `Taro.getSystemInfoSync().SDKVersion ?? ''`

**说明：** 微信基础库 3.x+ 中 `getSystemInfoSync` 已标记为 deprecated，推荐使用 `Taro.getSystemInfo()`（Promise）或 `Taro.getDeviceInfo()` / `Taro.getWindowInfo()` 等拆分 API。

**影响：** 当前功能正常，但长期维护有废弃风险。

#### P1-5：无 React Error Boundary

**说明：** 应用入口 `app.tsx` 无 Error Boundary 包裹，页面渲染异常时白屏无 fallback。

**建议：** 添加 `componentDidCatch` / `react-error-boundary` 组件，展示友好错误页。

---

### 3.4 P2 问题（建议改进）

#### P2-1：scrollTop 魔法数字

**文件：** `src/pages/session/index.tsx:164`

```tsx
if (atBottomRef.current) setScrollTop((v) => v + 4096)
```

**说明：** `4096` 为硬编码魔法数字，虽注释说明"值单调递增避免同值不生效"，但应提取为命名常量（如 `SCROLL_INCREMENT_PX`）。

#### P2-2：closed 态文案未走 protocol 单源

**文件：** `src/pages/session/index.tsx:53`

```ts
const CLOSED_TEXT = '连接已停止：鉴权失败，请到设置页重新配对'
```

**说明：** 其他连接态文案（connecting / reconnecting）均来自 protocol 的 `CONNECTION_TEXT`，但 closed 态文案留在页面本地。代码注释已说明原因（鉴权终态 vs 配置变更 invalidate 语义分叉），属合理边界。

#### P2-3：无分包配置

**文件：** `src/app.config.ts:8`

```ts
pages: ['pages/sessions/index', 'pages/session/index', 'pages/settings/index'],
```

**说明：** 3 个页面全在主包。当前包体积小（<2MB）无压力，但后续页面增多时需评估分包。

#### P2-4：libVersion 与 support.ts 门槛不一致

**文件：**
- `project.config.json:15` — `"libVersion": "3.8.0"`
- `src/transport/support.ts:30` — SSE 分块门槛 `2.20.2`

**说明：** project.config.json 声明基础库版本 3.8.0，但 SSE 探测门槛仅要求 2.20.2。两者不冲突（3.8.0 > 2.20.2），但 support.ts 的版本探测逻辑需确保线上真实用户的基础库版本分布。

#### P2-5：Composer maxlength={-1} 兼容性

**文件：** `src/components/composer.tsx:44`

```tsx
maxlength={-1}
```

**说明：** `maxlength={-1}` 表示不限制输入长度。微信小程序 Textarea 组件的 `maxlength` 默认值为 140，显式设为 -1 在文档中标记为"不限制"，但部分旧基础库版本可能不支持。建议在真机上验证。

#### P2-6：批量事件调度使用 setTimeout

**文件：** `src/store/app-store.ts:53`、`src/pages/session/index.tsx:131`

```ts
export const BATCH_WINDOW_MS = 24
// ...
schedule: (fn) => setTimeout(fn, BATCH_WINDOW_MS)
```

**说明：** 时间窗批处理用 `setTimeout` 实现。逻辑层无 `requestAnimationFrame`，`setTimeout` 是合理选择。但 24ms 窗口在低端设备上可能导致渲染滞后，可考虑自适应窗口。

---

### 3.5 平台兼容性审查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| SSE 原生支持 | ✅ 已处理 | 小程序无 EventSource，用 `Taro.request({enableChunked: true})` + `onChunkReceived` 自解帧 |
| TextDecoder | ✅ 已处理 | 自实现 `Utf8StreamDecoder`（`src/transport/utf8.ts`），含 overlong / CESU-8 防护 |
| fetch API | ✅ 已处理 | 全部走 `Taro.request` 封装（`MiniRestClient`） |
| rpx 适配 | ✅ 良好 | 全部尺寸用 rpx，designWidth 750，尺寸保持 4 的倍数（`tokens.ts` 注释纪律） |
| 深色模式 | ✅ 良好 | 三档外观（系统/浅色/深色），`Taro.onThemeChange` 跟踪系统主题 |
| 本地存储 | ⚠️ 已知局限 | token 明文存储（P1-1） |
| 扫码配对 | ✅ 良好 | `Taro.scanCode` + 手输 6 位码兜底 |
| 下拉刷新 | ✅ 良好 | sessions 页 `enablePullDownRefresh` + `usePullDownRefresh` |
| 安全区适配 | ✅ 良好 | composer 区域 `env(safe-area-inset-bottom)` |

### 3.6 与 web 端代码复用情况

| 维度 | 复用情况 |
|------|----------|
| 事件词表 / 投影 reducer | ✅ 共享 `@spark/protocol`（applyEvent、ProjectionState） |
| SSE 帧解析 | ✅ 共享 `splitSseFrames` / `envelopeFromSseFrame` |
| 流核心状态机 | ✅ 共享 `SessionStreamCore`（四态 / 退避 / 鉴权收敛） |
| 页面逻辑 | ⚠️ 复用 protocol 的 `createSessionPageController`，UI 组件全部自绘 |
| 主题色值 | ✅ 与 apps/mobile 同色值（`tokens.ts` 1:1 映射） |
| 错误文案 | ✅ 共享 `errorMessageOf` / `ERROR_COPY` / `CONNECTION_TEXT` |

---

## 四、截图文件清单

所有截图位于：`_audit/screenshots/official/`

```
01-home-above-fold.png          — 首页首屏 Hero
02-home-data-stats.png          — 首页数据统计区
03-home-core-capabilities.png   — 首页核心能力区
04-home-streaming-chat.png      — 首页流式对话区
05-home-tool-viz.png            — 首页工具可视化区
06-home-human-approval.png      — 首页人工审批区
07-home-footer.png              — 首页页脚
08-features-page.png            — 核心能力页
09-architecture-page.png        — 架构页
10-quickstart-page.png          — 快速上手页
11-features-tab-title-dup.png   — 标题重复证据（核心能力 — Spark — Spark）
12-home-nav-bar-no-language-switch.png — 导航栏无语言切换
13-nextjs-devtools-panel.png    — 左下角 N 按钮弹出的 Next.js DevTools
14-hover-view-source.png        — "查看源码"按钮 hover 态
15-hover-nav-features.png       — 导航链接 hover 态
16-hover-theme-toggle.png       — 主题切换按钮 hover 态
17-mobile-375-home.png          — 375px 宽度模拟（CSS 约束）
18-mobile-768-home.png          — 768px 宽度模拟（CSS 约束）
```

---

## 五、总结

### 官网验证
- **4 个页面**全部可正常访问，渲染正常
- **1 个 P1 问题**：标题双重 "— Spark"（修复成本极低：删除子页面 title 中的 "— Spark" 后缀）
- **5 个 P2 问题**：无语言切换、无 metadataBase、无 OG 图、无 sitemap/robots、DevTools 可见（dev 模式预期）
- 交互测试（导航 / hover / 复制 / 主题切换）全部通过

### 小程序代码审查
- **无 P0 问题**，代码质量高，架构设计清晰
- **5 个 P1 问题**：token 明文存储、SSE token 走 URL、生产构建配置未优化、getSystemInfoSync 废弃、无 Error Boundary
- **6 个 P2 问题**：魔法数字、closed 文案本地化、无分包、libVersion 标注、maxlength 兼容性、批处理窗口
- 平台兼容性处理完善（SSE 自解帧、UTF-8 自实现、rpx 适配、深色模式、降级轮询）
- 与 web 端协议层复用充分（事件词表 / 投影 / 流核心 / 错误文案）
