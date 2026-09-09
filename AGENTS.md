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
| v1.28 | 2026-09-02 | AI 编写：Jules (AI Assistant)；发起：晚风（Wanfeng1028） | 更新 package.json 贡献者（contributors）字段 |
| v1.29 | 2026-09-07 | AI 编写：Qoder；发起：Qoder 会话（AGENTS.md 复核指令，对照源码逐项核实） | §1 项目上下文刷新至**阶段十二全部落地**（12.1–12.9 + 13.1 第一批 + 16.1；doc/02 v3.92），CLI 措辞修正 **Ink 6→Ink 7**（工单 10.56 已升 `ink ^7.1.1`）；新增 **§1.1 四端共享核**（protocol 是运行时代码而非类型包 + MockTransport 对等纪律 + 数据落点）；§3 任务表补 Transport 新方法 / 命令描述符 / 设置项三行；§4 开发命令回填（单包与单条用例过滤、`check_doc_links.py`、Playwright e2e、`pnpm -r build`、eval `--suite`）并新增 **§4.1 文档锚点与同步面**（CI 正则锚定的措辞不得改写）；§2.9 过时指涉（"排到阶段五之后"）改指挂池与立项流程。只改本文件，交叉引用漂移项登记待人类决策：ARCHITECTURE ADR 表出现**两张 D28**、`.cursor`/`.qoder` shim 命令节仍留"骨架未建"占位、doc/02 §4.5/§7.4 缺 12.4/12.2a/12.5 三路由登记 |
| v1.30 | 2026-09-07 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"工单要全部做完"指令） | §1 必读文档索引新增 **doc/09 外部任务基准可行性评估**（工单 13.2 产出：Terminal-Bench（经 Harbor）/ SWE-bench Lite / 自建容器三候选 × 四维度对比，判决**不接** + 三个重评触发条件 + 若接的 installed-agent 最小接线草图）；同批事实修正：§1 "未开工：阶段十三余下（13.2–13.7）" 中 13.1 已三批收官、13.2 已出报告（详见 doc/02 v3.95–v3.96）。与 README v1.32、doc/08 v1.12 同步 |
| v1.31 | 2026-09-08 | AI 编写：Qoder；发起与决策：晚风（Wanfeng1028，"本地不进行任何的测试，直接 push 远端，看 ci 就可以"指令） | **新增本机零验证约束**：§2.2 补拍板口径——不在本地跑 test/typecheck/lint/eval/`check_doc_links.py`，改完直接 commit + push，验证全交远端 CI（ci.yml 五步 + e2e job）裁决，CI 红在下一提交修；**新写测试用例仍是任务的一部分**（只是不在本机跑）。§4 顶部加"本机零验证"横幅与命令定位重说（CI 与人工排查的工具箱），质量闸注释由"本机按此顺序跑齐再提交"改为"由 CI 执行，本机不跑"；§7 工作节奏改为"代码/文档（含新增单测）→ 版本表追加 → commit + push → 看 CI"（原为"单测 → typecheck/lint → commit"）。同批同步：README/README.en 当前状态行、CONTRIBUTING 提交前自查、doc/02 阶段约束行、doc/06 §2、doc/08 附录 A/B 总则、四份 shim（.cursor/.qoder/.windsurf/.trae）与三个 SKILL（new-event-type/new-tool/frontend-component）的"验证与提交"步。本条取代此前"本机只跑 typecheck+lint"口径（历史版本行与已完成的阶段注记不改） |
| v1.32 | 2026-09-08 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | §4 开发命令补 **`pnpm knip`**（工单 14.1 第二批：未引用文件/依赖/二进制扫描接入，配置在根 `knip.jsonc`、裁决表在 doc/02 §4.6.3）；质量闸注释由"ci.yml 五步同序"改为**六步**（文档检查器 → typecheck → lint → **knip** → test → eval）。CI 里 knip 是 lint 后的独立一步而不并进 `pnpm lint`（两个工具报告形状与失败语义不同，混在一起会让 eslint 红灯被 knip 噪声掩盖；同为硬门）。与 doc/02 v4.7、doc/06 v1.7、ARCHITECTURE v1.36、doc/08 v1.21 同批 |
| v1.33 | 2026-09-09 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | §4 质量闸由六步改**七步**（末位补 `pnpm -r build`）并写明不可省的理由：`pnpm typecheck` 是 `--noEmit`，查不出**声明发射错**（TS4033：已导出接口用了私有名），而 engine/protocol 发布靠 `tsconfig.build.json`（declaration: true）——工单 14.1 第三批把符号降为私有时实际踩到这个隐形洞（四个符号必须保留 export），ci.yml 已同步补步。与 doc/02 v4.8、doc/06 v1.8、ARCHITECTURE v1.37、doc/08 v1.22 同批 |
| v1.34 | 2026-09-09 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | §4 开发命令补 **`pnpm --filter @spark/protocol gen:contract`**（工单 14.2 契约用例生成器：改过 protocol 的 zod schema 必重跑，生成物入库 `packages/protocol/tests/contract/`，CI 重跑并 `git diff --exit-code` 校同步）；质量闸注释改为**不写步数**、以 ci.yml 为准（步数从五→六→七一路漂，写死数字每次加工具都要改三处文档），并列出当前关卡同序（文档检查器 → typecheck → lint → knip → 契约同步 → test → eval → build）。与 doc/02 v4.12、doc/06 v1.9、doc/08 v1.24 同批 |
| v1.35 | 2026-09-09 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | §1.1 两条刷新：① **引擎侧入口**改为 14.1 已落地的分级口径（`@spark/engine` 公共嵌入面 / `@spark/engine/internal` 无承诺且生产代码禁引），原文"17.x 批次已收窄"是陈旧表述；② 新增 **`@spark/sdk` 是 L2 客户端装配层**（工单 14.3）一条——createClient = HttpTransport 装配 + 便利分组、零业务逻辑，web/cli 装配点已迁，并给出**新增客户端能力的落点三问**（连接/重连/错误映射→protocol；便利分组→sdk；平台适配→各端）。§4 typecheck 项目数 **9 → 10**（新增 packages/sdk）。与 doc/02 v4.15（§4.6.4 sdk 合同面）、CONTRIBUTING（四包版本策略表）、doc/08 v1.25 同批 |
| v1.36 | 2026-09-09 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | §1.1 的 `@spark/sdk` 条重写为**双子入口**口径（工单 14.4 / ADR D30）：`.` = HTTP（零 engine 依赖、浏览器可用），`./inprocess` = 进程内直连引擎（`@spark/engine` 为 **optional peerDependency**）；便利分组只在 `src/client.ts` 定义一份（parity 是结构保证）。**落点三问扩为四问**：新增"引擎数据 → DTO 的装配 → engine 公共面"（`sessionMetaDtoOf`/`sessionDtoOf`/`sessionTreeToDto`；**不放 protocol**，因为 protocol 硬约束零依赖 engine——这是 14.4 实现批撞上后修正的，ADR D31 结论 4 已同步）。与 ARCHITECTURE v1.39、doc/02 v4.20、doc/08 v1.29 同批 |
| v1.39 | 2026-09-09 | AI 编写：ZCode CLI · GLM-5.3（c6649989-58db-48d8-bd05-3a1d0fd3e6b4/z-ai/glm-5.3-free）；发起：晚风（Wanfeng1028，移动端/小程序联调报错清单指令） | §4 开发命令 mobile/miniapp 两行补 `dev:web`/`dev:h5` 浏览器形态注记（两端 web 平台开启的仓库侧修复见 doc/02 v4.24：mobile 的 metro `.js`→`.ts` 解析与 web 依赖、miniapp 的 react-dom/h5 构建面；本文件只改命令注记）。**版本号撞号顺延**：本行原拟 v1.37，但 v1.37/v1.38 已被并行会话（Qoder，工单 14.5 两批）占用，顺延为 v1.39，不改他人历史行 |
| v1.37 | 2026-09-09 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续呗"指令） | §4 typecheck 项目数 **10 → 12**（工单 14.5 第一批新增两个示例包 `examples/sdk-bot` 与 `examples/sdk-viewer`，均带 typecheck 脚本并入 workspace）。示例包入 workspace 的理由写在这里以免后人当多余：**不入就没 CI 的 typecheck/lint/knip 覆盖**，而不能编译的示例比没示例更坏（同 14.3 把 sdk 示例放进 tsconfig include 的判例）。注意 `pnpm-workspace.yaml` 对 examples 是**逐条显式列入**（不是 `examples/*` 通配），新增示例包要同时改它。与 doc/02 v4.25、doc/08 v1.31 同批 |
| v1.38 | 2026-09-09 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续呗"指令；因由：本会话把并行会话的未提交依赖带进了锁文件，CI 红在 `--frozen-lockfile`） | §2 第 2 条补 **并行会话下的 lockfile 纪律**：`pnpm install` 按工作区当前清单重算锁文件，而工作区可能带着其他会话未提交的 package.json 改动（本次实例：另一会话的 miniapp h5 / mobile web 改动未提交，却因本会话跑 install 而进了锁文件，CI 报 `ERR_PNPM_OUTDATED_LOCKFILE`）——**提交锁文件前必须核 diff 只含本会话改动**；已污染时用 `git worktree add _scratch/<name> HEAD` 取干净检出重算后拷回，**不得 checkout/stash 别人的在制品**。与 doc/02 v4.26 同批 |
| v1.40 | 2026-09-10 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"继续"指令） | §4 开发命令补两行（工单 14.6 开发者文档站）：**`pnpm --filter @spark/docs gen:events`**（事件词表页生成器：改过事件 schema 必重跑，生成物 `apps/docs/events.md` 入库，CI 重跑并 `git diff --exit-code` 校同步——与契约用例生成物同一口径）与 **`pnpm --filter @spark/docs dev`**（VitePress 本地预览；构建已自动入 `pnpm -r build`，VitePress 内置死链检查会在构建时报红）。§4 typecheck 项目数 **12 → 13**（新增 apps/docs）。**版本号撞号顺延**：本行原拟 v1.39，但 v1.39 已被并行会话（ZCode CLI，两端 dev:web/dev:h5 命令注记）占用，顺延为 v1.40，不改他人历史行。与 doc/02 v4.31（形态选型一行决策记录 + 词表页生成规则）、doc/08 v1.33（§14.6 进度）同批 |

## 1. 项目上下文（30 秒版）

Spark 是一个 **Agent 工作台**：Node/TS 引擎（headless）+ React Web 前端 + Electron 桌面壳（sidecar 复用同一 HTTP+SSE 事件流协议）+ CLI TUI（Ink 7，工单 10.56 升级）+ 移动端三端（apps/mobile Expo+RN / apps/miniapp Taro 4 微信小程序）。

**当前状态（编年史细节见 doc/02 §8 阶段表与版本行，本文件只留一句话）**：v1（阶段一~十）已全量合 main 并记入 CHANGELOG `1.0.0`；**阶段十一（可发布）与阶段十二（Agent 能力补全 12.1–12.9）已完成**，同批落地 13.1 第一批（任务级 eval 场景集）与 16.1（`/init`）；**阶段十七（冗余整改 R-A~R-H）已收官**；未开工：阶段十三余下（13.2–13.7）、阶段十四（SDK 化）、阶段十五（生态面，待外部使用者）、阶段十六余下（16.2–16.9）、阶段十八（web 观感对齐 shadcn 风 18.1–18.5）。**下一程顺序与依赖见 doc/08**，工单状态唯一来源是 doc/02 §8 阶段表（行首 `✅` = 已落地，无标记 = 未开工；每批完成在 doc/02 文末版本表追加 v3.x 行）。

**必读文档索引**：架构与决策 → `ARCHITECTURE.md`；视觉与交互规则（桌面应用感/反网站化黑名单/组件 DoD/ZCode 化四端规格 §13）→ `DESIGN.md`；实现规格 → `doc/02`；前端思路 → `doc/03`；调研依据 → `doc/01`；完成度审计（阶段三后源码级核查）→ `doc/05-completion-audit.md`；测试体系规划 → `doc/06-testing-plan.md`；Harness 模块审计（缺口 H01–H36 与"不做"判决）→ `doc/07-harness-audit.md`；v2 展望与工单库（阶段十一~十八：发布化/可日用/可证明/SDK 化/生态面/命令面新机制/冗余整改/观感对齐，工单与开工提示词）→ `doc/08-v2-roadmap.md`；外部任务基准评估（Terminal-Bench/SWE-bench/自建容器三候选与"不接"判决）→ `doc/09-benchmark-feasibility.md`；可重复任务流程 → `.agents/skills/*/SKILL.md`。规则放哪见 §8 规则放置规范。

### 1.1 四端共享核（改任何一端前先读这段；这是本仓库最大的隐形契约）

- **`@spark/protocol` 不是类型包，是运行时共享核**。除类型（`events.ts`/`api.ts`）外还承载四端复用的实现：`apply-event.ts`（会话流 reducer）、`transport-node.ts`（HttpTransport）、`session-stream-core.ts`（连接/退避/水位/鉴权状态机内核）、`session-page.ts`（会话页纯逻辑 controller，RN 与小程序共同消费者）、`flow-rows.ts`（投影行分组与 tool 归类单源）、`ui-copy.ts`/`error-copy.ts`（文案表单源）、`keymap.ts`、`commands.ts`（`BUILTIN_COMMANDS` 命令描述符单一来源）、`format.ts`（fmtTokens 等）。**这些能力在某个端里另写一份 = 制造漂移**（阶段十七审计已抓到三例真实漂移：closed 态文案、toolCategoryOf、PROMPT_CHIPS 缺第 4 条）；新增跨端能力的正确落点是 protocol，端侧只留平台被迫部分（RN SSE、Taro 分块等）。约束：零依赖 `@spark/engine`，只依赖 zod。
- **事件流是 UI 的唯一状态源**：引擎 emit → 单写者 JSONL（durable）→ EventBus → SSE（全局直播 + `since=seq` 回放，去重靠 seq）→ 各端 `applyEvent`。live-only 三类（`assistant.delta`/`reasoning.delta`/`tool.progress`）不落盘。回滚/fork 后的标准动作是 `resetSlice()` + 全量重放，不做局部乐观修补。
- **引擎侧入口（工单 14.1 分级，裁决表见 doc/02 §4.6.2）**：`@spark/engine` = 公共嵌入面（随 semver）；`@spark/engine/internal` = 内部件（**无稳定承诺**，只限本仓单测与 examples/evals，**生产代码禁引**——`public-surface.test.ts` 有断言）；`engine.ts` 是门面巨石（1.6k 行级，管理面透传属对外 API，R-D 判决不再拆），改引擎先定位到 `run-loop.ts`/`tools/pipeline.ts`/`permission/service.ts`/`session/`/`pi-gateway.ts`/`projector.ts` 各模块。工具实现只进 `packages/engine/src/tools/builtin/`（`grep.ts` 是新工具的标准样板）。
- **`@spark/sdk` 是 L2 客户端装配层（工单 14.3/14.4；ADR D30/D31）**：**两个子入口**——`.` = `createClient(baseUrl, opts?)`（HTTP，依赖只 protocol，浏览器可用）；`./inprocess` = `createInProcessClient(engine)`（进程内直连引擎，不起 server、不占端口；`@spark/engine` 是 **optional peerDependency**，所以只要 HTTP 客户端的消费者永不牵连引擎依赖面）。两者都是装配 + 便利分组（sessions/events/approvals），**零业务逻辑**；便利分组的形状只在 `src/client.ts` 定义一份（双通道 parity 是结构保证）。web 的 `transports/context.tsx` 与 cli 的 `app.tsx` 已迁到 `.`。新增客户端能力先问落点：连接/重连/续播/错误映射/鉴权 → **protocol**（四端共享核）；便利分组与通道适配 → **sdk**；引擎数据 → DTO 的装配 → **engine 公共面**（`sessionMetaDtoOf` 等，不放 protocol：protocol 零依赖 engine）；平台适配（RN SSE、Taro 分块）→ 各端。
- **服务端是薄壳**：`apps/server/src/routes/` 已目录化为六子插件（sessions/permissions/secrets-models/automation/readonly + shared），路由 handler 不写 try/catch（全局 `setErrorHandler` 兜底），错误码→HTTP 映射进 `errors.ts` 单源。轻后端例外（模型管理、settings 读写）在 ARCHITECTURE ADR 有登记，不得随意扩面。
- **MockTransport 对等纪律（前端能脱离后端跑的前提）**：`Transport` 接口每加一个方法，`apps/web/src/transports/mock.ts` 必须给出行为一致的假实现（含回放与内存持久化语义），否则 mock 走查与 Playwright e2e 立刻断链。
- **数据落点**：`~/.spark/`（`models.json`/secrets/`mcp.json`/settings/`sessions/<cwd 派生目录>/<sid>.jsonl`/`logs/`/`trash/`/`checkpoints/`）——密钥只从环境变量与 secrets 仓读，日志与审计流统一脱敏；一切文件访问经 `resolveInRoot` 做 cwd 硬边界，越界优先于审批。临时产物一律落 `_scratch/`（已 gitignore）。

## 2. 硬性约定（违反即返工）

1. **文档变更必须更新版本记录表**：每份文档（含本文件、README、DESIGN.md、doc/*）开头都有版本记录表；每次修改追加一行，版本号 +0.1。作者栏格式：AI 编写须写明**软件与模型**（如 `ZCode CLI · GLM-5.3（builtin:zai-start-plan/GLM-5.3）`），人类作者写名字。
2. **完成每个任务单元必须 commit + push**（origin main，远程已配置）。提交信息用 conventional commits 风格 + 中文描述（参考 `git log` 既有格式）。**本机零验证**（晚风 2026-09-08 拍板）：不在本地跑 test / typecheck / lint / eval / `check_doc_links.py`——改完直接提交推送，**验证全交远端 CI 裁决**（ci.yml 五步 + e2e job），CI 红就在下一提交修；新写测试用例仍然是任务的一部分（只是不在本机跑）。**并行会话下的 lockfile 纪律**：`pnpm install` 按**工作区当前清单**重算 `pnpm-lock.yaml`，而工作区可能带着其他会话**未提交**的 package.json 改动；提交锁文件前必须核它的 diff 只含本会话的改动，否则会把别人的未提交依赖带进锁文件、使 CI 的 `--frozen-lockfile` 对所有人红。已污染时的修法：`git worktree add _scratch/<name> HEAD` 取一份只含已提交状态的检出，在其中 `pnpm install --lockfile-only` 重算后拷回；**不得** `git checkout --`/`git stash` 别人的在制品。
3. **语言**：文档与注释用中文；代码标识符、commit type 用英文。
4. **TypeScript strict**，禁止 `any`（确需时 `unknown` + 收窄）。跨包导入只允许依赖 `@spark/protocol` 的导出，不得深路径引用。
5. **协议改动从 `packages/protocol` 开始**：改事件词表/API 类型 → 两端同步适配 → 跑双侧类型检查。禁止在前端或引擎里私自定义 wire 类型。
6. **前端样式**：Tailwind + shadcn token 体系；视觉基调：黑白中性极简。**禁止一切"AI 生成风"外观**：蓝紫渐变玻璃拟态、暖棕/米色等暖调配色、实线细描边 + 内部 backdrop-blur 毛玻璃的按钮/卡片、超大标题字体、emoji 装饰、bento/三卡模板布局等——完整六类特征清单见 DESIGN.md §12（判例与决策记录见 ARCHITECTURE.md D2）；组件改造走 copy-in（源码进 `components/ui/`），不引黑盒运行时依赖。
7. **引擎铁律**（写代码时时刻对照）：durable/live 二分（delta 不落盘）；surface 纪律（模型可见必被记录）；失败闭合（事件流永不悬空）；审批 fail-closed（超时/异常一律拒绝）；单写者 JSONL（会话文件只经 SessionStore 写）。
8. **测试**：`applyEvent` reducer 对全部事件类型逐一单测（21 种）；新增事件类型必须同步新增单测，否则 PR 不完整。
9. **不做的事**：不加多用户/登录/公网暴露（本地 127.0.0.1 是刻意的）；不上 Effect/RxJS 等响应式框架（抄设计不抄框架）；**不做当前工单之外的事**——新想法即使"顺手"也不夹带，登记进 doc/02 §8.7 v2 候选池或 doc/08 立项后再动（v1 阶段的 MVP 边界约束已由阶段五完成交付，不再适用）。
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
| 新增 Transport 方法 | `protocol/src/api.ts` DTO + `transport.ts` 接口 → **`transport-node.ts` HttpTransport 与 `apps/web/src/transports/mock.ts` 双实现（Mock 对等不得漏，见 §1.1）**→ server 路由（`apps/server/src/routes/` 对应子插件 + `errors.ts` 映射）→ 端侧消费 → 02 §4.5/§7.4 表同步 |
| 新增/改命令（四端） | `protocol/src/commands.ts` 的 `BUILTIN_COMMANDS` 描述符（单一来源：名称/描述/surface/clientAction）→ engine `executeCommand` 分支或端侧 clientAction 消费 → 基线条数断言同步（改基线要四包同改） |
| 新增设置项        | `protocol` settings schema（唯一来源，engine `config.ts` 复用）→ `settings-store.ts` 消费点归类（**turn 边界注入=热生效 / 构造期注入=重启档 `restartRequired`**，ADR 登记）→ web 设置页走 `useTransportQuery` + `useAsyncOp`；apiKey 类永不进响应 |

## 4. 开发命令

**本机零验证（§2.2）**：下列命令是 **CI 与人工排查的工具箱**，常规开发流程**不在本地跑**——改完直接 commit + push，看 CI。

**根目录没有 `pnpm dev`**——dev 只能按包 `--filter` 启（包名可用短名：`server`/`web`/`cli`/`mobile`/`miniapp`）。

```bash
pnpm install                                  # Node >=24，pnpm 9（packageManager 为唯一来源）
pnpm --filter server dev                      # 后端（tsx watch；缺省 127.0.0.1:4318）
pnpm --filter web dev                         # 前端（VITE_SPARK_MOCK=1 可脱离后端）
pnpm --filter cli dev                         # CLI TUI（Ink 7；需 server 在跑；--api <url>/SPARK_API 指基址）
pnpm --filter mobile dev                      # 移动端 App（Expo；需 server 在跑，配对后连接；dev:web 为浏览器形态）
pnpm --filter miniapp dev                     # 微信小程序（Taro 4 watch 构建；微信开发者工具导入 dist；dev:h5 为浏览器形态）

# 质量闸（与 ci.yml 关卡同序：文档检查器 → typecheck → lint → knip → 契约同步（gen + diff）→ test → eval → build）
# ——**由 CI 执行，本机不跑**（§2.2）；不写步数以免漂移，以 ci.yml 为准
# 末位 build 不可省：typecheck 是 --noEmit，查不出声明发射错（TS4033 "已导出接口用了私有名"），而 engine/protocol 发布靠 declaration: true
# 以下写法供排查单个包/单文件/单用例时按需使用
python scripts/check_doc_links.py             # CI 第一关；改过任何 .md 必跑（--strict 把 warn 也计失败）
pnpm typecheck                                # = pnpm -r typecheck（13 个项目）
pnpm lint                                     # eslint .
pnpm knip                                     # 未引用文件/依赖/二进制扫描（工单 14.1；配置与裁决表见 knip.jsonc 与 doc/02 §4.6.3）
pnpm --filter @spark/docs gen:events          # 文档站事件词表页生成器（工单 14.6）：改过事件 schema 必重跑，
                                              # 生成物 apps/docs/events.md 入库，CI 重跑并 git diff --exit-code 校同步
pnpm --filter @spark/docs dev                 # 开发者文档站本地预览（VitePress；构建已入 pnpm -r build，含死链检查）
pnpm --filter @spark/protocol gen:contract    # 契约用例生成器（工单 14.2）：改过 protocol 的 zod schema 必重跑，
                                              # 生成物入库 packages/protocol/tests/contract/（CI 会重跑并 git diff --exit-code 校同步）
pnpm test                                     # = pnpm -r test（vitest；全量测试由 CI 承担，本机按包跑）
pnpm --filter @spark/engine test              # 单包
pnpm --filter @spark/engine exec vitest run tests/tools-grep.test.ts   # 单文件
pnpm --filter @spark/engine exec vitest run -t "用例描述片段"            # 单条用例
pnpm --filter @spark/web e2e                  # Playwright（首次需：pnpm --filter @spark/web exec playwright install chromium --with-deps）
pnpm -r build                                 # engine/protocol tsc 直出（**含声明发射**）+ server/cli esbuild bundle；examples/evals 等内部包不发布
pnpm eval                                     # ScriptedLlm 回归集；pnpm eval -- --suite tasks --real 为真实模型评分（需 key，见 doc/eval-secrets.md）
```

> 环境提示（Windows + cmd 实跑踩过）：本仓库开发机 shell 为 cmd，`rg`/管道内的引号会被执行器吞掉——模式匹配一律用检索工具而非 shell；临时产物落 `_scratch/`（已 gitignore），别处不写文件。

### 4.1 文档锚点与同步面（软约束之外还有硬检查）

`scripts/check_doc_links.py` 用**正则锚定**跨文档核对两个计数，措辞改了就会报"所有锚点正则都未命中——正则可能已过时"：

| 计数 | 四处锚定句式（必须同时存在且值相等） | 事实源 |
| ---- | ---------------------------------- | ------ |
| 事件词表种数 | doc/02 §4.3 标题行、ARCHITECTURE 事件模型行、本文件 §2.8 的"逐一单测（……种）"括注、README 架构图行 | `packages/protocol/src/events.ts` 的 `EventSchemas` 条目实数 |
| 参考速查表条数 | doc/02 §9 标题行、本文件 §5 首句"完整 …… 条速查表在" | doc/02 §9 表实数 |

所以：**新增事件类型的计数同步是六处活**（protocol 词表 → 前端 reducer + 单测 → 引擎 emit 点 → mock 对等 → 四处文档计数 → 必要时更新检查器正则），走 `.agents/skills/new-event-type/SKILL.md`；计数以源码实数为准，**不凭记忆写**（历史上"21/19/20"反复飘移过三次，每次都是先改文档后改代码）。另：反引号内的仓库路径会被检查存在性（warn），引用文件前确认路径已存在。

## 5. 参考项目速查（遇到问题先查这里）

完整 29 条速查表在 `doc/02-development-plan.md` §9（问题 → 项目 → 精确到文件路径）。要点：run loop 抄 pi、事件纪律抄 dsh、协议形状抄 Codex、steer/queue 与权限抄 opencode、**审批策略引擎与调度状态机抄 Gemini CLI（⚠️ pin 版本，Google 有迁闭源 Antigravity 风险）**、**网关线协议与契约分包查 OpenClaw**、checkpoint 抄 Grok、实现疑难查 Claude Code 泄露源码分析（用户仓库 `Wanfeng1028/claude-code-analysis`）。闭源不可参考清单（原因见 01 §7.3）：Antigravity / ZCode / Qoder / Trae IDE——仅 UX 观察。

## 6. 红线（法律与安全）

1. **Claude Code 泄露源码（2026-03-31 sourcemap 事件）只读不抄**：可用于理解实现（"它是怎么做的"），**一行代码不得复制进本仓库**——专有许可。接口规格与设计思想不受版权保护，可用。
2. 许可证纪律：pi/dsh/opencode（MIT）、Codex/Grok（Apache-2.0）代码可复用但**保留版权声明**；Rust 参考是"翻译思路"不是复制。
3. 密钥与隐私：`models.json` 的 apiKey 只从环境变量读；日志固定脱敏；`.env` 不入库（见 .gitignore）。
4. 工具安全：bash 工具默认全审批；路径硬边界（cwd 外拒读）优先于审批兜底。

## 7. 工作节奏

- 接到任务先对照 `doc/02` 的阶段任务清单（checklist），完成一项勾一项（更新文档 checklist 也是任务的一部分）。
- 每完成一个任务单元：代码/文档（含新增单测）→ 版本记录表追加 → commit + push → **看 CI**（本机不跑 test/typecheck/lint/eval，§2.2）；CI 红就在下一提交修，不 revert 不 force push。
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
