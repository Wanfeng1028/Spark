# 第三轮复测 + 真机走查报告（round3）

**日期**: 2026-09-19
**环境**: Cloud VM (Linux headless, Node v24.21.0, pnpm 9.15.9)
**被测提交**: `3e5e4da fix(web): 第二轮复测 7 项 UI 修复批（WO-079/080/081/082 + 裸 /settings + 搜索清除 + 侧栏右键菜单）`
**走查人**: AI Agent
**Web dev server**: `VITE_SPARK_MOCK=1 pnpm --filter @spark/web dev`（端口 5173）
**真实模型**: Step Plan provider（step-3.7-flash，OpenAI 兼容，baseUrl https://api.stepfun.com/step_plan/v1）

---

## 一、7 项修复复测结果

| # | 工单/问题 | 验证方法 | 结果 | 证据 |
|---|-----------|----------|------|------|
| 1 | WO-079 375px 窄屏输入工具栏按钮重叠 | CDP `Emulation.setDeviceMetricsOverride` 模拟 375×1000，截图输入栏；量 `document.documentElement.scrollWidth` | ✅ **通过** | `01a-narrow-375-welcome.png`、`01b-narrow-375-session.png` |
| 2 | 裸 `/settings` 右侧空白 | 直接访问 `/settings`，看是否重定向 | ✅ **通过** | `02-settings-bare-redirect.png` |
| 3 | WO-080 + 附件菜单按 Escape 不关闭 | 开 + 菜单后按 Escape，查 `[role=menuitem]` 数量 | ✅ **通过** | `03-plus-menu-open.png`、`03b-plus-menu-after-escape.png` |
| 4 | WO-081 Ctrl+K 打开时 + 菜单残留 | 先开 + 菜单再 Ctrl+K，查底层 menuitem 是否残留 | ✅ **通过** | `04-ctrlk-with-plus-menu.png` |
| 5 | WO-082 bash 沙箱下拉文字截断 | 设置→常规→bash 沙箱下拉，看文字是否完整 | ✅ **通过** | `05-bash-sandbox-dropdown-open.png` |
| 6 | 搜索页无清除按钮 | `/search` 输入关键词，找清除(X)钮并点击 | ✅ **通过** | `06-search-with-text.png`、`06b-search-clear-button.png` |
| 7 | 侧边栏会话项无重命名/删除菜单 | 右键会话项，看操作菜单；点删除看两段式确认 | ✅ **基本通过（重命名仍缺，见下注）** | `07-sidebar-rightclick-menu.png`、`07b-delete-inline-confirm.png` |

### 逐项说明

1. **WO-079 窄屏输入栏**：375px 下 Composer 工具栏已 `flex-wrap`，按钮（+、文件树、权限下拉、麦克风）垂直换行堆叠；`scrollWidth == clientWidth == 375`，无横向溢出/重叠。正常宽屏下按钮横排一行整洁。
   - 残留观察（非本工单范围）：375px 时左侧边栏仍占约 250px（占屏 2/3），主内容区偏窄——属整体移动端响应式布局，非本次修的"按钮重叠"。
2. **裸 `/settings`**：现自动重定向到 `/settings/appearance`，左侧导航 + 右侧"外观"内容完整渲染，不再空白。
3. **WO-080 + 菜单 Escape**：菜单打开时 4 个 menuitem（添加图片/@/命令/$技能）；按 Escape 后 `menuitemCount=0`，菜单关闭。
4. **WO-081 Ctrl+K 残留**：+ 菜单打开时按 Ctrl+K，命令面板居中弹出，底层 `menuitemCount=0`，+ 菜单已自动收起，无残留。
5. **WO-082 bash 沙箱下拉**：下拉现显示"开启（隔离）"（原"开启（平台 wrapper 隔…"已收短），完整无截断；详细说明"平台 wrapper 前缀隔离；不可用时拒跑（ADR D15）"移至下方描述行。
6. **搜索清除钮**：输入"重构"后，输入框右侧出现 `aria-label="清除搜索关键词"` 的圆形 X 按钮；点击后输入值清空。
7. **侧边栏会话项菜单**：右键会话项弹出菜单，含"归档""删除"两项；点"删除"后菜单项两段式变为"确认删除？"（内联确认，非 `window.confirm`，符合 DESIGN §5）。
   - **注**：菜单中**仍无"重命名"**——与修复提交说明一致（"重命名缺口登记，归 header 重写设计"），属已知缺口，非回归。

**复测小结：7 项全部验收通过**（#7 重命名为已登记缺口，不影响"操作菜单已补上"的结论）。

---

## 二、真机走查 9 项结果

| # | 走查项 | 结果 | 说明 |
|---|--------|------|------|
| ① | 移动端真机四场景 | ➖ 环境不支持 | Linux headless，无 adb/emulator/Android SDK/expo 真机；`apps/mobile` 工程存在但无设备可走查 |
| ② | 小程序开发者工具走查 | ➖ 环境不支持 | Linux 无微信开发者工具；`apps/miniapp`（Taro）工程存在但无法在 IDE 走查 |
| ③ | Electron 首启引导（AUD-12 复测） | ⚠️ **P0 维持** | 空 `~/.spark` 仍起不来；现为"启动失败"错误对话框（上轮静默秒退，略改善），**仍无引导/配置向导** |
| ④ | 真实模型端到端（复测） | ✅ **通过** | Step Plan 真实流式回复确认 |
| ⑤ | 语音真实链路 | ➖ 环境不支持 | 无 sox/arecord、无 `/dev/snd` 麦克风硬件 |
| ⑥ | LSP 真实 server | ✅ **改善** | `typescript-language-server` v6.0.0 经 npx 可启动（上轮配置层 OK 未实测拉取） |
| ⑦ | MCP 外配实调 | ⚠️ **部分通过** | filesystem 包可解析（2026.8.31），但 engine 启动仍 10s 连接超时 |
| ⑧ | 代理实流验证 | ⚠️ **部分通过** | unset 代理后真实模型正常；带代理时模型请求空响应，undici 兼容问题仍在 |
| ⑨ | npm 发布冒烟（版本号） | ❌ **仍失败** | `spark --version` 不打印版本，落入 TUI raw-mode 报错（上轮 P1-01 未修） |

### 逐项说明

- **① 移动端真机**：无 Android SDK / 模拟器 / 真机连接。证据 `01-mobile-env.txt`。
- **② 小程序开发者工具**：无微信开发者工具（Linux 不支持官方 IDE）。证据 `01-mobile-env.txt`。
- **③ Electron 首启（AUD-12）**：全新临时 HOME 下 `Xvfb :98` 启动 `electron .`，sidecar 抛 `ConfigError: models.json 缺失：defaultModel 必填（E_CONFIG）`，主进程报 `启动失败： E_SIDECAR_START: server 进程已退出（code=1）`，窗口渲染为"Spark 启动失败"错误页。**比上一轮的静默秒退略好（现在有错误对话框），但全新用户仍无法进入引导/配置向导**——P0 未闭环。证据 `03-electron-firstrun.png`。
- **④ 真实模型 E2E**：`node apps/cli/bin/spark.js -p "用一句话介绍你自己" --cwd /tmp/spark-e2e`（export STEP_PLAN_API_KEY，unset 代理）真实返回"我是一个 AI 助手，可以帮助你完成各种任务，包括文本处理、代码编写、信息检索和文件操作等。"，exit 0。证据 `04-real-model-e2e.txt`。
- **⑤ 语音**：无音频设备/SoX，无法录音。证据 `01-mobile-env.txt`。
- **⑥ LSP**：`lsp.json` 配 typescript/javascript → `npx --yes typescript-language-server --stdio`；实测 `npx --yes typescript-language-server --version` = `6.0.0`（60s 内可拉取启动）。证据 `06-lsp-mcp-proxy.txt`。
- **⑦ MCP**：`mcp.json` 配 filesystem server（`npx -y @modelcontextprotocol/server-filesystem /tmp`）；包版本 2026.8.31 可查；但 `engine.log` 仍记 `MCP server filesystem 连接超时（10000ms）`，与上轮一致（npx 冷启动 > 10s）。证据 `06-lsp-mcp-proxy.txt`。
- **⑧ 代理**：环境带 vortex 代理；unset 代理后真实模型 E2E 正常；带代理跑 oneshot 返回空文本、无流式——undici/OpenAI SDK 代理兼容问题未根本解决。证据 `06-lsp-mcp-proxy.txt`。
- **⑨ npm 发布冒烟**：`node apps/cli/bin/spark.js --version` 不打印版本号，直接进 Ink TUI 初始化，headless 下 `Raw mode is not supported`；`--help` 正常。package 版本 `0.1.0`。

---

## 三、发现的新问题 / 未闭环项

| 级别 | ID | 问题 | 对比上轮 |
|------|----|------|---------|
| P0 | RT3-01 | Electron 空 `~/.spark` 仍无法首启（无引导/配置向导，sidecar E_CONFIG 崩溃） | 上轮 P0-01 未修；本轮从静默秒退改为错误对话框，略有改善但引导仍缺 |
| P1 | RT3-02 | `spark --version` 未实现独立退出，进 TUI 报 raw-mode 错 | 上轮 P1-01 未修，复现一致 |
| P1 | RT3-03 | 带代理时 LLM 请求无响应（undici dispatcher 兼容），须 unset 代理 | 上轮 P1-02 未修，复现一致 |
| P2 | RT3-04 | MCP filesystem npx 冷启动仍 10s 超时 | 上轮 P1-03 维持（包已可拉取，仅启动超时） |
| P2 | RT3-05 | 侧边栏会话项无"重命名"菜单 | 已在修复提交中登记为缺口（header 重写设计），本轮确认仍缺 |
| P2 | RT3-06 | 375px 窄屏左侧边栏仍占 ~250px，主内容区偏窄 | 本次新观察（按钮重叠已修，侧边栏宽度未适配） |

---

## 四、截图/证据索引

| 文件 | 对应项 | 说明 |
|------|--------|------|
| `01a-narrow-375-welcome.png` | 复测#1 | 375px 欢迎页输入栏换行 |
| `01b-narrow-375-session.png` | 复测#1 | 375px 会话页 Composer 按钮垂直堆叠 |
| `02-settings-bare-redirect.png` | 复测#2 | 裸 /settings 重定向到 appearance 并渲染 |
| `03-plus-menu-open.png` | 复测#3 | + 菜单打开（4 菜单项） |
| `03b-plus-menu-after-escape.png` | 复测#3 | 按 Escape 后菜单关闭 |
| `04-ctrlk-with-plus-menu.png` | 复测#4 | Ctrl+K 面板打开、底层 + 菜单无残留 |
| `05-bash-sandbox-dropdown-open.png` | 复测#5 | bash 沙箱下拉"开启（隔离）"无截断 |
| `06-search-with-text.png` | 复测#6 | 搜索输入文字 |
| `06b-search-clear-button.png` | 复测#6 | 搜索清除(X)按钮 |
| `07-sidebar-rightclick-menu.png` | 复测#7 | 侧边栏右键菜单（归档/删除） |
| `07b-delete-inline-confirm.png` | 复测#7 | 删除两段式内联确认"确认删除？" |
| `03-electron-firstrun.png` | 走查③ | Electron 空 HOME 启动失败对话框（P0） |
| `04-real-model-e2e.txt` | 走查④ | 真实模型 oneshot 回复终端记录 |
| `01-mobile-env.txt` | 走查①②⑤ | 移动端/小程序/语音环境不支持记录 |
| `06-lsp-mcp-proxy.txt` | 走查⑥⑦⑧ | LSP/MCP/代理实测记录 |

---

## 五、结论

- **7 项 UI 修复复测全部通过**（WO-079/080/081/082、裸 /settings、搜索清除、侧边栏右键菜单），修复批 `3e5e4da` 验收成立；重命名为已登记缺口。
- **真机走查**：真实模型 E2E 通过、LSP server 可启动；移动端/小程序/语音三项因 headless 无设备/工具无法走查；Electron 首启引导（P0）、`spark --version`（P1）、代理兼容（P1）、MCP 冷启动超时（P2）四项与上轮一致未闭环，建议下批排期。
