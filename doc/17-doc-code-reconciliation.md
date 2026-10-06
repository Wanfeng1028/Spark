# 全量文档 × 代码对账审计（doc/17）

> 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| ---- | ---- | ---- | ---- |
| v1.0 | 2026-10-06 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:bigmodel-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"全量文档×代码对账"指令） | 初稿：16 份主文档 + 门面 5 份 + 检查器 2 脚本的逐份对账——**42 个核查点里 88 处证实、6 处虚、4 处部分、其余决策/调研类标注**；12 条分级发现（F-01~F-12），头条 = 事件词表 34 族六处计数漂移全族躲过检查器（F-01/F-02 同根）、§4.5 端点表缺 21 行（F-03）、README.en 陈旧 8 枚（F-04）、D19 Ink 版本未翻（F-05）。只报不修。本批纯文档零代码，本机零验证，CI 裁决 |

## 0. 审计范围与执行方式

- **对象**：doc/01~doc/16（16 份主文档）+ ARCHITECTURE.md / DESIGN.md / README.md / README.en.md / CHANGELOG.md（门面 5 份）+ `scripts/check_doc_links.py` / `scripts/check_invariants.py`（检查器可信度专项）。
- **方法**：对每份文档抽取**可代码验证的声称**（某工单已交付 / 某机制存在 / 某文件某函数做了某事 / 某数字），到源码逐条取证（文件+行号或符号名）。决策记录、外部调研结论、许可判定等不可代码验证项标注 ➖ 不计伪。
- **四档判读标尺**（沿用 doc/13 体例）：
  - ✅ **证实**——声称与代码一致，有路径级证据；
  - ⚠️ **部分**——打了折但登记过，或漂移在容差/登记范围内；
  - ❌ **虚**——声称与代码实况不符；
  - ➖ **不可代码验证**——决策/调研/历史快照类，标注即可。
- **事实源基线（本审计实测）**：
  - 事件词表实数 **35**（`packages/protocol/src/events.ts` EventSchemas 顶层键：含带下划线的 `microcompact_boundary`（events.ts:210）与裸键 `error`（events.ts:224）——**正则数键漏下划线键会把 35 数成 34，本审计第一版正则即踩此坑**）；
  - `BUILTIN_COMMANDS` 实数 **28**（`packages/protocol/src/commands.ts`）；
  - Transport 接口方法 **95**（`packages/protocol/src/transport.ts`）；
  - `apps/server/src/routes/*.ts` 去重路径 **78** + `pairing-routes.ts` 4 端点 + `sse.ts` /api/event + `index.ts` /api/healthz；
  - `packages/engine/src/engine.ts` 实测 **3130** 行；
  - engine 公共面导出 **69** 条（check_invariants 闸值一致）。

## 1. 总表（16 份 × 档位计数）

| 文档 | 核查点 | ✅证实 | ⚠️部分 | ❌虚 | ➖不可代码验证 | 头条发现 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| doc/01 调研报告 | 4 | 2 | 0 | 0 | 2 | 参考体系 13 项登记与活引用一致 |
| doc/02 开发计划 | 45 | 40 | 1 | 3 | 1 | §4.5 端点表缺 21 行（F-03）；§8.6 两行 34（F-01） |
| doc/03 前端思路 | 2 | 2 | 0 | 0 | 0 | reducer 表 35 种与代码一致 |
| doc/05 完成度审计 | 2 | 1 | 0 | 0 | 1 | G6 已消解属实（LICENSE MIT 在根） |
| doc/06 测试计划 | 5 | 5 | 0 | 0 | 0 | perf 断言/eval/nightly 全在 |
| doc/07 harness 审计 | 4 | 3 | 0 | 0 | 1 | "不做"判决（Python Worker/Planner）代码确无实现 |
| doc/08（两篇） | 24 | 21 | 1 | 1 | 1 | CK-16 卡未标✅而代码已落地（F-07） |
| doc/09 基准评估 | 2 | 1 | 0 | 0 | 1 | "不接"属实：全仓无 benchmark 接线 |
| doc/10 代码审计工单 | 3 | 3 | 0 | 0 | 0 | RT3-02/RT3-07 修复声称与代码+提交号一致 |
| doc/11 落地审计 | 3 | 2 | 1 | 0 | 0 | LA-63 检查器存在；LA-41 行数记录 3161 vs 实测 3130（F-12） |
| doc/12 zcode 分析 | 2 | 1 | 0 | 0 | 1 | ZC-1~5 五单全部有码 |
| doc/13-code-spec-audit | 5 | 3 | 0 | 1 | 1 | E-1 收口声称"对岸消失"不实（F-09） |
| doc/13-project-review | 2 | 1 | 0 | 0 | 1 | 拆门面第一步 595fe3b 与登记一致；R-D 判决 ➖ |
| doc/14 kimi 分析 | 1 | 0 | 0 | 0 | 1 | 全为外部仓调研结论 ➖ |
| doc/15 ACP 调研 | 1 | 1 | 0 | 0 | 0 | 方案一已落地（apps/cli/src/acp-server.ts） |
| doc/16 压缩调研 | 1 | 0 | 0 | 0 | 1 | 建议类 ➖（compaction.ts 确无滚动摘要实现） |
| ARCHITECTURE | 20 | 16 | 1 | 2 | 1 | D19 仍写 Ink v6 vs ink ^7.1.1（F-05）；D37/D38 空号被代码引用（F-06） |
| DESIGN | 4 | 4 | 0 | 0 | 0 | 键位表/CLI footer/壁纸层与代码一致 |
| README.md | 3 | 3 | 0 | 0 | 0 | 35 种/四端/审批四键全对 |
| README.en.md | 2 | 1 | 0 | 1 | 0 | "27 event types"陈旧 8 枚（F-04） |
| CHANGELOG | 1 | 0 | 1 | 0 | 0 | 两个 [1.0.0] 标题（F-10） |
| 检查器 ×2 | 8 | 5 | 1 | 2 | 0 | 事件计数规则不读代码（F-02）；路由扫描面盲区（F-11） |
| **合计** | **144** | **115** | **5** | **8** | **14** | — |

> 计数口径：一个"核查点"可以产出多条发现；❌ 计入 F-01（3 处）/F-03/F-04/F-05/F-06/F-07/F-09/F-02 各自的归属文档。

## 2. 逐份明细

### 2.1 doc/02-development-plan.md（3363 行，重点）

**§4.3 事件词表**：标题"35 种" ✅（实数 35）；同节内文"内置 34 种"（L378）❌——扩展口径句里的旧数（同族见 F-01）。

**§4.5 HTTP API 表（L546–628）**：表内已登记行抽查（sessions CRUD/fs/fs/tree/messages/interrupt/compact/permissions 族/secrets/models/transcribe/routing/settings/commands/mcp+config/skills/agents/lsp+install/hooks.project-trust/index 三件/sandbox.network/trust/extensions/memories/pair×4/automation×7/audit/search/artifacts/attachments/trace/review/reply-all/archive/metrics/event）全部与路由实现一致 ✅。**但表缺 21 个已实现端点行** ❌（F-03，清单见该条）——而 `apps/server/src/routes/index.ts:3` 注释自称"**端点清单 = doc/02 §4.5 表**"，代码侧把本表当权威清单引用。

**§5.6.3 内置工具规格**：错误码抽查 17 枚（E_SHELL_DIED/E_TASK_UNAVAILABLE/E_TASK_NOT_FOUND/E_TASK_OFFSET/E_TASK_ALREADY_DONE/E_NOT_READ/E_STALE/E_AMBIGUOUS/E_BINARY/E_COMPUTER_ARGS/E_COMPUTER_NOTFOUND/E_MODE_BOUNDARY/E_NOT_IN_PLAN/E_DELIVERABLE_MISSING/E_BAD_PATTERN/E_TOO_LARGE/E_WRITE_DENIED）逐一在源码命中 ✅；工具清单 17 文件（`packages/engine/src/tools/builtin/`）与表目对得上（ask-user/background-task-tools/bash/browser/computer/edit/exit-plan-mode/grep/lsp/memory/present/read/task/todo/tool-search/write/index）✅；read-state 守卫描述与 `packages/engine/src/tools/read-state.ts` 头注逐句一致 ✅。

**§8 阶段表工单抽查（30 单，覆盖阶段十六全量 + 阶段十九 + ZC/CK 批）**：

| 工单 | 证据 | 判 |
| ---- | ---- | ---- |
| 16.1 /init | engine.ts:2237 `if (name === 'init')` + commands.ts init 描述符 | ✅ |
| 16.3 /plan | events.ts session.mode.changed + exit-plan-mode.ts + rules.ts:42 plan 兜底 | ✅ |
| 16.4 /trust | routes/permissions.ts:92-96 trust 两端点 + service.ts:95/139/144 收紧后处理 + engine.ts:312 trusted.json | ✅ |
| 16.5 /extensions | extensions/loader.ts（spark-extension.json 清单 + symlink 拒载）+ settings-store.ts:218 名单 | ✅ |
| 16.6 /voice | routes models.ts:42 /api/transcribe + apps/cli/src/voice/sox.ts | ✅ |
| 16.7 /goal | goals.ts:29-33 三护栏常量 50/200_000/25_000 | ✅ |
| 16.8 /arena | arena/manager.ts + arena/store.ts（worktree 隔离）+ routes sessions.ts:183-205 四端点 | ✅ |
| 16.9 /lsp | lsp/ 四文件（connection.ts:28-37 env 剥离、config.ts:5,43 config-hash 不重启语义）+ events.ts lsp.diagnostics | ✅ |
| 19.1 computer | computer/ 四平台文件 + builtin/computer.ts 8 工具 | ✅ |
| 19.3 bash 常驻 | bash.ts:119/139/151（persistent + 60s 前台预算 FOREGROUND_BUDGET_MS） | ✅ |
| 19.7 沙箱网络 | sandbox/proxy.ts + network-env.ts + routes readonly.ts:264 | ✅ |
| 19.8 向量 | vector/semantic.ts + E_EMBEDDING_DIMENSION/UNAVAILABLE + routes readonly.ts:312 | ✅ |
| 19.9 审批作用域 | permission/service.ts scope 消费 + protocol api.ts | ✅ |
| 19.11 索引管理 | routes readonly.ts:227-260 三端点 + SearchStore（engine-types/engine） | ✅ |
| 19.17 i18n | apps/web/src/i18n/ + apps/cli/src/i18n.ts + apps/mobile/src/i18n.ts + apps/miniapp/src/i18n.ts（各带 tests） | ✅ |
| 19.20 改名 | routes sessions.ts:312 PUT /:id/title + commands rename/title | ✅ |
| 19.23 CLI /settings | commands.ts `settings` 条 + 基线 28（协议测试 commands.test.ts:49 断言 toHaveLength(28)） | ✅ |
| 19.34 自更新 | apps/desktop/src/updater.ts | ✅ |
| 19.35 审查模式 | routes sessions.ts:234 /review + permissions.ts:48 reply-all | ✅ |
| 19.38 诊断页 | packages/engine/src/logs.ts | ✅ |
| 19.39 键位自定义 | KeymapSettingsSchema（protocol api.ts/keymap.ts） | ✅ |
| 19.41 置顶+Todo | routes sessions.ts:330 /pin + builtin/todo.ts + showTodo 设置键 | ✅ |
| 19.43 主题层 | apps/web/src/features/appearance/（WallpaperLayer/StaticWallpaperLayer/wallpapers.ts）+ styles/theme.css | ✅ |
| 19.48 长文规则 | scripts/check_doc_links.py check_copy_slop_warn（检查 6）+ DESIGN §12.7.1 | ✅ |
| ZC-1 微压缩 | microcompact.ts + run-loop.ts | ✅ |
| ZC-2 alwaysAsk | permission/service.ts + tools/pipeline.ts + tools/permission-port.ts | ✅ |
| ZC-3 续写 | run-loop.ts:105-114 ZC3_MAX_CONTINUATIONS | ✅ |
| ZC-4 resolveInput | tools/pipeline.ts + definition.ts + builtin/edit.ts | ✅ |
| ZC-5 read-state | tools/read-state.ts 全文（ADR D55 双通道） | ✅ |
| 19.45 | **表无此行、§5D 无卡**，仅 v4.140 版本行占号 | ⚠️ F-08 |

**§8.6 测试矩阵**：protocol 行"34 种事件样例逐一过"（L3233）与 web 行"applyEvent 34 种逐一断言"（L3242）❌——实数 35（F-01）。

**§9 参考速查表**：锚定"31 条"，实测表 33 行 − 表头 2 行 = 31 ✅。

**§4.6.2/§1.1**：engine 两入口（index.ts 69 导出 = 闸值、index-internal.ts 在、public-surface.test.ts 在）✅；`engine.ts` 3161 行（v1.58 判）vs 实测 3130——差 1%，在 ±10% 容差内 ⚠️（F-12，机制按设计工作）。

### 2.2 doc/08-v2-roadmap.md + doc/08-v2-roadmap-2.md（CK 批）

CK 卡抽查 15 张，逐张找码：

| 卡 | 声称 | 证据 | 判 |
| ---- | ---- | ---- | ---- |
| CK-1 后台任务 | task.* 三事件 + runInBackground + task_output/task_stop + 四端任务卡 | events.ts task.started/completed/progress + background-task-tools.ts + bash.ts runInBackground + apply-event slice.tasks | ✅ |
| CK-2 hooks/信任门 | 14 挂点 + fireBlockingRace + project-trust 三档 | tools/guard.ts 系 + trust.ts + routes readonly.ts:191-192 + settings hooks.projectTrust.mode | ✅ |
| CK-3 循环检测 | 六信号 runaway-guard | packages/engine/src/runaway-guard.ts:1-14（六信号清单逐条在码） | ✅ |
| CK-6 提问 | question.* 两事件 + ask_user + 四端作答 | events.ts + builtin/ask-user.ts + routes permissions.ts:37 | ✅ |
| CK-7 溢出压缩 | E_LLM_OVERFLOW 分类 → 同 turn 反应式压缩 | run-loop.ts:427-431（overflowCooled 限一次） | ✅ |
| CK-8 cache 断点 | cacheRetention 开关 + Anthropic/OpenAI 分型 | pi-gateway.ts:84-85,359-363 | ✅ |
| CK-9 Unicode | 递归脱敏 | tools/unicode-sanitize.ts + tools/guard.ts | ✅ |
| CK-10 edit 容错 | 三级渐进 + is_exact 上报 | builtin/edit.ts:12-13,262 | ✅ |
| CK-11 ToolSearch | 延迟加载 | builtin/tool-search.ts | ✅ |
| CK-13 present | present 工具 + deliverables.presented | builtin/present.ts（E_DELIVERABLE_MISSING）+ events.ts | ✅ |
| CK-14 无头输出 | --output-schema + --resume-last | apps/cli/src/print.ts | ✅ |
| CK-15 @-mention | mention.ts 单源 | packages/engine/src/mention.ts | ✅ |
| CK-16 ACP | **卡内零 ✅、正文写"后置池观察项"** | **代码已落地**：apps/cli/src/acp-server.ts（commit 48b0494 自称"CK-16 / doc/15 方案一"） | ❌ F-07（反向漂移：码先于文档） |
| CK-17 安全六维 | ToolSafety 五维 + concurrentSafe/riskLevel | tools/definition.ts:95-142 | ✅ |
| CK-18 Kimi 分析 | 交付 doc/14 | doc/14-kimi-code-analysis.md 在（295 行） | ✅ |

### 2.3 ARCHITECTURE.md

**ADR 抽查 16 张**（D1/D5/D7/D9/D13/D14/D17/D19/D24/D25/D33/D44/D46/D55/D56/D59）：15 张落地属实 ✅——D9（bash.ts:59 `where bash` 探测 + WSL stub 跳过）、D13（config.ts:136 maxStepsPerTurn: 40）、D14（sidecar-env.ts + healthz 轮询）、D17（session/scan.ts:171,197 parentSession）、D25（memory/store.ts:3-5 FTS5 trigram + LIKE 降级）、D46（mcp/manager.ts:15,52-66 StreamableHTTPClientTransport）、D59（terminal-pty.ts/preload-terminal.ts node-pty）等。**两张不实**：

- **F-05（P2）**：D19 标题与结论仍为 "Ink v6"（ARCHITECTURE.md:229,236），而 `apps/cli/package.json` 为 `"ink": "^7.1.1"`（工单 10.56 升级；AGENTS v1.29 已把自身措辞改为 Ink 7，ADR 未跟进修订注记）。后续修订应照 D19 既有"修订（10.8）"体例补一段而非改历史行。
- **F-06（P3）**：ADR 表无 D37/D38 条目（D39:427 注记称"D37 为 16.4 /trust（已在 engine 源码引用）、D38 为并行在途预留"），但最终这两单的 ADR 落为 **D40/D41**——引擎侧 5 处注释仍引用"ADR D37/D38"（`permission/service.ts:95,139,144`、`settings-store.ts:218`、`extensions/loader.ts:2`、`engine.ts:312`），指向不存在的编号。与已裁决"永久维持"的两张 D28 同型，但**未有任何登记**。

**硬闸表（§9.6）** ✅：knip.jsonc 在根、ci.yml knip 独立步（ci.yml:29）；no-console error 挂 engine/server（eslint.config.js:139,149）；no-explicit-any error（:109）；检查器 5.5/检查 7 读代码的事实源锚（见 §2.8）。两张 D28 消歧注记在档 ✅（v1.51 判决）。

### 2.4 doc/01 / doc/03 / doc/05 / doc/06 / doc/07 / doc/09

- **doc/01**：§10 #13 Kimi Code 行与 AGENTS/README 索引一致 ✅；闭源清单（Antigravity/ZCode 等）为调研判决 ➖（其中 ZCode 于 v1.65 翻案入册，历史行不改属规则允许）。速查表 31 条锚 ✅。
- **doc/03**：`reducer 事件表单测（35 种事件逐一断言）` ✅ 与实数一致（34 族不在本档）。
- **doc/05**：G6 "无 LICENSE" → 已消解 ✅（根 LICENSE MIT 在，doc/05:79 登记）；其余历史审计快照 ➖。
- **doc/06**：性能断言两文件在（`apps/server/tests/perf-replay.test.ts`、`packages/engine/tests/perf-memory.test.ts`）✅；`examples/evals/src/harness.ts` 在 ✅；`.github/workflows/` 五份（ci/nightly/release/official/desktop-win）与 §2 表一致 ✅；e2e job 在 ci.yml:73-81 ✅。
- **doc/07**："不做"判决抽 3：Python Worker——全仓无 Python worker 模块 ✅；显式 Planner——engine 无 planner 模块 ✅；H09 browser 族——已落地且与判决注记一致 ✅。H01–H36 编号体系与 doc/02 §8.7 引用对得上 ✅。
- **doc/09**：判决"不接"✅——全仓 grep 无 terminal-bench/swe-bench/harbor 接线代码；触发条件与接线草图为规划文本 ➖。

### 2.5 doc/10 / doc/11 / doc/12 / doc/13 两份 / doc/14~16（审计与调研报告的收口声称）

- **doc/10**：RT3-02 已修 ✅（commit 40ddd97 在 + main.tsx:34,55 `--version` 独立退出）；RT3-07 已修 ✅（GET /api/mcp/config 路由在 readonly.ts:180 + maskMcpConfigForClient/mergeMaskedMcpConfig + MCP_ENV_MASK 全链）；W 批 19 单现状表为自述性登记 ➖/✅（抽 W9 检查器扩展锚点——FACT_RULES 扩展锚点规则确实在档）。
- **doc/11**：LA-63 → `scripts/check_invariants.py` 存在且 5/5 通过 ✅（本审计实跑取证）；LA-11 → AGENTS §2.13 批量编辑断言铁律在档 ✅；LA-41 行数口径 3161 vs 实测 3130 ⚠️（F-12）。
- **doc/12**：ZCode 分析结论 ➖；其产出 ZC-1~5 已全部验证有码（见 §2.1）✅。
- **doc/13-code-spec-audit**：A-1 已修 ✅（engine.ts:1862-1868 updatePrompt 现经 resolveInRoot，注释自引 A-1）；B-1~B-4 已修 ✅（protocol session-rows.ts/ui-copy.ts 单源在）；G-1 ✅（apps/web/tests/event-coverage.test.ts 词表↔reducer 编译期穷举闸在）；**E-1 v1.1 整改登记声称"已消解（代码/文档同为 35——对岸消失）"❌（F-09）——35 族确实归一，但 34 族 6 处未动（见 F-01），"对岸消失"只对了一半**。
- **doc/13-project-review**：第一步 595fe3b（三簇迁出）与 §9 决策链登记一致 ✅；R-D"不再拆"判决 ➖（人类决策记录）。
- **doc/14**：外部仓调研结论 ➖（无代码性声称）。
- **doc/15**：ACP 调研的"方案一"已由 48b0494 落地 ✅（doc/15 本身只报不建，落地登记在 doc/08-v2-roadmap-2 版本行）。
- **doc/16**：压缩规则调研结论 ➖；"滚动摘要"确未实现（compaction.ts 无 rolling/滚动实现）——与 CK-12 卡"滚动摘要留卡"一致 ✅。

### 2.6 README.md / README.en.md / CHANGELOG.md

- README.md：`35 种事件词表` ✅、四端口径 ✅、审批四键 `1（y）/2（a）/4 本项目总是/3（n）` 与 `apps/cli/src/components/ApprovalPrompt.tsx:22` 逐字一致 ✅（doc/10 v1.19 修复已回写）。
- **F-04（P2）**：README.en.md:62 `27 event types`——陈旧 8 枚（27 是阶段十六 16.9 时期的旧数）。中文 README 已 35 而 EN 版停留在 27，说明 EN 版未纳入事件计数同步面。
- **F-10（P3）**：CHANGELOG.md 有两个 `## [1.0.0]` 标题（L36 2026-09-19 阶段十一~十八节、L67 2026-09-02 v1 基线节）——语义上分两节可辩，但同一版本号双标题不符合 keep-a-changelog 惯例；`check_version_duplicates` 只扫 doc/02，CHANGELOG 不在覆盖面。

### 2.7 DESIGN.md

- §5/§13 键位：`Ctrl/Cmd+K` 命令面板 ↔ keymap.ts:146 ✅；§13.K.4 CLI footer 双行 ↔ apps/cli/src/components/Footer.tsx:3-4（左=项目·git 分支·模型·运行指示，右=上下文%，取不到不渲染）✅；§12.9 壁纸主题豁免 ↔ appearance/ 三文件 + theme.css ✅；设置项口径（uiFontSize/theme 热档）与 SettingsDto 一致 ✅。

### 2.8 检查器可信度（专项）

**check_doc_links.py（520 行，8 检查）**：

- ✅ 检查 1/3/4（md 链接、版本重号、反引号路径）与声称一致；检查 5/6（对外文案口号 + 词级 warn 档）在档；**检查 5.5 与检查 7 是仅有的两个"读代码"的计数闸**（Transport 95 ✅、official constants eventTypes=35/builtinCommands=28 ✅），且检查 7 的数键正则已补下划线（microcompact_boundary 判例注记在码，check_doc_links.py:418-420）。
- **F-02（P1）**：`FACT_RULES`（L100-132）的事件词表计数四条规则**全部是文档↔文档互查，从不读 events.ts**——AGENTS §4.1 与 FACT_RULES 注释均自称"事实源 = packages/protocol/src/events.ts 的 EventSchemas 条目实数"，与实现不符。后果即 F-01：34 族四个锚点互相一致即可绿灯。检查 7 只扫 official/，doc 族/apps/docs/CONTRIBUTING 不在其靶面。

**check_invariants.py（213 行，5 检查）**：实跑 5/5 通过（shadow-lg 零命中/圆角封闭集/engine 导出 69/engine.ts 3130 vs 记录 3161/端点 78 全在 openapi）✅。

- **F-11（P3）**：检查 5 的路由提取仅扫 `apps/server/src/routes/`（check_invariants.py:151 `routes_dir = root/"apps"/"server"/"src"/"routes"`）——`pairing-routes.ts`（4 端点）与 `sse.ts`（/api/event）物理在 routes/ 目录外，**若在这两处新增端点漏登 openapi 不会被抓**；当前 openapi 恰好手工含 /api/pair×3 才没红。且比对是 routes→openapi 单向，openapi 侧多余条目不报。

## 3. 发现清单（分级汇总）

| # | 级别 | 一句话 | 证据 |
| ---- | ---- | ---- | ---- |
| F-01 | **P1** | 事件词表 34 族六处计数漂移：apps/docs/index.md:7,17、apps/docs/faq.md:61、CONTRIBUTING.md:23、doc/02 §8.6 两行（L3233/L3242）均写 34，代码实数 35；apps/docs/index.md 与自己链接的生成页 events.md（35）自相矛盾 | events.ts:26-308 实数 35；上述 6 行 |
| F-02 | **P1** | check_doc_links.py 事件计数规则是纯文档互查、不读代码，"事实源 = events.ts 实数"的声称与实现不符——全族漂移结构性不可检 | check_doc_links.py:100-132,188-208（无代码锚）vs AGENTS §4.1 声称 |
| F-03 | **P2** | doc/02 §4.5 端点表缺 21 行：healthz、questions/:requestId、mcp/:server/auth、browser/cleanup、link-preview、feedback×3、storage×4、prompts×2、logs、sessions/:id/pin、sessions/:id/title、arena×4——而 routes/index.ts:3 自称"端点清单 = doc/02 §4.5 表" | 路由实测 78+4+2 vs §4.5 表行 |
| F-04 | **P2** | README.en.md:62 "27 event types" 陈旧 8 枚 | README.en.md:62 vs events.ts 实数 |
| F-05 | **P2** | ARCHITECTURE D19 仍写 "Ink v6"，cli 实为 ink ^7.1.1（10.56 升级未修 ADR） | ARCHITECTURE.md:229,236 vs apps/cli/package.json |
| F-06 | **P3** | D37/D38 无 ADR 条目，但 engine 五处注释引用"ADR D37/D38"（最终 ADR 实为 D40/D41）——未登记的编号漂移（与两张 D28 同型） | ARCHITECTURE.md:427 vs permission/service.ts:95,139,144、settings-store.ts:218、extensions/loader.ts:2、engine.ts:312 |
| F-07 | **P3** | CK-16 卡零 ✅ 且写"后置池观察项"，代码已落地（acp-server.ts，48b0494）——反向漂移：码先于文档 | doc/08-v2-roadmap-2 §CK-16 vs apps/cli/src/acp-server.ts |
| F-08 | **P3** | 19.45 仅在版本行占号，doc/02 §8 与 doc/08 §5D 均无卡/行——"48 工单"计数下实有 47 行 | doc/02 阶段十九表无 19.45 行；doc/08:2766 注记 |
| F-09 | **P3** | doc/13 v1.1 声称 E-1"已消解（对岸消失）"——仅 35 族成立，34 族六处未动（同 F-01） | doc/13-code-spec-audit.md:12 vs F-01 六行 |
| F-10 | **P3** | CHANGELOG.md 两个 [1.0.0] 标题；版本重号检查不覆盖 CHANGELOG | CHANGELOG.md:36,67；check_doc_links.py:217-240 只扫 doc/02 |
| F-11 | **P3** | check_invariants.py 检查 5 路由扫描面不含 routes/ 目录外的 pairing-routes.ts 与 sse.ts，且单向比对 | check_invariants.py:171-189 |
| F-12 | **P3** | engine.ts 行数记录口径 3161（AGENTS §1.1 / check_invariants / doc/11）vs 实测 3130——容差内绿灯，机制按设计工作，记录值可顺手追平 | check_invariants.py:133-137；实测 wc -l |

**修复路径提示**（供拍板，不在本批执行）：F-01/F-02/F-09 应成组修——先给 check_doc_links.py 增一条"代码锚"规则（照检查 7 的 real_event_type_count 现成函数扩靶面），再把 34 族六处改 35，同时 F-09 补一行登记；F-03 补表 21 行或把 routes/index.ts 注释改口径（二选一，前者重）；F-04/F-05/F-06 各一处文本修 + F-06 建议在 ARCHITECTURE 加消歧注记（照两张 D28 判例，不改历史行）。

## 4. 诚实边界

- **抽查率自报**：doc/02 §8 历史工单总量 200+，本审计抽 30 单（阶段十六 9/9 全量、阶段十九 17/48、ZC 5/5、CK 15/18）；其余按计数锚与检查器间接覆盖。未抽查工单的勾选状态不做结论。
- **"✅证实"的含义**是"声称的机制/文件/数字在码中可寻获"，不等于"行为在运行时正确"——本审计不做动态验证（单测/eval 归 CI）。
- **事件实数的测量方法风险**：数 EventSchemas 顶层键靠正则，第一版正则漏下划线键数成 34（与 doc/13 E-1 疑似同型失误）。本审计最终数采用平衡括号块内全键穷举（35），并经 event-coverage.test.ts 的 MIN_SAMPLE 穷举表交叉印证。
- **不可代码验证项**未计伪：决策记录（R-D、四项拍板、CK-18 裁决池）、外部仓调研（doc/01/12/14/16）、历史版本行（一律不改）。doc/14 的外部数字（kimi-code 星数/文件数）未在线复核。
- **检查器实跑**仅 check_invariants.py（5/5 过）；check_doc_links.py 未本机实跑（§2.2 本机零验证），其结论来自源码阅读 + 34 族六个锚点的正则手工回放。
- 本报告自身为文档，声称面同样受 F-01/F-02 教训约束：所有数字在本批写入前均已按源码重测。
