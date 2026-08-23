# Spark — Qoder 项目规则

> Qoder 原生读取根目录 `AGENTS.md`（权威规范）；本文件是其 `.qoder/rules/` 项目规则目录内的**摘要版**（可经 `@rule` 引用），冲突时以 AGENTS.md 为准。

## 必守约束（摘要）

- **TypeScript strict**，禁 `any`；跨包导入只依赖 `@spark/protocol` 导出。
- **协议改动从 `packages/protocol` 开始**：事件词表/API 类型 → 前端 applyEvent + 单测 → 引擎 emit 点 → 文档同步；禁止私自定义 wire 类型。
- **前端**：Tailwind + shadcn token；视觉遵循 `DESIGN.md`（桌面应用感、13px 密度、转录式会话流）；**禁止一切"AI 生成风"**（蓝紫渐变玻璃/暖调配色/细描边+内部毛玻璃）；组件 copy-in 改造，不引黑盒依赖。
- **UI 状态只来自事件流**（applyEvent）；组件禁直接 fetch；禁乐观更新。
- **引擎铁律**：durable/live 二分；surface 纪律；失败闭合；审批 fail-closed；单写者 JSONL。
- **文档纪律**：改 .md 必须更新版本记录表（AI 编写注明软件+模型）。
- **文件删除保护**：AI 无权删除任何文件；删除须经人类五层级确认。
- **完成单元**：单测 → typecheck/lint → commit（conventional + 中文）→ push。
- **重复任务**按 `.agents/skills/*/SKILL.md` 执行。

## 命令

骨架未建（见 AGENTS.md §4 占位）：规划为 `pnpm install / pnpm dev / pnpm test / pnpm typecheck / pnpm lint`。
