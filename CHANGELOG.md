# 更新日志（Changelog）

本文件记录所有**用户可见**变更，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [SemVer 2.0](https://semver.org/lang/zh-CN/)。发版纪律见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

> 维护纪律（工单 11.7）：每张工单完成时，把**用户可见**的变更写入 `[Unreleased]` 段——
> 内部重构/纯文档/测试基建不入表（编年史职责由 doc/02 版本记录表承担，此处只面向使用者）。

## [Unreleased]

### Added — 阶段十一~十八（2026-09-02 ~ 2026-09-13）

- **可发布**（阶段十一）：MIT 与社区文件、PR CI 接 Playwright E2E、nightly 性能基线、`spark up` 一键启动、npm 分发准备、README 手册化（中英双版）。
- **Agent 能力补全**（阶段十二）：结构化检索 grep 工具、图片附件与 @file 上下文、`spark -p` 一次性模式、会话归档/两段式删除、文件树浮层、MCP 管理页、桌面通知、首启引导、LLM 出网代理。
- **可证明与上下文工程**（阶段十三）：任务级 eval 场景集、提示词模板层、压缩双层化（文件挑选 + 工具输出蒸馏）、子代理预设档、成本看板、trace 视图。
- **SDK 化**（阶段十四）：`@spark/sdk` 客户端包（HTTP + 进程内双子入口）、契约测试生成器、开发者文档站、示例画廊。
- **生态面**（阶段十五）：`spark mcp`（把引擎暴露给其他 agent）、OpenAPI 导出、skill-kit 创作套件、skills 边界拍板（维持纯声明）。
- **命令面新机制**（阶段十六）：`/init` `/agents` `/plan` `/trust` `/extensions` `/voice` `/goal` `/arena` `/lsp` 九条命令全量落地——子代理两层管理、计划模式、文件夹信任收紧、声明式扩展包、语音听写、持续目标循环、多模型竞答、LSP 诊断。
- **观感对齐**（阶段十八）：胶囊控件 + 分层大圆角卡（§13.B 封闭集）全量归档，设置族卡片化。

### Changed

- 事件词表 21 → 27 种（io.warning / memory.injected / session.mode.changed / goal.* 四枚 / lsp.diagnostics）。
- 内置命令 14 → 23 条；权限四档 + 计划模式收紧语义；未信任目录下 bash/外部 MCP 自动放行收紧为逐次询问。

### 计划中

- （后置池全部带触发条件，见 doc/08 §6）

## [1.0.0] - 2026-09-02

v1 完整形态首次版本化（代码已完成合入 main，npm 发布随 11.6/11.7 落地）。

### Added — v1 五阶段（2026-08-22 ~ 2026-08-25）

- **协议先行**：`@spark/protocol` 事件词表（21 种，durable/live/surface 三属性编译期强制）+ 四端共享 applyEvent reducer + HTTP/SSE 契约。
- **前端全量**：React Web 会话工作台（虚拟化会话流、审批卡、差分预览、设置中心骨架），对 Mock 可独立开发。
- **引擎跑通**：headless Node/TS 引擎——run loop、工具管线（bash/read/write/grep/search）、审批规则引擎（fail-closed）、JSONL 会话存储（单写者）、SSE 网关。
- **深度体验**：steer/queue 投递语义、手动 /compact 上下文压缩、checkpoint 多域快照与回滚、会话分叉树、自动标题。
- **产品化**：Electron 桌面壳（sidecar 复用同一协议）、bash 沙箱、MCP client、子代理、skills 插件（ADR D14–D18）。

### Added — 阶段六~十（2026-08-26 ~ 2026-09-01）

- **UI 重构 ZCode 化**（阶段六）：亮色默认、设置中心 16 页、黑白中性 token 体系、反 AI 味黑名单（DESIGN §12/§13）。
- **Harness 补全**（阶段七，十二项）：用户 hooks 四挂点、io.warning 护栏、长期记忆（memory.injected 注入）、审计流、成本熔断、FTS5 全文检索、eval 回归框架。
- **CLI TUI**（阶段八）：Ink 6 终端形态，transport/applyEvent/上下文水位/键位表下沉 `@spark/protocol` 四端共享（ADR D19）。
- **移动端三端**（阶段九）：apps/mobile（Expo+RN）与 apps/miniapp（Taro 4 微信小程序）；非环回强制配对鉴权（6 位码换长效 token，ADR D24），缺省 127.0.0.1 行为不变。
- **UI 对齐与 CLI 重构**（阶段十）：web 对照审计逐条落地、命令面描述符架构（`BUILTIN_COMMANDS` 单一来源）、设置项全量（`GET|PUT /api/settings`）、transport 空 body 修复、CLI 纯单栏重构（对齐 Qwen Code 形态）；收尾批次 3 质量收账（hooks 关闭时序、clientAction 覆盖不变量网、LICENSE/MIT、消息气泡布局）。

### 安全模型（自始不变）

- 默认只监听 `127.0.0.1`，无多用户/登录——本地优先是刻意设计。
- 审批 fail-closed：超时/异常/中断一律拒绝而非放行；bash 工具默认全审批，路径硬边界优先于审批兜底。
- 密钥只从环境变量或本机密钥仓读取，日志与审计流统一脱敏。

[Unreleased]: https://github.com/Wanfeng1028/Spark/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Wanfeng1028/Spark/releases/tag/v1.0.0
