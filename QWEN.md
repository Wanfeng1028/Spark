# QWEN.md

@AGENTS.md

## Qwen Code 专属补充

- 通用规则已在上方导入的 `AGENTS.md`（Qwen Code 兼容读取），不要在本地复制维护。
- 上下文分层：先读 `AGENTS.md` → 架构任务读 `ARCHITECTURE.md` → 前端任务读 `DESIGN.md`（视觉规则）与 `doc/03-frontend-approach.md`。
- 重复性多步骤任务（新增事件类型/新增工具/文档变更/组件改造）按 `.agents/skills/` 对应 SKILL.md 执行；若 Auto-Skills 扫描到该目录，以既有流程为准，不重写。
- 修改 `packages/protocol/` 前先给出两端影响面（前端 applyEvent + 引擎 emit 点 + 单测清单）。
