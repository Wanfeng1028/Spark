# Spark CLI TUI 深度交互测试报告

**测试时间**: 2026-09-18
**测试环境**: Linux Cloud VM, Node v24.21.0, tmux 140x42, Ink 7 + React TUI
**连接方式**: TUI → `http://127.0.0.1:4318` (server, tsx dev mode) → mock OpenAI-compatible LLM on `127.0.0.1:4399`
**模型**: mock/mock-model (自建 mock server 返回文本+bash 工具调用)
**截图目录**: `_audit/screenshots/cli/`

---

## 测试环境搭建说明

- server 以 `tsx src/index.ts` 启动（`dist/index.js` 构建产物缺 `@earendil-works/pi-ai` 外部依赖，无法直接运行）
- `~/.spark/models.json` 配置自定义 provider `mock`，指向本地 mock LLM server，`apiKeyEnv=MOCK_API_KEY`
- mock LLM server 模拟 OpenAI SSE 流：首轮返回文本+`bash` 工具调用，工具结果后返回最终文本
- **注意**: server 进程必须清除 `http_proxy/https_proxy` 环境变量启动，否则 undici fetch 走代理导致 `E_LLM_NETWORK` 连接本地失败

---

## 测试项结果总览

| # | 测试项 | 结果 | 关键截图 |
|---|--------|------|----------|
| 1 | TUI 发送消息 | ✅ 通过 | tui-01-message-typed, tui-02-message-sent, tui-02c-streaming |
| 2 | 工具调用与审批 | ✅ 通过 | tui-03-approval, tui-04-after-approve, tui-13-after-reject, tui-14-reject-reason, tui-15-rejected |
| 3 | SlashMenu 命令执行 | ✅ 通过 | tui-20-slashmenu, tui-24-slashmenu-fresh, tui-25-slashmenu-nav, tui-26-after-new, tui-44-stats-menu, tui-45-stats-panel |
| 4 | 会话切换/新建 | ✅ 通过 | tui-26-after-new (/new), tui-30-ctrl-n (Ctrl+N), tui-32-resume-list, tui-34-resumed |
| 5 | 帮助面板与键位 | ✅ 通过 | tui-40-help-overview, tui-41-help-commands, tui-42-help-keys, tui-43-help-closed |

---

## 1. TUI 中实际发送一条消息 — ✅ 通过

**操作**:
1. 启动 TUI，看到 Spark ASCII logo + 输入框 `[now] > 输入您的消息或 @ 文件路径`（tui-00-initial.png）
2. 输入 `hello spark, this is a deep test message`（tui-01-message-typed.png）
3. 按 Enter 发送（tui-02-message-sent.png）

**验证结果**:
- ✅ 用户消息 `> hello spark, this is a deep test message` 出现在会话流中
- ✅ 工作状态显示 `已工作 0 秒`
- ✅ 错误提示完整：`E_LLM_PROVIDER: 未知 provider mock...` + `Ctrl+R 重试` 提示（首次因 mock 未配置 baseUrl 报错）
- ✅ 配置正确 provider 后，第二轮消息触发了流式思考文本 `让我先看看当前目录有什么文件。`
- ✅ 状态栏实时更新：`128.0k 上下文 · 0% 已用`

**事件流验证**: server 日志确认 `POST /api/sessions/:id/messages` 收到请求，SSE 事件推送到 TUI。

---

## 2. TUI 中触发工具调用和审批 — ✅ 通过

**操作**:
1. 发送消息触发 mock 模型返回 `bash` 工具调用（`ls -la /home/user`）
2. 截图审批卡（tui-03-approval.png）
3. 按 `1`（允许一次），截图结果（tui-04-after-approve.png）
4. 再次发送消息触发审批，按 `3`（拒绝），填写拒绝理由，截图（tui-13-after-reject, tui-14-reject-reason, tui-15-rejected）

**审批卡验证**:
- ✅ 显示操作类型：`[审批] shell.exec cmd: ls -la /home/user`
- ✅ 显示理由：`理由: 工具 bash 请求`
- ✅ 显示快捷键选项：`1 是，允许一次 (y) · 2 总是允许 (a) · 3 否，建议更改 (n, esc 取消)`
- ✅ 状态栏显示 `step 1 bash · 请求授权`

**审批操作验证**:
- ✅ 按 `1` 后：工具执行，终端输出显示 `> □ 终端 ls -la /home/user first 33 lines hidden [密钥过滤]`（自动密钥过滤）
- ✅ 审批记录留在会话流中：`[审批] shell.exec cmd:ls -la /home/user - 允许一次`
- ✅ 按 `3` 后：弹出"拒绝理由：填写后 Enter 确认拒绝，Esc 取消"输入框
- ✅ 填写理由 `用户拒绝：测试拒绝路径` 后 Enter：模型收到拒绝信号继续生成，会话流显示 `> 用户拒绝：测试拒绝路径` 和 `[审批] ... - 已拒绝`
- ⚠️ 按 `2`（总是允许）未单独测试（已通过 UI 确认该选项存在）

---

## 3. TUI 中 SlashMenu 选择命令执行 — ✅ 通过

**操作**:
1. 在空闲输入状态按 `/`，SlashMenu 弹出（tui-20-slashmenu.png）
2. ↑↓ 导航到 `/new 新建会话`（tui-25-slashmenu-nav.png）
3. Enter 执行（tui-26-after-new.png）
4. 再次按 `/`，输入 `stats` 过滤，Enter 执行 /stats（tui-44-stats-menu, tui-45-stats-panel）

**SlashMenu 验证**:
- ✅ 菜单按分组显示：`会话` 组下列出 /init, /compact, /plan, /goal, /voice, /new, /resume, /fork
- ✅ 分页指示：`(1/3) · 续页 · ↑↓ 选择 Enter 确认 Esc 关闭`
- ✅ 输入过滤：输入 `resume` 后只剩 `/resume`（1/1），输入 `stats` 只剩 `/stats`
- ✅ /new 执行后：输入框清空，会话区切换到新会话（状态栏 `[now]`）
- ✅ /stats 执行后：显示统计面板 `seq 水位: 1 · token 累计: 10 10 (思考 0) · 模型: mock/mock-model · 分支: main`，Esc 关闭

**注意**: 当模型仍在流式输出时按 `/`，SlashMenu 不会弹出（输入被占用），输入的 `/stats` 会被当作普通文本发送给模型。这是预期行为但可能让用户困惑。

---

## 4. TUI 会话切换/新建 — ✅ 通过

**操作与验证**:
- ✅ `/new`（SlashMenu 选择）：新建空会话，输入框 ready，状态栏 `[now]`（tui-26-after-new.png）
- ✅ `Ctrl+N`：新建会话（tui-30-ctrl-n.png），空状态与 /new 一致
- ✅ `/resume`：弹出历史会话列表（tui-32-resume-list.png），显示：
  - 当前会话（标注"(当前)"）
  - 历史会话按时间倒序：`刚刚 · 1 条事件`, `1 分钟前 · 1 条事件`, `2 分钟前 · 37 条事件`, `8 小时前 · 1 条事件` × 4
  - 每个会话显示标题（首条用户消息或模型回复摘要）
  - 底部提示：`过滤：输入关键词过滤会话，↑↓ 选择，Space 预览，Enter 恢复`
- ✅ 选择 37 条事件的会话后 Enter：成功恢复，完整对话历史回显（tui-34-resumed.png）

---

## 5. TUI 帮助面板和键位 — ✅ 通过

**操作**:
1. 按 `?` 打开帮助面板（tui-40-help-overview.png）
2. Tab 切换到"命令"tab（tui-41-help-commands.png）
3. Tab 切换到"键位"tab（tui-42-help-keys.png）
4. Esc 关闭（tui-43-help-closed.png）

**帮助面板验证**:
- ✅ 三个 tab：`概览  命令  键位   Tab/Shift+Tab 切换 · Esc 关闭`
- ✅ **概览 tab**: 显示产品定位 `Spark CLI — Agent 工作台终端形态（单栏会话优先，ADR D19 修订）`，会话管理命令，输入规则
- ✅ **命令 tab**: 完整列出 23 条命令（/init, /compact, /plan, /goal, /voice, /new, /resume, /stats, /help, /model, /mcp, /skills, /usage, /fork, /checkpoint, /rollback, /effort, /tree, /lsp, /agents, /trust, /extensions, /arena），每条带中文描述，底部 `共 23 条（引擎注册表：内置 + ~/.spark/commands）`
- ✅ **键位 tab**: 完整快捷键表：
  - Enter 发送消息, / 命令前缀, Tab 循环提交模式, Esc 中断 turn
  - 1/2/3 审批快捷键, Ctrl+O 展开/折叠, Ctrl+N 新建会话
  - PageUp/PageDown 切换会话, ? 帮助, Ctrl+U 清空输入, Ctrl+C×2 退出, Ctrl+R 重试
- ✅ Esc 关闭后回到正常会话界面

---

## 发现的问题

### P0（阻断级）
无。所有核心交互流程均可正常操作。

### P1（重要，影响用户体验）

**P1-1: server 崩溃后 git index.lock 残留导致会话恢复失败**
- 现象: server 异常退出后，checkpoint git 仓库留下 `index.lock`，TUI 启动自动恢复旧会话时报 `E_CHECKPOINT_SNAPSHOT: ... fatal: Unable to create .../index.lock: File exists.`，整个会话流被错误刷屏，用户必须手动 `find ~/.spark -name index.lock -delete` 才能继续。
- 复现: kill server → 重启 server → TUI 自动 resume 旧会话
- 建议: server 启动时自动清理过期 lock 文件，或 checkpoint 模块捕获 lock 错误后自动重试一次（删除 lock 再 add）。

**P1-2: 流式输出期间输入 / 不弹出 SlashMenu，命令文本被当消息发送**
- 现象: 模型正在流式响应时，用户按 `/` 想打开命令菜单，菜单不弹出；继续输入 `/stats` 后按 Enter，整个 `/stats` 被当作用户消息发给模型，而非执行本地命令。
- 截图: tui-21-slashmenu-stats.png（无菜单）→ tui-22-stats-panel.png（/stats 被当消息发送，模型返回"这是界面命令，由界面执行—不经引擎"）
- 建议: 流式期间应仍允许 `/` 弹出命令菜单（覆盖在输入区上方），或至少在输入框显示"运行中，命令将作为消息发送"提示。

### P2（次要，体验优化）

**P2-1: 版本号显示"v未知版本"**
- 现象: 启动画面和状态栏显示 `Spark (v未知版本)`，版本未注入。
- 建议: build 时从 package.json 注入 version，或 TUI 启动时请求 `/api/version`。

**P2-2: TUI 重连后审批卡焦点状态不直观**
- 现象: TUI 重连到有待审批 turn 的会话时，审批卡自动恢复，但输入框显示"等待审批—1 允许一次 / 2 总是允许 / 3 拒绝"。此时用户若直接打字（如想输入 /new），字符会进入审批输入而非命令输入，且无明显焦点切换提示。
- 建议: 在审批输入状态下，输入非 1/2/3 字符时给一个短暂的提示气泡"按 1/2/3 审批，或 Esc 取消"。

**P2-3: mock provider 配置错误时的错误信息可更精准**
- 现象: models.json 中自定义 provider 未配 baseUrl 时，错误为 `E_LLM_PROVIDER: 未知 provider mock（v1 支持见 PROVIDERS 表...）`，但实际 provider 已在 models.json 中"configured"（/api/models 显示 configured:true），矛盾。
- 建议: 区分"provider 未在目录且无 baseUrl"与"provider 目录内但无 API key"两种情况，错误信息指引用户补 baseUrl。

**P2-4: 终端输出行数截断提示可更友好**
- 现象: bash 工具输出显示 `first 33 lines hidden [密钥过滤]`，但未告知如何查看完整输出（如 PageDown 或展开快捷键）。
- 建议: 提示中附加展开方式（如"按 Ctrl+O 展开"）。

---

## 测试覆盖度评估

| 维度 | 覆盖情况 |
|------|----------|
| 消息发送/接收 | ✅ 文本输入、Enter 发送、用户消息渲染、错误提示 |
| 流式输出 | ✅ 思考文本流式显示、计时器（已工作 X 秒）、上游响应中状态 |
| 工具调用审批 | ✅ 审批卡渲染、允许一次(1)、拒绝(3)+理由、审批记录回显、终端输出+密钥过滤 |
| SlashMenu | ✅ 弹出、分组、分页、过滤、键盘导航、Enter 执行、Esc 关闭 |
| 会话管理 | ✅ /new 新建、Ctrl+N 新建、/resume 列表+过滤+恢复 |
| 面板 | ✅ /stats 统计面板、? 帮助面板（3 tab 切换） |
| 状态栏 | ✅ 模型名、cwd、git 分支、上下文水位、请求授权状态 |
| 未覆盖 | 总是允许(2)快捷键实际效果、Shift+Enter 多行、Tab 循环提交模式、@文件路径、Ctrl+O 展开折叠、/model 切换、语音输入 |

---

## 结论

Spark CLI TUI 的核心交互链路**完整可用**：消息收发、工具审批、SlashMenu、会话管理、帮助面板五大模块均通过实际操作验证。主要问题集中在**异常恢复**（git lock 残留）和**运行中输入交互**（流式期间命令不可达），建议优先修复 P1-1（启动清 lock）和 P1-2（流式期间允许命令菜单）。
