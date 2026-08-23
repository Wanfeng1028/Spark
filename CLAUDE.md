# CLAUDE.md

@AGENTS.md

## Claude Code 专属补充

- 通用规则已在上方导入的 AGENTS.md，不要在本地复制维护。
- **修改 `packages/protocol/` 或 `doc/01/02` 的协议章节前，先进入 Plan Mode** 给出两端影响面（前端 applyEvent + 引擎 emit 点 + 单测清单）。
- 遇到"新增事件类型 / 新增工具 / 文档变更 / 组件改造"任务，按 `.agents/skills/` 对应 SKILL.md 流程执行。
- 提交前自查 AGENTS.md 硬性约定十二条；文档改动必须更新版本记录表。
- **参考项目禁止克隆到本地**（AGENTS.md 第 12 条）：调研一律在线访问（gh api / raw 直读 / npm registry）。
