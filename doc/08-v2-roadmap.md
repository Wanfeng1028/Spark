# Spark v2 展望与工单库——阶段十一~十五（发布化 / 可日用 / 可证明 / SDK 化 / 生态面）

## 版本记录

| 版本 | 日期       | 作者                                                                                  | 变更内容                                                                                                              |
| ---- | ---------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| v1.0 | 2026-08-31 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，四轮 v2 展望会话；MIT / npm CLI 优先 / 本文档交付形式三项已拍板） | 初稿：定位与使用说明 · 决策记录（已拍板/待拍板）· 阶段十一~十五共 34 张工单（每张含验收标准与开工提示词）· 后置观察池 · 提示词总则（附录 A） |
| v1.1 | 2026-08-31 | 同上；核查：晚风（Wanfeng1028，对照四轮展望清单逐条核查指出缺漏） | **对照四轮展望补全六处**：§0.3 终点图景与差异化五牌；§4.0 五层开发者面表（修 14.6/11.8 悬空引用）；13.1 补「Spark as eval harness」定位句；新增 §7 生命力风险与对策（原不变量节顺延为 §8）；后置池补 LSP/会话导出分享/计划模式 todo/V2-21/V2-02/其余候选池归并行；新增附录 B 阶段十在途工单引用式提示词（治理注记：阶段十唯一来源 doc/02 §8） |

> **定位**：本文是 v2 的**规划库与工单库**，不是执行规格。各阶段开工时，把对应工单 lift 进 doc/02 §8 建立正式阶段表（附版本记录），**执行以 doc/02 定稿为准**——与 doc/07 缺口编号（H01–H36）喂给阶段六~九同一模式。
> **阶段十（在途）不进本库**：其工单规格、验收与勾选状态唯一来源是 doc/02 §8 阶段十表（含两项待拍板）；附录 B 只提供未勾工单的引用式提示词，不复制规格。
> **编号规则**：工单号 = 阶段.序号（11.1…15.4）；既有缺口沿用原编号（doc/05 G*、doc/07 H*、doc/02 §8.7 V2-*）；doc/07 编号已冻结至 H36，**新缺口不再新增 H 号**，直接以工单号引用。规划中的未来路径（LICENSE、CONTRIBUTING.md、packages/sdk、apps/docs 等）以普通文字书写，不加反引号，落地后再按仓库惯例引用。
> **本文与 CI**：遵守 scripts/check_doc_links.py 全部检查项（相对链接可解析、不触碰事实计数锚点、未存在路径不进反引号）。

---

# 0. 决策记录

## 0.1 已拍板（晚风，2026-08-31）

| 决策 | 结论 | 影响 |
| ---- | ---- | ---- |
| LICENSE | **MIT** | 11.1 按 MIT 落地；ARCHITECTURE D23 补记同步消解（"倾向 MIT"→"已定 MIT"） |
| 分发主形态 | **npm CLI 优先**（protocol/engine 发库 + apps/cli 发 CLI 包；桌面安装包降为次要轨道） | 11.6/11.7 按 npm 主线排布；NSIS release 后置 |
| 交付形式 | 本规划库入 doc/08 | 本文即工单单一来源，立项时 lift doc/02 |

## 0.2 待拍板（触发相应工单前由人定，本文先按建议方向写）

| 编号 | 决策点 | 建议方向 | 关联工单 |
| ---- | ------ | -------- | -------- |
| Q-1 | skills 边界：维持纯声明（D18）还是走向受限可编程 | 先维持纯声明 + MCP 兜工具面；15.4 研究后再定 | 15.4 |
| Q-2 | i18n（V2-12）是否从 P2 提级 | 11.8 英文 README 先行；全量 i18n 等第一批外部用户反馈再定 | 11.8 / 后置池 |
| Q-3 | 长任务/心跳 turn 是否立项 | 有真实多日任务诉求再立项，须迷你 ADR（防滑向显式 Planner） | 后置池 |
| Q-4 | 任务级基准选型（自建 vs Terminal-Bench 类外部 harness） | 先自建场景集（13.1），外部 harness 出可行性报告再定（13.2） | 13.1/13.2 |
| Q-5 | SDK 客户端包名 | @spark/sdk（与 @spark/protocol、@spark/engine 同谱） | 14.3 |

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

# 附录 B：阶段十在途工单速引提示词（引用式，不复制规格）

> 阶段十（web 对照审计 + CLI 重构）在 feat/stage10-ui-batch1 进行中。其规格、验收、勾选状态与两项待拍板（水位大条删除 / 欢迎页权限档钮）**唯一来源是 doc/02 §8 阶段十表**（含 DESIGN §13 行号引用）——本附录不复制规格，只提供"引用式"开工提示词。以 doc/02 表勾选状态为准，未勾工单按下列模板开工：

```text
任务：Spark 阶段十工单 10.X——<工单名>。

前置阅读：AGENTS.md、doc/02 §8 阶段十表 10.X 行（该行"产出/验收标准/依赖"三列即完整规格，逐项执行逐条验收）、
DESIGN.md §13 对应行（10.X 验收标注的行号）、doc/08 附录 A（提示词总则与红线）。
要求：按 doc/02 10.X 行产出列逐项实现；每条验收对照 §13 行号走查；涉及协议从 packages/protocol 开始（AGENTS §2.5）。
完成后：测试/typecheck/lint 全绿 → conventional commits 中文提交 → push 当前分支 → doc/02 阶段十表勾选 + 版本表追加。
```

速引（一句话要点，规格以 doc/02 为准）：10.4 会话流呈现升级（余项见勾选）/ 10.5 侧栏与全局细节 / 10.6 跨端能力：分支 chip + 推理档位 / 10.7 CLI §13.K 视觉规格成文 / 10.8 CLI 纯单栏骨架重构（D19 修订随工单）/ 10.9 CLI 会话流块族 + 审批框 / 10.10 CLI 面板族 / 10.11 CLI 收口与验收。
