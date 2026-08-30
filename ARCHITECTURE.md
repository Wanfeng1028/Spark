# ARCHITECTURE.md — Spark 架构文档

> 根级架构总览：定位、总体架构、核心抽象、**关键设计决策记录（ADR）**。
> 视觉与交互规则见 `DESIGN.md`；实现级规格见 `doc/02-development-plan.md`；调研依据见 `doc/01-research-report.md`；前端专题见 `doc/03-frontend-approach.md`。

## 版本记录

| 版本 | 日期       | 作者                                                                                                                                                                                               | 变更内容                                                                                                                                                                                                                       |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1.0 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核） | 初稿：定位/总体架构/五条铁律/六大核心抽象/八项关键决策记录（ADR）/模块速览/演进路线                                                                                                                                            |
| v1.1 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；人作者：晚风（Wanfeng1028，提出与审核）                                                                                          | D2 补充"AI 生成风"禁止特征清单与判例（暖棕/米色暖调配色、实线细描边+内部毛玻璃按钮）                                                                                                                                           |
| v1.2 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；决策：晚风（Wanfeng1028）                                                                                                        | §1 定位移除"本地优先"标签（架构事实不变；MVP 范围收窄的表述保留，绑定细节归 D5）                                                                                                                                               |
| v1.3 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；决策：晚风（Wanfeng1028）                                                                                                        | **文件更名 DESIGN.md → ARCHITECTURE.md**：按"四类约束"文档框架（AGENTS 管项目 / DESIGN 管视觉 / SKILL 管流程 / 专属文件管工具差异），本文件职责为架构与决策记录；视觉规则由原 doc/04-frontend-rules.md 迁入新的根 DESIGN.md    |
| v1.4 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028）                                                                                                        | D2"AI 生成风"特征清单收拢为单一来源：本文件保留判例与决策，完整六类清单改指 DESIGN.md §12                                                                                                                                      |
| v1.5 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"后端的 AI 规范也要写好"）                                                                              | 新增 **§9 代码"AI 生成味"黑名单（后端与通用代码）**：六类（过度设计/防御式噪音/注释与死代码/命名结构/类型依赖/硬检查），boring code 总原则，与引擎铁律挂钩（吞异常=违反失败闭合）；依据 arXiv 实证 + 社区案例 6 源             |
| v1.6 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）                                                                                                                                   | §4 核心抽象表事件模型 **21→19 种**（@spark/protocol 实现时核对词表实数；与 doc/02 v2.3、AGENTS v1.11、doc/03 v1.1 同步）                                                                                                       |
| v1.7 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"继续把文档完善"）                                                                                      | **ADR 补录 D9-D13**（源码对照三轮产生的架构级决策收拢归档，此前散落 doc/02 注记）：D9 跨平台 bash 执行器、D10 SSE 全局订阅语义、D11 reject 级联、D12 会话文件演进与 fail-closed 四条、D13 maxSteps 防御线；与 doc/02 v2.7 同步 |
| v1.8 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段四开工指令） | §4 核心抽象表会话行 compaction 锚点 `keptFromSeq` → `keptFromEventId`（阶段四工单 4.1 协议演进同步；与 doc/02 v2.16 同步） |
| v1.9 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | 新增 **D14 Electron 壳 = sidecar 独立 server 进程**（阶段五工单 5.1：sidecar vs 主进程嵌入评估结论——HttpTransport 零改动复用/崩溃隔离/用户机零 Node 依赖）；§6 模块速览表补 apps/desktop 行 |
| v1.10 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | 新增 **D15 bash 沙箱 = 平台 wrapper 前缀（bwrap/Seatbelt），Windows 本期不做 OS 级**（阶段五工单 5.2 三平台调研：AppContainer 否决依据——任意路径只读不可行/无维护中 Node 绑定；dsh ACL 包 koffi 原生依赖破坏 sidecar 打包；Claude Code 先例 Windows 未支持）；spark.json engine.bashSandbox 开关 + fail-closed 拒跑 |
| v1.11 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | 新增 **D16 MCP 工具 = ToolRegistry 一等公民，同一管线一视同仁**（阶段五工单 5.3：~/.spark/mcp.json stdio 声明 + mcp__<server>__<tool> 命名 + mcp.call 审批动作默认 ask + z.fromJSONSchema 往返；否决旁路管线聚合层与 HTTP transport；审批三态经真实子进程 e2e 测试实证） |
| v1.12 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | 新增 **D17 子代理 = 独立子会话（header.parentSession），主会话只见工具事件对**（阶段五工单 5.4：Task 工具 agent.task 审批默认 ask + Engine.runSubagent 注入执行体 + 单层限制 E_SUBAGENT_DEPTH + 父中断级联（turn.started 补中断关竞态）；否决内嵌主流与自定义 durable 事件两备选；Steer expectedTurnId 校验同步落地 E_TURN_MISMATCH 409） |
| v1.13 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | 新增 **D18 事件词表扩展 = 运行时注册表 + declaration merging，插件是声明不是程序**（阶段五工单 5.5：protocol extend.ts registerEventType/eventSchemaOf 注册表、EventBus.emitExtended durable/live 双路 + ignorable 信封、skills loader 声明式清单目录扫描、hooks 声明式触发器 data 固定形状、示例插件 examples/skills/demo-ping；否决 JS 动态 import 与旁路校验两备选） |
| v1.14 | 2026-08-26 | AI 编写：ZCode CLI · ox-alpha（model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；发起：晚风（Wanfeng1028，D4 多端 ADR 指令） | 新增 **D19–D24 多端 ADR**（D19 CLI TUI=Ink v6 / D20 移动端=Expo+RN / D21 小程序=Taro 4 / D22 四端复用边界 / D23 复用与许可 / D24 配对鉴权）；**D7 补记**：档位制按预期演化落地（DESIGN §13.E 四档=规则引擎之上的预设层，非推翻）；§7 演进路线补阶段六~九；与 D1–D18 无未声明冲突；AGENTS 适配表补 CLI/移动端注记（AGENTS v1.17 同步）；工单互引 doc/02 §8 阶段八/九 |
| v1.15 | 2026-08-26 | 同上（发起：晚风，移动端框架确认"适合 React 的"=React Native，与 D20 一致；供图 Qoder CN iOS 13 张） | **D24 补记**：配对 UX 定稿扫码为主（桌面出示 QR 含一次性短码→App 扫码换长效 token，Qoder CN 实测同范式）、手输 6 位码降兜底；token 交换/校验机制不变。移动端视觉规格落 DESIGN §13.J（v2.2）；doc/02 阶段九工单措辞同步（v3.1） |
| v1.16 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令） | §4 事件模型行事实修正 **19→20 种**（阶段七工单 7.2 新增 `io.warning`：I/O 护栏告警，IoGuard 挂 ToolPipeline 输出限界后，log-only durable 不 surface）；与 doc/02 v3.4、AGENTS v1.18、README v1.17 同步 |
| v1.17 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令） | 新增 **D25 长期记忆 = SQLite FTS5 trigram + 事件化注入（memory.injected 先于 user.message 落盘，Projector 投影为模型上下文前缀——surface 纪律双面成立）**（阶段七工单 7.5 迷你 ADR）；§4 事件模型行 **20→21 种**（新增 `memory.injected`）；与 doc/02 v3.14、AGENTS v1.19、README v1.19 同步 |
| v1.18 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令） | 新增 **D26 自动化 = 进程内 tick 循环 + cron/watch/webhook 三类触发器，触发即建会话发 prompt，失败运行结构化留存**（阶段七工单 7.6 迷你 ADR）；事件词表不变（自动化不进事件流）；与 doc/02 v3.15、doc/07 v1.7 同步 |
| v1.19 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令） | **D17 补记**：子代理并行解除（task 工具 `parallelizable` 改 true——独立子会话并行互不串扰，单层限制/中断级联语义不变）+ 树状运行监控（`ToolContext.sourceEventId` → 子会话 header.parentEventId → 树视图锚定；`ForkChildDto.status` 运行态快照，前端复用 SessionStatusDot）（阶段七工单 7.8）；事件词表不变；与 doc/02 v3.16、doc/07 v1.8 同步 |
| v1.20 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令） | 新增 **D27 browser 工具族 = BrowserDriver 端口 + 引擎级单页共享 + 截图落盘走静态面**（阶段七工单 7.10 迷你 ADR：playwright-core 懒启动 fail-closed / 四工具 parallelizable=false 串行互斥 / 审批三 action 缺省 ask / 截图文件名白名单供图）；事件词表不变；与 doc/02 v3.19、doc/07 v1.11 同步 |
| v1.21 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段十全量开工指令） | **D19 修订**（阶段十工单 10.8，晚风拍板）：CLI 形态四区→纯单栏会话优先——砍会话列表侧栏，会话管理退 /new 与 /resume 面板；状态细条改 footer 双行（§13.K K.4 决策④）；技术选型（Ink v6）与降级策略不变，`<80 列隐藏侧栏`条款随侧栏移除自然失效；依据 2026-08-30 Qwen Code CLI 实测截图对照 |

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

| 抽象           | 设计                                                                                                                                                                           | 来源                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **事件模型**   | 21 种可辨识联合 + merge-extensible 词表；信封 `{id,type,sessionId,seq,time,data}`；durable（落盘可回放计 seq）/ live（delta 仅内存）/ surface（进模型历史）三属性编译期区分    | opencode durable/live + dsh surface                            |
| **会话**       | append-only JSONL 树（条目 `id/parentId`）；分叉=只移 leaf 指针；compaction 是树上的普通 entry（summary+keptFromEventId 锚点）；模型上下文=Projector 从 surface 事件投影           | pi session-manager + dsh projector                             |
| **输入三通道** | `now`（空闲即开 turn）/ `steer`（进行中，下一 step 前注入）/ `queue`（turn 间依序）；提交三态 `started/steered/queued`；唤醒合并防空转                                         | Codex TurnInputMode + opencode pendingWake                     |
| **工具管线**   | zod schema-first；before→permission→execute→after；serial 工具 barrier / parallel 工具并发（read 并行，bash/edit/write 独占）；输出 >32KB 溢写文件；中断补合成事件对           | Codex RwLock 门控 + dsh 三段 waterfall + opencode output-store |
| **审批**       | wildcard 规则 `findLast` 胜出、无命中默认 ask、agent 未声明全 deny；ask 时工具 Promise 挂起在事件上（任何客户端可接单）；always 持久化并自动放行同批；reject+feedback 回喂模型 | opencode permission.ts + dsh fail-closed                       |
| **传输**       | REST 命令 + SSE 单端点事件流（15s 心跳，`since=seq` durable 回放断线续播）；本地 127.0.0.1 无鉴权（刻意）                                                                      | opencode event.subscribe + dsh 绑定姿态                        |

## 5. 关键设计决策记录（ADR）

> 格式：决策 / 理由 / 被否备选 / 依据。日期均为 2026-08-22，调研依据见 doc/01。

### D1 后端语言 = TypeScript（Node 22+）

理由：与 React 前端**共享协议类型**（改一处两端编译报错）；pi 的构建块可直接 import（dsh 源码复用验证）；参照源码（pi/dsh/opencode）同语言可直译；Electron 期可嵌入同运行时。
备选否决：Go（失类型共享与 TS 构建块，eino 尚 v0.x alpha）；Python（本地个人工具无一选用，类型断裂）；Rust（性能非瓶颈，开发效率低）。行业佐证：同类产品 Claude Code/dsh/pi/opencode 全 TS。

### D2 前端 = Vite + React 19 + Tailwind v4 + shadcn/ui + AI Elements

理由：AI Elements 48 个工作台组件（confirmation 审批卡/terminal/file-tree/plan/task/checkpoint）是最全的 Agent UI 零件库且 copy-in 源码归我们；shadcn 生态最大。"蓝玻璃 AI 风"与 Tailwind 无关（那是 v0/Lovable 审美），我们用默认黑白中性极简。**"AI 生成风"特征一律禁止**（判例：2026-08-22 评审一张刷课工具面板截图——暖棕/米色配色、按钮实线细描边 + 内部毛玻璃模糊，定性为典型 AI 审美、不可取；完整六类特征清单见 DESIGN.md §12——2026-08-23 依外部调研扩充，单一来源在彼处）。
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
**补记（2026-08-26，DESIGN §13.E 定稿触发）**：档位制按本条预期的"渐进演化"路径落地——Composer 权限四档（逐项确认/自动编辑/计划模式/完全访问）定位为**规则引擎之上的预设层**：逐项确认=缺省规则表不动；自动编辑=会话临时层对 fs.write/edit 预置 allow；完全访问=会话临时层批量预置 allow（档位图标转 warn 琥珀色警示）；计划模式是交互层约定，不改审批语义。evaluate/findLast/fail-closed 语义不变，不引入第二权限机制。

### D8 不引入 Effect/RxJS 等响应式框架

理由：opencode 的挂起/急切并行/唤醒合并用普通 async/await + Promise 表即可实现；框架学习成本与招聘成本远超收益。**抄设计，不抄框架。**

### D9 跨平台 bash 执行器 = Windows Git Bash 优先、PowerShell 兜底

理由：本机与目标用户以 Windows 为主（开发环境 win32）；Git Bash 命令语法与 Unix 一致，提示词与工具描述可移植。备选否决：一律 PowerShell（语法方言伤害提示词可移植性与参考项目对齐性）；一律要求 WSL（安装门槛高）。依据：doc/02 §5.6.3（2026-08-23 源码对照轮补全超时树杀 taskkill /T /F 等细节）。

### D10 SSE 订阅 = 全局单连接直播 + REST 全量回放幂等恢复

理由：一条连接直播全部会话（侧栏状态点免轮询）；打开/重连会话走 `GET /:id` 全量快照 reset+apply（幂等，冷启动与断线同路径），重叠事件靠 seq 去重。备选否决：per-session 连接（多连接管理复杂）、`since` 增量重连（per-session 水位状态复杂，v1 会话快照足够小）。依据：doc/02 §4.6/§6.4/§6.6。

### D11 审批 reject 同会话级联拒绝

理由：用户 reject 表达的是对当前 turn 方向的纠偏，同会话其余挂起审批一并拒绝是 fail-closed 收敛（opencode permission/index.ts 实证）；feedback 仅随用户显式输入注入。依据：doc/02 §5.7 对照补强第 2 条。

### D12 会话文件演进 = header 版本迁移链 + 读端 fail-closed 四条

理由：格式演进走"读时旧版本→迁移函数链→就地重写"（pi migrateV1→V2→V3 实证），未来版本拒绝加载；损坏纪律四条 fail-closed——非尾坏行、未知事件 type（无 ignorable）、孤儿条目（parentId 缺失）、seq 断裂，一律拒绝加载。刻意分歧记录：pi 对坏行宽容跳过、孤儿当根——不跟随（一致性优先于可恢复性，本地产品可承受拒载后人工介入）。依据：doc/02 §5.8.1/§5.8.4。

### D13 RunLoop 防御线 maxStepsPerTurn=40 保留

理由：pi 无步数计数器（终止靠 terminate 钩子），但其场景有上层产品兜底；我们是本地长驻进程，保留硬上限防模型死循环烧 token。v2 可演化出 shouldStopAfterTurn 式钩子。依据：doc/02 §5.5 对照决策注记。

### D14 Electron 壳 = sidecar 独立 server 进程（2026-08-25，阶段五工单 5.1）

决策：Electron 主进程不 import 引擎，只做三件事——①以 `ELECTRON_RUN_AS_NODE=1` 用 Electron 自带二进制拉起 server 单文件 bundle（esbuild 全量打包，用户机零 Node 依赖）；②轮询 `GET /api/healthz` 探活；③BrowserWindow 加载 `http://127.0.0.1:<动态端口>`。端口/静态资源根经 `SPARK_PORT`/`SPARK_WEB_DIST` 环境变量注入（server 三行改动）。
理由：HttpTransport 与协议零改动复用（doc/02 §1.2 架构图原设计）；崩溃隔离——壳/渲染崩溃不伤 JSONL 单写者，sidecar 崩溃即整壳退出、重启 resume 恢复（durable 日志 + 补闭合语义复用阶段三 kill -9 验收路径）；与 web 开发态同构（同一 server 同一前端）；引擎可独立于 Electron 测试（CI 无需 GUI）。
否决备选：主进程嵌入（`new Engine()` 跑在 Electron 主进程）——引擎生命周期绑壳生命周期、Node 版本被 Electron 锁死、CI 要起 Electron 才能测引擎，全是为打包方便付出的架构耦合。
附带决策：sidecar cwd = 用户主目录（桌面态无项目上下文时的默认工作区）；Windows 退出为强制终止，一致性由 fsync + durable 恢复兜底。打包：server 以 esbuild 全量单文件 bundle（含 pi-ai，`createRequire` banner 解决 CJS 依赖动态 require），经 extraResources 进 resources/；NSIS 安装包在 GitHub Actions windows runner 构建（`.github/workflows/desktop-win.yml` 手动触发）——NSIS 卸载器生成需执行 32 位安装器 stub，Linux 交叉构建依赖 wine wow64（宿主须支持 32 位 ELF），容器环境不可靠；Linux 本地可用 `--win zip` 验证打包管线（阶段五验收已实证）。`signAndEditExecutable: false`（未签名包，SmartScreen 警告代价已接受，正式发布再补签名）。依据：doc/02 §1.2/§8 阶段五工单 5.1。

### D15 bash 沙箱 = 平台 wrapper 前缀（bwrap/Seatbelt），Windows 本期不做 OS 级（2026-08-25，阶段五工单 5.2）

决策：`spark.json engine.bashSandbox: off|on`（默认 off = 现行为）。on 时 bash 命令包平台 wrapper 前缀——Linux `bwrap --ro-bind / / --bind <cwd> <cwd> --dev /dev --proc /proc --tmpfs /tmp`、macOS `sandbox-exec -p`（Seatbelt profile：默认放行 + 写限 cwd/tmpdir）；wrapper 不可用即 `E_SANDBOX_UNAVAILABLE` 拒跑（fail-closed，不降级裸跑）。语义 = workspace-write（全盘只读 + 工作区/临时可写，Claude Code 同款姿态）；网络隔离 v1 不做（其方案为沙箱外 SOCKS5 代理 + 域名清单，复杂度后置）。
理由：wrapper 前缀是零依赖的 argv 变换——引擎不引原生组件、sidecar 单文件打包不受影响；bwrap/Seatbelt 均为 Claude Code 实证路线（官方文档：macOS 开箱即用 Seatbelt、Linux 装 bubblewrap，Windows 原生"未支持/计划中"）。
否决备选：① Windows AppContainer（工单原候选）——无法做到"任意路径只读"（dsh 设计笔记实证：AppContainer 不支持 arbitrary-path reads；mxc 路线需 Win11 24H2 + 全盘 DACL 改写），且现实实现存在子进程无法创建的缺陷（FerroxLabs #321 实证），Codex 用它是因 Rust 原生代码自持——Node/TS 无维护中的 AppContainer 绑定（幻觉依赖红线）；② dsh 的 `@deepseek-ai/dsh-sandbox-windows-acl`（ACL WRITE_RESTRICTED token）——机制成立且 MIT，但 koffi FFI 原生依赖破坏 sidecar 单文件 bundle、包龄 0.0.1-rc；③ Windows 纯用户态限制（如 `@ggui-ai/sandbox` 类）——不隔离文件系统/网络，只是进程卫生，配不上"OS 级防线"名义。
Windows 现状：防线维持"bash 默认全审批 + 路径硬边界"（§1.4/§10 原对策），OS 级沙箱连同网络隔离排期至有原生组件诉求时再立项。依据：doc/02 §8 阶段五工单 5.2、§10 风险表；Claude Code sandboxing 官方文档；dsh sandbox 设计笔记。

### D16 MCP 工具 = ToolRegistry 一等公民，同一管线一视同仁（2026-08-25，阶段五工单 5.3）

决策：外部 MCP server 经 `~/.spark/mcp.json`（可选；version 1 + servers 表，stdio transport）声明。引擎构造时 `McpManager` 逐 server 连接（spawn + initialize + listTools，10s 墙钟上限）并把每个工具包成 `ToolDefinition` 注册进**同一 ToolRegistry**——命名 `mcp__<server>__<tool>`（register 重复名抛错兜底与内置冲突）、审批 `action=mcp.call` + `resource=<server>/<tool>`（默认 ask，permissions.json 三态规则照常生效）、`parallelizable=false`（外部进程副作用不透明，串行 barrier）、inputSchema 用 `z.fromJSONSchema`（materialize 的 toJSONSchema 往返已实证）。限界/溢写/事件纪律由管线免费复用——外部工具与内置四工具零差别路径。server 入口 `await engine.ready()` 后才 listen；shutdown 关闭全部子进程。
理由：工具管线（审批/限界/溢写/事件）是本仓库引擎铁律的核心资产，任何绕过管线的外挂工具通道（独立调用路径、独立审批 UI）都会制造第二事实源；schema 往返（JSON Schema ↔ zod）打通后 MCP 工具对模型就是普通工具。
否决备选：① 按 server 独立聚合层（McpToolGateway 旁路管线）——重复实现审批与限界，违反"一视同仁"验收语义；② HTTP/SSE transport 一并支持——本地 stdio 是 MCP 主流形态（npx 一行拉起），远程 server 排期到有真实诉求（§9.1 配置化膨胀警戒）。
失败闭合：单 server 连接失败只 warn 跳过（该 server 工具不注册，引擎照常启动）；工具调用失败 `E_MCP_CALL`；turn 中断 `E_ABORTED`。依据：doc/02 §8 阶段五工单 5.3；@modelcontextprotocol/sdk 1.30.0（Client/StdioClientTransport/InMemoryTransport）。

### D17 子代理 = 独立子会话（header.parentSession），主会话只见工具事件对（2026-08-25，阶段五工单 5.4）

决策：Task 工具（input `{prompt, title?}`，审批 `agent.task`/`task` 默认 ask，串行 barrier）执行体 = `Engine.runSubagent`：createSession({parentId}) 派生**独立会话**（JSONL/header/审批/索引/事件流全复用，header 记 parentSession——fork 另记 parentPath/parentEventId 可区分）；订阅先于提交，等子 turn.completed，返回最终 assistant 文本（tool.completed 的 output，限界溢写由管线免费复用）。单层限制：`subagentChildren` 集合标记派生出的会话，子会话内再派生 → `E_SUBAGENT_DEPTH`（进程生命周期内有效，不落盘）。父 turn 中断级联：ctx.signal abort → child.interrupt()；"父先中断、子 turn 后开始"竞态由子 turn.started 事件时补一次 interrupt 关闭。Steer `expectedTurnId` 校验同步落地（§5.4 多 turn 并发前提）：submit 可选参数，无活动 turn/不匹配 → `E_TURN_MISMATCH`（HTTP 409），不传保持宽容路由。
理由：独立会话零新词表——事件流形态（durable/live/surface 纪律）、审批管线、会话索引、重启恢复全部现成；主会话上下文只多一对 tool.started/completed，不被子代理事件淹没（surface 纪律）。fork（工单 4.5）已验证 parentSession 头字段路线。
否决备选：① 子代理事件内嵌主会话流（嵌套 turn/子 turn 事件进主流）——需扩事件词表 + 前端 applyEvent/树结构改造 + 投影 surface 判定复杂化，"最小落地"原则下全是否决项；② 子代理结果作为独立 durable 事件类型（如 task.completed 自定义事件）——违反"事件词表从 protocol 开始"的演进纪律且无必要（tool.completed 已承载）。依据：doc/02 §8 阶段五工单 5.4、§5.4 Codex 对照（ExpectedTurnMismatch）。

**补记（2026-08-29，阶段七工单 7.8 触发）**：**并行解除**——task 工具 `parallelizable` 由 false（串行 barrier）改 true：每个子代理在独立子会话跑（独立事件流/输入队列/审批管线），并行互不串扰；并发上限仍受管线 `maxToolParallel` 分批约束；单层限制与父中断级联语义不变（ctx.signal abort 逐子 cascade）。**树状运行监控**——`ToolContext.sourceEventId`（pipeline 注入本次 `tool.started` 事件 id）经 `createSession({parentEventId})` 写入子会话 header → `scanForkChildren` 把子代理子会话锚定到派生它的工具事件上（此前子代理子会话因无 parentEventId 不可见，树视图只认 fork）；`ForkChildDto.status` 携带运行态快照（已加载会话实时读 `statusOf`，未加载 idle），前端 SessionTreeDialog 复用 SessionStatusDot，activeTurn 活跃态优先于 DTO 快照（同 Sidebar 语义，DESIGN §8）。

### D18 事件词表扩展 = 运行时注册表 + declaration merging，插件是声明不是程序（2026-08-25，阶段五工单 5.5）

决策：`@spark/protocol` 新增运行时扩展注册表（`registerEventType`/`eventSchemaOf`/`isExtendedLiveOnly`）——插件事件类型（强制 `plugin.` 前缀，zod schema 由清单 JSON Schema 经 `z.fromJSONSchema` 转换）注册后与内置 19 种走**同一条校验路径**（EventBus/parseEnvelope/SessionStore 读端统一查 `eventSchemaOf`）。编译期扩展仍走 declaration merging（§4.3 原设计），运行时注册表是 JS 清单的对位。扩展事件信封一律带 `ignorable: true`：durable 走同一落盘管线（占行号），liveOnly 走直播不落盘；插件卸载后旧会话可加载（store 未知 type + ignorable 跳过），未装插件的前端对未知 ignorable 帧跳过不断流（web transport 与 store 读端同策略）。skills/插件 = `<root>/skills/<name>/skill.json` **声明式清单**（version/name/events/hooks），**不执行任意代码**——hooks 是声明式触发器（on 内置事件 → emit 插件事件，data 固定形状 `{skill, sourceEventId, sourceType}`，无自定义构造器）；on 限定内置词表类型（防插件事件自触发循环）。单个 skill 坏清单/类型冲突/钩子非法 → warn 跳过（引擎照常启动，与 MCP 单 server 失败同纪律）。
理由：插件与 MCP 分工——MCP 扩**工具**（子进程，有审批管线兜底），skills 扩**事件词表与钩子**（纯数据，无进程无代码执行面）；声明式使插件不可编程作恶，ignorable 信封使装/卸不破坏旧会话（与 §4.4 协议演进的 fail-closed 兼容：非 ignorable 未知事件仍拒绝加载）。
否决备选：① 插件 = JS 模块动态 import（Claude Code plugins/OpenClaw plugin-sdk 路线）——任意代码执行面 + 打包/权限复杂，"最小落地"下不需要；② 只做编译期 declaration merging 不做运行时注册——用户装插件不重编译，运行时注册表是 ~/.spark 目录扫描的必要对位；③ 扩展事件走独立旁路校验——违反"事件词表从 protocol 开始"纪律，制造第二事实源。依据：doc/02 §4.3 merge-extensible 设计、§8 阶段五工单 5.5；示例插件 `examples/skills/demo-ping/`。

### D19 CLI TUI = Ink v6（React 19 生态一致），弱终端降级策略内置（2026-08-26，阶段八选型，工单 8.2）

背景：阶段八建 apps/cli，需在"组件化 TUI 框架"与"自绘终端渲染"间选型；约束=复用既有 React 心智与 @spark/protocol 消费层、冷启 <1s（doc/06 基线）、80 列可用。
候选：① Ink v6——React 19 同生态、声明式组件、Claude Code 同路线（其 TUI 形态可对照）；② blessed/neo-blessed 系——全功能但多年无维护（幻觉依赖红线）；③ 纯 ANSI 自绘（pi 路线）——pi 实证了 retained-mode 组件 + 差量渲染（只重绘首个变更行起的内容）+ 同步更新转义序列（CSI ?2026h/l）防闪烁 + 写 scrollback 不抢视口（保留原生滚动/搜索），但其成本是自维护渲染层。
结论：**Ink v6**。理由：团队单栈 React（D2/D20 同理），声明式模型让 applyEvent reducer 的状态直接映射组件树；Claude Code 同路线意味着形态与交互有成熟对照；渲染质量差异（Ink 全帧重绘 vs pi 差量）在会话长度可控的 TUI 场景可接受，长输出由折叠与虚拟化兜底。pi 的差量渲染记为性能不达标时的演进方向（不预埋）。
后果：apps/cli 依赖 react+ink（均 MIT）；降级策略——能力检测 `supportsColor`，无真彩降 256 色、再降 16 色；<80 列隐藏会话侧栏（8.2 验收项）；冷启预算进 nightly（doc/06 §3）。

**修订（2026-08-31，阶段十工单 10.8，晚风拍板）**：形态自"四区（侧栏/消息流/输入框/状态细条）"改为**纯单栏会话优先**——砍会话列表侧栏，会话管理退 `/new` 与 `/resume` 面板；状态细条改 footer 双行（§13.K K.4 决策④：→项目·git:(分支)·模型·上下文 %；审批模式行；异常插行红字；seq 水位与 token 明细收 `/stats`）。理由：2026-08-30 Qwen Code CLI 实测 15 张截图对照——单栏 + 面板族（帮助/恢复/统计）在终端窄视口下信息密度与导航成本均优于常驻侧栏；侧栏数据（会话快照）降级为 /resume 面板数据源，不删数据只换形态。技术选型（Ink v6）与降级策略不变；`<80 列隐藏侧栏`条款随侧栏移除自然失效。

### D20 移动端 = Expo + React Native，逻辑层全复用（2026-08-26，阶段九选型，工单 9.2）

背景：阶段九 Android/iOS App；引擎经 REST+SSE 消费，客户端只需投影层。
候选：① Expo+RN——与 web 同为 React 19 心智，applyEvent reducer 是纯逻辑可直接复用，OTA 更新与原生模块生态成熟；② Capacitor——WebView 套壳，web 代码零改动复用，但长会话 SSE 在 WebView 的后台存活/手势体验差，与 desktop（Electron 壳包 web）同质化、无独立价值；③ PWA——零商店分发成本，但 iOS Safari 的 SSE/通知/后台限制硬伤。
结论：**Expo+RN**。UI 层重写（RN 组件），四件共享资产照 D22；主题由 DESIGN §13.C token 映射 RN Theme（亮色默认、深浅跟随系统）。
后果：新增 apps/mobile（Expo SDK，MIT）；E2E 用 Maestro（doc/06 L5）；CI 增 RN typecheck+Jest；服务端零改动（配对鉴权除外，D24）。

### D21 小程序 = Taro 4 复用逻辑层；合法域名约束如实记录（2026-08-26，阶段九选型，工单 9.4）

背景：微信小程序端复用 Spark 协议层；约束=小程序运行时非浏览器、wx.request 有合法域名白名单。
候选：① Taro 4（React 语法）——与 RN/web 共享组件心智与逻辑层，编译到小程序；② 原生 WXML/WXSS——运行时最贴但全部重写，四端共享归零；③ uni-app——Vue 系，与仓库 React 栈断裂。
结论：**Taro 4**。逻辑层（protocol/applyEvent/文案表）直接复用，UI 层 Taro 组件重写。
**合法域名约束（如实）**：wx.request 生产环境要求 HTTPS+备案域名——v1 仅开发者工具与体验版可走局域网 IP（勾选"不校验合法域名"），**正式分发需中继服务**（WSS 转发 SSE 或轮询网关），记 v2 项（届时补 ADR）；本条不构成对"引擎零 fork、一律 REST+SSE"（D22）的修改——中继是传输桥接不是协议分叉。
后果：小程序包体积受微信上限约束（主包 <2MB），protocol 按需引入；miniprogram-simulate 测试（doc/06 L5.5）。

### D22 四端复用边界：四件共享资产 + 各端原生 UI，引擎零 fork（2026-08-26，阶段六~九总纲）

决策：全端共享四件——**@spark/protocol（词表/DTO）、applyEvent reducer、错误码人话文案表、设计 token（§13.C）**；UI 层各端原生——web=React DOM、desktop=Electron 壳包 web（D14）、cli=Ink（D19）、mobile=RN（D20）+小程序 Taro（D21）；**引擎零 fork，所有端一律 REST+SSE，headless 边界不破例**。HttpTransport 内核（SSE 解析/重连/错误映射）下沉 packages/protocol 供 web/cli 共用（工单 8.1）；RN 侧做传输适配层（fetch/EventSource），协议不变。
理由：投影哲学（§2 一句话）的价值在多端兑现——协议定了界面自然定了（会话投影类）；管理域 CRUD 页（DESIGN §13.0）各端形态分化，但操作对象仍是同一 REST 面。
后果：引擎/协议改动天然四端受益；端特化层禁止夹带业务逻辑（违反即架构破坏，§6 职责表同纪律）；错误文案表单一来源（6.7 落地时建表）。

### D23 复用与许可：npm 依赖 + MIT 片段注明出处，参考项目仍禁克隆（2026-08-26，多端依赖前置）

决策：AGENTS 第十二条（参考项目禁止克隆本地）**维持不变**，多端阶段同样在线调研；允许的复用=①成熟 npm 依赖（pi-ai 先例，D3）+②MIT 许可代码片段（注明出处与许可证）。多端新增依赖逐项许可核验：Electron（MIT）、Ink（MIT）、Expo/React Native（MIT）、Taro（MIT）、Playwright（Apache-2.0）、@modelcontextprotocol/sdk（MIT）——与既有栈（React MIT、Fastify MIT、pi-ai MIT、zod MIT）同谱。
理由：Apache-2.0 与 MIT 均允许商用闭源集成（保留版权声明即可）；引入 GPL/AGPL 依赖会传染本仓许可选择（LICENSE 缺口 doc/05 G6 悬而未决，落地前必须先定——倾向 MIT）。
后果：新增依赖进 PR 时附许可证行；claude-code-analysis（泄露源码）红线不变——只读理解，一行不抄。

### D24 配对鉴权 = 非环回强制 token + 6 位配对码换长效 token，缺省行为不变为红线（2026-08-26，阶段九工单 9.1 架构依据）

背景：移动端真连需 server 监听非环回地址；现状 127.0.0.1+无鉴权是刻意缺省（§4 传输行），不能为移动端破坏桌面/本地安全模型。
候选：① 配置文件固定 token——简单但泄露后无轮换路径；② mTLS——本地场景证书管理过重；③ **6 位配对码换长效 token**——ZCode/Claude Code 远程配对同范式，UX 与安全平衡。
结论：`server.host` **显式配置才可非环回**（SPARK_HOST 环境变量语义收紧）；非环回绑定强制开启 token 鉴权；配对流程=移动端扫码/手输 6 位短码（60s 有效）→ POST 换长效 token → REST 与 SSE **同口径**校验（SSE 经查询参数或首帧握手，实现细节工单定）；无 token 且非环回 → **拒绝启动（fail-closed）**。**缺省行为（127.0.0.1+无鉴权）不变为红线**——不配 host 的用户升级后零感知。
后果：web 设置页新增配对管理 UI（已配对设备列表+撤销）；token 撤销后已连 SSE 立即断开；配对码/ token 存 ~/.spark/（secrets 纪律同 7.1）；服务端改动仅限 9.1 声明范围（doc/02 阶段九纪律）。
**补记（2026-08-26，移动端规格 DESIGN §13.J 定稿触发）**：配对 UX 定稿为**扫码为主**——桌面/web 设置页出示 QR（内容 `spark://pair?host=&port=&code=<一次性短码>`），App 扫码确认后换长效 token（Qoder CN 实测同范式）；**手输 6 位码降为兜底路径**（无相机/扫码失败）。token 交换与校验机制不变：REST/SSE 同口径、撤销即断、fail-closed。

### D25 长期记忆 = SQLite FTS5 trigram + 事件化注入，注入即落盘守 surface 纪律（2026-08-27，阶段七工单 7.5 迷你 ADR）

背景：跨会话记忆是 doc/07 H05 缺口（工单 7.5）；向量检索明示后置——词法召回先行。
候选：① system prompt 静态拼入记忆——违反 surface 纪律（模型可见但事件流无记录）；② 注入为 user.message 前缀（合成用户消息）——污染用户转录（分不清用户说的还是系统注入的）；③ **独立 `memory.injected` 事件 + Projector 投影**。
结论：存储 = `~/.spark/memory.db`（node:sqlite，memories 表 + FTS5 **trigram** 虚表外容模式 + 触发器同步——unicode61 对连续 CJK 整段成词不可子串命中，trigram 修复；FTS5 建表失败降级 LIKE，引擎照常启动）；检索召回链 = 整串 trigram MATCH → 整串 LIKE → 拆词最长词 LIKE（中文整句语义召回为已知限制，向量后置）；工具族 `memory.save/memory.search`（审批 action `memory.write/read`、resource 恒 `memory`，空规则表缺省 ask 可 always 固化）；**注入 = 会话首条 user.message 之前 emit `memory.injected`（durable 落盘）→ Projector 投影为模型上下文首条前缀 user 消息**——模型可见（投影）与被记录（事件）双面成立，锚点后过滤与 surface 事件同规则（压缩后不重复注入）；每会话仅首条触发、命中空集不 emit。管理面 = GET/DELETE /api/memories（设置页列表+删除）。
后果：事件词表 20→21 种（`memory.injected`，applyEvent/round-trip/文档计数同步）；Engine 持 MemoryStore 句柄（打开失败 null 降级——工具不注册、注入不接线）；向量检索升级时只换 MemoryStore.search 实现，注入协议与 UI 零改动。

### D26 自动化 = 进程内 tick 循环 + 三类触发器，触发即建会话发 prompt，失败运行结构化留存（2026-08-29，阶段七工单 7.6 迷你 ADR）

背景：doc/07 H06 缺口——无任何触发器引擎；工单 7.6 要求 cron / watch / webhook 三类触发 → 自动建会话执行 prompt + 任务列表/运行历史 UI（DESIGN §13.F.3）。
候选：① 外挂系统调度器（crontab/计划任务）回调 webhook——跨平台安装路径分叉，且脱离引擎生命周期（引擎没跑时触发了也无人处理）；② 独立守护进程——违反单进程本地模型（D5/D10）；③ **引擎进程内 AutomationManager tick 循环**——引擎在跑才谈自动化，与"本地 127.0.0.1、无后台常驻"定位一致。
结论：`AutomationRegistry`（`~/.spark/automation.json` 原子写存触发器定义 + `automation-runs.jsonl` 追加写运行历史——与会话 JSONL 同一单写者纪律）+ `AutomationManager`（setInterval tick，cron 自研解析器支持 `*`/范围/列表/步长与周日 7→0 归一；同分钟去重防重复触发；watch 基线比对文件 mtime；webhook/手动按需触发）；**触发效果恒为"建会话 + 发 prompt"**（FireDeps.createSession 注入，引擎接线，测试可替身）；**失败闭合**：触发器禁用/不存在/类型不符一律拒绝（E_TRIGGER_DISABLED/E_TRIGGER_KIND/E_TRIGGER），fire 失败不吞——运行历史行留结构化 `error` 字段（验收条款"失败运行有结构化错误留存"）。协议面 = AutomationTriggerDto/AutomationCreate/AutomationRunDto + Transport 七方法（从 packages/protocol 开始，AGENTS §2.5）；路由 7 端点（/api/automation*），错误码前缀映射 E_TRIGGER*/E_CRON。
后果：web 新增 /automation 页（§13.F.3 形态：模板网格+任务列表+运行历史）；**"保持电脑唤醒"开关不在 web 落地**——系统电源权限归桌面壳（Electron 阶段再议，web 无此能力，如实缺省而非假实现）；引擎未运行时触发器不生效是刻意语义（不做补偿触发，避免"补跑"带来的不确定性）；watch 触发器数量大时 mtime 轮询成本线性增长，为已知限制（文件监听库后置）。

### D27 browser 工具族 = BrowserDriver 端口 + 引擎级单页共享 + 截图落盘走静态面（2026-08-29，阶段七工单 7.10 迷你 ADR）

背景：doc/07 H09 缺口——无浏览器能力（Computer Use 类工具缺席）；工单 7.10 要求 browser.open/click/read/screenshot 四工具、审批默认 ask、截图经工具输出限界、前端 BrowserCard 可视化。
候选：① 每会话独立浏览器实例——资源放大且无必要（浏览器页面本就是进程级副作用面）；② MCP browser server 外挂（Playwright MCP 形态）——多一个子进程生命周期与一条审批旁路，而引擎审批管线已是一等公民通道；③ **引擎内置工具族 + BrowserDriver 端口**——与 MCP 工具同管线一视同仁（D16 判例），测试以假驱动替身。
结论：`BrowserDriver` 端口（open/click/readText/screenshot/currentUrl/close），生产实现 = `playwright-core` headless chromium **懒启动**（首次 browser.open 才 launch，构造期零依赖；缺浏览器二进制/包 → 执行期 E_BROWSER_LAUNCH fail-closed）；**引擎级单例单页**——四工具一律 `parallelizable: false` 走串行 barrier，天然互斥；跨会话共享同一页是刻意语义（同进程同权限面）。审批：`browser.navigate`（resource `url:<目标>`）/ `browser.interact`（click）/ `browser.read`（read/screenshot），resource 均含当前页 URL——空规则表缺省 ask，域名白名单可 always 固化（`url:https://docs.**` 风格）。中断：`ctx.signal` race 即返 E_ABORTED（底层 Playwright 操作跑到静默，同"已启动工具不硬杀"纪律）。**截图不进事件流**：PNG 落 `~/.spark/browser-shots/`，工具输出只回文件名+字节数（天然过 32KB 限界），GET /api/artifacts/:file 白名单文件名校验后供图（前端 BrowserCard 展示；路径逃逸零面）。
后果：事件词表不变（工具事件走既有 tool.started/completed）；`playwright-core` 入引擎依赖（安装不自动下载浏览器——`npx playwright install chromium` 是显式前置，缺失时工具报错而非静默降级）；read 输出正文截断 + 管线输出限界双重保护；多页/有头模式/网络隔离（D15 同源后置）进 v2 候选池。

## 6. 模块速览（职责边界）

| 模块                | 职责                                        | 不许做                                     |
| ------------------- | ------------------------------------------- | ------------------------------------------ |
| `packages/protocol` | 事件词表/API 类型/Transport 接口/zod schema | 任何业务逻辑、运行时依赖（除 zod）         |
| `packages/engine`   | 输入队列/RunLoop/工具/审批/会话/LLM 网关    | 不感知 HTTP；不 import 前端代码            |
| `apps/server`       | REST 薄壳 + SSE + 静态托管                  | 不写业务（全部委托 engine）                |
| `apps/web`          | UI 渲染与交互                               | 不做协议外的数据加工；不改写事件（只投影） |
| `apps/desktop`      | Electron 壳：sidecar 生命周期 + 窗口（D14） | 不 import 引擎/协议；不写业务             |

## 7. 演进路线（摘要）

阶段一 骨架（协议+Mock）→ 二 前端全量（对 Mock）→ 三 引擎跑通（切真实 Transport）→ 四 深度体验（steer/压缩/fork/checkpoint/SQLite 索引）→ 五 产品化（Electron/沙箱/MCP/子代理/skills）→ **六 UI 重构（ZCode 化，DESIGN §13）→ 七 Harness 补全（doc/07 缺口 P0→P2）→ 八 CLI TUI（D19）→ 九 移动端三端（D20/D21/D24）**；v2 候选池不阻塞（doc/02 §8.7）。任务清单级细节见 doc/02 §8。

## 8. 已知风险（摘要）

pi 包 0.x（隔离单点+锁版本）；AI Elements 面向 Next.js（copy-in 适配）；本地安全（默认全审批+路径硬边界，沙箱后置）；协议演进（durable version 预留+fail-closed 读端）。完整表见 doc/02 §10。

## 9. 代码"AI 生成味"黑名单（后端与通用代码，硬约束）

> 本节是引擎/服务端/协议包代码的"AI 味"**唯一完整清单**（AGENTS.md §2.11 引用此处；前端外观黑名单在 DESIGN.md §12）。适用于 `packages/*` 与 `apps/server`。
> **依据**（2026-08-23 外部调研）：arXiv 对 AI 生成代码的大规模实证——坏味道占全部问题的 **89.3%**；Microsoft 内部数据——AI 代码比人写的**冗长 20-30%**；社区共识：AI 会生成"看起来很企业级"的 plausible structure（貌似架构合理，实为模板惯性）。
> **总原则：boring code**。无聊、可读、只做好一件事的代码是目标；"看起来专业"是负分。删掉一层抽象若不破坏功能，就删——每次都删（社区 litmus test：如果这是你独自维护的代码，你还会这么写吗？不会 = 过度设计）。

### 9.1 过度设计（AI 最高频代码味）

- **无据设计模式**：工厂/DI 容器/抽象基类/Strategy 策略族——两数相加不配拥有 Factory；只有一种实现的接口（Speculative Generality）。
- **自定义异常层级税**：为内部工具建 Exception 继承树。我们用协议错误码（doc/02 §5.6.3）+ `Error` 携带 code，不建层级。
- **配置化膨胀**：YAML/JSON 配置加载器、options 对象爆炸——参数只有一种现实取值却做成可配置（`models.json` 之外不新增配置文件，除非 ADR 立项）。
- **多余分层**：service→manager→helper 套娃；单文件 80 行能说清的事拆五个文件。模块边界以 §6 职责表为准。
- **预留扩展点**：MVP 边界外的接口预埋（AGENTS §2.9 已禁 MCP/子代理/skills/沙箱预埋）。
- **一次性代码的企业级包装**：给内部脚本配 README/CLI 参数解析/JSDoc。

### 9.2 防御式噪音（多数直接违反引擎铁律）

- **空 catch / 吞异常 / catch 后 log 一下返回假值**——违反"失败闭合"（事件流永不悬空）：错误必须转为显式失败事件或向上抛，禁止静默吞掉。【P0】
- **mock/占位实现混入生产路径**（返回假成功、TODO stub 假装完成）——违反"禁止假状态"；未实现的路径必须显式报错。
- **无意义 try-catch**：包裹不可能抛的代码、把错误转成 `null`/`undefined` 返回。
- **到处重试**：网络调用一律 retry×3+指数退避。审批是 fail-closed：超时即拒，不用重试遮丑；LLM 网关重试策略集中在 LlmGateway 一处。
- **幻觉防御**：类型上不可能为 null 却写满 `?.` 与 `??`；zod schema 已是唯一输入校验层（协议铁律），再手写 if 校验链。
- **floating promise**：async 调用不 await 不处理——引擎内一律 await，错误沿事件流闭合。

### 9.3 注释与死代码

- 解释一眼能懂的注释（`// 调用工具执行`）；"提高稳定性""保证安全运行"式空泛注释（中文社区点名的高频 AI 注释味）。
- JSDoc 包裹 trivial 函数；getter/setter 式样板。
- AI 对话/生成痕迹：`TODO(ai)`、"以下是实现"、分割线注释块、大段被注释掉的旧代码。
- 写给 reviewer 的"本次变更说明"注释（应写进 commit message，不进代码）。
- 未被引用的导出、永不可达分支、复制粘贴微改的重复块（≥3 处相同逻辑应提取）。

### 9.4 命名与结构

- 泛化命名当类名/文件名：`data` `info` `manager` `helper` `utils` `handler` `processor`。
- 术语漂移：同一概念一处叫 session 一处叫 conversation（以 protocol 词表为准）。
- 300+ 行 god file（模块职责见 §6；超限先拆职责而不是加注释）。

### 9.5 类型与依赖

- `any` / `as any` / `@ts-ignore` 逃逸（AGENTS §2.4 已禁 any；确需 `unknown` + 收窄）。
- **幻觉依赖**：不存在的包/版本、编造的 API 方法——import 必须能过 typecheck；引新依赖前先查 ARCHITECTURE ADR 是否允许（如响应式框架已被 D8 否决）。
- 重量级依赖解一行代码问题（又引一个校验库/日期库——zod 与现有工具优先）。
- 引擎内裸 `console.log`——日志走结构化脱敏通道（红线 §6.3），裸打印不脱敏即违规。

### 9.6 硬检查（阶段一接入 CI；当前 PR 人工自查）

| 检查                                      | 手段                                                  |
| ----------------------------------------- | ----------------------------------------------------- |
| `catch\s*\([^)]*\)\s*\{\s*\}`（空 catch） | grep / ESLint `no-empty-catch`                        |
| `as any` / `@ts-ignore` / `: any`         | grep / `@typescript-eslint/no-explicit-any`（strict） |
| floating promise                          | `@typescript-eslint/no-floating-promises`             |
| 未引用导出/依赖                           | knip 或 depcheck                                      |
| `TODO(ai)`、被注释的代码块                | grep 评审项                                           |
| 裸 `console.*`（engine/server 内）        | ESLint `no-console`（白名单：CLI 入口）               |
| 注释密度异常（函数体注释行占比过高）      | 评审项                                                |

**调研来源**：

- [A Large-Scale Empirical Study of AI-Generated Code — arXiv](https://arxiv.org/html/2603.28592v2)：484,366 个问题中坏味道占 89.3%。
- [AI-Generated Smells: An Analysis of Code and Architecture — arXiv](https://arxiv.org/html/2605.02741v1)：单代理/多代理 AI 产出的代码与架构级坏味道。
- [AI Loves to Over-Engineer Your Code — dev.to](https://dev.to/tyson_cung/ai-loves-to-over-engineer-your-code-and-youre-letting-it-4p9m)：工厂/DI/抽象类/YAML 配置等具体案例；Microsoft 冗长度 20-30% 数据；boring code 与 litmus test。
- [AI Broke Your Code Review — Bryan Finster](https://bryanfinster.substack.com/p/ai-broke-your-code-review-heres-how)："AI-specific bloat"：貌似合理的unnecessary abstractions、single-use factories。
- [Debloating the AI-Grown Codebase — dev.to](https://dev.to/maximsaplin/debloating-the-ai-grown-codebase-2om)：plausible structure 比 real design 累积更快，主动删除未用抽象。
- [别让 AI 把你的代码注释成废话 — 电子工程专辑](https://www.eet-china.com/mp/a500732.html)：空泛注释（"提高稳定性"）与逐句注释问题。
