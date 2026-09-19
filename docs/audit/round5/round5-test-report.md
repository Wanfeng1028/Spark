# 第五轮全功能深度测试报告（round5）

**日期**: 2026-09-19
**环境**: Cloud VM (Linux headless, Node v24.21.0, pnpm 9.15.9)
**被测提交**: `50baf0d fix(engine): 修 CI 红——UnsupportedComputerExecutor 转 internal`（含 round4 后 13 个提交，主为阶段十九 computer-use 执行体落地）
**走查人**: AI Agent
**Web dev server**: `VITE_SPARK_MOCK=1 pnpm --filter @spark/web dev`（端口 5173）
**官网 dev server**: `official && pnpm dev`（端口 3000）
**真实模型**: Step Plan provider（step-3.7-flash，OpenAI 兼容，baseUrl https://api.stepfun.com/step_plan/v1）

> 本轮新增代码面：阶段十九 19.1/19.2 computer-use 执行体（Windows 先行 + mac/Linux 路由）+ 八工具 computer.* + `apps/web` 电脑控制设置页 `ComputerSettingsPage.tsx` + `packages/engine` computer 三平台执行体与单测。

---

## 一、构建 / 测试结果

| 项 | 结果 |
|----|------|
| `pnpm install` | ✅ Done in 7.5s（lockfile 一致） |
| `pnpm build` | ✅ 全 workspace 构建成功（apps/web ✓ built in 17.09s，BUILD_EXIT=0） |
| `pnpm -r test` | ⚠️ **2497 passed / 1 failed / 4 skipped**（见新发现 P1-1） |

分包单测明细：

| 包 | Test Files | Tests | 对比 round4 |
|----|-----------|-------|------|
| packages/protocol | 18 passed | 1246 passed | 1244 → 1246（+2） |
| packages/engine | 50 passed \| 1 skipped | 725 passed \| 2 skipped | 715→725（+10，含 tools-computer 7） |
| apps/web | 25 passed \| **1 failed** | 237 passed \| **1 failed** | 236→237（ComputerSettingsPage 新增） |
| apps/server | 15 passed \| 1 skipped | 137 passed \| 1 skipped | 134→137（+3） |
| apps/cli | 6 passed | 77 passed \| 1 skipped | 持平 |
| apps/miniapp | 7 passed | 41 passed | 持平 |
| apps/desktop | 2 passed | 11 passed | 持平 |
| packages/sdk | 2 passed | 14 passed | 持平 |
| packages/skill-kit | 1 passed | 7 passed | 持平 |
| examples/sdk-bot | 1 passed | 2 passed | 持平 |
| apps/mobile | Done（无测试） | — | — |

> 证据：`_audit/round5-test-output.log`、`round5-test-rest.log`。
> 说明：① engine 全量并行套件有 1 条 `Unhandled Rejection: write EPIPE`（vscode-jsonrpc LSP 子进程 teardown），但 engine **725 断言全过**；单独重跑 `tests/lsp.test.ts`（9 passed/1 skipped，exit 0，无 EPIPE）确认是并行调度下的抖动噪声，非断言失败。② 因 pnpm -r 遇错即停，web 失败后用 `--filter` 补跑了 web/server/cli/sdk/sdk-bot，以上为权威汇总。

---

## 二、逐项验证表

### Web 欢迎页

| # | 项 | 结果 | 截图 |
|---|----|------|------|
| W1 | 建议卡片点击填入输入框（发送钮随之启用） | ✅ | `01-welcome.png`、`02-welcome-suggestion-filled.png` |
| W2 | 新建会话按钮 | ✅ 跳到新 session | （会话页流） |
| W3 | 设置/搜索/自动化入口 | ✅ 三处均可达 | 各页截图 |

### Web 会话页

| # | 项 | 结果 | 截图 |
|---|----|------|------|
| S1 | 流式对话（mock normal 全链路：读文件→改写→终端→总结） | ✅ | `03-chat-approval-card.png`、`05-chat-completed.png` |
| S2 | 审批三按钮（允许一次/总是允许/拒绝） | ✅ 三钮齐，输入框进「等待审批中」禁用态 | `03-chat-approval-card.png` |
| S3 | 拒绝二次确认（理由输入 + 确认/取消） | ✅ 「确认拒绝？」展开，取消可回退 | `04-reject-two-step.png` |
| S4 | 停止按钮（停止当前轮） | ✅ 在途轮可见 | `03-chat-approval-card.png` |
| S5 | @文件补全 | ✅ 面板弹出「无匹配文件——输入以筛选」 | `06-at-autocomplete.png` |
| S6 | /Slash 命令 | ✅ /init /compact /plan /goal /voice /resume /model /mcp | `07-slash-menu.png` |
| S7 | 附件 + 菜单（4 menuitem） | ✅ 图片/@/命令/$技能 | `08-plus-menu.png` |
| S8 | 语音按钮（无麦降级） | ✅ 「未检测到麦克风设备」 | `09-voice-degrade.png` |
| S9 | 选项卡（立即/插话/排队） | ✅ 立即选中，插话/排队运行中才启用 | 会话页截图 |
| S10 | 消息 hover 操作（复制正文/fork 分支） | ✅ 每条带复制/fork 钮 | `05-chat-completed.png` |

### Web 搜索页

| # | 项 | 结果 | 截图 |
|---|----|------|------|
| X1 | 搜索框输入 | ✅ | `10-search-with-text.png` |
| X2 | 清除按钮（清除后输入框复位） | ✅ | `10b-search-cleared.png` |

### Web 自动化页

| # | 项 | 结果 | 截图 |
|---|----|------|------|
| A1 | 任务列表（夜间巡检/合并后复查/晨间准备等 mock） | ✅ | `11-automation.png` |
| A2 | 新建任务模板（新建定时/新建闲时） | ✅ 按钮在位 | `11-automation.png` |
| A3 | 运行历史（刷新运行历史） | ✅ | `11-automation.png` |

### Web 设置页（裸 /settings 重定向 + 子页）

| # | 项 | 结果 | 截图 |
|---|----|------|------|
| G0 | 裸 /settings 重定向 | ✅ → /settings/appearance | （进设置即见） |
| G1 | 常规：开关/下拉/bash 沙箱「开启（隔离）」不截断 | ✅ 完整无省略号 | `13-settings-general.png` |
| G2 | 外观：主题/字号/换行 | ✅ | `12-settings-appearance.png` |
| G3 | 模型：测试连接 | ✅ 「连通正常（86ms）」绿点 | `14-settings-model.png` |
| G4 | 权限规则：添加规则 | ✅ allow shell.exec cmd:git status 入列 | `16-settings-permission.png`、`16b-permission-added.png` |
| G5 | 记忆：列表/删除钮 | ✅ 两条 mock 记忆带删除（新增走 memory.save） | `17-settings-memory.png` |
| G6 | MCP 服务器：连接状态 | ✅ filesystem 绿点/github 橙点（已知不修） | `18-settings-mcp.png` |
| G7 | 技能：查看详情（只读） | ✅ demo-ping | `21-settings-skills.png` |
| G8 | 使用统计：清零按钮 | ✅ 「清零累计」可点 | `19-settings-stats.png`、`19b-stats-cleared.png` |
| G9 | 审计日志：展开/筛选 | ⚠️ 见新发现 P2-2（大小写敏感） | `20-settings-audit.png`、`20d-audit-filter-bash-case.png` |
| G10 | 电脑控制（阶段十九新页）：主开关 + 八操作 + 平台执行体 | ✅ 全渲染 | `15-settings-computer.png` |

### Web 侧边栏

| # | 项 | 结果 | 截图 |
|---|----|------|------|
| SB1 | 会话列表/新建/搜索筛选 | ✅ | 各页 |
| SB2 | 右键菜单（归档/删除） | ✅ | `23-sidebar-rightclick.png` |
| SB3 | 删除两段式（确认删除？） | ✅ | `23b-delete-two-step.png` |
| SB4 | 已归档抽屉 + 恢复会话 | ✅ 归档进抽屉、恢复回主列表 | `23c-archived.png`、`23d-archived-drawer.png`、`23e-restored.png` |

### 移动端视口

| # | 项 | 结果 | 截图 |
|---|----|------|------|
| M1 | 375×667 欢迎页：建议 chips 不竖排、侧栏折叠 | ✅ 48px 图标栏，chips 居中胶囊换行 | `24-narrow-375-welcome.png` |
| M2 | 375 会话页：输入工具栏不重叠不溢出 | ✅ | `25b-narrow-375-session.png` |
| M3 | 375 设置页 | ⚠️ 见新发现 P2-3（双栏挤压） | `26-narrow-375-settings.png`、`26c-narrow-375-settings-closed.png` |
| M4 | 768×1024 iPad：各页布局正常无横向溢出 | ✅ | `27-ipad-welcome.png`、`28-ipad-settings.png`、`29-ipad-search.png`、`30-ipad-automation.png` |

### 组件重叠/遮挡专项

| # | 项 | 结果 | 截图 |
|---|----|------|------|
| O1 | +菜单 Escape 关闭（menuitem→0） | ✅ | `08-plus-menu.png` |
| O2 | +菜单开 → Ctrl+K 无残留（底层 menuitem=0） | ✅ 命令面板居中、背景压暗 | `31-plus-then-ctrlk.png` |
| O3 | @/命令/审批卡位置关系 | ✅ 审批卡在输入框上方，输入禁用 | `06`、`07`、`03` |

### CLI

| # | 项 | 结果 | 证据 |
|---|----|------|------|
| C1 | `spark --version` / `-v` | ✅ 均打印 `1.0.0` 并 exit 0 | 终端输出 |
| C2 | `spark --help` | ✅ 完整用法/键位/一次性模式 | 终端输出 |
| C3 | 一次性 `spark -p` | ✅ 「1+1等于2。」exit 0（需 STEP_PLAN_API_KEY） | 终端输出 |
| C4 | TUI 基本交互 | ✅ 横幅/输入框/状态栏/发消息触发一轮 | `tui/tui-01-connected.png`、`tui/tui-02-send.png` |

### 官网（official / Next.js）

| # | 项 | 结果 | 截图 |
|---|----|------|------|
| OF1 | 首页各 section（Hero/安装/终端 demo/统计） | ✅ | `32-official-home.png` |
| OF2 | Features / Architecture / Quickstart 路由 | ✅ | `35-official-features.png`、`36-official-architecture.png`、`34-official-quickstart.png` |
| OF3 | 深色/浅色主题切换 | ✅ 切换钮响应（图标 monitor↔sun） | `32`、`33-official-light.png` |
| OF4 | 标题无重复 | ✅ 每页唯一 `<title>`（核心能力/架构/快速上手 — Spark） | 浏览器 page_info |
| OF5 | 代码块复制按钮在位 | ✅ 代码块语言头渲染（hover 出现 Copy code） | `34-official-quickstart.png` |

---

## 三、与前几轮对比

| 项 | round2 | round3 | round4 | round5 |
|----|--------|--------|--------|--------|
| 单测 | 绿 | 绿 | 2481 passed / 0 failed | **2497 passed / 1 failed** |
| 阶段十九 computer-use | — | — | — | 新落地；**单测 1 红（P1-1）** |
| WO-079~082 UI 修复回归 | — | 7/7 | 保持 | 保持通过 |
| 裸 /settings、搜索清除、侧栏右键菜单 | — | 7/7 | 保持 | 保持通过 |
| RT3-01~06 闭环项 | 红/黄 | 多为 P1/P2 | 全闭环 | 保持通过 |
| 375px 窄屏（WO-087 折叠） | P2 | P2 占宽 | ✅ 折叠 48px | ✅ 保持（但设置页双栏挤压为新 P2-3） |
| 审计日志工具过滤 | — | — | 未专项 | **新发现大小写敏感 P2-2** |

---

## 四、新发现问题

### P1-1 ｜ ComputerSettingsPage 单测确定性失败（main 红）
- **现象**：`apps/web` 新增 `ComputerSettingsPage.test.tsx` 第 1 个用例「八操作清单 + 缺省档位摘要 + 平台说明如实呈现」每次必挂。
- **错误**：`TestingLibraryElementError: Unable to find an element with the text: 缺省逐次询问.`（期望 `getAllByText('缺省逐次询问').length === 8`）。
- **复现步骤**：
  ```bash
  cd apps/web && npx vitest run tests/components/ComputerSettingsPage.test.tsx
  # Test Files 1 failed (1) · Tests 1 failed | 1 passed (2)
  ```
- **根因**：组件 `ComputerSettingsPage.tsx:77` 把 effect 内联进了 description 整串 `description={`${a.desc} · ${effect}`}`，而测试用 `getByText('缺省逐次询问')` 按**独立文本节点精确匹配**，自然失配。**页面本身在浏览器里渲染完全正常**（截图 `15-settings-computer.png`，8 操作各带「· 缺省逐次询问」），属测试-实现契约漂移。
- **建议**：二选一——(a) 组件把 effect 拆成独立 `<span>` 渲染；(b) 测试改用正则/函数 matcher（如 `/缺省逐次询问/`）。当前 main 是红的，建议合入前修掉。

### P2-2 ｜ 审计日志工具过滤大小写敏感，但占位符示例用小写
- **现象**：`/settings/audit` 的「按工具名过滤」输入小写 `bash` → 显示「暂无审计记录」；改大写 `Bash` → 精确命中那一条 `Bash · bash · rm -rf node_modules`。
- **复现步骤**：`/settings/audit` → 工具名过滤框输入 `bash`（占位符示例即写的 `如 bash`）→ 空结果；输入 `Bash` → 1 条命中。
- **证据**：`20b-audit-filtered-bash.png`（空）vs `20d-audit-filter-bash-case.png`（命中 1 条）。
- **建议**：过滤改大小写不敏感（`toLowerCase()` 两边归一），否则按占位符提示操作的用户必落空。

### P2-3 ｜ 375px 窄屏设置页双栏挤压，描述折成单字列
- **现象**：375×667 下 `/settings/general` 仍保留「左侧导航 + 右侧内容」并排双栏，内容列被挤到 ~175px，所有描述文字逐字竖排（如「交互行为新输入的默认提交档」一字一行）。
- **复现步骤**：CDP 375×667 → 访问 `/settings/general`。
- **证据**：`26-narrow-375-settings.png`、`26c-narrow-375-settings-closed.png`。
- **建议**：窄屏把设置导航收成顶部选择器/抽屉，内容列独占全宽（与侧栏会话列表 WO-087 的折叠策略对齐）。注：768×1024 iPad 与桌面无此问题。

### 观察项（非阻断，记录备查）
- **OBS-1（环境噪声）**：engine 并行套件偶发 1 条 `write EPIPE`（vscode-jsonrpc LSP 子进程 teardown），单独重跑干净，725 断言全过，不记为缺陷。
- **OBS-2（环境前置）**：`spark -p` 在未导出 `STEP_PLAN_API_KEY` 的全新 shell 返回「(无文本输出)」exit 1；带 key 后正常。属密钥注入前置，非产品缺陷。
- **OBS-3（TUI harness）**：`spark up` 起 TUI 发消息偶现「目标不存在（会话/请求/快照可能已被清理）」，与本次临时 root + 会话引用同步有关；TUI 横幅/输入/状态栏/发消息触发一轮均正常。

---

## 五、已知不修项（按要求未重复上报）

- MCP github「连接失败」——无凭证环境预期（`18-settings-mcp.png` 橙点）
- 技能页只读——管理归 v2（`21-settings-skills.png`）
- 会话重命名缺失——已登记为后端缺口
- MCP filesystem 连接超时——npx 冷启动 30s 超时（本轮 filesystem 绿点已连，未复现超时）
- 审批拒绝的二次确认交互——设计如此（`04-reject-two-step.png`）

---

## 六、结论

第五轮全功能深度测试**基本通过，但有 1 个 P1 阻断**：

- 构建 ✅、全量单测 **2497 passed / 1 failed**——失败即新阶段十九 `ComputerSettingsPage` 的测试-实现契约漂移（P1-1），页面本身正常，建议合入前修测试或组件。
- Web 全功能（欢迎/会话/审批/搜索/自动化/设置全子页/侧边栏）、移动端视口、组件重叠专项、CLI、官网均逐项点验通过，round3/4 闭环项无回退。
- 新增 2 个 P2（审计过滤大小写敏感、375px 设置双栏挤压）。

**建议**：先修 P1-1 让 main 转绿，再排 P2-2/P2-3，即可进入 release 前最终走查。
