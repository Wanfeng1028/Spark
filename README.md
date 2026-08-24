# Spark

> 引擎 headless，UI 是事件流的投影。

![status](https://img.shields.io/badge/status-阶段一_骨架期-blue) ![node](https://img.shields.io/badge/node-%E2%89%A5_22-3f3f46) ![react](https://img.shields.io/badge/react-19-3f3f46) ![ts](https://img.shields.io/badge/typescript-strict-3f3f46) ![monorepo](https://img.shields.io/badge/pnpm-monorepo-3f3f46)

Spark 是一个跑在本机的 **Agent 工作台**：Node/TS 引擎负责运行循环、工具执行与审批，Web 前端（后期加 Electron 壳）只做一件事——把事件流投影成界面。核心体验三件事：

- **流式对话** —— token 级 delta 增量渲染
- **工具调用可视化** —— 每次调用是会话流里可折叠的执行块（含 diff / 终端输出）
- **人工审批** —— 审批卡内联在工具调用位置，超时与异常一律拒绝（fail-closed）

刻意不做：多用户、登录、公网部署（绑定 127.0.0.1 是设计而非缺省）。

**当前状态**：阶段一（骨架期）——工单 1.1 workspace 骨架、1.2 `@spark/protocol` 唯一合同（19 种事件 · 26 单测全绿）已完成；下一步 = 工单 1.3~1.6（mock 场景 / MockTransport / web 空壳 / server 空壳）。

## 架构一览

```
apps/web            React 19 SPA —— 只消费事件流（applyEvent reducer）
   │  HttpTransport：REST 命令 + GET /api/event（SSE 单端点，since=seq 断线续播）
   ▼
packages/protocol   前后端唯一合同：19 种事件词表 · zod schema · Transport 接口
   ▼
apps/server         Fastify 薄壳：REST + SSE + 静态托管（127.0.0.1，无鉴权）
   ▼
packages/engine     InputQueue(now/steer/queue) → RunLoop → ToolPipeline
                    PermissionService（挂起/级联）· SessionManager（JSONL 树）· LlmGateway
   ▼
~/.spark/sessions/<cwd>/<ses_id>.jsonl    durable 事件日志（append-only，可回放）
```

## 技术栈

| 端 | 技术 |
|---|---|
| 前端 | Vite 7 · React 19 · TypeScript(strict) · Tailwind CSS v4 · shadcn/ui · Vercel AI Elements（copy-in）· streamdown · react-virtuoso · zustand |
| 后端 | Node 22+ · `@earendil-works/pi-ai` / `pi-agent-core` · Fastify · SSE · 自写 append-only JSONL 会话日志 |
| 布局 | pnpm monorepo：`packages/protocol`（唯一合同）· `packages/engine` · `apps/server` · `apps/web` · `apps/desktop`（阶段五） |

## 文档

| 文档 | 内容 |
|---|---|
| [AGENTS.md](./AGENTS.md) | AI 代理工作规范——任何 AI 助手进入本仓库先读；十一条硬性约定 + 规则放置规范 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构总览 · 关键决策记录（ADR）· 代码"AI 生成味"黑名单（§9，后端/通用） |
| [DESIGN.md](./DESIGN.md) | 视觉与交互规则——桌面应用感（对标 Codex/ZCode）· token/密度 · "AI 生成风"黑名单（§12）· 组件 DoD |
| [doc/01-research-report.md](./doc/01-research-report.md) | 调研档案：10 个参考项目源码级调研 + 前后端生态选型 |
| [doc/02-development-plan.md](./doc/02-development-plan.md) | 完整开发方案：协议 / 引擎 / 前端 / 服务端实现级规格 + 五阶段路线图 |
| [doc/03-frontend-approach.md](./doc/03-frontend-approach.md) | 前端专题：参考实现分析 · 我方前端思路 · 与传统 Web 开发的差异 |
| [.agents/skills/](./.agents/skills/) | 可重复任务流程：docs-update · new-event-type · new-tool · frontend-component |

## 开发

```bash
# 阶段一骨架进行中：install / typecheck / test / lint 已生效；dev 待工单 1.5/1.6 落地后启用
pnpm install
pnpm dev                    # server + web 并行（待 apps/web、apps/server 就位）
pnpm --filter web dev       # 仅前端（VITE_SPARK_MOCK=1 可脱离后端跑 Mock）
pnpm test / typecheck / lint
```

## 设计原则

- **引擎 headless，UI 是事件流的投影** —— 所有客户端只通过协议对话
- **协议先行、前端先行** —— MockTransport 让前端不等后端
- **durable/live 事件二分** —— delta 不落盘，边界事件可回放
- **失败闭合 + 审批 fail-closed** —— 事件流永不悬空，异常一律拒绝而非放行
- **能复用开源就不自己写** —— 参考项目各取所长（决策记录见 ARCHITECTURE.md ADR）
- **无聊的代码，克制的界面** —— 前后端各有"AI 生成味"黑名单（DESIGN.md §12 / ARCHITECTURE.md §9）

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-08-22 | 晚风（Wanfeng1028，创建仓库） | 仓库初始化 |
| v1.1 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`） | 重写 README：项目介绍/技术栈/文档导航/核心理念 |
| v1.2 | 2026-08-22 | 同上 | 文档导航新增 doc/04 前端约束规则 |
| v1.3 | 2026-08-22 | 同上（决策：晚风 Wanfeng1028） | 移除"本地优先"定位措辞（事实不变，不再作为明面标签；技术细节保留在 ARCHITECTURE D5 等处） |
| v1.4 | 2026-08-23 | 同上；依据：晚风提供的四类约束框架文章 | 文档体系按"AGENTS 管项目 / DESIGN 管视觉 / SKILL 管流程 / 专属文件管工具差异"重组：导航表更新（+ARCHITECTURE.md/+skills，doc/04 并入 DESIGN.md） |
| v1.5 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028） | DESIGN.md 导航行补"AI 生成风黑名单（§12）"（DESIGN v1.2 依外部调研扩充六类清单） |
| v1.6 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028） | ARCHITECTURE.md 导航行补"代码 AI 生成味黑名单（§9）"（ARCHITECTURE v1.5 新增后端/通用六类清单；DESIGN v1.3 前端 §12 深化 P0-P2 分级+文案语气+grep 硬检查） |
| v1.7 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，"README 写得太丑"） | 排版重做：状态 badges（zinc 中性色）；导语改散文段+核心体验三件事；新增"架构一览"ASCII 分层图与"开发"命令节；文档导航/技术栈描述收紧；设计原则补第 6 条"无聊的代码，克制的界面" |
| v1.8 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；发起：晚风（Wanfeng1028，外部评审指出事实漂移） | **四处漂移修复**：状态徽章与"当前状态"阶段零→阶段一（工单 1.1/1.2 完成）；架构图事件词表 21→19 种；开发命令注释对齐现状。新增 `scripts/check_doc_links.py` 防复发（CI 已接） |
