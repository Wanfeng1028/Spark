# AGENTS.md — AI 编码代理工作规范

> 本文件面向**任何在本仓库工作的 AI 编码代理**（ZCode / Claude Code / Codex / opencode 等）。
> 进入本仓库后请先完整阅读本文件与 [DESIGN.md](./DESIGN.md)，再做任何修改。

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`；会话内部标识 ox-alpha，model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核） | 初稿：项目上下文/硬性约定/任务指引/红线 |
| v1.1 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）；人作者：晚风（Wanfeng1028，提出与审核） | 硬性约定 §2.6 扩充：禁止一切"AI 生成风"外观（暖棕/米色暖调配色、实线细描边+内部 backdrop-blur 毛玻璃按钮），与 DESIGN.md D2 同步 |
| v1.2 | 2026-08-22 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`） | 必读索引挂接 **doc/04 前端约束规则**（目标"Codex/ZCode 桌面感"：布局/密度/颜色 token/键盘优先/动效/反网站化黑名单/组件 DoD/Electron 预留） |
| v1.3 | 2026-08-22 | 同上（决策：晚风 Wanfeng1028） | 项目上下文移除"本地优先"定位措辞（事实不变，不作明面标签） |
| v1.4 | 2026-08-23 | AI 编写：ZCode CLI · GLM-5.3（`builtin:zai-start-plan/GLM-5.3`） | §5 参考速查更新：参考体系扩至 9 项（+Gemini CLI/OpenClaw/Hermes Agent，速查表 28 条）；新增闭源不可参考清单（Antigravity/ZCode/Qoder/Trae IDE，原因见 01 §7.3） |

## 1. 项目上下文（30 秒版）

Spark 是一个 **Agent 工作台**：Node/TS 引擎（headless）+ React Web 前端，通过 HTTP+SSE 单一事件流协议通信；后期加 Electron 壳。当前处于**阶段零（设计期）**——只有文档，代码未开工。完整规格见 `doc/02-development-plan.md`。

**必读文档索引**：设计总览 → `DESIGN.md`；实现规格 → `doc/02`；前端思路 → `doc/03`；**前端约束规则（桌面应用感/反网站化黑名单/组件 DoD）→ `doc/04`**；调研依据 → `doc/01`。

## 2. 硬性约定（违反即返工）

1. **文档变更必须更新版本记录表**：每份文档（含本文件、README、DESIGN.md、doc/*）开头都有版本记录表；每次修改追加一行，版本号 +0.1。作者栏格式：AI 编写须写明**软件与模型**（如 `ZCode CLI · GLM-5.3（builtin:zai-start-plan/GLM-5.3）`），人类作者写名字。
2. **完成每个任务单元必须 commit + push**（origin main，远程已配置）。提交信息用 conventional commits 风格 + 中文描述（参考 `git log` 既有格式）。
3. **语言**：文档与注释用中文；代码标识符、commit type 用英文。
4. **TypeScript strict**，禁止 `any`（确需时 `unknown` + 收窄）。跨包导入只允许依赖 `@spark/protocol` 的导出，不得深路径引用。
5. **协议改动从 `packages/protocol` 开始**：改事件词表/API 类型 → 两端同步适配 → 跑双侧类型检查。禁止在前端或引擎里私自定义 wire 类型。
6. **前端样式**：Tailwind + shadcn token 体系；视觉基调：黑白中性极简。**禁止一切"AI 生成风"外观**：蓝紫渐变玻璃拟态、暖棕/米色等暖调配色、实线细描边 + 内部 backdrop-blur 毛玻璃的按钮/卡片——均为 AI 生成界面的典型套路，一律不得出现（判例与特征清单见 DESIGN.md D2）；组件改造走 copy-in（源码进 `components/ui/`），不引黑盒运行时依赖。
7. **引擎铁律**（写代码时时刻对照）：durable/live 二分（delta 不落盘）；surface 纪律（模型可见必被记录）；失败闭合（事件流永不悬空）；审批 fail-closed（超时/异常一律拒绝）；单写者 JSONL（会话文件只经 SessionStore 写）。
8. **测试**：`applyEvent` reducer 对全部事件类型逐一单测（21 种）；新增事件类型必须同步新增单测，否则 PR 不完整。
9. **不做的事**：不加多用户/登录/公网暴露（本地 127.0.0.1 是刻意的）；不上 Effect/RxJS 等响应式框架（抄设计不抄框架）；MVP 边界外（MCP/子代理/skills/沙箱）的功能一律排到阶段五之后，即使"顺手"。

## 3. 常见任务指引（改哪里）

| 任务 | 步骤 |
|---|---|
| 新增事件类型 | `protocol/src/events.ts` 词表 + zod schema → 前端 `applyEvent` 表 + 单测 → 引擎 emit 点 → 文档 02 §4.3 表同步 |
| 新增工具 | `engine/src/tools/builtin/` 新文件（ToolDefinition：zod input/permission/resourceOf/execute）→ registry 注册 → 错误码进 02 §5.6.3 表 |
| 新增审批规则语义 | `permission/rules.ts` evaluate → service 挂起/级联逻辑 → 前端 ApprovalCard 适配 |
| 新增/改造前端组件 | AI Elements copy-in 到 `components/ui/` → 删 `"use client"` → 数据源换 `useSessionItems()` selector → 样式走 token |
| 改 SSE/API | `protocol/src/api.ts` DTO → server 路由 + zod → 前端 Transport → 02 §4.5 表同步 |
| 会话持久化变更 | `session/` 对应文件 → 02 §5.8 算法描述同步 → 坏行/迁移策略评估 |

## 4. 开发命令（阶段一搭好后更新本节）

```bash
# 规划中（骨架落地时回填实际命令）：
pnpm install
pnpm dev          # server + web 并行
pnpm --filter web dev        # 仅前端（VITE_SPARK_MOCK=1 可脱离后端）
pnpm test / pnpm typecheck / pnpm lint
```

## 5. 参考项目速查（遇到问题先查这里）

完整 28 条速查表在 `doc/02-development-plan.md` §9（问题 → 项目 → 精确到文件路径）。要点：run loop 抄 pi、事件纪律抄 dsh、协议形状抄 Codex、steer/queue 与权限抄 opencode、**审批策略引擎与调度状态机抄 Gemini CLI（⚠️ pin 版本，Google 有迁闭源 Antigravity 风险）**、**网关线协议与契约分包查 OpenClaw**、checkpoint 抄 Grok、实现疑难查 Claude Code 泄露源码分析（用户仓库 `Wanfeng1028/claude-code-analysis`）。闭源不可参考清单（原因见 01 §7.3）：Antigravity / ZCode / Qoder / Trae IDE——仅 UX 观察。

## 6. 红线（法律与安全）

1. **Claude Code 泄露源码（2026-03-31 sourcemap 事件）只读不抄**：可用于理解实现（"它是怎么做的"），**一行代码不得复制进本仓库**——专有许可。接口规格与设计思想不受版权保护，可用。
2. 许可证纪律：pi/dsh/opencode（MIT）、Codex/Grok（Apache-2.0）代码可复用但**保留版权声明**；Rust 参考是"翻译思路"不是复制。
3. 密钥与隐私：`models.json` 的 apiKey 只从环境变量读；日志固定脱敏；`.env` 不入库（见 .gitignore）。
4. 工具安全：bash 工具默认全审批；路径硬边界（cwd 外拒读）优先于审批兜底。

## 7. 工作节奏

- 接到任务先对照 `doc/02` 的阶段任务清单（checklist），完成一项勾一项（更新文档 checklist 也是任务的一部分）。
- 每完成一个任务单元：代码/文档 → 单测 → typecheck/lint → commit + push → 版本记录表追加。
- 不确定的设计决策：先查 DESIGN.md 的 ADR 表；仍无答案则提出并让人类决策，**不要自行发明与文档冲突的机制**。
