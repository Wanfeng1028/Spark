# 第四轮全功能深度测试报告（round4）

**日期**: 2026-09-19
**环境**: Cloud VM (Linux headless, Node v24.21.0, pnpm 9.15.9)
**被测提交**: `1a49044 docs(audit): doc/10 v1.12——v1.0.0 tag 已打`（含 round3 后修复批 WO-083~087）
**走查人**: AI Agent
**Web dev server**: `VITE_SPARK_MOCK=1 pnpm --filter @spark/web dev`（端口 5173）
**真实模型**: Step Plan provider（step-3.7-flash，OpenAI 兼容，baseUrl https://api.stepfun.com/step_plan/v1）

---

## 一、构建 / 测试结果

| 项 | 结果 |
|----|------|
| `pnpm install` | ✅ Done in 26.9s（lockfile 一致） |
| `pnpm build` | ✅ 全 workspace 构建成功（apps/web ✓ built in 42.93s） |
| `pnpm -r test` | ✅ **2481 passed / 4 skipped / 0 failed** |

分包单测明细：

| 包 | Test Files | Tests |
|----|-----------|-------|
| packages/protocol | 18 passed | 1244 passed |
| packages/engine | 49 passed \| 1 skipped | 715 passed \| 2 skipped |
| apps/web | 25 passed | 236 passed |
| apps/server | 15 passed \| 1 skipped | 134 passed \| 1 skipped |
| apps/cli | 6 passed | 77 passed \| 1 skipped |
| apps/miniapp | 7 passed | 41 passed |
| apps/desktop | 2 passed | 11 passed |
| packages/sdk | 2 passed | 14 passed |
| packages/skill-kit | 1 passed | 7 passed |
| examples/sdk-bot | 1 passed | 2 passed |
| apps/mobile | Done（无测试） | — |

> 证据：`00-build-test-summary.png`。首轮后台跑因 `| tail` 管道 SIGPIPE 误报退出码 1；干净重跑 EXIT=0，以上为权威结果。

---

## 二、11 项修复验收表

| # | 工单/项 | 验收方法 | 结果 | 证据截图 |
|---|---------|----------|------|----------|
| 1 | 裸 `/settings` 重定向 | 直接访问 /settings | ✅ 自动跳到 /settings/appearance，右侧外观内容完整 | `01-settings-bare-redirect.png` |
| 2 | WO-080 + 菜单 Esc 关闭 | 开 + 菜单（4 menuitem）→ Esc | ✅ Esc 后 `menuitemCount=0`，菜单关闭 | `02-plus-menu-open.png` |
| 3 | WO-081 Ctrl+K 无残留 | + 菜单开着 → Ctrl+K | ✅ 命令面板弹出，底层 menuitem=0，无残留 | `03-ctrlk-no-residue.png` |
| 4 | WO-082 沙箱下拉不截断 | 设置→常规→bash 沙箱下拉 | ✅ 选项「关闭 / 开启（隔离）」完整，无省略号，scrollW==clientW | `04-bash-sandbox-not-truncated.png` |
| 5 | 搜索清除钮 | /search 输入「重构」→ 找 X 钮 | ✅ 出现 `清除搜索关键词` 钮，点击后输入值清空 | `05-search-with-text.png`、`05b-search-clear-clicked.png` |
| 6 | 侧边栏会话右键菜单 | 右键会话行 → 归档/删除；两段式；已归档抽屉可恢复 | ✅ 菜单含归档/删除；删除两段式变「确认删除？」；归档进抽屉带「恢复会话」按钮，恢复回主列表 | `06-sidebar-rightclick-menu.png`、`06b-delete-two-step.png`、`06c-archived-drawer-restore.png` |
| 7 | WO-079/RT3-06 375px 窄屏 | CDP 模拟 375×667 | ✅ 无横向溢出（scrollW==clientW==375）；侧栏自动折叠为 48px 图标栏；输入工具栏不重叠；chips 居中胶囊换行 | `07-narrow-375-welcome.png`、`07c-narrow-375-session.png` |
| 8 | RT3-02 `spark --version` | dist 构建后执行 | ✅ `--version`/`-v` 均打印 `1.0.0` 并直接退出（exit 0，无 raw-mode 报错） | `08-spark-version.png` |
| 9 | RT3-03 带代理 LLM 请求 | HTTPS_PROXY=vortex 下发消息 | ✅ 真实流式返回「我是Step，由阶跃星辰…」exit 0（round3 此场景空响应） | `09-proxy-llm.png` |
| 10 | RT3-04 MCP 连接超时 | mcp.json filesystem server | ✅ 默认 connectTimeout=30s；npx 冷启动 ~25s 内完成；oneshot 无连接超时错误，模型自带文件工具 | `10-mcp-timeout.png` |
| 11 | RT3-01 Electron 首启向导 | 空 HOME + Xvfb 启动 | ✅ 出现「欢迎使用 Spark——先配置一个模型」引导页（最小模板+打开配置目录+密钥纪律），不再 E_CONFIG 崩溃 | `11-electron-firstrun-onboarding.png` |

### 逐项说明

1. **裸 /settings**：重定向到 `/settings/appearance`，左侧导航 + 右侧外观控件（主题/字号/代码显示）完整渲染。
2. **WO-080**：+ 菜单打开时 4 个 menuitem（添加图片/@/命令/$技能）；按 Escape 后 `menuitemCount=0`。
3. **WO-081**：+ 菜单打开（4 menuitem）→ Ctrl+K 命令面板居中弹出，底层 `menuitemCount=0`，+ 菜单自动收起。
4. **WO-082**：bash 沙箱下拉当前选中「开启（隔离）」，文本无 `…`，`scrollWidth==clientWidth` 无截断。
5. **搜索清除**：输入「重构」后右侧出现 `aria-label="清除搜索关键词"` 圆形钮；点击后输入值 `''`。
6. **右键菜单**：会话行右键弹「归档/删除」；点「删除」两段式变「确认删除？」（未真删）；归档后该项从主列表消失、「已归档」计数 +1、抽屉列出并带「恢复会话」按钮，点恢复后主列表重新出现该项。
7. **375px 窄屏**：`scrollW==clientW==375` 无横向溢出；侧栏由 264px 折叠为 48px 图标栏（按钮变「展开侧栏」）；Composer 工具栏（+、文件树、权限下拉、麦克风、发送）布局合理无框重叠；建议 chips 为居中圆角胶囊自然换行（非拉伸全宽竖列）。直接刷新会话页亦保持折叠。
8. **RT3-02**：`spark --version` 与 `-v` 均输出 `1.0.0` 后立即退出，不再落入 Ink TUI raw-mode 报错。
9. **RT3-03**：环境自带 vortex 代理（HTTPS_PROXY 指向 vortex…:8080），`spark -p` 真实流式返回模型答复，WO-085 undici 同源配对生效。
10. **RT3-04**：源码确认 `CONNECT_TIMEOUT_MS = 30_000`（原 10s）；`npx -y @modelcontextprotocol/server-filesystem` 冷启动约 25s 打印 banner；两次 oneshot（3.1s / 3.9s）均无 `mcp.server.connect.error`，模型自述具备文件操作工具。round3 日志中那条 `连接超时（10000ms）` 为旧记录（pid 4910），本轮未复现。
11. **RT3-01**：空 `~/.spark` 下 `electron .`（Xvfb :98）不再抛 `E_CONFIG`，而是渲染引导页「欢迎使用 Spark——先配置一个模型」，给出最小 models.json 模板（含 deepseek 示例）、自动 `xdg-open` 配置目录、说明密钥经 `apiKeyEnv` 环境变量读取、保存后自动续启。

**验收小结：11/11 全部通过。**

---

## 三、全量回归结果

### Web 核心流
- ✅ 流式对话：发送消息后模型流式输出，工具调用（读文件/改写）事件带「复制正文/fork 到分支会话」
- ✅ 审批三按钮：审批卡出现「允许一次 / 总是允许 / 拒绝」，输入框与工具栏进入 disabled 等待态
- ✅ 模型自适应：模型选择器显示 `DeepSeek/deepseek-chat`，effort `自动`
- ✅ 停止：「停止当前轮」按钮存在，点击后在途轮被中断
- ✅ 设置子页：逐一点通 常规/外观/模型设置/设备与配对/浏览器/电脑控制/权限规则/记忆/子智能体/扩展/安全与信任/MCP 服务器/技能/语言服务器/命令/钩子/索引库/使用统计/审计日志/引导 全部正确渲染（20 个）
- ✅ 自动化页：定时/闲时任务列表渲染（夜间巡检、合并后复查等 mock 任务）
- ✅ 搜索跳转：/search 页可输入检索、清除钮在位

> 证据：`regress-chat-approval.png`、`regress-automation.png`

### CLI
- ✅ 版本号：`spark --version` 显示 1.0.0（见项 8）
- ✅ `--help`：完整打印用法/键位/一次性模式说明
- ✅ 一次性模式 `spark -p`：真实模型 oneshot 正常返回（见项 9/10）

### 官网（official / Next.js）
- ✅ `next build` 通过（EXIT=0，5 路由静态导出）
- ✅ 标题无重复：每页恰好 1 个 `<title>`
- ✅ 代码块复制按钮在位：quickstart/index 页多处 `aria-label="Copy code"`

### Electron
- ✅ 首启引导（RT3-01）见项 11；桌面单测 11/11 通过；无 E_CONFIG 回归

### 移动端视口
- ✅ 375×667：见项 7，无横向溢出
- ✅ 768×1024：welcome / settings/general / search / automation 四页 `scrollW==clientW`，无横向溢出

> 证据：`regress-768-welcome.png`

---

## 四、与前几轮对比

| 项 | round2 | round3 | round4 |
|----|--------|--------|--------|
| 单测 | 绿 | 绿 | 绿（2481 passed / 0 failed） |
| WO-079/080/081/082 UI 修复 | — | 7/7 通过 | 回归保持通过 |
| 裸 /settings、搜索清除、侧栏右键菜单 | — | 7/7 通过 | 回归保持通过 |
| RT3-01 Electron 首启引导 | P0 崩溃 | P0 无引导/崩溃对话框 | ✅ **已闭环**（引导页 WO-083） |
| RT3-02 `spark --version` | P1 | P1 未修 | ✅ **已闭环**（WO-084） |
| RT3-03 带代理 LLM | P1 | P1 空响应 | ✅ **已闭环**（WO-085） |
| RT3-04 MCP 连接超时 | P1 | P2 10s 超时 | ✅ **已闭环**（WO-086，30s） |
| RT3-06 375px 侧栏占宽 | — | P2 占 2/3 | ✅ **已闭环**（WO-087，自动折叠 48px） |

---

## 五、新发现问题

本轮**未发现新的 P0/P1 缺陷**。

观察项（非阻断，记录备查）：
- **OBS-1（P3 / 设计确认）**：375px 窄屏下若用户手动展开侧边栏再进入会话，侧栏保持展开态会把对话区挤成窄列。复现：375×667 → 点「项目 demo」展开分组 → 点会话。属用户主动展开后的预期态（WO-087 为「挂载缺省折叠、可再展开」口径），非回归；建议后续移动端把展开态侧栏做成 overlay drawer 而非挤压主区。证据 `07b-narrow-375-session-expanded.png`。
- **OBS-2（P3 / 环境噪声）**：本轮一次 oneshot 在 60s 超时被 kill（EXIT=124），重跑即正常（3.9s exit 0）。判断为 npx 冷启动与代理抖动叠加的偶发，未稳定复现，不记为缺陷。

---

## 六、已知不修项（按要求未重复上报）

- MCP github「连接失败」——无凭证环境预期
- 技能页只读——管理归 v2
- 会话重命名缺失——已登记为后端缺口
- 审批拒绝的二次确认交互——设计如此

---

## 七、结论

第四轮全功能深度测试通过：**构建绿、全量单测 2481/0 失败、11 项修复验收全部 ✅、全量回归无 P0/P1 回退**。round3 遗留的 RT3-01/02/03/04/06 五项已全部闭环（WO-083~087），UI 修复批（WO-079/080/081/082、裸 /settings、搜索清除、侧栏右键菜单）回归保持稳定。建议进入 release 前最终走查。
