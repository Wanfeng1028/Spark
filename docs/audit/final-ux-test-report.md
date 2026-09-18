# Spark Web 端 & 官网 全功能深度点击测试报告

- 测试时间：2026-09-18
- 测试环境：Web `http://localhost:5173`（Mock 模式 `VITE_SPARK_MOCK=1`）；官网 `http://localhost:3000`（Next.js 15.5.25 Turbopack）
- 浏览器视口：1000×1000（CDP 固定）
- 截图根目录：`Spark/_audit/screenshots/{web,official}/`

---

## 一、测试覆盖清单

### Web 端

| # | 功能点 | 操作 | 结果 | 截图 |
|---|---|---|---|---|
| 1 | 欢迎页全貌 | 打开 `/welcome` | ✅ 通过 | `web/welcome-01-full.png` |
| 2 | 建议卡片×4 | 逐一点击，验证填入输入框 | ✅ 通过（均正确填入并启用发送） | `web/welcome-03..06-suggestion-card*-filled.png` |
| 3 | 新建会话按钮 | 点击后跳转 `/session/ses_...` | ✅ 通过 | `web/welcome-07-new-session-clicked.png` |
| 4 | 运行三步引导链接 | 跳转 `/onboarding`，3 步引导 | ✅ 通过 | `web/welcome-08-onboarding-jump.png` |
| 5 | 左侧边栏全貌 | 截图 | ✅ 通过 | `web/welcome-02-sidebar.png` |
| 6 | 发送消息/流式输出 | 输入并发送，逐 token 渲染 | ✅ 通过 | `web/session-04-streaming-approval-card.png` |
| 7 | 审批卡-允许一次 | 点击后流程继续、工具完成 | ✅ 通过 | `web/session-05-allow-once-continued.png` |
| 8 | 审批卡-拒绝 | 弹出二次确认+拒绝原因输入 | ✅ 通过 | `web/session-09-deny-confirm-dialog.png` |
| 9 | 审批后模型自适应 | 拒绝后改为先展示 diff | ✅ 通过 | `web/session-10-denied-adapted.png` |
| 10 | 发送/停止按钮切换 | 发送中按钮变为"停止当前轮" | ✅ 通过 | `web/session-04..05` |
| 11 | @ 文件补全 | 输入 `@` 弹出面板 | ✅ 通过（显示"无匹配文件"提示） | `web/session-01-at-autocomplete.png` |
| 12 | / Slash 命令 | 输入 `/` 列出 8 命令 | ✅ 通过（/init /compact /plan /goal /voice /resume /model /mcp） | `web/session-02-slash-command-list.png` |
| 13 | 附件菜单(+按钮) | 点击弹出 4 选项 | ✅ 通过（图片附件/@上下文//命令/$技能） | `web/session-03-plus-attachment-menu.png` |
| 14 | 插话/排队切换 | 点击单选切换 | ✅ 通过（空闲时可用，运行中置灰） | `web/session-11..13-*-radio.png` |
| 15 | 消息 hover 操作 | hover 显示复制/点赞/点踩/更多 | ✅ 通过 | `web/session-07-message-hover-actions.png` |
| 16 | 搜索-空状态 | 打开 `/search` | ✅ 通过 | `web/search-01-empty.png` |
| 17 | 搜索-关键词结果 | 输入"改"返回 3 条 | ✅ 通过 | `web/search-02-results.png` |
| 18 | 搜索-点击跳转 | 带 `?event=` 锚点跳会话 | ✅ 通过 | `web/search-03-result-jump.png` |
| 19 | 搜索-清除按钮 | 输入后找清除按钮 | ❌ **失败（P2）** | `web/search-04-no-clear-button.png` |
| 20 | 自动化-任务列表 | 打开 `/automation` | ✅ 通过 | `web/automation-01-task-list.png` |
| 21 | 自动化-模板详情 | 点模板弹创建对话框 | ✅ 通过 | `web/automation-02-template-detail-dialog.png` |
| 22 | 自动化-任务开关 | 切换启停开关 | ✅ 通过 | `web/automation-03..04-switch-on-off.png` |
| 23 | 设置-常规 | 开关/输入/下拉 | ✅ 通过 | `web/settings-01..02-general*.png` |
| 24 | 设置-外观 | 主题/字号/行号/换行 | ✅ 通过 | `web/settings-03..04-appearance*.png` |
| 25 | 设置-模型设置 | 测试连接→"连通正常 86ms" | ✅ 通过 | `web/settings-05..06-models*.png` |
| 26 | 设置-权限规则 | 填表→添加规则成功 | ✅ 通过 | `web/settings-07..09-permission*.png` |
| 27 | 设置-记忆 | 删除一条记忆生效 | ✅ 通过 | `web/settings-10..11-memory*.png` |
| 28 | 设置-MCP 服务器 | filesystem 已连接/github 失败 | ✅ 通过 | `web/settings-12-mcp-servers.png` |
| 29 | 设置-技能 | 只读清单 demo-ping | ⚠️ 只读无开关 | `web/settings-13-skills.png` |
| 30 | 设置-使用统计 | 点击清零 | ✅ 通过 | `web/settings-14..15-usage*.png` |
| 31 | 设置-审计日志 | 展开筛选下拉 | ✅ 通过 | `web/settings-16..17-audit*.png` |
| 32 | 侧边栏-进入会话 | 点击会话项 | ✅ 通过 | `web/sidebar-03-enter-session.png` |
| 33 | 侧边栏-会话项右键/hover | 找重命名/删除/归档 | ❌ **失败（P2）** | `web/sidebar-02-no-hover-actions.png` |
| 34 | 侧边栏-搜索框 | 输入实时筛选会话 | ✅ 通过 | `web/sidebar-04-search-filter.png` |
| 35 | 侧边栏-设置齿轮 | 弹"快速设置"→打开设置中心 | ✅ 通过 | `web/sidebar-05..06-*.png` |

### 官网

| # | 功能点 | 结果 | 截图 |
|---|---|---|---|
| 36 | 首页首屏/Hero | ✅ 通过 | `official/home-01-hero.png` |
| 37 | 首页滚动各 section（统计/核心能力/架构/安全/三步启动） | ✅ 通过 | `official/home-02..05-*.png` |
| 38 | 首页 CTA（浏览源码/阅读文档） | ✅ 指向 GitHub | `official/home-05-bottom-cta.png` |
| 39 | 深色模式切换 | ✅ 图标切换（monitor↔sun） | `official/home-06-theme-toggle.png` |
| 40 | Features 页全部内容 | ✅ 通过 | `official/features-01-overview.png` |
| 41 | Features 代码块复制按钮 | ❌ **未找到（P2）** | `official/features-02-codeblocks.png` |
| 42 | Architecture 页全部内容 | ✅ 通过 | `official/architecture-01-full.png` |
| 43 | Quickstart 页安装/启动/配置 | ✅ 通过 | `official/quickstart-01-install.png` |
| 44 | Quickstart 代码块复制按钮 | ❌ **未找到（P2）** | `official/quickstart-01-install.png` |

---

## 二、发现的问题列表

### P0（阻断/严重）
| ID | 问题 | 证据 |
|---|---|---|
| P0-1 | Web 端无移动端响应式断点，窄屏下布局不可用（历史已知） | 视口/窄屏未做适配 |

### P1（重要，影响主流程或一致性）
| ID | 问题 | 证据 |
|---|---|---|
| P1-1 | 直接访问 `/settings`（不带子路径）右侧内容区空白 | 历史已知；本次带 `/settings/general` 等子路径均正常 |
| P1-2 | 官网 `<title>` 重复，出现"核心能力 — Spark — Spark" | 历史已知 |
| P1-3 | 官网无语言切换入口（中/英） | 导航栏无切换 |
| P1-4 | 长时间连续操作后 Web dev server（Vite）出现 `ERR_CONNECTION_REFUSED` 崩溃，需手动重启 | 测试中途 `/tmp` 截图丢失、浏览器报 no active page；重启后恢复 |

### P2（体验/易用性缺陷）
| ID | 问题 | 证据 |
|---|---|---|
| P2-1 | 搜索页（`/search`）输入框有文字后**无清除(X)按钮**，只能手动全选删除 | `web/search-04-no-clear-button.png` |
| P2-2 | 侧边栏会话项 **hover/右键均不出现重命名/删除/归档** 操作菜单，长列表无法管理 | `web/sidebar-02-no-hover-actions.png` |
| P2-3 | 官网 Features/Quickstart 的代码块**无复制按钮**，与"点击复制按钮"预期不符 | `official/features-02-codeblocks.png`、`official/quickstart-01-install.png` |
| P2-4 | 设置→技能页为只读清单，无启用/禁用开关（文案注明"管理归 v2"），与测试清单预期不符 | `web/settings-13-skills.png` |
| P2-5 | MCP 服务器 `github` 节点显示"连接失败，工具未注册"（橙点），仅 filesystem 正常 | `web/settings-12-mcp-servers.png` |
| P2-6 | 审批卡"拒绝"需二次确认弹窗 + 拒绝原因输入，交互较重（设计如此但可反馈） | `web/session-09-deny-confirm-dialog.png` |
| P2-7 | 审批卡三个按钮中"总是允许"未单独验证（随流程点了允许一次/拒绝），功能存在 | `web/session-04-streaming-approval-card.png` |

---

## 三、亮点（正面确认）

- 审批流闭环完整：审批卡 → 允许一次/总是允许/拒绝 → 拒绝二次确认 → 模型自适应改方案，交互语义清晰。
- 流式输出 + 工具状态机（started→progress→completed）+ 思考过程折叠展示一致。
- Mock 场景切换（normal/long-output/reject/error-finish）便于测试异常路径。
- 设置页信息架构完整（20 个子页），权限规则增删、记忆删除、使用统计清零、审计日志筛选均可用。
- 官网文档结构清晰，代码块与文字说明对应源码路径。

---

## 四、截图索引

### Web 端（`screenshots/web/`）
- 欢迎页：`welcome-01-full` ~ `welcome-08-onboarding-jump`
- 会话页：`session-01-at-autocomplete` ~ `session-13-queue-radio-clean`
- 搜索页：`search-01-empty` ~ `search-04-no-clear-button`
- 自动化：`automation-01-task-list` ~ `automation-04-task-switch-on`
- 设置：`settings-01-general` ~ `settings-17-audit-filter-expanded`
- 侧边栏：`sidebar-01-welcome-full` ~ `sidebar-06-open-settings-center`

### 官网（`screenshots/official/`）
- 首页：`home-01-hero` ~ `home-06-theme-toggle`
- Features：`features-01-overview`、`features-02-codeblocks`
- Architecture：`architecture-01-full`
- Quickstart：`quickstart-01-install`

> 注：目录中另含上一轮审计的 `web-*.png`、`official-*.png` 前缀截图，可作为历史对照。
