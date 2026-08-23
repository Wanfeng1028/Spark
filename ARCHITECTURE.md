# ARCHITECTURE.md — Spark 架构文档

> 根级架构总览：定位、总体架构、核心抽象、**关键设计决策记录（ADR）**。
> 视觉与交互规则见 `DESIGN.md`；实现级规格见 `doc/02-development-plan.md`；调研依据见 `doc/01-research-report.md`；前端专题见 `doc/03-frontend-approach.md`。

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核） | 初稿：定位/总体架构/五条铁律/六大核心抽象/八项关键决策记录（ADR）/模块速览/演进路线 |
| v1.1 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；人作者：晚风（Wanfeng1028，提出与审核） | D2 补充"AI 生成风"禁止特征清单与判例（暖棕/米色暖调配色、实线细描边+内部毛玻璃按钮） |
| v1.2 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；决策：晚风（Wanfeng1028） | §1 定位移除"本地优先"标签（架构事实不变；MVP 范围收窄的表述保留，绑定细节归 D5） |
| v1.3 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；决策：晚风（Wanfeng1028） | **文件更名 DESIGN.md → ARCHITECTURE.md**：按"四类约束"文档框架（AGENTS 管项目 / DESIGN 管视觉 / SKILL 管流程 / 专属文件管工具差异），本文件职责为架构与决策记录；视觉规则由原 doc/04-frontend-rules.md 迁入新的根 DESIGN.md |

---

## 1. 定位

**AI Agent 工作台**：引擎（Node/TS，headless）+ Web 前端（后期 Electron 壳），通过 HTTP+SSE 消费事件流。核心体验三件事：**流式对话、工具调用可视化、人工审批**。MVP 范围收窄：不做多用户、公网部署、账号体系（绑定与部署细节见 D5）。

## 2. 总体架构

```
┌────────────────────────────── 本机 ──────────────────────────────┐
│  apps/web (React SPA) ── HttpTransport ──┐   apps/desktop（阶段五）│
│                                           ▼                      │
│           packages/protocol（唯一合同：事件类型 + API + Transport） │
│                                           ▼                      │
│  apps/server (Fastify)：REST 命令 + GET /api/event（SSE 单端点+心跳）│
│                                           ▼                      │
│  packages/engine                                                    │
│    InputQueue(now/steer/queue) → RunLoop → ToolPipeline             │
│    PermissionService（挂起/级联） · SessionManager（JSONL 树）        │
│    LlmGateway → @earendil-works/pi-ai（30+ provider）               │
│                                           ▼                        │
│  ~/.spark/sessions/<cwd>/<ses_id>.jsonl（durable 事件日志）           │
└────────────────────────────────────────────────────────────────────┘
```

一句话：**引擎 headless，UI 是事件流的投影**（Codex/opencode 验证过的范式）。所有客户端（web/desktop/mock）消费同一份协议。

## 3. 五条铁律（写代码时时刻对照）

1. UI 只通过 `applyEvent` 消费事件（Codex TUI 分派 / Grok Elm 流）；
2. durable 事件落盘、delta 只走内存（opencode "Stream fragments are live-only"）；
3. 模型可见的必被记录（dsh "Model-visible means logged"，编译期 surface 强制）；
4. 失败闭合——任何异常路径补齐事件序列，流永不悬空（pi handleRunFailure）；
5. 审批 fail-closed——超时/异常一律拒绝（dsh decide() 全路径坍缩）。

## 4. 核心抽象

| 抽象 | 设计 | 来源 |
|---|---|---|
| **事件模型** | 21 种可辨识联合 + merge-extensible 词表；信封 `{id,type,sessionId,seq,time,data}`；durable（落盘可回放计 seq）/ live（delta 仅内存）/ surface（进模型历史）三属性编译期区分 | opencode durable/live + dsh surface |
| **会话** | append-only JSONL 树（条目 `id/parentId`）；分叉=只移 leaf 指针；compaction 是树上的普通 entry（summary+keptFromSeq 锚点）；模型上下文=Projector 从 surface 事件投影 | pi session-manager + dsh projector |
| **输入三通道** | `now`（空闲即开 turn）/ `steer`（进行中，下一 step 前注入）/ `queue`（turn 间依序）；提交三态 `started/steered/queued`；唤醒合并防空转 | Codex TurnInputMode + opencode pendingWake |
| **工具管线** | zod schema-first；before→permission→execute→after；serial 工具 barrier / parallel 工具并发（read 并行，bash/edit/write 独占）；输出 >32KB 溢写文件；中断补合成事件对 | Codex RwLock 门控 + dsh 三段 waterfall + opencode output-store |
| **审批** | wildcard 规则 `findLast` 胜出、无命中默认 ask、agent 未声明全 deny；ask 时工具 Promise 挂起在事件上（任何客户端可接单）；always 持久化并自动放行同批；reject+feedback 回喂模型 | opencode permission.ts + dsh fail-closed |
| **传输** | REST 命令 + SSE 单端点事件流（15s 心跳，`since=seq` durable 回放断线续播）；本地 127.0.0.1 无鉴权（刻意） | opencode event.subscribe + dsh 绑定姿态 |

## 5. 关键设计决策记录（ADR）

> 格式：决策 / 理由 / 被否备选 / 依据。日期均为 2026-08-22，调研依据见 doc/01。

### D1 后端语言 = TypeScript（Node 22+）
理由：与 React 前端**共享协议类型**（改一处两端编译报错）；pi 的构建块可直接 import（dsh 源码复用验证）；参照源码（pi/dsh/opencode）同语言可直译；Electron 期可嵌入同运行时。
备选否决：Go（失类型共享与 TS 构建块，eino 尚 v0.x alpha）；Python（本地个人工具无一选用，类型断裂）；Rust（性能非瓶颈，开发效率低）。行业佐证：同类产品 Claude Code/dsh/pi/opencode 全 TS。

### D2 前端 = Vite + React 19 + Tailwind v4 + shadcn/ui + AI Elements
理由：AI Elements 48 个工作台组件（confirmation 审批卡/terminal/file-tree/plan/task/checkpoint）是最全的 Agent UI 零件库且 copy-in 源码归我们；shadcn 生态最大。"蓝玻璃 AI 风"与 Tailwind 无关（那是 v0/Lovable 审美），我们用默认黑白中性极简。**"AI 生成风"特征一律禁止**（判例：2026-08-22 评审一张刷课工具面板截图——暖棕/米色配色、按钮实线细描边 + 内部毛玻璃模糊，定性为典型 AI 审美、不可取）：蓝紫渐变玻璃拟态；暖棕/米色等暖调配色；实线细描边 + 内部 backdrop-blur 毛玻璃的按钮/卡片。
备选否决：Semi（AI 三件套优秀但 Vite 主题插件社区化）；antdx（组件较少且绑 antd6）；assistant-ui 作主库（0.x）。Semi/antdx/lobehub 保留为备案（doc/02 §2.1.1 有链接对比表）。

### D3 LLM 抽象 = @earendil-works/pi-ai（MIT）
理由：30+ provider 含本地 Ollama/vLLM；token/cost 统计；**被 DeepSeek harness 源码实际复用**（llm-pi-ai 包）——两家产品验证。依赖隔离在 LlmGateway 单文件，出问题可整体替换。
备选否决：Vercel AI SDK v7（生态最大但约 5 个月一个 major、ESM-only/Node22 约束、opencode V2 已"去 ai-sdk 化"佐证可控性风险）；各家官方 SDK 直连（要自抹 provider 方言，2-4 人周）。

### D4 会话存储 = append-only JSONL 树 + durable/live 二分（而非 SQLite 事件溯源）
理由：pi 的 JSONL 树最简（分叉零拷贝、人类可读可手编、~50 行自写）；吸收 opencode 的 durable/live 二分使日志小而干净、重放确定。六家中四家用 JSONL。
备选否决：opencode 式 SQLite 事件溯源（优雅但 v1 复杂度高）；**阶段四引入 node:sqlite 做索引/列表加速，不动 JSONL 权威**——迁移路径已预留。

### D5 传输 = HTTP REST + SSE 单端点（而非 WebSocket/JSON-RPC）
理由：命令低频且请求-响应天然匹配 REST；事件流单向（引擎→UI），SSE 足够且过代理友好；opencode 单端点 `GET /api/event` + `since` 回放已验证；审批"反向请求"用 REST POST 而非协议层反向调用（v1 简化，客户端轮询/长连接不需要）。
备选否决：WebSocket 双向（v1 无浏览器→引擎高频推送需求；PTY 类需求到桌面期再上，届时参考 opencode PTY ticket 机制）；JSON-RPC（方法面小，收益不抵复杂度）。

### D6 引擎循环 = 自写 RunLoop，pi 只用原语
理由：RunLoop 是产品差异点（事件协议/steering/审批全自定义）；pi-agent-core 的 stream/工具执行原语成熟可引，但其消息模型与我们事件模型不完全对齐——自写循环层保证协议主权。
备选否决：整体用 pi-agent-core 驱动（受制其抽象）；eino ADK（Go 线已否）；照 Codex 翻译（Rust→TS 成本高于按 pi 抄）。

### D7 审批 = wildcard 规则 + 事件化挂起 + fail-closed
理由：三家的最优组合——opencode 的规则引擎（findLast/未声明全 deny/always 级联/feedback 回喂）+ dsh 的 fail-closed（超时即拒）+ Codex 的"审批即学习"（v2 预留 proposedRule）。
备选否决：模式档位制（default/acceptEdits/bypass…）——v1 规则更细且可渐进演化出档位；pi 的无审批 YOLO——与我们产品定位冲突。

### D8 不引入 Effect/RxJS 等响应式框架
理由：opencode 的挂起/急切并行/唤醒合并用普通 async/await + Promise 表即可实现；框架学习成本与招聘成本远超收益。**抄设计，不抄框架。**

## 6. 模块速览（职责边界）

| 模块 | 职责 | 不许做 |
|---|---|---|
| `packages/protocol` | 事件词表/API 类型/Transport 接口/zod schema | 任何业务逻辑、运行时依赖（除 zod） |
| `packages/engine` | 输入队列/RunLoop/工具/审批/会话/LLM 网关 | 不感知 HTTP；不 import 前端代码 |
| `apps/server` | REST 薄壳 + SSE + 静态托管 | 不写业务（全部委托 engine） |
| `apps/web` | UI 渲染与交互 | 不做协议外的数据加工；不改写事件（只投影） |

## 7. 演进路线（摘要）

阶段一 骨架（协议+Mock）→ 二 前端全量（对 Mock）→ 三 引擎跑通（切真实 Transport）→ 四 深度体验（steer/压缩/fork/checkpoint/SQLite 索引）→ 五 产品化（Electron/沙箱/MCP/子代理/skills）。任务清单级细节见 doc/02 §8。

## 8. 已知风险（摘要）

pi 包 0.x（隔离单点+锁版本）；AI Elements 面向 Next.js（copy-in 适配）；本地安全（默认全审批+路径硬边界，沙箱后置）；协议演进（durable version 预留+fail-closed 读端）。完整表见 doc/02 §10。
