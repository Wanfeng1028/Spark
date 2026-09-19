# Spark 第二轮全功能深度测试报告（AUD-01~14 修复后回归）

- 测试时间：2026-09-19
- 基线：`main` @ `6aa2941`（AUD-01~14 全量实施 + DSH 对话框改造 + WO 批收口后）
- 测试环境：Web `http://localhost:5173`（`VITE_SPARK_MOCK=1`）；官网 `http://localhost:3000`（Next.js 15 Turbopack）；CLI（Ink TUI，Node v24.21.0）
- 浏览器视口：1000×1000（CDP 固定）
- 截图根目录：`Spark/_audit/screenshots/round2/`（42 张）
- 对照基线：`_audit/final-ux-test-report.md`（第一轮全功能）、`_audit/overlap-ui-test-report.md`（第一轮重叠遮挡）

---

## 一、构建 / 测试结果

### 构建
- `pnpm install`：Lockfile up to date，8s 完成。
- `pnpm build`：`apps/web build: ✓ built in 17.61s`，无报错（仅 chunk >500kB 提示，非错误）。

### 单测（`pnpm -r test`，全绿）

| 包 | 测试文件 | 用例 |
|---|---|---|
| packages/protocol | 18 passed | 1244 passed |
| packages/engine | 49 passed \| 1 skipped | 713 passed \| 2 skipped |
| packages/sdk | 2 passed | 14 passed |
| apps/server | 15 passed \| 1 skipped | 134 passed \| 1 skipped |
| apps/web | 25 passed | 236 passed |
| **合计** | **109 passed \| 2 skipped** | **2341 passed \| 3 skipped \| 0 failed** |

- 结论：**构建通过、全量单测 0 失败**。AUD-01~14 修复未引入回归。

---

## 二、测试覆盖清单

### Web 端（Mock 模式）

| # | 功能点 | 操作 | 结果 | 截图 |
|---|---|---|---|---|
| 1 | 欢迎页全貌 | 打开 `/welcome` | ✅ | `01-welcome-full.png` |
| 2 | 建议卡片×4 | 逐一点击，验证填入输入框 | ✅ 4 张均正确填入并启用发送 | `02-welcome-suggestion-card-filled.png` |
| 3 | 新建会话按钮 | 点击跳转 `/session/ses_...` | ✅ | `03-new-session-page.png` |
| 4 | @ 文件补全 | 输入 `@` 弹出面板 | ✅ 显示"无匹配文件——输入以筛选" | `04-session-at-autocomplete.png` |
| 5 | / Slash 命令 | 输入 `/` 列命令 | ✅ 列出 /init /compact /plan /goal /voice /resume /model /mcp | `05-session-slash-command.png` |
| 6 | + 附件菜单 | 点击"添加内容" | ✅ 4 选项（图片/@///$技能） | `06-plus-attachment-menu.png` |
| 7 | + 菜单按 Escape | 菜单打开后按 Esc | ❌ **不关闭（仍 P1，见 WO-080）** | `07-plus-menu-after-escape.png` |
| 8 | Ctrl+K 与 + 菜单叠加 | +菜单打开时按 Ctrl+K | ❌ **底层 + 菜单未关闭（仍 P2，见 WO-081）** | `08-ctrlk-palette-plus-menu-residual.png` |
| 9 | 流式对话/审批卡 | 发送消息逐 token 渲染 | ✅ 思考过程+工具状态机+审批三按钮 | `09-streaming-approval-card.png` |
| 10 | 停止按钮 | 发送中变"停止当前轮" | ✅ | `09-streaming-approval-card.png` |
| 11 | 审批-总是允许 | 点击"总是允许" | ✅ **本轮新单独验证**：流程继续走完（编辑完成→测试通过→总结） | `10-always-allow-flow-completed.png` |
| 12 | 审批-拒绝+二次确认 | 点"拒绝" | ✅ 弹拒绝原因输入+确认拒绝/取消 | `11-reject-confirm-dialog.png` |
| 13 | 拒绝后模型自适应 | 确认拒绝 | ✅ 改为"先看 diff，展示计划改动" | `12-rejected-adapted-diff.png` |
| 14 | 语音按钮 | 点击麦克风 | ✅ 优雅降级"未检测到麦克风设备" | `13-voice-no-mic-graceful.png` |
| 15 | 选项卡（立即/插话/排队） | 空闲态查看 | ✅ 空闲置灰，语义同第一轮 | `09/13` 输入框区 |
| 16 | 搜索-空状态 | 打开 `/search` | ✅ | `14-search-empty.png` |
| 17 | 搜索-关键词结果 | 输入"改"回车 | ✅ 返回 3 条 | `15-search-results.png` |
| 18 | 搜索-点击跳转 | 点结果 | ✅ 带 `?event=` 锚点跳会话 | （跳转会话页） |
| 19 | 搜索-清除按钮 | 输入后找清除(X) | ❌ **仍无清除按钮（仍 P2）** | `15-search-results.png` |
| 20 | 自动化-任务列表 | 打开 `/automation` | ✅ 任务+模板卡片+新建按钮 | `16-automation-task-list.png` |
| 21 | 自动化-模板创建 | 点模板卡片 | ✅ 弹创建对话框（名称/目录/cron/提示词） | `17-automation-template-dialog.png` |
| 22 | 设置-裸路径 `/settings` | 直接访问 | ❌ **右侧内容区仍空白（仍 P1）** | `18-settings-bare-path.png` |
| 23 | 设置-常规 | 开关/输入/下拉/保存 | ✅ | `19-settings-general.png` |
| 24 | 设置-bash 沙箱下拉 | 查看下拉文字 | ❌ **仍截断"开启（平台 wrapper 隔…"（仍 P2，WO-082）** | `20-settings-general-switch-dropdown.png` |
| 25 | 设置-外观 | 主题/字号/行号/换行开关 | ✅ 开关可切换 | `21-22-settings-appearance*.png` |
| 26 | 设置-模型 | 测试连接 | ✅ "连通正常（86ms）" | `23-settings-models-test-connection.png` |
| 27 | 设置-权限规则 | 填表添加规则 | ✅ 出现删除按钮 | `24-settings-permission-rule-added.png` |
| 28 | 设置-记忆 | 删除记忆 | ✅ 删除生效 | `25-26-settings-memory*.png` |
| 29 | 设置-MCP 服务器 | 连接状态 | ✅ filesystem 绿点；github 橙点（无凭证，预期） | `27-settings-mcp-servers.png` |
| 30 | 设置-技能 | 只读清单 | ✅ demo-ping（管理归 v2，同第一轮） | `28-settings-skills.png` |
| 31 | 设置-使用统计 | 清零按钮 | ✅ 按钮存在可点 | `29-settings-usage-reset.png` |
| 32 | 设置-审计日志 | 筛选下拉+过滤 | ✅ 3 下拉+工具名过滤（新会话无记录） | `30-31-settings-audit*.png` |
| 33 | 侧边栏-会话项 hover | hover 会话项 | ❌ **无重命名/删除/归档（仍 P2）** | `32-sidebar-hover-session-item.png` |
| 34 | 侧边栏-会话项右键 | 右键会话项 | ❌ **无上下文菜单（仍 P2）** | `33-sidebar-rightclick-session-item.png` |
| 35 | 侧边栏-搜索筛选 | 输入实时筛选 | ✅ 输入"重构"仅显示匹配项 | `34-sidebar-search-filter.png` |

### 官网（localhost:3000）

| # | 功能点 | 结果 | 截图 |
|---|---|---|---|
| 36 | 首页 Hero/导航 | ✅ | `35-official-home-hero.png` |
| 37 | 深色/浅色主题切换 | ✅ 图标切换 | `36-official-dark-mode.png` |
| 38 | Features 页 | ✅ 标题"核心能力 — Spark" | `37-features-codeblock-copy-button.png` |
| 39 | Features 代码块复制按钮 | ✅ **已修复**（4 个 `Copy code` 按钮） | `37-features-codeblock-copy-button.png` |
| 40 | Architecture 页 | ✅ 标题"架构 — Spark" | `38-official-architecture.png` |
| 41 | Quickstart 页 | ✅ 5 个复制按钮 | `39-40-official-quickstart*.png` |

### CLI

| # | 功能点 | 结果 | 截图 |
|---|---|---|---|
| 42 | `spark --help` 启动+键位/用法 | ✅ 退出码 0，用法与键位完整 | `42-cli-help.png` |
| 43 | 无头一轮 `spark -p` | ✅ 退出码 0（mock 无文本输出，无报错） | （终端日志） |

### 重叠 / 响应式专项

| # | 场景 | 结果 | 截图 |
|---|---|---|---|
| 44 | 375px 窄屏输入工具栏 | ❌ **严重溢出/按钮重叠/文字堆叠（仍 P0/P1）** | `41-narrow-375px-overflow.png` |
| 45 | + 菜单 Escape 不关闭 | ❌ 仍复现（WO-080） | `07-plus-menu-after-escape.png` |
| 46 | Ctrl+K 打开时 + 菜单未关 | ❌ 仍复现（WO-081） | `08-ctrlk-palette-plus-menu-residual.png` |
| 47 | bash 沙箱下拉文字截断 | ❌ 仍复现（WO-082） | `20-settings-general-switch-dropdown.png` |

---

## 三、发现的问题列表

### P0（阻断/严重）

| ID | 问题 | 证据 |
|---|---|---|
| P0-1 | Web 端无移动端响应式断点；375px 窄屏下主内容区被挤压、输入工具栏按钮重叠/截断、建议卡片文字竖向堆叠 | `41-narrow-375px-overflow.png` |

### P1（重要）

| ID | 问题 | 证据 |
|---|---|---|
| P1-1 | 直接访问裸路径 `/settings` 右侧内容区仍空白（左侧导航渲染但无内容，未重定向到 appearance） | `18-settings-bare-path.png` |
| P1-2 | + 附件菜单按 Escape 不关闭（WO-080 未修复） | `07-plus-menu-after-escape.png` |

### P2（体验/易用性）

| ID | 问题 | 证据 |
|---|---|---|
| P2-1 | 搜索页输入后仍无清除(X)按钮 | `15-search-results.png` |
| P2-2 | 侧边栏会话项 hover/右键均无重命名/删除/归档菜单 | `32/33-sidebar-*.png` |
| P2-3 | 设置→bash 沙箱下拉文字仍截断"开启（平台 wrapper 隔…"（WO-082） | `20-settings-general-switch-dropdown.png` |
| P2-4 | Ctrl+K 命令面板打开时底层 + 附件菜单仍残留（WO-081） | `08-ctrlk-palette-plus-menu-residual.png` |
| P2-5 | MCP `github` 节点"连接失败，工具未注册"（无凭证环境，预期内，登记备查） | `27-settings-mcp-servers.png` |
| P2-6 | 设置→技能页为只读清单，无启用/禁用开关（文案注明"管理归 v2"） | `28-settings-skills.png` |

---

## 四、与第一轮测试对比表

| 第一轮问题（ID/出处） | 第一轮状态 | 第二轮复测 | 结论 |
|---|---|---|---|
| P0-1 无移动端响应式断点 | 已知 P0 | 375px 实测严重溢出 | **未修复（仍 P0）** |
| P1-1 裸 `/settings` 右侧空白 | P1 | 仍空白，未重定向 | **未修复（仍 P1）** |
| P1-2 官网 `<title>` 重复"核心能力 — Spark — Spark" | P1 | 现为"核心能力 — Spark"，单标题 | **✅ 已修复** |
| P2-1 搜索页无清除(X)按钮 | P2 | 仍无清除按钮 | **未修复（仍 P2）** |
| P2-2 侧边栏会话项无重命名/删除/归档 | P2 | hover/右键均无菜单 | **未修复（仍 P2）** |
| P2-3 官网代码块无复制按钮 | P2 | Features 4 个、Quickstart 5 个 `Copy code` 按钮 | **✅ 已修复** |
| P2-4 技能页只读无开关 | P2 | 仍只读（文案注明 v2） | **维持设计（未变）** |
| P2-5 MCP github 连接失败 | P2 | 仍橙点（无凭证预期） | **维持（环境预期）** |
| WO-079 窄屏输入框按钮溢出 | P1（overlap 报告） | 375px 实测仍溢出/重叠 | **未修复（仍 P1）** |
| WO-080 + 菜单 Escape 不关闭 | P1（overlap 报告） | 按 Esc 后 4 菜单项仍在 | **未修复（仍 P1）** |
| WO-081 Ctrl+K 打开时 + 菜单未关 | P2（overlap 报告） | 面板打开底部 + 菜单残留可见 | **未修复（仍 P2）** |
| WO-082 bash 沙箱下拉文字截断 | P2（overlap 报告） | 仍显示"开启（平台 wrapper 隔…" | **未修复（仍 P2）** |
| P2-7 审批"总是允许"未单独验证 | 第一轮遗留 | 本轮点击后流程正常走完 | **✅ 已验证通过** |

### 本轮新确认/新发现

- **无新增 P0/P1 回归**。AUD-01~14 修复后，核心链路（流式、审批三态、拒绝二次确认、模型自适应、停止/语音降级、设置各子页、自动化、搜索、CLI 启停）全部正常，2341 单测全绿。
- 官网标题重复与代码块复制按钮两项已闭环；其余第一轮 UI 体验类工单（搜索清除、侧边栏会话管理、+菜单 Esc/多浮层、bash 下拉截断、窄屏溢出、裸 /settings 空白）**本轮复测均未变化**，建议排期。

---

## 五、截图索引（`_audit/screenshots/round2/`，共 42 张）

- 欢迎页：`01-welcome-full`、`02-welcome-suggestion-card-filled`、`03-new-session-page`
- 会话页：`04-session-at-autocomplete`、`05-session-slash-command`、`06-plus-attachment-menu`、`07-plus-menu-after-escape`、`08-ctrlk-palette-plus-menu-residual`、`09-streaming-approval-card`、`10-always-allow-flow-completed`、`11-reject-confirm-dialog`、`12-rejected-adapted-diff`、`13-voice-no-mic-graceful`
- 搜索页：`14-search-empty`、`15-search-results`
- 自动化：`16-automation-task-list`、`17-automation-template-dialog`
- 设置：`18-settings-bare-path`、`19-settings-general`、`20-settings-general-switch-dropdown`、`21-22-settings-appearance*`、`23-settings-models-test-connection`、`24-settings-permission-rule-added`、`25-26-settings-memory*`、`27-settings-mcp-servers`、`28-settings-skills`、`29-settings-usage-reset`、`30-31-settings-audit*`
- 侧边栏：`32-sidebar-hover-session-item`、`33-sidebar-rightclick-session-item`、`34-sidebar-search-filter`
- 官网：`35-official-home-hero`、`36-official-dark-mode`、`37-features-codeblock-copy-button`、`38-official-architecture`、`39-40-official-quickstart*`
- 响应式：`41-narrow-375px-overflow`
- CLI：`42-cli-help`

---

## 六、结论

AUD-01~14 引擎/前端竞态与韧性修复在本轮**全部通过构建与 2341 项单测**，真机点击复走核心主流程无回归。官网两项 P1/P2（标题重复、代码块复制按钮）已闭环，"总是允许"审批按钮补验通过。遗留 6 项第一轮 UI 体验问题（裸 /settings 空白、+菜单 Esc、多浮层叠加、bash 下拉截断、搜索清除按钮、侧边栏会话管理）与窄屏 P0 均**复测未变化**，建议进入下一批修复排期。
