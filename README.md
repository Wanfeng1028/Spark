# Spark

> AI Agent 工作台 —— 引擎 + 事件流驱动的 Web 前端，后期加 Electron 桌面壳。
> 核心体验：流式对话 + 工具调用可视化 + 人工审批（human-in-the-loop）。

## 项目状态

**阶段零（设计期）**：调研与设计文档已完成，代码未开工。下一步 = 开发方案阶段一（monorepo 骨架 + 协议包 + MockTransport）。

## 技术栈

| 端 | 技术 |
|---|---|
| 前端 | Vite 7 + React 19 + TypeScript(strict) + Tailwind CSS v4 + shadcn/ui + Vercel AI Elements（copy-in）+ streamdown + react-virtuoso + zustand |
| 后端 | Node 22+ + TypeScript + `@earendil-works/pi-ai` / `pi-agent-core` + Fastify + SSE + 自写 append-only JSONL 会话日志 |
| 架构 | pnpm monorepo：`packages/protocol`（前后端唯一合同）· `packages/engine` · `apps/server` · `apps/web` · `apps/desktop`（后期） |

## 文档导航

| 文档 | 内容 |
|---|---|
| [DESIGN.md](./DESIGN.md) | 根级设计文档：架构、核心抽象、关键设计决策记录（ADR） |
| [AGENTS.md](./AGENTS.md) | AI 编码代理工作规范（任何 AI 进入本仓库先读） |
| [doc/01-research-report.md](./doc/01-research-report.md) | 调研档案：六大参考项目（Codex/Claude Code/Grok Build/DeepSeek harness/pi/opencode）源码级调研 + 前后端生态选型 |
| [doc/02-development-plan.md](./doc/02-development-plan.md) | 完整开发方案：协议/引擎/前端/服务端实现级规格 + 五阶段路线图 |
| [doc/03-frontend-approach.md](./doc/03-frontend-approach.md) | 前端专题：参考项目前端实现分析、我方前端思路、与传统 Web 的差异 |
| [doc/04-frontend-rules.md](./doc/04-frontend-rules.md) | 前端约束规则：桌面应用感（对标 Codex/ZCode）、布局/密度/颜色/交互/动效规范、反网站化黑名单、组件 DoD |

## 核心理念

- **引擎 headless，UI 是事件流的投影**——所有客户端只通过协议对话
- **协议先行、前端先行**——MockTransport 让前端不等后端
- **durable/live 事件二分**——delta 不落盘，边界事件可回放
- **失败闭合 + 审批 fail-closed**——事件流永不悬空，异常一律拒绝而非放行
- **能复用开源就不自己写**——六大参考项目各取所长（详见 DESIGN.md 决策记录）

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-08-22 | 晚风（Wanfeng1028，创建仓库） | 仓库初始化 |
| v1.1 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`） | 重写 README：项目介绍/技术栈/文档导航/核心理念 |
| v1.2 | 2026-08-22 | 同上 | 文档导航新增 doc/04 前端约束规则 |
| v1.3 | 2026-08-22 | 同上（决策：晚风 Wanfeng1028） | 移除"本地优先"定位措辞（事实不变，不再作为明面标签；技术细节保留在 DESIGN D5 等处） |
