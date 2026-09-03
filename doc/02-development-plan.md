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
| v3.11 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.7 model routing 落地（H07，P0）**：engine `fallback-gateway.ts`（LlmGateway 装饰器——仅 stopReason=error 且零已交付时逐个切链（aborted/部分交付不切，pi"已交付即不重试"同源）；链尽汇总 `E_LLM_FALLBACK` 人话列各模型失败原因；空链短路 inner 行为完全不变；链经函数每请求现读支持热更新）+ `cost-tracker.ts`（~/.spark/usage.json 原子写持久累计，坏 JSON/形状 fail-closed E_CONFIG，exceeded = 累计 ≥ 阈值）+ run-loop `Budget` 端口熔断双检点（新 turn 拒绝 + 每步 assistant.message 定稿后中断，`E_BUDGET_EXCEEDED` 人话含解除路径）+ engine 装配（FallbackGateway 包 PiGateway；compaction/title/subagent 路由档 getter 现读热生效；getRouting/updateRouting/resetUsage 写回 models.json）；models.json 增 `fallbacks/titleModel/subagentModel/costLimitUsd`（zod+缺省回 defaultModel/不限）；protocol 增 RoutingDto/RoutingUpdate + Transport 三方法；server 注册 GET/PUT /api/routing、DELETE /api/routing/usage；web Http/MockTransport 对等实现；routing 单测 20 例（gateway 切换纪律/链尽汇总/空链短路/热更新/CostTracker 持久化往返/fail-closed/Engine 集成热生效+熔断闭环+写回）+ run-loop 熔断 2 例 + server 路由 1 例；§4.5/§5.1/§7.2 表同步；阶段七 7.7 勾选、doc/07 H07 勾销 |
| v3.12 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.3 用户侧 hooks 落地（H03）**：engine `hooks/runner.ts` UserHookRunner——spark.json `hooks` 段声明四挂点（turn.before/turn.after/permission.resolved/tool.completed）→ 两种触发：`{command, timeoutMs?}` 外部命令（shell 解释，cwd=会话工作目录，stdin 收 `{point, sessionId, cwd, sourceEventId, data}` JSON 载荷；Claude Code settings hooks 同信任模型——用户显式写进自己的配置，不走审批门）或 `{skill, emit}` 插件事件（emit 须在该 skill 清单声明，data 形状同 ADR D18 `{skill, sourceEventId, sourceType}`）；纪律 fire-and-forget——spawn 失败/非零退出/超时/skill 未加载只 warn 闭合不阻断主流程；载荷不含工具 output（防超大/敏感内容外泄）；挂点接线：run-loop turn.before（事件流开路前）+ turn.after（completed 落盘后）/ ToolPipeline emitCompleted 统一出口（合成闭合对 E_ABORTED/E_TRUNCATED 不触发）/ PermissionService onResolved 回调（emit 后）；config spark.json schema 增 hooks 段（strictObject 防混写）；user-hooks 单测 11 例（命令载荷 JSON 全字段断言/超时 kill/非零退出/EPIPE 吞/spawn 失败 warn/skill 触发落盘+广播/未加载与未声明 warn/Engine e2e 四挂点全链路含顺序断言 before 先行 after 收尾+命令失败不阻断）；§5.1 spark.json 表同步；阶段七 7.3 勾选、doc/07 H03 勾销 |
| v3.13 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.4 命令注册表落地（H04）**：命令面基线对齐 Claude Code（compact/model/mcp/skills/usage/resume）——engine `commands/loader.ts`（内置基线 BUILTIN_COMMANDS 三 kind：action=compact 引擎动作 / client=五条界面命令由前端执行 / prompt=自定义）+ `~/.spark/commands/*.md` 扫描（文件名即命令名，frontmatter 简单 key:value 解析无 YAML 依赖，$ARGUMENTS 占位符替换/无则追加——Claude Code 同语义；坏文件/名字非法/内置重名 warn 跳过）；Engine.listCommands/executeCommand（compact 走 handle.compact 回归 §5.8.5、自定义展开走正常 turn 通道 user.message 落盘、client/未知命令失败闭合 E_COMMAND_CLIENT/E_NOT_FOUND）+ listMcpServers（McpManager 增 serverStatuses 快照——失败也列出 connected:false）+ listSkills（loadedSkills 只读面）；protocol 增 CommandDto/McpServerDto/SkillDto + Transport 四方法；server 注册 GET /api/commands、POST /api/sessions/:id/commands/:name（body 可空）、GET /api/mcp、GET /api/skills + E_COMMAND_CLIENT 400 映射；web——composer-menus 改注册表驱动（SLASH_COMMANDS 全可用 + mergeSlashCommands 合并 + parseCommandInput 首词解析）、Composer 硬编码 /compact 拦截迁入 onCommand 分发（行为回归）、CommandPalette 增"/ 命令"分组（resume 面板语境自滤、引擎命令仅 activeId 存在时列出）、useCommands hook、client-commands 动作表（model/mcp/skills/usage 导航设置页 + resume 开面板）、设置中心 mcp/skills/usage 三页 placeholder→ready 只读点亮；Http/MockTransport 对等实现（mock 含 review 自定义命令演示）；测试：engine commands 10 例 + server commands-routes 6 例 + web composer-menus 19 例（merge/parseCommandInput 新增 5）+ Composer 组件 10 例（命令分发 3 新增含 /compact 迁入回归）；§4.5/§5.1 表同步；阶段七 7.4 勾选、doc/07 H04 勾销。**opencode leader 键模式（ctrl+x 前缀）留 8.3 CLI 键位表成文时统一落地**（web 已有 Cmd+K 面板，命令覆盖面为本工单验收线） |
| v3.14 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.5 长期记忆落地（H05，P1；迷你 ADR D25 见 ARCHITECTURE v1.17）**：**新增事件 `memory.injected`（词表 20→21 种，§4.3/§4.4/§6.4 三表同步 + AGENTS/ARCHITECTURE/README 计数同步）——先于 user.message 落盘，Projector 投影为模型上下文首条前缀 user 消息（模型可见必被记录，surface 纪律双面成立；锚点后过滤与 surface 事件同规则——压缩后不重复注入）**；engine `memory/store.ts` MemoryStore（~/.spark/memory.db，node:sqlite + FTS5 trigram 虚表外容模式 + 触发器同步——中文子串可命中（unicode61 整段成词不可子串的修复）；FTS 建表失败降级 LIKE；召回链=整串 trigram MATCH→整串 LIKE→拆词最长词 LIKE；中文整句语义召回是已知限制，向量检索后置）；memory.save/memory.search 工具族（审批 action memory.write/read 资源恒 memory，空规则表缺省 ask 可 always 固化；save 内容用户可见）；注入端口（RunLoopDeps.memory.maybeInject——每会话仅首条 user.message 且未注入过且命中非空才 emit；仓不可用不接线、工具不注册 fail 路径不存在）；protocol 增 MemoryDto + Transport 两方法；server 注册 GET /api/memories、DELETE /api/memories/:id（无此条 404）；web——applyEvent memory.injected 落 slice.memoryInjected（不进 items）、设置中心 memory 页 ready（列表+删除）、Http/MockTransport 对等实现；测试：engine memory 8 例（store 往返/trigram 中文子串/召回链/短查询 LIKE/删除同步 + e2e：save 工具落库→新会话注入命中投影/第二条不重复注入/仓跨进程持久）+ web applyEvent 1 例 + server memory-routes 2 例；§4.5 API 表两行；阶段七 7.5 勾选、doc/07 H05 勾销 |
| v3.15 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.6 自动化触发器落地（H06，P1；迷你 ADR D26 见 ARCHITECTURE v1.18）**：engine `automation/`——`cron.ts` 自研解析器（`*`/范围/列表/步长组合 + 周日 7→0 归一 + cronMatches 五字段匹配）+ `registry.ts` AutomationRegistry（~/.spark/automation.json tmp+rename 原子写 + automation-runs.jsonl 追加写；坏 JSON fail-closed E_CONFIG）+ `manager.ts` AutomationManager（setInterval tick——cron 同分钟去重防重复触发 / watch mtime 基线比对 / webhook 与手动按需；**触发效果恒为建会话发 prompt**——FireDeps.createSession 注入，引擎接线、测试替身可替；失败运行不吞——运行历史行留结构化 `error`；stop 清理定时器）；Engine 七公开方法 + ready 后 start、doShutdown 先 stop；协议面从 packages/protocol 开始（AGENTS §2.5）：AutomationTriggerDto/AutomationCreate/AutomationRunDto + Transport 七方法；server 注册 /api/automation 七端点 + 错误码映射四行（E_TRIGGER_DISABLED 409 / E_TRIGGER_KIND 400 / E_TRIGGER 400 / E_CRON 400，特化前缀先于泛化）；web——/automation 页（DESIGN §13.F.3：空态虚线卡 + 定时/闲时模板网格 + 任务列表启停/立即运行/删除 + 运行历史 + 创建 Dialog；**"保持电脑唤醒"不在 web 落地**——系统电源权限归桌面壳，如实缺省）+ Sidebar 自动化入口（折叠图标态/展开"自动化"）+ Http/MockTransport 对等实现；测试：engine automation 21 例（cron 解析/匹配含周日 7、步长、列表 + registry 持久化/坏 JSON/运行追加 + manager cron 同分钟去重/watch 变更触发/非空触发禁用拒绝/手动失败闭合/stop）+ server automation-routes（列表/创建校验 400/删除/启停/运行历史 limit/手动触发建会话/webhook 拒绝）；§4.5 API 表七行 + §7.2 要点表 + §7.4 错误表四行；阶段七 7.6 勾选、doc/07 H06 勾销（v1.7） |
| v3.16 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.8 子代理增强落地（H08，P1；D17 补记见 ARCHITECTURE v1.19）**：**并行解除**——`task` 工具 `parallelizable` 改 true：多子代理各自独立子会话（独立事件流/输入队列）并行跑互不串扰，并发上限仍受管线 `maxToolParallel` 分批约束；单层限制（E_SUBAGENT_DEPTH）语义不变。**树状运行监控**——`ToolContext.sourceEventId`（pipeline 注入本次 `tool.started` 事件 id）→ `createSession({parentEventId})` → 子会话 header → `scanForkChildren` 锚定（子代理与手动 fork 同走树视图，此前子代理因无 parentEventId 不可见）；`ForkChildDto.status` 运行态快照（引擎 `statusOf`：已加载实时、未加载 idle）经 server treeToDto / mock getTree 至 web——SessionTreeDialog 子代理行复用 SessionStatusDot（activeTurn 活跃优先于 DTO 快照，同 Sidebar 语义）+ 运行中/等待审批文案；测试：并行时序重叠（两子 turn.started 皆早于任一 turn.completed）+ prompt 隔离 + 结果映射 + 树锚定/运行态 idle→running→idle + makeTaskTool 断言翻 true；阶段七 7.8 勾选、doc/07 H08 勾销（v1.8） |
| v3.17 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.12 审计日志落地（H11，P1）**：engine `audit/log.ts` AuditLog——~/.spark/audit.jsonl 独立追加明细流（单写者纪律同 automation-runs）；三类 kind：`permission.decision`（规则快路径归因 `rule:<层>`——preset→session→project→user 倒查首个单层同效层；用户答复 `reply:once/always/reject` 主体 user；timeout/abort/shutdown/cascade 主体 system）/ `permission.rule`（设置页增删 `settings-ui` + always 固化 `reply:always`，含 op add/remove 与 effect）/ `session.rollback`（rollbackToCheckpoint 记 checkpointId）；**写前脱敏同 pino**（redaction.ts 单一来源三层正则 + 密钥仓动态值，同 IoGuard 模式）；审计是旁路——写失败吞掉不阻断审批/回滚主链路，读端坏行跳过；协议面从 packages/protocol 开始（AGENTS §2.5）：AuditEntryDto/AuditQuery + Transport.listAudit；server GET /api/audit（过滤 since/kind/result/tool，limit 缺省 200 上限 500，坏枚举/越界 400）；web 设置页"审计日志"查看器（§13.G 转录式明细流：时间+主体+决策 chip+来源；时间范围/决策/类型/工具四过滤；基线 15 页之外的增项，同权限规则页先例）；测试：engine audit 9 例（往返/坏行/脱敏静态+动态/过滤 + 服务层归因三路径 + always 规则行 + 超时 + Engine 规则管理/审批全链路/rollback）+ server audit-routes（空列/过滤/坏查询 400）；§4.5 API 表 + §7.2 要点表各一行；阶段七 7.12 勾选、doc/07 H11 勾销（v1.9） |
| v3.18 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.13 会话全文搜索落地（H12，P1）**：engine `search/store.ts` SearchStore——~/.spark/search.db（node:sqlite）全文索引：索引范围 = user.message / assistant.message 的 text 块 / session.title 三类；行主键（session_id, event_id）——fork 复制事件沿用原 event id，单列 event_id 会跨会话碰撞；（session_id, seq）二级索引服务回滚截断；检索链 = FTS5 trigram MATCH（≥3 字符，中文子串可命中）→ 整串 LIKE → 拆词最长词 LIKE（自然语句兜底，同 MemoryStore 先例），FTS 建表失败降级 LIKE 引擎照常启动；**水位表装载点幂等同步**（持平跳过 / 倒退先截断界外行 / 缺失全量补——create/resume/fork/rollback 重载共用单点）；增量钩子在 bus durable 订阅（旁路，失败只 warn）；JSONL 恒为权威（同 SessionIndex 纪律），库打开失败降级空结果不阻塞启动；shutdown 6.6 收尾（searchClosed 先行置位短路迟到写，同 indexClosed 纪律）；命中摘要引擎侧截窗（命中处前 30/后 90 字符，不中取前 120）；协议面从 packages/protocol 开始（AGENTS §2.5）：SearchHitDto + Transport.search；server GET /api/search（q 必填，limit 缺省 20 上限 100，坏查询 400）；web——/search 页（回车检索、命中摘要查询词高亮、点击 `?event=` 直达）+ ChatView focusEventId 定位滚动与 2.5s 高亮闪烁 + SessionPage 读参 + Sidebar 搜索入口（折叠图标态/展开"搜索"）+ Http/MockTransport 对等实现；测试：engine search 12 例（store 往返/幂等覆盖/FTS 中文子串/短查询 LIKE/召回链/截断同步/水位/复合主键不碰撞/通配转义/**千事件检索 <500ms DoD 性能线** + e2e：三类命中+标题填充+摘要/重启水位持平/删库装载点重建）+ server search-routes（空列/形状/limit 截断/坏查询 400）；§4.5 API 表 + §7.2 要点表各一行；阶段七 7.13 勾选、doc/07 H12 勾销（v1.10） |
| v3.19 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.10 browser 工具族落地（H09，P2；迷你 ADR D27 见 ARCHITECTURE v1.20）**：engine `browser/`——`driver.ts` BrowserDriver 端口 + BrowserManager（引擎级单例单页跨会话共享；`ensure()` 懒启动含 launching promise 去重、`require()` 无页拒绝不触发启动）+ `playwright.ts` 驱动工厂（`await import('playwright-core')` 动态加载——缺包/缺浏览器二进制 → 执行期 E_BROWSER_LAUNCH fail-closed，`npx playwright install chromium` 前置；截图写盘 `shot-<ts>-<seq>.png` 并读回字节数）；`makeBrowserTools(manager)` 工厂闭包四工具（管线零改动，同 makeTaskTool 注入先例；`EngineDeps.browserDriver?` 测试注入缝使 CI 免真实浏览器）：browser.open（URL 校验仅 http/https 且先于驱动副作用）/ browser.click / browser.read（>20000 字符截断 + truncated）/ browser.screenshot（**截图不进事件流**——输出只回文件名+字节数过 32KB 限界）；四工具一律 `parallelizable: false`（共享单页天然互斥）；审批三 action——browser.navigate / browser.interact / browser.read，resource `url:<页>`，空规则表缺省 ask；中断 = ctx.signal race 即返 E_ABORTED；shutdown 6.7 收尾 close；协议词表不变（走既有 tool.started/tool.completed）；server GET /api/artifacts/:file（`engine.readScreenshot` 白名单正则同源校验，非法名/缺文件/路径逃逸 404）；web ToolCard——Globe 图标 + browser 资源摘要（url/selector）+ BrowserDetail 展开区（元数据行 / 截图 `<img>` 按需拉图失败降级文案 / read 正文预览）；测试：engine browser 15 例（懒启动去重/无页拒绝不启动 + 工具单测六例含 URL 校验先于副作用/选择器未命中/截断/中断两态 + e2e 五例：审批默认 ask 全链路/拒绝零副作用/`url:**` 规则直达/截图供图与白名单/挂起中断）+ server artifact-routes（200 字节相等/404 四形状/尾斜杠）+ web ToolCard browser 五例；§4.5 API 表 + §7.2 要点表各一行、§5.6.3 工具表四行（标题改「内置工具规格」）、§5.10 错误表四行（E_BROWSER_*）；阶段七 7.10 勾选、doc/07 H09 勾销（v1.11） |
| v3.20 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                     | 阶段七工单 **7.11 eval harness 落地（H10，P2）**：`examples/evals`（@spark/evals 工作区成员——pnpm-workspace 挂 `examples/evals`，进 `pnpm -r` typecheck/lint 覆盖）：`harness.ts` 夹具层（临时 root + ScriptedLlm + 真实 Engine，与引擎单测同款 fake provider 装配，脱离 vitest 经 tsx 直跑）；四场景 = 审批（缺省 ask 形状断言 → once 执行落记忆库 / reject → E_PERMISSION fail-closed 零副作用）· 中断（LLM 挂起途中 interrupt → turn.completed finish=aborted + 已交付前缀定稿落盘，dsh 语义）· 压缩（手动 /compact——started→completed 时序/摘要落事件/压缩提示词形状 + 下一 turn 上下文首条 = 摘要重投影）· 基线（durable seq 单调 / started-completed 按 callId 配对 / turn 时序）；`--real` 可选真实模型评分（用户 ~/.spark 配置 + env 密钥，会话落临时 root；配置/凭据/传输问题 → skip 不红，仅应答内容错 → fail）；`run.ts` 报告表 + 任一 fail 退出码 1；根脚本 `pnpm eval`（委托 --filter @spark/evals）；`.github/workflows/nightly.yml`（每日北京时间 02:30 + 手动触发；eval 恒跑、--real 追加——仓库无 secrets 恒 skip）；本仓无新事件/新错误码/新 API（全走既有面）；阶段七 7.11 勾选、doc/07 H10 勾销（v1.12）、doc/06 v1.2 §2 nightly 行更新 |
| v3.21 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段八开工指令——CLI TUI 全量）                                                                                                 | 阶段八工单 **8.2 applyEvent/上下文水位下沉 + cli 四区骨架**：§6.4 applyEvent reducer 与投影类型（UiItem/SessionSlice/ProjectionState）自 web 下沉 `packages/protocol/src/apply-event.ts`（D22 四端共享资产，web zustand 壳与 cli 共用同一实现；词表穷尽性仍由 web 侧 29 例单测逐条把关）；上下文水位纯逻辑同下沉 `context-usage.ts`（6.6 产物四端同口径）；**apps/cli 骨架落地**（Ink 6 + React 19，ADR D19）：四区 = 会话侧栏（<80 列隐藏）/ 消息流（`<Static>` 定稿 + 活动尾部）/ 输入框 / 状态细条（字段同 web StatusBar 口径）；数据通道 = HttpTransport（REST-only）+ 会话级 SessionEventSource |
| v3.22 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段八开工指令——CLI TUI 全量）                                                                                                 | 阶段八工单 **8.3 键位表成文**：新增 §6.11.1 CLI 键位小节——**单一来源 = `packages/protocol/src/keymap.ts`**（KEYMAP 12 条 + `cliKeymapText()`；cli `--help` 键位段由同表渲染，文档不复制只引用，AGENTS §8 一条规则一个来源）；十行键位表（Enter// 前缀/Tab/Esc/y·a·n/Ctrl+O/Ctrl+N/PageUp·PageDown/Ctrl+U/Ctrl+C×2）与 web 对位列 |
| v3.23 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段八开工指令——CLI TUI 全量）                                                                                                 | 阶段八工单 **8.5 验收与登记**：阶段八 8.1–8.5 全部勾选。8.1（提交 7532111）——transport 内核下沉 `packages/protocol/src/transport-node.ts`：`envelopeFromSseFrame` SSE 帧解析（注释帧/无 data/ignorable 扩展跳过、坏帧失败闭合）+ `abortableSleep` + `pumpSseStream` + `HttpTransport`（REST 错误映射 `code: message`；`eventStream:false` REST-only 供 cli）+ `SessionEventSource`（`/api/event?sessionId=&since=` 水位续播——durable seq 推水位、断线带 since 重连、退避表 `DEFAULT_BACKOFF_MS` 可注入、open 重置、dispose 即断）；web HttpTransport 转再导出同一内核，既有 159 测保绿（server 零改动）。8.4（提交 57bc750）——session-event-source 行为单测 3 例（首连回放推水位 + 重连 URL 带 `&since=2` + 状态序列 connecting→open→reconnecting；指定 since=7 首连；dispose 后睡眠被 abort 不再重连）；错误人话化走 `error-copy` 共享文案表（D22），SIGINT 优雅退出链路在 cli `quit()`（interrupt 在途 turn 后 dispose 双收口）。8.5——Ink test-renderer 组件测试 16 例（四区渲染/80 列隐藏侧栏/流式折叠/审批三键/键位）全绿；cli typecheck/lint 绿；README 补 `pnpm --filter cli dev` 与布局行 `apps/cli`；AGENTS §1 状态刷新（阶段八完成待合入）+ §4 开发命令占位回填 + v1.21；doc/07 H36 键位表前置已随 8.3 落地 |
| v3.24 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七遗留修复指令）                                                           | **阶段七遗留——环境兼容性修复四处**（本机无真实 bash、慢盘、并行负载下复现，CI ubuntu 不受影响）：① bash 工具 `resolveShell` 重写——`where bash` 列候选逐个以 `-c "exit 0"` 探测（原实现只探测存在性：System32 WSL 别名 stub 无发行版时任何命令都非零退出），System32/WindowsApps 路径一律跳过，探测结果进程内缓存，无真实 bash 回落 powershell（§5.6.3 跨平台规则行同步）；② 内置工具单测 bash 组命令改 `node -e` 可移植表达（原 `sleep`/`>&2` 为 bash 方言，powershell 回落路径不可用；退出码用例显式 `exit 3`——powershell -Command 不传播内部原生命令退出码）；③ SearchStore 开 WAL + synchronous=NORMAL（索引是派生缓存，JSONL 恒为权威，逐条 upsert 免每次 fsync——修慢盘上千事件入库拖过 vitest 5s 上限）；另：Windows 树杀宽限 5s→1s（两次 taskkill 均 /F 强杀，首杀早于子进程派生时补杀兼做孤儿收尾）；④ server search-routes 测试竞态修复——断言命中行 sessionTitle 前先等 session.title 事件（自动标题是 turn 完成后异步生成，负载下未落索引即查得空串）；全仓 typecheck/lint/test 全绿 |
| v3.25 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段九开工指令） | **阶段九工单 9.1 配对鉴权完成（ADR D24）**：server——`pairing.ts`（DeviceStore：~/.spark/devices.json 0600 原子写，存在即鉴权启用态；PairService：6 位短码 60s 一次性、长效 token `spk_` 前缀只存 sha256 哈希）+ `auth.ts`（REST Bearer 头与 SSE `?token=` 双口径校验钩子，豁免 /api/healthz 与兑换口，未过 401 `E_AUTH` fail-closed）+ `pairing-routes.ts` 四端点 + 启动护栏纯函数 `resolveBindTarget`（SPARK_HOST 仅环回覆盖；非环回须 spark.json server.host 显式配置且鉴权已启用，否则拒启动——绑定纪律可测化）+ sse 撤销即断（`sseRevokeToken`）；protocol——`Transport.redeemPair` + transport-node `authToken` 双口径注入 + `splitSseFrames` 切帧纯函数抽出（9.4 小程序复用）；web——设置中心「设备与配对」页（QR 出示 + 手输 6 位码兜底 + 撤销即断）+ MockTransport 对等；测试：新增配对路由/护栏/兑换单测（server 85 例）+ protocol pairing-transport 11 例（切帧/authToken 双口径/兑换 round-trip），全仓 814 例（engine 486/server 85/web 159/protocol 68/cli 16），三关全绿；§4.5 API 表四行 + §7.2 要点表 + §7.4 错误表三行登记；§8 阶段九 9.1 勾选（引用修正 §13.J.9→§13.J.2.9）；新依赖 qrcode（MIT，QR 生成） |
| v3.26 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段九开工指令） | **阶段九工单 9.1 三维评审修复（F1–F7）**：F1 百分号编码路径绕过——鉴权拒绝判定自 `onRequest` 原始 `req.url` 前缀判断移至 `preHandler` 基于路由器解码后匹配模式 `req.routeOptions.url`（token 登记仍留 `onRequest`；未匹配路由 = 静态 404 兜底豁免），补四个编码变体回归用例；F2 配对码暴力穷举——`PairService` 连续 5 次失败即作废在途码（`PAIR_CODE_MAX_FAILURES`），成功兑换/新签发复位计数；F3 日志脱敏——pino 自定义 `serializers.req` 掩码 `?token=` 值（`redactTokenQuery` 纯函数可测）；F4 文档勘误——§4.5/§7.2/§7.4 `E_PAIR_DISABLED` 归因修正（仅兑换端点出现，签发即启用）+ `server.host/port` 自 9.1 起入口实际消费、`SPARK_HOST` 仅环回覆盖口径同步；F5 PairCodeDialog 代际标志防关闭后在途回调写状态竞态；F6 `splitSseFrames` 切帧前归一化 `\r\n`→`\n`（9.4 小程序复用契约，补 CRLF 用例）；F7 `new DeviceStore(...)` 纳入入口同 `resolveBindTarget` 的 try/catch 人话退出（`E_CONFIG: …` + exit 1） |
| v3.27 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段九开工指令） | **阶段九工单 9.3 移动端会话体验（流式/审批/重连/分页/键盘避让）**：协议先行唯一服务端追加——`SessionEventsQuerySchema`（`?limit=&before=` 全可选：limit 正整数上限 200、缺省=全量；before=seq 游标，返回 seq < before 升序——"缺省参数=现状全量"红线不破）+ `Transport.getSession(id, query?)` 无参兼容 + transport-node HttpTransport 与 web MockTransport 三处同步（过滤+升序尾部切片）+ server `GET /api/sessions/:id` 消费查询参数（缺省全量回归/4 例路由单测）；apps/mobile 会话页落地（§13.J.2.3/J.3）——消息流投影（user 右对齐浅灰胶囊/assistant 全宽纯文本+复制+"内容由 AI 生成"标注/相邻 >30min 时间戳分隔）+ `RnSessionEventSource` 流式渐显 + 回到底部浮钮 + 工具卡/思考块折叠 + 审批卡三键纵向全宽（走 `replyPermission`）+ 中断停止钮 + 断线重连条（onStatus 人话文案）+ 下拉加载历史（向上翻页升序合并增量投影保持滚动位置）+ KeyboardAvoidingView/安全区 + Composer 多行自增胶囊；错误文案一律 ERROR_COPY/errorMessageOf；Maestro 四幕 YAML 入库（只入库不执行）；§4.5 API 表同步 |
| v3.28 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段九开工指令） | **阶段九工单 9.3 三维评审修复（H1–H6）**：H1 翻页全量重放损坏投影——`mergeEventPage` 去纯 seq 排序改“较旧页前置+id 去重”（混 live 窗口排序会把定稿事件重排到自身 delta 之前，顺序敏感的 applyEvent 重放后重复 delta/`streaming` 永久置位；`before=最早seq` 语义保证前置即正确重放序）；H2 首屏取页失败无恢复路径——退化为 `since=0` 直接开流（服务端补全量，不留空白卡死）；H3 审批三键防抖闸门——`approvalBusyRef` 前置拦截 + busy 透传三键 `disabled`；H4 live 重复帧累积致 FlatList 重复 key——`applyLocal` 入窗前按水位去重（`isReplayedDuplicate` 纯函数，与 applyEvent 同口径）；H5 Composer 补 J.2.1 左侧“+”圆钮 32 置灰占位（附件记 v2，线性图标禁 emoji）；H6 §8.5 阶段九表 9.2/9.3 勾选对齐 9.1 口径；单测同步（合并保到达序/重复帧判定），范围限 apps/mobile+doc/02 |
| v3.29 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段九开工指令） | **阶段九工单 9.5 验收登记（本地部分）**：§8 阶段九表 9.4/9.5 勾选——9.4 小程序壳（提交 f400265 + 评审修复 712296d）、9.5 本地验收（CI scope 实证：`pnpm -r typecheck` 9 包全含 @spark/mobile/@spark/miniapp，ci.yml 零改动——根 script 走 workspace 递归；check_doc_links 0 error；Maestro 四幕 YAML 已在库；全仓 921 例全绿：engine 486/server 92/web 159/protocol 69/cli 16/mobile 48/miniapp 51）。**真机/模拟器四场景走查与小程序开发者工具走查由用户执行（留待记录）**；README 当前状态行刷新为阶段九完成待合入（v1.24）；AGENTS §1/§4 刷新（v1.23，补 mobile/miniapp dev 命令） |
| v3.30 | 2026-08-30 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与供图：晚风（Wanfeng1028，ZCode web 细节与 Qwen Code CLI 实测截图 20+ 张；CLI 四项决策拍板） | **新增 阶段十：UI 对齐（web 对照审计+会话流呈现）与 CLI 重构（Qwen Code/Gemini CLI 形态）——工单级**。立项依据=2026-08-30 两批实测截图与本会话逐条对照审计，引言立新纪律"验收项必须带 DESIGN §13 行号/数值引用（规格→验收 1:1）"（根因修正：阶段六~九细节丢失源于规格→工单翻译损耗）。web 五工单：10.1 规格修订三处（问候语大字/聚焦环中性化/操作行扩展）、10.2 AppShell 网格行错位修复（连接态 computed rows 368/508/24 实证，AppShell.tsx:48-59 条件 banner 致子元素整体上移一行）、10.3 聚焦环中性化（Composer.tsx:332 indigo ring）、10.4 会话流呈现升级（尾操作行 复制+👍👎+fork 分支会话+时间戳/回合头"已工作 N 秒"/思考块时长/工具块人话头部+同类聚合+拒绝删除线/运行中占位与停止钮）、10.5 侧栏细节（快捷键提示/双模式/显示更多/用户卡/+菜单四项/欢迎页权限钮）；跨端 10.6（分支 chip 数据源+推理档位，协议/引擎/server）；CLI 六工单：10.7 §13.K 规格成文（**渐变豁免条款单列**——仅头部 ASCII logo 允许蓝紫渐变）、10.8 纯单栏重构（四区→单栏，ADR D19 修订随工单落 ARCHITECTURE 表）、10.9 块族+审批四选项、10.10 面板族（slash/@/帮助/IME）、10.11 footer+resume+验收登记。待拍板 2 项按建议执行可推翻（Composer 上方水位大条删除/欢迎页权限钮显示）；§8.7 增 V2-24/25 |
| v3.31 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段十第一批开工指令） | **阶段十第一批（工单 10.1/10.2/10.3）完成并勾选**：10.1 DESIGN v2.5 规格修订三处（§13.A 空态问候语"15px semibold"→"≈28px semibold 大字问候"、§13.E Composer 容器"聚焦 ring 2px"→"聚焦不加高饱和 ring，聚焦态 1px 中性 border 轻微加深"、§13.H:519 assistant 尾操作行扩展"+时间戳+fork 到分支会话"——👍👎 存储依赖挂 §8.7 V2-25，fork 数据源=工单 4.5 既有端点非假状态）；10.2 AppShell 网格行错位修复（banner/内容栅格/StatusBar 显式 grid-row-start 占位，banner 缺席 auto 行塌缩为 0，布局不随连接状态漂移）；10.3 聚焦环中性化（Composer.tsx 移除 focus-within:ring-2 ring-ring/25 → focus-within:border-ring，既有锌中性 token；apps/web 全量 grep 无高饱和聚焦环残留）。提示词口径"DESIGN v2.3→v2.4"因现行已至 v2.4（阶段九所留）按验收口径 +0.1 落为 v2.5；10.2 三态×两路由×两档目测走查与 10.3 聚焦态截图按本机纪律留用户/远端执行 |
| v3.32 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段十全量开工指令） | **阶段十工单 10.4 会话流呈现升级完成并勾选**：① 尾操作行（复制+👍👎 置灰+hairline+"内容由 AI 生成"+时间戳+fork 分支会话——投影层 assistant 项增定稿时间；fork 走工单 4.5 既有端点三拒绝码人话呈现）② 回合头"已工作 N 秒"（UiItem 新增 turn 项：turn.started 入列/turn.completed 回填，进行中实时计时；四端穷尽性同步——"˅" 折叠交互随后续工单）③ 思考块图标+持续时长（reasoning 项首帧计时/定稿时长回填，流式实时计时）④ 工具块人话类别词+连续同类聚合"· N 次"（chat-flow-rows 纯逻辑+组行组件）+拒绝态整行删除线（引擎管线拒绝路径 output={code:E_PERMISSION} 源码级核实）+技能块映射核查（声明式钩子不产生工具项）+tool.completed 耗时接线 ⑤ 代码块语言标签+复制钮（streamdown 内建控件+文案中文化）⑥ 运行中占位+停止钮经源码级复核已在 6.3 落地无改动 ⑦ 链接预览卡记 V2-24 |
| v3.33 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段十全量开工指令） | **阶段十工单 10.5 侧栏与全局细节完成并勾选**：① 全局单键快捷键 c 新建会话 / / 搜索（非输入态，§6.11 登记两行）+侧栏入口 kbd 提示 ② 分组双模式（项目/时间段，ui store 持久化；ZCode 自定义分组需后端，v1 时间分组为真实数据替代）③ 组内渐进展开（5 条起步 +5）④ 底部用户卡本地形态（无账号体系不做假账户）⑤ Composer + 菜单四项（附件/@///$）⑥ 欢迎页权限档钮（选档真实落档）⑦ 删 Composer 上方水位大条（待拍板 a 按建议执行；UsageBar 停用，文件删除留人工确认）；另欢迎页问候语 28px 大字（10.1 §13.A v2.5 落地）；单测补时间分组段边界 4 例 |
| v3.34 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段十全量开工指令） | **阶段十工单 10.6–10.11 完成并勾选（阶段十收官）**：10.6 跨端分支 chip + 推理档位——协议先行（ReasoningEffort 枚举/session.created 与 SessionMetaDto 增 branch/effort/Transport.setSessionEffort）+ 引擎 git.ts 只读探测（取不到不携带，进 header 持久）+ setSessionEffort 内存态 + StreamRequest.effort → pi-ai reasoning 透传 + models.json defaultEffort（§4.3/§4.5/§5.1 表同步）+ server PUT effort 端点 + web 顶栏分支 chip/Composer EffortPicker + mock 对等；10.7 DESIGN §13.K CLI 视觉规格成文（v2.6，K.0–K.9，渐变豁免条款单列）；10.8 CLI 纯单栏重构（ARCHITECTURE v1.21 D19 修订行：四区→单栏，/new//resume，boot 头部+footer 双行；侧栏/状态细条组件停用留删）；10.9 块族+审批框（回合头计时/思考行持续时长/工具块人话头部+运行时长行/拒绝删除线；**审批框落三真选项**——引擎 replyPermission 暂无 project/user 作用域参数，不虚设第四项，作用域扩展记 v2）；10.10 面板族（帮助面板三 tab 只读键位表单一来源/slash 菜单 (1/N) 分页/统计面板；**@ 文件补全缺数据源未落地**——依赖 V2-04 文件树，如实记录）；10.11 收口（/stats 面板//resume 过滤恢复/错误红字+Esc 面板优先键纪律；四幕 tty 走查留用户/远端；README v1.26 登记）。**运行中工具行"↑↓ tokens"段无协议数据源未呈现**（usage 仅定稿事件携带，禁假状态）。遗留：UsageBar/Sidebar/StatusBar(cli) 三停用文件待人工删除确认 |
| v3.35 | 2026-08-31 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十验收核查指令） | **阶段十补完与勾选真实性修正（源码级核查后）**：10.9 补齐——工具块完成折叠态超长输出提示 `first N lines hidden`（完整行数，阈值 10）+ 连续同类聚合「· N 次」（apps/cli flow-rows.ts 与 web 同套语义；组行整组入 scrollback，Ctrl+O 切整组）；10.11 补齐——/resume Space 预览（选中项详情盒：模型/项目/分支/档位/状态/seq/更新时间，快照字段如实呈现）+ 报错细节行（原错误码·detail 折叠行 + **Ctrl+R 重试**——keymap.ts/§6.11.1 同步登记）；帮助面板键位表补「生效区」列（K.6 四列对齐）；测试补齐——packages/protocol setSessionEffort 直测 3 例（修正 e7ab636 测试归属漂移），CLI render.test 增 15 例。**登记判决（如实记录，不做假状态）**：IME 组合态=终端/系统层职责，应用层无实现面（DESIGN K.9 条款化）；K.4 第 2 行「审批模式档」措辞修准为「提交模式档」（引擎无独立审批档，DESIGN v2.7）；K.1 上下文摘要行密钥/上下文文件无数据源不渲染、boot 头部暂不随首条消息进 scrollback（Ink Static 一次性输出约束，恢复重现待后续） |
| v3.35 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028） | §3 目录树登记 `offical/`——Spark 产品官网代码（仅前端；不在 pnpm workspace，独立于产品各端）；与 README v1.27 布局行同步 |
| v3.36 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028） | 官网文件夹拼写改名 `offical/` → `official/`（v3.35 登记名系笔误；仓库内重命名，历史行不改）；§3 目录树引用同步；与 README v1.28、检查器 SKIP_DIRS 同步 |
| v3.37 | 2026-08-31 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十合并后 11 项实测缺陷反馈；三路源码级核查子代理 + Qwen Code 官方文档命令清单在线调研） | **新增 阶段十·验收批次 2（工单 10.12–10.21）——11 项实测缺陷修复与命令面/设置面全量落地**：10.12 HTTP transport 空 body 修复（一处改动解锁 11 个调用点：配对签发/测试连接/中断/压缩/回滚/删密钥/撤销设备/删自动化/清零成本/webhook/手动触发——`transport-node.ts req()` 无条件强发 `content-type: application/json` 头，无 body 的 POST/DELETE 被 Fastify 拒 `FST_ERR_CTP_EMPTY_JSON_BODY`；单测用 `app.inject` 不带头故掩盖）；10.13 会话流去重（apply-event.ts 定稿配对按 `lastItem()` 位置判断失效于真实发射序 `reasoning.delta*→assistant.delta*→reasoning.ended→assistant.message`，流式项永不闭合、定稿另 push 新项=双份；+ web `AssistantBlock.tsx` 对 `content` 内 `reasoning` 块再渲染一次=刷新后也双份）；10.14 设置中心导航修复（`navigate(-1)` 逐页回退 + 分区互切 push 堆栈）；10.15 web 全局焦点环中性化（theme.css `:focus-visible` 用 indigo `--spark-accent` 且未分层压过 `outline-none` utility——§13.E 与 §13.C/§5 规格矛盾须先拍板）；10.16 切会话即时化（SessionPage 无条件 `setLoad('loading')`，已有缓存 slice 也白屏）；10.17 CLI 启动首屏与 resume 修复；10.18 CLI 面板族与命令面扩容（Qwen Code 官方 78 命令清单登记，v1 落 15+5 面）；10.19 CLI 宽字符/错位修复；10.20 设置项全量落地（新增 `GET|PUT /api/settings` spark.json 读写 API 解锁引擎行为类设置）；10.21 hook（user-hooks）读取 API——路径分歧待拍板。Qwen Code 调研依据官方文档站 `users/features/commands`（AGENTS §2.12 在线访问纪律） |
| v3.38 | 2026-08-31 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`） | 批次 2 节尾补**开工提示词 5 份**（v3.37 提交时承诺，本行补齐）：① 10.12 transport 空 body；② 10.13 定稿配对去重；③ 10.14/10.15/10.16 web 三修复；④ 10.17/10.18/10.19 CLI 三张；⑤ 10.20/10.21 设置全量——每份含前置阅读清单/逐条要求/红线/验收/commit 口径，新会话可直接粘贴开工 |
| v3.39 | 2026-08-31 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，并行会话交叉验证与"无对应能力命令可否做"追问） | **批次 2 合并并行会话（千问）交叉验证增量 + 命令面全量判决**：① 八张工单合入其独有发现（已逐条核实）——10.12 附带 setErrorHandler/createSession 丢 model 漂移/hasKeyOf 只查 env 与 resolveApiKey store>env 的状态误报；10.13 补"未闭合 reasoning 计时器永不停（假 578 秒）"与四端回归口径；10.14 根因改三层（历史栈回退+列宽过渡+**Virtuoso 未设 initialTopMostItemIndex 逐行测高滑底——逐项位移的真正视觉来源**）；10.17 补版本号 require 路径恒显 0.0.0/模型行提示缺失/resume 后 boot 头重现/resize 错行四项；10.18 升级为**命令描述符架构**（protocol commands.ts 单一词表+四端删平行表+clientAction-surface 不变量单测——防 /model 坏掉复发）+ slash 选中项覆盖裸输入 bug；10.19 补 IME 组字期 App 全局键劫持（? 开面板/1/2/y/n 触审批）与键位分层；10.20 重排为 A（零后端接线）/B（/api/settings+ADR 前置）/C（去向明示）三分类——"显示待办"开关删除（无 Todo 工具，不留无效开关）；② 新增 10.18a 附表：Qwen Code 78 命令全量判决表（v1 落 15/已有对应物 8/v2 挂池 11/新机制挂池 9/不做 35——voice/arena/lsp/trust/extensions/agents/plan/goal/remember 九条新机制全部挂池不进 v1，先有真实诉求再立项）；③ §8.7 池补 V2-27~V2-35 九条；④ 5 份开工提示词同步修订。结论：两份独立诊断核心根因收敛，并行会话多抓 5 处独有缺陷全部坐实合入 |
| v3.40 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028，批次 2 开工指令） | **阶段十工单 10.14 设置中心导航修复完成并勾选**（三层根因全修）：① 返回按钮改直达目的地（`settingsBackTarget` 纯函数：最后激活会话，无则欢迎页；replace 不堆历史）+ 分区互切 `replace: true`（同层平级不堆历史，浏览器后退不陷入设置内部）；② 进出设置帧禁用 `grid-template-columns` 过渡（切换帧移除 transition-property 使进行中过渡立即收敛，≥150ms 后恢复——折叠/展开动画不受影响）；③ Virtuoso 补 `initialTopMostItemIndex`（挂载即定位末尾——"一项一项往前移"的真正视觉来源根治）+ `key={sessionId}` 按会话重挂载（切会话/从设置返回初始定位重新生效）。单测：`settingsBackTarget` 2 例；交互面走查步骤随提交说明。折叠态侧栏盲区评估结论挂 §8.7 V2-36 |
| v3.41 | 2026-09-01 | AI 编写：Qoder；发起与拍板：晚风（Wanfeng1028，批次 2 工单 10.15「我拍板执行」） | **阶段十工单 10.15 web 全局焦点环中性化完成并勾选**：`theme.css` 全局 `:focus-visible` 颜色 `--spark-accent`（indigo）→ `--ring` 中性，规则移入 `@layer base`（缺陷根因=未分层规则永远压过分层的 `outline-none` utility，Composer 蓝框常驻——只换色不修分层则修复无效）。规格矛盾拍板登记：§13.C 旧规「焦点环用 accent」与 §13.E v2.5「聚焦不加高饱和 ring」+ §12.1（禁 indigo 系）矛盾，按后者执行——DESIGN v2.8 版本表登记，§4 速查表/§13.C 全量表/§5 焦点管理三处活引用同步（`--spark-accent` 其余职责如运行中状态点不动）。10.3 行追加「勾选虚高」勘误（只收口组件级 ring、全局层漏修）。`theme-contrast.test.ts` 复核通过（--ring 非文本对，对比度断言无涉）；全仓 grep 无其它 indigo/violet 聚焦发光。现场走查留用户：设置任意输入框/按钮 Tab 聚焦与鼠标点击均无蓝色 outline；`outline-none` 元素真正无环 |
| v3.42 | 2026-09-01 | AI 编写：Qoder；发起：晚风（Wanfeng1028，批次 2 web 三工单连做指令） | **阶段十工单 10.16 切会话即时化完成并勾选**：`SessionPage` 缓存优先——新增纯函数 `hasCachedProjection`（落 `stores/session.ts`，无 DOM 依赖可单测）：`lastSeq>0` 判定 store 已有持久投影，命中则初值与回放 effect 均走 `ready`（原位即时渲染缓存），后台全量回放照常（既有 `replaySessionEvents` 本就是「取回后同步 resetSlice+批量 apply」单块覆写对齐 seq——不先清不闪空）；仅 `lastSeq===0` 真冷会话进加载态。与 10.14 的 Virtuoso `initialTopMostItemIndex`+`key={sessionId}` 联动（回会话页不再逐行测高滑底）。单测 `session-cache.test.ts` 2 例；「左右式横向切换过渡」按工单口径不实现（DESIGN 无既有条款，属新增期望须先补规格）。现场走查留用户：已打开会话左右切换无白屏、冷会话仍有加载态、切走再切回不丢新事件 |
| v3.43 | 2026-09-01 | AI 编写：Qoder；拍板：晚风（Wanfeng1028，设置面开工前三项拍板） | **10.20/10.21 开工拍板登记三项**：① **10.21 hooks 路径拍板并入 10.20 的 `GET /api/settings`**（hooks 字段同响应下发，不单设 `GET /api/hooks`）——10.21 行标题与产出、批次备注③ 同步更新；② 10.20 B 类「热生效 vs 重启生效」策略维持工单口径：先写 ADR 入 ARCHITECTURE.md，经晚风确认后再实现（开工至此停下问，不预先拍板）；③ 10.16「左右式横向滑动过渡」拍板本批不做（本批只消白屏卡顿=缓存优先渲染，已随 10.16 落地；滑动单独立项须先在 DESIGN §13 补规格——v3.42 已登记） |
| v3.44 | 2026-09-01 | AI 编写：Qoder；发起：晚风（Wanfeng1028，CLI 三张连做指令） | **阶段十工单 10.17/10.18/10.19（+10.18a）完成并勾选**：**10.17**——BootHeader 脱离 slice 依赖（连接中/失败/空会话三态均渲染 boot 骨架+状态行）；版本号改读正确相对路径（`../../package.json`，兜底"未知版本"禁 0.0.0）+ 模型行补"(/model 切换)"提示；resume/rollback 后 bootEcho 重现头部一次；useStdout resize 重订阅；listSessions 失败显式错误屏（R 键重试）；面板激活态 Enter 由 App 层接管（空过滤词直确认，主输入区不受影响）。**10.18**——`packages/protocol` 新建 commands.ts 描述符架构（CommandDescriptorSchema strictObject + BUILTIN_COMMANDS 14 条，词表模式照 keymap.ts 单一来源先例）；CommandDto 可选增量字段向后兼容；四端平行命令表全删（web composer-menus/client-commands、mock.ts、cli if 链、engine loader 改 import）；clientAction 封闭枚举 + 各端实现映射，未实现即不渲染（禁假状态）；协议不变量单测（名字唯一 + client 命令 clientAction 全 surface 有实现）；CLI 新增 ModelPanel（↑↓ 选择 Enter 切换/带参直调）+ mcp/skills/usage/checkpoints/tree 只读面板；修 slash 选中项覆盖裸输入（仅文本恰等命令名时用选中项）；ERROR_COPY 补 E_COMMAND_CLIENT；SlashMenu 按 group 分组渲染（会话/模型/信息/帮助/自定义）。**10.19**——`packages/protocol` 新建 text-width.ts（displayWidth=string-width MIT、graphemesOf=Intl.Segmenter、truncateByWidth/padEndByWidth 四端共享）；InputBox 光标/退格/方向键全改 grapheme 语义 + 显示宽度视窗截断（maxWidth=columns）；items.tsx/HelpPanel 截断补齐改宽度语义；键位分层（面板态 InputBox 先消费、App 全局键只认单码元、组字串原子插入）；单测补中文/emoji/代理对用例。**执行偏差登记**：10.18a 判决表原列 v1 落 15，/title 落地时移除——核查证实并无 setTitle 端点（标题引擎自动生成），按禁假状态红线移入 v2 挂池（v1 落 14 / v2 挂池 12，计数行同步）。现场走查留用户：两终端冷启动/断服错误屏、/resume 空词 Enter、中文与 emoji 输入光标与截断、组字期不误触面板/审批键 |
| v3.45 | 2026-09-01 | AI 编写：Qoder；发起与拍板：晚风（Wanfeng1028，设置面两张连做指令；D28 确认执行） | **阶段十工单 10.20/10.21 完成并勾选（A→B→C 三分类全落地）**：**A 类五项零后端接线**——成本上限可编辑 + 清零累计接 resetUsage + 模型页「模型路由」卡（fallback 链/压缩/标题/子代理四档位）+ 显示思考过程/工具分组两开关（settings-store + flowRowsOf 消费，即存即生效）+ 命令只读页；「显示待办」无效开关移除（无 Todo 工具，挂池 **V2-38**）。**B 类按 D28（晚风已确认）实施**——protocol 增 `SettingsDto`/`SettingsUpdate`（hooks 四挂点只读数组对齐引擎词表）+ `SETTINGS_RESTART_REQUIRED` 单一来源；engine `getSettings`/`updateSettings`（合并 spark.json raw → 启动同款 schema 校验 → 原子写盘 → 重载内存 + 重建 hooks runner，fail-closed）；server 两路由（6 例单测含脱敏断言与不落盘断言）；web 常规页「引擎行为」卡（重启档标注"下次启动生效"）；10.21 hooks 页真值呈现 + JSON 编辑写盘（并入 /api/settings 拍板路径）。**C 类去向明示**——常规页 8 行占位全改明示（界面语言 V2-12 / 代理与证书三行 V2-06 / 存储路径、归档、通知两行、通知声音明示 v2）；六占位页（浏览器/电脑控制/子智能体 V2-33/插件 V2-01/V2-02/索引库/引导）去向入描述与徽标，"后续工单"空占位清零。**遗留挂池**：默认模型/默认推理档迁 models.json = D28 第三态，需与路由写路径统一避免双写者，挂池 **V2-37**。**10.12 重做说明**：10.12 成果曾未提交即被并行会话 checkout 清掉，本轮全量重做并验证后已随设置面提交入库（req() 条件化 content-type / createSession model / setErrorHandler+FST_ERR 收编+宽容解析器 / KeyResolver / 四组测试）。至此批次 2 十一张工单全部完成；16 页逐页走查留用户 |
| v3.46 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，"九条新机制命令全部做成"指令 + 10.16 形态澄清） | **批次 2 增补 10.22 + 阶段十六立项登记（本会话只动文档，与并行实现会话分工：彼完成 10.12–10.21，本补规格）**：① 新增工单 **10.22 会话流消息气泡布局**——晚风澄清期望为"用户消息靠右、AI 回复靠左、一上一下错开"的布局形态（非切换动画；10.16 横向滑动维持不做）。产出=DESIGN §13.H 条款先行（user 行右对齐+限宽+中性气泡，assistant 保持左对齐全宽——工具/代码块阅读宽度优先，不窄化）+ web MessageItem 实现 + 提示词 6；② **阶段十六立项于 doc/08 v1.2**（16.1–16.9 九工单：/init /agents /plan /trust /extensions /voice /goal /arena /lsp——消解 §8.7 V2-27~35，每张含开源参考精确路径与复用路线：opencode MIT 模板可整段复用、qwen subagent-manager 直译结构、gemini plan.toml 优先级直接翻、/goal /arena qwen 独有只参考设计、/lsp 换基座 vscode-languageserver-protocol；在线调研纪律 §2.12，复用保留版权声明）；③ §8.7 V2-27~35 行补"已立项 16.X"指针；④ 补阶段十六开工提示词模板（六段式，命令注册走 10.18 描述符体系单一来源）。开工顺序：10.22（批次 2 收尾）→ 16.1 起成本升序 |
| v3.47 | 2026-09-01 | AI 编写：Qoder；发起：晚风（Wanfeng1028，「参照 Qwen Code 首屏重排 CLI」指令） | **工单 10.23 完成并勾选：CLI 首屏重排（对齐 Qwen Code）**。apps/cli `BootHeader.tsx` 由上下堆叠改**左右分栏**（logo 列+圆角信息盒，宽度感知回退——窄屏隐藏 logo、信息盒占满不堆叠；双栏盒宽上限 60），信息盒模型行 `(/model 切换)` 提示与 cwd 截短改按显示宽度门控（复用 cli 本地 `text-width.ts`）、cwd 先 tilde 化，提示行加「提示：」前缀；`Footer.tsx` 第 2 行补「Tab 切换提交模式」；`app.tsx` 两处 BootHeader 传 columns；render.test.tsx 新增 BootHeader 四断言+Footer Tab 断言。DESIGN §13.K K.1/K.4 改判登记 v2.9。不引入 ink-gradient/statusLine 预设新机制；不抄 `@ 文件路径`/`API Key |` 前缀（禁假状态）。视觉走查留用户 |
| v3.48 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，"没完成的+核查发现的拉单就做"指令；本机只 typecheck+lint / 盯远端 CI / 直接 main 三约束拍板） | **收尾批次 3 立项（10.22 复列 + 新增 10.24–10.30）+ 10.12/10.13 补勾**：同日四路源码级核查判决=批次 2 已勾十一张全部真实落地（10.18 一项 PARTIAL：CLI 端 clientAction 覆盖不变量缺测试）；质量门实测=typecheck/lint 全绿、测试 1012/1013——engine user-hooks "write after end" 全套件并发下偶发红（单跑恒绿），且 pnpm -r 首败中断掩盖 server/mobile 两包（补跑全过）。批次 3 收口：10.24 hooks 关闭时序（P1）/ 10.25 CLI 不变量网 + commands.test.ts 注释失准修正 / 10.26 文档注释单测对账（含本表 10.12/10.13 补勾——完成事实见 v3.45 行文与提交 5c7bbf9、268462f，表行标记历史上从未落上）/ 10.27 代码卫生三处（errors 死分支/app.tsx branded id/miniapp content-type 口径）/ 10.28 LICENSE（G6，MIT）/ 10.29 AGENTS 上下文刷新 / 10.30 冻结行（StatusBar.tsx 死文件与 spike-pi-ai 残留待五层级确认，AI 不执行）。阶段十一~十六仍按 doc/08 工单库执行，不并入本批次 |
| v3.49 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，批次 3 开工指令） | **工单 10.24 完成并勾选：hooks runner 关闭时序收口（P1）**。`UserHookRunner` 增 disposed 标记 + `dispose()`（kill 在途子进程 + 清 inflight 集）+ 统一 `warn()` 出口（disposed 后静默，fire 入口同门控）；engine `doShutdown` 增步骤 6.8（logger.close 前先收口 hooks——迟到的 close 回调不再写已 end 的流）；`updateSettings` 重建 runner 前先 dispose 旧实例（配置热更新路径同收口）。根治全套件并发下 user-hooks.test "write after end" 偶发红（单文件复跑 11/11 绿；稳定性终裁=远端 CI） |
| v3.50 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，批次 3 开工指令） | **工单 10.25 完成并勾选：CLI 端 clientAction 覆盖不变量网补齐（10.18 PARTIAL 残项收口）**。apps/cli 新建 `client-actions.ts`——runClientAction 的 switch 抽为 `createCliActionHandlers(deps): Record<ClientAction, handler>`（Record 键穷举由 TS 编译期强制，协议枚举扩容缺键即 typecheck 红；app.tsx 调用点逐次取 store 快照语义不变）+ `tests/client-actions.test.ts` 两条断言（映射键穷尽 ClientActionSchema.options 运行期复核；BUILTIN_COMMANDS 中 surface 含 cli 的 client 命令 clientAction 必有实现——防 /model 类复发）；commands.test.ts 头注释"cli: tests/render 分派表"失准指针改指真实测试文件。回归网自此四端对称（web client-commands / cli client-actions） |
| v3.51 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，批次 3 开工指令） | **工单 10.26/10.27 完成并勾选**。**10.26 对账**——GeneralPage.tsx 头注释"语言/网络为平台缺口项（后续工单）"改为与行数据一致的精确编号（V2-12/V2-06）；text-width.ts 头注释"依赖理由见 package.json"失准指针改自包含（JSON 无注释位，理由本体即头注释）；settings-store.test.ts 补会话域开关单测（默认开/坏数据收窄/setter 持久化，10.20 A③ 遗留）。**10.27 卫生**——errors.ts 移除第二个 E_CONFIG 不可达死分支（首个前缀匹配后永不可达，merge 残余）；app.tsx rollbackTo `arg as never` 改 `ids.checkpoint(arg)`（branded id 规范构造）；miniapp rest.ts req() content-type 改仅随 body 携带（口径对齐 transport-node，去掉对 server 宽容解析器的隐性依赖——10.12 同根隐患清零） |
| v3.52 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，批次 3 开工指令；MIT 选型 2026-08-31 已拍板） | **工单 10.28 完成并勾选：LICENSE 补齐（doc/05 G6 消解）**。根目录新增 LICENSE（MIT，Copyright (c) 2026 晚风/Wanfeng1028）+ 全部 11 个 workspace package.json（含 examples/spike-pi-ai）补 `"license": "MIT"` 字段；doc/05 v1.2 登记 G6 消解与 G3/G4/G5 复核结论。至此"没有 license 的公开仓库在法律上并非开源"的发布化硬前置清零 |
| v3.53 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，10.22 形态澄清） | **批次 2 工单 10.22 完成并勾选（批次 3 顺序执行）：会话流消息气泡布局**。规格先行 DESIGN v2.10——§13.H 新增消息布局条款：user 消息行右对齐限宽气泡（justify-end、radius 18、右下角 4px 收角锚定右缘、最大宽 80%——口径对齐 §13.J.3 移动端实测、bg-accent 浅中性 token 暗色同翻转、YOU 标签右置保留）；assistant/工具/思考/审批块保持左锚全宽（工作台形态不 IM 化，§12 黑名单照常生效）。实现=apps/web MessageItem user 分支（flex-col items-end + max-w-[80%] 气泡），文件头注释同步；web 无快照依赖旧样式（grep 核实），工具/思考/审批块零改动。视觉走查留用户 |
| v3.54 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，批次 3 开工指令） | **工单 10.29 完成并勾选（批次 3 收尾）：AGENTS.md v1.27 项目上下文刷新**——阶段十状态由"待 PR 合入（10.1–10.11）"更新为"全部完成并已合 main（10.1–10.23 + 批次 3）"，补 10.30 冻结注记与 v2 下一程指针；doc/02 尾注同步（批次 3 收账、v2 lift 流程指引）。doc/08 v1.3 状态对账已随立单落地。**批次 3 至此全部落地：10.24/10.25/10.26/10.27/10.28/10.29 六单完成勾选，10.22 随批完成，10.30 冻结待人类五层级确认** |
| v3.55 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"注意看远端的 CI"指令） | **工单 10.31 完成并勾选：Nightly eval 连败溯源修复**。gh 夜间 eval 自 2026-08-29 首跑起连败三日（compaction/surface 同一对场景）——工单 7.11 验收从未在 CI 闭环。根因均在 eval 脚本、引擎行为符合规格：① compaction 场景用 onceCalls[0] 位置敏感断言判压缩提示词形状，而标题生成器（工单 4.4）在 turn.completed 后同走 generateOnce 通道必然抢占列表头（与 10.13"列表末项判断"同类病）→ 改按 COMPACTION_PROMPT 前缀 find 定位；② surface 场景夹具写 tmpdir 但会话用缺省 cwd，read 路径硬边界（阶段一安全纪律，越界拒绝是正确行为）必回 E_PATH_OUTSIDE → createSession({ cwd: f.root }) 会话 cwd=夹具根。本地 pnpm eval 4/4 全过；Nightly 手动触发复核 |
| v3.56 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"继续"指令） | **阶段十一 lift：新增 §8 阶段十一表（11.1–11.8 可发布/Release）**——按 doc/08 工单库 lift 成 doc/02 正式阶段表（执行以本表为准）：11.1 社区基础文件（LICENSE/字段部分已随批次 3/10.28 落地，余量=CONTRIBUTING/CHANGELOG/D23 补记）/ 11.2 验收清账准备件（现场执行=用户）/ 11.3 PR CI 接 Playwright / 11.4 nightly 性能基线第一批 / 11.5 eval --real 接 secrets / 11.6 npm 发包准备 + spark up / 11.7 发布流程（真实发版=用户侧）/ 11.8 README 重写 + 英文版。执行顺序与"用户侧动作"边界逐行标注；约束沿用批次 3（本机只 typecheck+lint、直接 main、盯 CI） |
| v3.57 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十一开工指令） | **工单 11.1/11.2 完成并勾选**。**11.1 余量**——CONTRIBUTING.md（纯引用入口：环境要求 Node 24+/pnpm、工单认领、PR 自查清单指向 DESIGN §10 DoD 与 ARCHITECTURE §9、安全红线摘要）+ CHANGELOG.md（Keep a Changelog：[Unreleased] + [1.0.0] 记录 v1 五阶段与阶段六~十里程碑与安全模型）+ ARCHITECTURE D23 补记（v1.23：MIT 定案）。**11.2 准备件**——e2e-smoke.sh 源码级核对出**一处假通过缺陷并修正**（场景 B 原用全局 SSE 订阅 + Last-Event-ID 头，而 server 的 since 回放仅对 sessionId+since 启用、全局订阅是纯直播——改显式 `?sessionId=&since=` 才真测水位语义；只改脚本不改引擎）+ start_server 陈旧注释清理 + bash -n 过；新建 doc/walkthrough-stage11.md（四幕×五端矩阵模板 + 用户执行清单 8 项）与 doc/walkthrough-assets/ 证据目录占位。现场执行与 doc/05 G1 注记=用户侧后续 |
| v3.58 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十一开工指令） | **工单 11.3/11.4/11.5 完成并勾选**。**11.3**——ci.yml 增 e2e job（ubuntu+chromium `--with-deps`，与主 job 并行；runner 可直连官方 CDN 故不设 SPARK_E2E_BROWSER 兜底；视觉用例仅产出截图无跨平台断言，全套件 CI 安全）。**11.4**——性能基线第一批断言化：`apps/server/tests/perf-replay.test.ts`（程序化预置 1000 条 durable 线性链会话 → GET 全量回放 <500ms，2 倍抖动余量；resume 补发 session.resumed 计入 1001 如实断言）+ `packages/engine/tests/perf-memory.test.ts`（单文件直写 10 万事件 → SessionStore.resume 后 RSS<512MB）；均 SPARK_PERF=1 门控（主 CI 零成本），nightly.yml 增 performance job；doc/06 v1.3 §3 表加"接入状态"列（web 侧两项待 11.4b）。**11.5**——nightly eval --real 步骤注入 secrets（SPARK_EVAL_API_KEY + BASE_URL/MODEL variables，步骤内动态生成 ~/.spark/models.json 引用 apiKeyEnv，key 缺省打印 notice 后 skip 不红）；doc/eval-secrets.md 三步配置说明。本地定向验证：perf 两用例过（10 万事件 RSS 校验 556ms）、workflow YAML 语法过；远端验证=push 触发的 e2e job 与手动 Nightly |
| v3.59 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十一开工指令） | **工单 11.6 完成并勾选：npm 发包准备（三包可 publish）+ spark up**。① protocol/engine：private 移除 + files:[dist] + exports（dev 指向 src，publishConfig 切 dist——pnpm publish 时覆写，pack 实测生效）+ tsc 产 dist+d.ts（各新增 tsconfig.build.json，engine build 经 paths 以 protocol dist d.ts 为类型面）+ repository/bugs/homepage/engines(node>=24)；② cli：bin spark→bin/spark.js（shebang 载体，dist/main.js 由 esbuild banner 注入 shebang）+ files:[bin,dist] + build 脚本化（scripts/build.mjs esbuild JS API——shell 内联 banner 在 Windows 被引号剥离）；**spark up**（src/up.ts）：子进程拉起 server bundle（SPARK_PORT 注入，desktop 同机制）→ 轮询 /api/healthz（已有 server 则复用不重复拉起）→ TUI 退出 waitUntilExit 回收子进程。**构建期发现并修**：playwright-core 对 chromium-bidi 的懒加载 require 无法被 esbuild 静态解析（desktop build:server 同病——本工单 server bundle 将 playwright-core 外置为运行时依赖解决，desktop 修法随其后续工单）。**验收记录**：三包 pnpm pack 产物清单审查——protocol 116 文件全为 dist js+d.ts、engine dist 外仅 package.json+LICENSE、cli=bin+dist 两件+LICENSE，均零 src/tests 泄漏；bundle 冒烟 `node dist/main.js --help` 正常、`SPARK_PORT=4331 node dist/server/index.mjs` healthz `{ok:true}` 后回收。npm link 全流程与真实 publish 留用户（11.7） |
| v3.60 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十一开工指令） | **工单 11.7/11.8 完成并勾选（阶段十一 AI 侧全部落地）**。**11.7**——`.github/workflows/release.yml`（push tag v* → check_doc_links/typecheck/test → 三包 build → `pnpm -r publish --provenance` → GitHub Release；认证方案 A=NPM_TOKEN secret 默认、B=Trusted Publishing OIDC 注释二选一）+ CONTRIBUTING「发版」节（三包版本策略：protocol semver 稳定/engine minor 内兼容/cli 跟随同版本；CHANGELOG 纪律；五步发版流程与凭据配置）。**11.8**——README 手册化重写：导语身份宣言、Quick Start（spark up 路径）、四端一览、安全模型摘要、badges 补 MIT+node≥24、编年史长段收缩三行内移交 CHANGELOG、版本记录表 `<details>` 折叠；新增 README.en.md 内容对齐头部互链；事实锚点"21 种事件词表"不动（check_doc_links 0 error）。**真实 tag 发版（v1.0.0）+ npm install 验证 = 用户侧**（需配 NPM_TOKEN，CONTRIBUTING 有三步说明） |
| v3.61 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"注意看远端的 CI"约束） | **CI 红灯修复两条（远端首跑暴露的回归网缺口）**：① e2e job 首跑 3 连红——`mock-scenarios.spec.ts` long-output 用例定位器按 `hasText: 'bash'` 找工具卡，而批次 2 工单 10.4 已把卡片头部改为人话类别词（bash→终端，raw name 只在 title）——e2e 此前从未进 CI 故漏网至今；定位器改 `hasText: '终端'` 并注释口径。② 主 ci job mobile jest 报 Cannot find module '@spark/protocol'——11.6 给 protocol 加的 exports 只有 import/types 条件，jest（CJS）解析不到；补 `require` 条件恢复原 main 解析路径（publishConfig 发布面不受影响）。**验证**：Nightly 手动触发全绿（performance job 千事件回放与十万 RSS 两断言出数通过、eval fail-soft skip 文案如实）；e2e 修复由 push 触发的 e2e job 裁决 |
| v3.62 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，"完美还原 Qwen 首屏"指令） | **工单 10.32 完成并勾选：CLI 首屏完美还原 Qwen Code**。在线复用（AGENTS §2.12，qwen-code Apache-2.0 版权留痕）：Header.tsx 布局逻辑 + 默认暗色主题渐变色值；logo=6 行横向渐变 SPARK 大字（ANSI Regular 细线风格，S/P/A/R/K 按 Q/W/E/N 锚定字形语法补齐，padEnd 防渐变错列，同列同色合并渲染防节点爆炸）；信息盒 round→single 四行结构（`>_ Spark` bold / 空行 / `API Key | 模型（/model 切换）` / cwd tilde 截短）——「API Key |」按鉴权方式声明口径保留（Spark 无 OAuth 形态，恒为 API Key 鉴权）；模型真值三级回退（会话模型→模型目录缺省→—，Qwen 无会话也显模型同口径）；提示行「提示： 试 /resume，接着上次的会话聊。」；输入占位「输入您的消息或 @ 文件路径」；render.test BootHeader 四断言重写（新增缺省模型回退用例）。DESIGN §13.K K.1/K.3 改判 v2.11。终端渐变视觉走查留用户 |
| v3.63 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，三端起跑后实测缺陷反馈） | **工单 10.33 完成并勾选：CLI live 区高度预算（发消息后界面拉长/输入框被顶出屏/退出残帧乱串三症同根因）**。根因：MessagePane live 区（未定稿行）无行数上限，帧高一旦超过终端行数，Ink 交替帧重绘推动终端滚动，光标错位不可恢复。修法：`maxLiveRows` 预算窗口化——超预算只渲染尾部 + 「↑ N 行已折叠」明示（定稿后进 Static scrollback）；app.tsx 按底部固定件实时计算预算（输入框/footer/断线行/slash 菜单/错误区/审批框）。render.test 补三态用例（41/41 过）+ preview-pane.mts 伴随预览器；终端实测留用户 |
| v3.64 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，三端起跑指令的延续会话） | **工单 10.33 终验 + 10.34 完成并勾选**。10.33 实测（桌面终端窗口发 30 行长回复）：全部行进屏、输入框恒在底部、footer 双行钉底、历史进 scrollback 可上翻——用户报告的三症状（拉长/输入框出屏/退出乱串）消解。10.34（Nightly 红灯 24h 出单）：performance job 千事件回放 617ms>500ms 系 CI 冷启动成本（本地热态恒过）——用例加不计时 warmup 预读，断言只测热态回放（阈值政策本意），本地复跑绿。 |
| v3.65 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，"新建会话应该新建 + 完全按 Qwen 界面所有细节"指令） | **工单 10.35/10.36/10.37 完成并勾选（Qwen 界面规格级对齐第二轮）**。前置：qwen-code UI 源码级规格调研（在线 gh api 逐组件提取——颜色体系/布局高度管理/输入区边框与光标/消息流前缀体系/思考块/slash 菜单/LoadingIndicator/Footer 全规格，报告入会话记录）。10.35 /new 清屏（clearCommand 语义：ANSI 清屏 + resetUi + boot 重现）；10.36 输入区与消息流（顶横线+底单线输入框/紫 > 正文/◆︎ 前缀/∴∵ 思考块/LoadingIndicator）；10.37 Footer space-between 单行 + `> ` 紫标记列 slash 菜单。render.test 41/41、lint/typecheck 绿。DESIGN §13.K 改判 v2.12 |
| v3.66 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"截图看效果再调整"迭代指令） | **工单 10.38 完成并勾选：布局模型重构（BootHeader 入 Static + 帧自然高度）**。桌面截图迭代发现：有历史会话启动时界面只见空盒+沉底输入框（BootHeader/历史全在 scrollback 顶）——Spark 与 qwen 布局模型相反。重构：MessagePane Static items=[BootHeader 首项,...已定稿行]（staticKey=Static 组件 React key，变化时整 Static 重建 index 归零+ANSI 清屏=整屏重印；/new//resume 统一）；root 去 height={rows}（帧自然高）；InputBox 横线/边框统一宽（修 Yoga 收缩错位）；消息流 marginX=2+密度规则；user/assistant 前缀列 2 列+正文 flexGrow 对齐；models 门控（Static 首印不可更新——信息盒首印即真值）。桌面截图逐项核对通过 |
| v3.67 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，stepfun 实测报错反馈+"系统提示词写丰富了吗"质询） | **工单 10.39 完成并勾选：上游 callId 协议透传 + 系统提示词丰富化**。① protocol CallId 闸门放宽为不透明 token（上游 `call_xxx`/`toolu_xxx` 原样透传不重写——修 E_BUS_INVALID_DATA 整条 assistant.message 落盘失败；toolResult 回环 id 天然一致免映射表）；② engine prompts.ts 按 qwen core prompt 结构骨架丰富化（身份/Core Mandates/工程工作流/CLI 沟通/工具指引/安全/git）+ **AGENTS.md 向上查找**（修会话 cwd 在仓库子目录时项目指引=none 的实测缺陷）；③ 引导语明确 turn 内不可提问、用户语言回中文。protocol 29/29、engine 493 过 |
| v3.68 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，/new 后"不是从最上面开始"截图反馈） | **工单 10.40 完成并勾选：/new 清屏补 3J**。手写 `\x1b[2J\x1b[H` 缺 scrollback 清除符——Static 重挂的 header 印在旧对话中部（桌面截图实测）。改 ansi-escapes.clearTerminal 同款三段式（2J 视口 + 3J scrollback + H 归位），/new 后整屏从顶部开始欢迎首屏（实测通过）。server 同步重启加载 10.39 新提示词与 CallId 闸门 |
| v3.69 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，"系统提示词人家怎么写的你就怎么写！"+Ctrl+C 中断截图反馈） | **工单 10.41 完成并勾选**：① 系统提示词**逐段照搬 qwen-code 核心提示词**（Apache-2.0 版权留痕；全部段落条目文本，三类替换=身份/工具名/删无对应段）——此前自写"丰富化"版本作废；② Ctrl+C 运行中首击=interrupt 当前回合（双击仍退出）；③ IME 物理光标精确定位依赖 ink 7 API，挂 V2-26 待升级。engine 36/36、typecheck/lint 绿 |
| v3.70 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，“CLI 全部前端只参考 Qwen Code、能抄就抄、先重构去冗余、工单先行”指令） | **批次 4 立项（10.42–10.46：CLI Qwen 化二期）**：10.42 输入框物理光标（IME 组字窗跟随，yogaNode 爬树 + useCursor，ink 6.8 等价 qwen getAbsolutePosition）/ 10.43 app.tsx 组件化拆分（757 行 → hooks/use-cli-keys + use-session-stream + use-cli-actions + 组装壳，items.tsx 拆 rows/）/ 10.44 工具折叠汇总句式（qwen CompactToolGroupDisplay 动词+对象列表）/ 10.45 footer token 数与状态色（横线随审批态变黄）/ 10.46 思考块文案（Thought for 1s / Thought briefly）。对照基准=Qwen Code 实机截图 8 张 + 在线源码调研 |
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
├── examples/mock-sessions/
└── official/                       # Spark 产品官网代码（仅前端；不在 pnpm workspace，独立于产品各端）
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

## 4.3 事件词表（21 种，merge-extensible——dsh 手法，插件 declaration merging 扩展）

> **扩展落地（阶段五工单 5.5，ADR D18）**：编译期扩展走 SparkEventMap declaration merging；运行时扩展 = protocol `extend.ts` 注册表（`registerEventType`/`eventSchemaOf`）——skills 插件清单的 `plugin.*` 事件（JSON Schema → zod）注册后与内置 21 种**同一校验路径**（EventBus/parseEnvelope/SessionStore 统一查表）；扩展事件信封带 `ignorable: true`（durable 占行号，插件卸载后旧会话可加载；未装插件的前端跳过未知 ignorable 帧不断流）。

```ts
export interface SparkEventMap {
  // 会话
  'session.created': {
    title?: string
    cwd: string
    model: string
    branch?: string // 工单 10.6：创建时 cwd 的 git 分支（只读探测，取不到不携带）
    effort?: ReasoningEffort // 工单 10.6：创建时生效的推理档位（缺省 = 未配置）
  }
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
  // 长期记忆（阶段七工单 7.5 / ADR D25：先于 user.message 落盘，Projector 投影为模型上下文首条前缀）
  'memory.injected': {
    turnId: TurnId
    query: string              // 检索词（会话首条 user.message 文本）
    memories: { id: number; content: string; createdAt: number }[]  // top-k 命中（≥1）
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
  'session.created': z.object({
    title: z.string().optional(),
    cwd: z.string(),
    model: z.string(),
    branch: z.string().optional(), // 工单 10.6：创建时 git 分支（只读探测，取不到不携带）
    effort: ReasoningEffortSchema.optional(), // 工单 10.6：创建时生效档位
  }),
  'user.message': z.object({
    text: z.string().min(1),
    attachments: z.array(z.string()).optional(),
  }),
  // …21 种逐一定义；content/usage 等复用 primitives.ts 的共享 schema
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
| memory.injected                                   | ✅           | ✅（工单 7.5 / ADR D25：Projector 投影为模型上下文首条前缀消息——模型可见必被记录，surface 纪律双面成立） |

**磁盘行与 wire 同构**：落盘 JSONL 行 = 信封原样（含 parentId）——单一格式，序列化零转换，前端 UiItem 的 parentId 即来源于此。

**与 opencode-ai/schema（`packages/schema/src/event.ts`）对照**（v2.5）：其信封 Payload 含 `metadata?: Record<string,unknown>` 自由扩展通道（trace id 等），且支持**事件级版本共存**（`versionedType = type.version` 注册表 + `latest()` 取最高版）——两者均记为协议演进 v2 选项；v1 的单一 `version` + `ignorable` 逃生已够（更简，读端 fail-closed 更严）。

**读端 fail-closed**（dsh）：磁盘重建遇未知 type 且无 `ignorable: true` → 拒绝加载并报错。

## 4.5 HTTP API

| 方法 | 路径                        | 请求                                                 | 响应                                                 |
| ---- | --------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| POST | /api/sessions               | `{ title?, model?, cwd? }`                           | SessionDto                                           |
| GET  | /api/sessions               | `?limit&cursor&q`（q=标题子串过滤，工单 4.8）        | SessionDto[]                                         |
| GET  | /api/sessions/:id           | `?limit&before`（均可省；缺省=全量回放红线；before=seq 游标返回 seq < before 升序、limit 缺省全量上限 200——工单 9.3 移动端向上翻页） | SessionDto（含 `events: SparkEvent[]` durable 回放） |
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
| GET  | /api/routing                | —                                                    | `RoutingDto`（阶段七工单 7.7：fallback 链/任务路由档/成本上限/usage 累计） |
| PUT  | /api/routing                | `RoutingUpdate`（任一字段可选）                      | `RoutingDto`（热生效——下一请求；写回 models.json；坏形状/provider 未配置 → 400） |
| DELETE | /api/routing/usage       | —                                                    | `RoutingDto`（usage 清零——解除成本熔断的唯一入口）  |
| GET  | /api/commands               | —                                                    | `CommandDto[]`（阶段七工单 7.4 / H04：内置基线 action/client + `~/.spark/commands/*.md` 自定义 prompt） |
| POST | /api/sessions/:id/commands/:name | `{ args? }`（body 可空）                       | `{ ok:true }`；action（compact）走压缩入口 / prompt 展开走 turn 通道；client 命令 → 400 `E_COMMAND_CLIENT`，未知命令 → 404 `E_NOT_FOUND` |
| GET  | /api/mcp                    | —                                                    | `McpServerDto[]`（工单 7.4 只读状态；连接失败也列出 connected:false） |
| GET  | /api/skills                 | —                                                    | `SkillDto[]`（工单 7.4 已加载技能只读清单）          |
| GET  | /api/memories               | —                                                    | `MemoryDto[]`（工单 7.5 / ADR D25：长期记忆列表，设置页管理数据源） |
| DELETE | /api/memories/:id         | —                                                    | `{ ok:true }`；无此条 → 404 `E_NOT_FOUND`            |
| GET  | /api/pair                 | —                                                    | `PairStatusDto`（工单 9.1 / ADR D24：监听地址/端口/环回标志/鉴权启用态/配对设备列表） |
| POST | /api/pair                 | `PairRedeemBody`                                     | `{ token }`（工单 9.1 移动端兑换口：6 位短码 → 长效 token；鉴权钩子豁免——自举；码无效/过期/重放 → 401 `E_PAIR`；鉴权未启用时调本端点 → 403 `E_PAIR_DISABLED`） |
| POST | /api/pair/code            | —                                                    | `PairCodeDto`（工单 9.1 桌面签发：60s 一次性短码 + QR 出示内容 `spark://pair?host=&port=&code=`；签发即启用鉴权，不返回 `E_PAIR_DISABLED`——该码只出现在兑换端点） |
| DELETE | /api/pair/devices/:id   | —                                                    | `{ ok:true }`（工单 9.1 撤销设备——撤销即断：已连 SSE 立即断开）；无此条 → 404 `E_NOT_FOUND` |
| GET  | /api/automation             | —                                                    | `AutomationTriggerDto[]`（工单 7.6 / ADR D26：cron/watch/webhook 触发器列表） |
| POST | /api/automation             | `AutomationCreate`                                   | `AutomationTriggerDto`；未启用任何触发条件 → 400 `E_TRIGGER`，cron 非法 → 400 `E_CRON` |
| DELETE | /api/automation/:id       | —                                                    | `{ ok:true }`；无此条 → 404 `E_NOT_FOUND`            |
| PUT  | /api/automation/:id/enabled | `{ enabled }`                                      | `{ ok:true }`（启用/停用热生效——下一 tick 起算）    |
| GET  | /api/automation/runs        | `?limit`                                             | `AutomationRunDto[]`（运行历史，失败行含结构化 `error`） |
| POST | /api/automation/webhook/:id | —                                                  | `{ ok:true }`；停用中 → 409 `E_TRIGGER_DISABLED`，非 webhook 触发器 → 400 `E_TRIGGER_KIND` |
| POST | /api/automation/:id/run   | —                                                    | `{ ok:true }`（手动触发；失败不吞——运行历史行留 `error`） |
| GET  | /api/audit                | `?limit&kind&result&tool&since`（均可省；limit 缺省 200 上限 500） | `AuditEntryDto[]`（工单 7.12 / H11：审计明细流新→旧；三类 kind——permission.decision / permission.rule / session.rollback） |
| GET  | /api/search               | `?q&limit`（q 必填；limit 缺省 20 上限 100）                        | `SearchHitDto[]`（工单 7.13 / H12：会话全文搜索新→旧；索引范围 = user.message / assistant.message / session.title，引擎侧截窗摘要） |
| GET  | /api/artifacts/:file      | —                                                                   | `image/png`（工单 7.10 / H09 / ADR D27：browser.screenshot 截图供图；文件名白名单 `shot-<ts>-<seq>.png` 校验在引擎侧，非法名/缺文件 404） |
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
├── models.json           # provider 与默认模型（含路由档：fallback 链/任务路由/成本上限）
├── permissions.json      # 用户级审批规则
├── secrets.json          # 密钥仓（工单 7.1；store > env）
├── usage.json            # 成本累计（工单 7.7；原子写，重启延续）
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
  "fallbacks": [                                          // 工单 7.7：主模型失败（无已交付）时依序切换
    { "provider": "anthropic", "model": "claude-x" }
  ],
  "titleModel": { "provider": "deepseek", "model": "deepseek-chat" },      // 自动标题路由档
  "subagentModel": { "provider": "deepseek", "model": "deepseek-chat" },   // 子代理路由档
  "costLimitUsd": 5,                                      // 成本熔断阈值（累计 usage.costUsd ≥ 此值断新 turn）
  "defaultEffort": "medium",                              // 工单 10.6：推理档位缺省（low/medium/high；缺省 = 不设置）
  "models": [
    { "provider": "deepseek", "model": "deepseek-chat", "contextWindow": 128000 },
    { "provider": "deepseek", "model": "deepseek-reasoner", "contextWindow": 128000 }
  ]
}
```

**配置文件 zod 校验 schema**（加载即校验；失败 = 启动即败——配置错误不带病运行）：

| 文件             | 字段 → 类型/约束                                                                                                                                                                                                         | 缺省                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| spark.json       | `server.port`: int(1-65535)；`server.host`: string；`engine.maxStepsPerTurn/maxToolParallel`: int≥1；`toolTimeoutMs/permissionTimeoutMs/progressThrottleMs/toolOutputLimitKB`: int>0；`compactionThreshold`: number(0,1)；`checkpoints`: boolean；`bashSandbox`: 'off'\|'on'（工单 5.2，ADR D15：on = 平台 wrapper 前缀 + 不可用即拒跑）；`hooks`: {挂点: 触发器[]}（工单 7.3 / H03：挂点 = `turn.before`/`turn.after`/`permission.resolved`/`tool.completed` 四选，触发器 = `{command, timeoutMs?}` 外部命令（shell 解释，cwd=会话工作目录，stdin 收 JSON 载荷）或 `{skill, emit}` 插件事件二选一，strictObject 防混写） | 全部可缺省（取 §5.1 默认值）；hooks 缺省 = 无挂点；文件本身可不存在                       |
| models.json      | `providers`: record<string, {apiKeyEnv: string\|null, baseUrl?: url}>；`defaultModel/compactionModel`: {provider, model, contextWindow: int>0}；`models`: {provider, model, contextWindow: int>0}[]（工单 6.5：可选模型清单——Composer 模型选择器与 GET /api/models 数据源；加载时与 defaultModel/compactionModel 合并去重，显式条目在前首个 contextWindow 生效）；`fallbacks`: {provider, model, contextWindow?}[]（工单 7.7：contextWindow 缺省回 defaultModel）；`titleModel/subagentModel`: {provider, model, contextWindow?}（工单 7.7：任务路由档，缺省回 defaultModel）；`costLimitUsd`: number>0；`defaultEffort`: 'low'\|'medium'\|'high'（工单 10.6：推理档位缺省，会话未显式选档时生效） | **无缺省——defaultModel 必填**（缺失/校验失败 → `E_CONFIG` 启动失败）；models[] 缺省 = [defaultModel]；fallbacks/titleModel/subagentModel/costLimitUsd 缺省 = 空链/defaultModel/defaultModel/不限；defaultEffort 缺省 = 不设置（按 provider 默认） |
| permissions.json | `version`: 1；`rules`: {action, resource, effect: 'allow'\|'deny'\|'ask'}[]                                                                                                                                              | 空规则表（全部落默认 ask）                                           |
| mcp.json         | `version`: 1；`servers`: record<string, {command: string, args?: string[], env?: record<string,string>}>（工单 5.3，ADR D16：stdio MCP server 声明，工具注册进同一 ToolRegistry，审批 action `mcp.call`/resource `<server>/<tool>` 默认 ask） | 空表（零外部工具，引擎照常启动；单 server 连接失败 warn 跳过）       |
| skills/ 目录     | `<root>/skills/<name>/skill.json`：`version`: 1；`name`: ^[a-z0-9][a-z0-9-]*$；`events`: record<`plugin.` 前缀类型, {description?, liveOnly?, data: JSON Schema}>；`hooks`?: {on: 内置事件类型, emit: 本 skill 事件}[]（工单 5.5，ADR D18：声明式清单——插件是数据不是程序，不执行任意代码；hooks data 固定形状 `{skill, sourceEventId, sourceType}`） | 目录不存在 = 零插件；单 skill 坏清单/类型冲突/钩子非法 warn 跳过（引擎照常启动） |
| commands/ 目录   | `<root>/commands/<name>.md`（工单 7.4 / H04：自定义 /命令）：文件名即命令名（须匹配 ^[a-z0-9][a-z0-9-]*$，与内置重名丢弃）；frontmatter 可选 `description: 一行文本`（简单 key: value 解析，无 YAML 依赖；缺省取正文首行截 60 字符）；正文 = prompt 模板，`$ARGUMENTS` 占位符替换用户补充文本（无占位符则追加——Claude Code 自定义命令同语义），展开后走正常 turn 通道（user.message 事件落盘） | 目录不存在 = 零自定义命令；坏文件/名字非法 warn 跳过（引擎照常启动） |
| memory.db        | SQLite 长期记忆库（工单 7.5 / H05 / ADR D25）：表 memories（id 自增、content、created_at、session_id 来源）+ FTS5 trigram 虚表（外容模式 + 触发器同步；中文子串可命中）；打开失败 null 降级（memory 工具不注册、注入不接线，引擎照常启动） | 自动创建；FTS5 不可用降级 LIKE 检索 |

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

### 5.6.3 内置工具规格

**进度更新的门控队列**（pi `tool_execution_update` 模式，v2.4 补）：`onProgress` 回调先进 updateEvents promise 链缓冲、`acceptingUpdates` 标志门控；工具结束后关门并 `await` 排水——保证 progress 永不晚于 tool.completed 乱序到达（单纯定时节流做不到）。

| 工具  | input（zod）                                      | permission                                       | 行为细则                                                                                                                                           | 错误码                                                           |
| ----- | ------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| read  | `{path, offset?≥0, limit?≤2000 默认2000}`         | action='fs.read'，resource='file:<abs>'          | 相对路径基于 cwd 解析；二进制检测（NUL 采样）→ 拒读；行号前缀输出；超大返回尾部+头部提示                                                           | E_PATH_OUTSIDE（越出允许根）、E_NOT_FOUND、E_BINARY、E_TOO_LARGE |
| write | `{path, content}`                                 | action='fs.write'，resource='file:<abs>'         | 自动建父目录；返回写入字节数                                                                                                                       | E_PATH_OUTSIDE、E_WRITE_DENIED（只读挂载/权限）                  |
| edit  | `{path, oldString, newString, replaceAll?=false}` | action='fs.write'，resource='file:<abs>'         | **oldString 唯一性校验**（0 命中→E_NOT_FOUND；>1 且未 replaceAll→E_AMBIGUOUS）；返回 unified diff（供前端 DiffViewer）                             | E_NOT_FOUND、E_AMBIGUOUS、E_PATH_OUTSIDE                         |
| bash  | `{command, timeoutMs?≤120000, cwd?}`              | action='shell.exec'，resource='cmd:<前 80 字符>' | 每次独立 shell（v1 不做常驻）；stdout+stderr 合流 progress 流式（16KB/帧截断，Grok）；退出码非 0 → isError 但 output 保留；超时 SIGTERM→5s→SIGKILL | E_TIMEOUT、E_EXIT_CODE（附 code）、E_SPAWN                       |
| task  | `{prompt, title?}`                                | action='agent.task'，resource='task'             | 阶段五工单 5.4 / ADR D17：派生独立子会话（header.parentSession）跑一轮，返回最终 assistant 文本；执行体 = Engine.runSubagent（工具层不感知会话管理）；单层限制；父中断级联 interrupt 子会话 | E_SUBAGENT_DEPTH（子会话再派生）、E_ABORTED（父中断级联）        |
| browser.open | `{url, timeoutMs?≤120000 默认30000}`      | action='browser.navigate'，resource='url:<目标>' | 阶段七工单 7.10 / ADR D27：playwright-core headless chromium **懒启动**（首次调用才 launch；缺包/缺浏览器二进制 → 执行期 E_BROWSER_LAUNCH，`npx playwright install chromium` 前置）；URL 必须合法且仅 http/https（校验先于驱动副作用）；引擎级单例单页跨会话共享（刻意语义），返回 `{url（最终）, title}` | E_BROWSER_LAUNCH、E_BROWSER_NAVIGATION（非法 URL/加载失败） |
| browser.click | `{selector, timeoutMs?}`                    | action='browser.interact'，resource='url:<当前页>' | 在无打开页面时**不触发启动**直接 E_BROWSER_NO_PAGE；选择器超时未命中 → E_BROWSER_SELECTOR；返回 `{url（最终）}` | E_BROWSER_NO_PAGE、E_BROWSER_SELECTOR |
| browser.read | `{selector?}`                               | action='browser.read'，resource='url:<当前页>' | 读取页面文本（缺省全文，选择器限定元素）；正文 >20000 字符截断 + `truncated` 标记；无页面同 click 拒绝 | E_BROWSER_NO_PAGE、E_BROWSER_SELECTOR |
| browser.screenshot | `{selector?}`                         | action='browser.read'，resource='url:<当前页>' | **截图不进事件流**——PNG 落 `~/.spark/browser-shots/shot-<ts>-<seq>.png`，输出只回 `{url, file, bytes}`（过 32KB 限界）；前端经 GET /api/artifacts/:file（白名单校验）按需拉图 | E_BROWSER_NO_PAGE、E_BROWSER_SELECTOR |

browser 族纪律（ADR D27）：四工具一律 `parallelizable: false`（共享单页天然互斥，串行 barrier）；审批三 action（navigate/interact/read）空规则表缺省 ask；中断 = ctx.signal race 即返 E_ABORTED（底层操作跑到静默）；工具恒广告（缺失时执行期 fail-closed，不做不注册）。

路径安全：v1 允许根 = cwd + 用户显式 addDir（v2）；越界直接 E_PATH_OUTSIDE（不需要审批兜底——硬边界优先于审批）。

**跨平台规则**（默认决策，可推翻——推翻时在 ARCHITECTURE.md 记 ADR）：

- **bash 执行器**：Windows 优先 PATH 中的真实 `bash.exe`（`where bash` 列候选，逐个以 `-c "exit 0"` 探测可用性；System32/WindowsApps 的 WSL 别名 stub 一律跳过——无发行版时任何命令都失败，探测结果进程内缓存），缺失则 `powershell -NoProfile -Command`；Unix 一律 `/bin/bash -c`。命令字符串原样传递，不做翻译。
- **超时 kill**：Unix `SIGTERM` → 5s → `SIGKILL`；Windows `taskkill /PID <pid> /T /F`（树杀——子进程不悬挂），两次均强杀、宽限 1s（首杀与子进程派生竞态时补杀兼做孤儿收尾）。
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
| E_BROWSER_LAUNCH                                 | chromium 启动失败或 playwright-core 不可用（懒启动 fail-closed；工单 7.10，ADR D27） | tool output                        |
| E_BROWSER_NAVIGATION                             | 非法/非 http(s) URL 或页面加载失败（工单 7.10）   | tool output                        |
| E_BROWSER_NO_PAGE                                | 未先 browser.open 即 click/read/screenshot（不触发启动；工单 7.10） | tool output                        |
| E_BROWSER_SELECTOR                               | 选择器超时未命中（工单 7.10）                     | tool output                        |
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

**applyEvent 处理表（21 种全覆盖）**：

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
| memory.injected              | slice.memoryInjected 记录命中数与查询词（工单 7.5；不进 items——模型可见面已在引擎事件流记录） |

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
| `c`（非输入态）   | 新建会话（工单 10.5①；GitHub/Linear 单键惯例）                     | 全局（AppShell）                |
| `/`（非输入态）   | 打开全文搜索页（工单 10.5①）                                        | 全局（AppShell）                |
| `↑`（输入框空时） | v1 不做"编辑上一条消息"（阶段四再议，勿自行加）                     | Composer                        |

### 6.11.1 CLI 键位（阶段八工单 8.3；H36 前置）

**单一来源 = `packages/protocol/src/keymap.ts`**（KEYMAP 表 + `cliKeymapText()`；cli `--help` 由同表渲染，与错误文案表 error-copy.ts 同库共享纪律）。修改键位先改 keymap.ts，本表随之同步。

| 键                  | 行为                                            | web 对位                       |
| ------------------- | ----------------------------------------------- | ------------------------------ |
| `Enter`             | 发送消息                                        | Composer Enter                 |
| `/` 前缀            | 命令（7.4 注册表：/compact 与自定义 .md）       | Composer / 菜单                |
| `Tab`               | 循环提交模式 now / steer / queue（状态条显示）  | Composer 分段选择              |
| `Esc`               | 中断当前 turn                                   | 停止按钮                       |
| `y` / `a` / `n`     | 审批：允许一次 / 总是允许 / 拒绝（展开理由输入）| 审批卡按钮                     |
| `Ctrl+O`            | 展开/折叠最近一个工具或思考条目                 | ToolCard/Reasoning 点击        |
| `Ctrl+N`            | 新建会话                                        | 侧栏按钮                       |
| `PageUp/PageDown`   | 切换会话                                        | 侧栏点击                       |
| `Ctrl+U`            | 清空输入                                        | —                              |
| `Ctrl+R`            | 重试最近一次发送（错误提示存在、无在途 turn 时）| —（web 手动重发）              |
| `?`（输入为空时）   | 帮助面板（三 tab：概览/命令/键位，工单 10.10）  | —（web 设置页键位见 §6.11）    |
| `Ctrl+C ×2`         | 退出（在途 turn 先中断，不悬挂）                | —                              |

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
| GET /api/healthz                 | 工单 5.1 已注册：桌面壳 sidecar 探活端点（listen 成功即引擎可用）；`{ok:true}` 无鉴权无副作用。server 入口支持 `SPARK_PORT`/`SPARK_HOST`/`SPARK_WEB_DIST` 环境变量注入（桌面壳 ADR D14；**`SPARK_HOST` 仅环回覆盖**——非环回值无条件拒启动，工单 9.1 起 `server.host`/`server.port` 由入口实际消费绑定地址，此前仅 schema 允许） |
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
| PUT /api/sessions/:id/effort | 阶段十工单 10.6 已注册：= `engine.setSessionEffort()`——会话级推理档位（low/medium/high，OpenAI reasoning_effort 映射），**内存态下一 turn 生效**（同换模型纪律；重启回 models.json defaultEffort 缺省）；引擎经 StreamRequest.effort 透传网关（pi-ai reasoning 字段）；坏枚举 400、未知会话 404 → 200 `{effort}`。分支面同源：会话创建时只读探测 cwd git 分支，进 header + session.created 事件 + SessionMetaDto.branch（取不到不携带——前端顶栏分支 chip 禁假状态） |
| GET/PUT/DELETE /api/routing | 阶段七工单 7.7 已注册：GET = `engine.getRouting()`（路由状态 + usage 累计，apiKey 永不进 DTO）；PUT = `updateRouting()`（zod RoutingUpdate 任选字段——fallbacks/compactionModel/titleModel/subagentModel/costLimitUsd，**就地改 routing 属性热生效**（已装接线闭包下一请求生效），通过后写回 models.json（重启延续；读盘失败显式 E_CONFIG 不兜底重写），坏形状/未配置 provider 400）；DELETE usage = `resetUsage()`（usage.json 清零——解除成本熔断的唯一入口）→ RoutingDto |
| GET/POST/DELETE /api/automation · PUT /:id/enabled · GET /runs · POST /webhook/:id · POST /:id/run | 阶段七工单 7.6 已注册（ADR D26）：list/create/delete/setEnabled = `AutomationManager`（create 校验至少一种触发条件 + cron 预解析——400 `E_TRIGGER`/`E_CRON`；启停热生效下一 tick 起算）；runs = `listAutomationRuns(limit)`（automation-runs.jsonl 倒序，失败行含结构化 `error`）；webhook = `fireAutomationWebhook()`（停用中 409 `E_TRIGGER_DISABLED`、非 webhook 触发器 400 `E_TRIGGER_KIND`）；run = `fireAutomationManual()`（同步执行，失败不吞——运行历史行留 `error`）；触发效果恒为建会话发 prompt（FireDeps 引擎接线） |
| GET /api/audit | 阶段七工单 7.12 已注册（H11）：= `engine.listAudit(query)`——~/.spark/audit.jsonl 独立追加明细流（新→旧；过滤 since/kind/result/tool 后取末 limit 条，缺省 200 上限 500）；写入方三处：PermissionService（决策行——规则快路径归因 `rule:<层>` / 用户答复 `reply:*` / timeout·abort·shutdown·cascade；always 答复另记规则固化行）+ 规则管理（`settings-ui`）+ rollbackToCheckpoint（`checkpoint`）；写前脱敏同 pino（redaction.ts 单一来源 + 密钥仓动态值），写失败旁路吞掉不阻断主链路，读端坏行跳过 |
| GET /api/search | 阶段七工单 7.13 已注册（H12）：= `engine.searchSessions(q, limit)`——~/.spark/search.db（node:sqlite）会话全文索引（新→旧；q 必填，limit 缺省 20 上限 100）；索引范围 = user.message / assistant.message 的 text 块 / session.title 三类；检索链 = FTS5 trigram MATCH（≥3 字符）→ 整串 LIKE → 拆词最长词 LIKE（自然语句兜底，同 MemoryStore 先例）；增量钩子在 bus durable 订阅（旁路，失败只 warn），装载点（create/resume/fork/rollback 重载）按水位幂等同步（持平跳过 / 倒退先截断界外行）；行主键（session_id, event_id）——fork 复制事件沿用原 event id；JSONL 恒为权威（同 SessionIndex 纪律），库打开失败降级空结果不阻塞启动 |
| GET /api/artifacts/:file | 阶段七工单 7.10 已注册（H09，ADR D27）：= `engine.readScreenshot(file)`——~/.spark/browser-shots 截图供图；**文件名白名单在引擎侧**（`shot-<ts>-<seq>.png` 正则，与驱动写盘同源常量），非法名/缺文件/路径逃逸一律 404，命中 → `image/png` 原字节；截图不进事件流（只回文件名+字节数，前端 ToolCard 展开区按需拉图，拉不到降级文案） |
| GET/POST /api/pair · POST /api/pair/code · DELETE /api/pair/devices/:id | 阶段九工单 9.1 已注册（ADR D24）：GET = 配对状态（`DeviceStore` 设备列表 + 监听 host/port/loopback/authEnabled）；POST = 移动端兑换（`PairService.redeem`——6 位短码 60s 一次性，无效/过期/重放不区分原因一律 401 `E_PAIR` 防泄露在途码状态；鉴权钩子豁免自举口）；POST code = 桌面签发（`createCode` + QR 内容 `spark://pair?host=&port=&code=`，签发即启用鉴权，不返回 `E_PAIR_DISABLED`——该码仅在鉴权未启用时调兑换端点出现）；DELETE devices/:id = 撤销（`store.remove` + `sseRevokeToken` 撤销即断）；长效 token 只存 sha256 哈希（~/.spark/devices.json 0600） |
| GET /api/sessions/:id/fs | 批次 6 工单 10.53 已注册（CLI @ 路径补全数据源）：`?path=`（相对会话 cwd，缺省空=根）→ `requireHandle` 取权威 cwd + `resolveInRoot` 硬边界（AGENTS §6.4）列举目录，越界（`../`）/不存在一律回**空清单**（不泄露 cwd 外任何项、补全 UI 不报错打断输入）→ FsListDto（path + entries[{name,path,isDir}]，目录优先+名称序，上限 `FS_LIST_LIMIT=200`）；协议先行 DTO（FsQuery/FsEntryDto/FsListDto）入 api.ts + Transport.listFs 双实现（HttpTransport/MockTransport） |

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
| 自动化触发器停用中 | 409 `E_TRIGGER_DISABLED`（工单 7.6：对停用触发器发 webhook/手动触发） |
| 触发器类型不符   | 400 `E_TRIGGER_KIND`（非 webhook 触发器调 webhook 入口） |
| 触发器无效       | 400 `E_TRIGGER`（未启用任何触发条件/触发器不存在，详情透出） |
| cron 表达式非法  | 400 `E_CRON`（解析失败，详情透出）              |
| 未通过鉴权（非环回） | 401 `E_AUTH`（工单 9.1：REST Bearer / SSE `?token=` 双口径钩子，fail-closed；豁免 /api/healthz 与 POST /api/pair 兑换口） |
| 配对码无效或已过期 | 401 `E_PAIR`（工单 9.1：不符/过期/重放不区分原因——避免泄露在途码状态） |
| 配对鉴权未启用 | 403 `E_PAIR_DISABLED`（工单 9.1：鉴权未启用时调**兑换端点**（POST /api/pair）出现；签发端点签发即启用，不返回此码） |
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
| 7.3  | ✅ 用户侧 hooks（H03）        | engine：spark.json 声明 turn.before / turn.after / permission.resolved / tool.completed 挂点 → 外部命令或 skill 触发                                             | 四挂点 e2e 各一例；hook 失败不阻断主流程（warn 闭合，同 D18 纪律）                                     | —       |
| 7.4  | ✅ 命令注册表（H04）          | engine+web：/命令 解析框架（/compact 迁入）+ ~/.spark/commands/*.md 自定义命令 + CommandPalette 接入；**命令清单基线 = 对齐 Claude Code 命令面（/compact /model /mcp /skills /usage /resume）+ opencode leader 键模式（ctrl+x 前缀）——命令名可不同，覆盖面以此为下限** | 基线清单逐条可用；自定义 .md 命令可被发现与执行；/compact 行为回归不变                                 | —       |
| 7.5  | ✅ 长期记忆（H05，P1）        | engine+web：~/.spark/memory.db（node:sqlite FTS5；向量检索后置）+ memory.save/search 工具族 + Projector 注入 top-k + 设置页管理；迷你 ADR                          | 记忆跨会话生效（save→新会话 search 命中）；注入不破坏 surface 纪律（模型可见必被记录）                 | 7.1     |
| 7.6  | ✅ 自动化触发器（H06，P1）    | engine+web：cron / watch / webhook 三类触发 → 自动建会话执行 prompt；任务列表 + 运行历史 UI；迷你 ADR（D26）                                                   | 三类触发器各一条 e2e；运行历史可查；失败运行有结构化错误留存                                           | 7.1     |
| 7.7  | ✅ model routing 增强（H07，P0） | engine：provider fallback 链 + 按任务路由（主/压缩/标题/子代理）+ 成本上限熔断（usage 聚合阈值中断）                                                             | 主模型断连自动 fallback；熔断触发后新 turn 拒绝且人话提示；路由配置热生效                              | —       |
| 7.8  | ✅ 子代理增强（H08，P1）      | engine+web：并行 Task（解除单并发）+ 树状运行监控（复用 4.5 树视图加运行态）                                                                                     | 多子代理并行互不串扰；监控视图实时状态与事件流一致；单层限制语义不变                                   | —       |
| 7.10 | ✅ browser 工具族（H09，P2）  | engine+web：Playwright chromium；browser.open/click/read/screenshot 工具、审批默认 ask、前端 BrowserCard 可视化；迷你 ADR                                         | 四工具走查（真实页面）；审批/中断/失败闭合与内置工具同管线；截图经工具输出限界                          | —       |
| 7.11 | ✅ eval harness（H10，P2）    | examples+脚本：examples/evals 场景集（ScriptedLlm 回归 + 可选真实模型评分）+ pnpm eval + 接入 nightly（doc/06 §2）                                                | pnpm eval 本地可跑；nightly 红灯出报告；场景集含审批/中断/压缩回归                                     | —       |
| 7.12 | ✅ 审计日志（H11，P1）        | engine+web：permission 决策 / 规则变更 / rollback 独立 JSONL 明细流 + 设置页查看器                                                                               | 明细流含时间/主体/动作/结果；查看器可过滤；脱敏纪律同 pino                                             | 7.1     |
| 7.13 | ✅ 会话全文搜索（H12，P1）    | engine+web：事件内容入 FTS5 + 搜索页（标题/内容命中高亮）                                                                                                        | 千事件会话搜索 <500ms（doc/06 基线）；命中高亮与跳转正确                                               | —       |

## 阶段八：CLI TUI（对齐 Claude Code/pi 形态）——工单级

> 可与阶段七并行开发、串行合入；选型依据 ADR D19（Ink v6）。纪律：server 零改动为验收项（确需改动单独工单说明）；错误人话文案表与 web 共享同一来源（doc/07 §3）。

| #   | 工单                       | 产出（目标 + 涉及包）                                                                                                                                     | 验收标准                                                                                              | 依赖      |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | ✅ transport 下沉（提交 7532111）      | protocol：web HttpTransport 内核（SSE 解析/重连/REST 错误映射）抽至 packages/protocol transport-node 模块，web 与 cli 共用                                  | web 既有测试保绿；cli 冒烟连真实 server                                                                | —         |
| 8.2 | ✅ Ink 骨架（提交 fcef452）            | 新建 apps/cli（Ink v6）四区：会话列表侧栏 / 消息流 / 输入框 / 状态细条；<80 列隐藏侧栏；resize 适配                                                        | 80 列与 200 列两档走查可用；冷启 <1s（doc/06 基线）                                                    | 8.1       |
| 8.3 | ✅ 核心交互（提交 120beac）            | apps/cli：流式 delta 渲染；tool 单行折叠可展开；reasoning 默认折叠；审批 y=once / a=always / n=reject；Esc 中断 turn；双击 Ctrl+C 退出；/compact；Tab 循环 now/steer/queue 状态条显示；键位表成文（H36 前置） | 交互清单逐条走查；键位表入文档并与错误文案表同库共享                                                   | 8.2       |
| 8.4 | ✅ 断线续播 + 优雅退出（提交 57bc750） | apps/cli：细条提示 + 自动退避重连 + since=seq 续播；错误人话化共享文案表；SIGINT 优雅退出                                                                   | kill server→重启→续播无丢失；SIGINT 无悬挂 turn                                                        | 8.2       |
| 8.5 | ✅ 验收与登记                          | apps/cli+docs：Ink test-renderer 组件快照 + tty 模拟四幕走查（doc/06 §5）截图入 doc；README 补 pnpm --filter cli dev；本表勾选；AGENTS 适配表登记           | 四幕走查通过；测试/typecheck/lint 全绿（含 cli 包）                                                    | 8.1–8.4   |

## 阶段九：移动端三端（Android/iOS App + 微信小程序）——工单级

> 选型依据 ADR D20（Expo+RN）/ D21（Taro 4）/ D24（配对鉴权）；9.1 为本阶段首工单，未完成前 App 无法真连。纪律：缺省行为不变红线（127.0.0.1+无鉴权）；动 protocol 先按硬性约定第 5 条；服务端改动仅限 9.1 声明范围。

| #   | 工单                  | 产出（目标 + 涉及包）                                                                                                                                             | 验收标准                                                                                              | 依赖    |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| 9.1 | ✅ 配对鉴权（D24） | server+web：server.host 显式配置才可非环回；非环回强制 token、**扫码配对为主（桌面出示 QR 含一次性短码，DESIGN §13.J.2.9）、手输 6 位码兜底**，换长效 token、REST 与 SSE 同口径校验、无 token 非环回拒绝启动（fail-closed）；web 设置页配对 UI | 缺省行为不变；非环回无 token 拒启动；扫码与手输双路径走查（含撤销被拒）                                 | —       |
| 9.2 | ✅ RN 骨架（D20）        | 新建 apps/mobile（Expo+RN）：复用 @spark/protocol + applyEvent + 设计 token 映射 RN 主题（亮色默认、深浅跟随系统）；**视觉按 DESIGN §13.J（Qoder CN 实测规格：白卡无边框分层/单栈+抽屉/逐页 11 页映射）**；会话列表（下拉刷新）/ 会话页 / 设置页三屏 + 导航 | 三屏走查（对照 §13.J 数值）；冷启 <2s（doc/06 基线）；CI 增 RN typecheck+Jest                          | 9.1     |
| 9.3 | ✅ 会话体验              | apps/mobile：SSE 流式、审批卡三键（§13.J.3 纵向全宽形态）、中断、断线重连条、下拉加载历史（GET /:id 分页）、键盘避让与安全区、Composer 多行自增（§13.J.1 胶囊形态）   | 四场景走查（正常/审批/断网恢复/配对撤销被拒）；Maestro 用例入库（doc/06 L5）                            | 9.2     |
| 9.4 | ✅ 小程序（D21；提交 f400265 + 评审修复 712296d） | 新建 Taro 4 壳复用逻辑层；v1 = 开发者工具 + 体验版（局域网 IP + 不校验合法域名开关），正式分发中继服务记 v2（ADR D21）                                             | 开发者工具四幕走查；体验版真机预览可用（走查由用户执行，留待记录）                                                                 | 9.1     |
| 9.5 | ✅ 验收（本地登记完成） | mobile+docs：iOS/Android 模拟器 + 各一台真机四场景走查；Maestro 双端；真机记录（截图/录屏）归档；本表勾选 + README/AGENTS 登记                                      | doc/06 §5 四幕×双端全过；CI 全绿（含 RN）。**注记：真机/模拟器四场景走查与小程序开发者工具走查由用户执行（留待记录）；本地验收已完成——CI 全绿含 RN/小程序（`pnpm -r typecheck` scope 实证，ci.yml 零改动）、Maestro 四幕用例在库（`apps/mobile/e2e/`）、文档登记（doc/02/README/AGENTS）** | 9.1–9.4 |

## 阶段十：UI 对齐（web 对照审计+会话流呈现）与 CLI 重构（Qwen Code/Gemini CLI 形态）——工单级

> 立项依据：晚风 2026-08-30 供图两批实测截图（ZCode web 参考细节 + Qwen Code CLI 全量交互态 15 张——空态/对话/工具执行与折叠/表格/slash 菜单/帮助面板/审批框/@ 补全/报错/思考展开/resume 面板/IME）与本会话逐条对照审计。**CLI 四项决策（晚风拍板）**：① 头部 ASCII logo 允许蓝紫渐变（§12/§13.I 全仓唯一豁免点，条款单列于 §13.K.0）② 暗色主题 ③ 纯单栏——砍会话列表侧栏，会话管理退 /new 与 /resume（ADR D19 修订随 10.8 落 ARCHITECTURE 表）④ footer 双行为主，断线/重连异常时临时插红字行，seq 水位与 token 明细收 /stats。**新纪律（引言立约，全阶段执行）**：每条工单验收项必须带 DESIGN §13 行号/数值引用（规格→验收 1:1）——根因修正：阶段六~九"细节丢失"源于规格→工单的翻译损耗与功能级验收（非规格对照级验收）。**待拍板 2 项（按建议执行、可推翻）**：a) Composer 上方上下文水位大条删除（与 StatusBar 水位% 重复，ZCode 无此元素）；b) 欢迎页 Composer 渲染权限档钮（修正现行偏离，对齐 ZCode 空态实测）。

| #     | 工单                                   | 产出（目标 + 涉及包）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 验收标准                                                                                                                  | 依赖        |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 10.1  | ✅ 规格修订与差距清单正式化（文档）（DESIGN v2.5） | DESIGN 三处修订：① §13.A 空态问候语"15px semibold"→"≈28px 大字问候"（ZCode 实测"下午好呀，接下来交给我吧"，15px 系当时量测偏差）② §13.E "聚焦 ring 2px"→"聚焦不加高饱和 ring，1px 中性 border 轻微加深"③ §13.H:519 操作行扩展为"复制+👍+👎+hairline+'内容由 AI 生成'+时间戳+fork 分支会话"（👍👎 存储记 V2-25）。差距清单以本表 10.4/10.5 单元格为登记本体（逐条带 §13 行号），不再另立文档（单一来源） | DESIGN 版本表 +0.1；三处修订可指认行号；与 §12 黑名单无冲突                                                               | —           |
| 10.2  | ✅ AppShell 网格行错位修复           | apps/web `AppShell.tsx:48-59`：条件 ReconnectBanner（`status !== 'open'` 才渲染）致 `grid-rows-[auto_1fr_24px]` 三行被子元素自动占位**整体上移一行**——连接态实测 computed rows `368px 508px 24px`（内容区塌进 auto 行、StatusBar 掉进 1fr 行、行内剩余即"欢迎页大空白"）。修法=banner/内容栅格/StatusBar 显式 `grid-row-start` 占位，banner 缺席时 auto 行塌缩为 0，布局不随连接状态漂移                                                                                                                                                      | 已连接/连接中/断线三态 × 欢迎页/会话页两路由 × 1280/1440 两档走查矩阵全过；StatusBar 恒贴底                              | —           |
| 10.3  | ✅ 聚焦环中性化                      | apps/web `Composer.tsx:332`：移除 `focus-within:ring-2 ring-ring/25`（indigo #4f46e5 系高饱和描边，晚风拍板不要）→ 聚焦态 1px 中性 border 轻微加深；全仓 grep 同款收口（设置页/弹窗表单 focus 类）。**【10.15 勘误·勾选虚高】**本工单只收口了组件级 ring——`theme.css` 全局 `:focus-visible` 仍用 indigo `--spark-accent` 且规则未分层（永远压过 `outline-none` utility，Composer 蓝框常驻），全局层漏修，由工单 10.15 补齐（DESIGN v2.8 拍板登记）                                                                                                                                                                                                                                                                                                                                                  | 全仓无高饱和 focus ring 残留（grep 硬检查）；聚焦态目测走查                                                               | 10.1        |
| 10.4  | ✅ 会话流呈现升级                    | apps/web features/chat——① assistant 尾操作行（§13.H:519 扩展版）：复制+👍+👎（存储记 V2-25，UI 先行置灰）+hairline+"内容由 AI 生成"+时间戳+**fork 到分支会话**（引擎 fork 端点现成（工单 4.5），POST 后导航新会话——有数据源非假状态）② 回合头"已工作 N 秒 ˅"（turn.started/completed 时间差）③ 思考块补图标+持续时长（ReasoningCollapsible 改造）④ 工具块对齐 ZCode（ToolCard 已有终端/差分/读取/浏览器截图预览底子）：头部人话类别词（bash→终端、search/grep→查阅、read/write→读写…）+连续同类调用聚合"· N 次"+拒绝态整行删除线（permission 拒绝投影待核）+技能块映射核查 ⑤ assistant 代码块语言标签+复制钮（streamdown 核补）⑥ 运行中占位文案切换"继续输入以排队后续修改"+运行中发送钮→停止 ■（§13.E 明示，现未切换——实测）⑦ 链接预览卡记 V2-24 | 对照 2026-08-30 ZCode 会话流截图逐条走查（含一次真实工具调用回合与一次审批拒绝）；fork 点击→新会话可用且历史正确           | 10.1        |
| 10.5  | ✅ 侧栏与全局细节                    | apps/web——① 新建任务/搜索入口快捷键提示（§13:96，菜单右侧 kbd 样式）② 分组/项目双模式切换 tab（§13.A:308 实测双模式，现仅项目单模式）③ 分组"显示更多"渐进展开 ④ 左栏底部用户卡+齿轮+头像快捷菜单（§13:368）⑤ Composer **+ 菜单四项**（添加附件/使用 @ 添加上下文/使用 / 选择命令或能力/使用 $ 选择技能）⑥ 欢迎页 Composer 渲染权限档钮（修正 `Composer.tsx:50` 现行偏离）⑦ 上下文水位大条处置【待拍板 a】                                                                                                                                                     | 对照 ZCode 侧栏/Composer 截图逐条走查；264px/48px 折叠两态不回归                                                          | 10.1        |
| 10.6  | ✅ 跨端能力：分支 chip + 推理档位    | packages/protocol+engine+server——① 会话 DTO/事件暴露 cwd git 分支（只读探测；取不到不渲染，禁假状态红线——`SessionPage.tsx:163` 现注释即此口径）② 推理档位 effort 概念（OpenAI `reasoning_effort` 映射；models.json 档位缺省；协议枚举+透传）；web 分支 chip（顶栏预留位）与 Composer 推理档位（§13.E 底部工具条中列）点亮                                                                                                                                                                                                                              | 协议单测；web chip/档位真值呈现；缺省行为不变红线                                                                         | —（可并行） |
| 10.7  | ✅ CLI §13.K 视觉规格成文（文档）    | DESIGN 新增 §13.K（依据 15 张 Qwen Code CLI 实测截图+四项决策）：K.0 基调（暗色；**渐变豁免条款——仅头部 ASCII logo 允许蓝紫渐变，其余照 §12/§13.I**）K.1 启动头部（ASCII logo+圆角信息盒">_ 名称(版本)/模型行(/model 换)/cwd"+提示行+启动上下文摘要（模型/Base URL/脱敏 key/上下文文件））K.2 会话流块族（思考行/工具块人话头部/审批框/回合头——与 10.4 同套语义的 CLI 呈现）K.3 输入区（> 块状光标/@ 提示 placeholder）K.4 footer 双行（→项目·git:(分支)·模型·上下文 %；审批模式行；异常插行红字；seq 水位收 /stats）K.5 slash 菜单（左签名右描述+(1/N) 分页+▾ 续页）与 @ 补全面板 K.6 帮助面板（三 tab+四列快捷键表，Tab/Shift+Tab 切换）K.7 /resume 恢复面板（/ 搜索/↑↓/预览/Esc；恢复=durable 事件重放）K.8 错误呈现（红字+重试键位）K.9 反 AI 味 CLI 补充 | DESIGN 版本表 +0.1；每节带截图指认；豁免条款单列可引用                                                                    | —           |
| 10.8  | ✅ CLI 纯单栏骨架重构（D19 修订）    | apps/cli——砍会话列表侧栏（四区→单栏会话优先，ADR D19 修订），会话管理退 /new 与 /resume；boot 头部（渐变 ASCII logo+信息盒+提示行+上下文摘要）；footer 双行；**ARCHITECTURE.md ADR 表 D19 修订行随本工单提交**（四区→单栏，决策与理由）                                                                                                                                                                                                                                                                                                               | /new、/resume、Tab 审批循环键位走查；80/200 列两档；冷启 <1s（doc/06 基线）；D19 修订行可指认                              | 10.7        |
| 10.9  | ✅ CLI 会话流块族 + 审批框           | apps/cli——思考行".: 思考 · 持续 N 秒 (ctrl+o 展开/收起)"；工具块对齐 ZCode（运行中"…(Ns · ↑↓ tokens · esc to cancel)"行；完成 ✓+"first N lines hidden"折叠；**拒绝态整行删除线**——与 10.4 同套语义的 CLI 呈现）；回合头"已工作 N 秒"；审批框四选项（1 是，允许一次 / 2 本项目总是允许 / 3 对该用户总是允许 / 4 否，建议更改 esc——映射权限作用域 session/project/global），审批中 footer 切"请求授权"                                                                                                                                                | 真实工具调用+审批通过/拒绝两态走查；esc 取消；删除线呈现                                                                  | 10.8        |
| 10.10 | ✅ CLI 面板族                        | apps/cli——slash 菜单（左命令签名右描述、(1/N) 分页、▾ 续页）；@ 文件补全面板；帮助面板（? 唤起，三 tab+四列快捷键表，Tab/Shift+Tab 切换，Esc 取消）；IME 组合态兼容（候选窗悬浮不撕裂）                                                                                                                                                                                                                                                                                                                                                              | 面板逐个走查（含中文 IME 输入态）                                                                                          | 10.8        |
| 10.11 | ✅ CLI footer/错误/resume 收口 + 验收 | apps/cli——footer 双行（→Spark·git:(分支)·模型·上下文 %；审批模式行；断线/重连异常插行红字，恢复即消失）；/stats（seq 水位/token 明细——web-D 前提下含分支）；报错红字+重试键位（具体键位按 8.3 键位表统一定）；/resume 面板（/ 搜索/↑↓/Space 预览/Esc；恢复后 durable 事件重放呈现）；四幕 tty 走查+README/AGENTS 登记+本表勾选                                                                                                                                                            | 断网恢复走查无丢失；resume 重放完整；测试/typecheck/lint 全绿（含 cli 包）                                                 | 10.9, 10.10 |

> 备注：① 本阶段不含 Electron/移动端功能改动；② V2-24（assistant 链接预览卡）/V2-25（👍👎 反馈存储）已挂 §8.7 候选池；③ 10.2/10.3 为缺陷修复可先行合入，不等 10.1 文档工单（规格修订由 10.1 追认）。

## 阶段十·验收批次 2（合并后实测缺陷修复 + 命令面/设置面全量落地）——工单级

> 立项依据：晚风 2026-08-31 阶段十 PR #10 合入后的实测反馈 11 项（问题 1–11），本会话三路源码级核查子代理（CLI 四项 / web 四项 / server·协议·设置面）+ Qwen Code 官方文档站命令清单在线调研（AGENTS §2.12 纪律）逐项归因。**发现的三类系统性裂缝**（本批次总纲）：① 单测用 `app.inject` 不带 `content-type` 头，掩盖了 transport 层系统性缺陷（10.12 教训：测试环境与真实浏览器请求的头部差异要入测试纪律）；② 事件定稿配对用"列表末项"位置判断而非按 turnId 配对，真实发射序（推理先流、定稿后置）下必然失效（10.13）；③ 菜单列出 client 命令但前端无实现面板，输入落到引擎即 400（10.17/10.18）——命令注册表与各端实现面的对账机制缺失。
> 执行顺序：10.12（一处修复解锁 11 个按钮）→ 10.13（双显示）→ 10.14/10.15/10.16（web 三体验修复，可并行）→ 10.17（CLI 首屏/resume）→ 10.18/10.19（CLI 命令面/输入）→ 10.20/10.21（设置面全量）。
> 注意：本批次编号接续阶段十（10.12–10.21），不用 11.x/12.x——那两段是 doc/08 v2 阶段十一/十二的既定编号，不得混用。

| #     | 工单                            | 对应用户问题 | 产出（根因 + 涉及包）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 验收标准                                                                                     | 依赖 |
| ----- | ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---- |
| 10.12 | ✅ HTTP transport 空 body 修复     | 7/8          | `packages/protocol/src/transport-node.ts` `req()`（226-235 行）无条件给所有请求加 `content-type: application/json` 头，即使 body 为 undefined——Fastify 5 对"带 json 头的空 body"一律 400 `FST_ERR_CTP_EMPTY_JSON_BODY`，**路由 handler 从未进入、上游请求从未发出**。修法=仅当 `init?.body !== undefined` 才带该头。**一处修复解锁 11 个坏调用点**：`createPairCode`/`testModelProvider`（用户已踩到）/`interrupt`/`compact`/`rollbackCheckpoint`/`removeSecret`/`resetUsage`/`removeAutomation`/`fireAutomationWebhook`/`fireAutomationManual`/`revokePairDevice`（transport-node.ts 263–523 行逐个）。server 端 11 条路由本身无恙（不读 body），engine 不动。**附带三项**（并行会话增量，均已验证）：① server `index.ts` 注册 `setErrorHandler`，Fastify 原生码（`FST_ERR_*`）映射进 errors.ts 统一 `{code,message}`，错误文案表不再被绕过；② 修 `transport.ts:65 createSession` 声明 `opts.model` 但实现丢弃的漂移（以接口为准补请求体）；③ 问题 8 语义澄清+真修：`hasKeyOf` 只查 env 而 `resolveApiKey` 是 store>env——经设置页存 secrets.json 的 key 会误显"缺少 API Key"（model-catalog.ts:32-36 vs secrets/store.ts:100），状态判定改走 resolveApiKey 单点；"已启用/已就绪"语义本不含连通性，UI tooltip 注明。补测：protocol 断言"无 body 不带 content-type"；server 补"带头+空 body"的 inject 用例（现 inject 不带头，掩盖缺陷的裂缝，写进用例注释） | 真实浏览器：配对出码、测试连接返回真实结果；CLI /compact、中断、回滚、删密钥链路可用；createSession 带 model 生效；secrets key 状态不再误报；`pnpm test` 全绿 | —    |
| 10.13 | ✅ 会话流去重（applyEvent 定稿配对） | 5            | 双重复来源：① `packages/protocol/src/apply-event.ts` 定稿事件（`reasoning.ended` L333-345、`assistant.message` L284-295）用 `lastItem()` 判断"是否吸附到流式项"——真实发射序为 `reasoning.delta* → assistant.delta* → reasoning.ended → assistant.message`（run-loop.ts L253-304：thinking 先流、定稿对后置），定稿时 lastItem 必不是自己的流式项 → push 新项、原流式项（全文 textBuf）永不闭合=回答与思考各显示两份；**未闭合 reasoning 项计时器永不停（实测"578 秒"假时长——ReasoningCollapsible.tsx:35-49）**；② web `AssistantBlock.tsx` L71-73 把 `content` 内 `reasoning` 块再渲染一次（pi-gateway 定稿把 thinking 写进 content，L233），与 reducer 已生成的 reasoning UiItem 叠加=纯 durable 回放（刷新后）也固定双份（CLI 端 items.tsx L101-104 已正确跳过，对齐即可）。修法：定稿配对改"按 turnId 反向查找最近**未闭合**同类流式项"（仿既有 findLastTurn 模式加 findLastReasoning/findLastStreamingAssistant），找不到才新建（失败闭合保留，不静默丢弃）；AssistantBlock 跳过 reasoning content 块（渲染层去重，不改协议词表不改引擎 emit）；**迟到 delta（定稿后到达）不再新建 item**。已排除项（免复查）：非 StrictMode 双写（transports/context.tsx cleanup 完整、订阅恒 1）、非 SSE 重放双发（seq 水位去重）。reducer 为四端共享（ADR D22）：web/cli/mobile/miniapp 四端测试全跑（miniapp 投影快照核对，normal.jsonl 含 reasoning 块基线如实更新并说明） | 真实模型一回合：流式到定稿无双份、思考计时器会停；刷新回放无双份；`apps/web/tests/applyEvent.test.ts` 补交错序断言（reasoning 恰 1 条、assistant 恰 1 条）+ 迟到 delta 用例；四端 `pnpm test` 全绿 | —    |
| 10.14 | ✅ 设置中心导航修复            | 6            | 根因三层叠加（非退场动画——全仓 web 无 stagger/exit 动画）：① `SettingsSidebar.tsx` L23-30 返回按钮 `navigate(-1)` 逐历史回退，而设置分区互切（L43）与全部入口（Sidebar/AppShell/SettingsDialog）都是 push——逛过 N 个分区要按 N 次返回；② `AppShell.tsx:75` `transition-[grid-template-columns] duration-150` 在进出设置时让内容列持续重排；③ **`ChatView.tsx:60-83` Virtuoso 未设 `initialTopMostItemIndex`**——返回会话页从 index 0 逐行测高 + `followOutput='smooth'` 平滑滑到底=用户看到的"一项一项往前移动"的真正视觉来源。修法：返回改直达目的地（`navigate('/session/'+activeId ?? '/welcome')`）+ 分区互切改 `replace: true`；进出设置的那一帧禁用列宽过渡；Virtuoso 补 `initialTopMostItemIndex`（或首帧定位末尾）；折叠态侧栏（48px 图标态）无会话可点的盲区一并评估（挂 V2 或给最近会话直点） | 从设置任意分区一次点击回会话主界面，无逐行位移无逐页回退；浏览器后退不无限回退设置内部 | —    |
| 10.15 | ✅ web 全局焦点环中性化          | 11           | `theme.css` L25-28 全局 `:focus-visible { outline: 2px solid var(--spark-accent) }`——indigo（#4f46e5/#818cf8）且**规则在 `@layer` 之外，永远压过分层后的 `outline-none` utility**（Tailwind v4 utilities 在 layer 内），Composer textarea 的 outline-none 失效=蓝框常驻。工单 10.3 只收口了组件级 focus-within ring，漏了全局层。**前置规格拍板（晚风）**：DESIGN §13.C L87/L104 规定焦点环用 accent，与 §13.E v2.5（L431"聚焦不加高饱和 ring"）+ §12.1（禁 indigo 系）矛盾——本工单按实测验收口径（后者）执行：焦点环改 `var(--ring)` 中性色，规则移入 `@layer base` 让 utility 可覆盖；`--spark-accent` 其他职责（运行中状态点等）不动。DESIGN 版本表登记该拍板。`tests/theme-contrast.test.ts` 对比度断言复核 | 设置任意输入框/按钮：Tab 聚焦与鼠标点击均无蓝色 outline（中性色可）；`outline-none` 的元素真正无环；theme-contrast 测试通过 | —    |
| 10.16 | ✅ 切会话即时化（缓存优先）      | 5（切对话）  | `SessionPage.tsx` L105-120 effect 无条件 `setLoad('loading')` 后全量回放，即使目标会话 slice 已在 store（曾打开过）→ 先清空再 loading 白屏一下。修法：slice 已有 items 时立即渲染缓存投影，回放放后台合并（回放完成后 durable 全量覆写对齐 seq，不先 resetSlice 造成闪空）；仅 `lastSeq===0`（真正冷会话）才显示 loading 态。**与 10.14 的 Virtuoso 修复联动**（回会话页不再从 0 滑到底）。**"左右式横向切换过渡"另立**：DESIGN 无既有条款（grep 无对应规格），属新增期望且与 §12"仅微动效"总则有张力——若晚风要横向滑动，先在 DESIGN §13 补规格（位移量/时长/缓动/方向感知/reduced-motion 降级）后实现，本工单只消白屏与卡顿 | 已打开过的会话切换：右侧原位即时切换无 loading 白屏；冷会话仍显示加载态；切回后再切走不丢新事件 | 10.14（Virtuoso 联动，可并行） |
| 10.17 | ✅ CLI 启动首屏与 resume 修复    | 1/4（半）    | ① 黑屏：BootHeader 只挂在"slice 已建立且空会话"分支（app.tsx L475-478），而启动时自动激活"最近更新会话"（L112-121）——有历史会话时 emptySession 永为 false，BootHeader 永不再现；slice 只能由事件流建立，启动到 SSE 首事件之间是纯空窗（一行灰字），server 不可达时永远近乎全空。**另有三处（并行会话发现，已验证）**：BootHeader.tsx:29-36 版本号 `require('../package.json')` 相对组件目录解析到不存在的路径**恒显 0.0.0**；模型行缺"(/model 切换)"提示（DESIGN K.1 不符）；DESIGN 要求 resume 后 boot 头部重现一次，代码未实现；根 Box 固定 `height={rows}` 在 Windows Terminal resize 时错行清屏。修法：BootHeader 不依赖 slice（连接中/失败/空会话三态都渲染 boot 骨架+状态行），启动策略二选一（默认新建空会话 vs 空态判定不依赖 items 长度——执行时说明取舍）；版本号构建注入或读正确路径（禁 0.0.0 兜底）；resume 后 bootStamp 重现一次头部；resize 重订阅；listSessions 失败给显式错误屏（含重试键位）；② resume 点不进去：ResumePanel 空过滤词直接 Enter 时 InputBox `text.trim()===''` 不触发 onSubmit（InputBox.tsx L47-51）→ confirmResume 永不执行=面板选中但无反应。修法：面板激活态下 Enter 由 App 层接管（或 InputBox 支持"面板态空值提交"回调——别加布尔地狱，也别改成全局空回车都提交，主输入区会误发空消息） | 冷启动连上 server：立即见 boot 头部（含正确版本号）无黑屏；server 未开：见明确错误+重试而非空屏；/resume 列表非空时 Enter 直接恢复选中会话；cmd 与 Windows Terminal 两终端 + resize 后不错行 | —    |
| 10.18 | ✅ CLI 命令面扩容（描述符架构 + v1 基线 15） | 2/4 | 现状：本地命令仅 new/resume/stats/help + 引擎 action 仅 compact 生效；菜单里 model/mcp/skills/usage 四个 client 命令 CLI 无面板无本地分支，输入落引擎即 400 `E_COMMAND_CLIENT`；协议/server 侧能力全部就绪（`PUT /api/sessions/:id/model`、`GET /api/mcp`、`GET /api/skills`、`GET /api/routing` 均已存在，**纯前端缺接**）。**且四端各有平行硬编码命令表**（web composer-menus.ts:55 SLASH_COMMANDS、client-commands.ts CLIENT_ACTIONS、mock.ts:745 COMMANDS、cli app.tsx:271-286 if 链）——同词表五处维护是复发温床。**副产物 bug（已验证）**：slash 菜单开着时执行"选中项"而非输入文本（app.tsx:262-268）——输 `/s` 回车实跑 /skills。产出（严格协议先行 §2.5）：① `packages/protocol` 新建 commands.ts：`CommandDescriptorSchema`（strictObject）+ BUILTIN_COMMANDS 常量——name/description/kind(action\|prompt\|client)/group/surface: ('web'\|'cli'\|'mobile'\|'miniapp')[]/sessionRequired/args{placeholder,hint}/clientAction 封闭枚举（词表模式照抄本仓 keymap.ts 先例，四端共享单一来源）；api.ts CommandDto 增量加可选字段（向后兼容，勿破 mock/快照）；engine loader 改 import BUILTIN_COMMANDS（只留 .md prompt 扫描与 $ARGUMENTS 展开）；② 四端删平行表，全部由描述符+clientAction 分派 map 生成；**某端未实现该 clientAction 就不渲染该命令**（禁假状态）；③ 协议不变量单测：名字唯一 + **每条 client 命令的 clientAction 在其 surface 声明的每端都有实现映射**——防 /model 在 CLI 坏掉复发的回归网；④ CLI 实装：/model（ModelPicker 面板，store.models 数据源，确认调 setSessionModel，带参直调）/mcp（listMcpServers 只读）/skills（listSkills 只读）/usage（GET /api/routing）；修选中项覆盖逻辑（仅当输入文本等于该命令名时才用选中项）；⑤ `ERROR_COPY` 补 E_COMMAND_CLIENT 人话条目；⑥ v1 基线 15 命令（现有 5 + 本工单 4 + 补 6：/title（setTitle 已有）/fork（fork 端点已有）/checkpoint（列表已有）/rollback <id>（已有）/effort（setSessionEffort 已有）/tree（GET tree 已有））——**全部走既有端点，零新后端**；⑦ SlashMenu 分组（会话/模型/信息/帮助）；⑧ 78 命令全量判决表见 10.18a 附表 | 描述符单测（名字唯一/clientAction 全 surface 映射）；15 命令逐一可用（真实 server 冒烟）；菜单不再列出本端不可用命令；单测含 setSessionModel 路径 | 10.17 |
| 10.18a | ✅ Qwen Code 78 命令全量判决表（文档） | 2 | 对 Qwen Code 官方 78 命令（docs users/features/commands）逐条登记判决：**v1 落地 15**（10.18 ⑧）/ **Spark 已有对应物 8**（/help≈帮助面板、/mcp、/skills、/usage≈/stats、/compact、/memory≈记忆页、/permissions≈权限规则页、/theme≈外观页——经 slash 直达或已有 UI）/ **v2 挂池 16**（/clear、/context、/status、/tools、/doctor、/rewind、/restore、/branch、/export、/rename、/forget、/copy、/effort 已有、/init、/summary、/settings——部分批 2 扩容）/ **新机制项挂池 9**（/voice 语音听写、/arena 多模型竞答、/lsp、/trust、/extensions、/agents 子代理管理、/plan 计划模式、/remember+memory 管理、/goal 持续目标——详见 §8.7 V2-27~V2-35）/ **不做判决 30**（/vim、/editor、/ide、/connect、/login、/auth、/statusline、/vim 模式、/btw、/advisor、/curator、/dream、/insight、/learn、/loop、/coordinate、/review、/simplify、/workflows、/tag、/recap、/language、/log、/quit、/exit、/docs、/bug、/cd、/directory、/diff、/history——逐条写"不做"理由，照 7.9 Python worker 留档格式，避免为凑数做假实现）。本表为命令面**单一来源**，10.18 实现以此为准 | 判决表落 doc/02 本批次节尾（本附表即验收物）；每条可指认判决与理由；与 §8.7 池编号一致 | 10.18 同 PR |
| 10.19 | ✅ CLI 宽字符与输入错位修复      | 3            | 四点根因（均在 apps/cli）：① InputBox.tsx L96-99 光标按 UTF-16 code unit 切片（`slice(cursor, cursor+1)`），CJK 一字占 2 列、emoji/代理对被半个 surrogate 反显；退格 c-1、左右 ±1、插入 c+input.length 同病；② items.tsx 截断按 code unit 计数（`length > 60`）、HelpPanel.tsx:58/65/90 padEnd——与 Ink 按显示宽度的换行不一致=中文行错位换行（反例参照：ResumePanel.tsx:61、SlashMenu.tsx:37 已正确用 wrap="truncate-end"）；③ 整行无列宽截断，超过 columns 时 Ink 自动折行压在 Footer 上=输入内容与状态栏重叠；④ **IME 组字期 App 全局键劫持**（并行会话发现）：App 顶层 useInput（app.tsx:302）在候选串里见 `?` 开帮助面板（L345-348）、挂审批时把 1/2/y/n 当审批键（L428-439）——组字串被当快捷键。修法：显示宽度计算（string-width + Intl.Segmenter grapheme 数组）统一一个 displayWidth/truncateByWidth 工具（放 @spark/protocol 四端共享，新增依赖说明理由与许可证：string-width MIT）；键位分层：输入框有焦点时 InputBox 先消费、App 全局键只识别单码元输入、组字串作原子文本插入不猜键；输入行按 columns-prefixWidth 截断或改多行增高（择一）；候选窗交终端自绘（本仓无法接管）。IME 深层残余挂 V2-26。单测补中文/emoji 用例（render.test.tsx 现仅 ASCII） | 中文/emoji 输入：光标不反显半字符、不错列；中文长行截断与终端实际换行一致；组字期间不误开面板/误触审批键（用户现场走查）；新增依赖理由登记 | —    |
| 10.20 | ✅ 设置项全量落地（占位清零，三分类推进） | 9/10 | 设置中心 16 页中 6 页整体占位、常规页 15 行中 14 行占位。缺口三分类，**按性价比顺序推进**：**A 类零后端成本先清**（端点+transport 已在、纯缺接线）：① 成本上限可编辑（PUT /api/routing + RoutingUpdate.costLimitUsd + updateRouting 全在）；② "清零累计"按钮（DELETE /api/routing/usage + resetUsage 已暴露、页面文案写了"清零累计后恢复"却没接）；③ 模型页补 4 档位（fallback 链/压缩档/标题档/子代理档——RoutingDto 四字段可读写）；④ "显示思考过程/工具分组"开关（渲染层 ReasoningCollapsible/ToolGroupRow 已实现，纯缺 stores/settings.ts 字段+消费点）——**"显示待办"开关删除**：tools/builtin 仅 7 工具无 Todo 工具，不留无效开关，登记独立缺口；⑤ 自定义命令只读页（GET /api/commands 已有，形态照 McpSettingsPage）；**B 类引擎有字段缺端点**（本工单核心新增）：`GET|PUT /api/settings`（协议 DTO 在 protocol/src/api.ts 定义——§2.5 协议先行；GET 返回脱敏全量 spark.json+engine 行为配置，**绝不回 apiKey 值**；PUT 部分字段更新+zod 校验+原子写盘+重启生效字段 DTO 标注 restartRequired）——解锁：压缩阈值/最大步数/工具超时/沙箱档 bashSandbox/保留模型 I/O=compactionThreshold 语义/工具输出上限/toolOutputLimitKB/新建默认模型与默认推理档（从 localStorage 迁 models.json）；**热生效 vs 重启生效策略先写 ADR 入 ARCHITECTURE.md**（这正是 doc/02 v3.4 遗留"沙箱读写分歧留决策"未结项）经晚风确认后再实现（**ADR 已成稿：ARCHITECTURE D28 / v1.22，提案待晚风确认**）；**C 类明示去向**：desktop 特化项（托盘/终端字体/自动更新/保持运行）迁"桌面版"分区明示依赖 Electron；纯本地项（i18n 界面语言 V2-12/通知声音）接 settings store 或明示 v2 编号；MCP/技能页管理功能挂 V2-01；代理/证书挂 V2-06。**红线：每个设置项要么真落地要么明示去向（v2 编号/桌面依赖），禁"后续工单"空占位；所有写入走 Transport 禁组件直接 fetch** | 设置中心 16 页逐页走查：无占位行；A 类控件即时生效；`GET /api/settings` 响应 grep 不到 key 值；PUT 落盘且重启生效（需重启项 UI 标注"下次启动生效"）；server 单测覆盖新路由（含脱敏断言） | 10.12（测试连接修复后走查才准） |
| 10.21 | ✅ hook 读取 API（**已拍板：并入 10.20**） | 10（子项）   | user-hooks（工单 7.3）引擎已实现、spark.json `hooks` 配置存在，但无读取端点，前端 hooks 页无数据源。**路径拍板（晚风 2026-09-01）：并入 10.20 的 `GET /api/settings` 全量返回（hooks 字段同响应下发），不单独设 `GET /api/hooks`**——随 10.20 B 类落地（ADR 先经确认再实现）。验收同 10.20 hooks 行 | hooks 页真值呈现（配置的事件类型/命令清单）；编辑后写盘生效 | 10.20 |
| 10.22 | ✅ 会话流消息气泡布局（用户右/AI 左） | 5（消息形态） | **晚风澄清的形态**：期望"用户消息靠右、AI 回复靠左、一上一下错开"的聊天式布局（不是切换动画——10.16 的横向滑动已拍板本批不做）。现状：问题与回复一上一下但**都靠左**（MessageItem 左对齐单列）。产出：apps/web `MessageItem.tsx`/`AssistantBlock.tsx`——① user 消息行右对齐（max-w 限宽，`justify-end`+右圆角气泡态或右侧强调底色——按 DESIGN §13.H 既有密度，禁蓝紫渐变/毛玻璃，黑白中性 token）；② assistant 行保持左对齐全宽（阅读宽度优先，气泡化会伤代码块/表格呈现——assistant 不做窄气泡，工具块/思考块照旧全宽左）；③ CLI/移动端/小程序不改（CLI 转录式是 §13.K 既定形态；本工单只改 web）；④ DESIGN §13.H 补消息布局条款（规格先行：对齐/限宽/气泡底色 token 三点成文，版本表 +0.1）。**注意**：web 会话流是工作台形态（含工具块/审批卡/差分等重块），用户气泡仅作用于 user 消息行，不动其他块族的左锚——避免把整个会话流做成 IM 形态 | web 走查：用户消息右置、AI 回复左置、一上一下错开；工具/思考/审批块不回归；DESIGN §13.H 条款可指认；mock 快照更新如实 | 10.13（双份修复后走查才准） |
| 10.23 | ✅ CLI 首屏重排（Qwen Code 对齐） | 3（首屏形态） | 现状首屏 logo 与信息盒上下堆叠居中；参照 Qwen Code 首屏（在线源码 `packages/cli/src/ui/components/Header.tsx`，AGENTS §2.12 纪律）改判**左右分栏**：logo 列 `flexShrink=0` + 间距 + 圆角信息盒，宽度感知回退（`可用宽 ≥ logo宽+间距+最小信息盒宽` 才双栏，否则隐藏 logo、信息盒占满**不堆叠**；双栏盒宽上限 60）。信息盒模型行 `(/model 切换)` 提示与 cwd 截短改**按显示宽度门控**（复用 cli 本地 `text-width.ts` 的 displayWidth/truncateByWidth），cwd 先 tilde 化；提示行加「提示：」前缀。Footer 第 2 行补「Tab 切换提交模式」措辞（Tab 面板外真义=循环提交模式，非假状态）。**不引入** ink-gradient/statusLine 预设/rotating tip 新机制；不抄 `@ 文件路径`、`API Key |` 前缀（禁假状态）。DESIGN §13.K K.1/K.4 同步改判 v2.9 | 首屏宽屏双栏/窄屏隐 logo 两态；模型提示与 cwd 截断宽度门控；Footer Tab 措辞；render.test.tsx BootHeader 四断言覆盖 | 10.17 |

### 10.18a 附表：Qwen Code 78 命令全量判决表（命令面单一来源；v1=批次 2，v2=§8.7 池）

> 依据：Qwen Code 官方文档站 `users/features/commands`（2026-08-31 在线核对，AGENTS §2.12 纪律）。判决五档：**v1 落**（批次 2 工单 10.18，全部走既有端点零新后端）/ **已有对应物**（Spark 已有该能力，slash 直达或既有 UI）/ **v2 挂池**（能力缺口小，挂 §8.7）/ **新机制挂池**（需新机制立项，挂 §8.7）/ **不做**（写明理由，照 7.9 Python worker 留档格式——避免为凑数做假实现）。

| 判决 | 命令 | 说明/理由 |
| --- | --- | --- |
| **v1 落（14）** | /new /resume /stats /help /compact /model /mcp /skills /usage /fork /checkpoint /rollback /effort /tree | 现有 5 + 10.18 新增 4 + 补 5——端点全部既有（PUT model、GET mcp/skills/tree/checkpoints、POST fork/rollback、setSessionEffort）。**执行偏差登记（v3.44）**：判决原列 15，/title 落地时移除——核查证实并无 setTitle 端点（transport/routes 全仓 grep 无；标题为引擎自动生成），按"禁假状态"红线不造无端点命令，移入 v2 挂池（见下行） |
| **已有对应物（8）** | /permissions /memory /theme /settings /config /clear /context /status | 权限规则页/记忆页/外观页/设置中心已存在（10.20 落地后 /settings 直达）；/clear≈/new 新建；/context≈StatusBar 水位+/stats；/status≈footer+boot 头——slash 别名直达即可，无需新建机制 |
| **v2 挂池（12）** | /title /rewind /restore /branch /export /rename /delete /forget /copy /init /summary /recap | **/title（v3.44 自 v1 落移入）：无 setTitle 端点——标题引擎自动生成，待标题编辑端点立项后描述符一行即插**；rewind/restore≈checkpoint 回退 UI 化（rollback 已落，历史级回退 UI 挂池）；branch/fork 已落、/branch 为交互式分支管理挂池；export 会话导出（V2-13）；rename≈/title 别名（v2 统一命名）；delete 会话删除（**V2-23 已在池**）；forget 记忆条目删除（记忆页已有删，slash 化挂池）；copy 回复/代码块复制（部分已有复制钮，全局 /copy 挂池）；init 项目上下文文件生成（**挂 V2-27**：需文件生成工具+AGENTS 模板）；summary/recap 需模型出力（挂池，走 prompt 命令通道） |
| **新机制挂池（9）** | /voice /arena /lsp /trust /extensions /agents /plan /goal /remember | **V2-28** voice 语音听写（需音频采集+STT，桌面/移动端能力）；**V2-29** arena 多模型并行竞答（引擎跨会话并发已有底子，需对比视图）；**V2-30** lsp（LSP 客户端整条链路，大件）；**V2-31** trust 文件夹信任（需 trust store+首启判定机制）；**V2-32** extensions 扩展管理（依赖 V2-01/V2-02）；**V2-33** agents 子代理管理面板（引擎子代理已落地，缺管理 UI——可批 2 扩容）；**V2-34** plan 计划模式（读-only 模式开关，与审批档位联动，需引擎 run-loop 模式位）；**V2-35** goal 持续目标（turn 循环判定，需新机制）；remember≈memory.save 直通道（记忆工具已有，slash 直达 UI 挂池） |
| **不做（35）** | /vim /editor /ide /connect /login /auth /statusline /btw /advisor /curator /dream /insight /learn /loop /coordinate /review /simplify /workflows /tag /tasks /log /quit /exit /docs /bug /cd /directory /diff /history /language /effort-max /compress /summarize-fast /advisor-mode /arena-mode | 逐条理由：/vim Vim 输入模式（CLI 输入自有形态，无 Vim 用户基础，不做）；/editor /ide（无 IDE 集成线，Spark 定位 headless+多端，不做）；/connect /login /auth（无账号体系——AGENTS §2.9 不做多用户/登录，本地 127.0.0.1 是刻意的）；/statusline（CLI 无状态栏自定义需求，footer 双行已定 K.4）；/btw /advisor /curator /dream /insight /learn（Qwen 特有的第二意见/顾问/技能策展/auto-memory 整合/洞察/学习——与 Spark 的记忆/技能机制重叠但形态不同，等真实诉求再评估，当前不做）；/loop /coordinate /workflows /tasks（定时/多代理协调/后台任务——Spark 的自动化与子代理走既有 UI，不做 slash 形态）；/review /simplify（多代理审查/清理编辑——挂 eval 后评估，当前无对应能力不做）；/tag≈/title 已覆盖；/log（logs 已有脱敏输出，无 UI 需求）；/quit /exit（CLI Ctrl+C/Ctrl+D 已有——keymap 既有）；/docs /bug（文档站=doc/、issue 走 GitHub，无内置需求）；/cd（会话 cwd 是创建期属性，运行中切换破坏 durable 一致性，不做）；/directory（单 cwd 红线——路径硬边界是安全模型，不做多目录）；/diff（checkpoint 回滚已有差分预览，独立 /diff 无端点不做）；/history（转录即历史，/resume 面板已覆盖）；/language（i18n V2-12 后再议） |

> 计数核对：14 + 8 + 12 + 9 + 35 = 78（与官方文档 `<code>` 命令清单一致，个别别名去重；原 15+11 口径因 /title 执行偏差登记调整，见 v1 落行）；"不做"35 条里 /tag /log 等与已有对应物重叠的按主判决归档。**执行纪律**：10.18 实现以本表为准；新机制 9 条全部挂池不进 v1——先有真实用户诉求再立项（AGENTS §2.9 MVP 边界纪律）。

> 批次 2 备注：① 问题 4 的"/model 无法切换"与问题 2 的"命令太少"根因同源（client 命令无前端实现面），分别由 10.17/10.18 修复；② 问题 5"回答思考双份"（10.13）与"切对话体验"（10.16）是两个独立缺陷；③ IME 深层修复挂 V2-26；hooks 端点路径（10.21）**已拍板并入 `GET /api/settings`**（v3.43，不再待拍板）；④ 10.20 的新 API 须走"协议从 @spark/protocol 开始"纪律（DTO 在 protocol/src/api.ts 定义，两端同步）；⑤ 横向小项（createSession 丢 model 已并入 10.12 附带②；SubmitResult/SubmitOutcome 语义重复——批次 2 期间顺带清理或挂池，不单列工单）；⑥ 本批次工单表与提示词已经并行会话（千问）交叉验证，其独有发现（版本号 0.0.0/slash 选中项覆盖/Virtuoso 逐行测高/secrets-env 状态不一致/App 全局键劫持组字串）已逐条核实合入对应工单。

### 批次 2 开工提示词（5 份，按执行顺序；新会话直接粘贴）

**提示词 1（工单 10.12——transport 空 body 修复 + 附带三项）**：

```text
任务：Spark 工单 10.12——HTTP transport 空 body 修复（阶段十验收批次 2 第 1 张，最高优先）。

前置阅读：AGENTS.md（硬性约定 + 红线）、doc/02-development-plan.md 阶段十·验收批次 2 表 10.12 行、
packages/protocol/src/transport-node.ts（重点 req() 226-235 行）、apps/server/src/routes.ts 与 pairing-routes.ts 的 POST/DELETE 路由、
apps/server/src/errors.ts、packages/engine/src/model-catalog.ts（hasKeyOf）与 secrets/store.ts（resolveApiKey）、
packages/protocol/tests/ 现有 transport 测试。

背景：transport-node.ts 的 req() 无条件给所有请求加 content-type: application/json 头；无 body 的 POST/DELETE
被 Fastify 拒 400 "Body cannot be empty when content-type is set to 'application/json'"（FST_ERR_CTP_EMPTY_JSON_BODY），
路由 handler 从未进入。用户已踩到两处（配对签发 createPairCode、供应商测试连接 testModelProvider）；同根因共 11 个
调用点（interrupt/compact/rollbackCheckpoint/removeSecret/resetUsage/removeAutomation/fireAutomationWebhook/
fireAutomationManual/revokePairDevice）。

要求：
1. 修 req()：仅当 init?.body !== undefined 时才带 content-type 头。一处修复，不在各调用点打补丁。
2. server index.ts 注册 setErrorHandler：Fastify 原生码（FST_ERR_*）映射进 errors.ts 错误码表，统一 {code,message}
   返回，使协议 error-copy.ts 文案表不再被绕过。
3. 修 createSession 漂移：transport.ts:65 接口声明 opts.model 但 transport-node.ts:301-306 实现丢弃——以接口为准
   补请求体，并加断言单测。
4. 修 key 状态误报：hasKeyOf 只查 env 而 resolveApiKey 优先级 store>env——经设置页存 secrets.json 的 key 会误显
   "缺少 API Key"。model-catalog 状态判定改走 resolveApiKey 单点；"已启用/已就绪"语义（不含连通性）在 UI tooltip 注明。
5. 补测试：protocol 断言"无 body 不带 content-type、有 body 必须带"；apps/server/tests 为 POST /api/pair/code 与
   POST /api/models/:providerId/test 补"带 content-type 头 + 空 body"的 inject 用例（复现真实浏览器口径——现有 inject
   不带该头，这正是缺陷被掩盖的原因，写进用例注释）。
6. 11 个调用点逐一冒烟（起 server 后 curl 两种口径各打一遍，结果记入提交说明）。
红线：TypeScript strict 禁 any；不改 wire 类型语义；不删任何文件。
验收：真实浏览器点"添加移动设备"能出 6 位码/二维码；点"测试连接"真实发出上游请求并显示结果；CLI /compact、中断、
回滚、删密钥链路可用；secrets key 状态不再误报；pnpm test/typecheck/lint 全绿。
提交：fix(protocol+server+engine): 工单 10.12——req() 条件化 content-type + setErrorHandler + createSession 漂移与 key 状态修复。
```

**提示词 2（工单 10.13——会话流去重）**：

```text
任务：Spark 工单 10.13——回答/思考双份显示修复（applyEvent 定稿配对）。

前置阅读：AGENTS.md、doc/02 阶段十·验收批次 2 表 10.13 行、packages/engine/src/run-loop.ts（L253-304 真实发射序：
reasoning.delta* → assistant.delta* → reasoning.ended → assistant.message）、packages/protocol/src/apply-event.ts
（L284-295 assistant.message、L333-345 reasoning.ended——定稿配对当前用 lastItem() 位置判断）、
apps/web/src/features/chat/AssistantBlock.tsx（L71-73 对 content 内 reasoning 块再渲染）、apps/cli/src/components/items.tsx
（L101-104 已正确跳过，对齐参照）、apps/web/tests/applyEvent.test.ts。

要求：
1. apply-event.ts：reasoning.ended / assistant.message 的定稿配对从 lastItem() 改为"按 turnId 反向查找最近未闭合同类
   流式项"（仿既有 findLastTurn 模式加 findLastReasoning/findLastStreamingAssistant）；找到则闭合该流式项（剥离
   streaming 态），找不到再 push 新项（保留失败闭合兜底，不静默丢弃）。同时验证修复效果：未闭合 reasoning 项的
   计时器必须停（实测曾显示假"578 秒"）。对"定稿之后才到达的迟到 delta"做防护（不再新建 item）。
2. AssistantBlock.tsx：content 里的 reasoning 块跳过渲染（对齐 CLI items.tsx 口径），避免与 reducer 生成的
   reasoning UiItem 双份（这是刷新后仍双份的独立来源）。渲染层去重——不改协议词表、不改引擎 emit。
3. 单测：apps/web/tests/applyEvent.test.ts 补交错发射序用例（reasoning.delta→assistant.delta→reasoning.ended→
   assistant.message 断言 reasoning 恰 1 条、assistant 恰 1 条）；迟到 delta 用例；纯 durable 回放（含 content
   reasoning 块）无重复渲染。
4. reducer 是四端共享资产（ADR D22）：web/cli/mobile/miniapp 四端测试全跑；miniapp 投影快照核对（normal.jsonl 含
   reasoning 块，基线变化如实更新并说明）。
已排除项（免复查，别浪费时间）：非 StrictMode 双写（transports/context.tsx cleanup 完整、订阅恒 1）、非 SSE 重放双发
（seq 水位去重）。
红线：不引入"跳过事件"类吞数据逻辑；失败闭合纪律保持。
验收：起 server+web 真实模型一回合：流式→定稿无双份、思考计时器会停；F5 刷新无双份；CLI 同会话无双份；pnpm -r test/typecheck/lint 全绿。
提交：fix(protocol+web): 工单 10.13——定稿按 turn 配对流式项 + web reasoning 块去重渲染。
```

**提示词 3（工单 10.14/10.15/10.16——web 三体验修复，一张会话内顺序完成）**：

```text
任务：Spark 工单 10.14/10.15/10.16——web 设置导航、焦点环、切会话三修复（可同分支，分三个 commit）。

前置阅读：AGENTS.md、DESIGN.md §12/§13.E、doc/02 阶段十·验收批次 2 三行、apps/web/src/features/settings/SettingsSidebar.tsx
（L23-30 navigate(-1)、L43 分区互切 push）、apps/web/src/components/layout/AppShell.tsx（L75 列宽 transition-150）、
apps/web/src/features/chat/ChatView.tsx（L60-83 Virtuoso 未设 initialTopMostItemIndex）、apps/web/src/styles/theme.css
（L25-28 全局 :focus-visible 用 --spark-accent 且未分层）与 tokens.css、apps/web/src/routes/SessionPage.tsx
（L105-120 无条件 setLoad('loading')、L277-279 loading 白屏）、apps/web/tests/theme-contrast.test.ts。

要求（10.14，三层根因都要修）：① 返回按钮改直达目的地 navigate('/session/'+activeId ?? '/welcome')，分区互切改
replace: true（同层平级不堆历史）；② 进出设置的那一帧禁用 grid-template-columns 过渡；③ Virtuoso 补
initialTopMostItemIndex（或首帧定位末尾）——这是"一项一项往前移"的真正视觉来源，别只修历史栈。
要求（10.15）：theme.css 全局 :focus-visible 的 outline 颜色从 --spark-accent 改 --ring（中性），**规则移入
@layer base**（关键：规则未分层时永远压过分层后的 outline-none utility——只换颜色不修分层，textarea 的
outline-none 仍然失效）；DESIGN.md 同步拍板登记——§13.C L87/L104"焦点环用 accent"与 §13.E v2.5"聚焦不加高饱和
ring"矛盾，按后者执行，DESIGN 版本表 +0.1 并注明决策；--spark-accent 其他职责（运行中状态点等）不动；
theme-contrast.test.ts 复核过；grep 全仓确认无其它 indigo/violet 系聚焦发光；doc/02 阶段十 10.3 行按"勾选虚高"
格式追加勘误说明（10.3 只修了组件级 ring，全局层漏了）。
要求（10.16）：SessionPage 已有缓存 slice（store 里有 items）时立即渲染、回放后台完成后全量覆写（不先 resetSlice
造成闪空）；仅 lastSeq===0 冷会话才显示 loading。验收：已打开过的会话左右切换无白屏；切走再切回不丢新事件。
红线：不改协议；不删文件；三修复各带单测或可复现走查步骤；不实现"横向滑动切换"——那是新增期望，需先在 DESIGN
补规格经晚风确认（本工单只消白屏与逐行滑）。
验收：pnpm --filter web test + typecheck/lint 全绿；设置页返回/输入框聚焦/会话切换三处现场走查留用户执行。
提交：三个独立 commit（fix(web): 工单 10.14 设置导航直达返回+Virtuoso 定位 / fix(web): 工单 10.15 全局焦点环
中性化+@layer 分层+10.3 勘误 / fix(web): 工单 10.16 切会话缓存优先渲染）。
```

**提示词 4（工单 10.17/10.18/10.19——CLI 三张，一张会话内顺序完成）**：

```text
任务：Spark 工单 10.17/10.18/10.19——CLI 启动首屏、命令面扩容（描述符架构）、宽字符错位修复。

前置阅读：AGENTS.md、DESIGN.md §13.K、doc/02 阶段十·验收批次 2 三行 + 10.18a 附表（78 命令判决表——实现以此为准）、
apps/cli/src/app.tsx（L105-143 启动时序、L147-171 SSE effect、L262-268 slash 选中项覆盖、L271-291 本地命令分支、
L470-482 渲染三分支、L302 全局 useInput、L345-348/L428-439 全局键劫持）、apps/cli/src/components/{BootHeader,InputBox,
items,SlashMenu,StatsPanel,HelpPanel}.tsx、apps/cli/src/store.ts（panel 类型）、packages/protocol/src/{keymap.ts（四端
共享词表先例）、transport-node.ts、error-copy.ts、api.ts}、packages/engine/src/commands/loader.ts、
apps/web/src/features/chat/{composer-menus.ts,client-commands.ts}（待删平行表）、apps/web/src/transports/mock.ts:745、
apps/cli/tests/render.test.tsx。

要求（10.17）：① BootHeader 不依赖 slice——连接中/失败/空会话三态都渲染 boot 骨架（logo+信息盒+状态行）；启动策略
二选一（默认新建空会话 vs 空态判定不依赖 items 长度），提交说明里写清取舍；② 修版本号：BootHeader.tsx:29-36 读
../package.json 相对组件目录恒显 0.0.0——改构建注入或读正确路径，禁 0.0.0 兜底；模型行补"(/model 切换)"提示；
③ resume 后 boot 头部重现一次（DESIGN K.1 要求）；resize 重订阅（Windows Terminal resize 后不错行）；
④ listSessions 失败给显式错误屏+重试键位；⑤ resume 面板激活时 Enter 由 App 层接管（修复空过滤词 Enter 被吞——
InputBox.tsx L47-51 空文本不提交语义保持给普通输入态，别加布尔地狱）。
要求（10.18，描述符架构——严格协议先行 §2.5）：① packages/protocol 新建 commands.ts：CommandDescriptorSchema
（strictObject）+ BUILTIN_COMMANDS——name/description/kind(action|prompt|client)/group/surface('web'|'cli'|
'mobile'|'miniapp')[]/sessionRequired/args/clientAction 封闭枚举（词表模式照抄 keymap.ts 先例）；api.ts CommandDto
增量加可选字段（向后兼容勿破 mock/快照）；engine loader 改 import BUILTIN_COMMANDS（只留 .md 扫描与 $ARGUMENTS）；
② 四端删平行表（web composer-menus/client-commands、mock.ts COMMANDS、cli if 链），全部由描述符+clientAction
分派 map 生成；某端未实现该 clientAction 就不渲染该命令（禁假状态）；③ 协议不变量单测：名字唯一 + 每条 client 命令
的 clientAction 在 surface 声明的每端都有实现映射（防 /model 在 CLI 坏掉复发的回归网）；④ CLI 实装四面板：
ModelPicker（store.models，确认调 setSessionModel，/model <id> 带参直调）/McpPanel（listMcpServers 只读）/
SkillsPanel（listSkills 只读）/UsagePanel（GET /api/routing）；修 slash 选中项覆盖 bug：仅当输入文本等于该命令名时
才用选中项（现输 /s 回车实跑 /skills）；⑤ error-copy.ts 补 E_COMMAND_CLIENT 人话条目；⑥ v1 基线 15 命令（现有 5 +
新 4 + title/fork/checkpoint/rollback/effort/tree）全部走既有端点零新后端——清单以 10.18a 判决表为准，不做表外命令；
⑦ SlashMenu 分组（会话/模型/信息/帮助）。
要求（10.19）：① 显示宽度工具（string-width MIT + Intl.Segmenter grapheme）放 @spark/protocol 四端共享（CLI 不新增
直依赖，依赖理由与许可证写提交说明）；InputBox 光标/退格/左右移改显示宽度口径（修 CJK 2 列与代理对半字符反显）；
② items.tsx/HelpPanel.tsx 的 .length/padEnd 截断全部改 truncateByWidth（反例参照 ResumePanel.tsx:61、SlashMenu.tsx:37
已正确用 wrap="truncate-end"）；③ 输入行按 columns-prefixWidth 截断（或改多行增高，择一）；④ 键位分层：输入框有焦点
时 InputBox 先消费、App 全局键只识别单码元输入、组字串作原子文本插入不猜键——修复组字期 ? 开面板/1/2/y/n 触审批键
的劫持；IME 深层残余挂 V2-26 不在本工单。单测补中文/emoji 输入与 15 命令各路径用例（render.test.tsx 现仅 ASCII）。
验收：起 server+cli——启动即见 boot 头（含正确版本号）不黑屏；server 停掉见错误屏；/resume 直接 Enter 可恢复；
15 命令逐一冒烟可用；中文输入不错位；cmd 与 Windows Terminal 两终端走查；pnpm -r test/typecheck/lint 全绿。
提交：三个独立 commit（fix(cli): 工单 10.17 启动首屏/版本号/resize + resume Enter / feat(protocol+cli): 工单 10.18
命令描述符架构 + v1 基线 15 / fix(cli+protocol): 工单 10.19 显示宽度口径与键位分层）。
```

**提示词 5（工单 10.20/10.21——设置面全量落地）**：

```text
任务：Spark 工单 10.20/10.21——设置项全量落地（占位清零，A→B→C 三分类推进）。

前置阅读：AGENTS.md（协议改动从 @spark/protocol 开始）、doc/02 阶段十·验收批次 2 两行 + §5.1 配置 schema、
packages/engine/src/config.ts（spark.json/models.json/permissions.json 全量可配项）、apps/server/src/routes.ts
（现有 46 路由清单）、apps/web/src/features/settings/（settings-pages.ts 16 页、GeneralPage.tsx 15 行逐条、
UsageSettingsPage/ModelSettingsPage 各 ready 项、各占位页）、apps/web/src/stores/settings.ts、
apps/web/src/transports/mock.ts（命令数据源）。

要求（A 类零后端成本先清——端点+transport 已在纯缺接线）：
1. UsageSettingsPage 成本上限改可编辑（PUT /api/routing + updateRouting）；接"清零累计"按钮（DELETE /api/routing/usage +
   resetUsage 已暴露、页面文案写了"清零累计后恢复"却没接）。
2. 模型设置页补 4 档位：fallback 链/压缩档/标题档/子代理档（RoutingDto 四字段可读写）。
3. "显示思考过程/工具分组"两开关接 stores/settings.ts 字段+消费点（渲染层 ReasoningCollapsible/ToolGroupRow 已实现）；
   "显示待办"开关从 GeneralPage 移除并登记独立缺口——tools/builtin 仅 7 工具无 Todo 工具，不留无效开关。
4. 自定义命令只读页（GET /api/commands 已有，形态照 McpSettingsPage）；hooks 页走 GET/PUT /api/settings 的 hooks
   字段（10.21 并入推荐路径——若晚风拍板独立 GET /api/hooks 则另立，先问再动）。
要求（B 类引擎有字段缺端点——核心新增）：
5. 新增 GET|PUT /api/settings（协议 DTO 在 @spark/protocol/src/api.ts 定义——先协议后两端）：GET 返回脱敏全量
   spark.json+engine 行为配置（绝不回 apiKey 值）；PUT 部分字段更新 + zod 校验 + 原子写盘；需重启生效的字段 DTO
   标注 restartRequired。engine 侧加 config 读写函数。
6. 热生效 vs 重启生效策略先写成 ADR 追加到 ARCHITECTURE.md（哪些字段可热生效、哪些必须重启、原子写盘与并发、
   写失败回滚）——经晚风确认后再实现，不要自行发明与文档冲突的机制。这正是 doc/02 v3.4 遗留"沙箱读写分歧留决策"未结项。
7. GeneralPage 接真值：压缩阈值/最大步数/工具超时/沙箱档 bashSandbox/保留模型 I/O=compactionThreshold 语义/工具输出
   上限/新建默认模型与默认推理档（从 localStorage 迁 models.json）；需重启项 UI 标注"下次启动生效"。
要求（C 类明示去向——禁空占位）：
8. desktop 特化项（托盘/终端字体/自动更新/保持运行/集成终端 Shell）迁"桌面版"分区，明示依赖 Electron；纯本地项
   （界面语言 V2-12、通知声音）接 settings store 或明示 v2 编号；MCP/技能页管理功能挂 V2-01；代理/证书挂 V2-06；
   子智能体/插件/索引库/引导四页数据源不存在的明示 v2 去向（doc/08 编号），不放假控件。
红线：不暴露密钥值；PUT 校验失败 fail-closed 返回 400 带字段名；所有写入走 Transport 禁组件直接 fetch；不删文件。
验收：设置中心 16 页逐页走查无"后续工单"占位行；每个可操作控件真实生效（写盘+重启生效路径标注）；GET /api/settings
响应 grep 不到 key 值；server 单测覆盖新路由（含脱敏断言）；pnpm -r test/typecheck/lint 全绿；16 页走查留用户执行。
提交：feat(protocol+engine+server+web): 工单 10.20/10.21——A 类接线 + GET|PUT /api/settings（B 类）+ C 类去向明示。
```

**提示词 6（工单 10.22——会话流消息气泡布局）**：

```text
任务：Spark 工单 10.22——web 会话流消息气泡布局（用户消息靠右、AI 回复靠左、一上一下错开）。

背景：晚风 2026-09-01 澄清——期望是聊天式布局形态，不是切换动画（10.16 横向滑动已拍板本批不做）。
现状：问题与回复一上一下但都靠左（MessageItem 单列左对齐）。

前置阅读：AGENTS.md、DESIGN.md §12（黑名单）/§13.H（会话流规格）、doc/02 批次 2 表 10.22 行、
apps/web/src/features/chat/{MessageItem,AssistantBlock,ToolCard,ReasoningCollapsible}.tsx、
apps/web/src/features/chat/chat-flow-rows.ts、apps/web/tests/（既有快照基线）。

要求：
1. DESIGN §13.H 先补消息布局条款（规格先行，版本表 +0.1）：user 消息行右对齐（max-w 限宽 + 中性底色气泡态，
   键位对齐/圆角/底色 token 三点成文）；assistant 保持左对齐全宽（阅读宽度优先——气泡化会伤代码块/表格/工具块呈现）。
   视觉红线照 §12：黑白中性 token，禁蓝紫渐变、禁毛玻璃、禁 emoji 装饰。
2. web 实现：MessageItem 中 user 消息行右对齐（justify-end + 限宽），assistant/工具块/思考块/审批卡保持左锚不动
   ——会话流是工作台形态，只动 user 消息行的对齐，不改其他块族。
3. 只改 web：CLI（§13.K 转录式既定形态）、mobile、miniapp 本工单不动。
4. 快照基线更新如实（mock 会话截图基线变化在提交说明写明）。
红线：不动协议/reducer（纯渲染层）；不删文件；不引入新依赖。
验收：web 走查——用户消息右置、AI 回复左置、一上一下错开；工具/思考/审批块不回归；长代码块在 assistant 全宽呈现不窄化；
pnpm --filter web test + typecheck/lint 全绿；现场走查留用户执行。
提交：feat(web): 工单 10.22——user 消息右对齐气泡布局（DESIGN §13.H 条款先行）。
```

**阶段十六开工提示词模板（16.1–16.9，doc/08 阶段十六逐张 lift 后使用）**：

```text
任务：Spark 阶段十六工单 16.X——<机制名>。

前置阅读：AGENTS.md（十二条硬性约定）、doc/08-v2-roadmap.md 阶段十六 16.X 行（目标/开源参考/产出/验收/依赖五列即完整规格）、
doc/02 §8.7 V2-XX 行（消解对应项）、开源参考文件（按 16.X 行"开源参考"列，gh api/raw 在线访问——禁克隆，AGENTS §2.12；
复用片段保留原版权声明：qwen-code/gemini-cli Apache-2.0、opencode MIT）。
要求：按 doc/08 16.X 行逐项实现；涉及新事件类型走 .agents/skills/new-event-type 全流程（六处同步）、新工具走 new-tool
（四路径单测）；命令注册走批次 2 已落地的描述符体系（packages/protocol commands.ts——BUILTIN_COMMANDS 单一来源，
勿在端侧私加硬编码表）；配置读写走既有 GET|PUT /api/settings（勿另设端点，10.21 已拍板并入）。
完成后：测试/typecheck/lint 全绿 → conventional commits 中文提交 → push → doc/02 阶段表勾选 + 双文档版本表追加
（doc/02 与 doc/08 各一行，doc/08 该行标"已立项于 doc/02 vX.Y"）。
```

## 阶段十·收尾批次 3（源码级核查判决落地 + 质量收尾）——工单级

> 立项依据：晚风 2026-09-01 指令（"把没完成的还有检查出来的拉个工单写好文档就开始做"）+ 同日四路源码级核查（批次 2 已勾工单逐张对照代码 + 引擎铁律十项 + 质量门实测）。核查总判决：批次 2 已勾十一张全部真实落地，无虚假勾选、无空壳实现（0 any/0 ts-ignore、21 事件 reducer 单测全覆盖、doc/05 G3/G4/G5 已消解）；本批次收口核查发现的 1 项 P1 缺陷、1 项 PARTIAL、若干 P3 与两处冻结项。
> 约束（晚风拍板）：本机只跑 typecheck + lint（不跑大型测试），测试面由远端 CI 承担（.github/workflows/ci.yml：doc 检查 → typecheck → lint → test）；直接在 main 分支行动，逐单 commit+push 后盯 CI。
> 执行顺序：10.24 → 10.25 → 10.26/10.27（可并行）→ 10.28 → 10.22 → 10.29；10.30 冻结待人类五层级确认（AGENTS §2.10）。
> 注：阶段十一~十六仍按 doc/08 工单库执行，不并入本批次。

| #     | 工单                                   | 产出（根因 + 涉及包）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 验收标准                                                                            | 依赖   |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------ |
| 10.24 | ✅ hooks runner 关闭时序收口（P1，核查发现） | packages/engine——shutdown 序列无 hooks 收口步骤：在途 hooks 子进程的 close 回调晚于 logger 流关闭到达 → pino "write after end" 抛错 → 全套件并发下 `tests/user-hooks.test.ts` 偶发红（单跑恒绿；ci.yml test 步骤会被 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL 中断，掩盖后续包）。修法=`UserHookRunner` 增 disposed 标记 + `dispose()`（置位 + kill 在途子进程），warn 出口统一走 disposed 门控；engine `doShutdown` 在 logger.close 前增 hooks.dispose() 步骤；`updateSettings` 重建 runner 前先 dispose 旧实例                                                              | 远端 CI 全套件下 user-hooks.test 稳定绿；typecheck/lint 绿                          | —      |
| 10.25 | ✅ 10.18 残项：CLI 端 clientAction 全覆盖不变量（P2） | 批次 2 核查判 10.18 一项 PARTIAL："每条 client 命令的 clientAction 在 surface 声明的每端都有实现映射"仅 web 端有断言，CLI 端缺（防 /model 类复发的回归网为空）；且 `packages/protocol/tests/commands.test.ts` 头注释声称"cli: tests/render 分派表"覆盖，实际不存在（注释失准）。修法=apps/cli 新建 `client-actions.ts`（createCliActionHandlers 返回 Record<ClientAction, handler>——键穷举由 TS 编译期强制）+ `tests/client-actions.test.ts` 两条断言（映射键穷尽 ClientActionSchema.options；surface 含 cli 的 client 命令 clientAction 必有映射）；commands.test.ts 注释指向真实测试文件 | 两条断言落地；/model 类回归会被测试网拦住；typecheck/lint 绿                        | —      |
| 10.26 | ✅ 文档/注释/单测对账（P2）                  | ① 本表 10.12/10.13 补 ✅（随本批次立项 v3.48 已落）；② apps/web `GeneralPage.tsx` 头注释"语言/网络为平台缺口项（后续工单）"与行数据（v2 池 V2-12/V2-06 精确徽标）对齐；③ apps/cli `text-width.ts` 头注释"依赖理由见 package.json"指针失准（JSON 无注释位，理由本体即头注释）修正为自包含；④ apps/web `tests/settings-store.test.ts` 补 showReasoning/showToolGroups 两字段单测（10.20 A③ 落地时未随补）                                                                                                                                                                  | 勾选状态与代码事实一致；注释无失准指针；两开关有持久化往返单测                      | —      |
| 10.27 | ✅ 代码卫生（P3 清单）                       | ① apps/server/src/errors.ts 不可达死分支移除（第二个 E_CONFIG 分支永不被首个前缀匹配触达——merge 残余）；② apps/cli/src/app.tsx `rollbackTo` 的 `arg as never` 改 `ids.checkpoint(arg)`（branded id 规范构造，绕过类型即绕过校验语义）；③ apps/miniapp/src/transport/rest.ts `req()` content-type 口径对齐 transport-node（仅 body !== undefined 才带——现靠 server 宽容解析器兜底，属 10.12 同根隐患）                                                                                                                                                                | 三处修完；typecheck/lint 绿                                                         | —      |
| 10.28 | ✅ LICENSE 补齐（doc/05 G6，MIT 已拍板 2026-08-31） | 根目录 LICENSE（MIT，Copyright (c) 2026 晚风/Wanfeng1028）+ 根与全部 workspace package.json 增 `"license": "MIT"`（核查实测：全仓此前零 license 字段——没有 license 的公开仓库在法律上并非开源，阶段十一发布化硬前置）                                                                                                                                                                                                                                                                                                                                        | LICENSE 文件可指认；grep 各 manifest 均有 license 字段                              | —      |
| 10.22 | ✅ 会话流消息气泡布局（用户右/AI 左）     | 批次 2 既列未开工工单（规格唯一来源见批次 2 表 10.22 行，此处不复制）：DESIGN §13.H 先补条款（v2.10）——user 行右对齐限宽气泡（对齐 §13.J.3 移动端口径：radius 18、最大宽 80%、浅中性底 bg-accent、右下角 4px 收角、YOU 标签右置保留）；assistant/工具/思考/审批块保持左锚全宽（工作台形态不 IM 化）→ web `MessageItem.tsx` user 分支实现                                                                                                                                                                                                                              | 用户消息右置、AI 回复左置、一上一下错开；工具/思考/审批块不回归；DESIGN 条款可指认 | 10.13 ✅ |
| 10.29 | ✅ AGENTS.md 项目上下文刷新 + 收尾登记       | AGENTS v1.27：§1 项目上下文刷新为"阶段十含批次 2 与收尾批次 3 全落地"；版本表追加。doc/02 尾注"余 10.22 待开工"同步；doc/08 附录 B"feat/stage10-ui-batch1 在途"陈旧表述对齐 main 事实（随立单 doc/08 v1.3 提前落地）                                                                                                                                                                                                                                                                                                                                          | 三处文档可指认；check_doc_links.py 过                                              | 全批次 |
| 10.30 | ⏸ 冻结：死代码文件与实验残留处置          | apps/cli/src/components/StatusBar.tsx 已不被 App 渲染（仅测试引用）与 examples/spike-pi-ai/（doc/05 G7）——删除属文件删除，按 AGENTS §2.10 **冻结待晚风五层级确认**，AI 不执行；本行仅登记去向                                                                                                                                                                                                                                                                                                                                                                 | 人类明示"确认删除"后另行开单处理                                                    | —      |
| 10.31 | ✅ Nightly eval 连败溯源修复（盯 CI 发现） | gh 夜间 eval 自 2026-08-29 首跑起连败三日（同一对场景，工单 7.11 验收即未在 CI 闭环），根因均在 eval 脚本、引擎行为符合规格：① compaction——标题生成器（工单 4.4）在 turn.completed 后同走 generateOnce 通道，场景用 onceCalls[0] 位置敏感断言判压缩提示词形状（与 10.13 修复的"列表末项判断"同类病）→ 改按 COMPACTION_PROMPT 前缀 find 定位；② surface——read 路径硬边界（阶段一安全纪律）以会话 cwd 为允许根，夹具在 tmpdir 而会话用缺省 cwd 必被 E_PATH_OUTSIDE 拒 → createSession({ cwd: f.root }) 会话 cwd=夹具根                                                              | 本地 pnpm eval 4 场景全过；gh workflow run Nightly 手动触发全绿                     | —      |
| 10.32 | ✅ CLI 首屏完美还原 Qwen Code（晚风指令） | 晚风 2026-09-02 指令："完美还原 Qwen，直接复用，把字母改成 spark"——**推翻 10.23 三处"不抄"边界**（大 logo/@ 占位/静态提示）。qwen-code Apache-2.0 复用留版权声明：① BootHeader 借其 Header.tsx 布局逻辑与默认暗色主题渐变色值 `#4796E4→#847ACE→#C3677F`（横向按列插值，不引 ink-gradient 新依赖——自写 30 行同效果）；logo 升格 6 行 SPARK 大字（ANSI Regular 细线风格，Q/W/E/N 字形锚定自其 AsciiArt.ts、S/P/A/R/K 按同一笔画语法补齐）；② 信息盒四行 = `>_ Spark` bold + (v版本) / 空行 / `API Key | 模型`（鉴权方式声明——Spark 鉴权恒为 API Key，非 key 存在性断言；`（/model 切换）`宽度门控）+ cwd tilde 截短；边框 round→single（Qwen 同款）；③ 提示行定稿「提示： 试 /resume，接着上次的会话聊。」；④ 输入占位改 Qwen 同款「输入您的消息或 @ 文件路径」；⑤ DESIGN §13.K K.1/K.3 改判 v2.11 | 宽屏双栏/窄屏隐 logo 两态 render 断言过；模型真值三级回退（会话模型→目录缺省→—）断言过；typecheck/lint 绿；终端视觉走查留用户 | —      |
| 10.33 | ✅ CLI 布局：live 区高度预算（用户实测缺陷） | 晚风 2026-09-02 实测报告：发消息后界面被拉长，滑到上面看历史时**输入框被顶出屏幕**，退出时残帧乱串。根因：根布局虽有 height={rows}，但 MessagePane live 区（未定稿行）**无行数上限**——回合中 live 行数一旦超过终端剩余行数，帧高即超终端，Ink 交替帧重绘推动终端滚动，光标错位不可恢复（输入框沉底/退出乱串同根因）。修法：MessagePane 增 `maxLiveRows` 预算——超预算只渲染尾部（最新内容恒可见）+ 顶部「↑ N 行已折叠」明示（全行定稿后进 Static scrollback 可上翻）；app.tsx 计算 `liveBudget = rows − (输入框 1 + footer 2 + 断线异常行 + slash 菜单 1 页 + 错误区 2 + 审批框 6 + 折叠行 1)` 传入（面板态不渲染 MessagePane 不计） | render.test 高度预算用例过（超预算尾部保留+折叠行/不超原样/缺省不裁三态）；preview-pane.mts 实渲染验证；发多消息后输入框恒在底部、退出无乱串——终端实测留用户 | —      |
| 10.34 | ✅ Nightly performance 冷启动红灯修复（24h 出单纪律） | 2026-09-01 夜 nightly performance job 红：千事件回放 617ms > 500ms（doc/06 §2"红灯 24h 内出工单"）。本地复跑两次恒过（热态远低于阈值）——非代码劣化，是 CI 冷启动成本（fs 句柄/EventTree 首建/DTO 首装配/resume 冷路径）计入了首次请求。修法：用例加一次**不计时 warmup** 预读（resume 已在 warmup 完成），断言只测热态回放——阈值政策（2 倍抖动余量）本意即测热态吞吐，冷启动属部署成本不属回归信号 | 本地 SPARK_PERF 复跑绿；nightly 手动触发 performance job 绿 | —      |
| 10.35 | ✅ /new 新建会话清屏（Qwen clearCommand 语义对齐） | 晚风 2026-09-02 实测报告："新建会话应该新建的而不是在现有会话继续"——根因：/new（Ctrl+N）只切 store 激活会话，旧会话已写入终端 scrollback 的渲染帧不清除、UI 态（展开集合/草稿/面板/提示）不重置——视觉上"在现有会话继续"。修法对齐 qwen clearCommand：ANSI `\x1b[2J\x1b[H` 清屏归位 + store 增 `resetUi()`（expandedTools/Reasoning/Groups、notice、panel、helpTab、draftPreview、bootError 全归位）+ bootEcho 置 true（BootHeader 重现一次，echo 基准取新会话投影 lastSeq）+ /new 面板描述与命令面板入口一致；旧会话保留 /resume 可回（Qwen 同语义：JSONL 保留） | render.test /new 路径断言；桌面终端实测：/new 后整屏回欢迎首屏、旧会话 /resume 可回 | —      |
| 10.36 | ✅ 输入区与消息流 Qwen 对齐（规格级） | 依据 qwen-code UI 源码级规格调研（在线 gh api，组件级细节：Composer/BaseTextInput/UserMessage/ThinkMessage/SuggestionsDisplay/LoadingIndicator/Footer）。① 输入框改 **顶横线 + 底单线**（borderStyle single 仅 borderBottom，左右上无框——Qwen BaseTextInput 同款），前缀 `>` accent 紫（#CBA6F7）；② 用户消息 = **紫色 `> 正文`**（前缀与正文同为 accent 紫，UserMessage 同款）；③ assistant 首块 = **`◆︎ ` 紫前缀**（VS15 锁宽）+ 正文默认前景；④ 思考块 = **∴ 完成 / ∵ 进行中**（dimColor italic，`Thought for N 秒`/`Thinking…N 秒`——Qwen zh 未翻译如实回退英文）；⑤ 新增 **LoadingIndicator**（dots 8 帧 + 中文俏皮短语 + `(Ns · ↓ N tokens · esc to cancel)` secondary 尾缀）挂输入框上方（Composer 同构位置） | render.test 断言适配（紫色/前缀/思考标签）41/41；桌面终端视觉走查 | —      |
| 10.37 | ✅ Footer 与 slash 菜单 Qwen 对齐 | ① Footer 第 1 行改 **space-between 单行**：左 `→项目 git:(分支) · 模型`（truncate），右 `{n}% 上下文已用`（超 80% 转红——Qwen `{n}% context used` zh 同款）；第 2 行保留 Spark 提交模式件（[now/steer/queue] · step/工具 · Tab/? 入口）；② slash 菜单活动行改 **`> ` 紫标记列**（普通行两空格，SuggestionsDisplay 同款——弃整行反色），命令名 accent 紫、描述 gray，(n/N) 计数保留 | render.test 断言；桌面终端视觉走查 | —      |
| 10.38 | ✅ 布局模型重构：BootHeader 入 Static + 帧自然高度（截图迭代） | 晚风指令"截图看效果再调整"——实测发现体验差根源：① 有历史会话启动时 BootHeader 与历史消息全在 scrollback 顶部，帧内只有空盒+沉底输入框（中间大片空白——Spark 与 qwen 布局模型相反：qwen 的 AppHeader 恒为 Static 首项印在顶部、输入区紧跟内容，帧无固定高）；② 10.36 输入框顶横线与底边框盒宽度不一致（Yoga 收缩）致占位错位；③ 消息流无全局 marginX=2；④ 前缀列裸拼接（多行正文不对齐）；⑤ 全行 marginBottom=1 密度过稀。修法（qwen 源码同构）：**MessagePane Static items = [BootHeader 首项, ...已定稿行]**（Header 恒印一次，staticKey 作 Static 组件 React key——变化时整 Static 卸载重建 index 归零，配合 ANSI 清屏=整屏重印，/new//resume 统一走此机制）；**root 去 height={rows}**（帧自然高，输入框紧跟内容；10.33 的 live 预算保证不超屏，固定高已无必要）；InputBox 顶横线与边框盒统一 width={maxWidth}；renderRow 全行 marginX=2 + 密度规则（user/assistant/reasoning marginTop=1，tool/turn/组行 0）；ItemView user/assistant 改**前缀列 2 列 + 正文 flexGrow**（换行对齐）；models 到位前不挂面板（Static 首印不可更新——信息盒首印即真值） | render.test 41/41；桌面窗口截图逐项核对（logo 顶部/紫色消息体系/输入框贴内容/footer 右列真值/无 key 警告）；CI 绿 | —      |
| 10.39 | ✅ 上游 callId 协议透传 + 系统提示词丰富化（实测缺陷双修） | 晚风实测 stepfun 会话报 `E_BUS_INVALID_DATA: assistant.message 事件 data 校验失败`（content[].callId 不匹配 `^cal_` 前缀——上游 OpenAI 兼容返回 `call_xxx` 原样透传被 branded 闸门打死，整条消息落盘失败）。**① CallId 放宽**：不透明关联 token 语义（引擎自产 cal_<ulid>、上游原样透传 call_xxx/toolu_xxx 不重写），regex 放宽为 `^[A-Za-z0-9_-]{1,128}$`（空白/超长仍 fail-closed）——toolResult 回环 id 与上游完全一致，无需映射表。**② 系统提示词丰富化**（qwen core prompt 结构骨架，Spark 语境重写）：身份/Core Mandates（约定/库不假设/注释纪律/范围/用户工作保护/拒绝不绕过/计划先行）/软件工程工作流（理解→实现→验证→如实汇报）/CLI 沟通（动手前一句说明/GFM/用户语言/turn 内不提问）/工具指引（专用工具优先/绝对路径/并行独立调用/失败换法）/安全（删除保护/审批/路径边界/密钥）/git 段（cwd 在仓库时）。**③ AGENTS.md 向上查找**：修"会话 cwd 在仓库子目录时项目指引=none"（原只查 cwd 一层，仓库根 AGENTS.md 丢失——向上查到用户目录/盘根为止，注入注明来源路径）。 | protocol events 测试含上游 id 透传用例 29/29；engine 全量 493 过；typecheck/lint 绿；重启 CLI 实测 stepfun 工具调用与项目认知 | —      |
| 10.40 | ✅ /new 清屏补 3J（scrollback 不清导致输出插在旧消息中间） | 晚风截图实测：/new 后 SPARK logo 出现在**旧对话中间**而非顶部、旧消息残留。根因：手写清屏 `\x1b[2J\x1b[H` 缺 `\x1b[3J`——2J 只清视口、H 归位到 scrollback 内位置，后续输出（Static 重挂的 header）插在旧消息中部（qwen 用的 ansi-escapes.clearTerminal 常量含 3J）。修法：clearScreen 改 `\x1b[2J\x1b[3J\x1b[H`（视口+scrollback 全清+归位）。桌面实测 /new：整屏清空、从最顶部开始欢迎首屏 | 桌面实测 /new 后整屏从顶部开始、无旧消息残留；typecheck/测试 41/41；CI 绿 | 10.38  |
| 10.41 | ✅ 系统提示词逐段照搬 qwen + Ctrl+C 中断回合 | 晚风指令："系统提示词人家怎么写的你就怎么写！！！"——**逐段照搬 qwen-code 核心提示词**（buildDefaultBasePrompt 全部段落与条目文本：Core Mandates 十一条/Primary Workflows 软件工程迭代/Operational Guidelines 全节/Executing actions with care/Git Repository/Git as Source of Truth/Final Reminder），仅三类替换：① 身份句 Qwen Code→Spark；② 工具名映射（shell→bash、read_file→read、write_file→write、agent→task）；③ Spark 无对应工具/机制的段落整段移除（Task Management、New Applications、system-reminder/persisted-output、grep/glob、web_fetch、ask_user_question/enter_plan_mode、QWEN_SYSTEM_MD、output style、sandbox）+ 补两条 qwen 没有的（语言跟随/回合内不可提问）。版权声明留痕文件头。**Ctrl+C 中断**（10.41b）：turn 运行中首击 Ctrl+C = interrupt 当前回合（生成立即停止）+ 提示"已请求中断当前回合 · 再按一次 Ctrl+C 退出"；双击窗口内仍退出。**IME 光标限制**：qwen 的物理光标定位依赖 ink 7 useBoxMetrics/getAbsolutePosition（Spark ink 6.8 无此 API），精确组字定位挂 V2-26 待升 ink 7 一并解决 | typecheck/lint 绿；engine 36/36；桌面实测提示词生效与中断 | —      |

> 批次 3 备注：① 本批次为质量收尾，不引入新功能面；

## 阶段十·收尾批次 4（CLI Qwen 化二期：物理光标/组件化重构/汇总句式）——工单级

> 立项依据：晚风 2026-09-02 指令——"CLI 全部前端只参考 Qwen Code 远端源码，能抄就抄；先检查 CLI 所有前后端代码，能封装组件/类的就封装复用，不要一个文件堆太多代码；工单先行再执行"。对照基准=晚风提供的 Qwen Code 实机截图 8 张（权限选择列表/欢迎屏/对话流/工具汇总/思考展开/footer/上下文占用）+ 在线源码逐文件调研。
> **代码现状盘点（10.43 前置）**：app.tsx 757 行（键位处理/SSE 生命周期/会话操作/面板组装全堆一起）、items.tsx 310 行、CommandPanels.tsx 282 行；StatusBar.tsx 89 行死代码（10.30 冻结待删）。
> 执行顺序：10.42 → 10.43 → 10.44/10.45/10.46 → 实测。

| #     | 工单                                   | 产出（目标 + 涉及文件）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 验收标准                                                                     | 依赖        |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------- |
| 10.42 | ✅ 输入框物理光标定位（IME 组字窗跟随） | 晚风截图：IME 组字串"ni'hao"+候选窗画在窗口左下角（footer 外）——根因：InputBox 用软光标（inverse）从不移动物理光标，IME 组字跟随终端物理光标。修法（qwen BaseTextInput 同模式在 ink 6.8 落地）：① `useCursor()`（ink 6.8 内建，CursorPosition={x,y} 相对帧顶）+ **absolutePosition()**（沿 DOMElement.yogaNode.parent 链累加 computed left/top——qwen ink7 getAbsolutePosition 的 6.8 等价实现）；② 渲染期 setter（getter 延迟求值——Ink commit 布局完成后才读坐标）：x=盒 left+前缀宽+光标前文本宽，y=内容行帧内行号；③ active=false 未挂载时 undefined 隐藏；④ 边框修正为 qwen 形态（顶横线+底单线、**无左右竖线**——borderTop/Left/Right 显式 false） | typecheck/测试 41/41；桌面实测：IME 组字串与候选窗跟随输入框光标位置             | —           |
| 10.43 | ✅ app.tsx 组件化拆分（757 行 → 组装壳）    | **hooks 抽取**（React 惯例、依赖显式传参）：① `hooks/use-cli-keys.ts`——App 层全局键位（Ctrl+C 中断/退出、Ctrl+N/R/O、Esc、Tab、双击窗口、审批键位分层）约 300 行；② `hooks/use-session-stream.ts`——SSE 生命周期（activeSessionId 变化 → 订阅/重放/rollback 重订阅）约 70 行；③ `hooks/use-cli-actions.ts`——会话操作（newSession/confirmResume/switchSession/forkAtLast/rollbackTo/setEffort）约 130 行；④ app.tsx 剩组装与渲染 ~250 行。items.tsx 310 行同批拆：ItemView 分发留原文件，ReasoningLine/ToolLine/ToolGroupLine/TurnLine 移 `components/rows/`（qwen messages/ 目录同构） | 各 hook/文件单一职责；typecheck/lint/测试 41/41 全绿；行为零变化（纯搬移）      | —           |
| 10.44 | ✅ 工具折叠汇总句式（qwen CompactToolGroupDisplay） | 现状 Spark 组行=`终端 · 2 次`；qwen 形态=**动词句+对象列表+计数尾缀**：`✓ 读取了 package.json, pnpm-workspace.yaml 以及其他 3 个`（≤3 全列对象、>3 前 3 + `以及其他 N 个`；活动态"正在读取…"；类别动词映射：read=读取了/写入了/运行了/浏览了/派发了/记忆操作）。修 `components/rows/tool-group.tsx`：对象取各条 summarizeToolInput 首段，按类别动词组装 | render.test 用例（≤3 全列/>3 尾缀/活动态）；桌面实测形态对齐 qwen 截图            | 10.43      |
| 10.45 | ✅ footer 与输入框状态色对齐（qwen Footer/BaseTextInput） | ① footer 右列补 **token 数**：`{N.k} · {p}% 上下文已用`（qwen `200.0k Context 36.5% used` 同款，tokens=usageTotal 合计，K 格式化）；② footer 第 2 行审批/提交档配色（qwen approvalModeVisuals：主档 link 蓝、auto-accept 黄——Spark delivery 主档蓝、steer/queue 灰）；③ 输入框顶横线+底框颜色随状态：审批挂起=黄（qwen 审批模式色）、常态灰（border.default） | render.test 断言；桌面实测（挂起审批时横线变黄）                              | 10.43      |
| 10.46 | ✅ 思考块文案对齐（qwen formatDuration） | `Thought for 1 秒` → **`Thought for 1s`**（qwen formatDuration：数字+s，无"秒"）；<1s → **`Thought briefly`**；进行中 `Thinking…Ns`。同步 render.test 断言 | render.test 断言；桌面实测                                                     | —           |

| v3.71 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`） | **批次 4 前两张完成（10.42/10.43）**：10.42 物理光标（absolutePosition 爬树 + useCursor，IME 组字窗跟随输入框；边框修 qwen 无左右竖线形态）；10.43 组件化拆分（app.tsx 757→339 行；hooks/use-cli-actions 263 + use-cli-keys 227 + use-session-stream 41 + effort/constants；纯搬移行为零变化，43/43 过、lint/typecheck 绿）。10.44–10.46 待下轮执行 |
| v3.72 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`） | **批次 4 后三张完成（10.44/10.45/10.46）**：10.44 工具组行改 qwen 动词句（`✓ 运行了 ls, ls` / >3 `以及其他 N 个` / 活动态进行时+…尾缀；未知类别保计数式）；10.45 footer 右列补 contextWindow K 格式（`200.0k 上下文 · 36% 已用`）+ delivery 主档蓝 + 审批挂起输入框横线变黄；10.46 思考文案 `Thought for 1s`/`Thought briefly`/`Thinking…1s`（qwen formatDuration）。render.test 41/41 断言同步 |


## 阶段十·收尾批次 5（CLI Qwen 化三期：Markdown 渲染/行拆分/状态行）——工单级

> 立项依据：晚风"继续"指令。对照 qwen-code 实机截图：Spark CLI 模型输出的 \`**加粗**\`、\`\`code\`\` 全部原样显示星号/反引号（qwen 用 MarkdownDisplay 渲染成粗体/彩色 code）——当前最大体验差。另：10.43 承诺的 items.tsx 拆 rows/ 未落地、qwen 的状态行前缀体系（●/✓/△/✕）未对齐。
> 执行顺序：10.47 → 10.48 → 10.49。

| #     | 工单                                   | 产出（目标 + 涉及文件）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 验收标准                                                                     | 依赖        |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------- |
| 10.47 | ✅ items.tsx 行组件拆分（qwen messages/ 同构） | items.tsx（310 行）拆分：ItemView 分发留原文件；ReasoningLine/ToolLine/ToolGroupLine/TurnLine 移 \`components/rows/\`（qwen messages/ 目录同构）；markdown 渲染器独立 \`components/markdown.tsx\`（10.48） | typecheck/lint/测试全绿；行为零变化（纯搬移）                                | —           |
| 10.48 | ✅ CLI Markdown-lite 渲染（qwen MarkdownDisplay lite 版） | 新建 \`components/markdown.tsx\`（不引依赖，纯 Ink 实现 qwen MarkdownDisplay 的常用子集）：① 行内 \`code\` → code 色（蓝）；② \`**bold**\` → bold；③ \`\`# 标题\`\` → bold 行；④ \`\`\` 围栏代码块 → 缩进+mono 块（未闭合围栏流式降级为普通文本）；⑤ -/1. 列表保留缩进。assistant 回复（含流式 textBuf）经 markdown 渲染；user 消息保持纯文本（qwen UserMessage 同款） | render.test：行内 code 蓝色分段/bold/围栏块/列表用例；桌面实测模型输出渲染效果   | 10.47      |
| 10.49 | ✅ 状态行前缀体系（qwen StatusMessages 同构） | ① 启动加载 AGENTS.md 成功后消息流顶部打印 \`● 已加载项目指引：{路径}\`（qwen Read context files 行同款——路径来源 buildSystemPrompt 的向上查找结果）；② 引擎 error 事件行前缀 ✕ 红（现为纯红字）；③ notice 提示行前缀 △ 黄。前缀统一带 U+FE0E 锁宽 | render.test 断言；桌面实测                                                    | 10.47      |
| v3.73 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，“继续”指令） | **批次 5 立项（10.47–10.49：CLI Qwen 化三期）**：10.47 items.tsx 行组件拆分（rows/ 目录，qwen messages/ 同构）/ 10.48 CLI Markdown-lite 渲染（行内 code 蓝色/bold/围栏块/列表——qwen MarkdownDisplay 常用子集纯 Ink 实现，修模型输出星号原样显示的体验差）/ 10.49 状态行前缀体系（● 已加载项目指引/✕ 错误/△ 提示，U+FE0E 锁宽） |
| v3.74 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`） | **批次 5 全部完成（10.47/10.48/10.49）**：10.47 items.tsx 拆分（rows/ 目录：shared/turn/reasoning/tool——qwen messages/ 同构；items.tsx 留分发壳 + 兼容 re-export）；10.48 Markdown-lite（markdown.tsx：行内 code 蓝/bold 粗/围栏块缩进灰/流式未闭合围栏降级——模型输出 `**加粗**` 星号原样显示的体验差消除）；10.49 状态行（BootHeader `●︎ 已加载项目指引：{AGENTS.md 路径}`——engine locateProjectInstructions 同构逻辑 CLI 本地化；errorInfo ✕︎ 红/△ 黄前缀）。41/41、lint/typecheck 绿 |

## 阶段十·收尾批次 6 候选池（Qwen 化四期——按 qwen 差距优先级排期）——工单级

> 立项依据：批次 4/5 合入后对照 qwen-code 的剩余差距盘点（含晚风"没完成的写成工单和提示词"指令）。排序原则：用户可感知 > 基建。
> 执行约束沿用：本机 typecheck+lint、远端 CI 裁决测试、直接 main、逐单提交。

| #     | 工单                                   | 产出（目标 + 涉及文件）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 验收标准                                                                     | 依赖        |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------- |
| 10.50 | CLI dead-key IME 深层防御（V2-26 首步；step1 spike 脚本已备待真机录制） | **依 doc/spike-ink7.md §7 重排到 ink 7 底座**（10.56 已升级）——ink 7 原生 usePaste（bracketed paste 免逐键误拆）+ Kitty 键盘协议 + #930/#910 宽字符与增量渲染修复才是 IME/组字正解，**非手搬 qwen ink7 patch**（§5 判定该 patch 主体是鼠标选区+全屏光标，与 IME 无关）。step1 事件层探测 spike：真实终端记录中文组字期 stdin 原始序列，据产物判定升级后是否仍需 composingRef 深层防御（组字期冻结渲染窗口重算、只追加原文，解除后重算）。**[进度 step1/4]** 探测脚本已备 `apps/cli/scripts/spike-ime-stdin.mts`——`pnpm -C apps/cli exec tsx scripts/spike-ime-stdin.mts [输出文件]`（TTY raw 模式逐 data 事件落盘 hex/esc/txt 三视图 + 环境头，缺省写仓库根 _scratch/，Ctrl+C/Ctrl+D 或 EOF 结束）；待晚风真机录制 ConPTY 组字序列回传后据产物实现 step2-4 | 桌面实测：中文组字期不出现半字符/光标跳列；spike 记录入工单提交说明            | —           |
| 10.51 | ✅ Footer 第 2 行压缩至一行（qwen 单行形态） | qwen Footer 实际单行：左=状态短语（`Enter 追加到当前任务 · Ctrl+Q 排到下一轮`/`按 ? 查看快捷键`）+ 右=模式 pill。Spark 现 footer=2 行固定 → 改 1 行：左=提交模式+运行指示+`? 帮助 · /stats 明细`，右=`{n}% 已用`（第 1 行已有则并入）；liveBudget 相应 +1 行回收 | render.test Footer 断言更新；桌面实测两行变一行不丢信息                        | —           |
| 10.52 | ✅ LoadingIndicator 超时预警（上游慢链路） | 晚风实测"发消息卡顿"（stepfun 36s/88s 才 201 tokens）——上游慢时无反馈。LoadingIndicator 超 10s 追加 secondary `(已 {N}s · 上游响应中，Ctrl+C 可中断)`；同时把秒级刷新提到 500ms（spinner 帧动画可见） | 桌面实测：慢上游时指示行持续动且提示可中断                                     | —           |
| 10.53 | ✅ @ 文件路径补全（qwen useAtCompletion） | 输入 `@` 后按 cwd 做相对路径补全（目录列举走轻后端端点或 engine fs；仅补路径不含内容），复用 SlashMenu 的下拉形态（左=路径段 右=目录/文件标记）。**落地经会话作用域轻端点 GET /api/sessions/:id/fs + 协议先行 DTO**（开工提示词口径——摘要表原'协议无改动'表述以此为准修正） | 桌面实测 @ 触发补全、目录/文件区分、Enter 追加路径不关闭（qwen 目录不加尾空格） | —           |
| 10.54 | ✅ 会话标题注入 ResumePanel（qwen SessionPicker 行 2） | ResumePanel 每条 2 行：行 1=prompt 首句（现有），行 2=`{相对时间} · {n} messages · {git 分支}`（qwen SessionPicker 第二行同款；数据源 SessionDto.updatedAt/events 计数——messages 数=会话 items 数或快照新增字段，禁假状态） | 桌面实测 /resume 列表两行形态；数据全部真值                                   | —           |
| 10.55 | ✅ ink 7 升级 spike（V2-26 治本前置） | qwen 体验的底座=ink 7.0.3 + 其 patches/ink+7.0.3.patch（virtual-viewport/光标 API/redraw optimizer）。spike：分支上升 ink 7 + 跑 CLI 全量测试，记录 API 断点清单（Static/useCursor/useBoxMetrics/getAbsolutePosition 差异）与移植 patch 的可行性报告——**只调研不改 main** | 报告入 doc/（v 版本行登记）；若可行则立 10.56 升级实施单                      | —           |
| 10.56 | ✅ ink 7 升级实施（10.55 spike 判决：升） | apps/cli `ink ^6.2.0→^7.1.1` + `react ^19.1.0→^19.2.0`（对齐 peer）；断点 0（backspace 双查 key.backspace 与 key.delete、Esc 用 key.escape 已兼容——报告 §3）；收获原生修复（#930 宽字符切半 / CJK 截断 / #910 尾换行增量 / #905 staticNode / #902 useInput 崩溃）。**两独立提交**：① 最小升级（ec8bca5，CI 双绿）② §6 简化落地 2 项——absolutePosition 手搓→**measureElement**（**非** §6 原写 useBoxMetrics：核装源码证实其 left/top 父相对不可用，报告 §9.2）+ columns/rows+resize nonce→useWindowSize；**跳过** useBoxMetrics/useAnimation（源码核实证伪/回归风险）。**不引 qwen patch**（报告 §5）。步骤/风险/回退见 doc/spike-ink7.md §8，实施结果见 §9 | typecheck + test 62/62 + CI 绿（run 33791777856）；真机走查（晚风）：中文组字 / emoji 退格 / CJK 截断 / @ 补全 / resume / spinner / 物理光标 / resize 重排；独立提交便于 git revert 回退 | 10.55 |

> 批次 6 备注：① 10.55 判决「升」→ 10.56 已落地（报告 doc/spike-ink7.md v1.1 §9：最小升级 ec8bca5 + §6 简化两独立提交，CI 双绿）；10.50 依报告 §7 重排到 10.56 之后（ink 7 原生 usePaste/Kitty/#930 才是 IME 正解，非手搬 qwen patch）；② 10.51 是对批次 3"footer 双行"决策的修正（qwen 实际单行——决策记录见 v3.75）；③ 10.54 为纯 CLI 前端工单（协议零改动）；10.53 落地经会话作用域轻端点 GET /api/sessions/:id/fs + 协议先行 DTO（开工提示词已定此口径，摘要表原'协议无改动'表述以 v3.76 为准修正）。

### 批次 6 开工提示词（按执行顺序；新会话直接粘贴）

**提示词（工单 10.50——IME 深层防御 spike+实现）**：

```text
任务：Spark 工单 10.50——CLI IME 组字深层防御（批次 6 第 1 张）。

前置阅读：AGENTS.md、doc/02 批次 6 表 10.50 行、apps/cli/src/components/InputBox.tsx（现 grapheme 光标
与渲染窗口）、qwen-code 在线源码 patches/ink+7.0.3.patch 的 terminalRedrawOptimizer 段（gh api
repos/QwenLM/qwen-code/contents/patches/ink+7.0.3.patch -H "Accept: application/vnd.github.raw"，
AGENTS §2.12 禁克隆）。
要求：
1. 先 spike：写临时脚本（scripts/ 下，完成后删除走五层级确认或留作 preview 工具）在 Windows Terminal
   真实终端记录中文组字期间 stdin 收到的原始序列（data 事件逐条 console.error 到文件），识别 ConPTY
   组字标志序列的形状。
2. 依据 spike 产物实现：InputBox 检测组字态（stdin raw data 匹配标志）→ composingRef 置位期间不做
   渲染窗口重算（光标列冻结），解除后重算一次。禁猜键（10.19④口径不变）。
3. render.test 补 composing 模拟用例（伪造标志序列注入）。
4. 本机只 typecheck+lint；测试由 CI 裁决。
红线：不引新依赖；不改 wire 类型；不删文件。
提交：fix(cli): 工单 10.50——IME 组字态防御（spike 产物见提交说明）。
```

**提示词（工单 10.51–10.54 合并批——纯前端四小张）**：

```text
任务：Spark 工单 10.51–10.54（批次 6 纯 CLI 前端四张连做）。

前置阅读：AGENTS.md、doc/02 批次 6 表 10.51–10.54 各行、apps/cli/src/components/Footer.tsx、
LoadingIndicator.tsx、SlashMenu.tsx、ResumePanel.tsx、apps/cli/src/app.tsx（liveBudget 计算）。
要求（逐张执行逐张提交）：
1. 10.51 Footer 单行化：第 2 行并入第 1 行右侧（左=→项目 git:(分支)·模型·[now]·运行指示·? 帮助；
   右={n}% 已用），liveBudget 回收 1 行；render.test 断言更新。
2. 10.52 LoadingIndicator：秒刷改 500ms（spinner 动画）；>10s 追加 (已 Ns · 上游响应中 · Ctrl+C 可中断)。
3. 10.53 @ 补全：@ 触发路径补全面板（复用 SlashMenu 形态：活动行 > 紫标记；目录/文件区分标记；
   Enter 选中目录不关闭不加尾空格——qwen 口径）；数据源=GET /api/sessions/:id 所在 cwd 的列举
   （apps/server 若无目录列举端点则加 GET /api/fs?path= 轻端点——协议先行 DTO 入 protocol/src/api.ts）。
4. 10.54 ResumePanel 双行：行 2={相对时间} · {n} messages（items 计数真值；SessionDto 若无则
   GET /api/sessions 分页 events 数现算，禁假状态）。
5. 每张：typecheck+lint 绿 → conventional commits 中文 → push → 盯 CI。
红线：禁假状态（数据源必须有真值）；不引新依赖；文件删除走五层级确认。
```

**提示词（工单 10.55——ink 7 升级 spike）**：

```text
任务：Spark 工单 10.55——ink 7 升级可行性 spike（只调研不改 main）。

前置阅读：AGENTS.md、doc/02 批次 6 表 10.55 行、qwen-code 在线源码 packages/cli/package.json
（ink 版本）与 patches/ink+7.0.3.patch 全文（在线访问禁克隆）。
要求：
1. 开 spike 分支（不推 main）：pnpm 升 ink@7 → 跑 apps/cli 全量测试 + typecheck → 记录全部断点
   （Static/useCursor/useInput/measureElement/DOMElement 差异逐条）。
2. 评估 patches/ink+7.0.3.patch 移植可行性：逐 hunk 标注"可直接套用/需改写/不适用"。
3. 产出报告 doc/spike-ink7.md（版本行登记）：结论=升/不升/缓升 + 实施工单草案（若可行则列 10.56
   步骤与风险）。分支删除前报告先合 main。
红线：spike 分支不进 main；报告如实（包括"不可行"结论——那是有效结论）。
```

| v3.75 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，“完成的部分提交 push，没完成的写成工单和提示词”指令） | **批次 5 收尾登记 + 批次 6 候选池立项（10.50–10.55，含三段开工提示词）**：批次 5（10.47–10.49 行拆分/Markdown-lite/状态行）已合入 CI 绿；批次 6 立 Qwen 化四期六张——10.50 IME 深层防御 spike/10.51 Footer 单行化（修正批次 3 双行决策——qwen 实际单行）/10.52 Loading 超时预警（上游慢链路反馈）/10.53 @ 路径补全/10.54 ResumePanel 双行/10.55 ink 7 升级 spike（V2-26 治本前置，只调研不改 main）；每张附开工提示词（附录见批次 6 节） |
| v3.76 | 2026-09-02 | AI 编写：Qoder；发起：晚风（Wanfeng1028，“继续”指令） | **批次 6 工单 10.53 完成（@ 文件路径补全）+ 补登记 10.51/10.52/10.54**：10.53 落地经会话作用域轻端点 GET /api/sessions/:id/fs（协议先行 DTO FsQuery/FsEntryDto/FsListDto 入 api.ts + Transport.listFs 双实现 HttpTransport/MockTransport；服务端 requireHandle+resolveInRoot 硬边界，越界/不存在回空清单不泄露 cwd 外任何项）；CLI parseAtToken 触发 + FsMenu 下拉（目录优先/名称序/分页）+ useFsCompletion 异步拉取 + InputBox forwardRef setValue 回写（目录加 `/` 续查不关闭、文件加尾空格关闭——qwen 口径）；Enter 拦截复用 resume 同款 onSubmit 分支模型。render.test +3 describe（parseAtToken/FsMenu/setValue，62/62）。摘要表原'10.53 协议无改动'表述以开工提示词'协议先行 DTO'口径为准修正（备注③同步）。前序 10.51/10.52/10.54 已提交推送但漏更 checklist，本次补勾 ✅ |
| v3.77 | 2026-09-02 | AI 编写：Qoder；发起：晚风（Wanfeng1028，“继续”指令） | **批次 6 工单 10.55 完成（ink 7 升级 spike）+ 立 10.56 升级实施单**：判决「升」（低风险）——报告 doc/spike-ink7.md v1.0。核心证据：① Spark 用到的 ink 导出（Box/Text/render/useApp/useStdout/useInput/useCursor/Static/DOMElement/measureElement）在 7.1.1 全保留，7.0.0 唯二行为 breaking（Backspace 改报 key.backspace、Esc 不再置 key.meta）Spark 代码已防御兼容（backspace 双查、key.escape）断点 0；② Node22/React19.2 门槛已满足（cli engines>=24、解析 react 19.2.8）；③ ink 7.0.0 原生修复直击痛点（#930 宽字符切半 / CJK 截断 / #910 尾换行增量——qwen 需 patch 回填的正是这些）；④ qwen ink+7.0.3.patch 判定不需要（鼠标选区+全屏光标，Spark 无此特性）；⑤ 新 hook（useBoxMetrics/useWindowSize/useAnimation/usePaste）= 简化机会，absolutePosition 手搬（工单 10.42 自陈 ink7 API 的 6.8 回填）可删。**外溢**：10.50 IME 防御依报告 §7 重排到 10.56 之后。批次 6 余 10.50（重排）；10.51–10.55 全 ✅ |
| v3.78 | 2026-09-04 | AI 编写：Qoder；发起：晚风（Wanfeng1028，“继续”指令） | **批次 6 工单 10.56 完成（ink 7 升级实施）——批次 6 主体全落地（余 10.50 依报告 §7 重排）**：两独立提交——① 最小升级 ec8bca5（apps/cli ink ^6.2.0→^7.1.1 + react ^19.1.0→^19.2.0 + lockfile；CI run 33791777856 双绿：frozen-lockfile install + typecheck + lint + test cli 62/62 + e2e，**断点 0 经运行时得证**）；② §6 简化重构——核装 ink7 源码后**修正 §6 API 名**：InputBox absolutePosition 手搓（13 行）的原生等价是 `measureElement`（x/y 沿布局树累加祖先偏移的绝对坐标，逐行同构）**而非 useBoxMetrics**（getComputedLayout 返回父相对 left/top，用于物理光标会把 IME 组字窗画到帧顶——证伪不可用）；app.tsx columns/rows 手读 + resize nonce 监听（8 行）→ `useWindowSize`（内部同订阅 stdout resize 自动重渲）；**跳过 useAnimation**（LoadingIndicator useNow 墙钟 now 算 sec=(now-turn.startedAt)/1000，animation.time 挂载相对非墙钟，替换回归 resume/重连耗时）。净删 21 行手搓换 2 处原生 API。spike 报告追加 §9 实施结果 + v1.1；本机 cli typecheck + test 62/62 + eslint 全绿，真机走查（含物理光标/resize 重点）留待晚风 |
| v3.79 | 2026-09-04 | AI 编写：Qoder；发起：晚风（Wanfeng1028，“先备 10.50 spike 脚本给我跑”决策） | **批次 6 工单 10.50 step1——IME 组字 stdin 探测脚本已备（待真机录制）**：新增 `apps/cli/scripts/spike-ime-stdin.mts`（纯 Node 无依赖，tsx 运行；TTY raw 模式逐 stdin data 事件落盘 hex/esc/txt 三视图 + 环境头 WT_SESSION/TERM/tty，缺省写仓库根 _scratch/ime-spike-<ts>.log，Ctrl+C/Ctrl+D 或 EOF 结束；非 TTY 管道自检通过——UTF-8 多字节中文忠实捕获）。同步**修正 10.50 行描述**：依 doc/spike-ink7.md §7 从“ink 6.8 手搬 qwen terminalRedrawOptimizer”重排到 **ink 7 底座**（10.56 已升级；原生 usePaste/Kitty/#930 才是 IME 正解）。step2-4（据产物实现 composingRef 防御 + 单测）待晚风真机录制 ConPTY 组字序列回传后进行。批次 6：10.51–10.56 全 ✅，10.50 spike 工具就绪待人类录制 |

> 批次 5 备注：

> 批次 5 备注：

> 批次 5 备注：① markdown-lite 只覆盖 qwen 常用子集（qwen MarkdownDisplay 依赖 marked+highlight.js 级别的完整渲染，Spark 不引依赖）；② 代码块底色用 \`bg-gray\` 反白视终端；③ 流式 textBuf 的未闭合围栏如实按文本呈现，定稿后正常成块。

## 8.6 测试矩阵（各阶段验收的测试面；框架 vitest）> 批次 4 备注：

> 批次 4 备注：① 10.42 的 yogaNode 爬树是 ink 6.8 内部结构的等价封装（qwen ink7 已 API 化 getAbsolutePosition）——升 ink 7 时替换为官方 API；② 10.43 为纯搬移重构，行为零变化，**先重构后对齐**避免在大文件上叠加改动；③ IME 深层残余（组字中间态防插入）仍挂 V2-26；④ StatusBar.tsx 死文件仍冻结待五级确认（10.30）。

## 阶段十一：可发布（Release）——工单级
② 10.22 为批次 2 既列工单的执行，编号不另起新号；③ 10.24 修复后远端 CI 是稳定性的最终裁决（本机不跑大型测试——晚风约束），若 CI 仍偶发红再按失败日志另行开单；④ 冻结行不勾选、不计入完成口径。

## 阶段十一：可发布（Release）——工单级

> 立项依据：doc/08 阶段十一工单库 lift（2026-09-02，晚风"继续"指令——批次 3 收账后按既定顺序开下一程）。主题：把"代码完成"变成"可以发布"——验收尾巴清账 + 法律与社区基础 + 测试欠账 + npm 分发 + README 手册化。
> 约束沿用批次 3（晚风拍板）：本机只跑 typecheck+lint（不跑大型测试），测试面由远端 CI 承担；直接 main 行动，逐单 commit+push 后盯 CI。
> 执行顺序：11.1（部分已随 10.28 落地）→ 11.2 准备件 → 11.3/11.4/11.5（可并行）→ 11.6 → 11.7 → 11.8。11.2 现场执行、11.5 secrets 配置、11.7 真实 tag 发版 = 用户侧动作，AI 交准备件与说明。

| #     | 工单                                   | 产出（目标 + 涉及文件）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 验收标准                                                                     | 依赖        |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------- |
| 11.1  | ✅ LICENSE 与社区基础文件（G6）           | ✅ 部分已随批次 3/10.28 落地：LICENSE（MIT）+ 11 个 package.json license 字段 + doc/05 G6 消解注记。本工单余量：CONTRIBUTING.md（面向人类贡献者：环境要求/分支与提交纪律/工单从 §8 认领/PR 自查——引用 AGENTS/DESIGN/ARCHITECTURE 不复制）、CHANGELOG.md（Keep a Changelog 骨架 + [Unreleased] + 1.0.0 段记录 v1 五阶段与阶段六~十里程碑）、ARCHITECTURE D23 补记更新                                                                                                                                                                                                    | 两文件可指认；check_doc_links.py 过                                          | —           |
| 11.2  | ✅ 验收尾巴清账准备件（现场执行=用户）    | ① examples/e2e-smoke.sh 三场景可用性逐条核对（依赖/事件名/端口漂移只改脚本不改引擎）+ bash -n 语法检查；② doc/walkthrough-stage11.md：doc/06 §5 四幕 × 五端矩阵走查记录模板 + 《用户执行清单》（G1 三场景/Windows 安装/沙箱验证/MCP 演示/子代理演示/移动端四幕/小程序走查，逐项前置条件与预期产物）；③ 现场执行完成后 doc/05 G1 注记消解（用户侧）                                                                                                                                                                                                                          | bash -n 过；模板与清单入 doc/ 过检查器                                       | —           |
| 11.3  | ✅ PR CI 接 Playwright                    | ci.yml 增 e2e job（ubuntu + chromium 单档，与主 job 并行）：install → playwright install chromium → `pnpm --filter @spark/web e2e`（mock 四场景 + 断线两例既有用例，不改用例本身）；SPARK_E2E_BROWSER 兜底按 doc/06 v1.1 注释说明                                                                                                                                                                                                                                                                                                                                       | PR/push 上 e2e job 实跑绿                                                    | —           |
| 11.4  | ✅ nightly 性能基线第一批                 | ① server 测试：程序化预置 1000 条 durable 事件会话 → 全量回放计时断言 <500ms（注释写明 2 倍抖动余量政策，doc/06 §3）；② engine 内存用例：10 万 durable 事件回放后 RSS<512MB（CI 规格下不稳定则 markPerformance 仅 nightly 跑，doc/06 登记差异）；③ nightly.yml 增 performance job；④ doc/06 §3 表加"接入状态"标注列（第一批两项 ✅，其余登记待 11.4b）                                                                                                                                                                                                                     | 手动触发 nightly 实跑出数且绿；阈值断言对人为劣化敏感（临时调阈值验证法登记） | —           |
| 11.5  | ✅ eval --real 接 secrets                 | nightly.yml --real 步骤注入 env（SPARK_EVAL_API_KEY + 可选 SPARK_EVAL_PROVIDER/BASE_URL）；fail-soft 保持——无 secrets 仍 skip 不红（doc/07 v1.12 纪律）；doc/eval-secrets.md 用户三步配置说明（变量名/取值来源/验证方法）                                                                                                                                                                                                                                                                                                                                              | 无 secrets 运行仍绿；用户配置后 --real 出真实评分（用户侧验证）              | 用户配 secrets |
| 11.6  | ✅ npm 发包准备 + spark up                | ① packages/protocol、packages/engine：files/exports/publishConfig(access public)/repository/engines，private 移除，tsc 直出（d.ts 确认，不引 tsup——boring 原则），pack 产物不含 tests；② apps/cli：bin 字段（spark → dist/main.js）、files、Shebang 核实；③ spark up 子命令：子进程拉起 server（复用 desktop esbuild bundle 产物与 SPARK_PORT 注入，缺产物提示先 build）→ 等 healthz → 进 TUI，退出连带回收 server 子进程；④ 三包 repository/bugs/homepage 补齐；examples/evals 等内部包保持 private                                                                       | pnpm pack 三包产物清单审查无 tests/src 泄漏（记入提交说明）；npm link spark up 全流程走查（用户侧） | 11.1        |
| 11.7  | ✅ 发布流程：semver / tag / publish workflow | ① CONTRIBUTING.md 增"发版"节：protocol=semver 稳定（词表演进走 ignorable/extend）、engine=minor 内兼容内部无承诺（14.1 前过渡口径）、CLI 跟随 minor；CHANGELOG 纪律=工单完成即写 Unreleased；② .github/workflows/release.yml：push tag v* 触发 → install/build → npm publish（npm token secret 或 OIDC 二选一并注释写明）→ GitHub Release 附产物；③ 首发版本 v1.0.0（三包同版本起步，不做独立版本矩阵）                                                                                                                                                                   | 真实 tag 发版 = 用户侧（需 npm 凭据）；workflow YAML 语法可验证              | 11.1、11.6  |
| 11.8  | ✅ README 重写 + 英文版                   | ① README.md：导语改身份宣言（本地运行数据不出机器/四端同一协议/每一步可审计/反 AI 味克制界面——五张差异化牌）、新增 Quick Start（npm i -g @spark/cli → spark up → 配模型 → 首回合）、四端一览、安全模型摘要（127.0.0.1 默认/审批 fail-closed/沙箱）；"当前状态"长段收缩三行内指向 CHANGELOG；架构图与版本记录表保留；② 新增 README.en.md 内容对齐、头部互链；③ 事实锚点行（事件词表计数等被 check_doc_links.py 正则锚定的措辞）不动                                                                                                                                              | check_doc_links 过；中英事实一致自查记入提交说明；Quick Start 依赖 11.6/11.7 产物 | 11.1、11.6  |

> 备注：① 11.2 的现场执行、11.5 的 secrets 配置、11.7 的真实 tag 发版与 npm 安装验证为用户侧动作，AI 只交准备件/说明/workflow；② 首发不做独立版本矩阵（boring 原则）；③ e2e/perf job 红灯 24h 内出修复工单（doc/06 §2 纪律）。

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
| web                | **applyEvent 21 种逐一断言**（AGENTS 硬性约定 §2.8）；connection-store 断线状态机；Composer 三态渲染；选择器浅比较（流式仅命中项重渲染）                         |
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
| V2-24 | assistant 链接预览卡（正文 URL → 图标+域名+标题+打开钮卡片） | P3     | 阶段十截图评审新发现（ZCode 实测）；streamdown 渲染层扩展 |
| V2-25 | 👍👎 反馈存储（会话/回合级反馈表） | P3     | §13.H:519 既定 v2 项：引擎需反馈存储表+端点；阶段十 10.4 UI 先行置灰 |
| V2-26 | CLI IME 合成深层修复（ConPTY 中间态防插入/防御重绘） | P2     | 阶段十批次 2（10.19）新登记：v3.35 已判决合成态=终端层职责；应用层码点切片与宽度口径已修后残余的合成中间态错位归此项（需终端事件层能力，待调研 Windows Terminal/ConPTY 事件面） |
| V2-27 | /init 项目上下文文件生成（AGENTS.md 模板 + 代码库扫描） | P2     | 10.18a 判决表 v2 挂池项：需文件生成工具与模板，Qwen /init 对应。**已立项：doc/08 阶段十六 16.1**（开源参考：opencode MIT 模板可整段复用） |
| V2-28 | /voice 语音听写输入 | P3     | 10.18a 新机制项：音频采集+STT，桌面（Electron）/移动端能力，web 麦克风权限。**已立项：doc/08 阶段十六 16.6**（web getUserMedia 优先/CLI SoX 降级/OpenAI 兼容转写 API） |
| V2-29 | /arena 多模型并行竞答对比视图 | P3     | 10.18a 新机制项：引擎跨会话并发已有底子，缺"同 prompt 多模型并行+对比呈现"视图与用量归并。**已立项：doc/08 阶段十六 16.8**（git worktree 隔离+InProcess 并行，胜者应用过审批） |
| V2-30 | /lsp LSP 客户端集成 | P3     | 10.18a 新机制项：LSP 全链路（下载/连接/诊断数据源），大件；诊断信息现由 grep/read 工具覆盖。**已立项：doc/08 阶段十六 16.9**（换基座 vscode-languageserver-protocol） |
| V2-31 | /trust 文件夹信任设置 | P2     | 10.18a 新机制项：trust store + 首启信任判定。**已立项：doc/08 阶段十六 16.4**（迷你 ADR 前置） |
| V2-32 | /extensions 扩展管理 | P3     | 10.18a 新机制项：依赖 V2-01/V2-02（MCP/技能管理页与插件市场壳）。**已立项：doc/08 阶段十六 16.5**（声明式内容包不执行代码，v1 本地目录无网络安装） |
| V2-33 | /agents 子代理管理面板 | P2     | 10.18a 新机制项：引擎子代理（阶段五）已落地，缺管理 UI（预设档/运行中子代理查看）。**已立项：doc/08 阶段十六 16.2**（frontmatter 分层，最便宜可最先做） |
| V2-34 | /plan 计划模式（read-only 档位） | P2     | 10.18a 新机制项：run-loop 只读模式位 + 审批档位联动。**已立项：doc/08 阶段十六 16.3**（落在既有审批规则引擎，gemini plan.toml 优先级直接翻） |
| V2-35 | /goal 持续目标（条件满足前循环工作） | P3     | 10.18a 新机制项：turn 循环判定 + 防失控护栏。**已立项：doc/08 阶段十六 16.7**（三护栏：50 迭代上限/证据引用/token 预算） |
| V2-36 | 折叠态侧栏会话直点（工单 10.14 盲区评估） | P3     | 48px 图标态无会话可点（只能先展开）；评估结论挂 v2——图标态弹最近会话列表或 hover 浮层，涉及浮层规格先在 DESIGN 补条款 |
| V2-37 | 新建会话默认模型/默认推理档迁 models.json（工单 10.20 B 遗留） | P2 | D28 第三态：`/api/settings` 只写 spark.json；默认模型/档位迁移需与 `PUT /api/routing` 的 models.json 写路径统一（避免双写者），随路由写路径整合立项 |
| V2-38 | 「显示待办」开关（工单 10.20 拍板移除的无效开关） | P3 | 引擎 tools/builtin 无 Todo 工具，开关无消费面——工单 10.20 拍板不留无效开关；待 Todo 工具落地后再挂池立项 |

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

_方案完（v3.0）。阶段一~五已完成（Spark v1）；阶段六~十已完成合入（阶段十含批次 1/2 十四张 + 10.23 全勾，PR #10 起）；收尾批次 3（10.22 与 10.24–10.29）2026-09-01 完成合入——阶段十至此收账（10.30 死代码文件与 spike 残留冻结待人类五层级确认）；下一程 v2 阶段十一~十六（doc/08 工单库，开工时逐张 lift 进 §8 建阶段表）；v2 候选池不阻塞；每次完成按版本记录表追加记录并 push。_
