# AGENTS.md — AI 编码代理工作规范

> 本文件面向**任何在本仓库工作的 AI 编码代理**（ZCode / Claude Code / Codex / opencode 等）。
> 进入本仓库后请先完整阅读本文件与 [ARCHITECTURE.md](./ARCHITECTURE.md)（架构）/ [DESIGN.md](./DESIGN.md)（视觉），再做任何修改。

## 版本记录

| 版本  | 日期       | 作者                                                                                                                                                                                               | 变更内容                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0  | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核） | 初稿：项目上下文/硬性约定/任务指引/红线                                                                                                                                                                                                                                                                                                                                                                   |
| v1.1  | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；人作者：晚风（Wanfeng1028，提出与审核）                                                                                          | 硬性约定 §2.6 扩充：禁止一切"AI 生成风"外观（暖棕/米色暖调配色、实线细描边+内部 backdrop-blur 毛玻璃按钮），与 DESIGN.md D2 同步                                                                                                                                                                                                                                                                          |
| v1.2  | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）                                                                                                                                   | 必读索引挂接 **doc/04 前端约束规则**（目标"Codex/ZCode 桌面感"：布局/密度/颜色 token/键盘优先/动效/反网站化黑名单/组件 DoD/Electron 预留）                                                                                                                                                                                                                                                                |
| v1.3  | 2026-08-22 | 同上（决策：晚风 Wanfeng1028）                                                                                                                                                                     | 项目上下文移除"本地优先"定位措辞（事实不变，不作明面标签）                                                                                                                                                                                                                                                                                                                                                |
| v1.4  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）                                                                                                                                   | §5 参考速查更新：参考体系扩至 9 项（+Gemini CLI/OpenClaw/Hermes Agent，速查表 28 条）；新增闭源不可参考清单（Antigravity/ZCode/Qoder/Trae IDE，原因见 01 §7.3）                                                                                                                                                                                                                                           |
| v1.5  | 2026-08-23 | 同上；依据：晚风提供的《AI 编程项目需要哪些文档？4 类约束一次讲清》                                                                                                                                | **按四类约束框架重组文档体系**：新增 §8 规则放置规范（AGENTS 管项目/DESIGN 管视觉/SKILL 管流程/专属文件管工具差异+四条纪律）；必读索引更新（架构→ARCHITECTURE.md、视觉→DESIGN.md、skills）；§2.6 判例引用改指 DESIGN.md §4 + ARCHITECTURE.md D2                                                                                                                                                           |
| v1.6  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起与决策：晚风（Wanfeng1028）                                                                                                  | §2 新增第 10 条硬性约定**文件删除保护**：AI 编程助手无权删除任何文件，任何删除须经五层级确认（意图/对象/影响/替代/终确认）；§8 及 CLAUDE.md、copilot-instructions.md 中"九条硬性约定"同步改为"十条"                                                                                                                                                                                                       |
| v1.7  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"参考的助手都要有适配文件"）                                                                            | §8 新增 **8.1 编程助手适配对照表**（覆盖全部参考工具：ZCode/Codex/opencode/pi 原生读 AGENTS.md 零配置；Grok/dsh/Hermes/Trae/Qoder/Qwen 标待验证）；新增 `.cursor/rules/spark.mdc` 与 `.windsurf/rules/spark.md` 摘要 shim（以 AGENTS.md 为权威）                                                                                                                                                          |
| v1.8  | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028）                                                                                                        | §2.6 摘要扩充（+超大标题字体/emoji 装饰/bento 模板布局）；特征清单引用由 DESIGN.md §4 改指新 **§12 完整黑名单**（六类，依据外部调研扩充，含成因考证与来源）                                                                                                                                                                                                                                               |
| v1.9  | 2026-08-23 | 同上（发起：晚风，"Grok/dsh/Hermes/Trae/Qoder/Qwen 都要有适配文件"）                                                                                                                               | §8.1 六工具约定**全部核实并补齐**：Grok（代码 81 处）/dsh/Hermes/Qoder 原生 AGENTS.md ✅ 零配置；Trae 建 `.trae/rules/project_rules.md`、Qoder 另建 `.qoder/rules/spark.md`、Qwen Code 建 `QWEN.md`（@AGENTS.md 导入）。**Qwen Code 入参考体系第 10 项**（01 §7.3/§10：分支差异参考档——多协议运行时切换/Auto-Skills/SubAgents-Agent Teams/daemon+IM 多形态；生态 gemini-cli-desktop 作 GUI 前端补充参考） |
| v1.10 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"后端的 AI 规范也要写好"）                                                                              | §2 新增第 11 条硬性约定**禁止"AI 生成味"代码**（前端 → DESIGN §12 深化：P0/P1/P2 分级、§12.7 文案语气、§12.8 grep 硬检查；后端/通用 → ARCHITECTURE §9 六类清单，boring code 总原则）；§8 及各专属文件/shim 中"十条硬性约定"同步改为"十一条"（版本因并行会话 v1.9 顺延为 v1.10）                                                                                                                           |
| v1.11 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）                                                                                                                                   | §2.8 事实修正：事件词表 **21→19 种**（阶段一工单 1.2 实现 @spark/protocol 时逐条核对词表实数；与 doc/02 v2.3、ARCHITECTURE v1.6、doc/03 v1.1 同步）；§1 项目上下文"代码未开工"更新为"阶段一已开工（工单 1.1/1.2 完成）"                                                                                                                                                                                   |
| v1.12 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028）                                                                                                        | §2 新增第 12 条硬性约定**参考项目禁止克隆到本地**（一律在线访问：gh api/raw 直读/npm registry/官方文档；禁 git clone 与整仓压缩包；派调研子代理时提示词必须写明本条）；§8 表"十一条"改"十二条"                                                                                                                                                                                                            |
| v1.13 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，外部评审指出事实漂移）                                                                                  | §5 参考速查计数修正 **28→29 条**（v1.9 并行会话加 Qwen 行时漏改本文件）；采纳评审建议新增 `scripts/check_doc_links.py` 文档一致性检查器（链接可解析/事实计数一致/仓库路径存在性），接入 CI——防"一处改动六处更新"类漂移复发                                                                                                                                                                                |
| v1.14 | 2026-08-25 | AI 编写：ZCode CLI · ox-alpha（model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；发起：晚风（Wanfeng1028）                                                                        | §1 必读索引新增 doc/05 完成度审计（阶段三后源码级核查：缺口清单 G1–G7 与动工顺序；编号 04 已随原前端约束文档并入 DESIGN.md 退役）                                                                                                                                                                                                        |
| v1.15 | 2026-08-25 | 同上；指误：晚风（Wanfeng1028）                                                                                                                                                                    | **v1.14 作者栏勘误**：误沿既有版本表的"GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）"署名（历史会话所留标签，本会话不可核实），改为可确证标识 ox-alpha + model id；详见 doc/05 v1.1 勘误说明。**署名纪律**：此后 AI 新增行只署当前会话可确证标识，禁止照抄历史行署名                                                                                                                                          |
| v1.16 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令）                                                                                                                                 | §1 项目上下文事实刷新：**v1——五阶段全部完成**（阶段五产品化落地：Electron sidecar 壳/沙箱 wrapper/MCP client/子代理/skills 插件，ADR D14–D18）；与 doc/02 v2.30、README v1.15 同步                                                                                                                                           |
| v1.17 | 2026-08-26 | AI 编写：ZCode CLI · ox-alpha（model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；发起：晚风（Wanfeng1028，D4 多端 ADR 指令）                                                      | §1 项目上下文补**阶段六~九已立项**（doc/02 v3.0：UI 重构 ZCode 化/Harness 补全/CLI TUI/移动端三端；缺口依据 doc/07 审计 H01–H36，视觉依据 DESIGN §13，多端选型 ADR D19–D24）；必读索引新增 doc/06-testing-plan.md 与 doc/07-harness-audit.md；§8.1 补 CLI/移动端条目注记；与 ARCHITECTURE v1.14（D19–D24）、doc/02 v3.0 同步 |
| v1.18 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                                                                                | §2.8 事实修正：事件词表 **19→20 种**（阶段七工单 7.2 新增 `io.warning` I/O 护栏告警事件，log-only durable 不 surface；与 doc/02 v3.4、ARCHITECTURE v1.16、README v1.17 同步） |
| v1.19 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                                                                                | §2.8 事实修正：事件词表 **20→21 种**（阶段七工单 7.5 新增 `memory.injected` 长期记忆注入事件——先于 user.message 落盘，Projector 投影为模型上下文前缀，surface 纪律双面成立，ADR D25；与 doc/02 v3.14、ARCHITECTURE v1.17、README v1.19 同步） |
| v1.20 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                                                                                        | §1 项目上下文刷新：**阶段六/七完成待合入，阶段八~九立项**（阶段七十二项工单全落地，7.9 Python worker 判决删除见 doc/07 §4.1，ADR D25–D27；与 README v1.21 同步） |
| v1.21 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段八开工指令——CLI TUI 全量）                                                                                                                          | §1 项目上下文刷新：**阶段八完成待合入**（工单 8.1–8.5 全落地：transport/applyEvent/上下文水位/错误文案/键位表下沉 @spark/protocol 四端共享 + apps/cli Ink 6 四区形态，ADR D19；阶段九立项范围收窄为移动端三端，选型引用改 D20–D24）；§4 开发命令占位回填实际命令（含 `pnpm --filter cli dev`）；与 doc/02 v3.23 同步 |
| v1.22 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段九开工指令）                                                                                                                          | §1 项目上下文事实刷新：**阶段九已开工，工单 9.1 配对鉴权完成待合入**（ADR D24：DeviceStore/PairService + REST Bearer 与 SSE `?token=` 双口径鉴权钩子 + `resolveBindTarget` 启动护栏；协议面 `Transport.redeemPair`/`authToken`/`splitSseFrames`；web「设备与配对」页；缺省 127.0.0.1+无鉴权行为不变红线保持）；与 doc/02 v3.25、README v1.23 同步 |
| v1.23 | 2026-08-30 | AI 编写：Qoder                                                                                                                          | §1 项目上下文刷新：**阶段九已完成待合入**（工单 9.1–9.5 全落地：配对鉴权 + apps/mobile Expo+RN 会话体验 + apps/miniapp Taro 4 小程序壳，ADR D20–D24；真机/模拟器四场景走查与小程序开发者工具走查由用户执行，留待记录）；§4 开发命令补 `pnpm --filter mobile dev`/`miniapp dev`；与 doc/02 v3.29、README v1.24 同步 |
| v1.25 | 2026-08-31 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，v2 展望四轮会话；MIT / npm CLI 优先已拍板） | §1 必读索引新增 doc/08 v2 展望与工单库（阶段十一~十五 34 张工单含开工提示词；立项时 lift 进 doc/02 §8，执行以彼处为准） |
| v1.26 | 2026-08-31 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十验收核查指令） | §1 项目上下文刷新：**阶段十完成（UI 对齐+CLI §13.K 纯单栏重构，工单 10.1–10.11 全落地，ADR D19 修订）**；阶段十源码级核查后补完三处勾选虚高与两处缺漏（first N lines hidden/同类聚合//resume Space 预览/Ctrl+R 重试/帮助四列），判决登记见 doc/02 v3.35；与 doc/02 v3.35、DESIGN v2.7、README v1.26 同步 |
| v1.27 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，批次 3 立单+开工指令） | §1 项目上下文刷新：**阶段十全部完成并已合 main（工单 10.1–10.23 + 收尾批次 3：10.22 消息气泡布局 / 10.24 hooks 关闭时序 P1 修复 / 10.25 CLI clientAction 不变量网 / 10.26–10.27 对账与卫生 / 10.28 LICENSE MIT=G6 消解）**；§2.8 事件词表 21 种经源码复核不变。同日源码级核查：批次 2 已勾工单全部落地属实（0 any/0 ts-ignore/21 事件 reducer 单测全覆盖）。与 doc/02 v3.48–v3.53（批次 3 立单与勾选）、doc/08 v1.3、doc/05 v1.2、DESIGN v2.10 同步 |

## 1. 项目上下文（30 秒版）

Spark 是一个 **Agent 工作台**：Node/TS 引擎（headless）+ React Web 前端 + Electron 桌面壳（sidecar 复用同一 HTTP+SSE 事件流协议）+ CLI TUI（阶段八落地，Ink 6）+ 移动端三端（阶段九落地：apps/mobile Expo+RN App / apps/miniapp Taro 4 微信小程序）。当前处于 **v1（五阶段全部完成：骨架/前端/引擎/深度体验/产品化——Electron 壳、沙箱、MCP client、子代理、skills 插件均已落地，ADR D14–D18）；阶段六（UI 重构 ZCode 化）、阶段七（Harness 补全——7.1–7.8/7.10–7.13 共十二项，7.9 判决删除，ADR D25–D27）、阶段八（CLI TUI——transport/applyEvent/水位/键位表下沉 @spark/protocol 四端共享，工单 8.1–8.5，ADR D19）与阶段九（移动端三端——工单 9.1–9.5 全落地：配对鉴权 ADR D24 + apps/mobile Expo+RN ADR D20 + apps/miniapp Taro 4 ADR D21）均已完成合入；**阶段十全部完成并已合 main**（UI 对齐与 CLI 重构：工单 10.1–10.23 全落地——批次 2 命令描述符/设置面/transport 修复，ADR D19 修订、D28 设置写策略；收尾批次 3 质量收尾：10.22 消息气泡布局、10.24 hooks 关闭时序 P1 修复、10.25 CLI clientAction 不变量网、10.26–10.27 对账与代码卫生、10.28 LICENSE MIT=doc/05 G6 消解；10.30 死代码文件与 spike 残留**冻结待人类五层级确认**，AGENTS §2.10）。下一程为 v2（阶段十一~十六：发布化/可日用/可证明/SDK 化/生态面/命令面新机制，工单库见 doc/08——执行时逐张 lift 进 doc/02）。完整规格见 `doc/02-development-plan.md`。

**必读文档索引**：架构与决策 → `ARCHITECTURE.md`；视觉与交互规则（桌面应用感/反网站化黑名单/组件 DoD/ZCode 化四端规格 §13）→ `DESIGN.md`；实现规格 → `doc/02`；前端思路 → `doc/03`；调研依据 → `doc/01`；完成度审计（阶段三后源码级核查）→ `doc/05-completion-audit.md`；测试体系规划 → `doc/06-testing-plan.md`；Harness 模块审计（缺口 H01–H36 与"不做"判决）→ `doc/07-harness-audit.md`；v2 展望与工单库（阶段十一~十五：发布化/可日用/可证明/SDK 化/生态面，工单与开工提示词）→ `doc/08-v2-roadmap.md`；可重复任务流程 → `.agents/skills/*/SKILL.md`。规则放哪见 §8 规则放置规范。

## 2. 硬性约定（违反即返工）

1. **文档变更必须更新版本记录表**：每份文档（含本文件、README、DESIGN.md、doc/*）开头都有版本记录表；每次修改追加一行，版本号 +0.1。作者栏格式：AI 编写须写明**软件与模型**（如 `ZCode CLI · GLM-5.3（builtin:zai-start-plan/GLM-5.3）`），人类作者写名字。
2. **完成每个任务单元必须 commit + push**（origin main，远程已配置）。提交信息用 conventional commits 风格 + 中文描述（参考 `git log` 既有格式）。
3. **语言**：文档与注释用中文；代码标识符、commit type 用英文。
4. **TypeScript strict**，禁止 `any`（确需时 `unknown` + 收窄）。跨包导入只允许依赖 `@spark/protocol` 的导出，不得深路径引用。
5. **协议改动从 `packages/protocol` 开始**：改事件词表/API 类型 → 两端同步适配 → 跑双侧类型检查。禁止在前端或引擎里私自定义 wire 类型。
6. **前端样式**：Tailwind + shadcn token 体系；视觉基调：黑白中性极简。**禁止一切"AI 生成风"外观**：蓝紫渐变玻璃拟态、暖棕/米色等暖调配色、实线细描边 + 内部 backdrop-blur 毛玻璃的按钮/卡片、超大标题字体、emoji 装饰、bento/三卡模板布局等——完整六类特征清单见 DESIGN.md §12（判例与决策记录见 ARCHITECTURE.md D2）；组件改造走 copy-in（源码进 `components/ui/`），不引黑盒运行时依赖。
7. **引擎铁律**（写代码时时刻对照）：durable/live 二分（delta 不落盘）；surface 纪律（模型可见必被记录）；失败闭合（事件流永不悬空）；审批 fail-closed（超时/异常一律拒绝）；单写者 JSONL（会话文件只经 SessionStore 写）。
8. **测试**：`applyEvent` reducer 对全部事件类型逐一单测（21 种）；新增事件类型必须同步新增单测，否则 PR 不完整。
9. **不做的事**：不加多用户/登录/公网暴露（本地 127.0.0.1 是刻意的）；不上 Effect/RxJS 等响应式框架（抄设计不抄框架）；MVP 边界外（MCP/子代理/skills/沙箱）的功能一律排到阶段五之后，即使"顺手"。
10. **文件删除保护**：AI 编程助手**无权删除任何文件**——不得直接或间接执行删除（`rm`/`del`/`git rm`/`git clean`/移动出仓库/清空目录等），提交中也不得夹带删除。任何文件（含临时文件、生成物）的删除都必须由人类发起或确认，并完成**五层级确认**（逐级明示确认，缺一不可）：① 意图确认（为何删）→ ② 对象确认（逐个列出精确路径）→ ③ 影响确认（全仓引用与构建影响）→ ④ 替代确认（归档/移动/改名能否替代删除）→ ⑤ 终确认（人类明示"确认删除"）。五级全部通过后，方可由人类执行或明确授权 AI 执行；重命名/移动不在此列，但移动出仓库视同删除。
11. **禁止"AI 生成味"代码**（前端与后端都算）：前端外观六类黑名单 + 文案语气 + 代码级 grep 硬检查见 DESIGN.md §12；后端/通用代码六类黑名单（无据设计模式、吞异常/空 catch、幻觉防御、冗余注释、泛化命名、any 逃逸/幻觉依赖）见 ARCHITECTURE.md §9——其中吞异常与假实现直接违反引擎铁律（失败闭合/禁止假状态）。总原则 **boring code**：无聊、可读、只做好一件事；删掉一层抽象若不破坏功能，就删。
12. **参考项目禁止克隆到本地**：调研或参考任何参考项目（doc/01 §10 全部 10 项、Claude Code 泄露源码仓 `Wanfeng1028/claude-code-analysis`、以及未来新增的参考）时，一律**在线访问**——`gh api repos/<owner>/<repo>/contents/<path>`（列目录/读文件，可加 `Accept: application/vnd.github.raw` 取原文）、raw 文件直读、npm registry（版本/依赖/tarball 清单）、pkg.go.dev / 官方文档站。**禁止 `git clone`、下载整仓压缩包、或把参考项目副本放进本仓库/本机工作目录**。理由：在线读取足以完成源码级调研（本仓库全部调研均以此模式完成）；克隆整仓浪费磁盘且有误引入代码的许可证风险。派调研子代理时必须在提示词中写明本条。

## 3. 常见任务指引（改哪里）

| 任务              | 步骤                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 新增事件类型      | `protocol/src/events.ts` 词表 + zod schema → 前端 `applyEvent` 表 + 单测 → 引擎 emit 点 → 文档 02 §4.3 表同步                        |
| 新增工具          | `engine/src/tools/builtin/` 新文件（ToolDefinition：zod input/permission/resourceOf/execute）→ registry 注册 → 错误码进 02 §5.6.3 表 |
| 新增审批规则语义  | `permission/rules.ts` evaluate → service 挂起/级联逻辑 → 前端 ApprovalCard 适配                                                      |
| 新增/改造前端组件 | AI Elements copy-in 到 `components/ui/` → 删 `"use client"` → 数据源换 `useSessionItems()` selector → 样式走 token                   |
| 改 SSE/API        | `protocol/src/api.ts` DTO → server 路由 + zod → 前端 Transport → 02 §4.5 表同步                                                      |
| 会话持久化变更    | `session/` 对应文件 → 02 §5.8 算法描述同步 → 坏行/迁移策略评估                                                                       |

## 4. 开发命令

```bash
pnpm install
pnpm --filter server dev     # 后端（tsx watch；缺省 127.0.0.1:4318）
pnpm --filter web dev        # 前端（VITE_SPARK_MOCK=1 可脱离后端）
pnpm --filter cli dev        # CLI TUI（Ink；需 server 在跑；--api <url>/SPARK_API 指基址）
pnpm --filter mobile dev     # 移动端 App（Expo；需 server 在跑，配对后连接）
pnpm --filter miniapp dev    # 微信小程序（Taro 4 watch 构建；微信开发者工具导入 dist）
pnpm test / pnpm typecheck / pnpm lint
pnpm eval                    # eval 回归（doc/02 工单 7.11；--real 可选真实模型）
```

## 5. 参考项目速查（遇到问题先查这里）

完整 29 条速查表在 `doc/02-development-plan.md` §9（问题 → 项目 → 精确到文件路径）。要点：run loop 抄 pi、事件纪律抄 dsh、协议形状抄 Codex、steer/queue 与权限抄 opencode、**审批策略引擎与调度状态机抄 Gemini CLI（⚠️ pin 版本，Google 有迁闭源 Antigravity 风险）**、**网关线协议与契约分包查 OpenClaw**、checkpoint 抄 Grok、实现疑难查 Claude Code 泄露源码分析（用户仓库 `Wanfeng1028/claude-code-analysis`）。闭源不可参考清单（原因见 01 §7.3）：Antigravity / ZCode / Qoder / Trae IDE——仅 UX 观察。

## 6. 红线（法律与安全）

1. **Claude Code 泄露源码（2026-03-31 sourcemap 事件）只读不抄**：可用于理解实现（"它是怎么做的"），**一行代码不得复制进本仓库**——专有许可。接口规格与设计思想不受版权保护，可用。
2. 许可证纪律：pi/dsh/opencode（MIT）、Codex/Grok（Apache-2.0）代码可复用但**保留版权声明**；Rust 参考是"翻译思路"不是复制。
3. 密钥与隐私：`models.json` 的 apiKey 只从环境变量读；日志固定脱敏；`.env` 不入库（见 .gitignore）。
4. 工具安全：bash 工具默认全审批；路径硬边界（cwd 外拒读）优先于审批兜底。

## 7. 工作节奏

- 接到任务先对照 `doc/02` 的阶段任务清单（checklist），完成一项勾一项（更新文档 checklist 也是任务的一部分）。
- 每完成一个任务单元：代码/文档 → 单测 → typecheck/lint → commit + push → 版本记录表追加。
- 不确定的设计决策：先查 ARCHITECTURE.md 的 ADR 表；仍无答案则提出并让人类决策，**不要自行发明与文档冲突的机制**。

## 8. 规则放置规范（四类约束——新规则先问放哪）

> 口诀：**AGENTS 管项目，DESIGN 管视觉，SKILL 管流程，专属文件管工具差异。**

| 约束类型                                        | 放哪                                                                                         | 本仓库实例                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 项目级工作规则（每次进入项目都适用，常驻）      | `AGENTS.md`                                                                                  | 本文件十二条硬性约定                                         |
| 视觉/交互决策（页面应该什么风格、新场景怎么选） | `DESIGN.md`                                                                                  | token/密度/黑名单/组件 DoD                                   |
| 可重复多步骤流程（只在某类任务触发，按需）      | `.agents/skills/<name>/SKILL.md`（可带 scripts/references）                                  | docs-update / new-event-type / new-tool / frontend-component |
| 工具平台差异（某 AI 工具独有行为）              | `CLAUDE.md` / `GEMINI.md`（@AGENTS.md 导入+差异）/ `.github/copilot-instructions.md`（指针） | Plan Mode 触发条件等                                         |

四条纪律：**一条规则只有一个来源**（其他文件引用不复制）；**常驻规则与按需流程分开**（都适用→AGENTS，某类任务才触发→SKILL）；**视觉与代码规则分开**；**软指令与硬检查分开**（md 提醒 AI，typecheck/lint/test/CI 才是强制层）。
大型化后可在子目录继续放 AGENTS.md（越靠近目标文件越具体）。判断是否写成 SKILL 的三条件：任务重复出现 / 顺序影响结果 / 一句提示容易漏步。

### 8.1 编程助手适配对照表（含全部参考工具）

> AGENTS.md 是跨工具开放标准——**原生读取它的工具不需要任何额外文件**；只有约定不同的工具才需要 shim。shim 文件是配置而非文档（不设版本记录表，git 追踪变更）；摘要型 shim（Cursor/Windsurf/Copilot）以 AGENTS.md 为唯一权威。

| 助手/工具                       | 读取的文件                                                                         | 本仓库状态                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **ZCode**（主力）               | `AGENTS.md` 原生 + `.agents/skills/`                                               | ✅ 零配置命中                                                  |
| **Codex**（OpenAI）             | `AGENTS.md` 原生                                                                   | ✅ 零配置                                                      |
| **opencode**                    | `AGENTS.md` 原生                                                                   | ✅ 零配置                                                      |
| **pi**                          | `AGENTS.md` 原生                                                                   | ✅ 零配置                                                      |
| **Claude Code**                 | `CLAUDE.md`（官方）                                                                | ✅ `@AGENTS.md` 导入 + Plan Mode 差异                          |
| **Gemini CLI**                  | `GEMINI.md`（官方）                                                                | ✅ `@AGENTS.md` 导入 + 上下文分层差异                          |
| **GitHub Copilot**              | `.github/copilot-instructions.md`                                                  | ✅ 纯指针                                                      |
| **Cursor**                      | `.cursor/rules/*.mdc`                                                              | ✅ `spark.mdc`（alwaysApply 摘要版，以 AGENTS.md 为准）        |
| **Windsurf**                    | `.windsurf/rules/*.md`                                                             | ✅ `spark.md`（trigger: always 摘要版）                        |
| Grok Build                      | `AGENTS.md` 原生（仓库代码 81 处引用，**已核实**）                                 | ✅ 零配置                                                      |
| DeepSeek harness / Hermes Agent | `AGENTS.md`（README 明示支持，**已核实**）                                         | ✅ 零配置                                                      |
| Qoder                           | `AGENTS.md` 原生（官方文档：`/init` 生成）+ `.qoder/rules/` 规则目录（**已核实**） | ✅ 零配置；另建 `.qoder/rules/spark.md` 摘要（`@rule` 可引用） |
| Trae                            | `.trae/rules/project_rules.md`（官方文档，**已核实**）                             | ✅ 已建摘要 shim                                               |
| Qwen Code                       | `QWEN.md`（主，仓库代码 114 处）+ `AGENTS.md`（兼容，61 处，**已核实**）           | ✅ 已建 `QWEN.md`（@AGENTS.md 导入+差异）                      |

原则：**团队实际启用某工具时才建它的 shim**；摘要 shim 只在工具无法读 AGENTS.md 时才存在，且必须声明"冲突以 AGENTS.md 为准"。

**CLI/移动端条目（2026-08-26，ADR D19–D24）**：阶段八/九新增的 apps/cli（Ink TUI）与 apps/mobile（RN）/小程序（Taro）**不改变本表**——任何在这些目录工作的 AI 助手同样以根 AGENTS.md 为准（大型化后"越靠近目标文件的 AGENTS.md 优先"见 §8）；四端共享资产（协议/applyEvent/错误文案表/设计 token）的修改纪律见 ARCHITECTURE.md D22。
