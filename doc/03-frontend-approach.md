# Spark 前端专题：参考项目前端实现分析与我方前端思路

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-08-22 | AI 编写：ZCode CLI · **GLM-5.3**（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核） | 初稿：六大参考项目前端实现逐一分析（怎么写的）；我方前端八条设计思路（每条注明借鉴来源）；与传统 Web 前端的十二维对比；参考项目前端细节抄什么速查表 |

> 本文回答三个问题：**①参考项目的前端都是怎么写的？②我们的前端思路是什么？③它和传统 Web 前端有什么本质区别？**
> 事实来源：`01-research-report.md` 的源码级调研（dsh/opencode 为开源 Web/桌面端一手源码；Codex/pi/Grok 为 TUI 源码——交互思想同样适用于 Web）。
> 实施细节见 `02-development-plan.md` §6（前端完整规格）。

---

# 1. 为什么前端值得单独分析

Agent 产品的前端**不是"又一个聊天页面"**。它渲染的是一个**正在自主运行的进程**：模型在流式输出、工具在并发执行、审批在挂起等待人类、用户可能中途插话。这决定了它的架构与"表单+列表+详情"的传统 Web 前端有本质区别（详见 §4）。

六大参考项目里，**有图形界面的开源实现只有两个半**：DeepSeek harness 的 `apps/web`（React SPA，完整开源）、opencode 的桌面端/共享 UI 包（SolidJS，完整开源）；Codex 的桌面/Web 客户端闭源（但 TUI 开源，交互模型可借鉴）。其余三家是 TUI——但 TUI 面对的工程问题（token 洪流渲染、事件驱动 UI、审批内联交互）与我们完全同构，解法直接可抄。

---

# 2. 参考项目的前端是怎么写的（逐个分析）

## 2.1 DeepSeek harness `apps/web` —— 唯一开源的 Agent Web UI（React 插件化 SPA）

**技术栈**（package.json 实测）：React 18 + Vite 6 + TypeScript；样式走自研 scss 体系（非 Tailwind）；没有在主包声明状态管理/Markdown 库——它们在 workspace 兄弟包（`dsh-client-ui-primitives`、`dsh-client-modules` 等约 30 个前端插件包）里。

**它是怎么写的**：

1. **入口极薄**：`apps/web/src/main.ts` 全文 10 行——`document.getElementById('root')` → `new AppWebEntry(el).run()`。一切逻辑在 `@deepseek-ai/dsh-client-web` 包里。
2. **宿主注入式启动**：服务端扫描所有声明了 `dsh.client` 字段的 package.json（校验 platform/inject/external/immediately），生成拓扑排序的 `WebBootGraph`（rev=sha1 前 12 位，带环检测），作为 `window.__DSH_BOOT__` 全局变量注入 index.html（`<` 转义防 script breakout）。
3. **浏览器里跑插件框架**：每个前端 bundle 只注册工厂函数（`window.__ModuleLoader__.load({id, factory})` 的 lazy CJS 表），首次 require 才物化；vendored Cordis Loader 通过 `internal.import` 消费——**浏览器复用了和服务端同一套插件生命周期**，前端本身也是"Everything is a Plugin"。
4. **连接层工程细节**：`packages/client/connection` 的 http-bridge 做 node:http ↔ WHATWG fetch 桥；断连检测挂在 **response 的 close**（而非 request——Node16+ 的坑）；背压 `write()===false → await drain`；请求体上限 300MB。
5. **双 WS mux 下行**（`/api/events.mux`、`/api/events.host`）+ unary RPC（`POST /api/<ns>/<method>`）。

**对我们的启示**：证明了"Agent Web UI = 协议客户端 + 事件流渲染"这条路线在 React 上完全可行；它的插件化前端是超前期设计（我们阶段五才需要），但**连接层的断连检测与背压细节直接抄**。

## 2.2 opencode —— 同构多端：一份协议，SolidJS 全家

**技术栈**（package.json 实测）：

| 端 | 实现 |
|---|---|
| TUI | `@opentui/core` + `@opentui/solid` + `@opentui/keymap`（SolidJS 组件模型跑在终端渲染器上）+ solid-js，bun 运行时，经 `@opencode-ai/sdk` 连 server |
| 桌面 | **Electron 42**（electron-vite + electron-builder）：main 进程管 updater/store/window-state + drizzle + 自编 node-pty；**renderer 是 SolidJS + 共享 UI 包 `@opencode-ai/app` + @solidjs/router** |
| 共享 UI | `packages/app` + `packages/ui` + `packages/session-ui`——桌面 renderer 与未来 Web 复用同一套组件 |
| web 包 | 注意：`packages/web` 是 **Astro/Starlight 文档站**，不是应用 UI |

**它是怎么写的**：严格 client/server——TUI 和桌面 renderer 都是 HTTP+SSE 协议客户端；桌面形态 = "Electron 侧边栏 + 内嵌终端（PTY WebSocket + ticket 鉴权 + cursor 回放）+ 共享 Web UI"；`session-ui` 把"会话流渲染"抽成独立可复用包，**一份 UI 代码服务多个宿主**。

**对我们的启示**：这就是我们"apps/web 先行、apps/desktop 复用 HttpTransport 与组件"路线的原型验证；session-ui 的"会话流独立成包"值得学（我们把 ChatView 相关组件收敛在 features/chat 下，保持可迁移性）。

## 2.3 Codex TUI —— 协议客户端 + 批量刷屏（Rust/Ratatui，交互思想直接适用 Web）

**它是怎么写的**：

1. **TUI 不直接依赖引擎**：`tui/src/app_server_session.rs` 经 `AppServerClient`（InProcess/Remote）连接，消费的是 `item/agentMessage/delta` 这类 v2 协议通知——**图形界面和未来的桌面/Web 客户端吃同一份事件**。
2. **事件分发模式**：`app_server_events.rs::handle_app_server_event()` 对 `ServerNotification::*` 做 match 分派更新 widget 状态；审批走 `handle_server_request_event()` 回应 `CommandExecutionRequestApproval` 等 server→client 请求。
3. **token 洪流的渲染纪律（重点）**：`chatwidget/streaming.rs` 的 `on_agent_message_delta(delta)` **不是每 token 重绘**，而是累积缓冲 + `run_commit_tick` **定时批量刷屏**——用时间片换取渲染稳定。
4. 渲染件：syntect 语法高亮、pulldown-cmark Markdown、终端图像协议支持、剪贴板集成。

**对我们的启示**：`run_commit_tick` 的 Web 等价物就是我们的 **rAF 批量 flush**（§02-6.8）；"事件 match 分派更新 widget 状态"就是我们的 `applyEvent` reducer。

## 2.4 Claude Code TUI —— React → ANSI（闭源，泄露源码+访谈可查）

**它是怎么写的**：React + Ink——"renderer is just translating the React code to ANSI"（Boris Cherny 访谈原话），打包用 Bun 编译。泄露源码 `src/components/` 是 Ink 组件集；交互模型（从 19 章分析文档）：聊天历史写入原生 scrollback、权限提示**内联**在对话流中、斜杠命令体系、vim mode 输入、plan mode 切换、/rewind 检查点回滚、后台任务与 todo 展示。

**对我们的启示**：审批**内联在流中对应工具调用的位置**（而不是弹窗打断）——这是 human-in-the-loop 体验的最佳实践，我们 ApprovalCard 的位置设计照此。

## 2.5 pi TUI —— 自研框架的差分渲染（TypeScript）

**它是怎么写的**：`pi-tui` 自研——`Component{render(width)=>string[]; handleInput?; invalidate()}` + Container 递归拼行；`TuiMainScreen.doRender`：整屏渲染 → overlay 合成 → 与 `previousLines` **逐行全等比较**求 `[firstChanged, lastChanged]` → 五种 fullRender 特例（首帧/宽高变化/收缩/变更区在视口上方）否则**增量写区间**（synchronized output 转义包裹）；写**原生 scrollback** 而非接管视口；组件缓存按 width 键控、主题变更 `invalidate()` 清缓存。流式 Markdown 由内置 Markdown 组件承担。

**对我们的启示**：差分渲染的 Web 等价物 = React.memo + 浅比较选择器（**只有流式中的 UiItem 重渲染**）；"写原生 scrollback"的滚动语义 = react-virtuoso 的 followOutput + 用户上滚暂停跟随 + BackBottom 按钮。

## 2.6 Grok Build TUI —— 内容块化 + Elm 式单向数据流（Rust）

**它是怎么写的**：

1. **scrollback = 内容块序列**：20 余种 block 类型（agent/thinking/tool{edit,execute,read,search,web_fetch}/subagent/workflow/quote_bar…），每块独立渲染——**消息流天然是"类型化块列表"**。
2. **Elm 架构**：ACP 入站消息 → `acp_handler::handle()` 产出 Action → 更新 AppView 状态 → Effect（渲染/副作用）——严格单向数据流。
3. **主循环调度纪律**：`biased tokio::select!` 固定优先级，ACP 消息臂以"输入队列空"为门 + 有界批量 drain——**token 洪流永不饿死键盘输入**。
4. 90+ 斜杠命令各占一个文件（注册表模式）；60+ 视图组件。

**对我们的启示**：UiItem 类型化块设计（user/assistant/reasoning/tool/approval 五 kind）与它的 scrollback blocks 同构；"输入优先"在 Web 上由 rAF 批量 + 主线程短任务保证。

## 2.7 范式总结（六家 + 前期会话）

所有六个前端（不管 TUI 还是 GUI）共享同一形状：

```
事件源（协议） ──▶ 分派器（match/applyEvent） ──▶ 类型化内容块状态 ──▶ 差分渲染
      ▲                                                        │
      └──────────── 命令（send/steer/interrupt/reply） ◀──── 用户交互
```

加上前期会话确立的六要素（双栏、流式、HITL、会话一等、Generative UI、可观测性）与五层蓝图（protocol → transport → stores → components → mock engine）——这就是 Agent 前端的通用架构。

---

# 3. 我们的前端思路（八条设计原则，每条注明来源）

1. **UI 是事件流的投影**（Codex TUI 分派模式 / Grok Elm 流 / opencode 客户端同构）：store 唯一写入口是 `applyEvent(e)` 纯函数 reducer；任何 UI 状态都能从事件序列重建——这是"断线重连回放""mock 开发""时间旅行调试"三个能力共用同一机制的根本原因。
2. **协议先行、前端先行**（前期会话五层蓝图 / 旧会话 mockTransport 结论）：`packages/protocol` 是全项目唯一合同（前端直接 import 类型）；MockTransport 回放预录事件，**后端不存在时前端已完成全部 UI 并可测**。
3. **单一事件流通道**（opencode `GET /api/event`）：SSE 单端点推全部事件 + 15s 心跳；`since=<seq>` durable 回放实现断线无缝续播；命令走独立 REST（send 三态 / interrupt / permission reply）。
4. **流式优先渲染**（pi 差分 + Codex run_commit_tick）：delta 高频到达 → 缓冲 → **rAF 对齐批量 flush** 到 streamdown（未闭合语法自动补全）；定稿后 UiItem 引用冻结 + memo——只有流式中的块重渲染。
5. **会话是一等对象，无页面体系**（Codex 桌面"视图而非页面" / 全体 TUI）：路由只有 `/welcome` 与 `/session/:id`；没有 CRUD 表单、没有列表-详情层级；"导航"就是切换会话。
6. **HITL 审批是一等交互**（Claude Code 内联审批 / dsh fail-closed / opencode always 级联）：审批卡片**内联在对应工具调用的位置**；挂起期间 Composer 让位；三键（once/always/reject+feedback）+ always 自动放行同批 + 超时 fail-closed 视觉呈现。
7. **steering/queue/interrupt 三态输入**（Codex TurnInputMode / opencode 双通道）：turn 进行中 Composer 变形为 [插话][排队][停止]，提交结果三态反馈（"已注入当前轮"）。
8. **复用策略：copy-in 改造，不做黑盒依赖**（shadcn/AI Elements 分发模式）：AI Elements 48 组件源码拷入仓库改造（删 "use client"、换数据源为我们的 selector hook）；核心交互（审批卡/工具卡）自写——**代码所有权归我们，这正是"先复用、后创新"的落点**。

**未来扩展位**（已在设计中预留）：双栏工作区（右侧 diff/文件树，阶段四接 checkpoint/file-tree）；Generative UI（事件词表 declaration merging 加块类型即可，dsh 手法）；skills/插件前端（dsh 的 dsh.client 思想，阶段五）。

---

# 4. 与传统 Web 前端的本质区别（十二维对比）

| 维度 | 传统 Web 前端 | Spark 前端（Agent 前端） |
|---|---|---|
| **信息架构** | 多页面/菜单导航/列表-详情-表单层级 | 会话流单视图（2 条路由）；"页面"概念消失，取而代之的是**会话+内容块** |
| **数据获取** | REST 资源拉取 + TanStack Query 缓存失效 | **订阅一条事件流**（SSE 单端点）；请求只有 4 个"命令"（send/interrupt/reply/create） |
| **状态模型** | 服务器状态缓存 + 本地表单状态，两套心智 | **单一投影 store**：`applyEvent` 纯函数归约，没有"表单状态"这回事 |
| **更新粒度** | 资源级/组件级刷新 | **token 级 delta 增量**（assistant.delta 高频到达） |
| **一致性策略** | 乐观更新 + 失败回滚 | **durable 回放**：断线/刷新后按 seq 补发事件即恢复原状，乐观更新没有存在必要 |
| **核心交互** | 表单校验、CRUD、分页排序 | **审批卡（挂起/恢复）、插话/排队/中断、流式跟随滚动** |
| **实时性** | WebSocket 可选（聊天室才需要） | SSE 必选：心跳、重连、背压是基础设施 |
| **前后端关系** | API 文档对齐，类型靠手动同步 | **protocol 包类型直接共享**——改协议两端同时编译报错 |
| **测试重心** | 组件交互 + E2E 页面流 | **reducer 事件表单测**（21 种事件逐一断言）+ mock 场景回放；UI 测试反而轻 |
| **渲染性能关注点** | 首屏、包体积 | **token 洪流下的主线程稳定**（rAF 批量、虚拟化、memo、增量渲染） |
| **失败处理** | 错误边界 + 请求重试 | **失败闭合**（事件流永不悬空，引擎保证）+ 断线条 + 回放进度 |
| **部署形态** | 公网网站，多用户，登录态 | **本地 127.0.0.1 引擎**：无登录/无多租户/无 CDN，静态资源由引擎进程托管 |

**一句话**：传统前端是"渲染数据"，Agent 前端是"**渲染一个进程的执行历史与正在进行时**"——所以事件流是一等公民、审批是核心交互、增量渲染是生命线。

---

# 5. 各参考项目前端细节抄什么（速查）

| 想解决的问题 | 去抄谁 | 具体细节 |
|---|---|---|
| 事件 → UI 状态的映射怎么组织 | Codex TUI / Grok | `app_server_events.rs` 的 match 分派；Grok 的 ACP→Action→Effect 单向流 → 我们的 applyEvent 表 |
| token 洪流不卡 UI | Codex TUI / Grok | `run_commit_tick` 定时批量刷屏；biased select + 有界 drain → 我们的 rAF 批量 flush |
| 只有变化的部分重渲染 | pi TUI | 逐行 diff [firstChanged,lastChanged] + 缓存失效 → 我们的 memo + 浅比较选择器 |
| 滚动交互（流式跟随/回看） | pi TUI | 写原生 scrollback 语义 → virtuoso followOutput + 上滚暂停 + BackBottom |
| 审批的内联呈现 | Claude Code | 权限提示内联在对话流对应位置（非弹窗）→ ApprovalCard 位置设计 |
| 消息流的内容块化 | Grok TUI | 20+ scrollback block 类型 → UiItem 五 kind + 按工具类型分发渲染器 |
| 断连检测与背压 | dsh web | http-bridge：检测挂 response close；write()===false → drain |
| SSE 消费与重连 | opencode | 单端点 + 心跳 + since 回放；sdk 客户端模式 |
| 多端复用一套 UI | opencode | session-ui 共享包 → 我们的 features/chat 收敛可迁移 |
| 前端插件化（后期） | dsh web | dsh.client 字段扫描 + __DSH_BOOT__ 注入 + lazy CJS 表 |
| 斜杠命令体系（后期） | Claude Code / Grok | 注册表模式（Grok：90+ 命令一文件一命令） |
| 工作区双栏（后期） | 前期会话范式 | 会话流 + 工作区（diff/文件树/预览）双栏布局 |

---

# 6. 与 `02-development-plan.md` 的对应关系

| 本文（思路） | 02 方案（实施） |
|---|---|
| §3.1 UI 是事件流投影 | 02 §6.4 session-store + applyEvent 表 |
| §3.2 协议先行/Mock | 02 §4.7 Transport + MockTransport 规格 |
| §3.3 单一事件流通道 | 02 §4.6 SSE 帧格式 + §7.3 SSE 实现 |
| §3.4 流式优先渲染 | 02 §6.8 性能优化（rAF 批量等 7 条） |
| §3.5 无页面体系 | 02 §6.1 信息架构与路由 |
| §3.6 审批一等交互 | 02 §6.3 ApprovalCard + §5.7 审批规格 |
| §3.7 三态输入 | 02 §6.2 Composer 交互规格 |
| §3.8 copy-in 改造 | 02 §6.7 AI Elements 改造清单 |
| §4 与传统 Web 差异 | （本表即差异的工程化落点索引） |

---

*本文完（v1.0）。随方案演进更新，并在版本记录表追加。*
