# Spark v2 展望与工单库——阶段十一~十七（发布化 / 可日用 / 可证明 / SDK 化 / 生态面 / 命令面新机制 / 冗余整改）

## 版本记录

| 版本 | 日期       | 作者                                                                                  | 变更内容                                                                                                              |
| ---- | ---------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| v1.0 | 2026-08-31 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，四轮 v2 展望会话；MIT / npm CLI 优先 / 本文档交付形式三项已拍板） | 初稿：定位与使用说明 · 决策记录（已拍板/待拍板）· 阶段十一~十五共 34 张工单（每张含验收标准与开工提示词）· 后置观察池 · 提示词总则（附录 A） |
| v1.1 | 2026-08-31 | 同上；核查：晚风（Wanfeng1028，对照四轮展望清单逐条核查指出缺漏） | **对照四轮展望补全六处**：§0.3 终点图景与差异化五牌；§4.0 五层开发者面表（修 14.6/11.8 悬空引用）；13.1 补「Spark as eval harness」定位句；新增 §7 生命力风险与对策（原不变量节顺延为 §8）；后置池补 LSP/会话导出分享/计划模式 todo/V2-21/V2-02/其余候选池归并行；新增附录 B 阶段十在途工单引用式提示词（治理注记：阶段十唯一来源 doc/02 §8） |
| v1.5 | 2026-09-03 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"全仓冗余审计 + 工单与提示词立项"指令） | **新增 阶段十七：代码冗余整改八工单 R-A～R-H（§5B，含 §5B.0 审计发现汇总）**——当日全仓源码级审计（约 5.4 万行）结论：分层与 D22 纪律总体良好，问题集中四类（巨石文件 / 跨端重复已漂移含 memory LIKE 转义真 bug / 包内样板 / 死代码）；§0.2 新增 Q-7（六死文件 + _scratch 两产物五层级确认）与 Q-8（共享 controller 落点，R-H 开工时问）；建议整体排在 14.1 之前（先消肿再定 SDK 承诺面）；每工单附六段式开工提示词 |
| v1.4 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"继续"指令——批次 3 收账后开下一程） | **阶段十一已 lift 进 doc/02 v3.56 建正式阶段表（11.1–11.8），执行以 doc/02 为准**；11.1 的 LICENSE/package.json 字段/doc/05 G6 注记已由批次 3/工单 10.28 提前落地（余量=CONTRIBUTING/CHANGELOG/ARCHITECTURE D23 补记）；11.2 现场执行、11.5 secrets 配置、11.7 真实 tag 发版标注为用户侧动作。本库阶段十一行文不变（历史不动），阶段十二~十六待各自 lift |
| v1.3 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，批次 3 立单指令） | **阶段十状态对账（本库只改陈旧表述，工单库不变）**：§0.1 后注与附录 B"feat/stage10-ui-batch1 在途/两项待拍板"更新——阶段十批次 2 已全勾合入 main（doc/02 v3.44/v3.45），待拍板两项已按建议执行收口（v3.33）；收尾批次 3（10.22 + 10.24–10.30，含 hooks flaky P1 修复与 CLI clientAction 不变量网补齐）立项于 doc/02 v3.48。阶段十一~十六工单与排序不变 |
| v1.2 | 2026-09-01 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，"九条新机制命令全部做成"指令 + 批次 2 四项拍板落定） | **新增 阶段十六：命令面新机制九工单（16.1–16.9，消解 doc/02 §8.7 V2-27~V2-35 挂池项）**——/agents /plan /trust /init /goal /arena /voice /lsp /extensions；每张含开源参考（在线调研 2026-09-01：qwen-code/gemini-cli 均 Apache-2.0、opencode MIT、复用路线与精确文件路径）+ 提示词；优先级排序（/init 最先——零依赖纯提示词工程；/lsp /arena 最后——大件与需设计）；§0.1 已拍板表补三行（九命令全做成/许可兼容/复用优先）；附录 B 速引表补批次 2 十一张 |

> **定位**：本文是 v2 的**规划库与工单库**，不是执行规格。各阶段开工时，把对应工单 lift 进 doc/02 §8 建立正式阶段表（附版本记录），**执行以 doc/02 定稿为准**——与 doc/07 缺口编号（H01–H36）喂给阶段六~九同一模式。
> **阶段十不进本库**：其工单规格、验收与勾选状态唯一来源是 doc/02 §8 阶段十表（批次 2 已全勾合入 main；收尾批次 3 = 10.22/10.24–10.30，2026-09-01 立项）；附录 B 只提供引用式提示词，不复制规格。
> **编号规则**：工单号 = 阶段.序号（11.1…15.4）；阶段十七为批次字母工单（R-A～R-H，因同章工单间存在并行与依赖交错，字母比序号更能表达"批次"语义）；既有缺口沿用原编号（doc/05 G*、doc/07 H*、doc/02 §8.7 V2-*）；doc/07 编号已冻结至 H36，**新缺口不再新增 H 号**，直接以工单号引用。规划中的未来路径（LICENSE、CONTRIBUTING.md、packages/sdk、apps/docs 等）以普通文字书写，不加反引号，落地后再按仓库惯例引用。
> **本文与 CI**：遵守 scripts/check_doc_links.py 全部检查项（相对链接可解析、不触碰事实计数锚点、未存在路径不进反引号）。

---

# 0. 决策记录

## 0.1 已拍板（晚风；2026-08-31 首三行 / 2026-09-01 追加三行）

| 决策 | 结论 | 影响 |
| ---- | ---- | ---- |
| LICENSE | **MIT** | 11.1 按 MIT 落地；ARCHITECTURE D23 补记同步消解（"倾向 MIT"→"已定 MIT"） |
| 分发主形态 | **npm CLI 优先**（protocol/engine 发库 + apps/cli 发 CLI 包；桌面安装包降为次要轨道） | 11.6/11.7 按 npm 主线排布；NSIS release 后置 |
| 交付形式 | 本规划库入 doc/08 | 本文即工单单一来源，立项时 lift doc/02 |
| 命令面新机制（2026-09-01） | **九条全做成**（/agents /plan /trust /init /goal /arena /voice /lsp /extensions——晚风："既然能做那我们就是要做成的，即使从 0 开始"） | 立项为阶段十六（16.1–16.9），消解 doc/02 §8.7 V2-27~V2-35 挂池项；执行排在批次 2（10.12–10.22）之后 |
| 开源参考纪律（2026-09-01） | **复用优先**：能复用开源就复用（qwen-code/gemini-cli 均 Apache-2.0、opencode MIT，与 Spark MIT 单向兼容；复用须保留原版权声明） | 各工单"开源参考"为必读前置；一律在线访问禁克隆（AGENTS §2.12） |
| 批次 2 四项拍板（2026-09-01，晚风） | ① 10.15 焦点环按 §13.E/§12.1 中性化执行（DESIGN 登记改判）② 10.21 hooks 并入 10.20 `GET /api/settings` ③ 10.16 本批不做切换动画 ④ 10.20 B 类 ADR 开工时停下先问 | doc/02 批次 2 对应行同步；另按晚风澄清新增 **10.22 消息气泡布局**（用户消息靠右/AI 靠左、一上一下错开——是布局形态不是切换动画） |

## 0.2 待拍板（触发相应工单前由人定，本文先按建议方向写）

| 编号 | 决策点 | 建议方向 | 关联工单 |
| ---- | ------ | -------- | -------- |
| Q-1 | skills 边界：维持纯声明（D18）还是走向受限可编程 | 先维持纯声明 + MCP 兜工具面；15.4 研究后再定 | 15.4 |
| Q-2 | i18n（V2-12）是否从 P2 提级 | 11.8 英文 README 先行；全量 i18n 等第一批外部用户反馈再定 | 11.8 / 后置池 |
| Q-3 | 长任务/心跳 turn 是否立项 | 有真实多日任务诉求再立项，须迷你 ADR（防滑向显式 Planner） | 后置池 |
| Q-4 | 任务级基准选型（自建 vs Terminal-Bench 类外部 harness） | 先自建场景集（13.1），外部 harness 出可行性报告再定（13.2） | 13.1/13.2 |
| Q-5 | SDK 客户端包名 | @spark/sdk（与 @spark/protocol、@spark/engine 同谱） | 14.3 |
| Q-7 | 阶段十七死文件删除（2026-09-03 登记）：apps/web/src/features/chat/UsageBar.tsx（49 行，注释已写"停用留人工确认"）、apps/web/src/components/layout/Titlebar.tsx（34 行零 import）、apps/cli/src/components/Sidebar.tsx（41 行停用）、apps/cli/src/components/StatusBar.tsx（89 行仅测试引用）、apps/mobile/src/components/ui.tsx 的 Row、packages/engine/src/scripted-llm.ts（CI 测试夹具，或移 testing 入口不删）、_scratch/lint-plain.txt 与 lint-report.json（git 追踪中的暂存产物） | 按建议方向删前六个 + _scratch 两份（scripted-llm 建议移 `packages/engine` 测试入口或维持冻结）；走 AGENTS §2.10 五层级确认后由 R-H 前置动作或独立小工单执行 | R-H 前置 |
| Q-8 | mobile/miniapp 会话页共享 controller 落点（R-H 开工时问） | 缺省建议：两端各自薄 hook 文件 + 纯逻辑块入 `@spark/protocol`（protocol 无 React 依赖，controller 整体进 protocol 需引 React——不取）；备选新建共享包（过度工程嫌疑，不倾向） | R-H |

## 0.3 终点图景与差异化五牌（v2 收官判据）

**一句话愿景**：跑在你自己机器上、说中文、四端可达、每一步可审计的 Agent 工作台——对参考项目不差，且在"信任"与"多端"两维领先；阶段十五之后转入平台化（MCP 出站 / 协议出站适配 / 技能生态 / 长任务）。

**差异化五牌**（README 身份宣言的素材，11.8 消费）：
1. 四端同一协议——移动端与小程序端闭环（D20/D21/D24）；
2. 审计级可观测——权限决策归因 + 独立审计流（7.12）；
3. 事件溯源的彻底性——durable/live/surface 三属性编译期强制；
4. 中文-first + 本地模型亲和（FTS5 trigram / Ollama+vLLM 可达）；
5. 工程纪律本身——审计驱动立项、工单带规格行号验收、"不做"清单。

---

# 1. 阶段十一：可发布（Release）

> 主题：把"代码完成"变成"可以发布"。验收尾巴清账 + 法律与社区基础 + 测试欠账 + npm 分发 + README 手册化。
> 依赖关系：11.1 立即可做；11.2 需用户环境配合；11.3–11.5 可并行；11.6→11.7 串行；11.8 依赖 11.1 定稿。

## 11.1 LICENSE（MIT）与社区基础文件（消解 doc/05 G6）

- **目标**：补齐开源法律身份与最小社区入口。
- **产出**：根目录 LICENSE（MIT，版权行 Copyright (c) 2026 Wanfeng1028）；CONTRIBUTING.md（面向人类贡献者：环境要求/分支与提交纪律/工单从 doc/02 §8 认领/PR 自查清单——引用 AGENTS.md 不复制）；CHANGELOG.md（Keep a Changelog 格式骨架，首条记录 v1 五阶段+阶段六~十里程碑）；根与全部 package.json 补 license: "MIT" 字段；ARCHITECTURE.md D23 补记更新（G6 消解）；doc/05 缺口表 G6 标注已消解（只追加注记，不改历史行）。
- **验收**：GitHub 仓库页显示许可徽章；pnpm -r typecheck/lint/test 全绿（license 字段不破坏包元数据）；check_doc_links.py 通过。
- **依赖**：无（阶段十一第一张工单）。

**提示词**：

```text
任务：Spark 工单 11.1——LICENSE（MIT）与社区基础文件。决策已定：MIT。

前置阅读：AGENTS.md（十二条硬性约定与 docs-update 技能）、ARCHITECTURE.md D23、doc/05 §5 G6、doc/08 工单 11.1。
要求：
1. 新建根目录 LICENSE 文件：MIT License 全文，版权行 "Copyright (c) 2026 Wanfeng1028"。
2. 新建 CONTRIBUTING.md：面向人类贡献者，内容只做引用与入口（环境要求 pnpm/Node 22+、提交纪律引用 AGENTS.md、
   工单从 doc/02 §8 认领、PR 自查指向 DESIGN §10 DoD 与 ARCHITECTURE §9），禁止复制规则正文。
3. 新建 CHANGELOG.md：Keep a Changelog 格式骨架，[Unreleased] 段 + 首条 1.0.0 段记录 v1 五阶段与阶段六~十里程碑。
4. 根与所有 workspace 包的 package.json 补 "license": "MIT"。
5. ARCHITECTURE.md D23 末句的"LICENSE 缺口 doc/05 G6 悬而未决"更新为已定 MIT（按 docs-update 追版本行 v+0.1）。
6. doc/05 §5 G6 行尾追加"✅ 已消解（2026-08-xx，11.1）"注记（不改历史行）。
验收：check_doc_links.py 通过；pnpm -r lint/typecheck/test 全绿。
提交：docs(license): 工单 11.1——MIT 与社区基础文件（正文列全部变更文件）。
```

## 11.2 验收尾巴清账（G1 + 阶段五四项 + 阶段九两幕；用户现场执行为主）

- **目标**：把登记在案的全部"由用户执行的现场验收"一次关账，v1 真正收官。
- **产出**：① G1——examples/e2e-smoke.sh 三场景（真实模型闭环 / SSE 断线重连 / kill -9 resume）实际执行并归档运行记录；② 阶段五——Windows 本机安装走查（NSIS 产物）、沙箱隔离效果验证（真实主机 bwrap）、真实外部 MCP server 演示、真实模型子代理演示；③ 阶段九——移动端真机/模拟器四场景走查 + 小程序开发者工具走查（doc/06 §5 四幕模板）。
- **验收**：全部记录（截图/录屏/运行日志）按 doc/06 §5 模板归档；发现的缺陷各立修复工单（缺陷修复不等同于本工单验收——先记录后修复）；doc/05 G1 注记已消解。
- **依赖**：无；需用户环境（DEEPSEEK_API_KEY / Windows 主机 / 真机）。

**提示词**（AI 侧准备件；执行主体是用户）：

```text
任务：Spark 工单 11.2——验收尾巴清账的准备件。执行主体是用户（晚风），你负责把可脚本化/可清单化的部分备齐。

前置阅读：doc/05 §5 G1、doc/06 §5 四幕走查模板、doc/02 §8 阶段三/五/九验收行、examples/e2e-smoke.sh。
要求：
1. 走查 examples/e2e-smoke.sh 三场景的当前可用性：脚本依赖（API key 环境变量名、server 启动方式、断线与 kill -9 模拟步骤）
   逐条核对源码是否仍成立；有漂移（如端口、事件名、文案）则修复脚本——只改脚本不改引擎行为。
2. 产出 doc/walkthrough-stage11.md 走查记录模板：按 doc/06 §5 四幕 ×（web/desktop/cli/mobile/miniapp）矩阵，
   每格含 端/版本/日期/结果/证据（截图或录屏路径）占位。
3. 产出一份《用户执行清单》：按依赖顺序列出 8 项现场验收（G1 三场景、Windows 安装、沙箱验证、MCP 演示、
   子代理演示、移动端四幕、小程序走查），每项写明前置条件（密钥/设备/平台）与预期产物。
4. 不代用户执行任何真实环境操作。
验收：e2e-smoke.sh 语法检查通过（bash -n）；模板与清单入 doc/ 并过 check_doc_links.py。
提交：docs(acceptance): 工单 11.2——验收清账准备件（脚本修复 + 走查模板 + 用户清单）。
```

## 11.3 PR CI 接 Playwright（L3 E2E + L2 组件）

- **目标**：消解 doc/06 §2 目标表与 ci.yml 实况的差距——PR 上没有浏览器测试。
- **产出**：ci.yml 新增 e2e job（ubuntu + chromium 单档）：pnpm install → `pnpm --filter @spark/web e2e`；处理 doc/06 v1.1 登记的网关约束（SPARK_E2E_BROWSER 指向系统 Chrome 的兜底路径在 CI 有官方浏览器时不设该变量）；job 与主 ci job 并行，失败即 PR 红。
- **验收**：任一 PR 上 Playwright job 实跑通过（含 mock 四场景 + 断线两例）；故意改坏一个组件断言验证红灯可达。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 11.3——PR CI 接入 Playwright。

前置阅读：AGENTS.md、doc/06 §1（L3 选型）与 §2（目标表 PR 行）、apps/web/e2e/ 现状、apps/web/playwright.config.ts
（SPARK_E2E_BROWSER 兜底）、.github/workflows/ci.yml。
要求：
1. ci.yml 增加 e2e job：ubuntu-latest + node 24 + pnpm（与现有 job 同构）；步骤 = install →
   pnpm exec playwright install chromium（或依赖 config 缺省下载）→ pnpm --filter @spark/web e2e。
2. 与主 ci job 并行（不在同一步骤串行，避免拖慢反馈）。
3. 不改 playwright 用例本身；若 CI 环境下载浏览器被拦，按 doc/06 v1.1 记录用 SPARK_E2E_BROWSER 兜底并注释说明。
验收：本地模拟（act 或直接复跑用例命令）通过；提交后首个 PR 观察绿。
提交：ci(e2e): 工单 11.3——PR 接入 Playwright job。
```

## 11.4 nightly 性能基线接入（doc/06 §3 分批）

- **目标**：性能回归从"有数值"变成"有断言"。
- **产出**：nightly.yml 增 performance job，分两批接入 doc/06 §3 可自动化项——第一批（纯 vitest 可断言）：SSE 千事件回放 <500ms（server 测试扩展：预置 1000 条 durable 事件会话计时）、引擎 10 万事件回放后 RSS <512MB（process.memoryUsage）；第二批（需 Playwright）：web 10k 项虚拟列表帧率（page.trace 采样 >16.7ms 帧占比 <5%）、CLI 冷启 <1s。超阈值红灯并在 doc/02 §8 登记修复工单（doc/06 §2 纪律：红灯 24h 内出工单）。
- **验收**：nightly 手动触发实跑出数；阈值断言存在且对人为劣化场景敏感（可用临时调阈值验证）。
- **依赖**：无（与 11.3 并行）。

**提示词**：

```text
任务：Spark 工单 11.4——nightly 性能基线断言（第一批）。

前置阅读：doc/06 §3 性能基线表与 §2 nightly 行、apps/server 测试现状（GET /api/sessions/:id 回放）、
packages/engine/tests 现状、.github/workflows/nightly.yml。
要求：
1. server 测试新增性能用例：程序化预置 1000 条 durable 事件的会话 JSONL → 计时全量回放（GET /api/sessions/:id
   或 store 读路径）→ 断言 <500ms（留注释说明 2 倍抖动余量政策，doc/06 §3）。
2. engine 测试新增内存用例：构造 10 万 durable 事件会话回放后 process.memoryUsage().rss < 512MB——若 CI 规格下
   不稳定，允许 markPerformance tier（仅 nightly 跑），在 doc/06 版本表登记差异。
3. nightly.yml 增 performance job 跑上述用例（vitest 按文件名过滤或独立 script）。
4. doc/06 §3 表加"接入状态"标注列（第一批两项 ✅，其余登记待 11.4b）。
验收：本地跑两条用例出数且通过；nightly 手动触发绿。
提交：test(perf): 工单 11.4——千事件回放与内存基线接入 nightly。
```

## 11.5 eval --real 接 secrets（真实评分不再恒 skip）

- **目标**：nightly 的 eval --real 目前因仓库无凭据恒 skip（examples/evals/src/real.ts 的 skip 路径）——接上 secrets 后真实模型评分开始积累信号。
- **产出**：GitHub Actions secrets 配置 SPARK_EVAL_API_KEY（与 SPARK_EVAL_PROVIDER/BASE_URL 可选）；nightly eval job 注入 env；real.ts 的 skip 语义保持（凭据缺失 → skip 不红，doc/07 v1.12 纪律不变）；nightly 运行记录里出现 pass/fail 实评结果。
- **验收**：手动触发 nightly，--real 步骤出现真实 pass（或内容 fail 被正确上报）；无 secrets 的 fork 上仍 skip 不红。
- **依赖**：需用户在 GitHub 仓库 Settings 配 secrets（AI 出操作说明）。

**提示词**：

```text
任务：Spark 工单 11.5——nightly eval --real 接 secrets。

前置阅读：examples/evals/src/real.ts（skip 语义）、examples/evals/src/run.ts、.github/workflows/nightly.yml、
packages/engine/src/config.ts（loadConfig 模型配置来源）。
要求：
1. 核实 real 评分链路的凭据读取路径（env 变量名 → resolveApiKey 优先级），在 .github/workflows/nightly.yml 的
   --real 步骤注入 env: SPARK_EVAL_API_KEY（${{ secrets.SPARK_EVAL_API_KEY }}）与可选 provider/baseUrl 变量。
2. 保持 fail-soft：无 secrets 时步骤仍以 skip 结束不红（必要时在步骤里加 if 判断 secrets 缺失则 echo skip）。
3. 产出 docs/eval-secrets.md 短文档：用户配置 secrets 的三步操作（变量名/取值来源/验证方法）。
验收：本地模拟（设置 env 后 pnpm eval --real）出现真实评分路径；workflow YAML 语法校验通过。
提交：ci(eval): 工单 11.5——nightly 真实模型评分接入 secrets。
```

## 11.6 npm 发包准备：protocol / engine 发库 + apps/cli 发 CLI 包

- **目标**：分发主形态（已拍板 npm CLI 优先）的包工程落地——三个包可 publish，CLI 一行可装。
- **产出**：① packages/protocol、packages/engine：package.json 增 files/exports/publishConfig（public access）、repository/engines 字段，private 移除；构建产物策略（tsc 产出 d.ts + js，或 tsup/esbuild——与仓库 boring 原则一致，优先 tsc 直出）；② apps/cli：bin 字段（命令名 spark，指向 dist/main.js）、files、start 脚本产品化；③ 新增 spark up 子命令：本地拉起 server（复用阶段五 esbuild 单文件 bundle 产物与 SPARK_PORT 注入机制，desktop 5.1 同源）+ 启动 TUI 连接——用户 npm i -g 后一条命令可用；④ package.json 全部补 repository/bugs/homepage。
- **验收**：pnpm pack 三包产物内容审查（无 tests/src 泄漏）；npm link 后 spark up → TUI 可用全流程走查；冷启 <1s（doc/06 基线）不回归。
- **依赖**：11.1（license 字段）。

**提示词**：

```text
任务：Spark 工单 11.6——npm 发包准备（protocol/engine/cli 三包）。

前置阅读：AGENTS.md、ARCHITECTURE.md D14（sidecar bundle 机制）、doc/02 §3.2（manifest 表）、apps/desktop 打包
脚本（esbuild server bundle 的现成产物路径）、apps/cli/src/main.tsx 入口、各包 package.json 现状。
要求：
1. packages/protocol 与 packages/engine：补 files/exports/publishConfig(access public)/repository/engines；
   构建用 tsc 直出（不引 tsup 等新工具，boring 原则）；确认 tsconfig 产物含 d.ts；pack 产物不含 tests。
2. apps/cli：bin 字段（spark → dist/main.js）、files、Shebang 头核实；main.tsx 入口支持 argv 解析已有逻辑扩展：
   新增 spark up = 以子进程拉起 server（复用 desktop 的 bundle 构建产物，缺产物时提示先 build）→ 等 healthz →
   进 TUI；退出时连带回收 server 子进程。
3. 三包 package.json 补 repository/bugs/homepage/license（11.1 已定 MIT）。
4. examples/evals 等内部包保持 private 不发。
验收：pnpm -r build 后 pnpm pack 三包，产物清单人工审查记录进提交说明；npm link 全流程：
spark up → TUI 建会话 → 发消息 → 审批 → 退出无残留进程。
提交：build(publish): 工单 11.6——protocol/engine/cli npm 发包准备与 spark up。
```

## 11.7 发布流程：semver / tag / CHANGELOG / publish workflow

- **目标**：把 11.6 的"能发包"变成"可持续发版"。
- **产出**：① 版本策略成文（CONTRIBUTING.md 增发版节）：@spark/protocol 承诺 semver 稳定（事件词表演进走 ignorable/extend 机制），engine 承诺主版本内兼容、内部 API 无承诺（14.1 前的过渡口径），CLI 跟随 minor；② CHANGELOG.md 维护纪律（每工单把用户可见变更写入 Unreleased）；③ .github/workflows/release.yml：push tag（v*）触发 → 构建 → npm publish（OIDC/provenance）→ GitHub Release 生成；④ 首个 tag v1.0.0 发出。
- **验收**：tag 推送后 workflow 全绿，npm 与 GitHub Release 同版本产物可装可引；第二次发版演练（patch 版本）走通全流程。
- **依赖**：11.1、11.6。

**提示词**：

```text
任务：Spark 工单 11.7——发布流程（semver + tag + publish workflow）。

前置阅读：CONTRIBUTING.md（11.1 产物）、CHANGELOG.md、.github/workflows/ci.yml（job 结构参照）、
doc/02 §4.4（协议演进 fail-closed 与 ignorable——semver 承诺的技术依据）。
要求：
1. CONTRIBUTING.md 增"发版"节：三包版本策略（protocol=semver 稳定 / engine=minor 内兼容、内部无承诺 /
   cli 跟随）、CHANGELOG 维护纪律（工单完成即写 Unreleased）。
2. 新建 .github/workflows/release.yml：push tag v* 触发 → pnpm install/build → npm publish（需 npm token
   secret 或 OIDC，二选一并在注释写明）→ softprops/action-gh-release 附产物。
3. 首发版本号定 v1.0.0（三包同版本起步，不做独立版本矩阵——boring 原则）。
4. 产出《发版演练记录》：tag → workflow → npm 安装验证 → GitHub Release 检查。
验收：真实 tag 发版一次成功；npm install @spark/cli -g 装到的版本与 tag 一致。
提交：ci(release): 工单 11.7——tag 触发 publish workflow 与发版纪律。
```

## 11.8 README 重写：身份宣言 + 用户手册 + 英文版

- **目标**：README 从"编年史"变成"身份宣言 + 五分钟上手"。
- **产出**：① README.md 重构：导语改身份宣言（本地运行/数据不出机器、四端同一协议、每一步可审计、反 AI 味的克制界面——四轮展望沉淀的五张差异化牌）；新增 Quick Start（npm i -g @spark/cli → spark up 或 desktop 安装包 → 配模型 → 第一回合）、四端一览、安全模型摘要（127.0.0.1 默认/审批 fail-closed/沙箱）；架构图与版本记录表保留（版本记录表可折叠或移到尾部）；② 新增 README.en.md 英文版（内容对齐，头部互链）；③ 两个 README 的"当前状态"行改为指向 CHANGELOG，终止编年史式膨胀。
- **验收**：新 README 过 check_doc_links.py；英文版与中文版事实一致（事件词表计数等锚点行不动）；从零跟随 Quick Start 可走通（依赖 11.6/11.7 产物）。
- **依赖**：11.1、11.6。

**提示词**：

```text
任务：Spark 工单 11.8——README 重写（身份宣言 + Quick Start + 英文版）。

前置阅读：README.md 现状（注意保留事实锚点行：事件词表计数行被 scripts/check_doc_links.py 正则锚定，措辞不可变）、
doc/08 §0.3 差异化五牌、doc/01 §2、ARCHITECTURE.md §1/§2、doc/02 §1.4 安全模型。
要求：
1. 重构 README.md：导语 = 身份宣言（一段话讲清 Spark 是什么/为谁/凭什么：本地运行数据不出机器、四端同一协议、
   每一步可审计、黑白克制的桌面感）；新增 Quick Start 节（npm 全局安装 CLI → spark up → 设置页配模型 →
   首回合走查）；保留架构一览/技术栈/文档导航/开发命令/版本记录表。
2. "当前状态"长段收缩为三行内 + 指向 CHANGELOG.md（编年史职责移交）。
3. 新建 README.en.md：内容与中文版一一对应，两文件头部互链（Language: English | 简体中文）。
4. 全部变更后跑 python scripts/check_doc_links.py 必须通过（计数锚点行原样保留）。
验收：check_doc_links 通过；中英版本事实一致自查表写入提交说明。
提交：docs(readme): 工单 11.8——README 身份宣言化 + Quick Start + 英文版。
```

---

# 2. 阶段十二：Agent 能力补全（可日用）

> 主题：补齐模型输入面与日常 table stakes——让模型"查得到、看得见、传得进"，让用户"删得了、找得到、管得住"。
> 纪律：动协议从 packages/protocol 开始（AGENTS §2.5）；新增工具走 .agents/skills/new-tool/SKILL.md 全流程；组件改造走 frontend-component 技能。

## 12.1 结构化检索工具：grep 工具（新缺口，doc/07 未登记）

- **目标**：补齐"模型查代码"的一等公民路径——当前模型只能靠 bash 跑 rg，每次过审批且输出无统一限界。
- **产出**：packages/engine/src/tools/builtin/grep.ts 新工具：输入 zod strictObject {pattern, path?, glob?, maxResults?(缺省 50 上限 200), context?}；实现为纯 Node 递归遍历（cwd 内，复用 resolveInRoot 路径硬边界，越界 E_PATH_OUTSIDE），正则逐行匹配，输出 {matches: [{file, line, text}], truncated} 由管线限界；permission action 复用 fs.read 同域（resource=路径前缀）、parallelizable: true；registry 注册（engine.ts 与 memory 工具同点）；README 工具清单与 doc/02 §5.6.3 表、§5.10 错误码表同步。
- **验收**：单测四路径（命中/零命中/越界/输出限界截断）+ 管线集成一例；真实模型走查：让模型"找出项目里所有 E_FAIL_CLOSED 引用"经 grep 工具完成且无需审批放行 bash；文档三处同步。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 12.1——新增 grep 内置工具。

前置阅读（按序）：.agents/skills/new-tool/SKILL.md（全流程必须走完）、AGENTS.md、doc/02 §5.6.1/§5.6.3/§5.10、
packages/engine/src/tools/builtin/read.ts（ToolDefinition 六要素样板）、tools/builtin/index.ts 与 engine.ts 注册点、
ARCHITECTURE.md D15/D16。
要求：
1. 新建 packages/engine/src/tools/builtin/grep.ts：input = z.strictObject({pattern, path?, glob?,
   maxResults?(缺省 50 上限 200)})；纯 Node 实现（readdir 递归 + 逐行正则），不用 rg 二进制、不加新依赖；
   路径经 resolveInRoot 硬边界（越界 E_PATH_OUTSIDE，先于审批）；输出 {matches, truncated} 交给管线限界。
2. permission：action "fs.read"（与 read 工具同域）、resourceOf 返回目标路径；parallelizable: true。
3. 注册进 engine.ts（memory 工具同区域）；description 用中文写清用途与边界（供模型理解）。
4. 单测四路径（命中/零命中/E_PATH_OUTSIDE/限界截断）+ 一条管线集成（经 pipeline 走审批域）。
5. 文档同步：doc/02 §5.6.3 内置工具表加行、§5.10 错误码表核对、README 工具清单如有则同步。
验收：pnpm -r test 全绿（新用例在内）；typecheck/lint 零错。
提交：feat(engine): 工单 12.1——grep 结构化检索工具（含 doc/02 同步）。
```

## 12.2 图片/多模态输入全链路（V2-03 深化）

- **目标**：打通附件从粘贴到进模型上下文的完整链路（当前断在四处：无上传端点、attachments 未消费、gateway 不产 image 块、前端无粘贴处理）。
- **产出**：① server：POST /api/sessions/:id/attachments（multipart 或 raw body，zod 校验类型/大小上限 10MB）→ 存 ~/.spark/attachments/ → 返回 {id, mime, size}；② protocol：attachments 语义定稿（事件里存服务端文件 id 数组），user.message schema 不变；③ 引擎/投影：Projector 把 user.message.attachments 投影为消息前缀的图片 ContentItem（pi-ai image 内容块），pi-gateway.ts 的"image 项 v1 不产出"注释与实现同步解除；④ 前端：Composer 粘贴/选择图片 → 上传 → chips 预览 → 随消息发送；会话流渲染用户消息附件缩略；⑤ 清理策略登记（attachments 目录随会话数据管理归 V2-13）。
- **验收**：E2E：粘贴 PNG → 发送 → 模型应答描述图片内容（真实模型走查）；断线重连回放后附件仍渲染（durable）；大小/类型超限 4xx 人话文案；protocol round-trip 单测含 attachments 用例。
- **依赖**：无（大件，可拆两半：12.2a 上传+存储+前端展示；12.2b 投影+gateway 进模型）。

**提示词**：

```text
任务：Spark 工单 12.2——图片输入全链路（a：上传与展示半程）。

前置阅读：AGENTS.md、doc/02 §4.3（user.message.attachments 预留字段）、§7.2 路由规格、apps/server/src/routes.ts
（路由与 zod 模式）、apps/web/src/features/chat/Composer.tsx（粘贴接入点）、doc/07 §2.7 H19 行、
packages/engine/src/pi-gateway.ts L220 前后（image 不产出的注释）。
本工单只做 a 半程（上传→存储→前端展示），b 半程（投影进模型）另开工单：
1. server 新路由 POST /api/sessions/:id/attachments：zod 校验（image/* 白名单 + 上限 10MB）→
   写 ~/.spark/attachments/<sessionId>/<ulid>.<ext> → 返回 AttachmentDto {id, mime, size, name}；
   错误码入 §7.4 表（E_ATTACHMENT_TOO_LARGE / E_ATTACHMENT_TYPE）。
2. web Composer：onPaste/onFileSelect → 上传 → 附件 chips（缩略+可移除）→ sendMessage 携带 attachments=[id]；
   HttpTransport sendMessage 解除"暂不发送"注释并传参。
3. 会话流用户消息渲染附件缩略图（点击放大走既有 artifacts 白名单面思路，路径校验防逃逸）。
4. 单测：路由校验三态（合法/超限/类型拒绝）；web 组件粘贴与 chips 一例；protocol 往返不变式（attachments 数组）。
5. 文档：doc/02 §4.5 API 表加行、§7.4 错误码表、V2-03 在 doc/02 §8.7 标注"a 半程已落地"。
验收：mock 与真实 server 双态走查：粘贴→chips→发送→回放后仍显示；typecheck/lint/test 全绿。
提交：feat(web+server): 工单 12.2a——附件上传与展示链路。
```

## 12.3 spark -p 一次性模式（headless 脚本面）

- **目标**：`spark -p "prompt"` 不进 TUI 跑完即出、stdout 吐 JSON——SDK（14.4）与 CI 自举的地基。
- **产出**：apps/cli main 入口参数解析扩展：-p/--print 模式——进程内 new Engine（eval harness 同款装配，不经 HTTP）→ createSession → send → 等 turn.completed → stdout 输出结构化结果（--output-format json：全 durable 事件数组；缺省 text：最终 assistant 文本）→ 退出码 0/1（finish=error 或异常非 0）；不落 TUI 渲染、不交互（审批挂起超时走 fail-closed 缺省拒绝并如实输出）；cwd 即工作区。
- **验收**：spark -p "读 package.json 并说出包名" 输出正确文本；--output-format json 可被 jq 解析；无 API key 时退出码非 0 且 stderr 人话；tsc/vitest 不回归。
- **依赖**：无；建议先于 14.4（InProcessTransport 的第一个消费者）。

**提示词**：

```text
任务：Spark 工单 12.3——spark -p 一次性模式。

前置阅读：apps/cli/src/main.tsx（入口与参数处理现状）、examples/evals/src/harness.ts 与 real.ts
（进程内 Engine 装配样板：new Engine({root, config}) → ready → createSession → send → 订阅事件）、
packages/engine/src/config.ts、doc/02 §5.2（Engine 生命周期）。
要求：
1. main.tsx 参数解析扩展：-p/--print + 可选 --output-format json|text（缺省 text）+ 会话级参数
   （--cwd 缺省 process.cwd()）。
2. -p 模式：进程内装配 Engine（不经 HTTP、不起 server）→ createSession({cwd}) → send(prompt) →
   订阅等 turn.completed → 输出后优雅 shutdown；审批挂起出现时按 fail-closed 拒绝（引擎缺省语义）
   并在输出中如实记录 permission.resolved。
3. text 输出 = 最终 assistant 文本；json 输出 = durable 事件数组（deltas 已不落盘，天然不含）。
4. 退出码：finish=stop → 0；error/异常/超时 → 1，stderr 人话（复用 error-copy 表）。
5. 单测：ScriptedLlm 注入下 -p 全流程（text/json 两态 + error 退出码）。
验收：本地 ScriptedLlm 装配下命令行走查三态；spark -p 输出可被管道消费（| jq）。
提交：feat(cli): 工单 12.3——spark -p 一次性模式（进程内引擎、JSON 输出）。
```

## 12.4 会话删除/归档（V2-23）

- **目标**：补上"管住会话列表"的基线能力（当前连 DELETE 端点都没有）。
- **产出**：① 引擎：archiveSession（meta 标记 archivedAt，索引列同步）+ deleteSession（**两段式安全删除**：先移入 ~/.spark/trash/（JSONL 原样移动，可人工找回）再从索引移除——不做原地硬删，与仓库"不删除"哲学一致）；② server：PUT /api/sessions/:id/archive、DELETE /api/sessions/:id（body 确认字段 confirm: true 必填）；③ web：会话菜单（归档/删除/重命名可选）+ 已归档抽屉（列表过滤 + 恢复入口）；④ 四端登记：cli/mobile 后续跟进不在本工单。
- **验收**：归档→列表消失→抽屉可见→恢复；删除→trash 目录存在原文件→索引不可见；运行中会话删除被 409 拒绝；protocol DTO 与单测同步。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 12.4——会话归档与两段式删除（V2-23）。

前置阅读：AGENTS.md §2.10（文件删除保护——本工单的产品语义与它同哲学：移入 trash 不硬删）、
packages/engine/src/session/manager.ts 与 index.ts（会话元数据与索引列）、apps/server/src/routes.ts、
apps/web/src/components/（侧栏会话项与菜单接入点）、doc/02 §8.7 V2-23 行。
要求：
1. engine：SessionManager 增 archive/unarchive/delete；archive = header/meta 加 archivedAt + 索引列；
   delete = 校验无活动 turn（409 E_SESSION_ACTIVE）→ JSONL 文件移动到 ~/.spark/trash/<原名>.<ts>.jsonl
   （fs.rename，同盘原子）→ 索引删除；文件移动失败不删索引（失败闭合）。
2. server：PUT /api/sessions/:id/archive {archived: boolean}、DELETE /api/sessions/:id {confirm: true}
   （缺 confirm 400）；错误映射 E_SESSION_ACTIVE→409。
3. web：会话项右键/菜单（归档/删除含二次确认文案）+ 侧栏底部"已归档"抽屉（列出/恢复/彻底删除入口）
   —— 彻底删除即清空 trash 对应文件，文案明示不可找回，须人工确认。
4. protocol：SessionDto 加 archivedAt?: string；applyEvent 不涉及新事件（管理面 REST 即可，不入事件流）。
5. 单测：engine 三方法 × 边界（运行中拒绝/移动失败闭合/恢复幂等）；server 路由三态。
验收：走查归档/恢复/删除三链路；trash 目录核实存在原 JSONL。
提交：feat(engine+server+web): 工单 12.4——会话归档与两段式删除。
```

## 12.5 文件树面板 + @file 上下文引用（V2-04）

- **目标**：会话页可见项目结构，Composer @ 可引用文件路径进上下文。
- **产出**：① server：GET /api/fs/tree?path=（cwd 内相对路径列举，复用 resolveInRoot 硬边界，忽略 node_modules/.git，深度上限 4，条目上限 500）；② web：右栏文件树抽屉（AI Elements file-tree copy-in 走 frontend-component 技能：删 use client、token 化、密度对齐 §13.B）+ 点击插入 @路径；③ Composer @ 菜单升级：远程文件补全（现本地猜测则如实，端点就绪后切换数据源）；④ 桌面端复用 web（D22），移动端不适用（v1）。
- **验收**：三视口走查抽屉；@ 补全选文件后消息含路径 token 且模型确实读到该文件（真实模型走查）；越界 path 400 E_PATH_OUTSIDE。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 12.5——文件树抽屉与 @file 引用（V2-04）。

前置阅读：.agents/skills/frontend-component/SKILL.md、doc/02 §8.7 V2-04 行、DESIGN.md §13.B 控件表与 §13.A 右栏预留、
packages/engine/src/tools/ 内 resolveInRoot 实现（路径硬边界复用）、apps/web/src/features/chat/Composer.tsx
（@ 菜单现状）、AI Elements file-tree 源（在线查阅，禁止克隆仓库——AGENTS §2.12）。
要求：
1. server：GET /api/fs/tree?path=（相对 cwd）——resolveInRoot 校验 → readdir 递归（深度 ≤4、忽略
   node_modules/.git/隐藏目录、条目 ≤500、按目录/文件排序）→ FileTreeDto；越界 400 E_PATH_OUTSIDE。
2. web：文件树抽屉组件（file-tree 源码 copy-in 改造四步：删 "use client"、数据源换端点、样式 token 化、
   密度对齐 §13.B）；懒加载子目录（展开时再请求）。
3. Composer @ 菜单：二级来源接 /api/fs/tree 补全文件路径；选中插入 @<path> token（只作文本引用，不注入内容
   ——内容由模型经 read 工具自取，保持 surface 纪律）。
4. 单测：路由三态（合法/越界/超限截断）；抽屉组件渲染一例；E2E 补一条 @ 引用→发送→模型读文件路径。
验收：三视口走查；真实模型确认收到路径并完成读取。
提交：feat(web+server): 工单 12.5——文件树抽屉与 @file 上下文引用。
```

## 12.6 MCP/技能管理页（V2-01）

- **目标**：摆脱手编 mcp.json——连接状态可视、启停可控。
- **产出**：① server：PUT /api/mcp（整文件校验后原子写 + 热重载提示——引擎运行中改动需重启生效则如实标注"重启后生效"，禁假状态）；GET /api/mcp 增每 server 连接状态字段（McpManager 暴露 connected/tools 数）；② web：设置中心 Agent 能力区新增 MCP 管理页（server 列表/状态点/工具数/启停开关/表单编辑 transport.command/args/env 脱敏显示）+ skills 只读列表升级（清单字段展示 + 目录路径提示）；③ spark.json 的 mcp 段与 ~/.spark/mcp.json 关系定稿（统一后者，前者移除——单一来源，迁移说明入变更日志）。
- **验收**：添加一个真实 stdio MCP server（如 @modelcontextprotocol/server-filesystem 示例）→ 状态点亮 → 工具数显示 → 禁用后工具从注册表消失（重启后生效如实提示）；坏 JSON 写入被 zod 拦截。
- **依赖**：6.4 设置骨架（已在）。

**提示词**：

```text
任务：Spark 工单 12.6——MCP/技能管理页（V2-01）。

前置阅读：ARCHITECTURE.md D16（MCP 机制与"一视同仁"边界）、packages/engine/src/mcp/manager.ts 与 config.ts
（连接生命周期、~/.spark/mcp.json 形状）、apps/server/src/routes.ts（GET /api/mcp 现状）、DESIGN.md §13.D
设置中心信息架构、doc/02 §8.7 V2-01 行。
要求：
1. engine：McpManager 暴露 statusOf(): Record<server, {connected, toolCount}>；配置写路径
   updateMcpConfig(raw)——zod 整文件校验 + 原子写（tmp+rename，同 secrets store 纪律）+ 返回"需重启生效"标志
   （运行中不热重载，如实标注）。
2. server：GET /api/mcp 增强（带状态）；PUT /api/mcp（校验失败 400 E_CONFIG 人话）。
3. web 设置页新增 MCP 管理：列表（状态点/工具数/启停 checkbox——disabled 状态写 mcp.json enabled 字段）+
   编辑抽屉（command/args/env 表单；env 值脱敏显示）+ skills 只读列表升级。
4. 单测：updateMcpConfig 合法/坏 JSON/原子写三态；路由两态；管理页组件一例。
验收：真实 filesystem server 添加→状态点亮→工具注册→禁用→重启后消失全链路走查。
提交：feat(engine+server+web): 工单 12.6——MCP 管理页与配置写路径。
```

## 12.7 通知推送：turn 完成 / 审批等待（V2-05，桌面壳）

- **目标**：切走时不错过回合完成与审批等待。
- **产出**：apps/desktop main 进程：订阅 SSE（同 HttpTransport 内核或轻量 EventSource）监听 turn.completed 与 permission.asked → Electron Notification（标题/正文/点击聚焦窗口）；设置开关（settings 存 ~/.spark/desktop.json：notifications: {turnCompleted, approvalWaiting}，缺省开）；web 端不做（D26 先例：能力归桌面壳，如实缺省）。
- **验收**：真机 Windows 走查：切出窗口 → 回合完成弹通知 → 点击聚焦；审批等待弹通知；开关关闭即静默；通知不泄漏消息正文（只报"回合完成/等待审批"+ 会话标题）——密钥与内容脱敏红线。
- **依赖**：无（纯壳层）。

**提示词**：

```text
任务：Spark 工单 12.7——桌面通知推送（V2-05）。

前置阅读：ARCHITECTURE.md D14（壳层三件事边界——本工单扩第四件事须在 D14 补记一行）、apps/desktop/src/main.tsx
（现状仅 sidecar+探活+窗口）、packages/protocol/src/transport-node.ts（SSE 解析可否壳内复用）、doc/02 §8.7 V2-05 行。
要求：
1. main.tsx：对 127.0.0.1:<port> 建 SSE 订阅（复用 transport-node 解析或最小手写——不引新依赖），监听
   turn.completed / permission.asked → new Notification({title, body})；body 只含会话标题与状态词，不含消息正文；
   click → 主窗口 focus+restore。
2. 去抖：同会话连续事件 2s 内合并；审批通知在 resolved 后不再补发。
3. 配置：~/.spark/desktop.json（zod schema：notifications.turnCompleted/approvalWaiting，缺省 true）；
   坏 JSON fail-closed 回缺省并 warn。
4. ARCHITECTURE.md D14 补记一行（壳层职责扩通知订阅），版本表 +0.1。
5. 单测：合并去抖与开关过滤纯逻辑（Notification 本体 mock）。
验收：Windows 真机走查三态（完成/审批/关闭开关）；脱敏红线确认（通知内容无正文无密钥）。
提交：feat(desktop): 工单 12.7——回合完成与审批等待系统通知。
```

## 12.8 首启 onboarding（V2-17）

- **目标**：新用户从零到第一回合不读文档。
- **产出**：web：首启检测（localStorage 标记 or ~/.spark/config 完成标记）→ 三步引导流（① 欢迎与安全姿态说明 ② 配模型：供应商选择→录入 key（写 secrets store，7.1 链路）→ 测试连接（6.5 链路）→ 选缺省模型 ③ 建首个会话跳工作台）；可跳过、可从设置中心重进；/welcome 空态升级与引导衔接。
- **验收**：清空 ~/.spark 后全新走查：三步完成→发消息→流式回复合格；中途关闭浏览器再进能续到当前步；跳过后不再自动弹。
- **依赖**：7.1/6.5（已在）。

**提示词**：

```text
任务：Spark 工单 12.8——首启 onboarding 三步引导（V2-17）。

前置阅读：doc/02 §8.7 V2-17 行、apps/web/src/features/settings/SettingsDialog.tsx（密钥录入与连通测试的
现成链路复用）、packages/engine/src/secrets/store.ts（7.1）、DESIGN.md §13.A 空态与 §13.D 设置导航、
apps/web/src/pages/ 路由现状。
要求：
1. 完成标记：localStorage spark.onboarding.done（web 侧判断）+ 设置中心"重跑引导"入口。
2. 三步向导（独立路由 /onboarding 或全屏 Dialog，按 §13.A 空态规格）：欢迎/安全一句话 → 配模型
   （供应商下拉复用 /api/models 目录 → key 表单走既有 secrets PUT → POST /api/models/:id/test 连通 →
   设缺省模型）→ 建会话跳 /session/:id。
3. 每步可后退可跳过；失败态人话（error-copy 表）；不加新后端端点（全部复用既有 API）。
4. 组件测试：三步导航/跳过/失败重试各一例；E2E 一条全流程（mock 态）。
验收：清态走查到第一回合；刷新续步；跳过不再弹。
提交：feat(web): 工单 12.8——首启 onboarding 三步引导。
```

## 12.9 LLM 出网代理（V2-06）

- **目标**：公司网/代理环境可用。
- **产出**：① 调研前置（本工单第一步）：核实 pi-ai 请求层的 fetch 注入面（provider SDK 是否接受自定义 fetch/dispatcher）——结论写入 mini ADR 后再动手；② 方案 A（pi-ai 支持注入）：models.json provider 条目加 proxy?: string（http/https URL）→ undici ProxyAgent 注入该 provider 的请求；方案 B（不支持）：全局 setGlobalDispatcher 兜底（spark.json network.proxy），文档注明影响面；③ env 兜底：未配置时读 HTTPS_PROXY 标准变量；④ 测试连接（6.5）走同代理。
- **验收**：本地起 mitm/简单代理验证请求确实经代理；直连环境零变化（缺省行为不变红线）；A/B 方案选择有 ADR 记录。
- **依赖**：无（调研结论决定实现形态）。

**提示词**：

```text
任务：Spark 工单 12.9——LLM 出网代理（V2-06）。本工单含调研前置，先调研后实现。

前置阅读：doc/02 §8.7 V2-06 行、packages/engine/src/pi-gateway.ts（provider 调用层）、
node_modules/@earendil-works/pi-ai 的请求实现（只读 node_modules 核实 fetch 注入面，不修改）、
packages/engine/src/model-catalog.ts（测试连接链路）。
要求：
1. 调研：确认 pi-ai 各 provider 的请求是否统一经可注入 fetch/undici dispatcher；把结论（能/不能/部分）
   写成 mini ADR（ARCHITECTURE.md D28：LLM 出网代理 = 方案 A per-provider ProxyAgent / 方案 B 全局
   setGlobalDispatcher / 混合），被否备选与依据照 ADR 格式。
2. 按 ADR 实现：models.json provider 条目 proxy?: string（zod 校验 URL 形状）→ 该 provider 请求走
   undici ProxyAgent；未配置时回退读标准 env HTTPS_PROXY；两者都无 → 行为与现状逐字节一致（缺省不变红线）。
3. model-catalog 的 testProvider 走同代理（否则"测试连接成功但实际调用失败"假状态）。
4. 单测：代理注入生效（本地 mock 代理收包断言）/未配置零变化/坏 URL E_CONFIG。
验收：本地代理环境走查 + 直连环境回归（请求不经代理）。
提交：feat(engine): 工单 12.9——LLM 出网代理（D28 + per-provider 配置）。
```

---

# 3. 阶段十三：可证明 + 上下文工程

> 主题：质量从"回归绿"升级为"任务级证据"；上下文工程从"摘要压缩"升级为"双层治理"。

## 13.1 任务级 eval 场景集（自建，Q-4 前半）

- **目标**：真实模型评分从"2+2"（examples/evals/src/real.ts 现状仅此一场景）升级为多步任务级证据。本套件同时是「Spark as eval harness」的雏形——12.3 spark -p 落地后，场景可改由 Spark 自身驱动（自举闭环）。
- **产出**：examples/evals 扩展 tasks 套件：10–20 个确定性场景，每个 = 临时 fixture 仓库（脚本生成）+ 任务指令 + 脚本化判分（文件存在/内容匹配/vitest 子集通过/git diff 形状）；覆盖能力维度：读代码→答问（3）、单文件修改（4）、多文件重构（3）、bash 调试修复（3）、审批拒绝下行为（2）、长任务压缩中途（2）；跑法 `pnpm eval --real --suite tasks`（缺 key 全 skip 不红，11.5 后 nightly 积累趋势）；判分失败输出结构化 diff 报告。
- **验收**：全场景在 ScriptedLlm 下确定性可复跑（CI 冒烟）；真实模型下至少一次全量运行报告入库（examples/evals/reports/ 首份基线）；单场景平均墙钟 <60s。
- **依赖**：11.5（nightly 真评接线）。

**提示词**：

```text
任务：Spark 工单 13.1——任务级 eval 场景集（自建 10–20 场景）。

前置阅读：examples/evals/ 全部源码（harness.ts 装配模式、run.ts 套件组织、real.ts 现状）、doc/02 §8.7、
doc/06 §2（nightly 纪律）、doc/08 工单 13.1 规格。
要求：
1. 新增 examples/evals/src/tasks/：每场景 = fixture 生成器（临时目录仓库：预置源码+测试）+ prompt +
   判分函数（fs 断言/子进程跑 fixture 内 vitest 或 node --test/git diff 形状）+ 元数据（能力维度/预期工具链）。
2. 场景覆盖六维（读码答问 3 / 单文件改 4 / 多文件重构 3 / bash 调试 3 / 审批拒绝行为 2 / 压缩中途 2），
   每个判分必须确定性（不许"看起来对"的模糊判断——判不了就换场景）。
3. run.ts 接 --suite tasks 与 --real 联动：无 key 全 skip 不红（既有 fail-soft 纪律）；失败输出结构化
   JSON 报告落 examples/evals/reports/<date>-<suite>.json。
4. CI（非 nightly）用 ScriptedLlm 冒烟：场景装配与判分函数本身可确定性自测（假模型走通全链路）。
验收：pnpm eval（ScriptedLlm 冒烟）绿；pnpm eval --real --suite tasks 本地（有 key 时）出首份基线报告。
提交：feat(evals): 工单 13.1——任务级场景集与确定性判分。
```

## 13.2 外部任务基准可行性评估（Q-4 后半，研究工单）

- **目标**：回答"要不要接 Terminal-Bench 类外部 harness"——只调研出报告，不实现。
- **产出**：doc/09-benchmark-feasibility.md：候选（Terminal-Bench / SWE-Bench-Lite 子集 / 自托管容器方案）× 维度（环境依赖：容器/网络；判分契约；运行成本；与 eval harness 装配的接线点）× 结论建议；明确"接"或"不接 + 理由"判决（格式照 doc/07 §4.1 判决纪律）。
- **验收**：报告给出可拍板的单一建议与依据；若判"接"，附最小接线草图（不改代码）。
- **依赖**：13.1。

**提示词**：

```text
任务：Spark 工单 13.2——外部任务基准可行性评估（研究工单，不写产品代码）。

前置阅读：doc/07 §4.1（判决记录格式）、doc/08 工单 13.2、examples/evals/src/harness.ts（接线点）、
doc/01 §10（参考体系与在线调研纪律——AGENTS §2.12：禁止克隆，一律 gh api/raw 在线读）。
要求：
1. 在线调研（不克隆）：Terminal-Bench 的任务格式/判分契约/运行环境要求（容器？agent 适配接口形状）；
   SWE-Bench-Lite 的数据许可与最小子集可行性；两者与"本地 127.0.0.1、进程内 Engine"形态的匹配度。
2. 产出 doc/09-benchmark-feasibility.md：候选对比表（环境依赖/判分契约/成本/接线点）→ 单一建议判决
   （接哪个/都不接 + 理由）→ 若接，最小接线草图（哪里注入 Engine、哪里放判分、nightly 怎么排）。
3. 文档走 docs-update：版本表、check_doc_links 通过；正文外部路径一律在线引用不加反引号仓内路径。
验收：报告完成且给出建议；人类据此拍板 Q-4。
提交：docs(research): 工单 13.2——外部基准可行性评估报告（doc/09）。
```

## 13.3 提示词模板层（V2-16）

- **目标**：三处硬编码提示词（prompts.ts 的 BASE/COMPACTION/TITLE——含 COMPACTION_PROMPT、TITLE_PROMPT 导出常量）收敛为可配模板，缺省行为逐字节不变。
- **产出**：① spark.json 增 prompts 段（zod：base/compaction/title 可选文件路径 or 内联文本，支持 {{cwd}}/{{model}} 等白名单占位符——占位符集封闭枚举，防注入面扩大）；② prompts.ts 改造：buildSystemPrompt 等三处从"常量拼接"改"模板解析（缺省模板 = 现硬编码文本原样）"；③ 加载失败（文件不存在/占位符非法）E_CONFIG fail-closed 拒启动；④ 文档：doc/02 §5.11 表加"可配"列与占位符清单。
- **验收**：不配置时全链路输出与改造前逐字节一致（用现有 run-loop 单测快照/断言证明）；配置自定义 base 模板后 system prompt 生效；坏占位符拒启动。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 13.3——提示词模板层（V2-16）。

前置阅读：packages/engine/src/prompts.ts（BASE_PROMPT/COMPACTION_PROMPT/TITLE_PROMPT 三处与拼接逻辑）、
packages/engine/src/config.ts（zod 配置体系与 E_CONFIG 纪律）、doc/02 §5.11、doc/02 §8.7 V2-16 行。
要求：
1. config 增 prompts?: {base?/compaction?/title?: string}——值是文件路径（相对 spark.json 所在目录）；
   加载时读取并校验占位符（白名单封闭集：{{cwd}} {{model}} {{platform}}，其余 {{...}} 一律 E_CONFIG 拒启动）。
2. prompts.ts 三处改为模板渲染：无配置时渲染结果与现硬编码逐字节一致（写一条同一性单测锁死）。
3. 缺文件/占位符非法 → E_CONFIG fail-closed（宁拒启不静默降级——ARCHITECTURE §9.2）。
4. doc/02 §5.11 增可配说明与占位符清单；README 不动。
验收：同一性单测证明缺省逐字节一致；自定义模板端到端生效（ScriptedLlm 断言 system 内容）。
提交：feat(engine): 工单 13.3——提示词模板层（缺省逐字节不变）。
```

## 13.4 压缩双层化：文件级挑选 + 工具输出蒸馏（H19 + Gemini CLI 同款）

- **目标**：compaction 从"单层摘要"升级为"摘要 + 文件级保留清单 + 工具输出蒸馏"（doc/07 H19 与 §2.4 遗留）。
- **产出**：① mini ADR（D29）：双层压缩设计——第一层（现摘要增强）：COMPACTION 提示词要求产出"保留文件清单"（keptFiles）结构化段；第二层（蒸馏）：超限工具输出在压缩时先经辅助模型蒸馏成要点（走 compactionModel 路由档，已有），原文仍在 JSONL（durable 不动，只影响投影）；② Projector：压缩锚点后对 keptFiles 引用的文件做"重投影提示"（把文件路径清单作为投影后缀注入，模型可见必被记录——注入为 compaction.completed 事件的扩展字段，不改词表）；③ 预算：蒸馏只对超 4KB 的 tool.completed 输出生效；④ doc/02 §5.8.5 同步。
- **验收**：ScriptedLlm 压缩场景扩展：蒸馏后模型上下文含要点不含原文、JSONL 原文完好；keptFiles 清单正确出现在下一 turn 上下文；现有压缩回归全绿。
- **依赖**：13.3（模板层先行，提示词可配）。

**提示词**：

```text
任务：Spark 工单 13.4——压缩双层化（摘要增强 + 工具输出蒸馏，H19）。

前置阅读：ARCHITECTURE.md（ADR 格式与 D25 注入纪律先例）、packages/engine/src/compaction.ts 与 projector.ts
（keptFromEventId 锚点与投影算法）、doc/02 §5.8.5、doc/07 §2.4 工具输出蒸馏参考行（Gemini CLI
toolDistillationService——在线查阅设计，不抄代码）、doc/08 工单 13.4。
要求：
1. 先写 mini ADR D29 进 ARCHITECTURE.md：双层压缩决策（摘要增强含 keptFiles 结构化段 / 蒸馏只影响投影
   不动 JSONL durable / 触发阈值 4KB / 蒸馏走 compactionModel 路由档），被否备选（蒸馏落盘替换原文——违反
   append-only；keptFiles 注入为独立事件——词表膨胀无必要）。
2. compaction.ts：COMPACTION 提示词（经 13.3 模板层）追加结构化要求：输出末尾 <!-- kept-files: ["path"...] -->；
   解析进 compaction.completed 事件 data.keptFiles?: string[]（protocol zod 可选字段扩展 + round-trip 单测）。
3. projector.ts：投影压缩锚点后的模型上下文时，把 keptFiles 作为压缩摘要消息的附加行注入（模型可见且被记录——
   就在 compaction.completed 事件里）；对超 4KB tool.completed 输出在投影层替换为蒸馏要点
   （蒸馏调用 pi-gateway 辅助通道，失败降级为原文截断——失败闭合）。
4. 测试：压缩场景扩展三例（keptFiles 注入/蒸馏生效/蒸馏失败降级）；现有压缩回归全绿。
5. doc/02 §5.8.5 算法描述同步。
验收：ScriptedLlm 全链路验证三层断言；JSONL 原文完好性断言。
提交：feat(engine+protocol): 工单 13.4——压缩双层化（D29 + keptFiles + 蒸馏投影）。
```

## 13.5 子代理配置化：预设档（agent presets）

- **目标**：task 工具从"裸 {prompt,title}"升级为可按预设指定模型/工具集/系统提示词附加段。
- **产出**：① ~/.spark/agents/<name>.json 声明式预设（zod：{model?, tools?: {allow/deny pattern 列表}, systemAppend?, title?}）——声明式而非代码（D18 精神）；② task 工具 input 增 preset?: string（Engine.runSubagent 解析：model 覆盖 subagentModel 全局档；tools 收窄经 ToolRegistry 视图过滤；systemAppend 拼入子会话 system prompt）；③ 未指定 preset 行为逐字节不变（缺省不变红线）；④ web：Composer task 无 UI（模型侧工具），设置中心 Agent 能力区增预设列表只读 + 文档说明；⑤ doc/02 §5.6.3 task 行同步。
- **验收**：ScriptedLlm 用例：preset 指定只读工具集的子代理尝试 write 被 deny 规则拦截（E_RULE_DENY 语义照旧）；model 覆盖生效（假 provider 断言）；无 preset 回归全绿。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 13.5——子代理预设档（task 工具 preset）。

前置阅读：ARCHITECTURE.md D17（子代理机制与补记）、packages/engine/src/tools/builtin/task.ts（input 现状）、
engine.ts runSubagent（装配点）、permission/rules.ts（pattern 语义复用）、doc/02 §5.6.3、doc/08 工单 13.5。
要求：
1. 新增 ~/.spark/agents/<name>.json zod schema：{model?: ModelRef, tools?: {allow?: string[], deny?: string[]},
   systemAppend?: string, title?}——声明式文件，不执行代码（D18 同哲学）。
2. task input zod 加 preset?: string；Engine.runSubagent：加载预设（不存在 → E_CONFIG 人话）→
   model 覆盖子会话路由档 → tools 经 registry 过滤视图（deny 胜出，复用 findLast 语义）→
   systemAppend 拼在子会话 system prompt 末尾。
3. 未指定 preset：装配路径与现状完全一致（写一条回归断言）。
4. 单测：预设加载三态（合法/缺失/字段非法）+ 工具收窄拒绝路径 + model 覆盖断言；无 preset 回归。
5. doc/02 §5.6.3 task 行与 §5.1 配置表同步；设置中心只读列表（低优先，可并入文档说明代替——按工单量裁剪）。
验收：ScriptedLlm 三链路走查；typecheck/test 全绿。
提交：feat(engine): 工单 13.5——子代理预设档（model/工具集/系统词可配）。
```

## 13.6 成本看板：按日/供应商聚合 + cache 消费（V2-07）

- **目标**：CostTracker 数据（usage.json 已持久累计、协议已按 opencode 契约三分量记 cache）长出消费面。
- **产出**：① engine：usage.json 结构扩展（向后兼容读旧格式）：按 {day, provider, model} 聚合 {inputTokens, outputTokens, cacheRead, cacheWrite, costUsd}；GET /api/usage/summary?since=；② web：设置中心数据与统计区成本看板页（按日柱状/按供应商表/上下文命中率 = cacheRead/inputTokens 展示）；③ 与 6.6 用量条、7.7 熔断阈值联动展示（本会话/全局两条线）。
- **验收**：mock 多回合后看板数字与 usage.json 一致；旧格式 usage.json 读取不炸（迁移路径）；cache 命中率在真实模型下非零（走查记录）。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 13.6——成本看板与 cache 消费（V2-07）。

前置阅读：packages/engine/src/cost-tracker.ts（usage.json 现有结构与原子写）、packages/protocol/src/primitives.ts
（cacheRead/cacheWrite 三分量契约，L7 注释）、apps/web/src/features/settings/（数据与统计区挂载点）、
doc/02 §8.7 V2-07 行、DESIGN.md §13.G 聚合投影页规格。
要求：
1. cost-tracker：记录结构升级为按 {day, provider, model} 聚合桶（旧平铺格式读入时合并迁移，坏格式
   fail-closed E_CONFIG 照旧）；增 summary(since?) 查询。
2. server：GET /api/usage/summary?since=YYYY-MM-DD → UsageSummaryDto（protocol api.ts 加 DTO + zod）。
3. web 看板页（§13.G 转录式）：按日柱状（纯 div 实现，不引图表库——boring 原则）/按供应商表/上下文
   命中率（cacheRead/(cacheRead+nonCachedInput)）/全局熔断阈值状态（7.7 数据）。
4. 单测：迁移合并/聚合正确性/DTO 往返；组件两态（有数据/空态）。
验收：mock 回合后看板与文件一致；真实模型 cache 命中率非零走查记录。
提交：feat(engine+server+web): 工单 13.6——成本看板（按日/供应商聚合 + cache 命中率）。
```

## 13.7 trace 视图：会话回放即链路（V2-11）

- **目标**：JSONL 的 trace 潜质转正——回合级链路聚合视图。
- **产出**：① server：GET /api/sessions/:id/trace → 按回合聚合 TraceDto（turn 时长/step 数/每工具调用时长与重试/每 step token/错误与 fallback 事件）——纯从 durable 事件推导，不加埋点；② web：会话详情"链路"标签页（回合时间线 + 工具时长条 + token 条，纯 div）；③ 与审计流（7.12）互链跳转。
- **验收**：千事件会话 trace 聚合 <200ms（单测断言）；走查一次含工具重试与 fallback 的回合，时间线与事件流一致。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 13.7——trace 视图（V2-11）。

前置阅读：doc/02 §8.7 V2-11 行、doc/07 §2.6 Tracing 差距行（"JSONL 即 trace 潜质"）、
packages/protocol/src/events.ts（durable 词表：turn/tool/assistant 事件字段——聚合只用已有字段，不加埋点）、
apps/server/src/routes.ts、DESIGN.md §13.G。
要求：
1. 聚合器（packages/engine 或 protocol 内纯函数）：durable 事件数组 → TraceDto（按 turn 分组：时长、
   step 序列、每 tool.started/completed 配对的时长与 isError、assistant.message.usage、fallback/error 事件标记）。
2. server 路由 GET /api/sessions/:id/trace；千事件会话聚合 <200ms 单测断言。
3. web 会话页"链路"页签：回合时间线（纯 div 横条）+ 工具时长 + token 标注；错误/fallback 琥珀色标记；
   点击审计相关项跳 7.12 审计页过滤。
4. 组件测试两例（正常回合/含重试回合）；DTO 往返单测。
验收：真实会话走查时间线与事件流一致；性能断言绿。
提交：feat(server+web): 工单 13.7——会话 trace 聚合视图。
```

---

# 4. 阶段十四：SDK 化

> 主题：把"引擎 headless、UI 是投影"从内部架构升级为对外开发者合同。前置：阶段十一完成（有真实用户后再 SDK 化——没有用户就没有 SDK 的意义）；12.3（spark -p）已落地。
> 四个 ADR 级决策已在展望会话定方向：包形态（protocol 即 SDK、新增薄 @spark/sdk、engine 只承诺嵌入）、稳定性分级（protocol semver 稳定 / engine 内部无承诺）、双通道 parity（InProcess 与 HTTP 过同一 Transport + 同一契约套件）、跨语言（生成物不手写）。落地时各补正式 ADR。

## 4.0 五层开发者面（由内向外——14.1~14.6 逐层落地，15.x 为放大器）

| 层 | 内容 | 现状 | 对应工单 |
| -- | ---- | ---- | ---- |
| L0 嵌入 | new Engine({root}) 进程内跑引擎 | eval harness 已实证此模式；export 面未治理 | 14.1 / 14.4 |
| L1 协议 | 事件词表 + DTO + applyEvent + 文案表 + 键位表 | @spark/protocol 全部导出（12 模块） | 14.1 / 14.2 |
| L2 客户端 | 连接运行中 server 的高层 client | transport-node 内核（web/cli 共用中） | 14.3 / 14.4 |
| L3 脚本 | spark -p 一次性 JSON / CI 用法 | 未做 | 12.3（阶段十二前置） |
| L4 扩展 | skills/commands/hooks/MCP 创作 | D18 声明式 + 7.3/7.4 | 15.1 / 15.3 |

关键设计（opencode sdk-next 验证过的先例，doc/02 §9 已登记）：**L2 只有一个 client 实现、两个 transport**——HTTP 连远程 server，InProcess 直连本地 Engine；四端迁到同一 client 上吃狗粮，SDK 永远被四个真实客户端压着测。

## 14.1 公共面治理：engine 导出收窄 + protocol 公共 API 清单

- **目标**：SDK 之前先把"承诺什么"定清楚——engine/index.ts 现裸露 EventTree、SessionRuntime、CompactorImpl、COMPACTION_PROMPT 等内部件。
- **产出**：① packages/engine exports 治理："." 公共入口收窄为 Engine/loadConfig/错误与 id 工具（以 web/cli/evals 实际消费清单为准逐项裁决）；新增 "./internal" 子路径导出内部件（测试与工具用，文档标注无稳定性承诺）；② packages/protocol 公共 API 清单成文（CONTRIBUTING 或 doc/02 §4 附录：哪些模块是合同、演进规则引用 §4.4）；③ knip 或等价未引用导出扫描接入 lint（ARCHITECTURE §9.6 已列）。
- **验收**：全仓 typecheck/test 零回归；被收窄符号的深路径消费点（若有）全部迁到 ./internal 并 grep 确认无遗漏；knip 报告零未引用导出或差异已裁决。
- **依赖**：11.7（有 semver 承诺后治理才有约束力）。

**提示词**：

```text
任务：Spark 工单 14.1——公共面治理（engine 导出收窄 + protocol 合同清单）。

前置阅读：packages/engine/src/index.ts（现状全量导出）、全仓 import 统计（grep "@spark/engine" 找出实际
消费符号清单——web/cli/evals/tests 分类）、ARCHITECTURE.md §9.6（knip 检查项）、doc/02 §4.4（协议演进规则）。
要求：
1. 消费清单裁决表：每个现导出符号 ×（谁在用/归属公共 or internal）。公共集缺省 = Engine、loadConfig、
   错误类型、ulid/newIds；其余进 ./internal 子路径导出（package.json exports 加 "./internal": "./src/index-internal.js"）。
2. 迁移：测试与 examples/evals 改从 ./internal 引用被收窄符号；生产代码（web/cli）不经 ./internal（grep 断言）。
3. protocol：公共 API 清单写入 doc/02 §4 新小节（各模块标注 合同/内部），演进规则引用 §4.4 不复制。
4. knip（或 depcheck）接入根 lint——按 ARCHITECTURE §9.6 表；首次报告差异全部裁决（删/留有理由）。
验收：pnpm -r typecheck/lint/test 零回归；grep 证明生产代码无 ./internal 消费。
提交：refactor(engine): 工单 14.1——公共面收窄（./internal 子路径）与 protocol 合同清单。
```

## 14.2 契约测试生成器：zod → SDK 一致性套件（doc/06 L1.5 落地）

- **目标**：doc/06 §1 规划的 L1.5 契约层落地，并升级为 SDK 一致性套件（14.3/14.4 的验收地基）。
- **产出**：packages/protocol/scripts/gen-contract.ts：从 zod schema（events + api DTO）自动生成 tests/contract/ 用例——①合法 payload → zod round-trip + JSON Schema（jsonSchemas 导出）往返一致；②非法 payload（逐字段变异）→ 400 E_VALIDATION 期望；③Transport 接口契约用例模板（供 14.4 双通道实现各跑一遍）；CI 增"生成物与 schema 同步"校验（重生成后 git diff 为空）。
- **验收**：生成物入库且 CI 同步校验绿；人为改 schema 不重生成 → CI 红；server 既有手写重复用例按 doc/06 §4 建议替换（保留 SSE 时序类）。
- **依赖**：14.1（公共面先定）。

**提示词**：

```text
任务：Spark 工单 14.2——契约测试生成器（L1.5 → SDK 一致性套件地基）。

前置阅读：doc/06 §1 契约测试生成规则与 §4 升级建议、packages/protocol/src/schema.ts（jsonSchemas 导出）、
src/events.ts 与 api.ts（zod 源）、packages/protocol/tests/ 现状、scripts/ 现有脚本风格。
要求：
1. scripts/gen-contract.ts（tsx 直跑，同 evals 模式）：遍历导出 zod schema → 生成三类用例文件到
   packages/protocol/tests/contract/（生成物头部标注"自动生成，勿手改"）：a) 合法样例 round-trip；
   b) 字段变异非法样例 → 期望解析失败；c) Transport 接口契约模板（connect/onEvent/reply 语义断言骨架，
   参数化 transport 工厂）。
2. 样例值策略：schema 内嵌 example 或按类型合成器（string/number/union 递归），禁随机（确定性优先）。
3. CI（ci.yml test 步骤前）：重跑生成器 → git diff --exit-code tests/contract/（不同步即红）。
4. server 手写重复用例替换：按 doc/06 §4——DTO 往返类交给生成物，SSE 时序/背压手写保留。
验收：生成物全绿；人为 schema 改动触发 CI 红的演练记录。
提交：test(protocol): 工单 14.2——契约用例生成器与 CI 同步校验。
```

## 14.3 @spark/sdk：客户端包 + 四端迁移消费

- **目标**：薄客户端 SDK（L2 层）——一个 client 实现、HTTP transport 先行；四端迁上来吃狗粮。
- **产出**：① packages/sdk：createClient(baseUrl, {token?}) → {sessions: {list/create/get/send/interrupt/compact/fork/archive…按需透传 REST}, events: {subscribe(onEvent), replaySince(seq)}, approvals: {resolve(requestId, effect)}, close()}——全部类型从 @spark/protocol 导入（API DTO + Transport 接口），内部组装 transport-node；零业务逻辑（boring：就是 Transport + 便利函数，禁连接管理器/重试策略工厂类设计）；② web 与 cli 的 transport 组装点迁到 @spark/sdk（web 的 stores/contexts 与 cli 的 store 只换 import 源，行为零变化）；③ 11.7 版本策略表加 @spark/sdk 行。
- **验收**：web/cli 测试全绿零行为变化（diff 审查只含 import 迁移与装配收敛）；examples 里 10 行内最小连接示例跑通。
- **依赖**：14.1、14.2。

**提示词**：

```text
任务：Spark 工单 14.3——@spark/sdk 客户端包与四端迁移。

前置阅读：doc/08 §4 决策段与工单 14.3、packages/protocol/src/transport.ts（Transport 接口）与
transport-node.ts（内核）、apps/web/src/transports/http.ts（现组装点：token/重连/错误映射）、
apps/cli/src/store.ts（cli 消费点）、ARCHITECTURE.md §9（禁过度设计红线）。
要求：
1. 新建 packages/sdk（workspace 成员）：createClient(baseUrl, {token?, fetch?}) 返回
   {sessions, events, approvals, close} 三组便利 API——方法集按 web/cli 实际调用面收敛（不预先铺全 REST）；
   类型全部 re-export 自 @spark/protocol；实现 = transport-node 组装 + 薄方法，禁任何状态机/策略类。
2. 迁移 web：transports/http.ts 的组装逻辑移入 sdk（web 变纯消费）；迁移 cli：store 的 client 构造换 sdk。
   迁移 diff 原则：行为零变化，只动装配与 import。
3. examples/sdk-minimal.ts：≤10 行连接 + 订阅 + 发送示例（tsx 可跑）。
4. package.json：license/repository/exports（同 11.6 口径）；CONTRIBUTING 版本策略表补一行。
验收：pnpm -r test 全绿；web E2E 七例回归；diff 审查无行为变化。
提交：feat(sdk): 工单 14.3——@spark/sdk 薄客户端包与 web/cli 迁移。
```

## 14.4 InProcessTransport + 嵌入指南

- **目标**：第二通道——进程内直连 Engine，过同一 Transport 接口、同一契约套件（14.2c 模板）。
- **产出**：① packages/sdk 增 createInProcessClient(engine)（或 packages/engine 侧提供 Transport 适配——按依赖方向裁决：sdk 依赖 engine 可选 peerDependency，ADR 记录）；实现 = 订阅 engine → 事件流、REST 语义映射 Engine 门面方法（不存在的命令如实 E_UNSUPPORTED，禁假实现）；② 过 14.2 契约模板 + evals 回归；③ 12.3 spark -p 重构为消费此通道（消重）；④ 嵌入指南入文档（new Engine({root}) 生命周期/事件订阅/审批接管的六段说明 + examples/sdk-embed.ts）。
- **验收**：契约套件双通道（HTTP/InProcess）同绿；spark -p 行为回归零变化；嵌入示例 ≤30 行跑通。
- **依赖**：14.2、14.3、12.3。

**提示词**：

```text
任务：Spark 工单 14.4——InProcessTransport 与嵌入指南。

前置阅读：doc/08 工单 14.4 与 §4 决策段、packages/protocol/src/transport.ts（接口合同——双通道必须逐方法
一致）、packages/sdk 现状（14.3 产物）、examples/evals/src/harness.ts（进程内装配）、apps/cli 12.3 的 -p 实现。
要求：
1. 先裁决依赖方向并写进提交说明（建议：sdk 依赖 engine 为 optional peer——InProcess 只在宿主已装 engine 时可用，
   HTTP 通道零 engine 依赖）。
2. InProcessTransport：实现 Transport 全接口——事件流 = engine.subscribe 直通（seq/durable 语义与 SSE 一致）；
   命令方法映射 Engine 门面（engine 不支持的命令 → E_UNSUPPORTED 显式错误，禁假实现）；审批 resolve 走
   engine 权限服务同一路径。
3. 契约：14.2 的 Transport 契约模板对两通道各实例化跑一遍（测试文件参数化）。
4. 重构 apps/cli -p 模式改走 InProcessTransport（行为回归零变化，删直连 Engine 的重复装配）。
5. examples/sdk-embed.ts：≤30 行嵌入示例（建引擎→订阅→发消息→审批应答→关闭）；嵌入指南六段写入
   doc/02 §4 新小节或独立 doc 按单一来源裁决。
验收：契约双通道全绿；-p 三态回归；示例实跑。
提交：feat(sdk): 工单 14.4——InProcessTransport（双通道同契约）与嵌入指南。
```

## 14.5 examples 画廊：三个范式示例

- **目标**：把"能在 Spark 上造什么"变成可跑的入口。
- **产出**：examples/sdk-viewer（≤150 行最小 web viewer：Vite + createClient + applyEvent → 只读消息流——证明"第三方 UI 就是投影"）；examples/sdk-bot（automation bot：SDK 建会话→发任务→收 turn.completed→写日志，Node 脚本形态）；examples/sdk-tui（自定义 TUI 骨架：Ink + createClient 复用 applyEvent 状态）；三例统一 README（examples/README.md 索引）与 CI typecheck 覆盖（workspace 成员或 tsc 单列）。
- **验收**：三例在真实 server（ScriptedLlm）下全部跑通；每例 ≤300 行且零业务抽象（boring 红线）；CI 全绿。
- **依赖**：14.3（14.4 后补 embed 例链接）。

**提示词**：

```text
任务：Spark 工单 14.5——examples 画廊三例。

前置阅读：doc/08 工单 14.5、packages/sdk API 面（14.3 产物）、packages/protocol/src/apply-event.ts、
examples/ 目录现有组织方式、examples/evals 的 ScriptedLlm 复用方式（本地无真实模型时的演示数据源）。
要求：
1. examples/sdk-viewer/：Vite 最小页（≤150 行）：createClient → 订阅 → applyEvent → 渲染消息/工具状态/
   审批只读提示；样式用Tailwind token（DESIGN §13.C 子集），禁花哨（反 AI 味红线同样适用于示例）。
2. examples/sdk-bot/：Node 脚本（≤120 行）：建会话→send→等 turn.completed→结果写 stdout/文件；
   支持 ScriptedLlm 环境变量切换演示模式。
3. examples/sdk-tui/：Ink 骨架（≤300 行）：applyEvent 驱动四区极简版。
4. examples/README.md 索引（三例一句话 + 运行命令）；三例入 workspace 或 CI typecheck 名单。
验收：三例真实 server 走查记录；CI 全绿；行数红线核查。
提交：feat(examples): 工单 14.5——SDK 画廊三例（viewer/bot/tui）。
```

## 14.6 开发者文档站

- **目标**：SDK 的门面——五分钟跑通其中一例。
- **产出**：apps/docs（VitePress 最小配置或纯 typedoc + markdown，按 boring 原则二选一，ADR 一行记录）：五页（Getting Started / L0–L4 分层模型（doc/08 §4.0 五层开发者面）/ Transport 双通道 / 事件词表参考（从 jsonSchemas 生成）/ FAQ）；deploy = GitHub Pages workflow（tag 触发，随 11.7 release 排）；typedoc 从公共导出（14.1 治理后）生成。
- **验收**：站点本地构建 → 部署 → 外网可达；"五分钟"实测：新目录 npm init → 装 @spark/sdk → 跑通 viewer 示例。
- **依赖**：14.1/14.3/14.5。

**提示词**：

```text
任务：Spark 工单 14.6——开发者文档站。

前置阅读：doc/08 §4.0 五层开发者面与工单 14.6、14.1 治理后的公共导出清单、11.7 release workflow（部署挂点）、
DESIGN.md §12（文档站也守反 AI 味——禁渐变 hero/emoji 装饰）。
要求：
1. 形态二选一并留一行决策记录：a) VitePress（apps/docs，内容即 markdown）；b) typedoc HTML + 手写
   guide markdown，GitHub Pages 直发。选 a（boring 与生态惯例）除非构建依赖冲突。
2. 五页内容：Getting Started（五分钟跑 sdk-viewer）/ 分层模型（L0 嵌入→L4 扩展，doc/08 §4.0 改写）/ 
   双通道（HTTP 与 InProcess 同契约）/ 事件词表参考（scripts 从 jsonSchemas 生成 markdown，CI 同步校验）/ 
   FAQ（审批语义/安全模型/稳定性承诺各一段）。
3. deploy：release.yml 增 pages 步骤（tag 触发）。
验收：本地构建预览全页；五分钟实测记录；词表参考页与 schema 同步校验绿。
提交：docs(site): 工单 14.6——开发者文档站（VitePress 五页 + Pages 部署）。
```

---

# 5. 阶段十五：生态面（放大器，外部使用者出现后立项）

> 主题：MCP server 模式、跨语言生成、技能创作套件、skills 边界决策。**本阶段全部工单立项前必须重估**（依赖外部用户信号与 Q-1 拍板）。

## 15.1 Spark as MCP server（stdio）

- **目标**：把引擎能力经 MCP 暴露给其他 agent——Spark 成为"带审计的执行后端"。
- **产出**：apps/cli 或独立入口 spark mcp：stdio MCP server（@modelcontextprotocol/sdk Server 端已在依赖谱）暴露三工具：spark_run（prompt+cwd → 建会话跑完返回最终文本与摘要事件）、spark_sessions（列表+状态）、spark_events（session+since → durable 事件页）；审批策略 = spark mcp 模式下权限规则照常生效（挂起时 fail-closed 超时拒绝——MCP 工具调用是同步请求，不支持交互审批，如实声明）；mini ADR（D30）。
- **验收**：Claude Code / ZCode 实配该 MCP server 并完成一次真实任务调用；审计流有对应记录；超时拒绝路径验证。
- **依赖**：外部用户信号；Q-1 无关（不扩 skills）。

**提示词**：

```text
任务：Spark 工单 15.1——Spark as MCP server（stdio，mini ADR D30）。

前置阅读：ARCHITECTURE.md D16（MCP client 侧实现——server 侧复用同 SDK）、D24（鉴权红线）、
packages/engine/src/mcp/manager.ts、examples/evals/src/harness.ts（进程内装配）、doc/08 工单 15.1。
要求：
1. mini ADR D30：MCP server 模式决策（stdio 入口 spark mcp / 三工具集 spark_run/spark_sessions/spark_events /
   审批语义 = MCP 同步调用不支持交互，权限规则生效 + fail-closed 超时拒 / 不暴露流式——MCP 工具是请求响应，
   流式走 spark_events 轮询），被否备选（SSE MCP transport——等 V2-21 一并；免审批直通——违反铁律）。
2. 实现：apps/cli 增 mcp 子命令 → stdio server（@modelcontextprotocol/sdk Server）→ 进程内 Engine（12.3 同款
   装配）；spark_run 返回 {finalText, sessionId, finish}；工具 input zod→JSONSchema 走 z.fromJSONSchema 既有往返。
3. 审计：spark_run 的权限决策照常进 audit.jsonl（7.12 链路不旁路）。
4. 测试：InMemoryTransport 三工具用例 + 超时拒绝路径；真实验证 = 用户在 Claude Code 实配走查（记录留档）。
验收：外部 agent 实调成功；审计记录可查；超时 fail-closed 演练。
提交：feat(cli): 工单 15.1——spark mcp stdio server（D30）。
```

## 15.2 OpenAPI 导出 + 生成式 Python 客户端

- **目标**：跨语言"生成物不手写"——从 zod jsonSchemas 与路由表产出 OpenAPI，代码生成 Python 客户端。
- **产出**：① scripts/gen-openapi.ts：合并 REST 路由表（apps/server routes 元数据）与 jsonSchemas → openapi.json（CI 校验同步，同 14.2 模式）；② clients/python/：openapi-generator 生成，随 release 发 PyPI（15.2b，条件性——先只入库生成物）；③ 文档站增 Python 页。
- **验收**：openapi.json 通过 swagger 校验；Python 客户端对真实 server 跑通 建会话/发消息/收审批 三调用；CI 同步校验绿。
- **依赖**：14.2、11.7；外部需求信号。

**提示词**：

```text
任务：Spark 工单 15.2——OpenAPI 导出与生成式 Python 客户端。

前置阅读：doc/08 §0 已拍板"跨语言=生成物不手写"、packages/protocol/src/schema.ts（jsonSchemas）、
apps/server/src/routes.ts（路由清单——考虑给路由加轻量元数据导出而非解析源码）、scripts/ 生成器先例（14.2）。
要求：
1. routes.ts 增结构化路由元数据导出（方法/路径/zod schema 引用/错误码）——不引装饰器框架，普通导出数组。
2. scripts/gen-openapi.ts：路由元数据 + jsonSchemas → openapi.json（3.1）；CI 同步校验（同 14.2 模式）。
3. clients/python/：openapi-generator CLI 生成（生成配置入库，产物入库），README 声明"生成物勿手改"；
   本工单不发 PyPI（15.2b 条件性）。
4. Python 冒烟：本地起 server → python 客户端三调用脚本（建会话/发消息/列审批）。
验收：swagger 校验通过；三调用实跑；CI 同步绿。
提交：feat(scripts): 工单 15.2——OpenAPI 导出与 Python 生成客户端。
```

## 15.3 skills/命令 TS 创作套件

- **目标**：D18 声明式清单的作者体验层——类型、校验、脚手架。
- **产出**：① packages/protocol 导出 skill.json zod schema（单一来源，loader 复用）；② spark skill init <name> 脚手架（生成清单骨架+示例钩子+README 模板）；③ spark skill lint（校验清单：词表合法性/钩子 on 限定内置词表——复用 loader 校验逻辑）；④ 文档：技能创作指南（声明式边界讲清楚：能做什么/不能做什么/MCP 分工）。
- **验收**：init→lint→放入 skills 目录→引擎识别 全链路走查；demo-ping 迁移用套件重建后行为一致。
- **依赖**：外部作者信号。

**提示词**：

```text
任务：Spark 工单 15.3——skills TS 创作套件。

前置阅读：ARCHITECTURE.md D18（声明式边界——套件不能越过它）、packages/engine/src/skills/loader.ts
（校验逻辑——抽到 protocol 或共享处的依赖方向裁决）、examples/skills/demo-ping（样例）、doc/08 工单 15.3。
要求：
1. skill.json zod schema 下沉 packages/protocol（loader 与 CLI lint 同一来源——单一来源纪律）；
   loader 改从 protocol 导入（engine 依赖方向不变）。
2. apps/cli 增 skill 子命令：init（骨架生成）/lint（复用 schema + loader 规则校验，输出人话错误）。
3. 文档：技能创作指南一页（能做什么：事件注册/声明钩子；不能做什么：代码执行/自定义数据构造器——引用 D18
   不复制；要工具去 MCP）。
4. 迁移验证：demo-ping 用 init 重建 → 引擎 e2e 识别与事件落盘行为一致。
验收：全链路走查；loader 单测零回归。
提交：feat(protocol+cli): 工单 15.3——技能创作套件（schema 下沉 + init/lint）。
```

## 15.4 skills 边界决策：是否走向受限可编程（Q-1，研究 + 条件实现）

- **目标**：回答 D18 的边界要不要动。两步：研究判决 → 条件实现。
- **产出**：① 研究报告（doc/10-skills-v2.md）：三个候选（a. 维持纯声明 b. 受限脚本钩子（清单声明脚本文件，引擎 worker 池执行、无网络、超时熔断）c. 完全可编程插件（JS 入口））× 安全面/生态上限/工程成本；给出单一建议；② 若拍板 b：mini ADR + 实现工单（worker 池沿用引擎子进程纪律、权限挂钩审批管线）；若拍板 a：关闭本线，登记"MCP 兜底一切可编程诉求"。
- **验收**：判决完成（Q-1 关闭）；若实现，钩子脚本在沙箱纪律下运行且有超时/失败闭合单测。
- **依赖**：外部作者生态信号；13.1 后（能力证据支撑决策）。

**提示词**：

```text
任务：Spark 工单 15.4——skills 边界研究报告（Q-1 前半，不写产品代码）。

前置阅读：ARCHITECTURE.md D18（现行判决与理由）、doc/07 §4.1（判决记录格式）、doc/01 §7.3（Claude Code plugins
与 opencode plugins 的能力面——在线调研，AGENTS §2.12 禁克隆）、doc/08 工单 15.4。
要求：
1. 在线调研三家 skills/plugins 机制的能力面与安全模型（Claude Code / opencode / Gemini CLI extensions）。
2. 产出 doc/10-skills-v2.md：三候选（纯声明/受限脚本钩子/可编程插件）×（安全面/生态上限/工程成本/与 MCP
   分工）对比 → 单一建议 + 理由 + 若 b 的实现草图（worker 池/权限挂钩/超时熔断）。
3. 不实现；判决由人类拍板 Q-1 后另开工单。
验收：报告完成；Q-1 具备拍板条件。
提交：docs(research): 工单 15.4——skills v2 边界研究报告（doc/10）。
```

---

# 5A. 阶段十六：命令面新机制（九工单 16.1–16.9；消解 doc/02 §8.7 V2-27~V2-35）

> 立项依据：晚风 2026-09-01 指令——九条新机制命令（/agents /plan /trust /init /goal /arena /voice /lsp /extensions）全部做成，"即使从 0 开始也可以"；开源参考能复用就复用。在线调研（2026-09-01，AGENTS §2.12 纪律）结论：**qwen-code 与 gemini-cli 均 Apache-2.0**（与 Spark MIT 单向兼容，复用须保留原版权声明）、opencode MIT；/goal 与 /arena 为 qwen-code 独有只能参考设计，/init 可直抄 opencode MIT 模板。执行排在 doc/02 批次 2（10.12–10.22）之后；与阶段十一~十五无强依赖，可交叉。
> 开工顺序（按成本升序）：16.1 /init（零依赖纯提示词工程，最先）→ 16.2 /agents → 16.3 /plan → 16.4 /trust → 16.5 /extensions → 16.6 /voice → 16.7 /goal → 16.8 /arena → 16.9 /lsp（大件殿后）。
> 每张提示词按附录 A 六段式现场生成（本阶段不预置全文——开源参考文件多，提示词统一要求"前置阅读含开源参考列，在线访问参考路径，禁克隆"）。

## 16.1 /init 项目上下文文件生成（消解 V2-27）

- **目标**：`/init` 命令分析当前目录生成 AGENTS.md 初稿——Spark 版项目上下文文件生成。
- **开源参考（复用优先）**：sst/opencode（MIT）仓库 packages/opencode/src/command/template/initialize.txt——**可整段复用+版权声明**（理念：每行内容都须回答"没有它代理会不会踩坑"，否则删掉；只在仓库答不出时才集中问一批问题）；qwen-code 仓库（initCommand.ts，Apache-2.0，抄流程：先建空文件保证模型写入有落点 + 已存在非空则覆盖确认）；gemini-cli 仓库 packages/core/src/context/initializer.ts 同源对照。
- **产出**：① 命令进 10.18 描述符体系（kind=prompt，走 prompt 命令通道——零新引擎机制）；② 提示词模板入引擎提示词存放处（照 doc/02 §5.11 组装纪律），加"遵守四类约束框架（AGENTS 管项目/DESIGN 管视觉/SKILL 管流程/专属文件管工具差异）"引导；③ 生成走 write 工具天然过审批；④ 覆盖确认（AGENTS.md 已存在且非空 → 前端确认后注入"改写既有文件，保留其中仍有效的约束"提示词）。
- **验收**：空目录跑 /init 生成三段式（项目概览/构建运行命令/开发约定）AGENTS.md；已有文件时弹确认；产物经审批链落盘。
- **依赖**：10.18。

## 16.2 /agents 子代理管理（消解 V2-33）

- **目标**：子代理配置文件化管理——Markdown+frontmatter 定义子代理，分层加载，面板查看/启停。
- **开源参考**：qwen-code `packages/core/src/subagents/subagent-manager.ts`（1751 行，**直译结构**：五级分层 session>project>user>extension>builtin、带缓存 CRUD、写前校验+防重+assertCanCommit 提交护栏）；`subagents/types.ts`（SubagentConfig 完整接口）；frontmatter 宽容解析（无效字段丢弃不炸）。opencode `packages/opencode/src/config/agent.ts`（MIT，glob 扫描 `{agent,agents}/**/*.md`）轻量对照。
- **产出**：① 子代理定义文件两层：`.spark/agents/*.md`（项目）+ `~/.spark/agents/*.md`（用户），frontmatter 字段对齐 Spark 既有子代理运行时（模型/提示词/工具白名单）；② engine loader 扫描两层（复用 skills loader 模式）；③ 协议+server：GET /api/agents 只读清单 + 启停写 spark.json（走 10.20 的 /api/settings——本工单即 10.20"子智能体页"的后端）；④ web 设置子智能体页从占位升真值；⑤ CLI `/agents` 面板只读清单。
- **红线**：agent 定义文件写入须过审批；审批一律冒泡回主会话（Spark 既有单口径，qwen 的 bubble 模式仅作语义理解参考不引入双轨）。
- **验收**：放置 .md 后 /agents 与 web 页面立即可见；启停生效；引擎 spawn 子代理读定义成功。
- **依赖**：10.18、10.20。

## 16.3 /plan 计划模式（消解 V2-34）

- **目标**：read-only 档位——计划模式下写类工具全 DENY，模型产出计划经用户批准后退出恢复执行。
- **开源参考**：gemini-cli `packages/core/src/policy/policies/plan.toml`（**优先级规则直接翻译**：plan 兜底 DENY 40 / 只读工具 ALLOW 50 / 模式转换 70）；qwen-code `packages/core/src/tools/exitPlanMode.ts` 两个细节必抄：① approvalModeRevision 快照——审批期间用户手动切档则批准过期作废；② enter_plan_mode 视为执行边界——同批后续工具调用跳过，留待下一轮模型观察新模式。二者天然契合失败闭合铁律。
- **产出**：① 落在**既有审批规则引擎**（permission/rules.ts）加 mode 前置条件 + 写类 DENY（不做独立状态机——qwen 也只是 ApprovalMode 的一个值）；② run-loop 模式位 `session.mode: default|plan`，新事件 `session.mode.changed`（durable，走 new-event-type skill 六处同步）；③ /plan 进入（记 prePlanMode）与 /plan exit 恢复；④ 模型侧退出计划=产出计划文本+用户批准（走审批链）回 default；⑤ 四端 mode 指示（CLI footer 行/web 状态条/移动端）。
- **验收**：plan 模式下 write/edit/bash 写操作全拒（含提示词注入诱导场景）；exit 须用户批准；审批期间切档则批准作废；mock/四端 applyEvent 单测。
- **依赖**：10.18；new-event-type 流程。

## 16.4 /trust 文件夹信任（消解 V2-31）

- **目标**：目录级信任分级——首启进入新 cwd 判定信任档，未信任目录下敏感操作收紧审批。
- **开源参考**：qwen-code 仓库（trustedFolders.ts 435 行 + trust-precedence.ts——路径见本行下方行文）（435 行）+ `trust-precedence.ts`（**算法精华只参考设计**：路径变体集合（大小写/分隔符归一）+ 包含深度最深者胜 + 同深度 untrusted 压过 trusted + 结果与规则插入顺序无关——防恶意项目靠顺序效应绕过）；proper-lockfile 跨进程锁 + 原子写。
- **产出**：① `~/.spark/trusted.json`：path→三档（trusted/parent/none）；② 引擎侧 cwd 未信任时：bash 写操作与外部 MCP 收紧到 ask 档（不新增拒绝面——收紧审批而非扩权）；③ /trust 面板：当前目录信任档查看/修改；④ 首启判定：新 cwd 时四端信任询问（web 横幅/CLI 询问/移动端弹窗）。
- **动机登记（迷你 ADR 前置）**：Spark 本地单用户，信任机制动机=打开陌生仓库时收紧默认档（对应 doc/02 §1.4 提示词注入威胁模型）——ADR 经晚风确认后再实现（§0.2 增 Q-6）。
- **验收**：未信任目录 bash 默认 ask；最深匹配算法单测（含顺序无关性断言）；信任变更原子写。
- **依赖**：10.18；ADR 前置。

## 16.5 /extensions 扩展管理（消解 V2-32；含 V2-01/V2-02 的启停半边）

- **目标**：声明式内容包——扩展=目录（清单 spark-extension.json：skills/agents/命令/MCP servers 声明），**不执行任意代码**（比 opencode 的 TS 插件更契合 Spark 禁黑盒运行时红线）。
- **开源参考**：qwen-code `packages/core/src/extension/extensionManager.ts`（3375 行，**参考设计大幅裁剪**：只取发现/启停/热刷新三动作；三阶段事务日志简化为 staging+原子 rename 两步）；`extension-store.ts` 三层激活（override>workspace>default）值得翻。v1 **不做安装/下载/网络源**（Spark 无 marketplace——qwen 四路安装源不进）。
- **产出**：① 扩展清单 schema（@spark/protocol zod strict）；② engine loader 发现 `~/.spark/extensions/<id>/`，启停三层激活写 spark.json（走 /api/settings）；③ /extensions 面板 + web 设置页（同时点亮 MCP/技能页的启停半边）；④ 热刷新：激活变更重扫注册表不重启引擎；⑤ symlink 安全检查照抄 qwen（防 staging 目录逃逸）。
- **验收**：放置含 skill+agent 的扩展目录→清单可见→启停生效→热刷新；symlink 攻击用例拒绝。
- **依赖**：10.18、16.2、10.20。

## 16.6 /voice 语音听写（消解 V2-28）

- **目标**：Composer 语音输入——hold/tap 两模式，转写文本入输入框。
- **开源参考**：qwen-code 仓库 qwen-code 仓库 ui/voice/ 目录（voice-recorder / sox-recorder / voice-transcriber）（**参考设计**：FallbackVoiceRecorder 降级链 native→arecord→sox；sox 静音自动停止参数 `['silence','1','0.1','3%','1','2.0','3%']` 可直抄；`voice-transcriber.ts` 的 **DNS 解析后 SSRF 防护**（IPv6 过渡地址 BlockList）必须抄）；gemini-cli `packages/core/src/voice/`（Apache-2.0，TranscriptionProvider 接口形状 connect/sendAudioChunk/disconnect/getTranscription 值得翻）。
- **产出**：① STT 后端走 **OpenAI 兼容转写 API**（models.json 供应商可配 transcription 端点——无 DashScope 依赖最现实；本地 whisper.cpp 分发模型太重不进首期）；② 采集分层：web 端 getUserMedia+MediaRecorder（浏览器原生，v1 优先落地）；CLI 端 SoX 子进程降级（Windows 无 SoX 时明确提示不裸降——fail-closed）；③ /voice hold/tap/off 模式切换；④ 音频不经模型上下文=live 不落盘（只有转写结果进 user.message——durable/live 二分无冲突）。
- **验收**：web 端按住说话→松开→文字入 Composer；CLI SoX 环境（用户现场走查）同链路；无 SoX 明确提示不静默；SSRF 防护单测。
- **依赖**：10.18、10.20（供应商配置面）。

## 16.7 /goal 持续目标（消解 V2-35；qwen 独有，自研设计）

- **目标**：设定目标条件，引擎循环工作直到条件满足或护栏触发。
- **开源参考**：qwen-code `packages/core/src/goals/`（**只参考设计**——体量约 20 文件不整体移植）。必移植三护栏：① **迭代硬上限**（MAX_GOAL_ITERATIONS=50——防 judge 永远说不满足的 token 焚烧）+ judge 超时（25s）即暂停循环保留目标；② **evidenceRefs 证据引用**——完成主张须引用会话记录中的证据条目（与 surface 纪律"模型可见必被记录"同构；判据=JSONL 工具结果事件，"送达不等于状态改变"规则写死提示词）；③ **token 预算 + wind-down 交接**——预算耗尽前最后回合要求交接总结不裸断。
- **产出**：① run-loop goal 循环：turn.completed 时旁路 LLM judge（不占主上下文），未满足→注入续跑提示（合成输入走 durable 且**如实标注 synthetic**——不伪造用户意图，目标内容即用户先前指令）；② 新事件 goal.set/updated/completed/paused（durable，六处同步）；③ /goal set <条件>/clear/status；④ 护栏：50 迭代上限+每目标 token 预算（默认值开工时迷你 ADR 定）+用户 Esc/interrupt 立即停。
- **红线**：续跑不绕过审批（每 turn 照常走审批链）。
- **验收**：小目标 2-3 迭代完成；上限触发暂停不清目标；interrupt 即停；事件回放恢复 goal 状态。
- **依赖**：10.18、new-event-type 流程。

## 16.8 /arena 多模型竞答（消解 V2-29；qwen 独有，参考设计+选译）

- **目标**：同一 prompt 并行 N 个模型（≤5）各自独立改代码，对比产出+用量，选定胜者应用其改动。
- **开源参考**：qwen-code `packages/core/src/agents/arena/ArenaManager.ts`（850 行，**参考设计**：git worktree 文件级隔离、InProcessBackend 进程内并行比 PTY 轻——Spark headless 采 InProcess 路线，复用阶段五子代理设施）；`arena/types.ts`（ARENA_MAX_AGENTS=5；ArenaAgentStats 用量归并字段：tokens 输入输出/时长/工具调用数）；会话结束旁路 LLM 生成 diff 对比总结。
- **产出**：① 命令与引擎：并发 spawn N 个子代理式会话（各自 root git worktree `~/.spark/arena/<sid>/<model>`）；② diff 汇总（对比总结可后置阶段内二批）；③ web/CLI 卡片呈现（状态/tokens/时长/文件增删行）；④ 胜者应用：applyWorktreeChanges 前逐文件过审批 + **删除类改动按 §2.10 拒绝**（Spark 比 qwen 加严处）；⑤ 用量归并走各会话 JSONL delta 聚合；⑥ 清理：无论成败全量清 worktree（~/.spark 下引擎自管目录，非仓库文件——边界写进 ADR）。
- **验收**：2 模型竞答一回合：并行运行、卡片实时更新、选胜者后主工作区出现其改动（经审批）；无胜者不改主工作区；用量归并正确。
- **依赖**：16.2、simple-git 新依赖（MIT，提交说明登记理由）。

## 16.9 /lsp LSP 集成（消解 V2-30；大件殿后）

- **目标**：语言服务器集成——诊断/定义跳转/引用查找作为模型工具与开发者面板。
- **开源参考**：qwen-code `packages/core/src/lsp/`（**参考设计+换基座**：其自研 330 行 JsonRpcConnection 不值得重复——改用 `vscode-languageserver-protocol`+`vscode-jsonrpc`（MIT 微软官方）省掉；**必抄两安全细节**：spawn 前剥离 LD_PRELOAD/NODE_OPTIONS 等敏感环境变量；config hash 不变不重启进程）；统一单工具 12 操作枚举（goToDefinition/findReferences/hover/documentSymbol/diagnostics 等）设计照抄。
- **产出**：① engine 新模块 lsp/：连接管理（stdio 子进程）+诊断缓存；② 新事件 `lsp.diagnostics`（durable——诊断进模型上下文即模型可见必被记录，六处同步）；③ 模型侧单 `lsp` 工具 operation 枚举（new-tool skill 四路径单测）；④ 配置 `.spark/lsp.json`（语言→command，v1 手写配置无自动发现）；⑤ /lsp 面板：连接状态+诊断摘要；⑥ web 诊断呈现进会话流。
- **验收**：TS/Python 各接一个真实 server（typescript-language-server/pyright）；诊断事件流正确；模型经 lsp 工具查定义成功；敏感环境变量剥离单测。
- **依赖**：new-tool + new-event-type 两个 skill 流程；vscode-languageserver-protocol 新依赖（MIT，登记）。

> 阶段十六治理注记：九工单消解既有挂池项（doc/02 §8.7 V2-27~35 对应行开工时标"已立项 16.x"）；逐张 lift 进 doc/02 §8 建阶段表（工单号不变，附录 A 第 5 条流程）；新事件/新工具分别走 new-event-type 与 new-tool skill 全流程；所有参考项目在线访问禁克隆（AGENTS §2.12），复用片段保留原版权声明（qwen-code/gemini-cli Apache-2.0、opencode MIT）。

# 5B. 阶段十七：代码冗余整改（八工单 R-A～R-H；2026-09-03 全仓源码级冗余审计立项）

> 立项依据：晚风 2026-09-03 指令——"检查所有代码有没有冗余、有没有堆在一个文件里，能封装的封装、能复用的复用"。当日完成全仓源码级审计（packages/engine 9966 行 / packages/protocol 2578 行 / apps/web 10338 行 / apps/server 1579 行 / apps/cli 3093 行 / apps/mobile 2809 行 / apps/miniapp 2630 行，共约 5.4 万行）：**总体分层与 D22 四端共享纪律良好、engine 无循环依赖、协议面无私设 wire 类型；问题集中在四类**——巨石文件（engine.ts 2028 行六职责叠加 / mock.ts 1374 / routes.ts 702 / Composer 682 等）、跨端纯逻辑与文案重复（部分已漂移成 bug）、包内样板重复（加载 effect×12 / try-catch×40 等）、死代码（零使用导出一批 + 整文件级六项待五层级确认）。
> 执行原则：**行为等价重构**——全部工单不改任何对外行为/协议/事件语义；每批次独立 commit；测试全绿是提交前置。与阶段十一~十六无强依赖，可交叉执行；**建议整体排在 14.1（公共面治理）之前**——先消肿再定 SDK 承诺面，14.1 的导出裁决会因此更省力（14.1 本工单库行文不改动，开工时由该工单会话自行核对残留量）。
> 开工顺序（收益大 × 风险低优先）：R-A 死导出清理 → R-B protocol 共享资产下沉 → R-C engine util 收敛（含真 bug）→ R-D engine.ts 拆分 → R-E web 收敛 → R-F server 去样板 → R-G cli 收敛 → R-H 移动双端共享 controller。R-B/R-C 可并行；R-D 依赖 R-C（util 先就位）；R-H 依赖 R-B（文案表/格式化先单源）。
> 审计证据（file:line）在 §5B.0 汇总登记，**工单执行时以 grep 现场复核为准**（行号会随批次推进漂移）；本阶段不为消缺登记 H 号（doc/07 编号冻结）。

## 5B.0 审计发现汇总（2026-09-03；执行时现场复核行号）

**巨石文件**：engine.ts 2028 行=门面+会话仓储+索引维护+搜索+设置持久化+子代理执行体+组装根；apps/web/src/transports/mock.ts 1374 行=40+ Transport 方法（约 180 行静态夹具内联）；apps/server/src/routes.ts 702 行=46 路由；Composer.tsx 682 行=6 职责；ModelSettingsPage.tsx 572 行=三个零共享 section；mobile 三屏（SessionsScreen 468/SessionScreen 407/SettingsScreen 334）；miniapp session/index.tsx 412 行=settings/index.tsx 312 行。

**跨端重复（已漂移/已分叉）**：① SSE 会话流状态机三写——packages/protocol/src/transport-node.ts 内 HttpTransport.loop 与 SessionEventSource.loop 同构两份，apps/mobile/src/transport/rn-event-source.ts 与 apps/miniapp/src/transport/mini-event-source.ts 又各一份（重连循环+401/403 鉴权收敛+水位）；② toolCategoryOf/flowRowsOf 双份——apps/cli/src/flow-rows.ts 与 apps/web/src/features/chat/chat-flow-rows.ts 同源，web 侧 groupTools/firstReasoningPerTurn 参数已漂移；③ fmtTokens 三份逐字同（web/cli×2）；formatTimestamp、isToday/fmtDate、dotColor、projectOf、toolStatusText、approvalResolvedText、CONNECTION_TEXT 两到四份；④ **真 bug**：FTS 召回链复制分叉——packages/engine/src/search/store.ts LIKE 查询有 %_\ 转义，packages/engine/src/memory/store.ts 同款没有（含 %/_ 查询误匹配）；⑤ 文案漂移：mobile 复制态"已复制" vs miniapp"✓ 已复制"；⑥ 会话页控制器——mobile SessionScreen 与 miniapp session 页约 200 行逻辑级复制（H2/H4/I2 评审修复曾两端各打一遍补丁）；⑦ hooks/EngineSettings zod 双定义——packages/engine/src/config.ts 与 packages/protocol/src/api.ts 各一份。

**包内样板重复**：web settings 族 12 处加载 effect + 9 处错误/加载三件套 + 7 处保存 try-catch + 7 处手写保存按钮 class（ui/button.tsx outline 复制品）；web chat 三份外点关闭 effect + 两份 copy/1500ms 态 + fmtDuration 同名异义双定义；engine errText 模式 12+ 处、tmp+rename 原子写 5 处、"读 JSON+E_CONFIG 包装+zod issue 拼装"6 处、JSONL append/读 2 处、sleep 3 份；server 40 条路由 try/catch 纯冗余（全局 setErrorHandler 已兜底）+ parseOr400 三种写法 + 404 形体 7 处硬编码；cli items.tsx 纯逻辑混组件文件 + projectOf/fmtTokens/运行中工具计数组件间重复 + render.test 手写 render 15 处。

**死代码**：零使用导出一批（protocol SubmitResult/SessionEventsQuerySchema 运行时无 parse/SkillHookPayload/ToolOutput.display 字段等；cli bootEcho、DELIVERY_ORDER/itemSettled 冗余 export；server replyOutcomeError 且同 409/404 语义三份实现；web isToday/useLastSeq/retryCount/LoadState 再导出/DEFAULT_BACKOFF_MS 再导出；mobile ui.tsx Row）；**整文件级六项 + _scratch 两份 lint 产物（git 追踪中）受 AGENTS §2.10 删除保护约束——见 §0.2 Q-7 待拍板**；mobile/miniapp app-store 投影面生产零调用（store 投影与屏幕本地投影双路径并存）。

**刻意保留（不做，boring code 纪律）**：platform 被迫重复——miniapp 手写 UTF-8 解码器、Taro 分块双路 401 闸门、MiniRestClient 整类、react-native-sse G4 偏离处理、desktop/cli healthz 轮询骨架；protocol apply-event.ts 21 事件 if 链（词表穷尽性决定，不超载）；scripted-llm.ts 维持 10.30 冻结（经核实是 CI 假 provider 测试夹具而非 spike 残留）；engine ZERO_USAGE 与 protocol addUsage 语义有差只钉注释不强并。

## R-A 死导出与死状态清理（零行为风险纯减法）

- **目标**：删除全仓 grep 验证为零使用点的导出/类型/状态（**只删导出与状态，不删任何文件**——整文件级清理归 Q-7 拍板后的独立动作）。
- **产出**：① protocol：SubmitResult、SessionEventsQuerySchema（类型 SessionEventsQuery 保留）、RoutingUsageDto/EngineSettings/PairedDeviceDto/CommandSurface 死类型别名、jsonSchemas 的 tests-only 现状注明（保留）；② engine：SkillHookPayload、ToolOutput.display 死字段、index.ts over-export 收窄首轮（AdvertisedTool/EventBusOptions/EventHandler 等仅再导出无外部消费的——**逐个 grep 复核后删，14.1 正式裁决前只做无损收窄**）；③ cli：store.ts bootEcho/setBootEcho 死状态、DELIVERY_ORDER 与 itemSettled 冗余 export、client-actions.ts 纯转口 re-export；④ server：errors.ts replyOutcomeError（连带把 409/404 语义三份实现收敛为一份）；⑤ web：lib/time.ts isToday、stores/session.ts useLastSeq、stores/connection.ts retryCount 死状态、McpSettingsPage LoadState 再导出、transports/http.ts DEFAULT_BACKOFF_MS 再导出；⑥ mobile：ui.tsx Row 组件（零引用）；⑦ miniapp：poll.ts PollFilterResult 冗余 export。
- **验收**：每删一项前 grep 全仓（含 tests）确认零使用；删除处若有测试断言同步删除；`pnpm -r typecheck && pnpm -r lint && pnpm test` 全绿；**禁止触碰 10.30 冻结清单文件**。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 R-A——死导出与死状态清理（阶段十七批次 A，零行为风险纯减法）。

前置阅读：AGENTS.md、doc/08 §5B（阶段十七）与 §5B.0 审计发现汇总、doc/02 §8 工单 10.30 冻结清单（以下死代码对象
中属整文件的均不在本工单范围——本工单只删"导出/类型/状态"，不删任何文件）。
要求：
1. 按 doc/08 §5B.0"死代码"条目逐项现场 grep 复核（含 tests）——行号以现场为准，审计记录行号已漂移时以 grep 结果为准；
   复核为零使用才删，有任何使用点的（哪怕仅测试）保留并在提交信息注明。
2. protocol：SubmitResult / SessionEventsQuerySchema（保留 SessionEventsQuery 类型）/ RoutingUsageDto / EngineSettings /
   PairedDeviceDto / CommandSurface 死类型别名；engine：SkillHookPayload / ToolOutput.display 死字段 / index.ts 中
   grep 复核为零外部消费的再导出（逐项列表入提交信息，存疑不删）。
3. cli：store.ts bootEcho/setBootEcho/DELIVERY_ORDER/itemSettled 冗余 export、client-actions.ts 纯转口；server：
   errors.ts replyOutcomeError（routes.ts:351 附近内联实现与 errors.ts:123 前缀版三份同语义，收敛为一份）；web：
   isToday / useLastSeq / retryCount / LoadState 再导出 / DEFAULT_BACKOFF_MS 再导出；mobile：ui.tsx Row；miniapp：
   PollFilterResult 冗余 export。
4. 每删一项：grep 零使用确认 → 删定义与测试断言 → 单测改绿。禁止 rm/git rm 任何文件（AGENTS §2.10）。
验收：pnpm -r typecheck / pnpm lint / pnpm test 全绿；提交信息逐项列出所删导出与复核结论。
提交：refactor(全仓): 工单 R-A——死导出与死状态清理。完成后 doc/02 版本表追加（本工单不建阶段表行，见 §5B 注记）。
```

## R-B @spark/protocol 共享资产下沉（四端复用；协议改动从 protocol 开始）

- **目标**：把四端各自维护、已出现漂移的纯逻辑/格式化/文案收敛到 @spark/protocol 单源（D22 共享资产纪律的自然延伸，与 error-copy/keymap 同列）。
- **产出**：① packages/protocol/src 下新 format.ts：fmtTokens（≥1000 一位小数 k）、formatTimestamp（M月D日 HH:MM）、isToday、fmtDate、formatDateTime——收敛 web/cli/mobile/miniapp 的 10+ 处（web StatusBar.tsx、cli StatusBar.tsx/StatsPanel.tsx、两端 sessions 页与 session-rows.ts）；② `toolCategoryOf/flowRowsOf` 上移 protocol（protocol 新 flow-rows.ts，cli flow-rows.ts 与 web chat-flow-rows.ts 删本地版并对齐 groupTools/firstReasoningPerTurn 参数——止住漂移，两端消费点改 import）；③ `SessionStreamCore` 会话流状态机：重连循环+401/403 鉴权收敛（连续 3 次终态）+水位推进+dispose/generation，注入平台 connectOnce 钩子——transport-node.ts 的 HttpTransport.loop/SessionEventSource.loop 两份合一、mobile rn-event-source.ts / miniapp mini-event-source.ts 各 −80 行（**平台被迫部分不进 Core**：react-native-sse G4 偏离处理、Taro 分块双路闸门、轮询降级留两端本地）；④ `errorFromResponse(status, body)` 纯函数（transport-node req 与 miniapp rest.ts 合一）+ `parsePairLink` 下沉（mobile pair-link.ts / miniapp pair.ts 逐字双份）；⑤ 文案表单源：CONNECTION_TEXT（四处）、toolStatusText、approvalResolvedText、dotColor 进 protocol 文案邻域（error-copy 同目录或新 ui-copy.ts）；⑥ hooks/EngineSettings zod 统一——engine config.ts 改为复用 protocol api.ts 导出（顺带消除 config.ts→hooks/runner.js 反向依赖边）。
- **验收**：每条新导出配 protocol 单测；四端 typecheck 全绿；"已复制"文案漂移在两端统一后走查确认；SSE 行为四端 e2e（web Playwright 7 例 + cli/mobile/miniapp 单测）零回归；**缺省 127.0.0.1+无鉴权行为不变红线保持**。
- **依赖**：R-A（死导出先清，避免收窄后再改）。

**提示词**：

```text
任务：Spark 工单 R-B——@spark/protocol 共享资产下沉（阶段十七批次 B）。

前置阅读：AGENTS.md、doc/08 §5B.0 跨端重复条目（现场 grep 复核行号）、packages/protocol/src/error-copy.ts 与 keymap.ts
（D22 共享资产先例——新资产照此目录归属与导出面）、ARCHITECTURE.md D22（四端共享纪律）。
要求：
1. protocol 先行（AGENTS §2.5）：format.ts / flow-rows.ts / SessionStreamCore / errorFromResponse / parsePairLink /
   ui-copy 文案表逐个落 packages/protocol/src，各配单测；protocol tests 全绿后再动四端。
2. 四端替换：web/cli/mobile/miniapp 各消费点改 import 共享版，删本地版；flowRowsOf 对齐时把 cli 缺的 groupTools /
   firstReasoningPerTurn 参数补齐（以 web 版为准）；transport-node 内 HttpTransport.loop 与 SessionEventSource.loop
   合一为 SessionStreamCore 消费者，mobile/miniapp 注入平台 connectOnce。
3. 平台被迫部分留在各端本地（不强行抽象）：miniapp utf8 解码器/Taro 分块闸门/轮询降级、mobile react-native-sse G4。
4. 文案漂移统一：复制态"已复制"两端统一（去 emoji，AGENTS §2.6）；CONNECTION_TEXT/dotColor 等 grep 四端确认替换后零残留。
验收：pnpm -r typecheck/lint/test 全绿；pnpm eval 零回归；四端 SSE 走查（mock 或本地 server）确认重连/鉴权/水位行为不变。
提交：refactor(protocol+四端): 工单 R-B——共享资产下沉（format/flow-rows/SessionStreamCore/ui-copy）。
```

## R-C engine util 收敛（含 memory LIKE 转义真 bug 修复）

- **目标**：engine 包内五类样板收敛为 util 单源；修复 FTS 召回链分叉 bug。
- **产出**：① `errText()` 无依赖叶子 util（吸取 session/store.ts:186 注释教训放叶子文件，pipeline 的 mapError 保留包装层）替换 12+ 处 `err instanceof Error ? err.message : String(err)`；② `atomicWriteJson(path, doc, opts?)` 收敛 5 处 tmp+rename（permission/store、secrets/store 的 0600 mode 保留为 opts、cost-tracker、automation/registry、engine.ts 两处）；③ config.ts 的 readJsonFile/parseOrThrow 导出复用 6 处"读 JSON+E_CONFIG 包装+zod issue 拼装"（secrets/mcp/cost-tracker/automation/engine）；④ `jsonl.ts`（appendLine/readLast）合并 audit/log 与 automation/registry 两份；⑤ **FTS 召回链合一**：提取共享模块（longestToken/matchFts/matchLike 三份二份），**统一转义行为到 search/store.ts 的 %_\ 转义版**——memory 搜索修复即行为变更，补单测断言查询含 %/_ 字符时按字面量匹配；⑥ engine 三份 sleep 合一（mcp/manager withTimeout 保留，语义不同）；⑦ 顺带消重复：engine.ts E_MEMORY_UNAVAILABLE 双写/E_SHUTTING_DOWN 三处 reject/resolveApiKey lambda 双写。
- **验收**：行为等价（⑤除外——明示的 bug 修复）；engine 486 例全绿 + ⑤新单测；grep 确认旧样板零残留；doc/02 §5.8 若描述了 memory 搜索行为需同步更新（先查再改）。
- **依赖**：无（与 R-B 可并行；R-D 的前置）。

**提示词**：

```text
任务：Spark 工单 R-C——engine util 收敛 + memory LIKE 转义修复（阶段十七批次 C）。

前置阅读：AGENTS.md、doc/08 §5B.0 包内样板条目、doc/02 §5.8（会话持久化——确认 JSONL 行为描述是否需随 ⑤同步）、
packages/engine/src/session/store.ts:186 附近注释（util 放叶子文件避免循环依赖的先例）。
要求：
1. 逐类收敛：errText / atomicWriteJson（secrets 的 0600 保留为 opts）/ readJsonConfig+zod issue 拼装 / jsonl.ts /
   sleep 合一——每类先 grep 全量清单（以现场为准），替换后 grep 零残留入提交信息。
2. FTS 召回链合一：提取 memory/store.ts 与 search/store.ts 的共享召回模块，统一 LIKE 转义到 %_\ 版（search 版为准）；
   这是行为修复——补单测：查询含 % 或 _ 的记忆搜索按字面量匹配不误配。
3. engine.ts 内部小重复顺手消（E_MEMORY_UNAVAILABLE/E_SHUTTING_DOWN/resolveApiKey lambda）；不动 engine.ts 整体结构（那是 R-D）。
4. boring code 纪律：util 只做这五件事，不顺手发明抽象层（AGENTS §2.11）。
验收：pnpm --filter engine test 全绿（486 例+新增）；全仓 typecheck/lint；grep 旧样板零残留。
提交：refactor(engine): 工单 R-C——util 收敛（errText/atomicWriteJson/readJsonConfig/jsonl/sleep）+ memory LIKE 转义修复。
```

## R-D engine.ts 拆分（2028 → 约 600 行门面；五刀各自独立 commit）

- **目标**：把六职责叠加的 engine.ts 拆为单向依赖的门面+领域模块；拆分不引入任何新环（现状已是无环 DAG，engine.ts 唯一被引用点是 index.ts）。
- **产出**（五刀，每刀独立 commit 便于回滚与 review）：① `engine-types.ts`（现 107–211 行类型区+SessionEntry，零依赖纯类型）；② SearchIndexer（indexSearchEvent/syncSearch/searchSessions/sessionTitleOf/searchSnippet/searchSnippet 部分与 engine.ts 搜索块）入 search/ 目录 + 会话索引维护五法（openIndex/rebuildIndex/touchIndex/titleIndex/disableIndex+syncIndex）为 SessionIndexMaintainer；③ `session-lifecycle.ts`（createSession/resumeSession/requireEntry/loadSession/locate/findSessionFile/forkSession/treeOf/scanForkChildren/scanDiskSessions/listSessions/statusOf/idOfFileName/titleOf）；④ `settings-store.ts`（getSettings/updateSettings/persistRouting/getRouting/updateRouting/resetUsage，依赖 config+secrets+onHooksReload 回调）；⑤ `subagent.ts`（runSubagent → makeSubagentRunner(deps) 注入，engine 构造器组装 makeTaskTool）；⑥ engine.ts 残部=类字段+构造器组装+wireSession+handleOf+各管理面只读透传+shutdown（约 600 行）；⑦ 同批拆 transport-node.ts 的 SSE 纯函数出 `sse-frames.ts`（若 R-B 已做 SessionStreamCore 则本项自然完成）。
- **验收**：每刀后 engine 486 例全绿 + 全仓 typecheck；engine 对外导出面与 API 签名**不变**（index.ts re-export 保持）；单写者 JSONL 纪律不触碰（SessionStore 写路径不动）；shutdown 时序零变化（12 步顺序表对照测试）。
- **依赖**：R-C（util 先就位）；**触碰单写者/关停敏感区，建议每刀之间晚风过目一眼再续**。

**提示词**：

```text
任务：Spark 工单 R-D——engine.ts 拆分第 N 刀（<类型区|搜索与索引|会话生命周期|设置与路由|子代理>，阶段十七批次 D；
一工单会话只做一刀，连续执行请逐刀开新会话）。

前置阅读：AGENTS.md、doc/08 §5B.0 巨石文件条目与 §5B 开工顺序注记、packages/engine/src/engine.ts 头注释（组装根自述）、
doc/02 §5.8（SessionStore 单写者——拆分不得触碰其写路径）、本刀目标函数清单（grep 现场定位，审计行号已漂移）。
要求：
1. 只做本刀：函数整段搬家不改逻辑；依赖以构造注入或参数对象传递，子模块禁止反向 import 门面 engine.ts；
   engine.ts 保留同签名方法委托（对外 API 不变，index.ts re-export 不动）。
2. 搬家后 grep 确认：无残留私有方法引用旧位置；engine 包 import 图仍为 DAG（无新环）。
3. 触碰关停/单写者敏感区时零语义变化（对照 doc/02 §5.8 与 shutdown 十二步）。
4. 完成一刀即 commit（refactor(engine): 工单 R-D 第 N 刀——<块名>），不跨刀夹带。
验收：pnpm --filter engine test 全绿（486 例）+ pnpm -r typecheck；engine 对外导出与 API 签名 diff 为零
（node --experimental 或 tsc 导出面对比，或 grep 消费方零改动佐证）。
提交：refactor(engine): 工单 R-D 第 N 刀——<块名> 拆出。
```

## R-E web 前端收敛（useTransportQuery / ModelSettingsPage 三分 / Composer 拆分 / mock 夹具外置）

- **目标**：收敛 web 包内四大样板与两个巨石组件。
- **产出**：① `useTransportQuery(fetcher, deps)` hook：收敛 settings 族 12 处逐字加载 effect + 9 处错误/加载三件套 + hooks/useSessionList 与 useCommands 同构（估删 200–250 行）；② ModelSettingsPage 三分（Page / SecretsSection / RoutingSection + 供应商列表组件——三个 section 零共享状态，纯移动）；③ Composer 拆分（ComposerMenu 约 150 行 @// 菜单状态机 / PermissionTierMenu / AttachmentChips / useDismissOnOutsideClick 收敛三份 / useCopy 收敛两份 copy+1500ms）；④ mock.ts 静态夹具外置 `mock-data.ts`（MODELS 目录 50 行/审计演示条目/settings 默认值/COMMANDS 表）+ `removeBy` 收敛四份同构 CRUD——tests/mock-transport.test.ts 只 import 回放层，夹具外移对测试零影响；⑤ lib/time 统一（fmtDuration 同名异义双定义改不同名或删旧、formatDateTime 收敛 5 处自拼、timeGroupOf/isToday 合流）；⑥ PROMPTS 常量单源（ChatView 3 条 vs WelcomePage 4 条已漂移——合并为 4 条版本）；⑦ 保存按钮 class 复用 ui/button.tsx outline、settingInputCls 共享常量；⑧ routes/ 页头 PageHeader（SearchPage/AutomationPage 同构）；⑨ settings 保存模式（busy/opError/try-catch-finally）视 ①落地后的残留量决定是否再抽（估 7 处，收益中）。
- **验收**：web 159 例 + Composer.test.tsx 全绿；VITE_SPARK_MOCK=1 手动走查设置三页（Model/General/Hooks）与 Composer 菜单交互零回归；视觉零变化（黑白中性基调，无 AI 生成风——AGENTS §2.6 自查）。
- **依赖**：R-B（fmtTokens/formatDateTime 若已下沉则改 import）。

**提示词**：

```text
任务：Spark 工单 R-E——web 前端收敛（阶段十七批次 E；一工单会话可整体做，内部按 ①→⑨ 顺序逐项 commit 或分批）。

前置阅读：AGENTS.md、doc/08 §5B.0 包内样板条目、DESIGN.md §12（反 AI 生成风自查）、apps/web/tests/ 既有测试（Composer 与
mock-transport 是回归网）、packages/protocol format.ts（若 R-B 已落地，格式化直接 import）。
要求：
1. useTransportQuery：签名 (fetcher, deps) 返回 {data, error, refresh}；12 处 effect 与 useSessionList/useCommands 逐个替换，
   grep 零残留；错误/加载三件套随之收敛为统一小组件。
2. ModelSettingsPage 三分纯移动零逻辑改动；Composer 拆分对照 apps/cli 既有 InputBox/SlashMenu 分离模式（commit 66cdcde 先例）；
   外点关闭三份与 copy 态两份收敛 hook 后删除本地版。
3. mock.ts 夹具外置 mock-data.ts（纯数据移动）+ removeBy 四份同构 CRUD 收敛——先读 tests/mock-transport.test.ts 确认
   只 import 回放层再动；场景脚本 examples/mock-sessions/*.jsonl 不动。
4. 视觉零变化走查 + §12 黑名单 grep 自查；不引新依赖。
验收：pnpm --filter web test 全绿（159 例+）；VITE_SPARK_MOCK=1 走查设置页与 Composer 交互；pnpm typecheck/lint 全绿。
提交：分项 refactor(web): 工单 R-E——useTransportQuery/ModelSettings 三分/Composer 拆分/mock 夹具外置…（每项一条）。
```

## R-F server 路由去样板 + 域拆分

- **目标**：routes.ts 702 行去 40 条冗余 try/catch（约 −120 行）+ 按域拆插件。
- **产出**：① 删 40 条 `catch (err) { return sendError(...) }`——全局 setErrorHandler 已兜底（errors.ts:113–115），async handler 直接 throw；② `parseOr400`/`notFound`/`requireHandle` 收敛进 errors.ts 单一导出（routes.ts:62 与 pairing-routes.ts:27 双实现 + sse.ts:64 第三种写法合一；404 形体 7 处硬编码换 notFound(reply)；sse.ts 内联 requireHandle 复用）；③ 按域拆 6 个路由子插件：sessions（11 条）/permissions+presets（6）/secrets（3）/models+routing+effort（7）/automation（6）/readonly（mcp/skills/settings/commands/memories/audit/search/artifacts/metrics）——zod schema 随域走，routes.ts 收敛为组装入口；④ `labelOf`（事件→人话摘要）预备上移 protocol 的评估小注（不动代码，只在 protocol 相关文档登记观察项——与 web 树视图潜在共享）。
- **验收**：server 92 例（routes.test 16 describe 全程护航）全绿；46 条路由 path 与响应 shape 零变化（测试即合同）；配对鉴权行为不变。
- **依赖**：无。

**提示词**：

```text
任务：Spark 工单 R-F——server 路由去样板与域拆分（阶段十七批次 F）。

前置阅读：AGENTS.md、doc/08 §5B.0 server 样板条目、apps/server/src/errors.ts:113 附近（全局 setErrorHandler——try/catch
冗余的依据）、apps/server/tests/routes.test.ts（16 个 describe 是行为合同）。
要求：
1. 先删 40 条 try/catch（每删一条对照 routes.test 对应 describe 绿）；再收敛 parseOr400/notFound/requireHandle 三助手进
   errors.ts（pairing-routes.ts 与 sse.ts 同步改用，删各自本地版）。
2. 域拆 6 子插件（routes/ 目录或单文件均可，以路由文件数不爆炸为准）；路由 path/DTO/状态码零变化；
   labelOf 只登记观察项不动代码。
3. 行为等价：任何 handler 语义改动（哪怕看似等价）单测必先红后绿证明。
验收：pnpm --filter server test 全绿（92 例）；pnpm -r typecheck/lint；curl 冒烟三条核心路由（sessions 列表/审批/搜索）。
提交：refactor(server): 工单 R-F——路由去样板（40 try/catch）+ 三助手收敛 + 域拆分。
```

## R-G cli 收敛（纯逻辑搬家 / app.tsx 二次拆分 / 测试助手提取）

- **目标**：cli 包内组件与纯逻辑分层归位 + app.tsx 余下派生态拆分。
- **产出**：① items.tsx 四个纯函数（summarizeToolInput/toolOutputText/toolOutputLines/isDenied）搬家至 flow-rows.ts（头注释自述"纯逻辑可独立单测"）+ `useNow` 入 hooks/ + 删 items.tsx:17 冗余 re-export（toolCategoryOf 若 R-B 已上移 protocol 则此处改 import）；② app.tsx 二次拆分：useSlashMenu（app.tsx:84–98 派生态）/ useResumePanel（100–117）/ PanelRouter（233–279 面板渲染 11 分支三元链）——liveBudget 与 MessagePane 的 maxLiveRows 契约注释保持；③ 组件间重复收敛：Footer/ResumePanel 的 projectOf、Footer/StatsPanel 的 fmtTokens（R-B 后改 import）、运行中工具计数循环（与 web TurnStatusBar 同口径——R-B flow-rows.ts 归属时一并评估上移）；④ tests/render.test.tsx 提取 4 个助手（renderFrame / toolItem 提升到文件顶 / typeInto / sessionDto 工厂）+ **移除 describe('StatusBar') 死组件用例（组件文件本身留 Q-7 拍板，测试先停喂）**。
- **验收**：cli 16 例全绿（render.test 重构后断言语义零变化）；§13.K 纯单栏视觉走查（footer 双行/面板族/尾操作行）零回归。
- **依赖**：R-B（fmtTokens/flowRowsOf 单源后改 import）。

**提示词**：

```text
任务：Spark 工单 R-G——cli 收敛（阶段十七批次 G）。

前置阅读：AGENTS.md、doc/08 §5B.0 cli 条目、DESIGN.md §13.K（CLI 纯单栏规格——拆分不得改视觉）、apps/cli/src/app.tsx 头注释
（66cdcde 拆分后的职责分布自述）、packages/protocol flow-rows.ts 与 format.ts（若 R-B 已落地）。
要求：
1. items.tsx 纯函数搬 flow-rows.ts（搬不改逻辑，补纯逻辑单测）；useNow 入 hooks/；删 items.tsx 冗余 re-export。
2. app.tsx 三拆（useSlashMenu/useResumePanel/PanelRouter）——渲染分支三元链改组件路由；键位行为零变化
   （use-cli-keys 不动）。
3. projectOf/fmtTokens/工具计数：protocol 已有则 import，没有则本包单源（入 flow-rows.ts）——避免第三份。
4. render.test.tsx 助手提取后断言语义零变化；describe('StatusBar') 用例删除（组件文件留 Q-7，不删文件）。
验收：pnpm --filter cli test 全绿；TUI 冒烟（本地 server + 三面板/斜杠菜单/翻页）零回归。
提交：refactor(cli): 工单 R-G——纯逻辑归位 + app.tsx 二次拆分 + 测试助手提取。
```

## R-H mobile/miniapp 会话页共享 controller（最大单块去重）

- **目标**：消灭两端会话页约 200 行逻辑级复制（评审补丁曾两端各打一遍的漂移高发区），拆分剩余巨石屏。
- **产出**：① 平台无关 `useSessionPageController`（装载回放+开流 / loadOlder 合并重放 / send/stop/reply / notice 5s 自清 / isReplayedDuplicate 闸门 / PAGE_SIZE 常量）——入共享位置（`@spark/protocol` 不含 React，故入两端可达的共享 hooks 形态：优先各端薄壳 + protocol 纯逻辑块拆分评估；**开工时先向晚风确认落点**：protocol utils/ vs mobile/miniapp 各自 hook 文件 vs 新建共享包，见 §0.2 Q-8）；② 巨石屏拆分：mobile SessionsScreen 纯函数（dotColor/isToday/fmtDate/projectOf）入 session-list-model.ts + FilterMenu/SessionRow 出组件 + StyleSheet 考虑外置；miniapp settings 四卡拆分（PairCard/ServerFormCard/AppearanceCard）；③ app-store 投影双路径收口（**方向二选一，开工时问晚风**：A 会话页改用 store 投影 / B store 收窄为连接态+notice+列表去掉 ProjectionState 继承——默认建议 B，屏幕本地投影现状即事实单一来源）；④ mobile SettingsScreen 内联的短码兑 token 逻辑对齐 miniapp 已抽的 redeemPairCode 形态；⑤ Maestro 四用例共享 e2e/lib/preamble.yaml（runFlow）；⑥ "已复制"文案统一（R-B ui-copy 落地后此处改 import 收尾）。
- **验收**：mobile 48 例 + miniapp 51 例全绿；两端单测覆盖 controller 全路径（装载/翻页/发送/审批/notice）；Maestro 四幕可跑（或用户现场走查记录）；**RN/Taro 平台被迫重复不动**（utf8 解码器/Taro 分块闸门/轮询降级）。
- **依赖**：R-B（文案/格式化先单源）；Q-8 落点拍板。

**提示词**：

```text
任务：Spark 工单 R-H——mobile/miniapp 会话页共享 controller 与巨石屏拆分（阶段十七批次 H；开工前先问晚风 Q-7/Q-8）。

前置阅读：AGENTS.md、doc/08 §5B.0 移动双端条目与 §0.2 Q-7/Q-8（两个待拍板项）、apps/mobile/src/screens/SessionScreen.tsx
与 apps/miniapp/src/pages/session/index.tsx 对照读（同构段现场确认）、packages/protocol applyEvent（两端会话页现状即用
共享 reducer——controller 只收"页面编排"层，不碰投影）。
要求：
1. 开工先问晚风：Q-8 controller 落点（protocol utils vs 两端 hook 文件 vs 共享包）与 Q-7 死文件处置——未答先做 ②③④⑤
   不依赖拍板的部分。
2. useSessionPageController：入参注入 getSession/openStream 平台差异；两端页只剩渲染与平台特有逻辑（贴底/视口测量/导航标题）；
   controller 全路径单测两端各跑一遍。
3. app-store 投影双路径：按晚风拍板方向收口（缺省建议 B）；未拍板不动 store。
4. 平台被迫重复不动（utf8/分块闸门/轮询降级/react-native-sse G4）；Maestro preamble 用 runFlow。
验收：pnpm --filter mobile test / --filter miniapp test 全绿；真机或模拟器四场景走查（用户侧留记录）；controller 单测全路径。
提交：refactor(mobile+miniapp): 工单 R-H——共享会话页 controller + 巨石屏拆分。
```

---

# 6. 后置池与观察项（不设工单号；每项含触发条件）

| 项 | 来源 | 触发条件 / 备注 |
| --- | ---- | ---- |
| 代码签名 + 自更新（electron-updater） | V2-15 | 外部下载量或企业用户出现；签名证书采购是人决策 |
| 沙箱网络隔离（SOCKS5 + 域名清单） | V2-19 / D15 后置 | 有真实隔离诉求（跑不可信代码场景）再立项 |
| 代码库语义索引（RAG） | V2-18 | P3 大件；等 13.x 上下文工程收益见顶后评估 |
| i18n 全量（V2-12 提级评估） | Q-2 | 英文 README（11.8）后看外部用户占比；文案表单一来源（6.7 error-copy）已是抽取基础 |
| 小程序正式分发中继（WSS/轮询网关） | D21 记账项 | 体验版走查反馈真实分发需求时立项 + mini ADR |
| 多窗口多会话 / 内置终端面板 | V2-20 / V2-10 | 桌面深度用户信号；pty 需 Electron preload/IPC 首次引入 |
| A2A / AG-UI 出站适配 | 展望会话趋势项 #1 | 标准协议在目标用户群渗透率可观测后；适配器外挂不进内核 |
| 长任务 / 心跳 turn | Q-3 | 多日任务真实诉求；迷你 ADR 防滑向显式 Planner |
| 验证闸技能（turn 收尾跑 lint/test 回喂） | 展望会话趋势项 #3 | 7.4 命令注册表上以技能/命令实现，不进引擎 |
| IDE 集成（VS Code 扩展）/ GitHub Actions 集成 | 观察项 | 不立项；等 npm 分发后有社区信号再议 |
| 单会话 token 预算闸 | doc/07 §2.4 遗留 | 与 13.6 看板联动评估 |
| LSP 诊断接入 | 展望会话增量差距 #5 | opencode 有、pi 刻意无；edit 准确性下限保障——有真实误编辑证据再立项（P2） |
| 会话导出/分享 | 展望会话增量差距 #7 | opencode share 先例；本地产品先做导出（markdown/json），分享上云需安全评审 |
| 计划模式 todo 交互层 | 展望会话增量差距（低优先判决） | 现为权限预设层（D7 补记，无 todo 工具）；pi 证明极简可打——登记不立项，等用户信号 |
| MCP HTTP/SSE transport | V2-21 / D16 后置 | 远程 server 真实诉求再立项；15.1 stdio 先行 |
| 插件市场壳 | V2-02 | 依赖 Q-1 拍板（skills 边界）+ 12.6（V2-01）落地 |
| 其余候选池项（V2-08 审查模式 / V2-09 辅助会话 / V2-13 数据管理 / V2-14 诊断页 / V2-22 keymap 等） | doc/02 §8.7 | 维持候选池身份；外部用户信号决定优先级，不阻塞阶段十一~十五 |

---

# 7. 生命力风险与对策（展望会话登记，本文建档）

| #  | 风险 | 现状 | 对策（归口） |
| -- | ---- | ---- | ---- |
| 1  | Bus factor = 1（单人作者 + AI 会话流水线） | 文档与测试密度是最强补偿；缺贡献者入口 | 11.1 CONTRIBUTING 增"第一个工单怎么挑"入口（good-first-issue 式）；11.7 发版纪律降低外部参与门槛 |
| 2  | 知识在会话里、不在人脑里（全仓 AI 生成） | doc/02 实现级规格覆盖核心算法（Projector/EventTree/SessionStore） | 任何"顺手重写"核心模块必须先过 doc/02 规格修订——先改规格再动码（AGENTS §7 纪律） |
| 3  | 上游三件套（pi-ai 0.x / AI Elements Next.js 漂移 / Ink 6） | 隔离单点与 copy-in 对冲已在册（doc/02 §10） | 维持锁版本与隔离纪律；升级前全量回归 |
| 4  | "不做"清单被展望腐蚀 | 正式判决收拢于 §8 不变量第 2 条 | 每季度重审一次，重审之外不推翻 |
| 5  | 节奏风险（两个月十一阶段的惯性） | 阶段十一是发布化 | 刻意减速：验收尾巴真正关账（11.2）优先于开新工单 |

# 8. 三条不变量（任何阶段不得违背）

1. **引擎 headless，UI 是事件流的投影**——一切新面（SDK/MCP/适配器）走协议，不开旁路；
2. **"不做"清单继续有效**（显式 Planner / 虚拟文件系统 / Python Worker / 短期 Scratchpad / 错误自修正回路 / 多用户公网）——每季度重审一次，重审之外不推翻；
3. **铁律与审计纪律**——durable/live/surface 三属性、fail-closed、每步归因；新模块（SDK/MCP server/生成客户端）一律同管线一视同仁。

---

# 附录 A：提示词使用总则

1. **派工单位**：一工单 → 一个全新 AI 会话 → 一个提交。提示词自包含（上文各工单代码块可直接粘贴），不要依赖会话上下文。
2. **提示词六段式**（本库所有提示词的统一结构，新增工单照此写）：① 任务一句 + 决策结论；② 前置阅读清单（AGENTS.md 恒为第一条，然后规格文档精确到节）；③ 要求逐条（含涉及包与文件路径）；④ 单测与验收（对应"验收标准"）；⑤ 纪律提醒（禁删文件 / 协议从 protocol 开始 / 反 AI 味 / 缺省不变红线——按工单相关性取舍）；⑥ 提交格式（conventional commits + 中文 + 版本表追加）。
3. **通用红线**（已内嵌于各提示词，此处汇总）：文件删除保护（AGENTS §2.10）；参考项目禁克隆（§2.12）；TS strict 禁 any（§2.4）；文档变更走 docs-update 技能；工作区有非本会话未提交修改时先声明再动工，不夹带提交。
4. **完成后**：按 AGENTS §2.2 commit + push；规划类工单（研究/报告）只动文档不动代码；实现类工单必须测试/typecheck/lint 全绿再提交。
5. **立项动作**：阶段开工时，把本章对应工单 lift 进 doc/02 §8 新阶段表（工单号不变），本文相应行标注"已立项于 doc/02 vX.Y"；执行冲突时以 doc/02 定稿为准。

---

# 附录 B：阶段十工单速引提示词（引用式，不复制规格）

> 阶段十（web 对照审计 + CLI 重构）**已合入 main**：批次 1/2 十四张工单全勾（doc/02 v3.44/v3.45），两项待拍板（水位大条删除 / 欢迎页权限档钮）已按建议执行收口（v3.33）；收尾批次 3（10.22/10.24–10.30）2026-09-01 立项。其规格、验收与勾选状态**唯一来源是 doc/02 §8 阶段十表**（含 DESIGN §13 行号引用）——本附录不复制规格，只提供"引用式"开工提示词。以 doc/02 表勾选状态为准，未勾工单（现为批次 3 余量与后续增补）按下列模板开工：

```text
任务：Spark 阶段十工单 10.X——<工单名>。

前置阅读：AGENTS.md、doc/02 §8 阶段十表 10.X 行（该行"产出/验收标准/依赖"三列即完整规格，逐项执行逐条验收）、
DESIGN.md §13 对应行（10.X 验收标注的行号）、doc/08 附录 A（提示词总则与红线）。
要求：按 doc/02 10.X 行产出列逐项实现；每条验收对照 §13 行号走查；涉及协议从 packages/protocol 开始（AGENTS §2.5）。
完成后：测试/typecheck/lint 全绿 → conventional commits 中文提交 → push 当前分支 → doc/02 阶段十表勾选 + 版本表追加。
```

速引（一句话要点，规格以 doc/02 为准）：10.4 会话流呈现升级（余项见勾选）/ 10.5 侧栏与全局细节 / 10.6 跨端能力：分支 chip + 推理档位 / 10.7 CLI §13.K 视觉规格成文 / 10.8 CLI 纯单栏骨架重构（D19 修订随工单）/ 10.9 CLI 会话流块族 + 审批框 / 10.10 CLI 面板族 / 10.11 CLI 收口与验收。
