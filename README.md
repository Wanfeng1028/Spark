# Spark

> 引擎 headless，UI 是事件流的投影。

简体中文 · [English](./README.en.md)

![status](https://img.shields.io/badge/status-v1_完成-green) ![license](https://img.shields.io/badge/license-MIT-3f3f46) ![node](https://img.shields.io/badge/node-%E2%89%A5_24-3f3f46) ![react](https://img.shields.io/badge/react-19-3f3f46) ![ts](https://img.shields.io/badge/typescript-strict-3f3f46) ![monorepo](https://img.shields.io/badge/pnpm-monorepo-3f3f46)

**Spark 是一个跑在你自己机器上的 Agent 工作台**——数据不出机器，四端连着同一个引擎，每一步可审计、可回放。它为"想要一个能看懂、能管住的编码 Agent"的人而做：不是云服务，没有账号体系，引擎负责运行循环、工具执行与审批，界面只做一件事——把事件流投影成你看到的样子。

核心体验四件事：

- **流式对话** —— token 级 delta 增量渲染
- **工具调用可视化** —— 每次调用是会话流里可折叠的执行块（含 diff / 终端输出）
- **人工审批** —— 审批卡内联在工具调用位置，超时与异常一律拒绝（fail-closed）
- **四端同一协议** —— web / 桌面 / CLI / 移动端与小程序，看到同一条 durable 事件流

刻意不做：多用户、登录、公网部署（绑定 127.0.0.1 是设计而非缺省）。

## Quick Start

```bash
# ① 安装 CLI（npm 包随 v1.0.0 发布——见 CHANGELOG；发布前可从源码跑，见「开发」节）
npm i -g @spark/cli

# ② 一条命令本机可用：拉起 server + 进入 TUI（退出连带回收 server）
spark up

# ③ 配模型（首回合前一次性）：~/.spark/models.json 声明 OpenAI 兼容供应商，
#    API key 经环境变量注入（不落盘、不入日志），例如：
#    { "providers": { "deepseek": { "apiKeyEnv": "DEEPSEEK_API_KEY",
#        "baseUrl": "https://api.deepseek.com/v1" } },
#      "defaultModel": { "provider": "deepseek", "model": "deepseek-chat", "contextWindow": 128000 } }
#    export DEEPSEEK_API_KEY=sk-xxx

# ④ 发第一条消息——写类工具会弹审批卡：1 允许一次 / 2 本项目总是 / 3 该用户总是 / 4 拒绝
```

## 四端一览

| 端                | 位置         | 形态                                                       |
| ----------------- | ------------ | ---------------------------------------------------------- |
| Web（默认入口）   | `apps/web`   | React 19 工作台：会话流、审批卡、差分预览、设置中心         |
| 桌面              | `apps/desktop` | Electron 壳：sidecar 复用同一 server（NSIS 安装包经 Actions 构建） |
| CLI               | `apps/cli`   | Ink 6 终端 TUI：纯单栏、footer 双行、`spark up` 一条命令可用 |
| 移动端            | `apps/mobile` · `apps/miniapp` | Expo+RN App 与 Taro 4 微信小程序：扫码配对后接入同一会话 |

## 安全模型（摘要）

- **本地优先**：默认只监听 `127.0.0.1`；非环回绑定强制开启配对鉴权（6 位码换长效 token，ADR D24），缺省行为不变是红线。
- **审批 fail-closed**：超时、异常、中断一律拒绝而非放行；bash 工具默认全审批。
- **硬边界先行**：路径越界在审批之前直接拒绝；密钥只从环境变量与本机密钥仓读取，日志与审计流统一脱敏。
- **每一步可审计**：durable 事件 append-only 落盘 `~/.spark/sessions/`——可回放、可分叉、可回滚（checkpoint）。

## 架构一览

```
apps/web            React 19 SPA —— 只消费事件流（applyEvent reducer）
   │  HttpTransport：REST 命令 + GET /api/event（SSE 单端点，since=seq 断线续播）
   ▼
packages/protocol   前后端唯一合同：21 种事件词表 · zod schema · Transport 接口
   ▼
apps/server         Fastify 薄壳：REST + SSE + 静态托管（127.0.0.1，无鉴权）
   ▼
packages/engine     InputQueue(now/steer/queue) → RunLoop → ToolPipeline
                    PermissionService（挂起/级联）· SessionManager（JSONL 树）· LlmGateway
   ▼
~/.spark/sessions/<cwd>/<ses_id>.jsonl    durable 事件日志（append-only，可回放）
```

## 技术栈

| 端   | 技术                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 前端 | Vite 7 · React 19 · TypeScript(strict) · Tailwind CSS v4 · shadcn/ui · Vercel AI Elements（copy-in）· streamdown · react-virtuoso · zustand |
| 后端 | Node 24+ · `@earendil-works/pi-ai` / `pi-agent-core` · Fastify · SSE · 自写 append-only JSONL 会话日志                                      |
| 布局 | pnpm monorepo：`packages/protocol`（唯一合同）· `packages/engine` · `apps/server` · `apps/web` · `apps/desktop`（阶段五）· `apps/cli`（阶段八）· `apps/mobile`（阶段九，Expo+RN）· `apps/miniapp`（阶段九，Taro 4 小程序）；另 `official/`=Spark 产品官网代码（仅前端，不在 pnpm workspace，独立于产品各端） |

## 文档

| 文档                                                         | 内容                                                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [CHANGELOG.md](./CHANGELOG.md)                               | 用户可见变更（Keep a Changelog）——版本与里程碑看这里                                            |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                         | 贡献入口：环境要求 · 工单认领 · PR 自查 · 发版纪律                                              |
| [AGENTS.md](./AGENTS.md)                                     | AI 代理工作规范——任何 AI 助手进入本仓库先读；硬性约定 + 规则放置规范                            |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                         | 架构总览 · 关键决策记录（ADR）· 代码"AI 生成味"黑名单（§9，后端/通用）                          |
| [DESIGN.md](./DESIGN.md)                                     | 视觉与交互规则——桌面应用感（对标 Codex/ZCode）· token/密度 · "AI 生成风"黑名单（§12）· 组件 DoD |
| [doc/01-research-report.md](./doc/01-research-report.md)     | 调研档案：10 个参考项目源码级调研 + 前后端生态选型                                              |
| [doc/02-development-plan.md](./doc/02-development-plan.md)   | 完整开发方案：协议 / 引擎 / 前端 / 服务端实现级规格 + 阶段路线图与工单表                        |
| [doc/03-frontend-approach.md](./doc/03-frontend-approach.md) | 前端专题：参考实现分析 · 我方前端思路 · 与传统 Web 开发的差异                                   |
| [doc/05-completion-audit.md](./doc/05-completion-audit.md)   | 完成度审计（阶段三后）：源码级核查实测结果 · 缺口清单 G1–G7 · 动工顺序                          |
| [doc/06-testing-plan.md](./doc/06-testing-plan.md)           | 测试体系补全计划：五层+契约分层 · CI 流水线 · 性能基线 · 走查模板                               |
| [doc/07-harness-audit.md](./doc/07-harness-audit.md)         | Harness 模块审计：十九条学科×三态 · 六大类源码级证据 · 缺口 H01–H36 · Python Worker 判决        |
| [doc/08-v2-roadmap.md](./doc/08-v2-roadmap.md)               | v2 展望与工单库：阶段十一~十六（发布化/可日用/可证明/SDK 化/生态面/命令面新机制）                |
| [.agents/skills/](./.agents/skills/)                         | 可重复任务流程：docs-update · new-event-type · new-tool · frontend-component                    |

## 开发

```bash
# install / typecheck / test / lint 为根脚本；dev 按包 --filter 启动
pnpm install
pnpm --filter server dev    # 后端（tsx watch；缺省 127.0.0.1:4318）
pnpm --filter web dev       # 仅前端（VITE_SPARK_MOCK=1 可脱离后端跑 Mock）
pnpm --filter cli dev       # CLI TUI（Ink；需 server 在跑；--api <url>/SPARK_API 指基址，缺省 127.0.0.1:4318）
pnpm --filter mobile dev    # 移动端 App（Expo；需 server 在跑，配对后连接）
pnpm --filter miniapp dev   # 微信小程序（Taro 4 watch 构建；微信开发者工具导入 dist）
pnpm test / typecheck / lint
pnpm eval                   # eval 回归（确定性场景集；--real 可选真实模型评分）
```

## 设计原则

- **引擎 headless，UI 是事件流的投影** —— 所有客户端只通过协议对话
- **协议先行、前端先行** —— MockTransport 让前端不等后端
- **durable/live 事件二分** —— delta 不落盘，边界事件可回放
- **失败闭合 + 审批 fail-closed** —— 事件流永不悬空，异常一律拒绝而非放行
- **能复用开源就不自己写** —— 参考项目各取所长（决策记录见 ARCHITECTURE.md ADR）
- **无聊的代码，克制的界面** —— 前后端各有"AI 生成味"黑名单（DESIGN.md §12 / ARCHITECTURE.md §9）

## 当前状态

- **v1 已完成合入 main**：五阶段（骨架/前端/引擎/深度体验/产品化）+ 阶段六~十（UI ZCode 化 / Harness 补全 / CLI TUI / 移动端三端 / UI 对齐与 CLI 重构）+ 质量收尾批次；全量测试与 e2e 由 CI 执行（本地开发只跑 typecheck/lint）。
- 用户可见变更与里程碑：[CHANGELOG.md](./CHANGELOG.md)。
- 下一程：阶段十一（发布化，doc/02 §8）→ 阶段十二~十六（[doc/08](./doc/08-v2-roadmap.md) 工单库）。

## 版本记录

<details>
<summary>展开版本记录（编年史）</summary>

| 版本 | 日期       | 作者                                                                                                                                                      | 变更内容                                                                                                                                                                        |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0 | 2026-08-22 | 晚风（Wanfeng1028，创建仓库）                                                                                                                             | 仓库初始化                                                                                                                                                                      |
| v1.1 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`） | 重写 README：项目介绍/技术栈/文档导航/核心理念                                                                                                                                  |
| v1.2 | 2026-08-22 | 同上                                                                                                                                                      | 文档导航新增 doc/04 前端约束规则                                                                                                                                                |
| v1.3 | 2026-08-22 | 同上（决策：晚风 Wanfeng1028）                                                                                                                            | 移除"本地优先"定位措辞（事实不变，不再作为明面标签；技术细节保留在 ARCHITECTURE D5 等处）                                                                                       |
| v1.4 | 2026-08-23 | 同上；依据：晚风提供的四类约束框架文章                                                                                                                    | 文档体系按"AGENTS 管项目 / DESIGN 管视觉 / SKILL 管流程 / 专属文件管工具差异"重组：导航表更新（+ARCHITECTURE.md/+skills，doc/04 并入 DESIGN.md）                                |
| v1.5 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028）                                                               | DESIGN.md 导航行补"AI 生成风黑名单（§12）"（DESIGN v1.2 依外部调研扩充六类清单）                                                                                                |
| v1.6 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028）                                                               | ARCHITECTURE.md 导航行补"代码 AI 生成味黑名单（§9）"（ARCHITECTURE v1.5 新增后端/通用六类清单；DESIGN v1.3 前端 §12 深化 P0-P2 分级+文案语气+grep 硬检查）                      |
| v1.7 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"README 写得太丑"）                                            | 排版重做：状态 badges（zinc 中性色）；导语改散文段+核心体验三件事；新增"架构一览"ASCII 分层图与"开发"命令节；文档导航/技术栈描述收紧；设计原则补第 6 条"无聊的代码，克制的界面" |
| v1.8 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，外部评审指出事实漂移）                                         | **四处漂移修复**：状态徽章与"当前状态"阶段零→阶段一（工单 1.1/1.2 完成）；架构图事件词表 21→19 种；开发命令注释对齐现状。新增 `scripts/check_doc_links.py` 防复发（CI 已接）    |
| v1.9 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段一开工指令）                                                                                        | **当前状态与状态徽章更新为阶段一完成**（工单 1.3~1.6 + 阶段验收勾选，doc/02 §8 v2.9 同步）                                                                                      |
| v1.10 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段二开工指令）                                                                                       | **当前状态与状态徽章更新为阶段二完成**（11 项前端工单 + 四场景 mock 验收勾选，doc/02 §8 v2.10 同步）                                                                            |
| v1.11 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段三继续）                                                                                          | **当前状态与状态徽章更新为阶段三进行中（工单 1–10 完成）**——engine 243 例 + server 23 例 + web 47 例全绿，PR #2 含阶段二+三全量代码；doc/02 §8 v2.14 同步勾选中                                                                                                                                                                                                                  |
| v1.12 | 2026-08-24 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段三完成）                                                                                          | **当前状态与状态徽章更新为阶段三完成**（工单 11 pino 日志+脱敏 + examples/e2e-smoke.sh 验收脚本）；全仓 367 例（engine 251 + server 23 + web 47 + protocol 46）；doc/02 §8 v2.15 同步勾选 pino 行；用户自配 DEEPSEEK_API_KEY 后由 examples/e2e-smoke.sh 完成真实模型验收三场景                                                                                                                                                                                                                  |
| v1.13 | 2026-08-25 | AI 编写：ZCode CLI · ox-alpha（model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；发起：晚风（Wanfeng1028）                             | 文档导航新增 doc/05 完成度审计（源码级核查：367 例全绿实测、缺口 G1–G7、外部评审采纳/保留意见、动工顺序）                                                       |
| v1.14 | 2026-08-25 | 同上；指误：晚风（Wanfeng1028）                                                                                                                          | **v1.13 作者栏勘误**：误沿既有版本表的"GLM-5.3"署名（历史标签、本会话不可核实），改为可确证标识 ox-alpha + model id；详见 doc/05 v1.1 勘误说明                 |
| v1.15 | 2026-08-25 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段五开工指令）                                                                                       | **状态更新为 v1——五阶段全部完成**（阶段五 5.1–5.5 全落地：Electron sidecar 壳/沙箱 wrapper/MCP client/子代理/skills 插件，ADR D14–D18；此前 README 停留在阶段三，本次一并补记阶段四完成）；导语"后期加 Electron 壳"改为现状；待用户环境执行的现场验收四项注记；doc/02 §8 v2.30 同步 |
| v1.16 | 2026-08-26 | AI 编写：ZCode CLI · ox-alpha（model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；发起：晚风（Wanfeng1028，D2 路线图指令）               | **当前状态行追加"阶段六~九已立项"**（doc/02 v3.0：阶段六 UI 重构 ZCode 化 / 阶段七 Harness 补全 / 阶段八 CLI TUI / 阶段九 移动端三端；依据 doc/07 审计缺口 H01–H36，未排期项入 v2 候选池；测试体系规划 doc/06）；文档导航新增 doc/06/doc/07 两行 |
| v1.17 | 2026-08-26 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段六开工指令） | **阶段六完成（6.1–6.8 全勾，分支 feat/stage6-ui 待 PR 合入）**：UI 重构 ZCode 化——主题翻转（light 默认+dark+system，AA 复核）/§13.A 布局栅格（左栏 264 折叠 48、空态垂直居中、内容列 768、顶栏 44、StatusBar 24、会话按项目分组）/控件按 §13.B 重过+Composer 重做（底部工具条、权限四档预设层 D7、now/steer/queue 分段、@ 与 / 菜单、多行 6 行上限）/设置中心（§13.D 三组导航+外观区全量+权限规则迁入）/模型管理（会话级选择器+供应商列表+测试连接；轻后端三路由例外已声明）/用量条（usage 估算+>80% 变色）/错误人话化（error-copy.ts 四端共享文案表）；测试首批入库：L2 组件 22 例+L3 E2E 7 例+L3.5 三视口基线截图 6 张（doc/06 v1.1）；全仓 vitest 579 例（engine 353/server 36/web 144/protocol 46）+ Playwright 7 例全绿；doc/02 v3.3–v3.8 |
| v1.18 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                                       | 架构图协议行事实修正 **事件词表 19→20 种**（阶段七工单 7.2 新增 `io.warning` I/O 护栏告警事件）；与 doc/02 v3.10、AGENTS v1.18、ARCHITECTURE v1.16 同步 |
| v1.19 | 2026-08-27 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                                       | 架构图协议行事实修正 **事件词表 20→21 种**（阶段七工单 7.5 新增 `memory.injected` 长期记忆注入事件——Projector 投影为模型上下文前缀，ADR D25）；与 doc/02 v3.14、AGENTS v1.19、ARCHITECTURE v1.17 同步 |
| v1.20 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                                                 | 开发命令区补 `pnpm eval`（阶段七工单 7.11：examples/evals 确定性场景集 + --real 可选真实模型评分，nightly.yml 每日接线）；与 doc/02 v3.20、doc/06 v1.2、doc/07 v1.12 同步 |
| v1.21 | 2026-08-29 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段七开工指令）                                                                                                 | **当前状态行刷新为阶段七完成待合入**：十二项工单全落地（7.9 判决删除）、doc/07 H01–H12 全勾销、全仓测试 757 例（engine 486/server 64/web 159/protocol 48）、nightly eval 接线；阶段八~九立项措辞替换"阶段七~九已立项" |
| v1.22 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段八开工指令——CLI TUI 全量）                                                                                   | **阶段八完成登记**：当前状态行刷新为阶段六/七/八完成待合入（工单 8.1–8.5；测试计数 782 例含 protocol 57/cli 16）；技术栈布局行补 `apps/cli`（阶段八）；开发区补 `pnpm --filter cli dev` 并清理阶段一过时占位（`pnpm dev` 行改按包 --filter 实际命令）；与 AGENTS v1.21、doc/02 v3.23 同步 |
| v1.23 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段九开工指令）                                                                                   | **当前状态行刷新为阶段九已开工：工单 9.1 配对鉴权完成待合入**（ADR D24：扫码配对为主手输兜底/双口径鉴权/启动护栏/撤销即断；缺省 127.0.0.1+无鉴权行为不变红线保持）；测试计数 814 例（server 64→85、protocol 57→68）；与 AGENTS v1.22、doc/02 v3.25 同步 |
| v1.24 | 2026-08-30 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段九开工指令）                                                                                   | **阶段九完成登记**：当前状态行刷新为阶段六/七/八/九完成待合入（工单 9.1–9.5：配对鉴权 + apps/mobile Expo+RN + apps/miniapp Taro 4 小程序壳，ADR D20–D24）；测试计数 921 例（新增 mobile 48/miniapp 51，server 85→92、protocol 68→69）；技术栈布局行补 `apps/mobile`/`apps/miniapp`；开发区补 `pnpm --filter mobile dev`/`miniapp dev`；真机/模拟器与小程序开发者工具走查由用户执行（留待记录）；与 AGENTS v1.23、doc/02 v3.29 同步 |
| v1.25 | 2026-08-31 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，v2 展望会话）                        | 文档导航新增 doc/08 v2 展望与工单库（阶段十一~十五：发布化/可日用/可证明/SDK 化/生态面，34 张工单含开工提示词；决策已拍板：MIT / npm CLI 优先） |
| v1.26 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028，阶段十全量开工指令）                        | 当前状态段登记阶段十进展（规格修订/会话流升级/侧栏细节/分支 chip+推理档位/CLI §13.K 纯单栏重构——ADR D19 修订）；阶段八描述同步"纯单栏会话优先" |
| v1.27 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028）                        | 技术栈布局行登记 `offical/`——Spark 产品官网代码（仅前端，不在 pnpm workspace，独立于产品各端）；与 doc/02 v3.35 §3 目录树同步 |
| v1.28 | 2026-08-31 | AI 编写：Qoder；发起：晚风（Wanfeng1028）                        | 官网文件夹拼写改名 `offical/` → `official/`（v1.27 登记名系笔误；仓库内重命名，历史行不改）；布局行引用同步；与 doc/02 v3.36、检查器 SKIP_DIRS 同步 |
| v1.29 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十一 11.8 指令） | **README 手册化重写（工单 11.8）**：导语改身份宣言（本地运行数据不出机器/四端同一协议/每一步可审计/反 AI 味克制界面）；新增 Quick Start（`npm i -g @spark/cli` → `spark up` → 配模型 → 首回合审批）与四端一览、安全模型摘要；"当前状态"编年史长段收缩为三行内并移交 [CHANGELOG.md]；版本记录表折叠至尾部；badges 补 license MIT、node ≥24（与 engines 对齐）；中英双版头部互链（[README.en.md]）。事实锚点行"21 种事件词表"不动 |
| v1.30 | 2026-09-02 | AI 编写：Jules (AI Assistant)；发起：晚风（Wanfeng1028） | **添加贡献者名单**：在 package.json 及各子包 package.json 中新增 `contributors` 字段并添加 Jules (AI Assistant) |

</details>
