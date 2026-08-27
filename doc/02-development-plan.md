# Spark — Agent 产品完整开发方案（实现级）

## 版本记录

| 版本  | 日期       | 作者                                                                                                                                                                                                   | 变更内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0  | 2026-08-22 | AI 编写：ZCode CLI · **GLM-5.3**（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核） | 初稿：技术栈定稿+协议/引擎/前端概要+五阶段路线图                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| v1.1  | 2026-08-22 | 同上                                                                                                                                                                                                   | 扩至实现级：协议完整 TS 类型、引擎伪代码、会话文件格式、五阶段任务清单                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| v1.2  | 2026-08-22 | 同上                                                                                                                                                                                                   | 前端章节扩为完整规格（信息架构/路由/逐屏视图规格/逐组件 props/状态层代码结构/样式系统/Transport 实现/AI Elements 改造清单/性能优化/工程化配置）；新增版本记录表                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| v1.3  | 2026-08-22 | 同上                                                                                                                                                                                                   | **后端章节扩为完整规格**：新增引擎模块总览与依赖图、配置体系（目录/文件 schema）、事件总线实现规格（顺序保证/背压/订阅隔离）、输入队列状态机、Run Loop 函数签名级伪代码、工具系统全规格（注册表/materialize/管线算法/四工具 schema 与错误码表/输出溢写）、审批时序图与规则文件格式、会话持久化算法（投影五步/压缩流程/恢复/分叉/坏行策略）、LLM 网关与重试、错误分类与可观测性、服务端完整规格（路由 zod/SSE 实现代码/错误映射表/优雅退出序列）；版本记录模型信息补全 GLM-5.3                                                                                                                                                                                                                                                                                 |
| v1.4  | 2026-08-22 | 同上                                                                                                                                                                                                   | §2.1.1 新增**前端组件库清单表（库/定位/链接/看点）**——选型时直接点链接预览长相用（此前仅在会话中给出，未写入文档，属遗漏）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| v1.5  | 2026-08-22 | 同上                                                                                                                                                                                                   | §6 开头新增交叉引用：**`03-frontend-approach.md`**（前端专题：六大参考项目前端实现逐一分析、我方八条设计原则、与传统 Web 前端的十二维对比）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| v1.6  | 2026-08-22 | 同上（决策：晚风 Wanfeng1028）                                                                                                                                                                         | §1.1 定位移除"本地优先"措辞（事实不变，不作明面标签；127.0.0.1 绑定等实现细节保留在 §7/D5）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| v1.7  | 2026-08-23 | 同上                                                                                                                                                                                                   | §9 速查表新增三行：Gemini CLI（core/ui 分包+confirmation-bus）、OpenClaw（gateway-protocol+插件合同）、Hermes Agent（多渠道/子代理/沙箱后端）——与 01 §7.3/§10 同步                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| v1.8  | 2026-08-23 | 同上                                                                                                                                                                                                   | §9 再补两行 Gemini CLI 细化借鉴点（TOML 策略引擎分层规则带、上下文压缩双层管道），表头计数修正为 28 条；与 01 v1.5 的 7.3.1 细化同步                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| v1.9  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，目标"照文档能直接开发完全"）                                                                                | 前后端规格补全：新增 §4.5.1 DTO 定义（SessionMetaDto 含 status）、§4.7 Mock 四场景脚本表（§8 阶段一同步 3→4）、§5.9 ResolvedModel 与消息/工具投影（models.json 补 contextWindow）、§6.1 apps/web 文件级结构、§6.2.1 欢迎页完整规格、新增 §6.2.3 SettingsDialog 规格、§6.3 结构布局细则、§7.2 逐路由实现要点表、§7.5 静态托管展开                                                                                                                                                                                                                                                                                                                                                                                                                              |
| v1.10 | 2026-08-23 | 同上（发起：晚风，Qwen Code 入参考体系）                                                                                                                                                               | §9 速查表 28→29 条：新增 Qwen Code 行（多协议 provider 运行时切换/daemon+IM 多客户端形态；GUI 生态 gemini-cli-desktop）——与 01 v1.7 同步                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| v2.0  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"像 Codex/ZCode 一样的自己的 agent"）                                                                       | （+0.1 数值进位，非大重构）**新增 §5.11 提示词规格**（system prompt 组装与草案/四工具 description/compaction 与标题提示词；含"禁删文件"纪律对齐 AGENTS §2.10）；§4.4 信封补 version/ignorable 演进预留；§4.5/§4.6/§7.3 SSE 订阅语义（全局直播+按需回放）；§5.1 配置 zod schema 表；§5.6.3 跨平台规则（bash 执行器/超时 kill/路径，默认决策可推翻）；§5.8.1 mungeDir 算法；§6.3 CommandPalette 规格；§6.4 store 骨架与 rAF 接线；§6.6 全局单订阅改写；§8 阶段二/三 checklist 补项（CommandPalette/ScriptedLlm）；新增 §8.6 测试矩阵                                                                                                                                                                                                                            |
| v2.1  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，继续迭代至"照文档开发完"）                                                                                  | 新增 §3.1 工程基础配置（pnpm-workspace/tsconfig.base/scripts 表/pi 精确 pin）、§4.3.1 zod schema 骨架（idOf/EventSchemas satisfies/EnvelopeSchema）、§5.10 错误码总注册表（15 码×载体）、§6.10 核心端到端时序四图（冷启动/turn/审批/断线重连）；§4.4 信封补 **parentId**（修复与 §5.8.1 落盘行的规格矛盾）+ 磁盘/wire 同构声明；§4.7 Mock 锚点语义表；§6.4 **回放×直播 seq 去重规则**（修复全局订阅+REST 回放的重复应用隐患）；尾注版本同步                                                                                                                                                                                                                                                                                                                   |
| v2.2  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，同前目标第四轮）                                                                                            | 新增 §1.4 安全模型表（7 威胁×对策×落点：提示词注入/路径逃逸/密钥泄漏等）、§3.2 各包 manifest 依赖表（含"web 不依赖 engine"约束）、§4.8 协议一致性样例（normal 场景逐行 JSONL，兼测试夹具）、§5.2.1 SessionManager 职责规格、§6.11 全局键位表；§5.10 pino 字段表与脱敏正则；**§8 阶段一工单化**（6 工单×产出×验收×依赖）；尾注 v2.2                                                                                                                                                                                                                                                                                                                                                                                                                            |
| v2.3  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028）                                                                                                            | **阶段一开工**：工单 1.1（workspace 骨架，0c135ca）与 1.2（@spark/protocol 唯一合同，2b289cb）完成并勾选——schema-first 实现：19 事件 zod registry、SparkEventMap 由 infer 派生、parseEnvelope 两步 fail-closed、26 单测全绿。**事实修正：事件词表 21→19 种**（实现时逐条核对，全文 6 处；AGENTS v1.11/ARCHITECTURE v1.6/doc/03 v1.1 同步）                                                                                                                                                                                                                                                                                                                                                                                                                    |
| v2.4  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"参考项目源码摆在那里，要主动对照找缺口"）                                                                  | **参考源码在线对照补强**（依据：pi `packages/agent/src/agent-loop.ts`、opencode `packages/opencode/src/permission/index.ts` 全文研读）：§5.5 截断保护定为 **continue 回喂**（pi terminate=false，此前未定义）+ max-steps 对照决策注记（pi 无计数器，我们保留兜底）+ abort 双检点；§5.6.3 前**进度门控队列**（updateEvents 链+acceptingUpdates 标志，防 progress 晚于 completed 乱序）；§5.7 **七条审批补强**（多 pattern 评估、reject 级联、alwaysPatterns ask 时声明、优先级=扁平化 findLast 实锤、deny 工具不广告、~/\$HOME 展开、shutdown 清 pending）；§5.9 pi 事件映射取舍表（toolcall 流式 v1 不做）                                                                                                                                                    |
| v2.5  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"继续"——第二批源码对照）                                                                                    | **第二批对照**（依据：pi `packages/coding-agent/src/core/session-manager.ts` 全文、Codex `codex-rs/protocol/src/turn_input.rs`、opencode-ai/schema `packages/schema/src/event.ts`）：§5.4 补 **steerQueue 残留转入 queue**（插话不丢失，此前未定义的边界）+ 提交无拒绝态的宽容决策注记（对照 Codex NotSubmittedReason 八种）；§5.8.1 采纳**文件名时间戳前缀**与**会话文件版本迁移链**（pi migrateV1→V2→V3 就地重写），否决"空会话不落盘"（与落盘后广播不变式冲突），记录孤儿条目分歧（pi 宽容/我 fail-closed）；§5.8.5 **compaction 锚点分支隐患**（fork 后 seq≠路径序，阶段四须改 keptFromEventId——pi firstKeptEntryId 实证）；§5.8.6 fork 补 parentSession 源路径 + branch_summary（阶段四+可选）；§4.4 记 opencode metadata 通道与事件级版本共存为 v2 选项 |
| v2.6  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"继续"——第三批源码对照）                                                                                    | **第三批对照**（依据：Codex `reverse_jsonl_scanner.rs` 全文、dsh `deepseek-ai/deepseek-harness` master `surface.ts`+index.ts deriveMessages）：§5.8.3 三条（空 assistant 消息不进转录、逐字直通硬规则、**surfaceOp replace 语义**=模型可见面≠人类转录面，工具结果蒸馏的词表前置研究）；§5.8.4 两条（**seq 连续性校验**补漏、反向扫描恢复模式——冻结前缀/超大行跳过/坏行可继续，阶段四引入）；§5.8.6 fork 边界校验三拒绝码（INVALID_BOUNDARY/OPEN_TURN/ALREADY_EXISTS）。勘误：dsh 仓库名实为 deepseek-ai/deepseek-harness（master 分支），非 deepseek-ai/dsh                                                                                                                                                                                                   |
| v2.7  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"继续把文档完善"）                                                                                          | **第四批对照**（依据：pi-ai `packages/ai/src/{index,types}.ts`、opencode `session/overflow.ts`）：§5.9 **勘误两处**——pi-ai Tool.parameters 要求 typebox TSchema（推翻 v2.0"jsonSchema 零适配"，改 zod→jsonSchema→Type.Unsafe 薄桥集中网关）；Context.systemPrompt 为独立字段（StreamRequest 增 system，入口拆出直传）。§5.5/§5.8.5 压缩触发升级为 **reserve 扣减公式**（usable = input ?? context−maxOutputTokens − min(20k, maxOutput)；threshold 降为手动覆盖）。架构级决策 D9-D13 补录 ARCHITECTURE v1.7                                                                                                                                                                                                                                                   |
| v2.8  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，外部评审指出 §6.9 漏改）                                                                                    | §6.9 测试重点 "applyEvent 21 事件"→**19 事件**（v2.3 批量替换漏网——该处无"种"字未被正则命中，同文内部矛盾的最后一处）；CI 描述补 `check_doc_links.py` 文档一致性检查                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| v2.9 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段一开工指令）                                                                                                                                     | **阶段一完成**：§8 工单 1.3 mock 四场景（afcd5bf）、1.5 web 空壳（ee58c83）、1.4 MockTransport（2f13bf7）、1.6 server 空壳（e45c99a）勾选；阶段验收（mock 假对话全链路）通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| v2.10 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段二开工指令）                                                                                                                                    | **阶段二完成**：§8 阶段二清单 11 项全勾（session-store+applyEvent 24 例单测/ChatView 虚拟化/streamdown+rAF flush/ToolCard 三态/ApprovalCard/Composer 三模式/SessionSidebar/主题与状态条/SettingsDialog/CommandPalette）；阶段验收（四场景 mock 浏览器走查：流式渲染/工具三态/审批挂起拒绝/error 重试/长输出/断线重连）通过                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| v2.11 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段三开工指令）                                                                                                                                    | **阶段三前六工单完成**：§8 阶段三清单勾选 7 项（config 23 例/EventBus 17 例/SessionStore+EventTree 32 例/Runtime+InputQueue 17 例/RunLoop 15 例/ToolRegistry+Pipeline+四工具 32 例/ScriptedLlm 9 例，engine 145 例全绿）；ScriptedLlm 按依赖关系提前至 RunLoop 前完成（run-loop 单测的假 provider）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| v2.12 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段三开工指令）                                                                                                                                    | **阶段三工单 7 完成**：PermissionService（evaluate 三层 findLast 优先级/wildcard 单段跨段/ask 挂起表+事件时序/reply once-always-reject/always 会话临时层写入+同批放行级联/reject 同会话级联+feedback 注入 user.message/超时-中断-dispose fail-closed/deny 工具不广告/项目级规则文件 loadProjectRules，33 例单测，engine 179 例全绿）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| v2.13 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段三继续）                                                                                                                                       | **阶段三工单 8/9 完成**：PiGateway（pi-ai 0.84.3 集成：消息双向映射 toolResult 拆独立消息+toolName 回查/Type.Unsafe 薄桥/provider→api 表/错误内化不抛/429-5xx-网络指数退避 1s/2s/4s±20% 重试 3 次/已交付不重试/abort 前缀保留/generateOnce，31 例）；Projector 投影六步+compaction 锚点（20 例）；engine 230 例全绿。spike 脚本备妥待 DEEPSEEK_API_KEY 实证（工单 8 真实模型验证留给阶段验收）                                                                                                                                                                                                                                                                                                                    |
| v2.14 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段三继续）                                                                                                                                       | **阶段三工单 10a/10b/10c 完成**：Engine 门面（createSession/resume/listSessions/replyPermission/shutdown，per-session 循环串，跨会话并发，13 例单测）；server REST+SSE 全端点（POST sessions/messages/interrupt/permissions + GET sessions/sessions/:id/event，zod 400/404/409/503 映射，SSE 回放水位+直播+心跳+背压+bye 帧，23 例）；web HttpTransport 与 context 接线（SSE 帧解析/注释帧忽略/退避重连/resync 重放/REST 错误映射/断线状态，18 例）；全仓 313 例（engine 243 + server 23 + web 47）+ typecheck/lint 全绿；§8 阶段三工单 REST+SSE+HttpTransport 行勾                                                                                                                                                                                                                                                                                              |
| v2.15 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段三继续）                                                                                                                                       | **阶段三工单 11 完成**：Logger 封装（pino v10 stdout + `<root>/logs/engine.log` 双路，info 级别，字段约定 sid/turnId/callId/code/durMs）；写入前脱敏三层正则（sk-xxx 20+ 字母数字 / Bearer + token / process.env ≥6 字符值出现处 → ***），递归遍历对象数组 Error；bus subscriber 异常与 SessionStore 尾行半写接入 logger；Engine 生命周期 4 条日志（start/shutdown.start/shutdown.done/shutdown.error + ownsLogger close await flush）；8 例单测；§8 阶段三工单 pino 行勾；全仓 367 例（engine 251/server 23/web 47/protocol 46）+ typecheck/lint 全绿；阶段验收（真实模型闭环/断线重连/kill-9 resume）待 DEEPSEEK_API_KEY 用户自配后由 e2e-smoke 脚本执行                                                                                                                                                                                                                                                                |
| v2.16 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段四开工指令） | **阶段四工单 4.1 协议演进落地**：`compaction.completed` 锚点 `keptFromSeq` → `keptFromEventId`（§5.8.5 分支隐患——fork 后路径序≠文件行序；Projector/Compactor 改按锚点事件在路径中的位置过滤，含边界；锚点 id 不在路径时退化"摘要+全量"不丢数据）；`permission.asked` 增 `patterns?[]`/`alwaysPatterns?[]`（§5.7 补强 1/3，前端 approval item 透传）；protocol zod + 引擎 + mock 场景（normal/reject）+ 前端 applyEvent + 四端单测同步；全仓 368 例 + typecheck/lint 全绿 |
| v2.17 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段四开工指令） | **阶段四工单 4.2 完成**：steer/queue 完整语义端到端时序单测 3 例（queue 依序消费 FIFO 三 turn 严格配对交替 / 多 steer 下一 step 前按提交序注入采样上下文 / interrupt 后残留 steer 依序转主队列续跑两 turn——§5.4 补漏语义实证）；UI 走查确认 Composer 插话/排队按钮链路真实生效（三态提示→HttpTransport delivery 透传→路由 zod→engine 三态路由，mock @wait:message 演示路径可用）；§8 阶段四 steer/queue 行勾选；engine 255 例全绿 |
| v2.18 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段四开工指令） | **阶段四工单 4.3 完成**：手动 /compact 全链路（Composer 本地拦截 `/compact` → Transport.compact → POST /api/sessions/:id/compact → SessionHandle.compact——引擎仅 idle 受理，turn 进行中 409 E_TURN_ACTIVE；错误码/§4.5 路由表/§7.2 要点表/§6.3 ComposerProps 同步登记）；前端细条轻提示（压缩中→已完成 2.5s）；MockTransport.compact 合成 started→600ms→completed 事件对（锚点=最近 surface 事件）；Projector 正确性四象限补全（有 compaction × reasoning=true）+ Compactor×reasoning=true 重投影 + engine 手动压缩 2 例 + 路由 2 例；全仓 379 例（engine 259/server 25/web 49/protocol 46）+ typecheck/lint 全绿；§8 阶段四 compaction 行勾选 |
| v2.19 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段四开工指令） | **阶段四工单 4.4 完成**：会话自动标题——`engine/src/title.ts` TitleGenerator（§5.11 标题提示词 + serializeTranscript 转录 / maxTokens 50 / trim+截 80 字符空串不发）；engine meta 订阅器在 turn.completed 且无标题时 fire-and-forget 触发（titleTask 在途去重；失败仅 logger.warn 不 emit error，下一 turn 重触发；shutdown 序列增 3.5 步 await 标题任务防 append-after-close）；重启恢复实证（titleOf 路径恢复 meta.title/status idle/listSessions 含标题/恢复不重复触发）；前端 Sidebar 激活会话标题走事件流实时值（liveTitle 覆盖 DTO 静态值，与 liveStatus 同模式）；MockTransport 对等演示（首个 turn.completed 后 400ms 合成 session.title 一次）；新增 title 单测 4 例 + engine 集成 5 例 + mock 1 例；全仓 389 例（engine 268/server 25/web 50/protocol 46）+ typecheck/lint 全绿；§8 阶段四自动标题行勾选 |
| v2.20 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段四开工指令） | **阶段四工单 4.5 完成**：fork 与树视图——引擎 `forkSession`（复制 root→边界路径行重链 parentId + seq 重编 1..k + sessionId 改写、事件 id 保留；header 记 parentSession/parentPath/parentEventId；三拒绝码 E_INVALID_BOUNDARY/E_OPEN_TURN(运行中+边界落 turn 中间)/E_ALREADY_EXISTS；SessionStore.seed 批量落盘不经 bus）+ `treeOf`（EventTree.list 线性链节点 + scanForkChildren 磁盘 header 扫描）；protocol 增 TreeNodeDto/ForkChildDto + Transport.getTree/fork；server 注册 GET /:id/tree（label 摘要截 60 字符）与 POST /:id/fork（错误映射 400/409）路由；前端 SessionTreeDialog（节点链 + hover 分叉 + 子会话 chip 跳转，turn 进行中禁用前置）+ SessionPage 右上角入口；MockTransport 对等演示（内存 fork + isLiveScriptSession 区分流式/回放路径）；engine fork 3 例 + 路由 2 例新增；全仓 394 例（engine 271/server 27/web 50/protocol 46）+ typecheck 全绿；§8 阶段四 fork 行勾选、§7.2 tree/fork 路由行更新 |
| v2.21 | 2026-08-25 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，阶段四开工指令） | **阶段四工单 4.6 完成**：checkpoint 两域简化——新增 §5.8.7 规格（GitCheckpointer：gitDir=<会话目录>/checkpoints/<sid>/.git、work-tree=会话 cwd 全量 add + 会话文件 hash-object 别名 .spark-checkpoint/session.jsonl 入索引、commit --allow-empty、turn.completed 后 snapshot 失败仅 error{io} 不推翻 turn）；引擎 `rollbackToCheckpoint`（仅 idle 受理 E_TURN_ACTIVE → 停 run-loop/关 store → 工作区 reset --hard + clean -fd + 删物化别名 → 会话文件快照 blob 覆写 → 重载补 session.resumed；未启用/不存在 E_NOT_FOUND、git 失败 E_CHECKPOINT_ROLLBACK）+ `checkpointsOf` 索引读出（DTO 不含 commit sha）；server 注册 GET /:id/checkpoints 与 POST /:id/checkpoints/:cid/rollback 路由（§4.5/§7.2 表登记、§7.4 补全 E_TURN_ACTIVE/E_INVALID_BOUNDARY/E_OPEN_TURN/E_ALREADY_EXISTS/E_CHECKPOINT_ROLLBACK 五行）；前端 CheckpointDialog（快照列表 hover 回滚，busy 禁用前置，回滚后 resetSlice + GET /:id 全量重放）+ SessionPage 检查点入口（History 图标与树按钮并排）+ StatusBar 徽标数据源 checkpoint.created（applyEvent 已测）；MockTransport 对等演示（turn 边界派生 checkpoint.created 与 listCheckpoints 同源 ckp_mock_N、getSession 改回已回放 durable 现状使 rollback 截断可走查）；engine 3 例 + server 3 例 + mock 1 例新增；全仓 401 例（engine 274/server 30/web 51/protocol 46）+ typecheck/lint 全绿；§8 阶段四 checkpoint 行勾选 |
| v2.22 | 2026-08-25 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，外部评审整改指令） | **评审整改（协议兼容三项）**：① 旧版磁盘迁移——SessionStore.read 检测阶段三格式 `compaction.completed{keptFromSeq}`，按行号回查事件 id 原位转 `keptFromEventId` 后重过严校验（幂等内存迁移不重写文件；schema 保持严格不双收字段；锚点越界/字段混写仍 fail-closed），store 迁移 2 例（转换+拒绝）；② 悬空锚点不再静默——ProjectorDeps 增 `onDanglingAnchor` 回调（退化兜底触发时结构化 warn `projector.dangling_anchor`，按锚点 id 去重防 modelContext 高频刷屏），engine 接线 logger.warn，projector 1 例（触发一次+无压缩不触发）；③ 文档勘误——摘要消息角色统一为「首条 user 消息」（v2.7 定案 system 走 StreamRequest 独立字段），§5.8.5 删"system: summary 等价"旧表述并补迁移策略段。全仓 404 例（engine 277）+ typecheck/lint 全绿 |
| v2.23 | 2026-08-25 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，阶段四开工指令） | **阶段四工单 4.7 完成**：permission always 持久化+同批放行+规则管理 UI——引擎 UserRuleStore（用户级 ~/.spark/permissions.json 内存持有 + tmp/rename 原子落盘，add 同键覆盖/remove 精确匹配；§5.7 补强 3）接替只读数组成为 evaluate 用户层单一来源；多 pattern 规则消费（补强 1）：PermissionCheck/ToolDefinition 增 patternsOf/alwaysPatternsOf，bash 复合命令按 && \\|\\| ; \\| 分段声明（<2 段回落单资源），evaluateAll 任一 deny 短路→全 allow 直过→一次 ask 携带 patterns/alwaysPatterns；always 固化 = 先落用户级文件再写会话临时层（写盘失败审批仍挂起 fail-closed），同批放行级联复用多 pattern 重评；Engine 门面增 list/add/removePermissionRules 三方法；protocol 增 PermissionRuleDto + Transport 三方法；server 注册 GET/POST/DELETE /api/permissions/rules（§4.5/§7.2 表登记）；前端 SettingsDialog 新增「权限·规则」区（列表/删除/添加表单，即存即生效，§6.2.3 表更新）+ ApprovalCard 多 pattern 清单与固化范围提示；MockTransport 对等演示（内存规则表 + always 按 alwaysPatterns 固化）；engine 9 例（多 pattern 四路径/UserRuleStore 落盘/bash 分段）+ server 1 例 + mock 1 例新增；全仓 415 例（engine 286/server 31/web 52/protocol 46）+ typecheck/lint 全绿；§8 阶段四 permission 行勾选 |
| v2.24 | 2026-08-25 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，阶段四开工指令） | **阶段四工单 4.8 完成（阶段四收官）**：node:sqlite 会话索引 + metrics 端点——SessionIndex 单表索引（<root>/index.db；upsert/touch 仅前进水位/setTitle/LIKE 转义搜索/rebuild 全量重建）；JSONL 恒为权威：boot 自磁盘扫描全量重建对齐、durable 事件增量 touch（meta 订阅器内）、会话装载点 wireSession 单点 upsert（create/resume/fork/rollback 重载共用）、写失败或关库后自动降级磁盘扫描（结构化 error 日志，主流程不受影响）；listSessions 改索引驱动 + `?q` 标题子串过滤（已加载内存态覆盖且同样过 q 过滤），shutdown 先 await 重建完成再关库（防迟到写库撞已关闭句柄）；Metrics 计数器（§5.10 清单）：spark_turns_total{finish}（run-loop finally）/ spark_tool_calls_total{name,is_error}（管线三出口）/ spark_llm_tokens_total{direction}（流式结果 usage）/ spark_permission_decisions{reply}（settle）/ spark_events_durable_total（订阅器）+ spark_sessions_active 快照 gauge，renderMetrics 输出 Prometheus exposition 文本；server 注册 GET /api/metrics（text/plain; version=0.0.4）；session-index 单测 5 例 + engine 集成 2 例（q 过滤/增量水位/重启重建不丢/计数断言/Prometheus 文本）+ server 1 例新增；全仓 423 例（engine 293/server 32/web 52/protocol 46）+ typecheck/lint 全绿；§4.5/§7.2 表登记 metrics 与 ?q、§8 阶段四 sqlite/metrics 行勾选 |
| v2.25 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | **阶段五工单 5.1 完成**：Electron 壳——ARCHITECTURE 新增 ADR D14（sidecar vs 主进程嵌入评估：选 sidecar，HttpTransport 零改动复用/崩溃隔离/用户机零 Node 依赖）；apps/desktop（main 进程三件事：ELECTRON_RUN_AS_NODE 拉起 server 单文件 bundle + healthz 轮询探活 + 加载动态端口 URL；退出 SIGTERM 收尸）；server 最小改动（GET /api/healthz + SPARK_PORT/SPARK_HOST/SPARK_WEB_DIST 环境注入）；esbuild 全量 bundle（createRequire banner 解决 fastify CJS 动态 require）；打包：electron-builder（extraResources=server bundle+web dist，signAndEditExecutable=false 免 wine 签名），Linux 本地 `--win zip` 154MB 产物实证（Electron RUN_AS_NODE 跑 sidecar + healthz 200 + Web UI 伺服全通），NSIS 安装包走 GH Actions windows runner（desktop-win.yml 手动触发；NSIS 卸载器生成需 32 位 stub/wine wow64，容器不可靠）；§4.5/§7.2 表登记 healthz、§8 阶段五 Electron 行勾选；新增 healthz 单测 1 例，全仓 424 例 + typecheck/lint 全绿 |
| v2.26 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | **阶段五工单 5.2 完成**：bash 沙箱——ARCHITECTURE 新增 ADR D15（三平台调研：AppContainer 否决——任意路径只读不可行/dsh 设计笔记实证 + FerroxLabs #321 子进程缺陷 + Node/TS 无维护中绑定；dsh ACL 包 koffi 原生依赖破坏 sidecar 单文件打包；Claude Code 先例 Windows 原生未支持）；最小落地 = 平台 wrapper 前缀（engine `tools/sandbox.ts`：Linux bwrap `--ro-bind / / --bind cwd cwd --dev --proc --tmpfs /tmp` / macOS Seatbelt profile 写限 cwd+tmpdir，workspace-write 语义；网络隔离 v1 不做记 D15）；spark.json `engine.bashSandbox: off\|on`（默认 off 现行为不变）+ makeBashTool 工厂 + registerBuiltinTools opts 接线；wrapper 不可用/平台无路线 → E_SANDBOX_UNAVAILABLE fail-closed 拒跑不降级；§5.1 配置表/§5.10 错误码表登记；沙箱单测 4 例（bwrap 参数/Seatbelt profile/平台路线/fail-closed）+ config 默认值 1 例，全仓 428 例 + typecheck/lint 全绿 |
| v2.27 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | **阶段五工单 5.3 完成**：MCP client——ARCHITECTURE 新增 ADR D16（外部工具 = ToolRegistry 一等公民同一管线一视同仁；否决旁路管线聚合层与 HTTP transport）；`@modelcontextprotocol/sdk@1.30.0`：engine `mcp/config.ts`（~/.spark/mcp.json 可选，version 1 + servers 表 stdio 声明，坏文件 E_CONFIG）+ `mcp/manager.ts`（McpManager 逐 server 连接 10s 上限 + makeMcpToolDef 包装：命名 mcp__<server>__<tool>、审批 mcp.call/`<server>/<tool>` 默认 ask、parallelizable=false 串行 barrier、z.fromJSONSchema ↔ toJSONSchema 往返、callTool 请求级 toolTimeoutMs + signal 级联、输出 text 拼接→structuredContent→占位，失败 E_MCP_CALL/中断 E_ABORTED）；单 server 失败 warn 跳过失败闭合；Engine.ready() + shutdown 4.5 步关子进程；server 入口 await ready() 再 listen；§5.1 配置表 mcp.json 行/§5.10 错误码 E_MCP_CALL 登记；mcp 单测 10 例（config 三路径/包装命名 schema 执行/stdio e2e spawn + **审批三态 allow·deny·ask(reject/once) 经真实子进程与真实 PermissionServiceImpl·EventBus·管线走通**，fixtures/mcp-echo-server.mjs echo+fail 工具）；全仓 438 例（engine 307）+ typecheck 全绿 |
| v2.28 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | **阶段五工单 5.4 完成**：子代理 + Steer 校验——ARCHITECTURE 新增 ADR D17（子会话 = 独立会话 header.parentSession，主会话只见 task 工具事件对；否决内嵌主流与自定义 durable 事件两备选）；Task 工具（engine `tools/builtin/task.ts`：{prompt,title?} 审批 agent.task/task 默认 ask、parallelizable=false、执行体 TaskRunner 端口由 Engine.runSubagent 注入）；runSubagent（createSession{parentId} 派生独立会话、订阅先于提交等子 turn.completed、返回最终 assistant 文本、subagentChildren 单层限制 E_SUBAGENT_DEPTH、父中断级联 child.interrupt + turn.started 补中断关闭"父先断子后开"竞态）；Steer expectedTurnId（protocol SendMessageOptions + SessionHandle.send + runtime.submit 可选参数，beginTurn(turnId) 登记活动 turn，不符 E_TURN_MISMATCH→HTTP 409；server routes/errors + web HttpTransport 透传，不传保持宽容路由向后兼容）；§5.4/§5.6.3/§7.2/§5.10 同步；subagent 单测 5 例（六要素/成功全链路含子会话事件与 header 留痕/深度限制两级闭合/父中断级联 E_ABORTED + steer mismatch 接线/deny E_PERMISSION 不派生）+ runtime steer 校验 4 例；全仓 449 例（engine 316）+ typecheck 全绿 |
| v2.29 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | **阶段五工单 5.5 完成**：skills/插件——ARCHITECTURE 新增 ADR D18（事件词表扩展 = 运行时注册表 + declaration merging，插件是声明不是程序；否决 JS 动态 import 与旁路校验两备选）；protocol `extend.ts`（registerEventType 冲突检测 E_EVENT_TYPE_CLASH / eventSchemaOf 统一查表 / isExtendedLiveOnly / clearExtendedEvents 测试隔离），EventBus/parseEnvelope/SessionStore 读端全部改走 eventSchemaOf（扩展事件与内置 19 种同一校验路径）；engine `skills/loader.ts`（`~/.spark/skills/<name>/skill.json` 声明式清单：events plugin. 前缀 JSON Schema→zod + hooks 声明式触发器 on 内置事件→emit 插件事件 data 固定形状；先全量预检再注册不留半注册态；单 skill 坏清单/冲突/钩子非法 warn 跳过）+ Engine 构造接线（skillsReady 并入 ready()）+ EventBus.emitExtended（durable 同一落盘管线占行号 / liveOnly 直播不落盘，信封一律 ignorable:true）；web HttpTransport 未知 ignorable 帧跳过不断流（与 store 读端同策略）；示例插件 `examples/skills/demo-ping/`；§4.3 扩展落地注记/§5.1 配置表 skills 行/§5.10 错误码登记；skills 单测 8 例（loader 四路径/emitExtended durable·live·校验失败/引擎 e2e：hook 落盘可回放 + "卸载"后重读跳过占行号）+ web transport ignorable 帧跳过 1 例；全仓 456 例（engine 324/web 53/server 33/protocol 46）+ typecheck 全绿 |
| v2.30 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令） | **阶段五完成（收尾）**：§8 阶段五清单 5.2–5.5 全部勾选（沙箱/MCP/子代理/skills 实现均落地并单测/ e2e 实证；沙箱隔离效果、Windows 本机安装走查、真实外部 MCP server 与真实模型现场演示四项待用户环境执行，文字保留注记）；验收行更新——**五阶段全部完成，Spark v1**；README 状态徽章与"当前状态"更新为 v1（阶段一~五完成；README v1.15 同步）；AGENTS §1 项目上下文事实刷新（README/AGENTS 同步） |
| v3.0  | 2026-08-26 | AI 编写：ZCode CLI · ox-alpha（model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；发起：晚风（Wanfeng1028，D2 路线图指令） | **阶段六~九立项工单化（+0.5 进位）**：§8 续写阶段六 UI 重构（6.1–6.8）/ 阶段七 Harness 补全（7.1–7.8、7.10–7.13；**7.9 Python worker 删除**——判决见 doc/07 §4.1）/ 阶段八 CLI TUI（8.1–8.5）/ 阶段九 移动端三端（9.1–9.5），工单表与阶段一逐列对齐（#/工单/产出/验收标准/依赖）；新增 §8.7 v2 候选池（V2-01–V2-22，不阻塞四阶段）；7.4 命令清单基线对齐 Claude Code 命令面 + opencode leader 键模式；输入=doc/07 缺口编号 H01–H36；登记 doc/06-testing-plan.md（D5，测试体系五层）与 doc/07-harness-audit.md（D1，Harness 审计）；README 当前状态行同步（v1.16） |
| v3.1  | 2026-08-26 | 同上（发起：晚风，移动端规格指令 + Qoder CN iOS 实拍 13 张）                                                                           | 阶段九工单对齐 DESIGN §13.J：9.1 配对改**扫码为主、手输 6 位码兜底**（D24 补记同步）；9.2 视觉依据 §13.J（白卡无边框分层/单栈+抽屉/11 页实测映射）；9.3 审批卡纵向全宽与 Composer 胶囊形态锚定；移动端框架 Expo+RN 经用户确认维持 D20 |
| v3.2  | 2026-08-26 | 同上（补供图：Qoder CN 会话页有内容态 2 张）                                                                                           | §8.7 候选池新增 **V2-23 会话管理增强**（删除/归档/置顶）——移动端会话页实测暴露后端缺口：无 DELETE /api/sessions/:id，归档/置顶需 meta 标记；DESIGN §13.J.3 同步升级为实测规格（user 右对齐胶囊/assistant 全宽/操作行/时间戳分隔） |
| v3.3  | 2026-08-26 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段六开工指令） | **阶段六工单 6.1/6.2/6.3 完成**：6.1 主题翻转（09cff97——light 挂 `:root` 默认+dark 收 `.dark` 三档+localStorage 持久化+预上色防闪白+AA 对比度单测 26 例）；6.2 布局栅格（23a8fe5——§13.A 三栏骨架/左栏 264 折叠 48/空态垂直居中/内容列 768/顶栏 44/StatusBar 24/会话按项目分组）；6.3 控件+Composer（1e85f90——button 按 §13.B 重过+Segmented 新增+Composer 按 §13.E 重做：底部工具条/权限四档/**protocol+engine+server 最小面预设层（D7 补记：PermissionPreset 枚举/PermissionService setPreset/presetRulesOf 派生行/plan 档 system 指令逐 step 现读/GET·PUT permission-preset 路由）**——纪律"不动 engine/protocol"的本工单例外已在 PR 说明单列/@ 与 / 菜单纯逻辑+键盘导航/多行 6 行上限/空态 chips 点击填入；engine 预设层 9 例+web 菜单逻辑 16 例新增，全仓 512 例全绿）；开发分支 feat/stage6-ui（PR 审核合入，非直推 main） |
| v3.4  | 2026-08-26 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段六开工指令） | **阶段六工单 6.4 完成**：设置中心骨架+外观区全量——路由 /settings/:page + 三组导航（基础设置/Agent 能力/数据与统计，§13.D）；外观页落地主题/界面字号 13/浅深代码主题（默认 GitHub Light+Minimal Dark）/行号/换行/代码字号 12+双栏实时预览（Streamdown/shiki）；常规区交互行为（三模式默认档）即存即生效，语言/代理/沙箱开关标"desktop 特化/后续工单"占位；权限规则页自 SettingsDialog 迁入 Agent 能力组；settings-store 扩展外观字段（CSS 变量 --spark-ui-font-size/--spark-code-font-size + .spark-code-wrap 类名即存即生效，localStorage 持久化+脏数据收窄）5 例新增，web 105 例全绿。**分歧留决策**：沙箱开关原计划读写 spark.json engine.bashSandbox，本工单纪律"不动 engine"（6.5 已是唯一例外）故降为占位行，待人类裁决是否随 6.5 一并加只读 GET 或排阶段七 |
| v3.5  | 2026-08-26 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段六开工指令） | **阶段六工单 6.5 完成（轻后端例外已声明）**：模型管理三路由——protocol 增 ModelProviderDto/ModelEntryDto/ModelsDto/ModelTestResultDto（strictObject；掩码原则 apiKeyEnv 只回环境变量名）+ Transport 三方法；engine 增 model-catalog.ts（PROVIDER_CATALOG 内置 8 家目录=pi-gateway 流式分派单一来源、listModels 合成、testProvider 廉价鉴权探针 8s 超时+人话文案）+ models.json 增 models[] 可选清单（与 defaultModel/compactionModel 合并去重，用户决策"扩展 models.json"）+ Engine.listModels/testModel/**setSessionModel（内存态下一 turn 生效，getter 化 deps.model——同权限预设层 D7 先例；会话文件 header 不动）**；server 注册 GET /api/models、POST /api/models/:providerId/test（ok=false 走 200）、PUT /api/sessions/:id/model（用户决策"加换模型路由"），E_CONFIG 显式映射 400（原 E_INTERNAL 500 判例同步改）；web——ModelPicker（Composer 工具条中位，供应商分组+上下文窗口 badge+当前勾选，切换经 SessionPage 内存覆盖、禁乐观更新）+ ModelSettingsPage 落地供应商两组列表/状态点/启用 badge/Base URL/Key 掩码（只示环境变量名）/显式测试连接按钮（时延+人话文案+状态点）；MockTransport 对等实现（内存目录副本+换模型表）；engine 20 例（model-catalog 16+engine 2+config 2）+server 3 例+web mock 3 例新增，全仓 543 例（engine 353/server 36/web 108/protocol 46）+ typecheck/lint 全绿；§4.5/§5.1/§7.4 表同步 |
| v3.6  | 2026-08-26 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段六开工指令） | **阶段六工单 6.6 完成**：上下文用量条——session-store 增 `contextUsage`（最近一次带 usage 的 assistant.message/turn.completed 事件，水位数据源；无 usage 事件保持原值）；context-usage.ts 纯函数（contextTokensOf 全量口径 input+output+reasoning+cache 读写、contextWindowOf 模型精确命中回 defaultModel、contextRatio；**CONTEXT_WARN_RATIO=0.8 与引擎 compactionThreshold 默认值同源**）；UsageBar 组件（Composer 上方细条：h-1 进度条+百分比，>80% 转 warn 色，ratio=null 不渲染禁假状态；role=meter）；StatusBar 增"水位 N%"（>80% warn，与 §13.A 规格对齐）；models-store（GET /api/models 一次性缓存，SessionPage 选择器与 StatusBar 水位共用，SessionPage 本地 models state 收编）；Projector 精确估算留 H23 前置（前端以最近一轮 usage 为代理，title 注明估算口径）；web 7 例新增（context-usage 6+applyEvent 1，turn.completed 用例内补断言），全仓 550 例（web 115）+ typecheck/lint 全绿 |
| v3.7  | 2026-08-26 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段六开工指令） | **阶段六工单 6.7 完成**：错误人话化——`lib/error-copy.ts` 单一来源文案表（D22 四端共享资产；server §7.4 全部 12 码 + E_MOCK_UNKNOWN_SESSION/E_MOCK_DISPOSED/E_HTTP_DISPOSED 3 个传输特有码；E_MOCK_UNKNOWN_SESSION→"会话不存在或已被清理"）；humanizeError 解析 "E_CODE: 消息" 前缀（含裸码回退）出 {title 人话, code, detail 折叠原码}，errorMessageOf 供纯文本出口；ErrorBanner 组件（顶部细条+重试按钮+原码折叠展开，SessionPage 加载失败态接入）；ErrorToast（toast 与 fatal 全屏态）同样走文案表；errorMessageOf 接入全部存量 E_* 出口（CheckpointDialog/SessionTreeDialog/ModelSettingsPage/PermissionRulesPage/useSessionList/Composer）；web error-copy 7 例新增（裸码回退/命中/未命中/无码/Error 实例），全仓 557 例（web 122）+ typecheck/lint 全绿 |
| v3.8  | 2026-08-26 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段六开工指令） | **阶段六工单 6.8 完成（阶段六全勾）**：L2 组件测试 22 例（ApprovalCard 三键+feedback+resolved 收起 / ToolCard 三态+展开区 / Composer 三态+发送失败草稿回填——vitest+@testing-library/react+jsdom，dom-stubs 补 matchMedia/rAF）；L3 E2E 7 例（mock 四场景回归+模拟断线恢复+E_MOCK_UNKNOWN_SESSION 人话断言+三视口截图，Playwright chromium 单档、单 worker 串行、webServer 起 vite VITE_SPARK_MOCK=1，`pnpm --filter @spark/web e2e`）；L3.5 基线截图 6 张入 apps/web/e2e/__screenshots__/（welcome/session × 1280/1440/375）。落地差异：沙箱网关拦截 PLAYWRIGHT CDN——SPARK_E2E_BROWSER 支持系统 Chrome executablePath 兜底；vite 绑 localhost 仅 IPv6——webServer 显式 --host 127.0.0.1；虚拟列表节点回收重置展开态——展开断言留 L2。web vitest 144 例全绿（新增 22）+ E2E 连续两轮 7/7 + typecheck/lint 全绿；doc/06 v1.1 同步 |
| v3.9  | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.1 secrets 管理落地**：SecretStore（~/.spark/secrets.json，原子写+0600+坏 JSON fail-closed）+ resolveApiKey 单点（store > env 迁移兼容）+ GET/PUT/DELETE /api/secrets（值永不回传）+ 设置中心模型页密钥区（随工单 6.4 瘦身自 SettingsDialog 迁入）+ Logger.registerSecrets（store 值单点注册进 pino 脱敏层）；§1.4 风险表与 §4.5 API 表同步；阶段七 7.1 勾选 |
| v3.10 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.2 I/O 护栏落地（H02，P0）**：新增事件 `io.warning`（log-only，durable 不 surface，告警只含结构化规则名不含原文——防注入内容/密钥片段经告警二次广播）；**事件词表 19→20 种**（§4.3/§4.4/§6.4 三表同步，AGENTS/ARCHITECTURE/README 同步）；引擎 IoGuard（tools/guard.ts：六条注入标记协议规则 + 敏感输出过滤四层——sk-token/Bearer/env 值/store 值，redaction.ts 脱敏正则单一来源与 pino 共用；递归字符串处理对象形状保留；/g 正则 lastIndex 复位防漏检）挂点 ToolPipeline 成功路径输出限界之后（tool.completed 事件与 run-loop toolResult 回填同源一次过滤两面覆盖）；告警不阻断 turn（warn 闭合非失败闭合）；guard 单测 14 例（六规则样例集/四层过滤/递归形状/管线集成 e2e 含事件原文泄漏自检）+ applyEvent 3 例 + protocol round-trip 20 种；阶段七 7.2 勾选、doc/07 H02 勾销 |

> 依据：`01-research-report.md` 六大项目源码级调研结论。
> 原则：**能复用开源就不自己写；协议先行、前端先行；抄设计而不抄框架**。

---

## 目录

- 1. 产品定位与总体架构
- 2. 技术栈定稿
- 3. Monorepo 结构（文件级）
- 4. 协议设计（packages/protocol）
- 5. **引擎设计（packages/engine）——完整规格**
- 6. 前端设计（apps/web）——完整规格
- 7. **服务端（apps/server）——完整规格**
- 8. 分阶段路线图（任务清单级）
- 9. 参考速查表
- 10. 风险与对策
- 11. 附录：术语表

---

# 1. 产品定位与总体架构

## 1.1 一句话定位

Agent 工作台：引擎（Node 进程）+ 事件流驱动的 Web 前端，后期加 Electron 桌面壳。核心体验 = 流式对话 + 工具调用可视化 + 人工审批。

## 1.2 总体架构

```
┌────────────────────────────── 本机 ──────────────────────────────┐
│                                                                  │
│  apps/web (React SPA)              apps/desktop (Electron, 阶段五) │
│      │ HttpTransport                   │ 复用同一 HttpTransport    │
│      ▼                                  ▼                         │
│  packages/protocol（唯一合同：事件类型 + API 类型 + Transport 接口）   │
│      │                                                           │
│  apps/server (Fastify)                                           │
│    ├─ REST：会话/消息/审批                                          │
│    └─ GET /api/event —— SSE 单端点事件流（15s 心跳）                 │
│      │                                                           │
│  packages/engine                                                  │
│    ├─ 输入队列（now/steer/queue 三通道）                             │
│    ├─ RunLoop（抄 pi 骨架 + Codex steering 语义）                   │
│    ├─ ToolRegistry + 四工具（read/write/edit/bash）                 │
│    ├─ Permission 引擎（wildcard 规则 + fail-closed）                │
│    ├─ SessionManager（JSONL 树 + durable/live 二分）                │
│    └─ LlmGateway → @earendil-works/pi-ai（30+ provider）           │
│                                                                  │
│  ~/.spark/sessions/<cwd-mangled>/<ses_id>.jsonl（durable 事件日志） │
└──────────────────────────────────────────────────────────────────┘
```

## 1.3 五条架构铁律（六家源码验证）

1. **引擎 headless，UI 是事件流的投影**（Codex/opencode）：客户端只通过协议对话；UI 状态 = `applyEvent(events)` 纯函数归约。
2. **durable 事件落盘，delta 只走内存**（opencode）："Stream fragments are live-only"。
3. **模型可见的必须被记录**（dsh）："Model-visible means logged"。
4. **失败闭合**（pi）：任何异常路径补齐事件序列，事件流永不悬空。
5. **审批 fail-closed**（dsh）：答复缺失/超时/异常一律判拒绝。

## 1.4 安全模型（威胁 → 对策；Codex 级 agent 的必备维度）

| 威胁                                                      | 对策                                                                                                               | 规格落点     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------ |
| 提示词注入（恶意仓库的 AGENTS.md / 文件内容诱导危险行为） | 基座提示词声明系统规则优先于项目指引（§5.11 第 6 条 "unless conflicting"）；shell/写操作默认 ask——注入骗不过审批层 | §5.11 + §5.7 |
| 路径逃逸（`../`、绝对路径、符号链接读敏感文件）           | `path.resolve` + 允许根前缀比较的**硬边界**，越界 E_PATH_OUTSIDE 直接拒绝、不经审批兜底                            | §5.6.3       |
| 危险命令（`rm -rf`、`curl … \| sh`、git clean）           | 提示词禁删纪律 + shell.exec 默认 ask + deny 规则可永久封禁模式                                                     | §5.7 + §5.11 |
| 密钥泄漏（apiKey 进日志/事件/模型上下文）                 | apiKey 只在 ResolvedModel 注入；不进事件/DTO/日志；日志启发式脱敏兜底；密钥仓 store 值单点注册进脱敏层（工单 7.1） | §5.9 + §5.10 |
| 公网暴露/端口扫描                                         | 绑定 127.0.0.1；无 TLS/auth 是**刻意取舍**（本地单用户，dsh 姿态）                                                 | §7.1         |
| 工具输出轰炸（超大/二进制输出撑爆上下文与 UI）            | 32KB 限界+溢写文件；progress 200ms 节流；前端 Terminal 缓冲截头                                                    | §5.6.4       |
| 会话文件损坏/篡改                                         | 读端 fail-closed（非尾坏行拒绝加载）；未知事件 type 拒绝；尾行半写丢弃                                             | §5.8.4       |

---

# 2. 技术栈定稿

## 2.1 前端（apps/web）

| 层            | 选型                              | 选型理由                                                                                           | 备选                            |
| ------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| 构建          | Vite 7 + React 19 + TS(strict)    | 本地 SPA+Electron 友好，无 SSR 负担                                                                | Next.js（AI Elements 铺好的路） |
| 样式          | Tailwind CSS v4 + shadcn/ui       | copy-in 代码归我们；默认黑白中性极简（**非**蓝玻璃 AI 风——那是 v0/Lovable 审美，与 Tailwind 无关） | Semi（非 Tailwind 线）          |
| AI 组件       | **Vercel AI Elements**（48 组件） | confirmation/terminal/file-tree/plan/task/checkpoint/tool 即 Agent 工作台零件库                    | @ant-design/x                   |
| 对话状态      | assistant-ui 可选 / 自管 zustand  | headless 省状态层；自管更干净                                                                      | —                               |
| 流式 Markdown | streamdown                        | 未闭合语法补全；周下载 496 万事实标准                                                              | @ant-design/x-markdown          |
| 长列表        | react-virtuoso                    | followOutput 是 chat 标配                                                                          | —                               |
| 状态          | zustand + TanStack Query          | 事件流 store 与服务端状态分离                                                                      | —                               |
| 动效          | react-bits（可选）                | 用户已 fork                                                                                        | —                               |

### 2.1.1 前端组件库清单（含链接，预览长相用）

> 完整版本数据/组件枚举/许可细节见 `01-research-report.md` §4.1；本表用于选型时快速对比与点开预览。

| 库                                  | 定位                        | 链接                                                                       | 看点                                                                                                               |
| ----------------------------------- | --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **shadcn/ui**                       | 基础组件底座（Tailwind）    | https://ui.shadcn.com                                                      | 默认黑白中性极简风，不是蓝玻璃那种 AI 味；copy-in 模式代码全归你                                                   |
| **Vercel AI Elements**              | Agent 工作台专用组件，48 个 | https://elements.ai-sdk.dev （源码 https://github.com/vercel/ai-elements） | confirmation（审批卡）、terminal、sandbox、file-tree、plan/task、checkpoint、tool——就是 Claude-Code 式界面的零件库 |
| **assistant-ui**                    | 对话 UI 状态层 + 预制组件   | https://www.assistant-ui.com                                               | headless primitives（Thread/Composer/MessagePart），runtime 抽象可接自研后端                                       |
| shadcn 官方 chat 五件套             | 轻量聊天组件                | https://ui.shadcn.com/docs/changelog/2026-06-chat-components               | MessageScroller/Message/Bubble，可和 AI Elements 混用                                                              |
| **streamdown**                      | 流式 Markdown 渲染          | https://github.com/vercel/streamdown                                       | 流式不完整语法自动补全，周下载 496 万的事实标准                                                                    |
| react-virtuoso                      | 长列表虚拟化                | https://virtuoso.dev                                                       | followOutput 是 chat 场景标配                                                                                      |
| CopilotKit                          | 多框架 AI 组件全家桶        | https://www.copilotkit.ai                                                  | 组件多但 runtime 偏重，走 AG-UI 协议时再考虑                                                                       |
| Semi Design（非 Tailwind 备选）     | 字节组件库，AI 三件套       | https://semi.design                                                        | AIChatDialogue/AIChatInput，消息模型原生含工具调用/思考链；对比长相用                                              |
| @ant-design/x（非 Tailwind 备选）   | 蚂蚁 AI 组件                | https://x.ant.design                                                       | ThoughtChain 工具调用展示是亮点（2.x 需 antd 6）                                                                   |
| @lobehub/ui（非 Tailwind，antd 系） | LobeChat 同款零件库         | https://ui.lobehub.com                                                     | ChatList/Bubble/TokenTag，LobeChat 那种长相（需 antd 6 + React 19）                                                |

## 2.2 后端（packages/engine + apps/server）

| 层         | 选型                                         | 理由                                          | 备选                      |
| ---------- | -------------------------------------------- | --------------------------------------------- | ------------------------- |
| 运行时     | Node 22+ / TS / ESM                          | 与前端同语言，协议类型直接共享                | —                         |
| LLM 抽象   | `@earendil-works/pi-ai`                      | 30+ provider 含本地 Ollama/vLLM；dsh 复用验证 | Vercel AI SDK v7          |
| Agent 循环 | `@earendil-works/pi-agent-core` + 自写引擎层 | 有状态 Agent+事件流                           | 全自写（照 pi 源码）      |
| HTTP       | Fastify                                      | TS 友好、SSE 简单                             | Hono                      |
| 校验       | zod 4 + zod-to-json-schema                   | 单一 schema 双用途                            | typebox                   |
| 持久化     | 自写 append-only JSONL（~50 行）             | 六家全自写                                    | node:sqlite（阶段四索引） |
| 日志       | pino                                         | Fastify 原生搭配                              | —                         |
| MCP        | @modelcontextprotocol/sdk（阶段五）          | 官方 TS SDK                                   | —                         |

## 2.3 工程组织

pnpm workspaces（+turborepo 可选）；changesets 可选。

---

# 3. Monorepo 结构（文件级）

```
spark/
├── pnpm-workspace.yaml / package.json / tsconfig.base.json / .gitignore
├── doc/
├── packages/
│   ├── protocol/                   # ★ 唯一合同，零运行时依赖（除 zod）
│   │   └── src/{ids,primitives,events,api,transport,schema,index}.ts
│   ├── engine/
│   │   └── src/
│   │       ├── index.ts            # createEngine()
│   │       ├── engine.ts           # Engine 门面与生命周期
│   │       ├── config.ts           # 配置加载（~/.spark）
│   │       ├── bus.ts              # 事件总线
│   │       ├── input-queue.ts      # 三通道输入队列
│   │       ├── run-loop.ts         # turn 主循环
│   │       ├── llm-gateway.ts      # pi-ai 适配
│   │       ├── errors.ts           # 错误分类
│   │       ├── tools/
│   │       │   ├── types.ts        # ToolDefinition
│   │       │   ├── registry.ts     # 注册表 + materialize
│   │       │   ├── pipeline.ts     # 执行管线
│   │       │   ├── builtin/{read,write,edit,bash}.ts
│   │       │   └── output-store.ts # 超大输出截断/溢写
│   │       ├── permission/
│   │       │   ├── rules.ts        # 规则类型 + evaluate + 文件读写
│   │       │   └── service.ts      # asked/resolved + 挂起表
│   │       └── session/
│   │           ├── manager.ts      # SessionManager
│   │           ├── runtime.ts      # SessionRuntime（队列+循环+中断）
│   │           ├── store.ts        # JSONL 单写者
│   │           ├── tree.ts         # id/parentId 树
│   │           ├── projector.ts    # surface → 模型上下文
│   │           └── compaction.ts
│   │       └── observability/{logger,metrics}.ts
│   └── shared/                     # （可选）
├── apps/
│   ├── server/src/{index,routes/{sessions,messages,permissions},sse.ts,static.ts,errors.ts}
│   ├── web/（结构见 §6）
│   └── desktop/                    # Electron 壳（阶段五工单 5.1，ADR D14 sidecar：src/main.ts + electron-builder.yml）
└── examples/mock-sessions/
```

### 3.1 工程基础配置（阶段一照抄）

```yaml
# pnpm-workspace.yaml
packages: ['apps/*', 'packages/*']
```

```jsonc
// tsconfig.base.json 要点（各包 extends；project references 串联依赖顺序）
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "skipLibCheck": true,
  },
}
```

根 package.json scripts（阶段一回填实际命令）：

| 脚本                          | 内容                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `dev`                         | 并行 `--filter @spark/web`（Vite）+ `--filter @spark/server`（tsx watch）                     |
| `build`                       | protocol/engine 走 tsc 项目引用，web 走 vite build，server 走 tsc                             |
| `test` / `typecheck` / `lint` | `vitest run` / 各包 `tsc --noEmit`（引用串联）/ `eslint .`（flat + typescript-eslint strict） |

依赖纪律：`@earendil-works/pi-ai` 与 `pi-agent-core` **精确 pin**（版本号不带 `^`——§10 风险对策的落地）；CI（GitHub Actions）= typecheck + lint + build + test 四关。

### 3.2 各包 manifest（依赖与脚本表；阶段一照此建包）

| 包                | 关键 deps                                                                                                                | scripts（build/dev/test）  | 入口                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------- | -------------------------------- |
| `@spark/protocol` | zod、zod-to-json-schema（仅此两个；零其他运行时依赖）                                                                    | tsc / — / vitest           | `src/index.ts`（re-export 全部） |
| `@spark/engine`   | `@spark/protocol`（workspace:\*）、`@earendil-works/pi-ai`（精确 pin）、pino                                             | tsc / tsx watch / vitest   | `src/index.ts`（`createEngine`） |
| `apps/server`     | `@spark/engine`、fastify、@fastify/static、pino、zod                                                                     | tsc / tsx watch / vitest   | `src/index.ts`                   |
| `apps/web`        | `@spark/protocol`、react 19、react-router v7、zustand、@tanstack/react-query、react-virtuoso、streamdown、tailwindcss v4 | vite build / vite / vitest | `index.html` + `src/main.tsx`    |

约束：**web 不依赖 engine/server**（只经 HTTP + protocol 类型）；engine 不依赖 server；依赖方向与 §5.0 一致（单向无环）。跨包版本引用一律 `workspace:*`。

---

# 4. 协议设计（packages/protocol）

## 4.1 品牌化 ID

```ts
declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }
export type SessionId = Brand<string, 'SessionId'> // ses_<uuid>
export type TurnId = Brand<string, 'TurnId'> // trn_<ulid>
export type EventId = Brand<string, 'EventId'> // evt_<ulid>
export type CallId = Brand<string, 'CallId'> // cal_<ulid>
export type RequestId = Brand<string, 'RequestId'> // req_<ulid>
export type CheckpointId = Brand<string, 'Ckp'> // ckp_<ulid>
```

## 4.2 基础类型

```ts
/** 不变式（抄 opencode Usage 契约）：nonCachedInput + cacheRead + cacheWrite = inputTokens */
export interface Usage {
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
  cacheRead?: number
  cacheWrite?: number
  costUsd?: number
}
export type ContentItem =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'toolCall'; callId: CallId; name: string; input: unknown }
  | { type: 'toolResult'; callId: CallId; output: unknown; isError: boolean }

export type Delivery = 'now' | 'steer' | 'queue' // Codex TurnInputMode + opencode delivery 合并
export type TurnFinish = 'stop' | 'length' | 'aborted' | 'permission-rejected' | 'error'
export type PermissionReply = 'once' | 'always' | 'reject'
```

## 4.3 事件词表（20 种，merge-extensible——dsh 手法，插件 declaration merging 扩展）

> **扩展落地（阶段五工单 5.5，ADR D18）**：编译期扩展走 SparkEventMap declaration merging；运行时扩展 = protocol `extend.ts` 注册表（`registerEventType`/`eventSchemaOf`）——skills 插件清单的 `plugin.*` 事件（JSON Schema → zod）注册后与内置 20 种**同一校验路径**（EventBus/parseEnvelope/SessionStore 统一查表）；扩展事件信封带 `ignorable: true`（durable 占行号，插件卸载后旧会话可加载；未装插件的前端跳过未知 ignorable 帧不断流）。

```ts
export interface SparkEventMap {
  // 会话
  'session.created': { title?: string; cwd: string; model: string }
  'session.resumed': { fromSeq: number }
  'session.title': { title: string }
  // turn
  'turn.started': { turnId: TurnId; delivery: Delivery; userEventId: EventId }
  'turn.completed': { turnId: TurnId; finish: TurnFinish; usage?: Usage }
  // 输入/输出（surface = 进模型历史）
  'user.message': { text: string; attachments?: string[] } // durable+surface
  'assistant.delta': { turnId: TurnId; text: string } // live-only
  'assistant.message': { turnId: TurnId; content: ContentItem[]; usage?: Usage } // durable+surface
  'reasoning.delta': { turnId: TurnId; text: string } // live-only
  'reasoning.ended': { turnId: TurnId; text: string } // durable
  // 工具（状态机 started → [progress] → completed）
  'tool.started': { turnId: TurnId; callId: CallId; name: string; input: unknown }
  'tool.progress': { turnId: TurnId; callId: CallId; chunk: string } // live-only，引擎侧节流
  'tool.completed': {
    turnId: TurnId
    callId: CallId
    output: unknown
    isError: boolean
    durationMs: number
  }
  // 审批（log-only，永不进模型历史——dsh 纪律）
  'permission.asked': {
    requestId: RequestId
    callId: CallId
    action: string
    resource: string
    reason: string
    detail?: unknown
    patterns?: string[]        // §5.7 补强 1：多 pattern 展示（阶段四工单 4.1 落地）
    alwaysPatterns?: string[]  // §5.7 补强 3：always 固化范围声明
  }
  'permission.resolved': { requestId: RequestId; reply: PermissionReply; feedback?: string }
  // 上下文管理
  'compaction.started': { turnId?: TurnId }
  'compaction.completed': { summary: string; keptFromEventId: EventId; tokensBefore: number }
  'checkpoint.created': { checkpointId: CheckpointId; files: string[]; turnId: TurnId }
  // 系统
  error: { scope: 'engine' | 'llm' | 'tool' | 'io'; message: string; fatal?: boolean }
  // I/O 护栏（阶段七工单 7.2，log-only——告警本身不进模型历史）
  'io.warning': {
    turnId: TurnId
    callId: CallId
    tool: string
    kind: 'injection' | 'secret'
    rules: string[]            // 命中规则名（结构化；不回传原文——防注入内容/密钥片段经告警二次广播）
    redacted?: number          // kind=secret：敏感片段替换处数
  }
}
```

### 4.3.1 zod schema 骨架（protocol/src/{ids,events,schema}.ts）

```ts
// ids.ts —— Brand 类型的运行时校验（zod 4）
const idOf = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[0-9a-z]+$`))
export const SessionIdSchema = idOf('ses') as z.ZodType<SessionId> // Turn/Event/Call/Request/Checkpoint 同构

// events.ts —— schema registry：与词表一一对应（satisfies 强制，漏一种 = 编译错）
export const EventSchemas = {
  'session.created': z.object({ title: z.string().optional(), cwd: z.string(), model: z.string() }),
  'user.message': z.object({
    text: z.string().min(1),
    attachments: z.array(z.string()).optional(),
  }),
  // …20 种逐一定义；content/usage 等复用 primitives.ts 的共享 schema
} satisfies { [T in SparkEventType]: z.ZodType<SparkEventMap[T]> }

// schema.ts —— 信封 schema + jsonSchema 导出（工具参数与 DTO 用）
export const EnvelopeSchema = z.object({
  id: EventIdSchema,
  type: z.string(),
  sessionId: SessionIdSchema,
  seq: z.number().int().optional(),
  version: z.literal(1).optional(),
  ignorable: z.boolean().optional(),
  parentId: EventIdSchema.optional(),
  time: z.number(),
})
export const jsonSchemas = { envelope: zodToJsonSchema(EnvelopeSchema) /* + DTO schemas */ }
```

## 4.4 信封与 durable/live

```ts
export type SurfaceEventType = 'user.message' | 'assistant.message'
export type LiveOnlyEventType = 'assistant.delta' | 'reasoning.delta' | 'tool.progress'

export interface SparkEventEnvelope<T extends SparkEventType = SparkEventType> {
  id: EventId; type: T; sessionId: SessionId
  seq?: number            // durable 单调序号（== 会话日志行号）；live 无 seq
  parentId?: EventId      // 树父事件（durable 落盘时由 store 填 tree.leafId；live 恒缺省）
  version?: 1             // 协议演进预留（§10 风险表）：写入时恒为当前大版本；读端见 §5.8.4
  ignorable?: boolean     // 读端遇未知 type 时：true → 跳过继续加载；缺省 false → 拒绝加载（fail-closed）
  time: number            // epoch ms
  data: SparkEventMap[T]
} & (T extends SurfaceEventType ? { surface: true } : unknown)   // 编译期强制（dsh）
```

**durable/live/surface 规则表**：

| 事件                                              | durable      | surface                                               |
| ------------------------------------------------- | ------------ | ----------------------------------------------------- |
| session.created / resumed / title                 | ✅           | ❌                                                    |
| turn.started / completed                          | ✅           | ❌                                                    |
| user.message                                      | ✅           | ✅                                                    |
| assistant.message / reasoning.ended               | ✅           | ✅（reasoning 按 provider 配置）                      |
| assistant.delta / reasoning.delta / tool.progress | ❌ live-only | —                                                     |
| tool.started / completed                          | ✅           | ❌（结果经 assistant.message 的 toolResult 回填模型） |
| permission.asked / resolved                       | ✅（审计）   | ❌ 永不进模型历史                                     |
| compaction.* / checkpoint.created                 | ✅           | compaction 影响 projection                            |
| error                                             | ✅           | ❌                                                    |
| io.warning                                        | ✅           | ❌ 永不进模型历史（log-only；规则名结构化，原文不进事件） |

**磁盘行与 wire 同构**：落盘 JSONL 行 = 信封原样（含 parentId）——单一格式，序列化零转换，前端 UiItem 的 parentId 即来源于此。

**与 opencode-ai/schema（`packages/schema/src/event.ts`）对照**（v2.5）：其信封 Payload 含 `metadata?: Record<string,unknown>` 自由扩展通道（trace id 等），且支持**事件级版本共存**（`versionedType = type.version` 注册表 + `latest()` 取最高版）——两者均记为协议演进 v2 选项；v1 的单一 `version` + `ignorable` 逃生已够（更简，读端 fail-closed 更严）。

**读端 fail-closed**（dsh）：磁盘重建遇未知 type 且无 `ignorable: true` → 拒绝加载并报错。

## 4.5 HTTP API

| 方法 | 路径                        | 请求                                                 | 响应                                                 |
| ---- | --------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| POST | /api/sessions               | `{ title?, model?, cwd? }`                           | SessionDto                                           |
| GET  | /api/sessions               | `?limit&cursor&q`（q=标题子串过滤，工单 4.8）        | SessionDto[]                                         |
| GET  | /api/sessions/:id           | —                                                    | SessionDto（含 `events: SparkEvent[]` durable 回放） |
| POST | /api/sessions/:id/messages  | `{ text, delivery? }`                                | `{ result:'started'\|'steered'\|'queued', turnId? }` |
| POST | /api/sessions/:id/interrupt | —                                                    | `{ ok:true }`                                        |
| POST | /api/sessions/:id/compact   | —                                                    | `{ ok:true }`（turn 进行中 → 409 `E_TURN_ACTIVE`）    |
| POST | /api/permissions/:requestId | `{ reply, feedback? }`                               | `{ ok:true }`                                        |
| GET  | /api/permissions/rules      | —                                                    | `{ rules: PermissionRuleDto[] }`（阶段四工单 4.7）   |
| POST | /api/permissions/rules      | `PermissionRuleDto`                                  | 201 `{ ok:true }`（action+resource 同键覆盖）        |
| DELETE | /api/permissions/rules    | `{ action, resource }`                               | `{ ok:true }`；无此规则 → 404 `E_NOT_FOUND`          |
| GET  | /api/secrets                | —                                                    | `{ secrets: SecretStatusDto[] }`（阶段七工单 7.1；值永不回传） |
| PUT  | /api/secrets/:provider      | `{ value }`                                          | `{ ok:true }`；provider 未配置 → 400 `E_CONFIG`      |
| DELETE | /api/secrets/:provider    | —                                                    | `{ ok:true }`；store 无此条 → 404 `E_NOT_FOUND`      |
| GET  | /api/sessions/:id/tree      | —                                                    | TreeNode[]（阶段四）                                 |
| POST | /api/sessions/:id/fork      | `{ fromEventId }`                                    | SessionDto（阶段四）                                 |
| GET  | /api/event                  | `?sessionId&since`（均可省略，语义见 §4.6 订阅语义） | SSE 流                                               |
| GET  | /api/metrics                | —                                                    | Prometheus exposition 文本（工单 4.8，§5.10 清单）   |

### 4.5.1 DTO 定义（protocol/src/api.ts）

```ts
/** 引擎 SessionMeta 的线上形状（列表/详情共用；字段一一对应 §5.2） */
export interface SessionMetaDto {
  id: SessionId
  title: string
  model: string
  cwd: string
  createdAt: number
  updatedAt: number
  lastSeq: number // updatedAt=最近 durable 事件 time（列表排序键）
  status: 'idle' | 'running' | 'waiting-approval' // 引擎从 SessionRuntime 实时填充（Sidebar/欢迎页状态点）
}
export interface SessionDto extends SessionMetaDto {
  events?: SparkEventEnvelope[] // 仅 GET /api/sessions/:id 返回：全部 durable 事件按 seq 升序（冷启动回放）
}
```

约定：`title` 为空字符串时前端显示"新会话"（自动标题阶段四）；`model` 为该会话解析后的默认模型字符串（`provider/model` 形式）。

## 4.6 SSE 帧格式

```
GET /api/event?sessionId=ses_...&since=42
→ Content-Type: text/event-stream; Cache-Control: no-cache, no-transform; X-Accel-Buffering: no
: heartbeat\n\n                                   ← 每 15s（opencode 同款）
event: message\ndata: {"id":"evt_...","type":"assistant.delta","sessionId":"ses_...","time":...,"data":{...}}\n\n
```

`since` = durable seq 水位：连接先补发 `seq > since` 的 durable 事件（回放）再直播。统一 `event: message`，type 在 payload。

**订阅语义**：`sessionId` **省略 → 订阅全部会话的直播**（不回放——供 Sidebar 状态点/欢迎页实时更新，无需轮询）；带 `sessionId&since` → 该会话回放+直播。前端 v1 用法据此定型：**全局单连接**（省略 sessionId）+ 打开/重连会话时 `GET /api/sessions/:id` 全量 durable 回放（store reset 该会话 slice 后批量 apply，幂等，冷启动与断线重连同一路径）。

## 4.7 Transport 接口 + MockTransport 规格

```ts
export interface Transport {
  onEvent(handler: (e: SparkEventEnvelope) => void): () => void
  sendMessage(
    text: string,
    opts?: { delivery?: Delivery; attachments?: string[] },
  ): Promise<{ result: 'started' | 'steered' | 'queued'; turnId? }>
  interrupt(): Promise<void>
  replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  listSessions(): Promise<SessionDto[]>
  createSession(opts?: { title?: string }): Promise<SessionDto>
  dispose(): void
}
```

MockTransport：预录事件或脚本模式；sendMessage 触发延迟回放（delta 30~80ms/次）；审批场景挂起等待 reply；支持 steer 演示；`speed`/`scenario` 开关。

**四个预录场景（examples/mock-sessions/，阶段一交付）**——脚本与引擎 JSONL 同构（durable 事件按行存放），脚本锚点行（如 `{"@wait":"approval"}`）控制挂起与分支：

| 场景               | 脚本要点                                                                            | 覆盖的 UI 状态                           |
| ------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| normal.jsonl       | 读文件→edit（含 diff）→bash 跑测试→总结；含一段 reasoning 流与一次审批（once 放行） | 流式/工具三态/审批通过/turn 完成         |
| long-output.jsonl  | bash 输出 3000+ 行（验证 progressBuf 截头与 Terminal 缓冲上限）                     | 长输出/滚动/BackBottom                   |
| reject.jsonl       | write 审批被拒 + feedback 注入（下一条 assistant 响应 feedback 内容）               | 审批拒绝/E_PERMISSION 徽标/feedback 回喂 |
| error-finish.jsonl | 第 2 step 模拟 LLM 错误（turn.completed{error} + error 事件）                       | 顶部黄条/重试按钮                        |

**锚点行语义**（脚本内控制行，非真实事件；以 `@` 键区分）：

| 锚点                   | 语义                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| `{"@wait":"approval"}` | 回放至此挂起，直到 `replyPermission`（requestId 取脚本内预置值） |
| `{"@wait":"message"}`  | 挂起直到下一次 `sendMessage`（steer 演示：注入后继续回放）       |
| `{"@delay":500}`       | 其后事件间隔改为该 ms 值（覆盖默认 30~80ms 抖动）                |
| `{"@speed":2}`         | 全局倍率（debug 快进用）                                         |

## 4.8 协议一致性样例（normal 场景头部；兼作 §8.6 测试夹具基线）

```jsonl
{"sparkVersion":"0.1.0","cwd":"E:/code/demo","createdAt":1761280000000,"model":"deepseek/deepseek-chat"}
{"id":"evt_01HXA0…","type":"session.created","sessionId":"ses_9f21…","seq":1,"version":1,"time":1761280000100,"parentId":null,"data":{"cwd":"E:/code/demo","model":"deepseek/deepseek-chat"}}
{"id":"evt_01HXA1…","type":"user.message","sessionId":"ses_9f21…","seq":2,"version":1,"time":1761280005400,"parentId":"evt_01HXA0…","surface":true,"data":{"text":"读一下 src/index.ts 并总结"}}
{"id":"evt_01HXA2…","type":"turn.started","sessionId":"ses_9f21…","seq":3,"version":1,"time":1761280005410,"parentId":"evt_01HXA1…","data":{"turnId":"trn_01HXB…","delivery":"now","userEventId":"evt_01HXA1…"}}
{"id":"evt_01HXA3…","type":"tool.started","sessionId":"ses_9f21…","seq":4,"version":1,"time":1761280005600,"parentId":"evt_01HXA2…","data":{"turnId":"trn_01HXB…","callId":"cal_01HXC…","name":"read","input":{"path":"src/index.ts"}}}
{"id":"evt_01HXA4…","type":"tool.completed","sessionId":"ses_9f21…","seq":5,"version":1,"time":1761280005612,"parentId":"evt_01HXA3…","data":{"turnId":"trn_01HXB…","callId":"cal_01HXC…","output":{"path":"src/index.ts","lines":42,"truncated":false},"isError":false,"durationMs":12}}
{"id":"evt_01HXA5…","type":"assistant.message","sessionId":"ses_9f21…","seq":6,"version":1,"time":1761280011000,"parentId":"evt_01HXA4…","surface":true,"data":{"turnId":"trn_01HXB…","content":[{"type":"reasoning","text":"用户要总结……"},{"type":"text","text":"该文件是一个 42 行的入口模块……"}],"usage":{"inputTokens":1210,"outputTokens":86}}}
{"id":"evt_01HXA6…","type":"turn.completed","sessionId":"ses_9f21…","seq":7,"version":1,"time":1761280011010,"parentId":"evt_01HXA5…","data":{"turnId":"trn_01HXB…","finish":"stop","usage":{"inputTokens":1210,"outputTokens":86}}}
```

说明：id/ULID 此处截断示意，真实文件为完整值；完整场景按 §4.7 表继续展开（edit 含 diff output、bash 含 progress 流、审批含 asked/resolved 对）。本样例是协议的**可执行定义**——round-trip 测试、MockTransport、前端回放共用此形状。

---

# 5. 引擎设计（packages/engine）——完整规格

## 5.0 模块总览与依赖关系

```
createEngine(config)
   ├─ config.ts ──── 加载 ~/.spark/{spark.json, models.json, permissions.json}
   ├─ SessionManager（session/manager.ts）
   │    ├─ SessionStore（store.ts）──── JSONL 单写者追加
   │    ├─ EventTree（tree.ts）──────── id/parentId 树 + leaf 指针
   │    └─ SessionRuntime（runtime.ts）─ 每会话：InputQueue + RunLoop + AbortController
   ├─ EventBus（bus.ts）────────—————— durable/live 双路广播（server SSE 的数据源）
   ├─ ToolRegistry（tools/registry.ts）→ ToolPipeline（pipeline.ts）→ ToolOutputStore
   ├─ PermissionService（permission/）─ 挂起表 + 规则评估
   └─ LlmGateway（llm-gateway.ts）──── pi-ai 封装 + 重试
依赖方向：runtime → {input-queue, run-loop}；run-loop → {projector, registry, permission,
   llm-gateway, bus, store}；全部单向，无环。
```

## 5.1 配置体系

```
~/.spark/
├── spark.json            # 引擎行为配置
├── models.json           # provider 与默认模型
├── permissions.json      # 用户级审批规则
├── sessions/<cwd-munged>/<ses_id>.jsonl
├── tool-outputs/<callId> # 超大工具输出溢写
└── logs/engine.log       # pino 日志（按天滚动）
```

```jsonc
// spark.json
{
  "version": 1,
  "server": { "port": 4318, "host": "127.0.0.1" },     // 仅本地（dsh 姿态）
  "engine": {
    "maxStepsPerTurn": 40,              // 单 turn 采样⇄工具上限
    "maxToolParallel": 8,               // 并行 read 上限
    "toolTimeoutMs": 120000,
    "permissionTimeoutMs": 300000,      // 审批 5min fail-closed
    "progressThrottleMs": 200,          // tool.progress 节流
    "toolOutputLimitKB": 32,            // 超限溢写
    "compactionThreshold": 0.8          // 上下文占用率触发
  }
}
// models.json
{
  "providers": {
    "deepseek": { "apiKeyEnv": "DEEPSEEK_API_KEY" },
    "anthropic": { "apiKeyEnv": "ANTHROPIC_API_KEY" },
    "ollama":   { "baseUrl": "http://127.0.0.1:11434/v1", "apiKeyEnv": null }
  },
  "defaultModel": { "provider": "deepseek", "model": "deepseek-chat", "contextWindow": 128000 },
  "compactionModel": { "provider": "deepseek", "model": "deepseek-chat" },
  "models": [
    { "provider": "deepseek", "model": "deepseek-chat", "contextWindow": 128000 },
    { "provider": "deepseek", "model": "deepseek-reasoner", "contextWindow": 128000 }
  ]
}
```

**配置文件 zod 校验 schema**（加载即校验；失败 = 启动即败——配置错误不带病运行）：

| 文件             | 字段 → 类型/约束                                                                                                                                                                                                         | 缺省                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| spark.json       | `server.port`: int(1-65535)；`server.host`: string；`engine.maxStepsPerTurn/maxToolParallel`: int≥1；`toolTimeoutMs/permissionTimeoutMs/progressThrottleMs/toolOutputLimitKB`: int>0；`compactionThreshold`: number(0,1)；`checkpoints`: boolean；`bashSandbox`: 'off'\|'on'（工单 5.2，ADR D15：on = 平台 wrapper 前缀 + 不可用即拒跑） | 全部可缺省（取 §5.1 默认值）；文件本身可不存在                       |
| models.json      | `providers`: record<string, {apiKeyEnv: string\|null, baseUrl?: url}>；`defaultModel/compactionModel`: {provider, model, contextWindow: int>0}；`models`: {provider, model, contextWindow: int>0}[]（工单 6.5：可选模型清单——Composer 模型选择器与 GET /api/models 数据源；加载时与 defaultModel/compactionModel 合并去重，显式条目在前首个 contextWindow 生效） | **无缺省——defaultModel 必填**（缺失/校验失败 → `E_CONFIG` 启动失败）；models[] 缺省 = [defaultModel] |
| permissions.json | `version`: 1；`rules`: {action, resource, effect: 'allow'\|'deny'\|'ask'}[]                                                                                                                                              | 空规则表（全部落默认 ask）                                           |
| mcp.json         | `version`: 1；`servers`: record<string, {command: string, args?: string[], env?: record<string,string>}>（工单 5.3，ADR D16：stdio MCP server 声明，工具注册进同一 ToolRegistry，审批 action `mcp.call`/resource `<server>/<tool>` 默认 ask） | 空表（零外部工具，引擎照常启动；单 server 连接失败 warn 跳过）       |
| skills/ 目录     | `<root>/skills/<name>/skill.json`：`version`: 1；`name`: ^[a-z0-9][a-z0-9-]*$；`events`: record<`plugin.` 前缀类型, {description?, liveOnly?, data: JSON Schema}>；`hooks`?: {on: 内置事件类型, emit: 本 skill 事件}[]（工单 5.5，ADR D18：声明式清单——插件是数据不是程序，不执行任意代码；hooks data 固定形状 `{skill, sourceEventId, sourceType}`） | 目录不存在 = 零插件；单 skill 坏清单/类型冲突/钩子非法 warn 跳过（引擎照常启动） |

## 5.2 Engine 门面与生命周期

```ts
export interface Engine {
  createSession(opts?: { title?: string; model?: string; cwd?: string }): Promise<SessionHandle>
  resumeSession(id: SessionId): Promise<SessionHandle>
  listSessions(): Promise<SessionMeta[]>
  getSession(id: SessionId): SessionHandle | undefined
  subscribe(
    handler: (e: SparkEventEnvelope) => void,
    filter?: { sessionId?: SessionId },
  ): () => void
  shutdown(): Promise<void>
}
export interface SessionHandle {
  readonly id: SessionId
  readonly meta: SessionMeta
  send(text: string, delivery?: Delivery): Promise<SubmitResult>
  interrupt(): Promise<void>
  replyPermission(reqId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  forkFrom(eventId: EventId): Promise<SessionHandle> // 阶段四
}
// shutdown 序列：1) 拒绝新请求 2) 逐会话 interrupt 当前 turn（发 turn.completed{aborted}）
//   3) flush 全部 SessionStore（fsync）4) 关闭日志
```

### 5.2.1 SessionManager（session/manager.ts）职责规格

| 职责                | 算法要点                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSession`     | `mungeDir(cwd)` 建目录 → 写新 JSONL 首行 header `{sparkVersion, cwd, createdAt, model}`（样例见 §4.8）→ 创建 SessionRuntime（idle）→ emit `session.created`    |
| `resumeSession(id)` | 遍历 `sessions/*/<id>.jsonl` 定位 → `SessionStore.read`（坏行策略 §5.8.4）→ 重建 EventTree → turn 补闭合 → Runtime idle 启动 → emit `session.resumed{fromSeq}` |
| `listSessions()`    | 扫描全部 munged 目录：v1 逐文件读 header + 扫尾行 meta（单用户本地量级可接受）；阶段四换 SQLite 索引                                                           |
| 会话缓存            | v1 全部已加载会话常驻内存（Map<SessionId, Runtime>）；不做 LRU 淘汰                                                                                            |
| 并发防护            | 同 id 并发 create/resume 只初始化一次——in-flight Promise 表去重                                                                                                |
| `shutdown`          | 按 §5.2 序列编排：拒新 → 逐会话 interrupt → 全量 flush → 关日志                                                                                                |

## 5.3 事件总线（bus.ts）实现规格

```ts
interface EventBus {
  /** durable：校验 → 赋 seq → store.append → 广播（await 落盘后才广播，保证订阅者
      看到 durable 事件时它已持久化——崩溃后 UI 与磁盘一致） */
  emit<T extends DurableEventType>(sid: SessionId, type: T, data: SparkEventMap[T]): Promise<void>
  /** live：校验 → 直接广播（不落盘不计数） */
  emitLive<T extends LiveOnlyEventType>(sid: SessionId, type: T, data: SparkEventMap[T]): void
  subscribe(handler: (e: SparkEventEnvelope) => void, filter?): () => void
}
```

- **顺序保证**：per-session 串行——seq 分配与 store.append 在同一互斥队列；live 事件在产生它的 durable 事件之前广播（delta 先于 message 定稿），RunLoop 内天然满足。
- **订阅者隔离**：每个 handler 独立 try/catch，异常记 warn 不影响其他订阅者与其他事件（dsh）。
- **背压接口**：`subscribe` 的 handler 返回 `false | Promise<false>` 时暂停该订阅者（server SSE 用 `raw.write()===false` 触发），恢复由订阅者调用返回的 `resume()`。环形缓冲不丢 durable（可由 since 回放补），live 可丢。
- emit 的 zod 校验失败 = 编程错误，直接 throw（fail-fast 在写入点——dsh"append site"思想）。

## 5.4 输入队列（input-queue.ts）状态机

```
SessionRuntime 状态：idle ──submit(now)──▶ running ──turn 结束且无积压──▶ idle
                        ▲                     │  │
                        └──wake(有积压)────────┘  │ interrupt → running(收尾) → idle
提交路由 send(text, delivery)：
  now   : idle → 占用 runner，入队并启动 → {result:'started'}
          running → 可 steer？入 steerQueue → 'steered'；否则入 queue → 'queued'
  steer : running → 入 steerQueue（下一 step 前注入）→ 'steered'
          idle → 入主队列启动 → 'started'
  queue : 入 queue（当前 turn 完成后依序作为后续 turn 输入）→ 'queued'
唤醒合并（opencode pendingWake）：runLoop 在 turn 结束前检查 steer/queue 积压，
  有则不清除 running 标志直接续跑（避免 空转一轮 + 竞态）
```

数据结构：`queue: InputItem[]`（FIFO）、`steerQueue: InputItem[]`、`InputItem = {id, text, attachments?, delivery, admittedAt}`。

**与 Codex（`codex-rs/protocol/src/turn_input.rs`）对照**（v2.5）：

- **steerQueue 残留处理（补漏）**：turn 收尾时未消费的 steer 项**转入 queue 作为后续 turn 输入**（pendingWake 续跑消费）——防止"turn 在注入前结束导致插话凭空丢失"。此前规格未定义此边界。
- **提交无拒绝态是刻意宽容**：Codex 的 `NotSubmittedReason` 有八种拒绝（NoActiveTurn / NotIdle / ExpectedTurnMismatch{期望 turn id 校验} / ActiveTurnNotSteerable / EmptyInput / 输出 schema 不匹配…）；我们三态之外不设拒绝——steer 遇 idle 自动升级为 started、EmptyInput 已由 zod `min(1)` 拒。v2 出现不可插话的 turn 类型（如 plan-mode turn）时再引入 `NotSubmitted`。
- `Steer{expected_turn_id}` 的目标 turn 校验：**已实现（阶段五工单 5.4）**——`SessionRuntime.submit` 带可选 `expectedTurnId`（活动 turn 由 `beginTurn(turnId)` 登记）；无活动 turn 或不匹配 → `E_TURN_MISMATCH`（HTTP 409，§7.4）。不传保持原宽容路由（向后兼容）。多 turn 并发（子代理派生）下防串台的前提。

## 5.5 Run Loop（run-loop.ts）——函数签名级

```ts
// 每会话一个常驻 async 循环体（per-key 串行，跨会话并发——opencode RunCoordinator 思想）
async function runSessionLoop(rt: SessionRuntime): Promise<void>
async function runTurn(rt: SessionRuntime, input: InputItem): Promise<void>
async function runStep(rt: SessionRuntime, turn: TurnCtx): Promise<{ continue_: boolean }>

interface TurnCtx {
  turnId: TurnId
  delivery: Delivery
  abort: AbortController // interrupt 入口；级联到 LLM 流与工具 signal
  step: number
  usage: Usage // 累计
  toolCalls: ToolCallPending[] // 本 step 的工具调用
}
```

```
runSessionLoop:
  while (true):
    input = await rt.queue.take()                 // 阻塞等待
    try await runTurn(rt, input)
    catch e → emit error{scope:'engine'}          // 失败闭合兜底（runTurn 内部已保证补事件）
    检查 pendingWake（steer/queue 积压）→ 继续循环；无 → idle

runTurn(rt, input):
  turnId = newTurnId()
  userEvent = emit user.message{text}(durable+surface)
  emit turn.started{turnId, delivery, userEventId}
  turn = {turnId, abort: new AbortController(), step: 0, usage: empty}
  try:
    while true:
      turn.step += 1
      // ① steering 注入（pi：在 assistant 响应前生效）
      while (item = rt.steerQueue.shift())
        emit user.message{item.text}(durable+surface)   // delivery:'steer'
      // ② 上下文组装（StepContext 快照语义，Codex）
      messages = Projector.modelContext(rt.tree.leaf)   // 见 5.8
      if (messages.tokens > threshold) → await compact(rt) // 可能 emit compaction.* 并重投影
      tools = ToolRegistry.materialize(turn)            // spec 清单（见 5.6）
      // ③ 流式采样
      result = await LlmGateway.stream({
        model: resolveModel(rt), messages, tools,
        signal: turn.abort.signal,
        onDelta: t => bus.emitLive assistant.delta,
        onThinking: t => bus.emitLive reasoning.delta,
      })
      if (result.stopReason === 'error') → finish='error'; break
      emit assistant.message{content: [reasoning?, text, ...toolCalls], usage}(durable+surface)
      // ④ 截断保护（pi failToolCallsFromTruncatedMessage）：stopReason 'length' 时截断的
      //    toolCall 全部不执行，逐个补 tool.started + tool.completed{isError,E_TRUNCATED} 事件对；
      //    **之后 continue 而非 break**——错误结果回喂模型，下一 step 重发完整调用（pi: terminate=false）
      // ⑤ 工具执行
      calls = result.toolCalls
      if (calls.length === 0 && rt.steerQueue.isEmpty()) → finish='stop'; break
      if (turn.step >= config.maxStepsPerTurn) →
        注入 MAX_STEPS 提示词后强制最后一轮无工具（opencode max-steps 模式）或 finish='length'; break
      toolResults = await ToolPipeline.runAll(rt, turn, calls)
      emit assistant.message{content: toolResults.map(→toolResult)}(durable+surface)
      // continue_ = calls.length>0 || !steerQueue.isEmpty()
    // ⑥ 收尾
  finally:
    emit turn.completed{turnId, finish, usage: turn.usage}(durable)

interrupt():
  turn.abort.abort() → LLM 流抛 AbortError（已交付前缀 finalize 为截断的 assistant.message，
  标注 interrupted——dsh）；工具 signal 级联（见 5.6 管线第 ③ 步）；finish='aborted'
```

**与 pi（`packages/agent/src/agent-loop.ts`）的对照决策**（v2.4 在线核对）：

- pi **没有 max-steps 计数器**——终止靠 `shouldTerminateToolBatch` / `shouldStopAfterTurn` 钩子；我们**保留** maxStepsPerTurn=40 兜底（本地单用户产品的防御线），v2 可改钩子式。
- `beforeToolCall` 钩子可置 `terminate: true` 提前终止循环（pi block 语义）——v2 插件点预留。
- **abort 双检点**（pi `prepareToolCall`）：每个工具执行前/后各查一次 `signal.aborted`；串行链每项之间 break，并行组等待已启动者自然结束——与 5.6.2 ③"跑到静默"一致，补充"每工具启动前再检一次"。

## 5.6 工具系统（tools/）——完整规格

### 5.6.1 定义与注册表

```ts
export interface ToolDefinition<I = unknown> {
  name: string // 'read'|'write'|'edit'|'bash'
  description: string // 给模型的说明（含使用纪律）
  inputSchema: z.ZodType<I> // zod → jsonSchema 给模型
  permission: {
    action: string // 默认 = name
    resourceOf: (input: I, ctx: { cwd: string }) => string
  } // 如 'file:E:\...\src\index.ts'
  parallelizable: boolean // read=true；bash/edit/write=false
  execute(ctx: ToolContext, input: I): Promise<ToolOutput>
}
export interface ToolContext {
  sessionId: SessionId
  turnId: TurnId
  callId: CallId
  signal: AbortSignal // interrupt 级联
  onProgress: (chunk: string) => void // 引擎 200ms 节流后 emitLive tool.progress
  cwd: string
}
export interface ToolOutput {
  output: unknown
  isError: boolean
  display?: string
}

export interface ToolRegistry {
  register(def: ToolDefinition): void // 重复名抛错
  materialize(turn: TurnCtx): { name; description; jsonSchema }[] // 广告给模型的清单
  resolve(name: string): ToolDefinition | undefined
}
```

### 5.6.2 执行管线（pipeline.ts）

```
runAll(rt, turn, calls):
  分组：扫描 calls，把连续的 parallelizable 段归为一组（Promise.all），
       遇 serial 工具（bash/edit/write）单独成 barrier（dsh exclusive 语义）
  for 每组:
    if 组是 serial → 逐个 await runOne()
    else → Promise.all(calls.map(runOne))          // 并发上限 config.maxToolParallel
  收集结果按 model order 返回（pi：结果顺序与完成顺序无关）

runOne(call):
  emit tool.started{callId, name, input}(durable)
  t0 = now
  try:
    ① beforeToolCall hook（v1 预留插件点）
    ② verdict = PermissionService.assert(call)     // 见 5.7；ask → 挂起等待，超时 fail-closed
       verdict denied → return {output:{code:'E_PERMISSION'}, isError:true}
    ③ def.execute(ctx, input)——ctx.signal 级联 turn.abort：
       已启动的工具"跑到静默"（等待自然结束或工具自身响应 abort）；
       未启动的（分组排队中）→ 补 emit tool.started+tool.completed{isError, output:{code:'E_ABORTED'}}
       （dsh 重放合法原则：每个 started 必有 completed）
    ④ afterToolCall hook（可改写 output）
    ⑤ bounded = ToolOutputStore.bound(output, callId)   // >32KB 截断+溢写文件，消息留路径
    emit tool.completed{callId, output: bounded, isError, durationMs}(durable)
  catch e:
    emit tool.completed{callId, output:{code:mapError(e)}, isError:true, durationMs}
```

### 5.6.3 内置四工具规格

**进度更新的门控队列**（pi `tool_execution_update` 模式，v2.4 补）：`onProgress` 回调先进 updateEvents promise 链缓冲、`acceptingUpdates` 标志门控；工具结束后关门并 `await` 排水——保证 progress 永不晚于 tool.completed 乱序到达（单纯定时节流做不到）。

| 工具  | input（zod）                                      | permission                                       | 行为细则                                                                                                                                           | 错误码                                                           |
| ----- | ------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| read  | `{path, offset?≥0, limit?≤2000 默认2000}`         | action='fs.read'，resource='file:<abs>'          | 相对路径基于 cwd 解析；二进制检测（NUL 采样）→ 拒读；行号前缀输出；超大返回尾部+头部提示                                                           | E_PATH_OUTSIDE（越出允许根）、E_NOT_FOUND、E_BINARY、E_TOO_LARGE |
| write | `{path, content}`                                 | action='fs.write'，resource='file:<abs>'         | 自动建父目录；返回写入字节数                                                                                                                       | E_PATH_OUTSIDE、E_WRITE_DENIED（只读挂载/权限）                  |
| edit  | `{path, oldString, newString, replaceAll?=false}` | action='fs.write'，resource='file:<abs>'         | **oldString 唯一性校验**（0 命中→E_NOT_FOUND；>1 且未 replaceAll→E_AMBIGUOUS）；返回 unified diff（供前端 DiffViewer）                             | E_NOT_FOUND、E_AMBIGUOUS、E_PATH_OUTSIDE                         |
| bash  | `{command, timeoutMs?≤120000, cwd?}`              | action='shell.exec'，resource='cmd:<前 80 字符>' | 每次独立 shell（v1 不做常驻）；stdout+stderr 合流 progress 流式（16KB/帧截断，Grok）；退出码非 0 → isError 但 output 保留；超时 SIGTERM→5s→SIGKILL | E_TIMEOUT、E_EXIT_CODE（附 code）、E_SPAWN                       |
| task  | `{prompt, title?}`                                | action='agent.task'，resource='task'             | 阶段五工单 5.4 / ADR D17：派生独立子会话（header.parentSession）跑一轮，返回最终 assistant 文本；执行体 = Engine.runSubagent（工具层不感知会话管理）；单层限制；父中断级联 interrupt 子会话 | E_SUBAGENT_DEPTH（子会话再派生）、E_ABORTED（父中断级联）        |

路径安全：v1 允许根 = cwd + 用户显式 addDir（v2）；越界直接 E_PATH_OUTSIDE（不需要审批兜底——硬边界优先于审批）。

**跨平台规则**（默认决策，可推翻——推翻时在 ARCHITECTURE.md 记 ADR）：

- **bash 执行器**：Windows 优先 PATH 中的 `bash.exe`（Git Bash；探测顺序 `where bash`），缺失则 `powershell -NoProfile -Command`；Unix 一律 `/bin/bash -c`。命令字符串原样传递，不做翻译。
- **超时 kill**：Unix `SIGTERM` → 5s → `SIGKILL`；Windows `taskkill /PID <pid> /T /F`（树杀——子进程不悬挂）。
- **路径**：协议与事件内路径一律**正斜杠**展示；fs 操作经 `node:path` 自动适配；`resource` 字符串 `file:<abs>` 用平台原生分隔符（与审批规则文件书写一致）。
- **E_PATH_OUTSIDE 判定**：`path.resolve` 归一后做允许根前缀比较；Windows 下大小写不敏感比较。

### 5.6.4 输出限界（output-store.ts）

`bound(output, callId)`：序列化后 ≤32KB 原样返回；超限 → 截断至 32KB + 尾注 `"…truncated, full output: ~/.spark/tool-outputs/<callId>"`，全文写该文件（异步写、会话关闭前 flush）。

## 5.7 审批（permission/）——完整规格

### 5.7.1 规则与评估

```ts
export interface PermissionRule {
  action: string
  resource: string
  effect: 'allow' | 'deny' | 'ask'
}
// 匹配：wildcard（* 单段、** 跨段）；多条命中 findLast 胜出；无命中默认 'ask'（opencode）
export function evaluate(action: string, resource: string, ...rulesets: PermissionRule[][]): Effect
```

规则文件（用户级 `~/.spark/permissions.json`，项目级 `<cwd>/.spark/permissions.json`）：

```jsonc
{
  "version": 1,
  "rules": [
    { "action": "fs.read", "resource": "file:**", "effect": "allow" },
    { "action": "fs.write", "resource": "file:**/src/**", "effect": "allow" },
    { "action": "shell.exec", "resource": "cmd:git *", "effect": "allow" },
    { "action": "shell.exec", "resource": "cmd:**", "effect": "ask" },
  ],
}
```

优先级合并：会话临时（always 写入）> 项目级 > 用户级 > 默认 ask。

### 5.7.2 流程时序

```
ToolPipeline ──assert(action,resource)──▶ PermissionService
  evaluate → allow ──▶ 直接放行
  evaluate → deny  ──▶ 返回 denied（不发事件）
  evaluate → ask   ──▶ requestId=req_<ulid>
       emit permission.asked{requestId, callId, action, resource, reason, detail}(durable)
       new Promise 挂入 pending 表（key=requestId；5min 定时器）
                            │
UI 收到 asked → ApprovalCard → POST /api/permissions/:requestId
                            ▼
       reply(requestId, reply, feedback?):
         once   → resolve(allow)   → emit permission.resolved{once}
         always → 规则写入对应层文件 + resolve(allow)
                   + 扫描 pending 表：同 action/resource 现在 evaluate=allow 的其他挂起项
                     一并 resolve（opencode 自动放行）
         reject → resolve(deny) → emit permission.resolved{reject, feedback?}
                   feedback 非空 → 注入 user.message（surface）回喂模型（opencode CorrectedError 思想）
       超时/引擎异常/turn 中断 → 一律 resolve(deny) + permission.resolved{reject}
                   （fail-closed，dsh："宁可错杀"）
```

挂起期间工具的 AbortSignal 仍有效：interrupt → 级联取消挂起（判 rejected）。

**与 opencode（`packages/opencode/src/permission/index.ts`）的对照补强**（v2.4 在线核对，7 条）：

1. **多 pattern 评估**：一次工具调用可声明多个 resource pattern（如复合 bash 命令）；逐 pattern evaluate——任一 deny → 立即拒绝；全部 allow → 放行；否则**一次 ask 携带全部 patterns**。词表扩展：`permission.asked` 增 `patterns?[]` / `alwaysPatterns?[]`（阶段四工单 4.1 已落地 protocol/引擎/前端透传；规则引擎消费已落地，见工单 4.7——bash 复合命令 `patternsOf/alwaysPatternsOf` 按 `&& || ; |` 分段声明）。
2. **reject 也级联**：用户 reject 后，同会话其余挂起审批一并自动 reject 并发 resolved 事件（fail-closed 收敛；此前只定义了 always 级联放行）。
3. **always 的持久化范围在 ask 时声明**：`alwaysPatterns` 与展示用 patterns 解耦（opencode `request.always`）——决定"总是允许"到底固化哪几条规则。
4. **优先级实现机制实锤**：evaluate 对 [用户级, 项目级, 会话临时] **依序扁平化后 findLast**——会话临时层排最后即最高优先（5.7.1 声明的机制路径确认）。
5. **deny 工具不广告**：`materialize` 时被全域 deny 的工具直接不进模型清单（opencode `disabled()`：deny pattern `*` = 从工具列表移除）。
6. **~ / $HOME 展开**：规则文件 resource 支持家目录前缀展开（opencode `expand()`）。
7. **shutdown 收尾**：引擎关闭时 pending 表非空 → 全部 resolve(deny)（补充 5.2 shutdown 序列第 2 步细节）。

## 5.8 会话持久化（session/）——完整规格

### 5.8.1 Store（单写者 JSONL）

```ts
class SessionStore {
  private queue: Promise<void> = Promise.resolve() // 串行链（单写者）
  append(line: string): Promise<void> // queue = queue.then(() => fs.appendFile)
  flush(): Promise<void> // fsync（会话切换/引擎退出）
  static read(path): { header; events } // 全量读（v1；坏行策略见 5.8.4）
}
```

文件：`~/.spark/sessions/--<cwd munged>--/<ses_id>.jsonl`；首行 header + 每行 durable 事件（带 `parentId`）。

`mungeDir(cwd)` 算法（确定性、防碰撞）：非 `[A-Za-z0-9]` 连续段 → `-`，截断 48 字符，尾部追加 `sha1(cwd)` 前 8 位 hex——例：`E:\code\javascript\project\Spark` → `E-code-javascript-project-Spark-<hash8>`。无需可逆（列表遍历读 meta 重建 cwd 映射）。

**与 pi（`packages/coding-agent/src/core/session-manager.ts`）对照**（v2.5，四条）：

- **文件名加时间戳前缀**：`<ISO 时间戳(冒号转-)>_<ses_id>.jsonl`——同目录列表排序免读 header（pi 实测做法）；采纳。
- **会话文件版本迁移链**（pi CURRENT_SESSION_VERSION=3 + migrateV1ToV2/V2ToV3，读时就地迁移并重写文件）：我们 header 的 `sparkVersion` 同样需要——读时 `version < 当前` 走迁移函数链后重写；`version > 当前`（未来文件）→ 拒绝加载（fail-closed）。
- **"空会话不落盘"已评估并否决**：pi 延迟到首个 assistant 消息才写文件（避免垃圾空会话）——与我们"durable 落盘后广播"不变式冲突（崩溃时已广播事件丢失，UI 与磁盘不一致）。替代：接受少量 header-only 文件，`listSessions` 过滤零事件会话不展示。
- **孤儿条目分歧**：pi 树重建把 parentId 缺失的条目当根（宽容）；我们保持 fail-closed 拒绝加载（dsh 读端纪律，§5.8.4）——记录分歧不跟随。

### 5.8.2 EventTree（树操作）

```ts
class EventTree {
  append(event, parentId = this.leafId): EventId // 落 leaf；v1 线性追加
  branch(fromEventId: EventId): void // 只移 leafId 指针（pi：分叉零拷贝）
  pathToRoot(eventId?): SparkEventEnvelope[] // leaf→root 回溯反转
  latestOf(type, path?): EventEnvelope | undefined // 路径上最新某类事件（compaction 用）
}
```

### 5.8.3 Projector（surface → 模型上下文）算法

```
modelContext(leafId):
  1. path = tree.pathToRoot(leafId)                      // 全部 durable 事件
  2. c = path 上最新 compaction.completed（无则跳到 4）
  3. 上下文 = [system: c.summary] + path 中锚点事件（c.keptFromEventId，含）之后的 surface 事件
  4. （无 compaction）上下文 = path 全部 surface 事件
  5. 投影：user.message→user 消息；assistant.message→assistant 消息
     （content 内 toolCall/toolResult 转为 provider 对应的消息结构）；
     reasoning.ended 按 provider 配置决定是否包含（Anthropic thinking 块 / 其他丢弃）
  6. 估算 tokens（字符近似）返回 {messages, tokens}
```

**与 dsh（`deepseek-ai/deepseek-harness` master `packages/core/session/src/surface.ts` 460 行全文核对，v2.6）**：

- **空内容 assistant.message 不进转录**：仅承载 usage 的 max-tokens step（content 空数组）投影为 null——补入第 5 步投影规则。
- **逐字直通硬规则**：投影不加任何 per-type 包装框（dsh："framing is caller-owned"——包装由生产者写进 content 本体）；user.message 原样进入历史，禁止投影层二次加工。
- **surfaceOp replace 语义（v2 词表候选）**：dsh 表面事件携带 `surfaceOp: 'append' | {op:'replace',start,end}`——后发事件可**位置替换**早先表面区间，且有严格纪律（replace 须引用全部被遮蔽 seq；tool/result 替换只许改 content）。关键推论：**模型可见面 ≠ 人类转录面**（UI 显示 append-origin 原文，模型吃替换后版本）——这正是"工具结果事后蒸馏/重写"（Gemini CLI 双层压缩的第二层）的机制基础。v1 无此需求（compaction 用 completed+本节规则等价实现）；做蒸馏时按 AGENTS §2.5 扩词表。

### 5.8.4 坏行与恢复策略

- 读取时行 JSON 解析失败：**尾行**（EOF 前最后一行）→ 视为崩溃半写，丢弃并 warn（JSONL 追加写崩溃的典型形态）；**非尾行**坏行 → 拒绝加载该会话（fail-closed，dsh 读端纪律）。
- 未知事件 type 且无 `ignorable:true` → 拒绝加载（协议演进保护）。
- resume：全量读 → 重建 EventTree → 若历史显示 turn.started 无对应 turn.completed → 合成 `turn.completed{finish:'aborted'}` 补闭合（Codex 崩溃恢复的 interrupted 语义）。
- **seq 连续性校验**（dsh contiguity contract："seq = log.length"）：resume 时断言 durable 序号 1..N 无洞——不连续即文件损坏，fail-closed 拒绝加载（v2.6 补）。
- **反向扫描恢复（阶段四大文件优化；Codex `codex-rs/rollout/src/reverse_jsonl_scanner.rs` 全文核对，151 行）**：从文件尾按 64KB 块倒序找行界（`rposition('\n')`），O(记录大小)内存定位最近状态。三个可抄细节：`new_at(end_offset)` **冻结前缀扫描**（文件仍被追加时安全 resume）；`with_max_record_bytes` 整条跳过超大损坏行（防一行坏数据卡死恢复）；坏记录 `Rejected` 后继续扫（宽容恢复路径）。v1 文件小全量读即可，不提前实现。

### 5.8.5 压缩（compaction.ts）

```
compact(rt):
  emit compaction.started
  summary = await LlmGateway.generateOnce(compactionModel,
      prompt=压缩提示词 + 旧上下文（Projector 输出）, maxTokens=2000)
  keptFromEventId = 当前上下文中"最近 N 条 surface 事件"的首事件 id（N 由 token 预算反推）
  emit compaction.completed{summary, keptFromEventId, tokensBefore}(durable)
  （此后 Projector 自动按 5.8.3 生效；旧事件不删——append-only）
触发（v2.7 升级为 opencode `session/overflow.ts` 的 **reserve 扣减公式**）：
  usable = (model.limit.input ?? context − maxOutputTokens(model)) − reserved
           （reserved 默认 = min(20_000, maxOutputTokens(model))；cfg.compaction.reserved 可覆盖）
  tokens ≥ usable 即压缩——比阈值法精确：给输出预留了空间，避免"0.8×context 时仍装不下输出"
  limit.context 未知（=0）：我们按 128k 兜底估算并 warn（opencode 选择不触发自动压缩；
    取舍：本地误压缩代价低于漏压缩）。spark.json 的 compactionThreshold 降为手动覆盖项
    （设置后改用 tokens > threshold × context 简化式）。手动 /compact 不变
（压缩调用本身的 usage 不计入会话 usage——与 Claude Code modelUsage 口径一致的做法，v1 简化为不计）
手动 /compact（阶段四工单 4.3 落地）：Composer 本地拦截 `/compact` 文本 →
  Transport.compact → POST /api/sessions/:id/compact → handle.compact()。
  引擎仅在 idle 受理（turn 进行中 → 409 E_TURN_ACTIVE：压缩读全路径，避开运行竞态）；
  HTTP 等压缩完成再返回（本地单用户，摘要生成秒级），started/completed 经 SSE 直播——
  前端顶部细条「上下文压缩中…」→ 完成后轻提示「上下文已压缩」（2.5s）。
```

**compaction 锚点的分支隐患**（v2.5，pi `firstKeptEntryId` 实证；**阶段四工单 4.1 已落地**）：pi 的 compaction 条目锚定 **entry id**，词表原用 `keptFromSeq`（文件行号）。v1 线性会话下 seq==路径序没问题；**阶段四 fork 后路径序≠文件行序**，seq 比较会保留错误的条目——已按 §2.5 从 protocol 改为 `keptFromEventId`（Projector 语义同 pi buildContextEntries：摘要消息 + [锚点事件..compaction 前全部] + compaction 后全部）。锚点 id 不在路径（数据损坏）时退化为"摘要+全量事件"投影（不丢数据，超限自愈再压缩）并落结构化 warning（`projector.dangling_anchor`，按锚点 id 去重——不静默）。另：compaction 条目本身参与上下文，投影为**首条 user 消息**（v2.7 定案：system 走 StreamRequest 独立字段不复用；§5.11 压缩提示词与该角色配套）。

**磁盘格式迁移**（工单 4.1 词表演进的加载适配）：旧版 JSONL 中 `compaction.completed{keptFromSeq}`（阶段三格式）在 SessionStore.read 时按行号回查事件 id、原位转为 `keptFromEventId` 后重过严校验——幂等内存迁移，**文件不重写**（避免崩溃窗口）；schema 保持严格不双收字段，适配只存在于磁盘读取边界。非旧形状（锚点行缺失/新旧字段混写）仍 fail-closed 拒绝加载。

### 5.8.6 fork（阶段四）

`forkFrom(eventId)`：新文件 header（parentSession=原 id + 源文件 path——pi 同款）+ 复制 root→目标事件的路径行（重链 parentId；或引用+seed 标记——采用复制，简单优先）。

**branch_summary（阶段四+ 可选，pi branchWithSummary）**：分叉时对**被放弃的路径**生成摘要条目注入新分支——回退不丢上下文。同款思路也可用于 /rewind（checkpoint 回滚后补一条被放弃未来的摘要）。

**fork 边界校验**（dsh `SessionForkErrorCode` 对照，v2.6）：forkFrom 必须拒绝三类请求——边界事件不存在（INVALID_BOUNDARY）、边界落在 open turn 中间（OPEN_TURN：turn 未闭合不可分叉）、目标会话 id 已存在（ALREADY_EXISTS）。

### 5.8.7 checkpoint（阶段四，工单 4.6）

**两域简化**（Grok checkpoint 思路）：工作区（会话 cwd）+ 会话文件 → 同一棵 git 树。仓库位于
`<会话目录>/checkpoints/<sessionId>/.git`（与 JSONL 同级、不进工作区）；`--work-tree <cwd>` 全量
`add -A`（.gitignore 生效），会话文件经 `hash-object -w` 以固定别名 `.spark-checkpoint/session.jsonl`
挂入索引（别名前缀目录写进 info/exclude——add 永不吸入工作区同名目录）。

**快照时机**：run-loop 在 turn.completed 落盘后、消费下一输入前 `snapshot(turnId)`；流程 =
add → hash-object 会话文件 → commit --allow-empty（纯对话推进也成锚点，回滚点按 turn 均匀分布）→
索引追加 `{checkpointId, turnId, commit, createdAt, files}` → emit `checkpoint.created`
（durable，但在快照 blob 之后——回滚恢复的会话文件不含本事件）。失败不推翻已闭合的 turn：
error{io} 如实上报（失败闭合），不吞、不重试。

**回滚**（`rollbackToCheckpoint(id, cid)`）：仅 idle 受理——运行中 E_TURN_ACTIVE；未启用
（`spark.engine.checkpoints=false`）或快照不存在 E_NOT_FOUND。执行 = interrupt + 停 run-loop →
flush + 关旧 store（单写者纪律）→ 工作区 `reset --hard <commit>` + `clean -fd`（ignored 不动）→
删除被 reset 物化的别名文件（目录保留，可能是用户自己的）→ 会话文件用快照 blob 逐字节覆写 →
重载补发 session.resumed。git 失败闭合为 E_CHECKPOINT_ROLLBACK。回滚后续跑 seq 从截断水位连续
前进，无断洞。

**列表与开关**：`checkpointsOf` 读索引（创建序 = 旧→新）；DTO 只含 checkpointId/turnId/createdAt/files
（commit sha 不上线）。开关 `spark.engine.checkpoints` 默认 false——快照有 git 子进程开销，按需开启。

## 5.9 LLM 网关（llm-gateway.ts）

```ts
// pi-ai 集成（唯一 import 点——pi 依赖被隔离在此文件与 run-loop 对 pi 类型的引用）
import { createModels } from '@earendil-works/pi-ai'

export interface LlmGateway {
  stream(req: StreamRequest): Promise<StreamResult>
  // StreamRequest = { model: ResolvedModel; messages: LlmMessage[]; tools: ToolSpec[]
  //                   signal: AbortSignal
  //                   onDelta(t: string): void; onThinking(t: string): void }
  // StreamResult = { content: ContentItem[]; stopReason: 'stop'|'length'|'error'|'aborted'
  //                  usage: Usage }                    // 错误进结果不抛（pi 契约）
  generateOnce(req): Promise<string> // 压缩/起标题用
}
// 模型解析优先级：turn 显式指定 > session.meta.model > config.defaultModel
// 重试：provider 429/5xx/网络错误 → 指数退避 1s/2s/4s（±20% jitter）重试 3 次；
//       重试期间 emitLive 不需要（无输出），失败结果记 stopReason:'error' + error 事件
// 事件映射（pi assistantMessageEvent → Spark，v2.4 明确取舍）：
//   text_delta → assistant.delta；thinking_delta → reasoning.delta
//   text_start/end、thinking_start/end → v1 不映射（起止语义由定稿事件承担）
//   toolcall_start/delta/end → v1 不做工具输入流式（省一条 live 通道；需要时按 §2.5 扩词表）
//   message_end(assistant) → 由 run-loop emit assistant.message（网关只回调不落协议）
```

```ts
export interface ResolvedModel {
  provider: string
  model: string
  contextWindow: number
  apiKey?: string
  baseUrl?: string
}
// 解析时由 models.json + 环境变量合成（resolveModel）；apiKey 只在此注入，
// 不进事件、不进日志、不进任何 DTO（§5.10 脱敏的根因消除）。
```

- **消息投影**：Projector 输出的 `{role, content}` 直接对应 pi-ai 消息结构；`toolCall/toolResult` 到 provider 消息形状的转换（Anthropic tool_use/tool_result 块、OpenAI tool_calls/tool 角色）由 pi-ai 内建映射完成，网关不做逐 provider 分支。
- **system 提示词传递（v2.7 修正）**：pi-ai 的 `Context.systemPrompt` 是**独立字段而非 messages[0]**（`types.ts` Context 定义）——StreamRequest 增 `system: string`，由网关在入口把 Projector 输出的第 0 条 system 拆出直传（§5.11 的组装位置不变）。
- **工具清单转换（v2.7 勘误，推翻 v2.0"零适配"断言）**：pi-ai 的 `Tool.parameters` 要求 **typebox TSchema**（`types.ts:514`），不是裸 JSON Schema——网关做一层薄桥：zod → JSON Schema（zod4 内建 toJSONSchema）→ `Type.Unsafe(jsonSchema)` 包成 TSchema，集中在 LlmGateway 单文件。constrainedSampling（json_schema strict / grammar 变体）v1 不启用。
- **contextWindow 用途**：runStep ② 的 `tokens/contextWindow > compactionThreshold` 触发压缩（§5.8.5）；turn 显式指定模型的 contextWindow 未知时按 128000 兜底并 warn。

## 5.10 错误分类与可观测性

```
错误码前缀（output/事件共用）：
  E_ENGINE_*   循环/状态错误        E_LLM_*     provider/网络
  E_TOOL_*     工具执行             E_PERM_*    审批
  E_IO_*       磁盘/日志
```

**错误码总注册表**（新增码必须在此登记——与 AGENTS §3"错误码进 02 表"闭环）：

| 码                                               | 场景                                          | 载体                               |
| ------------------------------------------------ | --------------------------------------------- | ---------------------------------- |
| E_CONFIG                                         | 配置文件缺失/zod 校验失败（启动即败）         | 进程退出 + stderr                  |
| E_VALIDATION                                     | HTTP 请求 zod 失败                            | HTTP 400 `{code, message, issues}` |
| E_NOT_FOUND                                      | 会话/审批请求/文件路径不存在                  | HTTP 404 / tool output             |
| E_ALREADY_RESOLVED                               | 审批重复答复                                  | HTTP 409                           |
| E_TURN_ACTIVE                                    | 手动 /compact 时 turn 进行中（idle 才受理）   | HTTP 409                           |
| E_INVALID_BOUNDARY                               | fork 边界事件不存在（§5.8.6 工单 4.5）        | HTTP 400                           |
| E_OPEN_TURN                                      | fork 时 turn 进行中/边界落未闭合 turn（§5.8.6） | HTTP 409                          |
| E_ALREADY_EXISTS                                 | fork 目标会话 id 已占用（§5.8.6）             | HTTP 409                           |
| E_SHUTTING_DOWN                                  | 引擎关闭中拒新请求                            | HTTP 503                           |
| E_INTERNAL                                       | 未分类内部异常（详情只进日志）                | HTTP 500                           |
| E_PATH_OUTSIDE                                   | 路径越出允许根（硬边界，先于审批）            | tool output                        |
| E_BINARY / E_TOO_LARGE                           | read 遇二进制 / 超大文件                      | tool output                        |
| E_WRITE_DENIED                                   | 只读挂载/OS 权限拒绝写                        | tool output                        |
| E_AMBIGUOUS                                      | edit 的 oldString 多命中且未 replaceAll       | tool output                        |
| E_TIMEOUT / E_EXIT_CODE / E_SPAWN                | bash 超时 / 非零退出（附 code）/ spawn 失败   | tool output                        |
| E_SANDBOX_UNAVAILABLE                            | bashSandbox=on 而 wrapper 不可用/平台无路线（工单 5.2，fail-closed 拒跑） | tool output |
| E_MCP_CALL                                       | MCP 外部工具调用失败（协议错误/超时；工单 5.3，ADR D16） | tool output                        |
| E_TURN_MISMATCH                                  | steer expectedTurnId 与活动 turn 不符（工单 5.4，§5.4） | HTTP 409                           |
| E_SUBAGENT_DEPTH                                 | 子会话内再派生子代理（单层限制；工单 5.4，ADR D17） | tool output                        |
| E_EVENT_TYPE_CLASH                               | 插件事件类型与内置词表/其他 skill 冲突（工单 5.5，ADR D18） | 该 skill warn 跳过          |
| E_SKILL_HOOK_TARGET / E_SKILL_HOOK_EMIT          | hooks.on 非内置事件类型 / hooks.emit 未在本 skill 声明（工单 5.5） | 该 skill warn 跳过          |
| E_PERMISSION                                     | 工具调用被审批拒绝（denied/超时 fail-closed） | tool output                        |
| E_TRUNCATED                                      | stopReason 'length' 时截断 toolCall 的补事件  | tool.completed                     |
| E_ABORTED                                        | 分组排队中未启动即被 interrupt                | tool.completed                     |
| E_LLM_RATELIMIT / E_LLM_PROVIDER / E_LLM_NETWORK | 429/5xx 重试穷尽 / provider 错误 / 网络错误   | error 事件 + stopReason:'error'    |

日志（pino → ~/.spark/logs/engine.log，按天滚动，级别 info）：

| 字段                        | 约定                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `sid` / `turnId` / `callId` | 关联 ID（上下文有则必带——日志可按会话串起全链路）                |
| `code`                      | E_* 错误码（与 §5.10 总注册表一致）                              |
| `durMs`                     | 耗时（工具执行/LLM 调用/compaction）                             |
| `msg`                       | 固定英文短语（可 grep：`tool.completed`、`llm.stream.retry` 等） |

固定脱敏（写入前过一遍正则替换为 `***`）：`/sk-[A-Za-z0-9]{20,}/`、`/Bearer\s+\S+/`、`process.env` 值域匹配（环境变量值为非空字符串时替换其出现处）；工具 input 中的密钥样式串（同启发式）

metrics（进程内计数器，阶段四经 /api/metrics 暴露）：
spark_turns_total{finish} / spark_tool_calls_total{name,is_error}
spark_llm_tokens_total{direction} / spark_permission_decisions{reply}
spark_sessions_active / spark_events_durable_total

````

## 5.11 提示词规格（system prompt 与工具 description）

> 这是 agent 行为的"灵魂件"——Codex/Claude Code 的能力一半来自这层。提示词是代码的一部分：进 git、进版本评审、不进事件不进日志。

**system 消息组装**（Projector 输出 messages 的第 0 条，compaction 摘要消息紧随其后）：

1. **基座提示词**：代码常量（`prompts/base.ts`），随仓库版本演进；
2. **环境块**：OS/platform、cwd、日期、shell（运行时注入）；
3. **项目指引**：cwd 下存在 `AGENTS.md` 则原文注入（截断至 8K 字符并注明 `[truncated]`）——与 Codex/Claude Code/Grok Build 同一约定；
4. 无 cwd 级指引文件时跳过第 3 条，不报错。

**基座提示词草案 v1**（英文——提示词工程惯例；占位符运行时填充）：

```text
You are Spark, a coding agent working in the user's repository.

# Environment
- OS: {platform} {release} | cwd: {cwd} | date: {date} | shell: {shell}

# Working rules
1. Tools: read / write / edit / bash. Prefer `edit` for existing files; use `write` only for new files or full rewrites.
2. NEVER delete files or directories (no rm, del, git clean, or moving files out of the working directory). If deletion is required, explain why and ask the user to do it or confirm explicitly.
3. Some actions require user approval. If an action is denied, do not retry it unchanged — change your approach or ask.
4. Stay inside the working directory; paths outside it are rejected by the system.
5. Before editing a file you have not seen in this session, read it first.
6. Keep responses concise. Match the user's language.

# Project instructions (user-provided; follow unless conflicting with the rules above)
{AGENTS.md content or "none"}
````

注：第 2 条与 AGENTS.md §2.10（文件删除保护）同源——产品级落实"AI 无权删文件"。

**四工具 description 草案**（`ToolDefinition.description`，随 jsonSchema 一起广告给模型）：

| 工具  | description（英文草案）                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| read  | Read a UTF-8 text file; returns content with 1-based line-number prefixes. Binary files and paths outside the working directory are rejected.                                                   |
| write | Create or fully rewrite a file with the given content. Prefer `edit` for existing files. Parent directories are created automatically. Never use this to blank out a file you intend to delete. |
| edit  | Replace `oldString` with `newString` in a file. `oldString` must match exactly once unless `replaceAll` is true. Returns a unified diff of the change.                                          |
| bash  | Run a one-shot shell command in the working directory; output streams while it runs; non-zero exit returns output with an error flag. NEVER use this tool to delete files or directories.       |

**辅助提示词**：

- **compaction**（§5.8.5 用，`generateOnce`）："Summarize the conversation so far so work can continue with this summary alone. Keep: goals, key decisions, current task state, open TODOs, important file paths. Reply with the summary only."（maxTokens 2000）
- **会话标题**（阶段四工单 4.4 已落地，首 turn 完成后异步触发）："Generate a 3-6 word title for this conversation. Reply with the title only."（maxTokens 50；复用 compactionModel 廉价通道，`engine/src/title.ts`——turn.completed 且无标题时经 meta 订阅器 fire-and-forget 触发，在途任务去重、失败只记日志不 emit error、shutdown 3.5 步收尾防 append-after-close；回串 trim+截 80 字符，空串不发）

---

# 6. 前端设计（apps/web）——完整规格

> **前端思路与背景见 `03-frontend-approach.md`**：六大参考项目的前端实现逐一分析（dsh 插件化 SPA / opencode 同构多端 / Codex 批量刷屏 / Claude Code 内联审批 / pi 差分渲染 / Grok 内容块化）、我方八条设计原则、以及与传统 Web 前端的十二维差异对比。本章只写"怎么做"，为什么这样做在 03。

## 6.1 信息架构与路由

```
/                       → 重定向到最近会话或 /welcome
/welcome                → 欢迎页（无会话时）：新建/选择会话/快捷提示词
/session/:sessionId     → 工作台主视图（ChatView + Sidebar 常驻）
/settings               → 设置弹窗（v1 用 Dialog 不换路由）
```

路由：React Router v7（library 模式）。布局：`<App>` → `<TransportProvider>` → `<AppShell>{Sidebar}{<Outlet/>}{StatusBar}</AppShell>`。

**apps/web 文件级结构**（§3 只列到包级，此处到文件级——阶段一直接照此建）：

```
apps/web/
├── index.html / vite.config.ts
├── src/
│   ├── main.tsx / App.tsx               # 入口 + 路由与 AppShell 组装
│   ├── routes/{WelcomePage,SessionPage}.tsx
│   ├── components/
│   │   ├── layout/{AppShell,Sidebar,StatusBar,Titlebar}.tsx
│   │   └── ui/                          # shadcn + AI Elements copy-in（改造清单见 §6.7）
│   ├── features/chat/                   # 会话流业务组件收敛于此（opencode session-ui 思想：整目录可迁移）
│   │   └── {ChatView,MessageItem,AssistantBlock,ReasoningCollapsible,
│   │       ToolCard,ApprovalCard,TurnStatusBar,Composer,BackBottom}.tsx
│   ├── stores/{session,connection,settings}.ts
│   ├── transports/{context.tsx,http.ts,mock.ts}
│   ├── hooks/{useSessionItems,useKeyboard}.ts
│   └── styles/{tokens.css,theme.css}
└── tests/applyEvent.test.ts 等
```

## 6.2 逐屏视图规格

### 6.2.1 欢迎页 `/welcome`

布局（紧凑引导块，禁止 hero/落地页式——DESIGN.md §7.1；视觉值见其 §3）：

```
┌──────────────────────────────────────────────┐
│  Spark（产品名，页面级标题）                    │
│  一段话说明（12px muted，≤2 行）               │
│  [ 新建会话 ]（主按钮，每屏唯一）               │
│  提示词 chip ×3（边框 chip，12px）             │
│                                              │
│  最近会话（区块标题 + 列表，≤6 张卡片）          │
│  ┌ 标题 · 相对时间 · 状态点 ┐                  │
└──────────────────────────────────────────────┘
```

- **新建会话**：`transport.createSession()` → 跳转 `/session/:id`；失败 toast + [重试]。
- **提示词 chip**：点击 = 新建会话 + 立即 `sendMessage(chip 文本)`，成功后跳转；sendMessage 失败则仍跳转并把文本回填 Composer（不丢用户输入）。
- **会话卡片**：标题（空显示"新会话"）/相对时间（updatedAt）/状态点（SessionMetaDto.status，色规 DESIGN.md §8"状态点"）；点击切换路由；右键菜单：重命名（v2）。
- **状态矩阵**：

| 状态             | 表现                                           |
| ---------------- | ---------------------------------------------- |
| 加载中           | 列表区 6 行 skeleton                           |
| 空（无历史会话） | 隐藏"最近会话"区块，仅引导块 + chips           |
| 加载失败         | 内联错误块 + [重试]；连接状态与 StatusBar 联动 |

- 键盘：Tab 序 = 新建按钮 → chips → 会话卡片，Enter 激活；Cmd/Ctrl+K 命令面板可用。
- 数据源：`transport.listSessions()`（经 Query 缓存；组件不直接 fetch——DESIGN.md §9）；断线显示缓存 + 陈旧标记。

### 6.2.2 工作台 `/session/:id`

```
┌────────────┬──────────────────────────────────────────────┐
│ SessionSidebar │ ChatView（虚拟化滚动区）                     │
│  新建按钮    │  …消息流…                                     │
│  搜索框     │  [ApprovalCard 悬浮在对应位置]                 │
│  会话列表    │  [TurnStatusBar 进行中指示]                   │
│ （今天/更早） │───────────────────────────────────────────│
│             │ Composer（输入区 + DeliveryBar）              │
├────────────┴──────────────────────────────────────────────┤
│ StatusBar：连接状态● │ 模型名 │ seq 水位 │ token 累计         │
└───────────────────────────────────────────────────────────┘
```

**ChatView 状态矩阵**：

| 状态         | 表现                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 空（新会话） | 居中欢迎语 + 提示词 chips                                                                                                     |
| 流式中       | assistant 气泡底部闪烁光标；TurnStatusBar 显示 step 数/工具运行徽标；自动跟随底部（用户上滚则暂停跟随 + BackBottom 悬浮按钮） |
| 审批挂起     | 对应 ToolCard 位置展开 ApprovalCard；TurnStatusBar 黄色"等待审批"                                                             |
| turn 完成    | 光标消失；usage 徽标淡显在 assistant 消息尾                                                                                   |
| error finish | 顶部黄条 + 重试按钮（重发最后一条 user.message）                                                                              |
| 断线         | StatusBar 红点 + "已断线，重连中…"（自动重连，since 回放无缝续播）                                                            |

**Composer 交互规格**：

| 状态        | 可用操作                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| 空闲        | Enter 发送（Shift+Enter 换行）；附件按钮（v1 只收路径文本）                                                 |
| turn 进行中 | [停止]（interrupt）/ [排队]（queue）/ [插话]（steer，默认高亮）；输入后 Enter = steer（提示"将注入当前轮"） |
| 审批挂起    | 输入区禁用（焦点引导 ApprovalCard）                                                                         |

### 6.2.3 设置弹窗 SettingsDialog（v1 用 Dialog，不换路由）

触发：`Cmd/Ctrl+,` 或 StatusBar 齿轮。Radix Dialog（portal），宽 480px；Esc/遮罩关闭，关闭后焦点归还触发元素（DESIGN.md §5）。

| 分区 | 字段             | 控件                         | 持久化                         | 说明                                                                         |
| ---- | ---------------- | ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| 通用 | 主题             | light/dark 二态切换          | settings-store（localStorage） | 立即生效（document class 切换）；v1 无"跟随系统"                             |
| 通用 | 默认 delivery    | now/steer/queue 单选         | 同上                           | Composer 初始模式（§6.2.2）                                                  |
| 模型 | 新建会话默认模型 | 文本输入（`provider/model`） | 同上                           | v1 手输直传 createSession，非空校验；模型枚举 API 不在 §4.5 表内，阶段四再议 |
| 权限 | 规则表（工单 4.7 已落地） | 列表 + 行内删除 + action/resource/effect 添加表单 | 用户级 permissions.json（服务端持久化） | 打开时 GET /api/permissions/rules 加载；即存即生效；always 固化同表（§5.7 补强 3） |

行为：全部即存即生效（无保存按钮，桌面应用惯例）；默认模型只影响新建会话，不改已有会话。空/错误态：字段为本地态无加载；唯一校验为非空。

## 6.3 组件规格（props 与行为）

```tsx
interface ChatViewProps {
  sessionId: string
}
// react-virtuoso：<Virtuoso followOutput={'smooth'} firstItemIndex={...} />

interface MessageItemProps {
  item: UiItem
} // 按 kind 分发

interface AssistantBlockProps {
  content: ContentItem[]
  streaming?: { textBuf: string }
  usage?: Usage
}
interface ReasoningCollapsibleProps {
  text: string
  streaming?: boolean
  durationMs?: number
}
// 流式自动展开、结束自动折叠（可手动）

interface ToolCardProps {
  name: string
  input: unknown
  status: 'running' | 'completed' | 'error'
  progressBuf?: string
  output?: unknown
  isError: boolean
  durationMs?: number
}
// 分发：bash→Terminal（自动滚底、>2000 行截头）；edit/write→DiffViewer（output.diff）；
//       read→CodeBlock（path+行数）；其他→JSON 折叠

interface ApprovalCardProps {
  action: string
  resource: string
  reason: string
  detail?: unknown
  status: 'pending' | 'resolved'
  onReply: (reply: PermissionReply, feedback?: string) => void
}
// pending：[允许一次][总是允许][拒绝]；拒绝展开 feedback 文本框；resolved：结果徽标 2s 后折叠

interface TurnStatusBarProps {
  turn: { turnId; stepCount; runningTools: string[] } | null
}
interface ComposerProps {
  busy: boolean
  onSend(text, delivery): void
  onInterrupt(): void
  onCompact(): Promise<void> // /compact 命令（§5.8.5 手动压缩；本地拦截不进消息通道）
}
// SessionSidebar / SessionItem（标题/相对时间/状态点 idle|running|waiting-approval）
// SettingsDialog：完整规格见 §6.2.3
interface CommandPaletteProps {
  open: boolean
  onOpenChange(b: boolean): void
}
// cmdk copy-in：命令=新建会话/切换会话（内嵌搜索列表）/切换主题/打开设置/打断当前轮；
// Cmd/Ctrl+K 开、Esc 关、↑↓ 选择、Enter 执行；fuzzy 过滤命中高亮；空态"无匹配命令"
```

**结构布局细则**（此处定结构与分发，尺寸/颜色 token 以 DESIGN.md §3/§8 为唯一来源）：

- **MessageItem**：全宽行 = 角色标签行（12px 灰标签 `YOU`/模型名）+ 内容区。user = 浅背景块（4px 圆角、全宽）；assistant = 无背景，纵向排内容块序列（text→streamdown、reasoning→折叠面板、toolCall→ToolCard、approval 定位见下）。
- **AssistantBlock**：内容块纵向排列；streaming 时 text 末尾 `▮` 光标；usage 徽标右对齐淡显（turn 完成）。
- **ToolCard**：折叠摘要行 `[lucide 图标] 工具名 · 资源路径（mono、截断）· 状态 · 耗时`；展开区按工具分发（bash→Terminal / edit|write→DiffViewer / read→CodeBlock / 其他→JSON 折叠）；running 时摘要行尾滚动显示 progressBuf 最后片段（折叠态也可见）。
- **ApprovalCard**：内联在对应 tool.started 的紧后位置（事件序即 UI 序——Claude Code 内联审批）；结构 = warn 左边框容器 + `action / resource`（mono）+ reason 段 + 三按钮行；resolved 后 2s 收为摘要行（DESIGN.md §8）。
- **TurnStatusBar**：ChatView 顶部悬浮细条：`step N` · 运行中工具徽标（工具名×并发数）· 等待审批时 amber 文案；idle 时隐藏。
- **Composer**：底部固定区 = 多行 textarea（自适应 1-8 行）+ 右下按钮组（空闲 `[发送]`；进行中 `[插话(主)] [排队] [停止]`）；DeliveryBar 即按钮组本身，三态行为见 §6.2.2 表。
- **SessionSidebar**：顶部 `[新建]` + 搜索框（标题子串过滤，前端本地）；列表分组头"今天/更早"；会话项 36px：状态点 + 标题（截断）+ 相对时间；无 footer（DESIGN.md §7.6）。
- **StatusBar**：左起：连接状态点+文案 · 当前会话模型名 · seq 水位（lastSeq）· token 累计；右起：主题切换 · 设置齿轮。
- **CommandPalette**：cmdk 样式浮层（顶部 25% 下拉，宽 560px）；命令分组"会话/操作/设置"；列表行 32px；输入即过滤（fuzzy，命中段高亮）；无结果空态文案；Esc 关闭且焦点归还。

## 6.4 状态层（stores/）

```ts
interface UiItemBase {
  eventId: EventId
  parentId?: EventId
}
type UiItem =
  | ({ kind: 'user'; text: string } & UiItemBase)
  | ({ kind: 'assistant'; content: ContentItem[]; streaming?: { textBuf: string } } & UiItemBase)
  | ({ kind: 'reasoning'; text: string; streaming?: boolean } & UiItemBase)
  | ({
      kind: 'tool'
      callId: CallId
      name: string
      input: unknown
      status: 'running' | 'completed' | 'error'
      progressBuf: string
      output?: unknown
    } & UiItemBase)
  | ({
      kind: 'approval'
      requestId: RequestId
      action: string
      resource: string
      status: 'pending' | 'resolved'
    } & UiItemBase)

interface SessionSlice {
  meta: SessionMeta
  items: UiItem[]
  activeTurn: { turnId; stepCount; runningTools: Set<CallId> } | null
  lastSeq: number
  usageTotal: Usage
}
// zustand：{ byId: Record<SessionId, SessionSlice>, activeId }
// 唯一写入口 applyEvent(e) 与 reset()；选择器 selectItems/selectActiveTurn/selectLastSeq
```

**去重规则（回放×直播重叠）**：apply 入口先判 `e.seq !== undefined && e.seq <= slice.lastSeq` → 跳过（全局直播先到、REST 回放后到时不重复应用；重放期间乱序到达的直播同理被吸附）；live 事件无 seq，无条件应用。resetSlice 将 lastSeq 归 0 后重放从空重建。

**applyEvent 处理表（20 种全覆盖）**：

| 事件                         | 状态变更                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| session.created              | 初始化 slice；activeId 空则激活                                                     |
| session.resumed              | 回放模式批量 apply                                                                  |
| session.title                | meta.title（Sidebar 联动）                                                          |
| turn.started                 | activeTurn={…}；composer 切 busy                                                    |
| turn.completed               | activeTurn=null；finish==='error' 设 topBanner；usage 累计                          |
| user.message                 | push {kind:'user'}                                                                  |
| assistant.delta              | 末尾 assistant（无则建）streaming.textBuf += text                                   |
| assistant.message            | 定稿 content 清 streaming；按 content 展开（text 定稿；toolCall→push tool running） |
| reasoning.delta / ended      | 同 assistant 模式                                                                   |
| tool.started                 | push tool running；runningTools.add                                                 |
| tool.progress                | progressBuf += chunk（>2000 行截头）                                                |
| tool.completed               | status 定稿 + output；runningTools.delete                                           |
| permission.asked             | push approval pending；activeTurn 标 waiting                                        |
| permission.resolved          | approval→resolved                                                                   |
| compaction.started/completed | 顶部细条轻提示                                                                      |
| checkpoint.created           | StatusBar 短暂徽标                                                                  |
| error                        | toast；fatal→全屏错误态                                                             |
| io.warning                   | 挂对应 tool 项 guard（角标数据源；不改状态机——不阻断 turn）                         |

```ts
// connection-store：{ status:'connecting'|'open'|'reconnecting'|'closed', lastSeq, retryCount }
// settings-store：{ theme, defaultDelivery, model }（localStorage）
```

**store 创建骨架**（`reduce` 为纯函数即单测对象；create 只做绑定）：

```ts
const reduce = (s: SessionStoreState, e: SparkEventEnvelope): SessionStoreState => {
  /* §6.4 处理表 */
}
export const useSessionStore = create<SessionStoreState & Actions>()((set) => ({
  ...initialState,
  applyEvent: (e) => set((s) => reduce(s, e)), // 唯一写入口
  resetSlice: (sid: SessionId) => set((s) => ({ byId: { ...s.byId, [sid]: emptySlice(sid) } })),
}))
// 组件侧选择器（shallow 比较——只有引用变化的 slice 重渲染）：
export const useSessionItems = (sid: SessionId) =>
  useSessionStore((s) => s.byId[sid]?.items ?? EMPTY_ARRAY, shallow)
export const useActiveTurn = (sid: SessionId) =>
  useSessionStore((s) => s.byId[sid]?.activeTurn ?? null)
export const useLastSeq = (sid: SessionId) => useSessionStore((s) => s.byId[sid]?.lastSeq ?? 0)
```

**TransportProvider 的 rAF 批量接线**（缓冲按到达序 flush——live/durable 相对顺序不乱）：

```tsx
const buf: SparkEventEnvelope[] = []
let raf = 0
t.onEvent((e) => {
  buf.push(e)
  if (!raf) raf = requestAnimationFrame(flush)
})
function flush() {
  raf = 0
  buf.splice(0).forEach((e) => useSessionStore.getState().applyEvent(e))
}
// dispose：cancelAnimationFrame(raf) + buf 清空（防卸载后写 store）
```

## 6.5 样式系统

- Token 层（styles/tokens.css）：shadcn 标准 token + `--spark-accent/--spark-warn/--spark-ok`。
- 主题：light/dark 二态（class 策略）；ThemeProvider 20 行；**基调黑白中性极简，禁止蓝紫渐变玻璃**。
- Tailwind v4：`@source` 引 streamdown token；content 覆盖 components/ui。
- 字体：UI 系统栈；代码 IBM Plex Mono（@fontsource 本地打包）。
- 覆写：copy-in 组件直接改源码，不写全局覆写。

## 6.6 Transport 层实现

```tsx
// transports/context.tsx
export function TransportProvider({ mock, children }) {
  const t = useMemo(() => (mock ? createMockTransport(scenario) : createHttpTransport()), [])
  // onEvent → sessionStore.applyEvent（rAF 批量对齐）
}

// transports/http.ts 要点
// 1) SSE：全局单连接 fetch('/api/event', {signal})（省略 sessionId——直播全部会话，
//    Sidebar 状态点/欢迎页实时；订阅语义见 §4.6）+ ReadableStream 手解析
//    （不用原生 EventSource：无法自定义重连参数；可引 eventsource-parser）
// 2) 打开/重连会话：GET /api/sessions/:id 全量 durable → **先 resetSlice 后批量 apply**
//    （与全局直播的重叠按 seq 去重，见 §6.4；冷启动与断线重连同一路径）；
//    断线指数退避（1/2/5/10s 封顶）重连后自动执行
// 3) REST fetch；sendMessage 三态原样返回；4) dispose：abort+退订

// transports/mock.ts 要点
// sendMessage → setTimeout 序列吐事件；审批挂起等 reply；speed 倍率；scenario 分支
```

## 6.7 AI Elements 组件改造清单

| 取用组件                              | 改造点                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| conversation / message / prompt-input | 删 "use client"；数据源换 useSessionItems()；回调改派发 store    |
| confirmation → ApprovalCard           | 三按钮语义重映射（once/always/reject+feedback）；resolved 态自绘 |
| terminal                              | 接 progressBuf；自动滚底；截头                                   |
| file-tree / code-block / diff         | diff 来自 edit/write 工具 output                                 |
| plan / task                           | 阶段四接 todo 事件扩展（declaration merging 加 'todo/write'）    |
| reasoning                             | 接 reasoning.delta/ended                                         |
| checkpoint                            | 阶段四                                                           |
| 不取用                                | sandbox/web-preview/canvas/audio 等（按需后补）                  |

## 6.8 性能与体验优化

1. 流式 rAF 批量 flush（避免每 token 全量重渲染）；2. react-virtuoso followOutput+firstItemIndex；3. UiItem memo+浅比较选择器（仅流式项重渲染）；4. Shiki 懒加载+按需语法；5. 图片 lazy；6. 重连回放进度细条；7. 键盘：Enter/Shift+Enter/Esc/Ctrl+K。

## 6.9 工程化配置

```ts
// vite.config.ts 要点
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src', '@spark/protocol': '../../packages/protocol/src' } },
  server: { proxy: { '/api': 'http://127.0.0.1:4318' } },
  build: { target: 'es2022', sourcemap: true },
})
```

规范：ESLint(flat+typescript-eslint strict)+Prettier；CI=typecheck+lint+build+test(vitest)+`python scripts/check_doc_links.py`。测试重点：protocol 类型级 + **applyEvent 19 事件单测全覆盖** + 审批卡交互。环境变量：`VITE_SPARK_MOCK=1` / `VITE_SPARK_API`。

## 6.10 核心端到端时序（四条主链路）

```
① 冷启动（打开 /session/:id）
UI mount → GET /api/sessions/:id ──▶ server（按需 engine.resume）──▶ 全量 durable（seq 升序）
        ◀── SessionDto{events} ──  先 resetSlice 后逐条 applyEvent
（全局 SSE 在 App 挂载时已连接；回放前后到达的直播事件按 §6.4 去重规则落位）

② 发送消息（turn 全程）
Composer Enter → POST /:id/messages{now} → {result:'started'}（三态直通，不等 turn）
engine：user.message(durable) → turn.started → assistant.delta…(live) → assistant.message(durable)
      → [tool.started → tool.completed]* → turn.completed(durable)
UI：每事件 applyEvent 增量渲染（rAF 批量 flush）

③ 审批往返
ToolPipeline.assert → ask → permission.asked(durable) → UI ApprovalCard（Composer 禁用）
用户点[允许一次] → POST /api/permissions/:reqId{once} → permission.resolved(durable)
      → pipeline 放行 → tool.started/completed → …
（5min 超时：引擎侧 resolve(deny) + permission.resolved{reject}——UI 闭合靠事件而非本地计时）

④ 断线重连
SSE 断 → connection-store 'reconnecting'（StatusBar 红）→ 指数退避 1/2/5/10s
重连成功 → GET /:id 全量 durable → resetSlice 重放（幂等）→ 'open'
（一致性来自重放而非增量 diff——乐观更新不存在，DESIGN.md §7.8）
```

## 6.11 全局键位表（行为 → 组件的实现映射；视觉呈现规则单一来源在 DESIGN.md §5）

| 键                | 行为                                                                | 生效组件                        |
| ----------------- | ------------------------------------------------------------------- | ------------------------------- |
| `Enter`           | 发送（空闲）/ steer（turn 中，提示"将注入当前轮"）                  | Composer                        |
| `Shift+Enter`     | 换行                                                                | Composer                        |
| `Ctrl+Enter`      | 强制 queue（turn 中）                                               | Composer                        |
| `Esc`             | 逐层退出：关 CommandPalette/Dialog 浮层 → 取消输入框编辑态 → 无操作 | 全局                            |
| `Cmd/Ctrl+K`      | 打开命令面板                                                        | 全局（useKeyboard 挂 AppShell） |
| `Cmd/Ctrl+,`      | 打开设置                                                            | 全局                            |
| `↑`（输入框空时） | v1 不做"编辑上一条消息"（阶段四再议，勿自行加）                     | Composer                        |

---

# 7. 服务端（apps/server）——完整规格

## 7.1 组装与生命周期

```ts
export interface ServerOptions {
  engine: Engine
  staticDir?: string
  port?: number
  host?: string
}

const engine = await createEngine({ root: '~/.spark' })
const app = Fastify({ logger: pino({ level: 'info' }) })
await app.register(routes, { engine }) // REST
await app.register(ssePlugin, { engine }) // GET /api/event
if (opts.staticDir) await app.register(fastifyStatic, { root: opts.staticDir })
await app.listen({ port: 4318, host: '127.0.0.1' }) // 仅本地（无 TLS/auth 刻意，dsh 姿态）

// 优雅退出序列：
// SIGINT/SIGTERM → 1) server.close()（停止接新连接，SSE 连接发 bye 帧后断）
//   2) engine.shutdown()（interrupt 收尾 + flush 全部会话 fsync）3) 进程退出
```

## 7.2 路由实现规格（routes/）

```ts
// 通用模式：zod 解析 body/params → engine 调用 → DTO 序列化；错误经 errors.ts 映射
// POST /api/sessions/:id/messages
const Body = z.object({ text: z.string().min(1), delivery: z.enum(['now','steer','queue']).default('now'),
  expectedTurnId: TurnIdSchema.optional() })   // 工单 5.4：steer 目标 turn 校验（不符 → 409 E_TURN_MISMATCH）
app.post('/api/sessions/:id/messages', async (req, reply) => {
  const { id } = z.object({ id: SessionIdSchema }).parse(req.params)
  const body = Body.parse(req.body)
  const handle = engine.getSession(id) ?? throw new SessionNotFound()
  return handle.send(body.text, body.delivery, body.expectedTurnId)    // { result, turnId } 三态直通
})
```

**逐路由实现要点**（端点清单见 §4.5；通用模式 = zod 解析 → engine 调用 → DTO 序列化，错误经 §7.4 映射）：

| 路由                             | 实现要点                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/healthz                 | 工单 5.1 已注册：桌面壳 sidecar 探活端点（listen 成功即引擎可用）；`{ok:true}` 无鉴权无副作用。server 入口支持 `SPARK_PORT`/`SPARK_HOST`/`SPARK_WEB_DIST` 环境变量注入（桌面壳 ADR D14） |
| POST /api/sessions               | body `{title?, model?, cwd?}`（model 缺省用引擎 defaultModel；cwd 缺省 = server 进程 cwd）→ `createSession` → 201 + SessionMetaDto |
| GET /api/sessions                | **索引驱动**（工单 4.8）：node:sqlite sessions 表（boot 自磁盘全量重建对齐 JSONL 权威，durable 事件增量 touch、装载点 upsert；索引不可用降级回磁盘扫描）；`?limit`（默认 50）+ `?cursor`（= 最后一条的 id，倒序遍历）+ `?q`（标题子串过滤）——分页 v1 内存切片 |
| GET /api/metrics                 | 工单 4.8 已注册：`engine.renderMetrics()` → Prometheus exposition 文本（text/plain; version=0.0.4）；counter 清单见 §5.10，spark_sessions_active 为快照时点 gauge |
| GET /api/sessions/:id            | 会话未加载先 `resumeSession`；meta + 全量 durable 事件（按 seq 升序）→ SessionDto（`events` = 前端冷启动回放数据源）               |
| POST /api/sessions/:id/messages  | 见上例代码；**submit 三态直通**（不等待 turn 结果——HTTP 只表达"已受理"）                                                           |
| POST /api/sessions/:id/interrupt | `handle.interrupt()`；会话 idle 时同样返回 200 `{ok:true}`（幂等，无 turn 也成功）                                                 |
| POST /api/sessions/:id/compact   | `handle.compact()`（§5.8.5 手动压缩）；等 compaction.completed 落盘再返回（started/completed 经 SSE 直播）；turn 进行中 → 409 E_TURN_ACTIVE |
| POST /api/permissions/:requestId | `PermissionService.reply`；已答复 → 409 E_ALREADY_RESOLVED；requestId 不存在 → 404                                                 |
| GET/POST/DELETE /api/permissions/rules | 阶段四工单 4.7 已注册：list = `engine.listPermissionRules()`；POST = `addPermissionRule`（zod PermissionRuleDto 校验，同键覆盖，201）；DELETE = `removePermissionRule`（精确匹配，无此规则 404）。落点 = 用户级 ~/.spark/permissions.json（tmp+rename 原子写），always 固化与手动管理同表 |
| GET /:id/tree · POST /:id/fork   | 阶段四工单 4.5 已注册：tree = `treeOf()`（节点链 + label 摘要 + forks 磁盘扫描归组）；fork = `forkSession()`（三拒绝码 §5.8.6：INVALID_BOUNDARY 400 / OPEN_TURN 409 / ALREADY_EXISTS 409）→ 201 + SessionMetaDto |
| GET /:id/checkpoints · POST /:id/checkpoints/:cid/rollback | 阶段四工单 4.6 已注册：list = `checkpointsOf()`（索引读出旧→新，commit sha 不上线）；rollback = `rollbackToCheckpoint()`（§5.8.7 两域复位：仅 idle 受理，运行中 409 E_TURN_ACTIVE、快照不存在/未启用 404、git 失败 500 E_CHECKPOINT_ROLLBACK 详情只进日志）→ 200 + SessionMetaDto（**回滚后 seq 回退**，响应不含 events，前端走 GET /:id 全量重放） |
| GET /api/models · POST /api/models/:providerId/test · PUT /api/sessions/:id/model | 阶段六工单 6.5 已注册（本阶段唯一 engine/server 轻后端例外，ADR D7 补记同款内存态先例）：models = `engine.listModels()`（PROVIDER_CATALOG 内置目录 8 家 + models.json providers 独有自定义，掩码原则 apiKeyEnv 只回环境变量名、key 值永不上线）；test = `testProvider()`（廉价鉴权探针 openai 系 GET /models、anthropic GET /v1/models，8s 超时；**ok=false 不是传输失败走 200** + 时延/人话文案，detail 折叠透出）；PUT model = `setSessionModel()`（**内存态，下一 turn 生效**，会话文件 header 不动——重启回会话文件模型；坏形状/未配置 provider 400 E_CONFIG、未知会话 404）→ 200 `{model}` |

校验失败 400（zod flatten）；未知会话 404。并发安全由引擎单写者与 per-session 串行保证，路由层无锁。

## 7.3 SSE 实现（sse.ts）

```ts
app.get('/api/event', async (req, reply) => {
  const { sessionId, since } = req.query as { sessionId?: string; since?: string }
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  })
  const write = (chunk: string) => reply.raw.write(chunk)
  // 1) 回放：sessionId+since 时，先按序 write 该会话 seq>since 的 durable 事件（opencode 语义）；
  //    sessionId 省略 → 仅直播全部会话、不回放（全局订阅，语义见 §4.6）
  // 2) 直播：engine.subscribe(e => write(`event: message\ndata: ${JSON.stringify(e)}\n\n`), { sessionId })
  //    背压：write 返回 false → 暂停订阅（bus 的 resume 机制），'drain' 事件恢复
  // 3) 心跳：setInterval(15s) write(': heartbeat\n\n')（合并进同一 chunk 定时器）
  // 4) 清理：req.raw.on('close') → clearInterval + 退订
  // 注：不设请求超时（Fastify 默认 connectionTimeout 需调大或 0）
})
```

## 7.4 错误映射表（errors.ts）

| 引擎/校验错误    | HTTP                                         |
| ---------------- | -------------------------------------------- |
| zod 校验失败     | 400 `{code:'E_VALIDATION', message, issues}` |
| 会话/请求不存在  | 404 `E_NOT_FOUND`                            |
| 审批请求已答复过 | 409 `E_ALREADY_RESOLVED`                     |
| turn 进行中      | 409 `E_TURN_ACTIVE`（手动压缩/回滚共用）     |
| 分叉边界事件不存在 | 400 `E_INVALID_BOUNDARY`                   |
| 分叉源 turn 未闭合 | 409 `E_OPEN_TURN`                          |
| 目标会话已存在   | 409 `E_ALREADY_EXISTS`                       |
| 模型形状/供应商未配置 | 400 `E_CONFIG`（工单 6.5：createSession/setSessionModel 入参错误） |
| 回滚 git 操作失败 | 500 `E_CHECKPOINT_ROLLBACK`（详情只进日志） |
| 引擎已 shutdown  | 503 `E_SHUTTING_DOWN`                        |
| 内部异常         | 500 `E_INTERNAL`（详情只进日志，不透出）     |

## 7.5 静态托管与运行形态

- **生产模式**：`fastifyStatic` 托管 `apps/web/dist`；SPA fallback——`setNotFoundHandler` 回 `index.html`（**排除 `/api` 前缀**：API 404 仍返回 JSON，不回 HTML）；Vite 内容哈希文件 `Cache-Control: public, max-age=31536000, immutable`，`index.html` 一律 `no-cache`（保证发版即生效）。
- **开发模式**：前端 Vite dev server（5173）+ `server.proxy['/api'] → 127.0.0.1:4318`（§6.9）；引擎独立进程 `pnpm --filter server dev`（tsx watch）。
- **命令**（阶段一回填 package.json scripts）：`pnpm dev` = 并行 web+server；`pnpm build` = web 构建产物供 server 托管；`pnpm start` = build + `node apps/server/dist/index.js`。无 Docker/CDN/域名（本地产品，§4.5 host=127.0.0.1）。

---

# 8. 分阶段路线图（任务清单级）

## 阶段一：骨架（协议先行）——工单级

| #   | 工单                              | 产出                                                                                               | 验收标准                                                                                       | 依赖 |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---- |
| 1.1 | ✅ workspace 骨架（提交 0c135ca） | pnpm-workspace.yaml、tsconfig.base.json、根 package.json、eslint(flat)/prettier、CI workflow       | `pnpm i` 通过；`pnpm lint/typecheck` 空仓通过；CI 绿                                           | —    |
| 1.2 | ✅ protocol 包（提交 2b289cb）    | `src/{ids,primitives,events,api,transport,schema,index}.ts`（§4 全部，含 §4.3.1 骨架）             | tsc strict 零错；**19 事件** zod round-trip 单测绿（26 例）；jsonSchemas 导出可 JSON.stringify | 1.1  |
| 1.3 | ✅ mock 场景（提交 afcd5bf）      | `examples/mock-sessions/{normal,long-output,reject,error-finish}.jsonl`（§4.7 表 + §4.8 样例形状） | 四文件逐行过 EnvelopeSchema 校验（单测断言）                                                   | 1.2  |
| 1.4 | ✅ MockTransport（提交 2f13bf7）  | web `src/transports/{mock.ts,context.tsx}` + anchors 解析                                          | `VITE_SPARK_MOCK=1` 下 onEvent 按 @delay/@wait 吐事件；审批挂起可 reply                        | 1.2  |
| 1.5 | ✅ web 空壳（提交 ee58c83）       | Vite+React+Tailwind+shadcn init；AppShell 三区骨架（Sidebar/主区/StatusBar）                       | `/welcome` 渲染引导块；主题 token 生效                                                         | 1.1  |
| 1.6 | ✅ server 空壳（提交 e45c99a）    | Fastify hello + 静态托管 + 优雅退出钩子                                                            | `curl 127.0.0.1:4318/api/healthz` 200（临时健康检查端点，仅阶段一调试用）                      | 1.1  |
| —   | ✅ **阶段验收**                   | —                                                                                                  | ✅ **web + mock 跑通"发送→流式回复"假对话**（1.3+1.4+1.5 串联）                                | 全部 |

## 阶段二：前端全量（对 Mock 开发）

- [x] 路由与 AppShell（/welcome、/session/:id、Sidebar/StatusBar 布局）（ee58c83/5b4b61e）
- [x] session-store + applyEvent 19 种事件单测全覆盖（ee382ef，24 例）
- [x] ChatView 虚拟化 + MessageItem/AssistantBlock/ReasoningCollapsible（600779b）
- [x] streamdown 流式渲染 + rAF 批量 flush（13dfc33）
- [x] ToolCard 三态 + Terminal/DiffViewer/CodeBlock 分发（a1acf99）
- [x] ApprovalCard（confirmation 改造）+ feedback + resolved 动效（a1acf99）
- [x] Composer 三模式 + 三态反馈（5b4b61e）
- [x] SessionSidebar 列表/分组/状态点 + 新建/切换（5b4b61e）
- [x] 深色模式 + 空态/加载态/错误态/断线重连条 + BackBottom（5b4b61e）
- [x] SettingsDialog（主题/默认 delivery）（ca27c91）
- [x] CommandPalette（cmdk copy-in：新建/切换会话/主题/设置/打断；§6.3 规格）（ca27c91）
- **验收**：✅ 全部 UI 交互在 mock 下无死角——四场景（normal/long-output/reject/error-finish）浏览器走查通过：流式渲染、工具三态、审批挂起/拒绝（feedback 落库）、error 重试、长输出滚动截头、断线重连条、命令面板与设置弹窗、主题二态

## 阶段三：引擎跑通

- [x] config 体系（spark.json/models.json 加载校验）
- [x] EventBus（durable 落盘后广播 + live 直播 + 订阅隔离 + 背压接口）
- [x] SessionStore（单写者 append/flush/fsync）+ EventTree + 坏行策略
- [x] SessionRuntime + InputQueue（三通道 + 唤醒合并 + interrupt 级联）
- [x] RunLoop（§5.5 全逻辑：steering 注入/StepContext/截断保护/maxSteps/失败闭合）
- [x] ToolRegistry + Pipeline（分组并行/权限门/进度节流/溢写）+ 四工具
- [x] PermissionService（evaluate/挂起表/超时/always 级联/规则文件）
- [x] LlmGateway（pi-ai 集成 + 事件回调 + 重试）
- [x] Projector（投影六步）+ compaction
- [x] server REST+SSE 全端点（§7 规格）+ HttpTransport 切换（前端零改动）
- [x] pino 日志 + 脱敏
- [x] ScriptedLlm 假 provider（预录响应序列注入 LlmGateway）——run-loop/工具/审批全链路 CI 可测，不依赖真实 API key
- **验收**：真实模型完成"读文件→改文件→跑命令→汇报"全闭环；断线重连回放正确；中断无悬挂事件

## 阶段四：深度体验

- [x] steer/queue 完整语义验证（turn 中插话/排队消费）
- [x] compaction（自动阈值+手动 /compact）+ 前端轻提示
- [x] 会话自动标题（§5.11 标题提示词；工单 4.4）+ 重启恢复/列表/状态点
- [x] fork 与树视图（三拒绝码 + tree 路由 + 前端树视图/分叉入口，工单 4.5）
- [x] checkpoint（turn 边界 git 快照，两域简化）+ UI（§5.8.7 / §7.2 路由行 / CheckpointDialog 回滚入口，工单 4.6）
- [x] permission always 持久化 + 同批放行 + 规则管理 UI（用户级 permissions.json 原子写 + alwaysPatterns 固化 + SettingsDialog 规则区，工单 4.7）
- [x] node:sqlite 会话索引（列表/搜索，不动 JSONL 权威）+ metrics 端点（boot 重建+durable 增量+GET /api/metrics Prometheus 文本，工单 4.8）
- **验收**：长会话（>100 turn）稳定；压缩后上下文正确；规则跨会话生效

## 阶段五：产品化

- [x] Electron 壳（ADR D14 sidecar 模式：`ELECTRON_RUN_AS_NODE` 拉起 server 单文件 bundle + healthz 探活 + 加载 `http://127.0.0.1:<动态端口>`，HttpTransport/协议零改动；apps/desktop + `SPARK_PORT`/`SPARK_WEB_DIST` 注入；NSIS 安装包走 GH Actions windows runner，Linux 本地 `--win zip` 管线已实证，工单 5.1）
- [x] 沙箱：bash 默认审批；Windows AppContainer / macOS Seatbelt / Linux bwrap 评估（ADR D15：平台 wrapper 前缀 bwrap/Seatbelt + spark.json bashSandbox 开关 + fail-closed 拒跑，Windows 本期不做 OS 级；隔离效果待真实主机验证——容器内 bwrap unprivileged namespace 不可用）
- [x] MCP client（ADR D16：@modelcontextprotocol/sdk stdio + ~/.spark/mcp.json 声明 + mcp__<server>__<tool> 注册进同一 ToolRegistry（审批 mcp.call 默认 ask/限界/溢写/事件一视同仁）；审批三态 allow/ask/deny 经真实子进程 e2e 测试实证，真实外部 server 现场演示待用户环境执行）
- [x] 子代理（ADR D17：子会话 = 独立会话（header.parentSession），主会话只见 task 工具事件对；Task 工具 {prompt,title?} 审批 agent.task 默认 ask、单层限制 E_SUBAGENT_DEPTH、父中断级联 interrupt 子会话；Steer expectedTurnId 校验——submit 可选参数，不符 E_TURN_MISMATCH 409。ScriptedLlm 四路径 e2e 已测，真实模型现场演示待用户环境执行）
- [x] skills/插件（ADR D18：`~/.spark/skills/<name>/skill.json` 声明式清单——插件是数据不是程序；protocol 运行时注册表 registerEventType/eventSchemaOf 与内置词表同一校验路径，EventBus.emitExtended durable/live 双路 + ignorable 信封（插件卸载后旧会话可加载，未装插件的前端跳过 ignorable 帧不断流）；hooks 声明式触发器（on 内置事件 → emit 插件事件，data 固定形状）；单 skill 失败 warn 跳过。示例插件 examples/skills/demo-ping + 引擎 e2e（session.created → plugin.demo.ping 落盘/卸载后重读）已测）
- **验收**：桌面安装包（GH Actions NSIS 产物管线 + Linux `--win zip` sidecar/healthz/Web UI 全通实证；Windows 本机安装走查待用户执行）+ 首个外部 MCP 工具可用（审批三态经真实子进程 e2e 实证；真实外部 server 现场演示待用户执行）。**五阶段全部完成，Spark v1**

## 阶段六：UI 重构（ZCode 化：亮色默认+设置中心）——工单级

> 实现依据：DESIGN.md v2.0 §A~§J（布局栅格/控件规格/主题 token/设置中心/Composer/管理页规格，全部落数值）；规格有疑义先提勘误再动手。测试面见 doc/06（6.8 首批落地 L2 组件/L3 E2E/视觉基线）。纪律：不动 engine/protocol（6.5 轻后端例外已声明）；组件库不新增，shadcn/ui 内消化。

| #   | 工单                 | 产出（目标 + 涉及包）                                                                                                                                     | 验收标准                                                                                                          | 依赖    |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------- |
| 6.1 | ✅ 主题翻转（H13）（提交 09cff97）      | web：§C token 表落地——light 挂 `:root` 默认、dark 收 `.dark`；系统跟随 + 手动切换；持久化 localStorage                                                                  | 亮色为系统默认；两主题 AA 对比度复核通过；跟随系统/手动/持久化三态可用                                             | —       |
| 6.2 | ✅ 布局栅格（H13/H15）（提交 23a8fe5）  | web：空态垂直居中（问候语+居中 Composer+建议 chips）；会话态沉底 Composer + 主区 768px 居中；左栏 264px 可折叠、会话按日期分组（数据源=磁盘 cwd 目录结构，纯前端点亮）；StatusBar 单行细条化 | 三视口（1280/1440/375）无大片空白；分组与磁盘目录一致                                                             | 6.1     |
| 6.3 | ✅ 控件规格落地（H13）（提交 1e85f90）  | web：按 §B 表重过存量组件（按钮 sm28/md32/lg38、输入框 38、圆角 6-8、字号 13/12/11）；Composer 按 §13.E 重做（底部工具条+权限四档预设层（D7 补记，protocol/engine/server 最小面）+now-steer-queue 分段+@ 与 / 菜单+多行自增至 6 行+空态 chips 填充）          | 存量组件密度抽查全过；Composer 新交互走查可用                                                                      | 6.1     |
| 6.4 | ✅ 设置中心骨架（H13/H16）（提交见下） | web：设置中心骨架，导航与分区对齐 DESIGN §13.D（三组：基础设置/Agent 能力/数据与统计，v2.0 定稿取代早期六分区草案）；外观区落地（主题/界面字号/浅深代码主题/行号/换行/代码字号+双栏预览——Streamdown/shiki 接入）；常规区语言与代理占位；沙箱开关占位（见版本记录 v3.4 分歧说明） | 三组导航可达、页骨架对齐 §13.D；外观区字段即存即生效；沙箱开关读写 spark.json 配置（**分歧留决策**）                                | 6.1     |
| 6.5 | ✅ 模型管理（H13）   | web+server（轻后端，本阶段唯一例外）：Composer 旁会话级模型选择器 + 设置内供应商列表 + 连通测试（新增 GET /api/models 与 POST /api/models/:id/test，PR 说明中单列；另加 PUT /api/sessions/:id/model 换模型路由——用户决策"加换模型路由"+"扩展 models.json"）      | 选择器切换即时生效于新 turn；连通测试返回时延/错误人话文案                                                        | 6.4     |
| 6.6 | ✅ 用量条（H13/H23 前置） | web：读 assistant.message usage + Projector 估算，Composer 上方细条，超阈值变色                                                                          | 用量与 StatusBar 累计一致；阈值变色可演示                                                                          | 6.2     |
| 6.7 | ✅ 断线与错误态（H14）（提交见下） | web：错误码→人话文案表 error-copy.ts 单一来源（server §7.4 全部错误码 + transport/mock 特有码；E_MOCK_UNKNOWN_SESSION→"会话不存在或已被清理"，原码折叠进详情）；ErrorBanner 顶部细条+重试统一；errorMessageOf 接入全部 E_* 出口（对话框/设置页/会话列表/Composer/Toast） | 全部 E_* 出口走文案表；断线→重连→续播走查通过（6.8 一并验收）                                                    | 6.2     |
| 6.8 | ✅ 验收（doc/06 首批）（提交见下） | web+测试：mock 四场景 + 断线场景，1280/1440/375 三视口截图对比入 doc/06 基线；Playwright 组件 + E2E 首批用例入库                                                          | doc/06 §1 首批用例全绿（L2 22 例+L3 7 例）；三视口截图 6 张入 apps/web/e2e/__screenshots__/                                                                  | 6.1–6.7 |

## 阶段七：Harness 补全（顺序 = doc/07 §4 优先级 P0→P2）——工单级

> 缺口编号（H01–H36）与判决以 doc/07-harness-audit.md 为准，与定稿冲突以本表为准。7.5/7.6/7.10 动手前各补一条迷你 ADR；动 protocol 词表按 AGENTS 硬性约定第 5 条从 packages/protocol 开始。原 7.9（Python worker）经审计判决**删除**（doc/07 §4.1），后续编号顺延不变。

| #    | 工单                          | 产出（目标 + 涉及包）                                                                                                                                                           | 验收标准                                                                                              | 依赖    |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| 7.1  | ✅ secrets 管理（H01，P0）    | engine+web：~/.spark/secrets 存储 + 设置页录入 + 引擎取用优先级（store > env），env 迁移兼容                                                                     | apiKey 不再必须环境变量；日志/事件流无明文密钥（复用 pino 脱敏断言 + registerSecrets 单点注册）       | —       |
| 7.2  | ✅ I/O 护栏（H02，P0）        | engine：工具输出注入检测（标记协议 + 可疑模式结构化告警事件）+ 敏感输出过滤（复用 pino 三层脱敏正则）                                                             | 注入样例集触发告警事件且不阻断 turn；密钥样例经工具输出进上下文前被过滤（IoGuard 挂 ToolPipeline，`io.warning` log-only） | —       |
| 7.3  | 用户侧 hooks（H03）           | engine：spark.json 声明 turn.before / turn.after / permission.resolved / tool.completed 挂点 → 外部命令或 skill 触发                                             | 四挂点 e2e 各一例；hook 失败不阻断主流程（warn 闭合，同 D18 纪律）                                     | —       |
| 7.4  | 命令注册表（H04）             | engine+web：/命令 解析框架（/compact 迁入）+ ~/.spark/commands/*.md 自定义命令 + CommandPalette 接入；**命令清单基线 = 对齐 Claude Code 命令面（/compact /model /mcp /skills /usage /resume）+ opencode leader 键模式（ctrl+x 前缀）——命令名可不同，覆盖面以此为下限** | 基线清单逐条可用；自定义 .md 命令可被发现与执行；/compact 行为回归不变                                 | —       |
| 7.5  | 长期记忆（H05，P1）           | engine+web：~/.spark/memory.db（node:sqlite FTS5；向量检索后置）+ memory.save/search 工具族 + Projector 注入 top-k + 设置页管理；迷你 ADR                          | 记忆跨会话生效（save→新会话 search 命中）；注入不破坏 surface 纪律（模型可见必被记录）                 | 7.1     |
| 7.6  | 自动化触发器（H06，P1）       | engine+web：cron / watch / webhook 三类触发 → 自动建会话执行 prompt；任务列表 + 运行历史 UI；迷你 ADR                                                             | 三类触发器各一条 e2e；运行历史可查；失败运行有结构化错误留存                                           | 7.1     |
| 7.7  | model routing 增强（H07，P0） | engine：provider fallback 链 + 按任务路由（主/压缩/标题/子代理）+ 成本上限熔断（usage 聚合阈值中断）                                                             | 主模型断连自动 fallback；熔断触发后新 turn 拒绝且人话提示；路由配置热生效                              | —       |
| 7.8  | 子代理增强（H08，P1）         | engine+web：并行 Task（解除单并发）+ 树状运行监控（复用 4.5 树视图加运行态）                                                                                     | 多子代理并行互不串扰；监控视图实时状态与事件流一致；单层限制语义不变                                   | —       |
| 7.10 | browser 工具族（H09，P2）     | engine+web：Playwright chromium；browser.open/click/read/screenshot 工具、审批默认 ask、前端 BrowserCard 可视化；迷你 ADR                                         | 四工具走查（真实页面）；审批/中断/失败闭合与内置工具同管线；截图经工具输出限界                          | —       |
| 7.11 | eval harness（H10，P2）       | examples+脚本：examples/evals 场景集（ScriptedLlm 回归 + 可选真实模型评分）+ pnpm eval + 接入 nightly（doc/06 §2）                                                | pnpm eval 本地可跑；nightly 红灯出报告；场景集含审批/中断/压缩回归                                     | —       |
| 7.12 | 审计日志（H11，P1）           | engine+web：permission 决策 / 规则变更 / rollback 独立 JSONL 明细流 + 设置页查看器                                                                               | 明细流含时间/主体/动作/结果；查看器可过滤；脱敏纪律同 pino                                             | 7.1     |
| 7.13 | 会话全文搜索（H12，P1）       | engine+web：事件内容入 FTS5 + 搜索页（标题/内容命中高亮）                                                                                                        | 千事件会话搜索 <500ms（doc/06 基线）；命中高亮与跳转正确                                               | —       |

## 阶段八：CLI TUI（对齐 Claude Code/pi 形态）——工单级

> 可与阶段七并行开发、串行合入；选型依据 ADR D19（Ink v6）。纪律：server 零改动为验收项（确需改动单独工单说明）；错误人话文案表与 web 共享同一来源（doc/07 §3）。

| #   | 工单                       | 产出（目标 + 涉及包）                                                                                                                                     | 验收标准                                                                                              | 依赖      |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | transport 下沉             | protocol：web HttpTransport 内核（SSE 解析/重连/REST 错误映射）抽至 packages/protocol transport-node 模块，web 与 cli 共用                                  | web 既有测试保绿；cli 冒烟连真实 server                                                                | —         |
| 8.2 | Ink 骨架                   | 新建 apps/cli（Ink v6）四区：会话列表侧栏 / 消息流 / 输入框 / 状态细条；<80 列隐藏侧栏；resize 适配                                                        | 80 列与 200 列两档走查可用；冷启 <1s（doc/06 基线）                                                    | 8.1       |
| 8.3 | 核心交互                   | apps/cli：流式 delta 渲染；tool 单行折叠可展开；reasoning 默认折叠；审批 y=once / a=always / n=reject；Esc 中断 turn；双击 Ctrl+C 退出；/compact；Tab 循环 now/steer/queue 状态条显示；键位表成文（H36 前置） | 交互清单逐条走查；键位表入文档并与错误文案表同库共享                                                   | 8.2       |
| 8.4 | 断线续播 + 优雅退出        | apps/cli：细条提示 + 自动退避重连 + since=seq 续播；错误人话化共享文案表；SIGINT 优雅退出                                                                   | kill server→重启→续播无丢失；SIGINT 无悬挂 turn                                                        | 8.2       |
| 8.5 | 验收与登记                 | apps/cli+docs：Ink test-renderer 组件快照 + tty 模拟四幕走查（doc/06 §5）截图入 doc；README 补 pnpm --filter cli dev；本表勾选；AGENTS 适配表登记           | 四幕走查通过；测试/typecheck/lint 全绿（含 cli 包）                                                    | 8.1–8.4   |

## 阶段九：移动端三端（Android/iOS App + 微信小程序）——工单级

> 选型依据 ADR D20（Expo+RN）/ D21（Taro 4）/ D24（配对鉴权）；9.1 为本阶段首工单，未完成前 App 无法真连。纪律：缺省行为不变红线（127.0.0.1+无鉴权）；动 protocol 先按硬性约定第 5 条；服务端改动仅限 9.1 声明范围。

| #   | 工单                  | 产出（目标 + 涉及包）                                                                                                                                             | 验收标准                                                                                              | 依赖    |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| 9.1 | 配对鉴权（D24）       | server+web：server.host 显式配置才可非环回；非环回强制 token、**扫码配对为主（桌面出示 QR 含一次性短码，DESIGN §13.J.9）、手输 6 位码兜底**，换长效 token、REST 与 SSE 同口径校验、无 token 非环回拒绝启动（fail-closed）；web 设置页配对 UI | 缺省行为不变；非环回无 token 拒启动；扫码与手输双路径走查（含撤销被拒）                                 | —       |
| 9.2 | RN 骨架（D20）        | 新建 apps/mobile（Expo+RN）：复用 @spark/protocol + applyEvent + 设计 token 映射 RN 主题（亮色默认、深浅跟随系统）；**视觉按 DESIGN §13.J（Qoder CN 实测规格：白卡无边框分层/单栈+抽屉/逐页 11 页映射）**；会话列表（下拉刷新）/ 会话页 / 设置页三屏 + 导航 | 三屏走查（对照 §13.J 数值）；冷启 <2s（doc/06 基线）；CI 增 RN typecheck+Jest                          | 9.1     |
| 9.3 | 会话体验              | apps/mobile：SSE 流式、审批卡三键（§13.J.3 纵向全宽形态）、中断、断线重连条、下拉加载历史（GET /:id 分页）、键盘避让与安全区、Composer 多行自增（§13.J.1 胶囊形态）   | 四场景走查（正常/审批/断网恢复/配对撤销被拒）；Maestro 用例入库（doc/06 L5）                            | 9.2     |
| 9.4 | 小程序（D21）         | 新建 Taro 4 壳复用逻辑层；v1 = 开发者工具 + 体验版（局域网 IP + 不校验合法域名开关），正式分发中继服务记 v2（ADR D21）                                             | 开发者工具四幕走查；体验版真机预览可用                                                                 | 9.1     |
| 9.5 | 验收                  | mobile+docs：iOS/Android 模拟器 + 各一台真机四场景走查；Maestro 双端；真机记录（截图/录屏）归档；本表勾选 + README/AGENTS 登记                                      | doc/06 §5 四幕×双端全过；CI 全绿（含 RN）                                                              | 9.1–9.4 |

## 8.6 测试矩阵（各阶段验收的测试面；框架 vitest）

| 模块               | 用例要点                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| protocol           | 19 种事件样例逐一过 zod schema（round-trip）；信封 surface 标记的编译期断言；DTO/配置 schema                                                                     |
| engine/config      | 三配置文件 zod：合法 / 缺字段 / 越界值 → 启动失败（E_CONFIG）                                                                                                    |
| engine/bus         | durable seq 单调且**落盘后**才广播；live 不计数；订阅者异常隔离；背压 pause/resume                                                                               |
| engine/input-queue | now/steer/queue × idle/running 全矩阵的三态返回；唤醒合并不空转                                                                                                  |
| engine/run-loop    | steering 注入时序（下一 step 前生效）；stopReason 'length' 截断补事件对；maxSteps 强制收尾；error 失败闭合；interrupt 级联（LLM 流/工具/挂起审批）               |
| engine/tools       | 四工具 × {成功、越界 E_PATH_OUTSIDE、超时/abort、错误码路径}（AGENTS §3 单测四路径）；edit 唯一性（0 命中/>1 命中）；输出限界截断+溢写文件                       |
| engine/permission  | evaluate 优先级（临时>项目>用户>默认 ask）；always 写入 + 同批放行；超时/中断 fail-closed；reject feedback 注入 user.message                                     |
| engine/session     | 单写者 append/flush；坏行（尾行丢弃/非尾拒绝加载）；resume 补 turn.completed{aborted}；Projector 投影（无/有 compaction 分支 × reasoning 配置）；mungeDir 确定性 |
| server             | 路由 zod 400/404/409/503 映射；SSE 回放+直播边界、心跳、全局订阅；SPA fallback 排除 /api                                                                         |
| web                | **applyEvent 20 种逐一断言**（AGENTS 硬性约定 §2.8）；connection-store 断线状态机；Composer 三态渲染；选择器浅比较（流式仅命中项重渲染）                         |
| 集成               | MockTransport 四场景全跑（§4.7 表）；阶段三：ScriptedLlm 全闭环 + 崩溃恢复（kill -9 后 resume 无悬挂事件）                                                       |

## 8.7 v2 候选池（未排期，不阻塞阶段六~九；缺口编号对应 doc/07 §2.7）

| 编号  | 项                       | 优先级 | 依赖 / 备注                                   |
| ----- | ------------------------ | ------ | --------------------------------------------- |
| V2-01 | MCP/技能管理页（列表/启停/连接状态） | P1     | 依赖 6.4 设置骨架；数据源 mcp.json/loader 已就绪 |
| V2-02 | 插件市场壳               | P2     | 依赖 V2-01；loader（5.5）已就绪               |
| V2-03 | 附件/图片粘贴 + @file 引用 | P1     | protocol attachments 字段已预留；需后端接收端点+工具读图 |
| V2-04 | 文件树抽屉               | P1     | 轻后端目录列举端点；UI 规格见 DESIGN §J       |
| V2-05 | 通知推送（turn 完成/审批等待） | P1     | Electron notification + 托盘                  |
| V2-06 | LLM 出网代理（HTTP proxy/自定义证书） | P1     | 公司网必需；pi-ai baseUrl 已支持              |
| V2-07 | 成本看板（按日/供应商聚合） | P1     | 依赖 6.6 用量条 + 7.7 熔断的 usage 聚合       |
| V2-08 | 审查模式（多文件 diff 聚合+批量放行） | P2     | checkpoint git 底子已有；形态参考 Codex Diff/Logs 双栏 |
| V2-09 | 辅助会话抽屉             | P2     | 纯前端形态；引擎跨会话并发已有                |
| V2-10 | 内置终端面板             | P2     | 桌面 pty；需 Electron preload/IPC 首次引入    |
| V2-11 | trace 视图               | P2     | JSONL 即 trace 潜质；聚合查询先行             |
| V2-12 | i18n 框架                | P2     | 文案表先集中（6.7）再抽取                     |
| V2-13 | 数据管理（占用/清理/导出导入） | P2     | ~/.spark 目录统计 + 清理须走确认纪律          |
| V2-14 | 诊断页（日志查看器/导出） | P2     | logs/engine.log 已有                          |
| V2-15 | 自更新                   | P2     | electron-updater；代码签名前置                |
| V2-16 | 用户可配提示词模板       | P2     | 三处硬编码（doc/07 §2.1）                     |
| V2-17 | onboarding 引导流        | P2     | 首启配 Key→选模型→建会话                      |
| V2-18 | 代码库语义索引（RAG）    | P3     | 大件；与会话索引（4.8）分离                   |
| V2-19 | 沙箱网络隔离             | P2     | ADR D15 后置项                                |
| V2-20 | 多窗口多会话             | P3     | Electron 多 BrowserWindow                     |
| V2-21 | MCP HTTP/SSE transport   | P2     | ADR D16：远程 server 有真实诉求再立项         |
| V2-22 | 快捷键 keymap 自定义（web） | P2     | 8.3 CLI 键位表成文后共享同一来源              |
| V2-23 | 会话管理增强（删除/归档/置顶） | P2     | 移动端截图评审新发现（DESIGN §13.J.3）：后端无 DELETE /api/sessions/:id（server routes 实测），归档/置顶需 meta 标记与索引列；UI 形态=会话菜单+已归档抽屉 |

---

# 9. 参考速查表（29 条）

| 问题                                                | 项目             | 文件                                                                                                                                           |
| --------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| run loop 写干净                                     | pi               | packages/agent/src/agent-loop.ts                                                                                                               |
| steering/排队语义                                   | opencode / Codex | core/src/session/input.ts + run-coordinator.ts / protocol/src/turn_input.rs                                                                    |
| 事件要不要落盘                                      | opencode         | schema/src/event.ts（durable 定义）                                                                                                            |
| 模型历史投影                                        | dsh              | packages/core/session/src/surface.ts + index.ts deriveMessages                                                                                 |
| 工具并行/串行门控                                   | Codex            | core/src/tools/parallel.rs                                                                                                                     |
| 工具 schema-first 定义                              | opencode         | core/src/tool/tool.ts                                                                                                                          |
| 审批规则引擎                                        | opencode         | core/src/permission.ts（evaluate/Deferred/always 级联）                                                                                        |
| 审批 fail-closed                                    | dsh              | packages/interaction/user-approval/src/index.ts decide()                                                                                       |
| 审批=学习机会                                       | Codex            | protocol.rs ReviewDecision（ExecpolicyAmendment）                                                                                              |
| JSONL 会话树/分叉                                   | pi               | coding-agent/src/core/session-manager.ts                                                                                                       |
| compaction 设计                                     | pi / opencode    | session-manager.ts / schema session-message.ts Compaction                                                                                      |
| resume 反向扫描                                     | Codex            | rollout/src/reverse_jsonl_scanner.rs                                                                                                           |
| SSE 端点实现                                        | opencode         | server/src/handlers/event.ts                                                                                                                   |
| 背压处理                                            | pi / Grok        | rpc-mode stdout 反压 / event_loop.rs biased select                                                                                             |
| checkpoint 多域捆绑                                 | Grok             | xai-grok-workspace/src/session/checkpoint.rs                                                                                                   |
| 工具输出限界溢写                                    | opencode         | core/src/tool-output-store.ts                                                                                                                  |
| 中断语义（工具/流）                                 | pi / Codex       | handleRunFailure / parallel.rs AbortOnDrop                                                                                                     |
| 前端事件投影/Agent Web UI                           | dsh              | apps/web + packages/client                                                                                                                     |
| 单契约多客户端/进程内 SDK                           | opencode         | protocol + sdk-next（伪 fetch 复用 client）                                                                                                    |
| Claude Code 具体实现                                | 泄露源码         | Wanfeng1028/claude-code-analysis（**只读不抄**）                                                                                               |
| 工作流/提示词设计                                   | claude-code      | 官方仓库 plugins/ 16 个官方插件                                                                                                                |
| Grok 深度中文讲解                                   | 书               | https://zhanghandong.github.io/grok-build/                                                                                                     |
| 前端范式与许可证陷阱                                | 前期会话         | 01-research-report.md §0                                                                                                                       |
| TS 的引擎/UI 分包与审批总线                         | Gemini CLI       | packages/core（core/cli/sdk/a2a-server 分包）、packages/core/src/confirmation-bus；⚠️ pin 版本（Google 迁闭源 Antigravity 风险）               |
| 审批做成策略引擎（TOML 分层规则带）                 | Gemini CLI       | core/src/policy/policy-engine.ts + policy/policies/*.toml（Admin 5.x>User 4.x>Workspace 3.x>Extension 2.x>Default 1.x；YOLO=998/ask_user=999） |
| 上下文压缩双层（历史压缩/工具输出蒸馏）             | Gemini CLI       | core/src/context/{chatCompressionService,toolDistillationService}.ts                                                                           |
| 网关协议包与插件合同                                | OpenClaw         | packages/gateway-protocol（独立协议包范本）、packages/plugin-sdk + plugin-package-contract                                                     |
| 多渠道/子代理 RPC/沙箱后端抽象                      | Hermes Agent     | NousResearch/hermes-agent（Python 为主——抄思路不抄代码）                                                                                       |
| 多协议 provider 运行时切换 / daemon+IM 多客户端形态 | Qwen Code        | QwenLM/qwen-code（Gemini CLI 血统分支，只查增改）；GUI 生态 Piebald-AI/gemini-cli-desktop                                                      |

---

# 10. 风险与对策

| 风险                                    | 概率         | 对策                                                                           |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| pi 包 0.x breaking（团队主导无社区 PR） | 中           | 锁版本 + pi 依赖隔离在 LlmGateway 单点（§5.9）；必要时 vendor                  |
| AI Elements 面向 Next.js                | 中           | copy-in 删 "use client"+换数据源（§6.7 清单）                                  |
| assistant-ui 0.x                        | 低           | 仅按需引入状态层，核心不依赖                                                   |
| pi-agent-core 循环与事件模型不完全匹配  | 中           | 只用其 stream/工具原语，RunLoop 自写                                           |
| 本地安全（bash）                        | 高（产品层） | 阶段三默认全审批；路径硬边界优先于审批；阶段五沙箱；never 策略 dispatch 前判定 |
| 事件协议演进                            | 中           | durable 带 version 预留；未知类型 fail-closed；ignorable 逃生                  |
| 范围蔓延                                | 高           | MVP=四工具+对话+审批；MCP/子代理/技能在阶段五后                                |
| 长会话性能                              | 中           | live delta 不落盘；虚拟化；rAF 节流；阶段四 SQLite 索引                        |

---

# 11. 附录：术语表

| 术语               | 定义                                                 | 来源              |
| ------------------ | ---------------------------------------------------- | ----------------- |
| turn               | 一次用户输入引发的完整工作（可含多轮采样+工具）      | Codex             |
| step               | turn 内一次"采样⇄工具"迭代                           | dsh/opencode      |
| steering           | turn 进行中插入输入，下一 step 前生效                | Codex/pi/opencode |
| durable/live 事件  | 落盘可回放 / 仅内存直播的事件二分                    | opencode          |
| surface 事件       | 进模型历史的事件（Model-visible means logged）       | dsh               |
| rollout / 会话日志 | append-only 事件日志文件                             | Codex             |
| projection（投影） | 从事件流派生的读取模型（模型上下文/UI 状态）         | opencode/dsh      |
| compaction         | 上下文压缩：摘要+保留锚点                            | pi/opencode       |
| checkpoint         | 可回滚的多域状态快照                                 | Grok              |
| fail-closed        | 异常/缺失一律拒绝而非放行                            | dsh               |
| headless 引擎      | 无 UI 的核心进程，客户端经协议连接                   | Codex/opencode    |
| copy-in            | 组件源码拷入自有仓库的分发模式（shadcn/AI Elements） | shadcn            |

---

_方案完（v3.0）。阶段一~五已完成（Spark v1）；开工顺序：阶段六 → 阶段七 → 八/九（可并行开发、串行合入），v2 候选池不阻塞；每次完成按版本记录表追加记录并 push。_
