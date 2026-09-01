# 贡献指南（CONTRIBUTING）

> 本文件只做**入口与引用**——项目规则、视觉纪律、架构约束的正文唯一来源分别是
> [AGENTS.md](./AGENTS.md)、[DESIGN.md](./DESIGN.md)、[ARCHITECTURE.md](./ARCHITECTURE.md)，
> 此处不复制正文（单一来源纪律，AGENTS §8）。冲突时以三份权威文件为准。

## 环境要求

- Node.js **24+**、pnpm 9（`package.json` `packageManager` 为唯一版本来源，corepack 可自动对齐）。
- 首次构建：`pnpm install`。
- 本地起服务：`pnpm --filter server dev`（后端）+ `pnpm --filter web dev`（前端）；CLI：`pnpm --filter cli dev`。
- 全量命令清单见 AGENTS.md §4。

## 工单与分支

1. **认领工单**：全部开发工作以 [doc/02-development-plan.md](./doc/02-development-plan.md) §8 的阶段任务表为准——每张工单的"产出/验收标准/依赖"三列即完整规格，逐项执行、逐条验收；v2 工单库（阶段十一起）见 [doc/08-v2-roadmap.md](./doc/08-v2-roadmap.md)，开工时 lift 进 doc/02。
2. **分支**：功能开发开 `feat/<stage>-<topic>` 或 `fix/<stage>-<ticket>` 分支，PR 合入 main；文档小改动可直接 main（仓库现行惯例，见 AGENTS §2.2）。
3. **提交信息**：Conventional Commits + 中文描述（参考 `git log` 既有格式），一个任务单元一个提交。

## 提交前自查（PR 清单）

- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿（TypeScript strict 禁 `any`）。
- [ ] `python scripts/check_doc_links.py` 通过——改过任何文档时必跑。
- [ ] 新增/修改事件类型走 [new-event-type](./.agents/skills/new-event-type/SKILL.md) 全流程（21 种逐一单测）；新工具走 [new-tool](./.agents/skills/new-tool/SKILL.md)。
- [ ] 前端改动对照 DESIGN.md §10 组件 DoD 九项 + §12 反 AI 味黑名单；后端对照 ARCHITECTURE.md §9（boring code）。
- [ ] 涉及文档变更已追加各文档版本记录表（docs-update 技能流程）。
- [ ] 未删除任何文件——文件删除须走 AGENTS §2.10 五层级确认（AI 与贡献者同样受限）。

## 安全红线（摘要）

- `models.json` 的 apiKey 只从环境变量读，日志固定脱敏，`.env` 不入库。
- 引擎铁律（durable/live 二分、surface 纪律、失败闭合、审批 fail-closed、单写者 JSONL）见 AGENTS.md §2.7——违反即返工。
- 参考项目**禁止克隆到本地**，一律在线访问（AGENTS §2.12）；Claude Code 泄露源码只读不抄。

## 发版

见本文件「[发版](#发版)」节以下内容（工单 11.7 落地后补全）：三包版本策略、CHANGELOG 维护纪律、tag 触发的 release workflow。
