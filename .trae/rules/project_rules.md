# Spark — Trae 项目规则

> Trae 无法自动导入 AGENTS.md，以下仅为**硬约束摘要**；完整规范见根目录 `AGENTS.md`（权威）、`DESIGN.md`（视觉）、`ARCHITECTURE.md`（架构）。冲突时以 AGENTS.md 为准。

## 必守约束

- **TypeScript strict**，禁 `any`（确需时 `unknown` + 收窄）；跨包导入只依赖 `@spark/protocol` 导出。
- **协议改动从 `packages/protocol` 开始**：改事件词表/API 类型 → 前端 applyEvent + 单测 → 引擎 emit 点 → 文档六处同步；禁止私自定义 wire 类型。
- **前端**：Tailwind + shadcn token；视觉遵循 `DESIGN.md`（桌面应用感、13px 密度、转录式会话流）；**禁止一切"AI 生成风"**：蓝紫渐变玻璃、暖棕/米色暖调、细描边+内部毛玻璃按钮；组件 copy-in 进 `components/ui/` 改造，不引黑盒依赖。
- **UI 状态只来自事件流**（applyEvent reducer）；组件禁止直接 fetch；禁止乐观更新/假状态。
- **引擎铁律**：durable/live 二分（delta 不落盘）；surface 纪律；失败闭合；审批 fail-closed；单写者 JSONL。
- **文档纪律**：修改任何 .md 必须更新其开头版本记录表（AI 编写注明软件+模型）；`doc/01` 为历史档案只追加。
- **文件删除保护**：AI 无权删除任何文件（rm/git rm/清空目录等一律禁止）；删除须经人类发起并完成五层级确认。
- **完成单元**：单测（新增事件类型必须同步 applyEvent 单测）→ typecheck/lint → commit（conventional + 中文）→ push origin main。
- **重复任务**（新增事件/新增工具/文档变更/组件改造）按 `.agents/skills/*/SKILL.md` 流程执行。

## 命令

骨架未建（见 AGENTS.md §4 占位）：规划为 `pnpm install / pnpm dev / pnpm test / pnpm typecheck / pnpm lint`。

## 红线

- Claude Code 泄露源码只读不抄（专有许可）；pi/dsh/opencode（MIT）、Codex/Grok（Apache-2.0）复用须保留版权声明。
- 密钥只从环境变量读；`.env` 不入库。
