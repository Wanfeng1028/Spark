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
| v1.23 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十一开工指令） | **D23 补记**：G6 已消解（工单 10.28/11.1）——LICENSE 落地 MIT（2026-08-31 拍板），全部 workspace manifest 补 license 字段；CONTRIBUTING.md/CHANGELOG.md 随 11.1 建立，上句"倾向 MIT"定案 |
| v1.22 | 2026-09-01 | AI 编写：Qoder；发起：晚风（Wanfeng1028，批次 2 工单 10.20 B「先写 ADR 经确认再实现」） | 新增 **D28 设置读写 API 提案（待确认）**：`GET|PUT /api/settings` 热生效/重启两档策略——分类按引擎实际消费点（turn 边界注入四项热生效；构造期注入四项重启档 `restartRequired`），fail-closed 写纪律（zod 校验→原子写盘→才改内存），掩码红线（apiKey 值永不进响应）；10.21 hooks 并入同一端点（拍板见 doc/02 v3.43）；doc/02 v3.4 沙箱读写分歧结案口径=可读写归重启档。与 doc/02 v3.43 同步 |
| v1.32 | 2026-09-05 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十二开工指令） | **D14 补记（阶段十二工单 12.7）**：壳层职责扩第四件事——`/api/event` 全局直播流通知订阅（turn.completed / permission.asked → 系统通知；脱敏红线=body 只含会话标题与状态词；`~/.spark/desktop.json` 坏 JSON fail-closed 回缺省）——纯壳层，不进引擎/协议面 |
| v1.33 | 2026-09-06 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"继续"指令） | **新增 D28 LLM 出网代理 = 方案 A per-provider ProxyAgent**（阶段十二工单 12.9：pi-ai ProviderRequestOptions.fetch 调研结论支持注入→方案 A 成立；models.json provider.proxy 字段 + proxyFetchFor（undici ProxyAgent 模块级缓存）+ HTTPS_PROXY env 兜底 + 测试连接同代理；缺省直连零变化红线） |
| v1.34 | 2026-09-08 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"工单要全部都做完"指令） | **新增 D29 双层压缩 = keptFiles 结构化清单 + 超限工具输出蒸馏**（阶段十三工单 13.4，消解 doc/07 §2 Compaction 与 I/O 护栏两处“蒸馏未做”差距）：两个可选字段挂 `compaction.completed`（**词表不增**，仍 21 种）；蒸馏在压缩异步边界算一次并落 durable，投影只查表；JSONL 原文不动（append-only）；**投影层“逐字直通”的唯一例外**已论证（替换文本源自 durable 事件非凭空生成，surface 纪律双面成立）；成本上界每次压缩 8 条×500 tokens；失败闭合（蒸馏逐条降级为原文 + 结构化 warn）。被否备选：蒸馏落盘替换原文（违反 append-only）/ keptFiles 独立事件（词表膨胀）。**编号注记**：本 ADR 占 D29（顺延现表末张），doc/08 §5C 阶段十八 18.1 原预称的 D29 顺延为 D30；ADR 表现存**两张 D28** 的重号缺陷仍待人类判决（登记于 doc/02 v3.93，本单不擅改历史行）。与 doc/02 v3.98、doc/07 v1.13、doc/08 v1.14 同步 |
| v1.35 | 2026-09-08 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | **D17 补记（阶段十三工单 13.5）：子代理预设档 agent presets**——task input 增 `preset?` 指 `~/.spark/agents/<name>.json`（D18 同哲学，schema 单一来源入 protocol）；四项可覆盖（模型/工具面/system 附加段/缺省标题）与两层优先级；**工具面收窄不新建拦截机制**（管线 hiddenTools 管广告面 + 会话级 deny 规则管拦截，后者走既有权限门得 E_PERMISSION 与审计归因）；已知边界（action 粒度、预设不存在 E_CONFIG 人话、逐档失败闭合、未传 preset 逐字节不变）；只读面 GET /api/agents + 设置中心子智能体页转 ready，管理面板归 16.2。与 doc/02 v4.0、doc/08 v1.15 同步 |
| v1.36 | 2026-09-08 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | **§9.6 硬检查表："未引用导出/依赖"行由"knip 或 depcheck"（待接）标为 ✅ 已接入**（工单 14.1 第二批）：根 `knip.jsonc` + 根脚本 `pnpm knip` + ci.yml 在 lint 后**独立一步**（不并进 `pnpm lint`：报告形状与失败语义不同，混在一起会让 eslint 红灯被 knip 噪声掩盖；同为硬门）。首批纳入 files/dependencies/devDependencies/unlisted/binaries/duplicates 六类且零发现；exports/types 53 项已逐组裁决、代码处置归第三批（避免"报告已知但长期红灯"）；死代码与 spike 残留 7 项按 AGENTS §2.10 **冻结 ignore 不删**（ignore 不等于判决保留，新登记四处候选见 doc/02 10.30 行）。完整裁决表：doc/02 §4.6.3。与 doc/02 v4.7、AGENTS v1.32、doc/06 v1.7、doc/08 v1.21 同批 |
| v1.37 | 2026-09-09 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | **§9.6 "未引用导出/依赖"行更新为已清零**（工单 14.1 第三批）：knip 的 `include` 已加回 exports/types 且 `pnpm knip` 零发现（41 项处置：29 去 export / 8 属再导出行 / 4 必须保留 export / copy-in 组件面 13 经 ignoreIssues 留）。**本批暴露并封住一个隐形洞**：把符号降为私有时，若它出现在同文件已导出接口的字段类型位置（Budget/ProviderApiKind/SkillHookDef/GrepMatch 四例），`tsc --noEmit` 与全部测试都不报错，只有 declaration 发射（`tsconfig.build.json`）会报 TS4033——而 ci.yml 原本不跑 build，只会在 release/desktop 打包时炸。已给 ci.yml 补末位 `pnpm -r build`（放最后：先收齐其余信号）。另一教训入档：清扫描类报告必须在入口修好后重跑（第二批补 Taro entry 使清单由 53 变 41，拿旧快照动手会误删活代码）。与 doc/02 v4.8、AGENTS v1.33、doc/06 v1.8、doc/08 v1.22 同批 |
| v1.38 | 2026-09-09 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | **新增 D30（SDK 包形态 = 薄装配层 + 双子入口，engine 为可选 peer）与 D31（双通道 parity = 同一 Transport 合同 + 同一参数化契约套件 + 不支持项显式 E_UNSUPPORTED）**——doc/08 §4 展望定的四个 ADR 级决策中，稳定性分级已由 14.1 的 doc/02 §4.6 承担、跳语言归 15.2，本批补剩下两张（工单 14.4 要求 1：先裁决依赖方向）。D30 列三个候选与被否理由（protocol 当 SDK = 把装配逻辑放进合同面；engine 侧适配器 = 职责倒挂且依赖面污染 HTTP 客户端）；D31 五条结论（合同单一来源 / 同套件跑两遍 / E_UNSUPPORTED 禁假实现 / **DTO 装配下沉 protocol 不拷第三份** / 审批同一路径），背景里直接引了 14.2 第二批刚抓到的 204 空 body 缺陷作为"为何必须机器对照"的实证。§6 模块速览补 `packages/sdk` 行（职责/不许做）。编号注记：D30/D31 顺延现表末张 D29，doc/08 阶段十八 18.1 预称的 D30 顺延为 **D32**；两张 D28 重号仍待人类判决。与 doc/02 v4.19（§4.7 逐方法映射表）、doc/08 v1.28 同批 |
| v1.39 | 2026-09-09 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | **D31 结论 4 的落点修正（工单 14.4 实现批发现）**：原文写"DTO 装配纯函数下沉 protocol"，但 protocol 的硬约束是**零依赖 engine**（AGENTS §1.1）而 `sessionMetaDtoOf`/`sessionDtoOf`/`sessionTreeToDto` 要读 engine 的 `SessionMeta`/`SessionTreeInfo` 形状——放 protocol 会倒转依赖；改为落 **engine 公共面**（engine 本就是 DTO 产地：`listModels(): ModelsDto`、`getSettings(): SettingsDto`、`listCommands(): CommandDto[]`）。后果段同步：engine 值导出 **13 → 16**（白名单不变量网与 doc/02 §4.6.2 裁决表同批更新）；server 的 `shared.ts` 改为转发（`toDto` 只补 status、`treeToDto` 直接 re-export），**删掉了本地的 labelOf/树映射拷贝**。教训：ADR 写"下沉到某个包"时必须先核该包的依赖约束——本次是设计批没料到、实现批才撞上（已当场改 ADR 而不 silently 偏离）。与 doc/02 v4.20、doc/08 v1.29、AGENTS v1.36 同批 |
| v1.40 | 2026-09-10 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | §2 抽象表**事件模型行 21 → 22 种**（工单 16.3 /plan 计划模式新增 `session.mode.changed`：durable、非 live、非 surface，故三属性的编译期联合不变）。设计口径值得记：**会话模式与既有 `plan` 权限档是同一件事的两个面**（mode = 可回放的 durable 可见状态，plan 档 = 审批规则引擎的 enforcement 层），切 mode 就是切档——**不另建状态机**（与本表"审批策略引擎"行的规则单一来源口径一致）；同时激活了一直空着的 `PRESET_RULES.plan`（gemini-cli plan.toml 优先级规则翻译成本仓 findLast 语义：兜底 DENY → 只读 ALLOW → 模式转换 ASK）。与 doc/02 v4.32、AGENTS v1.41、README v1.35、doc/08 v1.34 同批 |
| v1.41 | 2026-09-10 | AI 编写：Qoder；发起与决策：晚风（Wanfeng1028，2026-09-05 拍板"胶囊控件 + 分层卡 + 浅灰底输入"） | **新增 D32 web 观感 = 胶囊控件 + 分层大圆角卡（阶段十八工单 18.1 规格先行，纯文档零代码）**：作废旧圆角封顶（6/8/12px 三档），改立**圆角档位封闭集**（胶囊 full / 8px 小件 / 12px 分组卡与弹层 / 16px 大信息卡 / 18px 会话流 user 气泡——五档之外一律违规，唯一来源 DESIGN §13.B）；输入区浅灰底 `--secondary`/`--muted` 系 + 焦点态仍是 2px 中性环；**§12 黑名单改口径不改 grep 词**（`rounded-2xl`/`rounded-3xl` 照旧扫，命中后按档位判：16px 放行、24px 违规），§12.4 禁止项改述为"脱离 §13.B 登记档位的大圆角"。**立项理由的两条证据**：用户拍板 + 仓内已是既成事实（移动端 §13.J 白卡 radius 16 与黑胶囊 CTA、会话流 §13.H user 气泡 radius 18 均为晚风实测拍板），旧封顶只让 web 桌面端与这两处口径分裂。**不变项全清单**写进 ADR：密度 13px 体系 / 会话流转录形态 / 禁渐变·阴影·毛玻璃 / mono 纪律 / 中性焦点环 / 单一 accent。DESIGN v2.14 同步（九处修订 + 两条 10.22 遗留漂移一并清）；AGENTS.md 不动（视觉规则唯一来源在 DESIGN）。ADR 编号两次顺延（原预称 D29→D30→**D32**，D29/D30/D31 已被 13.4/14.3/14.4 占用）；两张 D28 重号仍待人类判决，本单不擅改历史行 |
| v1.42 | 2026-09-11 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"工单要全部做完"指令） | **新增 D33 /goal 持续目标循环（工单 16.7）**：run-loop 增 goal 端口（turn 收尾后旁路 LLM judge 判定，不进主上下文），未满足 → 合成续跑输入（如实标注 [goal]，走正常审批链——红线：续跑不绕审批）；三护栏数值在迷你 ADR 定档（迭代上限 50 = qwen 同值 / 每目标 token 预算 200k / judge 超时 25s）。事件词表 22 → **26 种**（goal.set/updated/completed/paused，全 durable 非 surface）；§2 事件模型行同步。与 doc/02 v4.42、AGENTS v1.42、README v1.36、doc/08 v1.41 同批 |

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
| **事件模型**   | 26 种可辨识联合 + merge-extensible 词表；信封 `{id,type,sessionId,seq,time,data}`；durable（落盘可回放计 seq）/ live（delta 仅内存）/ surface（进模型历史）三属性编译期区分    | opencode durable/live + dsh surface                            |
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

> **2026-09-05 补记（阶段十二工单 12.7）**：壳层职责扩第四件事——对 `/api/event` 全局直播流的通知订阅（turn.completed / permission.asked → 系统通知，body 只含会话标题与状态词的脱敏红线；配置 `~/.spark/desktop.json` 坏 JSON fail-closed 回缺省）。仍是纯壳层，不进引擎/协议面。

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

**补记（2026-09-08，阶段十三工单 13.5 触发）**：**预设档（agent presets）**——task 工具 input 增 `preset?: string`，指向 `~/.spark/agents/<name>.json` 声明式文件（D18 同哲学：数据不是程序；schema 单一来源 = protocol `AgentPresetSchema`，文件与 `GET /api/agents` 的 DTO 共用一份）。四项可覆盖：模型（优先级：显式入参 > 预设 model > subagentModel 路由档）、工具面、system 附加段（拼在基座之后，只作用于该子会话）、缺省标题（入参 > 预设 title > '子代理'）。**工具面收窄不新建拦截机制**：预设的 allow/deny 是工具名 pattern（**复用审批规则的通配语义**——`*` 单段 / `**` 跨段，deny 胜出），派生成两件事：① 管线 `hiddenTools` 使被排除工具不进广告面（模型看不到，同"deny 工具不广告"纪律）；② 会话级 deny 规则（`addSessionRules`，与 always 写入同层、findLast 下优先于用户/项目层）使模型仍调用时走**既有权限门** → `E_PERMISSION` 且审计流归因 `rule:session`。已知边界：deny 规则是 **action 粒度**（write/edit 同为 fs.write 会一并收窄），工具级精确收窄另立工单；预设不存在 → `E_CONFIG` 人话并列出可用档名（不静默回退）；装载逐档失败闭合（坏 JSON/名字非法/形状非法 warn 跳过，不阻塞启动）。**未传 preset 行为逐字节不变**；单层限制与父中断级联语义不变。只读面：`GET /api/agents` + 设置中心「子智能体」页（placeholder → ready）；增删改的管理面板属工单 16.2（/agents）。

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
**补记（2026-09-01，工单 10.28/11.1）**：G6 已消解——根目录 LICENSE 落地为 **MIT**（2026-08-31 晚风拍板），全部 workspace package.json 补 `"license": "MIT"`；CONTRIBUTING.md 与 CHANGELOG.md 随 11.1 建立（发版纪律见 11.7）。上句"倾向 MIT"就此定案。

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


### D28 LLM 出网代理 = 方案 A per-provider ProxyAgent（2026-09-06，阶段十二工单 12.9）

**调研结论**：pi-ai `ProviderRequestOptions.fetch?: FetchFunction` 原生支持 per-request fetch 注入（各 provider adapter 统一走该面）——**方案 A 成立**，无需方案 B（全局 setGlobalDispatcher 兜底）。

**落地**：models.json provider 条目增 `proxy`（http/https URL，zod 校验）→ `proxy-fetch.ts proxyFetchFor`：undici `ProxyAgent` 构造 per-provider fetch（模块级缓存复用连接池）注入 pi-ai `options.fetch`；测试连接（6.5）同代理。env 兜底：无显式 proxy 时回退 `HTTPS_PROXY`/`https_proxy`。两者皆无 → 不注入，缺省 fetch 直连零变化（红线）。mitm 代理实流验证=用户侧。

### D28 设置读写 API = GET|PUT /api/settings，热生效/重启两档策略（2026-09-01，阶段十工单 10.20 B；晚风已确认执行）

背景：设置中心的引擎行为类设置（压缩阈值/最大步数/工具超时/沙箱档/工具输出上限等）在 spark.json 有字段、无端点——doc/02 v3.4 遗留「沙箱读写分歧留决策」未结项；工单 10.20 B 新增 `GET|PUT /api/settings` 解锁；10.21 hooks 拍板并入同一端点的 `hooks` 字段（doc/02 v3.43），不单设 `GET /api/hooks`。
候选：① 全部字段热生效——需把构造期注入的子系统（ToolExecutor/PermissionService/沙箱装配）重构为配置活引用，改动面大、收益仅四个低频字段；② 全部重启生效——压缩阈值/最大步数这类调参场景每次重启，体验差；③ **按引擎实际消费点分两档**——分类依据是代码事实而非期望。
结论：
1. **分类**（以 engine 实际消费点为准）：**热生效**（写盘+改内存后下一 turn 生效）= `maxStepsPerTurn`/`maxToolParallel`/`compactionThreshold`/`progressThrottleMs`/`checkpoints`——五者均在 turn 边界注入（引擎按 turn 创建 RunLoop 时读 `config.spark.engine.*`）；**重启生效**（DTO 标 `restartRequired`，UI 注「下次启动生效」）= `toolTimeoutMs`/`toolOutputLimitKB`/`permissionTimeoutMs`/`bashSandbox`——四者构造期注入 ToolExecutor/PermissionService/沙箱装配（engine.ts L442-496），运行期改值需子系统重构不值得；`server.host`/`port` 为 listen 绑定级，天然重启档。模型路由（fallback 链/压缩/标题/子代理档/成本上限）已有 `PUT /api/routing` 热通道不重复建设；新建会话默认模型/默认推理档迁 models.json 属「下一新建会话生效」第三态，DTO 如实标注。
2. **写纪律（fail-closed）**：PUT 部分字段 → zod strictObject 校验（失败 400 `E_VALIDATION` 带字段名）→ 原子写盘（tmp+rename，secrets.json 同纪律）→ 写盘成功后才改引擎内存配置；写盘失败如实报错、内存不动（不留内存/磁盘不一致态）。
3. **并发口径**：本地单进程单实例（桌面壳 sidecar 与手工 server 皆单进程），Node 事件循环串行 PUT 处理，不引入文件锁——与 SessionStore 单写者纪律同据。
4. **掩码红线**：GET 响应绝不回 apiKey 值——models.json providers 只回 `apiKeyEnv`/`baseUrl`（listModels 掩码纪律延续）；secrets.json 值永不进响应；`hooks` 字段按 spark.json 原样返回（用户本地命令行配置，本身不含密钥值）。
后果（晚风已确认，实施中）：protocol 增 `SettingsDto`/`SettingsUpdate` + Transport 两方法（协议先行，AGENTS §2.5）；engine config.ts 增字段级读写函数；server 两路由（单测含脱敏断言）；web 常规页 B 类行接线（重启档标注）；v3.4 沙箱分歧结案=可读写、归重启档。事件词表不变。

### D29 双层压缩 = keptFiles 结构化清单 + 超限工具输出蒸馏（2026-09-08，阶段十三工单 13.4）

背景：doc/07 §2 的 Compaction 与 I/O 护栏两处差距行指向同一件事——Gemini CLI 的压缩双层（toolDistillationService 输出蒸馏位）我们只有单层摘要；长会话里超大工具输出（读大文件、bash 长日志）在压缩后仍以原文形态占着保留尾部，摘要省下的预算被它们吃回去。工单 13.4 要求补两层，且**不改事件词表**（21 种是 CI 正则锚定的事实）。
候选：① 蒸馏结果落盘替换 JSONL 原文——违反 append-only 与可回放/可审计（回滚与会话分享会看到被改写过的历史），否决；② keptFiles 注入为独立事件（如 compaction.kept_files）——词表膨胀，且与锚点事件天然同生命周期（同一次压缩产生、同时失效），否决；③ **两个可选字段挂 compaction.completed + 蒸馏在压缩时算一次**——词表不增、durable 记录模型可见面、投影层只查表，采纳。
结论：
1. **第一层 keptFiles**：压缩提示词尾部要求输出一行 `<!-- kept-files: ["path"...] -->`；解析后从摘要剥离并进事件，投影作摘要消息的附加行注入。fail-soft：标记缺失 = 无清单；标记坏 = 剥离 + 结构化 warn（压缩不因可选增强而失败）。
2. **第二层 distilled**：锚点（含）之后 `assistant.message` 里超 4KB 的 `toolResult` 输出（工具输出经 run-loop 以 toolResult 项回填进 assistant.message——那才是模型可见面，tool.completed 只是同源日志），逐条走 compactionModel 辅助通道蒸馏（maxTokens 500，单次压缩上限 8 条成本护栏），`callId → 要点` 映射进事件；投影将命中项的输出换为要点（前缀如实标注“蒸馏要点，完整输出见会话记录”；callId/isError 不变）。**JSONL 原文不动**——蒸馏只影响投影。
3. **蒸馏时机在压缩（异步边界）而非投影（同步高频）**：`Projector.modelContext()` 每 step 调一次，蒸馏需 LLM 往返——放压缩算一次、结果落 durable，后续投影只查表（无重复成本、可回放、可审计）。
4. **投影层“逐字直通”的唯一例外**：§5.8.3 第 5 步禁止投影层二次加工（dsh framing is caller-owned）；蒸馏替换不算自创加工——替换文本本身就存在 `compaction.completed` 这个 durable 事件里，而非投影层凭空生成；surface 纪律（模型可见必被记录）双面成立。
5. **失败闭合**：单条蒸馏失败 → 结构化 warn `compaction.distill.failed` + 不入表 = 降级为原文（pipeline 32KB 限界已生效），不推翻压缩；坏标记 → warn `compaction.kept_files.invalid`。蒸馏提示词 `DISTILL_PROMPT` **未纳入工单 13.3 的三键可配面**（要可配另立工单，doc/02 §5.11 可配性表已注明）。
后果：protocol `compaction.completed` 增 `keptFiles?: string[]` 与 `distilled?: Record<CallId, string>` 两个**可选**字段（旧磁盘行与旧 wire 帧仍合法，round-trip 单测已钉）；词表计数不变（21 种）；engine compaction.ts 增 parseKeptFiles / distillKeptOutputs 与 logger 告警出口，projector.ts 增 applyDistillation 与摘要附加行；成本上界 = 每次压缩最多 8 次额外 generateOnce（各 500 tokens 上限）；四端 UI 零改动（两字段不进展示面；若未来要展示“本次压缩蒸馏 N 条”属另立工单）。
编号注记：本 ADR 占用 **D29**（顺延现表末张）；doc/08 §5C 阶段十八 18.1 原预称的 D29 顺延为 **D30**。**已知缺陷待人类判决**：ADR 表现存两张 D28（LLM 出网代理 12.9 / 设置读写 API 10.20 B），登记于 doc/02 v3.93，本单不擅改历史行。

### D30 SDK 包形态 = 薄装配层 + 双子入口（HTTP / InProcess），engine 为可选 peer（2026-09-09，阶段十四工单 14.3/14.4）

背景：doc/08 §4 展望定了四个 ADR 级方向（包形态 / 稳定性分级 / 双通道 parity / 跳语言），要求落地时各补正式 ADR。稳定性分级已由 14.1 的 doc/02 §4.6 承担（不另立 ADR），跳语言归 15.2；本张定**包形态**，D31 定**双通道 parity 机制**。
候选：① protocol 直接当 SDK（不新增包）——protocol 是四端共享核且零运行时依赖（只 zod），把"装配 + 便利分组"塞进去会让它承担 L2 职责，且 14.1 已把它定为"全包即合同"——再放实现细节等于把装配逻辑放进合同面，否决；② engine 侧提供 Transport 适配器（`createInProcessTransport(engine)` 住 engine）——engine 的公共面刚在 14.1 冻结（13 个值导出 + 白名单不变量网），加客户端适配器会让"被嵌入的引擎"知道 L2 client 的形状（职责倒挂），且 engine 的依赖面（pi-ai/playwright-core/MCP SDK）会跟着适配器进入任何只想要 HTTP 客户端的消费者，否决；③ **新增薄 `@spark/sdk`，两个子入口**：`.`（HTTP，零 engine 依赖）与 `./inprocess`（engine 为 **optional peerDependency**），采纳。
结论：
1. `@spark/sdk` 只承载"装配 + 便利分组 + 通道适配"，**零业务逻辑**：连接管理/退避重连/SSE 续播与 seq 去重/错误体映射/鉴权双口径仍在 protocol 的 transport-node（ADR D22），引擎语义在 engine。
2. 主入口 `.` = `createClient`（HTTP），依赖只 protocol；子入口 `./inprocess` = `createInProcessClient(engine)`，engine 声明为 **optional peerDependency**（宿主已装 engine 才可用；本仓测试靠 devDependencies），**浏览器端永不静态牵连 engine**。
3. 便利分组（sessions/events/approvals）**两通道共用同一形状**，通道差异只在 transport 实现——这是 D31 parity 的结构前提。
4. 类型单一来源仍是 protocol（sdk 不 re-export、不新定义 wire 类型）；sdk 的对外合同 = 两个工厂函数签名与 `SparkClient` 形状（CONTRIBUTING 四包版本策略表：semver 稳定、便利分组只增不破）。
后果：web/cli 的装配点已迁到 `.`（14.3，行为零变化，e2e 七例已验）；`spark -p`（12.3）将改走 `./inprocess`（14.4 要求 4，消掉直连 Engine 的重复装配）；发布面 = 四包（release.yml 已含 sdk 构建）；knip、契约生成器、engine 公共面白名单三张网均覆盖新包。实现状态：`.` 已落地（14.3）；`./inprocess` 随 14.4 实现批落地（本张先定形态）。

### D31 双通道 parity = 同一 Transport 合同 + 同一参数化契约套件 + 不支持项显式 E_UNSUPPORTED（2026-09-09，阶段十四工单 14.4）

背景：L2 只有一个 client 实现、两个 transport（HTTP 连远程 server、InProcess 直连本地 Engine；opencode sdk-next 验证过的先例，doc/02 §9 已登记）。风险是两条通道行为漂移——14.2 第二批刚用契约套件抓到一个真实缺陷（`HttpTransport.req` 对 2xx 无条件 `res.json()`，而 DELETE 会话回 204 空 body，web 侧栏的"删除会话"自 12.4 起一直是坏的；mock 走查与 server 路由测试两侧各自绿、合起来才坏），证明"同一合同的两份实现"必须有机器对照。
候选：① 两通道各写各的测试——正是漂移的温床（上面那个缺陷就是这样活了两个阶段），否决；② InProcess 内部起一个真 server 再走 HTTP——那就不是进程内通道了（也丢掉嵌入场景的零端口/零序列化特性），否决；③ **同一参数化契约套件对两通道各实例化一遍 + 不支持项显式报错**，采纳。
结论：
1. **合同单一来源**：两通道都实现 protocol 的 `Transport` 接口（逐方法一致）。事件流语义以 durable/seq 为准：InProcess 的 `onEvent` = `engine.subscribe` 直通（同一批信封、同一 seq 语义，不经序列化）；HTTP 的 = SSE（`since=seq` 续播 + 去重）。
2. **同一套件跑两遍**：`apps/server/tests/transport-contract.ts` 的 `transportContractSuite(name, makeChannel)` 分别实例化 HTTP 与 InProcess 通道（14.2 第二批已落 HTTP 侧）；断言传输层语义（生命周期/错误码同形/直播与回放一致/退订生效），不重复 SSE 时序、DTO 形状、审批与工具语义（各有归属）。
3. **不支持项显式 E_UNSUPPORTED，禁假实现**：InProcess 对"服务端专有"能力（`listFs`/`listFsTree` 的目录列举、附件上传下载、配对三件——它们的实现住在 apps/server 而不是 engine）一律抛 `E_UNSUPPORTED: <方法> 需要 HTTP 通道（<原因>）`，**不返回空值、不静默成功、不本地模拟**（假实现比缺实现更坏）。
4. **DTO 装配单一来源**：`SessionDto`/`TreeNodeDto` 的组装原本住在 apps/server（`toDto`/`treeToDto`）；InProcess 需要同一套装配，故把纯映射函数上提到 **engine 公共面**（`sessionMetaDtoOf`/`sessionDtoOf`/`sessionTreeToDto`，`packages/engine/src/dto.ts`）由 server 与 sdk 共用——**不拷第三份**（AGENTS §1.1 的漂移教训，阶段十七已抓到三例）。**落点修正（实现批发现，本张原文写的是"下沉 protocol"）**：protocol 的硬约束是**零依赖 engine**（AGENTS §1.1），而这些函数要读 engine 的 `SessionMeta`/`SessionTreeInfo` 形状——放 protocol 会倒转依赖；engine 本就是 DTO 的产地（`listModels(): ModelsDto`、`getSettings(): SettingsDto`、`listCommands(): CommandDto[]`），会话三件只是补齐同一层职责。
5. **审批同一路径**：两通道的 `replyPermission` 最终都走 engine 的权限服务（HTTP 经 POST /api/permissions/reply，InProcess 直调 `engine.replyPermission`），fail-closed 语义（超时/异常一律拒绝）不因通道而变。
后果：InProcess 让嵌入宿主（含 `spark -p`）省掉起 server 与端口占用；契约套件成为通道演进的常设回归网；`E_UNSUPPORTED` 进 doc/02 §5.10 错误码表；**engine 公共面增三个纯映射函数**（值导出 13 → 16，白名单不变量网与 doc/02 §4.6.2 裁决表同步；属 §4.6.1 的四端共享运行时类思路，走 §4.4 演进规则）；逐方法映射表见 doc/02 §4.7。
编号注记：本两张 ADR 占 **D30/D31**（顺延现表末张 D29）；doc/08 §5C 阶段十八 18.1 原预称的 D30 顺延为 **D32**。**两张 D28 重号仍待人类判决**（登记于 doc/02 v3.93，不擅改历史行）。

### D32 web 观感 = 胶囊控件 + 分层大圆角卡（作废旧圆角封顶；2026-09-10，阶段十八工单 18.1 规格先行）

背景：晚风 2026-09-05 对照 shadcn 官网（[ui.shadcn.com](https://ui.shadcn.com)）首页组件演示拍板"我比较喜欢人家官网列出来的这些"——目标观感 = **胶囊控件（rounded-full）+ 分层大圆角卡 + 浅灰底输入**。这与现行 DESIGN §3 的圆角封顶（控件/卡片/最大 = 6/8/12px）以及 §12.4/§12.8 把 `rounded-2xl`/`rounded-3xl` 一刀切列入"AI 生成风"黑名单**直接相抵**：不改规格就动代码，执行会话会与黑名单 grep 自查互相打架（同一处样式，一边要求改一边判违规）。另一条证据是仓内已有同风格实现：移动端 §13.J 依 Qoder CN 实测定死"白卡 radius 16、无边框无阴影、黑胶囊 CTA radius full"，会话流 user 气泡（§13.H，工单 10.22 晚风拍板）radius 18——即"胶囊 + 大圆角卡"在 Spark 内部已是既成事实，只是 web 桌面端的旧封顶没跟上，属**口径分裂**而不是新引入风格。
候选：① 维持旧封顶，把 shadcn 风当"参考不落地"——否决：用户已拍板，且移动端与会话流两处已是新口径，维持旧规等于让三处口径长期并存（违 AGENTS §8 一条规则一个来源）；② 只把封顶放宽为"最大 16px"不建档位表——否决：无封闭集就没法判违规，§12.4 的"模板大圆角"会退化成主观争论，黑名单 grep 也失去判据；③ **建圆角档位封闭集 + 黑名单判据由"词"改"是否脱离档位"**，采纳：规格可判、grep 词不变（不放松检查面）、新旧口径不并存。
结论：
1. **圆角档位封闭集（唯一来源 DESIGN §13.B）**：胶囊 `full`（按钮/输入框/下拉/分段/chip）· 8px（小件）· 12px（分组卡与弹层菜单）· 16px（大信息卡，对齐 §13.J 白卡）· 18px（会话流 user 气泡，§13.H 与 §13.J.3 实测同源，含右下角 4px 收角）。**五档之外一律违规**；卡片封顶 16px。
2. **输入区底色**：浅灰底走 `--secondary`/`--muted` 系（暗色同 token 翻转）、边框弱化（纯底色已足够分层时可省）；焦点态仍是全局 2px **中性**环（`--ring`，v2.8 拍板不变，不用 accent）。
3. **黑名单改口径不改词**：§12.8 的 `rounded-2xl`/`rounded-3xl` grep 行保留，命中后按档位判——16px（`rounded-2xl`）属登记的"大信息卡"档则放行，24px（`rounded-3xl`）超封顶一律违规；§12.4 的禁止项由"模板大圆角"改述为"**脱离 §13.B 登记档位**的大圆角"（判据是脱离档位，不是圆角大小）。
4. **不变项（边界，全清单）**：密度体系不动（13px 基础字号 / sm28-md32-lg38 高度档 / 4-8px 网格）；会话流转录形态不动（§13.H：user 行气泡、assistant 与工具/思考/审批块左锚全宽，不 IM 化）；禁渐变 / 禁阴影（分隔优先边框与留白）/ 禁毛玻璃 / mono 只给代码路径与工具输出 / 焦点环中性 / 单一 accent / 主按钮每屏至多一个——§12 其余各条全部照旧生效。
后果：DESIGN v2.14 已按本张修订（§3 圆角行、§9 copy-in 行、§10 DoD 行、§12.4、§12.8 表与注记、§13.B 表与两条新增、§13.C 用户消息块行、§13.D 分组卡；验收口径 `rg "控件 6px" DESIGN.md` 零命中已自证）；AGENTS.md 不动（视觉规则唯一来源在 DESIGN，AGENTS §8 规则放置规范）；代码侧由阶段十八 18.2（八组件胶囊化）→ 18.3（补件 copy-in）→ 18.4（页面清扫）→ 18.5（收口走查）逐张落地，**本张不动一行代码**。
编号注记：本 ADR 占 **D32**（顺延现表末张 D31；doc/08 §5C 18.1 原预称 D29，D29 已被工单 13.4 占用、D30/D31 已被 14.3/14.4 占用，故两次顺延——与 D30/D31 行注记一致）。**两张 D28 重号仍待人类判决**（登记于 doc/02 v3.93，本单不擅改历史行）。

### D33 /goal 持续目标循环 = 旁路 judge + 三护栏 + 合成续跑（2026-09-11，阶段十六工单 16.7）

背景：doc/08 §16.7 立项（消解 V2-35；qwen-code packages/core/src/goals/ 参考设计，约 20 文件不整体移植，只取"judge 旁路 + 三护栏 + evidence 证据"思想）。需求：设定目标条件，引擎循环工作直到条件满足或护栏触发。关键约束：surface 纪律（模型可见必被记录）与审批红线（续跑不绕过审批）。
候选：① 主上下文内自判（模型在 turn 内自己宣布完成）——否决：自我主张无证据校验，"送达不等于状态改变"；② 独立目标运行时（每目标一个子会话）——否决：v1 目标与主会话共享上下文与审批链，拆会话引入 fork/回滚与用量归并复杂度，boring code 原则下过度设计；③ **turn 收尾后旁路 judge + 合成续跑输入**，采纳：judge 不占主上下文（不 emit surface 事件），续跑 user.message 如实标注 [goal 合成输入]（不伪造用户意图），工具照常走审批链。
结论：
1. **循环位置**：runSessionLoop 在每个 turn 收尾后调 GoalRunner.afterTurn（RunLoopDeps.goal 端口，缺省无目标不接线）——finish='stop' 才判定；'aborted' → paused{interrupt}（Esc 即停）；'error' → paused{turnError}（fail-closed 不带坏状态裸续）。
2. **三护栏数值（迷你 ADR 定档）**：迭代硬上限 **50**（qwen MAX_GOAL_ITERATIONS 同值——防 judge 永远说不满足的 token 焚烧）；每目标 token 预算 **200_000**（输入+输出合计，judge 自身用量一并计入；约一次中等会话量级，后续可 config 化）；judge 判定超时 **25s**（qwen 同值；超时/LLM 错误/解析不出判定 → paused{judgeTimeout}，fail-closed 不裸转）。
3. **judge 判据**：会话 JSONL 尾部 40 行证据（结构化摘要，旁路读 store 不占主上下文）+ 判定提示词写死"送达不等于状态改变，必须引用事实性记录"；回答只许 SATISFIED / NOT_SATISFIED 二选一，解析不出按超时暂停。
4. **事件语义**：goal.set / updated / completed / paused 四枚全 durable、非 surface——回放即重建状态（GoalRunner.rebuild 在会话装载单点重建；进程重启/回滚不丢目标）；目标文本进模型历史的唯一通道是合成续跑 user.message（surface 载体在那边）。
5. **红线**：续跑 turn 与用户 turn 走完全相同的管线——审批、I/O 护栏、成本熔断、hooks 全部生效，goal 不提供任何旁路。
后果：protocol 词表 22 → 26 种（六处计数同步）；RunLoopDeps 增可选 goal 端口（既有测试 stub 不受影响）；web StatusBar 增 goal 徽标（/goal status 的可见面）；MockTransport 增 /goal 对等分支（set/clear/status 事件语义）。eval 验收留 16.7 验收段（小目标 2-3 轮完成）由 ScriptedLlm 测试覆盖（packages/engine/tests/goals.test.ts）。
编号注记：本 ADR 占 **D33**（顺延现表末张 D32）。**两张 D28 重号仍待人类判决**（登记于 doc/02 v3.93，本单不擅改历史行）。

## 6. 模块速览（职责边界）

| 模块                | 职责                                        | 不许做                                     |
| ------------------- | ------------------------------------------- | ------------------------------------------ |
| `packages/protocol` | 事件词表/API 类型/Transport 接口/zod schema | 任何业务逻辑、运行时依赖（除 zod）         |
| `packages/engine`   | 输入队列/RunLoop/工具/审批/会话/LLM 网关    | 不感知 HTTP；不 import 前端代码            |
| `apps/server`       | REST 薄壳 + SSE + 静态托管                  | 不写业务（全部委托 engine）                |
| `apps/web`          | UI 渲染与交互                               | 不做协议外的数据加工；不改写事件（只投影） |
| `apps/desktop`      | Electron 壳：sidecar 生命周期 + 窗口（D14） | 不 import 引擎/协议；不写业务             |
| `packages/sdk`      | L2 薄客户端：装配 + 便利分组 + 通道适配（D30/D31） | 不写业务逻辑；不复制连接管理/重连/错误映射（那些在 protocol）；不新定义 wire 类型 |

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
| 未引用导出/依赖                           | **knip ✅ 已接入且导出面已清零（工单 14.1 二/三批）**：根 `knip.jsonc`（每处 entry/ignore 原地写理由）+ `pnpm knip` + ci.yml 在 lint 后独立一步；`include` 已含 **exports/types**（第三批起）且零发现——新增导出要么被消费要么在裁决表里留理由。裁决与处置全表见 doc/02 §4.6.3                                      |
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
