# 编辑器生态接入方式调研：ACP 与各家做法（工单 CK-16 前置汇报）

> 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| ---- | ---- | ---- | ---- |
| v1.0 | 2026-10-05 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，CK-16 拍板"接入编辑器生态，看看别家怎么做的，先向我汇报"——本报告即汇报，**实施待拍板**） | 初稿：ACP 协议本体（zed-industries/agent-client-protocol，Apache-2.0，4.4k★）+ 接入方式三家形态归纳（stdio 子进程 / HTTP 常驻 / 插件内嵌）+ 客户端/agent 生态清单（在线取证）+ Spark 落点三方案与裁决建议。全程 `gh api` raw 直读 + npm registry 元数据，未克隆未下载（§2.12/§2.3a） |

## 0. 取证口径

**对象**：`zed-industries/agent-client-protocol`（协议本体 + schema 仓，2026-10-05 查询）；`agentclientprotocol/agent-client-protocol`（官网文档仓 docs/）；`@agentclientprotocol/sdk`（官方 TS SDK，npm registry 元数据）。**方式**：`gh api` raw 直读 + `npm view`（元数据，未安装包）。网络 EOF 多次，退避重试解决。

**可信度分级**：A = 协议仓/文档仓原文直读；B = SDK readme 与 registry 元数据；C = 由生态列表页名推定（标"待核"）。

## 1. ACP 本体（A 级）

**一句话**：ACP（Agent Client Protocol）是 Zed 发起的开放标准——"把任何编辑器接到任何 agent"。**JSON-RPC over stdio**（编辑器按需拉起 agent 子进程，stdin/stdout 通信），当前稳定协议版本 **v1**（v2 草案进行中，SDK 里走 experimental 入口）。Apache-2.0。

**核心方法面**（schema 源码 + 官方文档取证，A 级）：

| 方向 | 方法 | 作用 |
| --- | --- | --- |
| client → agent | `initialize` | 握手 + `protocolVersion` 协商 + 能力声明 |
| client → agent | `session/new` / `session/load` / `session/list` / `session/delete` / fork | 会话生命周期（cwd 是 new 的参数） |
| client → agent | `session/prompt` | 发一轮对话（ContentBlock 数组：text/image/audio/resource_link） |
| client → agent | `session/cancel`（notification） | 取消当前轮——client 必须把在途 `session/request_permission` 一并回 cancelled |
| client → agent | `authenticate` / `authMethods` | agent 侧鉴权（OAuth 方法协商） |
| agent → client | **`session/request_permission`**（request，双向） | 工具调用前请求许可——**弹窗 UI 归编辑器**，agent 只收 outcome（cancelled / once / always） |
| agent → client | **`fs/read_text_file` / `fs/write_text_file`**（request，双向） | agent 反向请编辑器读/写文件——编辑器管 IO，agent 不直接碰盘 |
| agent → client | `terminal/create` 等族 | 反向请求终端（A 级：文档页 terminals.mdx 在列） |
| agent → client | `session/update`（notification，流式） | 轮内流式更新：`agent_message_chunk` / `tool_call` / `tool_call_update` / `plan` / `available_commands` |

**关键设计事实**：① **编辑器管文件 IO**——agent 默认不直接读写磁盘，要读/写文件就发 `fs/*` 反向请求（除非 agent 自己也有本地访问；这对 Spark 是关键差异点，见 §4）；② **权限弹窗 UI 归编辑器**——`session/request_permission` 的 outcome 三值与 Spark 审批的 once/always 语义天然对齐；③ 一条连接可并发多个会话。

## 2. 生态规模（A 级：官网 clients/agents 清单页 2026-10-05 直读）

- **客户端（编辑器/壳）**：Zed、**VS Code**、**JetBrains**、Visual Studio、Neovim、Emacs、Sublime、Pulsar、Qt Creator、Obsidian、Chrome 扩展两家、Unity 两家、Windows Terminal fork（microsoft/intelligent-terminal）等 17+——**主流编辑器基本到齐**。
- **Agent 侧**：Gemini CLI、**Claude（经 Zed 的适配器 claude-agent-acp）**、**Codex CLI（经官方 codex-acp 适配器）**、Cursor CLI、GitHub Copilot CLI（public preview）、Qwen Code、Goose、OpenCode、OpenClaw、Kimi CLI、Hermes、Pi（经社区 pi-acp 适配器）等 40+。
- **对本仓的意味**：Spark 的参考对象里**大半已支持 ACP**（Gemini/Qwen/OpenCode/OpenClaw/Kimi/Pi/Copilot/Codex）——"编辑器生态"事实上已收敛到这一协议；自研 VS Code 扩展方案对抗的是整个生态。

## 3. 三种接入形态（归纳）

| 形态 | 做法 | 代表 | 利 | 弊 |
| --- | --- | --- | --- | --- |
| **stdio 子进程**（ACP 标准形态） | 编辑器拉起 agent CLI 的 `--acp`/acp 子命令，JSON-RPC over stdin/stdout | Gemini CLI / Qwen / Codex（经适配器）/ 全部 ACP agent | 零端口零网络面（安全上最优）；进程隔离；生态直接兼容 | 一次性会话模型与常驻引擎不同；stdio 帧协议要新写（或用官方 SDK） |
| HTTP 常驻 + 编辑器插件转发 | 引擎常驻（现状 127.0.0.1:4318），编辑器插件经 HTTP/SSE 调 Spark 现有 REST | Claude Code 的 `--ide` 模式近似（编辑器插件 ↔ 本地进程，私有协议） | 复用 Spark 现有 server 全部面；多端（web/CLI/mobile）共享同一会话池 | 要为每个编辑器写插件（生态碎片化）；插件间互不兼容 = 重复劳动；**常驻服务面 = 攻击面**（现靠环回绑定兜住） |
| 插件内嵌 agent | agent 核心作为 npm 包跑在编辑器扩展宿主进程里 | 无大厂采用（工程上属反模式——扩展宿主受限、崩溃连带） | 单进程简单 | 宿主 API 受限、生命周期不可控、崩溃域共享——本仓不做 |

## 4. Spark 落点：三方案（裁决用）

> 前提事实：Spark 引擎 headless + `@spark/sdk` 两入口（HTTP / inprocess）；审批是引擎内挂起卡模型（permission.asked 事件 + REST 回复）；文件工具带 resolveInRoot 硬边界 + 敏感文件防线（#3.6）。

**方案一（推荐）：`spark acp` 适配器——ACP stdio 子进程形态**
新建 `apps/cli` 的 `spark acp` 子命令（或独立薄包 `@spark/acp`）：进程内起引擎（`createInProcessClient`，**零 HTTP 服务面**），把 ACP 的 JSON-RPC 方法面翻译到 SDK 调用。映射表基本一一对应：`session/prompt` → `sessions.send`；`session/update` ← 事件流订阅（assistant.delta→chunk、tool.started→tool_call、plan← slice.mode/goal）；`session/request_permission` ← 审批挂起等待（outcome once/always 直映 PermissionReply）；**`fs/read_text_file`/`fs/write_text_file` ← 走 Spark 自己的文件工具**（带 resolveInRoot + 敏感文件防线——比 ACP 默认"编辑器管 IO"更严，编辑器反向请求会被拒绝/降级，安全第一原则下**不放松**）。用官方 `@agentclientprotocol/sdk`（Apache-2.0，需新依赖授权 §2.3a + 锁文件重算）。成本 **M**。安全注意：stdio 无网络面；项目层 hooks 信任门与审批照常生效（ACP 客户端只是另一个 UI）。

**方案二：VS Code 扩展直连现有 server**
写 VS Code 扩展（HTTP/SSE 到 127.0.0.1:4318）。成本 **M-L**（扩展工程本身不小），但只覆盖 VS Code 一家，且与 ACP 生态方向相悖（各家正在向 ACP 收敛）。**不推荐单独走**；若做也应在方案一之后（扩展可作为 ACP client 的壳）。

**方案三：两者都做**——方案一是生态门票，方案二是自有 UI 增强。成本 L+。

**共同安全前提（AGENTS §2.0）**：① stdio 形态无监听端口（优于现状 HTTP 面）；② ACP 客户端 = 另一个"端"，四端共享核纪律（MockTransport 对等、事件流唯一状态源）原样适用；③ 项目层 hooks 信任门在新 cwd 下照常弹 ask——ACP 不豁免任何审批门；④ `fs/*` 反向请求降级策略要显式（拒绝 + 说明 Spark 文件面自带边界，禁旁路）。

## 5. 裁决建议表（最终由晚风拍板）

| 方案 | 成本 | 安全风险 | 生态收益 | 建议 |
| --- | --- | --- | --- | --- |
| 一：`spark acp` 适配器（stdio） | M | 低（无网络面；审批/信任门全保留） | 直连 Zed/VS Code/JetBrains/Neovim/Emacs 等 17+ 客户端 | **推荐先做** |
| 二：VS Code 扩展直连 | M-L | 中（复用 HTTP 面；环回绑定为前提） | 仅 VS Code，且与生态收敛方向相悖 | 缓；或作方案一的后续 |
| 三：全做 | L+ | 同上叠加 | 最大 | 等方案一落地见效再说 |

**需晚风顺带确认的两点**：① 新依赖 `@agentclientprotocol/sdk`（Apache-2.0）的授权（§2.3a）；② `fs/*` 反向请求"拒绝降级"策略是否接受（Spark 文件面自带边界，不经编辑器手）。

## 附：本报告与 CK-16 工单的关系

CK-16 卡原文是"ACP 服务端：编辑器标准协议接入（MiniMax 协议重写）"。本报告确认：**ACP 已远超 MiniMax 单家实践、成为跨编辑器开放标准**，实施形态应按 §4 方案一（适配器）而非卡面所写的"协议重写"。卡内实施批待拍板后另立。
