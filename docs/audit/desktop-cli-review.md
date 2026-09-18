# Spark 桌面端（Electron）与 CLI TUI 启动验证 / 深度交互测试报告

- 测试时间：2026-09-18 01:52–02:00 (UTC+8)
- 环境：Cloud VM / Ubuntu 22.04（glibc 2.35），Xvfb `DISPLAY=:99.0`（1920×1080）
- Node v24.21.0（nvm），pnpm 9.15.9（corepack），npm 官方源
- 被测版本：`@spark/desktop@0.1.0`（Electron 44.0.0）、`@spark/cli@0.1.0`（Ink 7 + React 19）
- 项目根：`apps/desktop`、`apps/cli`

---

## 一、结论速览

| 验证项 | 结果 | 说明 |
|---|---|---|
| `pnpm --filter @spark/desktop build` | ✅ 通过 | server bundle + web + main 三段全绿 |
| Electron 主进程拉起（Xvfb） | ✅ 成功 | Chromium/GPU/网络/zygote 全套进程起来 |
| sidecar 拉取（ELECTRON_RUN_AS_NODE） | ✅ 成功 | 监听 127.0.0.1:40373，`/api/healthz`→`{"ok":true}` |
| BrowserWindow 窗口属性 | ✅ 符合预期 | 1440×900，标题 `Spark`，原生菜单 File/Edit/View/Window |
| Web UI 渲染 | ✅ 正常 | 欢迎引导页 + 侧边栏 + 输入框 + 建议 chips |
| `spark --help` | ✅ 正常 | 用法 / 键位 / 一次性模式说明完整 |
| TUI 启动（连真实 sidecar） | ✅ 成功 | Ink 渲染 logo/欢迎框/输入框/状态栏 |
| TUI 输入框中文输入 | ✅ 正常 | 中文逐字渲染无乱码 |
| TUI `?` 帮助面板 | ✅ 正常 | 三 tab（概览/命令/键位）+ 列表 |
| TUI `/` SlashMenu | ✅ 正常 | 8 个命令 + 分页 (1/3) + 导航提示 |
| 一次性模式 `spark -p` | ✅ 管道通 | 事件链完整、跑完即出、退出码正确 |
| 缺失模型配置启动 | ⚠️ 首次失败 | sidecar 直接 E_CONFIG 崩溃（见问题 P1） |

---

## 二、任务一：Electron 桌面端验证

### 2.1 架构与启动方式（读码确认）
- `apps/desktop/package.json`：`main: dist/main.js`，`start: electron .`，`build = build:server + @spark/web build + build:main`。
- `apps/desktop/src/main.ts`（sidecar 模式，ADR D14）职责：
  1. `pickPort()` 抓本地空闲端口；
  2. `spawn(process.execPath, [build/server/index.mjs], { env: ELECTRON_RUN_AS_NODE=1, SPARK_PORT, SPARK_HOST=127.0.0.1, SPARK_WEB_DIST })` 拉起 server sidecar；
  3. 每 250ms 轮询 `/api/healthz`，20s 超时即 `app.exit(1)`（不进残废 UI）；
  4. `BrowserWindow({width:1440,height:900,minWidth:960,minHeight:640,title:'Spark'})` 加载 `http://127.0.0.1:<port>`。
  5. sidecar 意外退出 → `app.quit()`；`will-quit` 时 SIGTERM sidecar，5s 未退 SIGKILL。

### 2.2 构建
```
pnpm --filter @spark/desktop build
```
- 输出：`build/server/index.mjs`（5.69 MB sidecar bundle）、`web/dist/assets/*`（含语法高亮分片、ibm-plex-mono 字体）、`dist/main.js / notify*.js`。
- 仅有 chunk >500kB 的常规 rollup 警告，**BUILD_EXIT=0**。

### 2.3 首次启动失败（重要发现）
直接 `electron .` 后，sidecar 子进程秒退，主进程跟随退出，stderr：
```
ConfigError: models.json 缺失：defaultModel 必填（E_CONFIG）
    at loadConfig (.../build/server/index.mjs:120638)
  code: 'E_CONFIG'
```
根因：全新机器没有 `~/.spark/models.json`，而 `packages/engine/src/config.ts` 把 `defaultModel` 设为**硬性必填**（文件缺失即 `throw ConfigError`），无任何首启向导兜底。
处理：手工写入最小 `~/.spark/models.json`（providers + defaultModel）后恢复。

### 2.4 修复后启动成功
补配置后 `electron .`（后台常驻）观察到：
- 进程树：主进程 → zygote×3 → gpu-process（`--ozone-platform=x11`）→ network service → **sidecar（PID 23596，`.../build/server/index.mjs`，ELECTRON_RUN_AS_NODE 子进程）** → renderer。
- sidecar 监听 `127.0.0.1:40373`：
  - `GET /api/healthz` → `{"ok":true}`（pino 日志 req-1，200）
  - 前端随后发起 `GET /`、`/assets/index-*.js`、`/assets/*.css`、`/api/models`、`/api/sessions`、`/api/commands`、`/api/event`(SSE) 全部 200。
  - `GET /api/models` 返回内置 provider 目录（openai / deepseek / openrouter…，均 `configured:false`）。
- 窗口几何：BrowserWindow 1440×900（X 窗口 16777219，name=`Spark`），**与 main.ts 配置值一致**；原生菜单栏出现 `File / Edit / View / Window`（证明是原生 Electron 窗口，非浏览器标签）。

### 2.5 UI 渲染
截图 `desktop/electron-spark-window.png`：
- 左侧栏：`+ 新建会话`、`搜索会话`、`项目/时间` 切换、`暂无会话`、底部 `已归档 / 搜索 / 自动化 / 本机用户`。
- 主区：`欢迎使用 Spark` 引导三步（1.欢迎 2.配置模型 3.开始使用），卡片 `本地优先·数据不出本机`，三条 bullet（引擎跑在本机 127.0.0.1、API Key 只存 `~/.spark/secrets.json`、敏感操作逐条审批），按钮 `开始配置模型 / 稍后再说`。
- 底栏：`已连接 · seq 0 · now`。
- 结论：sidecar 连接态、SSE 事件流、模型/命令/会话 API 全部贯通，UI 正常渲染。

### 2.6 启动日志中的非致命噪声（不影响功能）
- `dbus/bus.cc: Failed to connect to the bus`（沙箱无 systemd bus，正常）；
- `vaapi / drmGetDevices2 / dri3 extension not supported`（Xvfb 无 GPU 硬解，软件渲染，正常）；
- `Proxy authentication parameters ignored`（Linux 代理配置，无影响）。

---

## 三、任务二：CLI TUI 深度交互测试

### 3.1 `--help`
`node apps/cli/bin/spark.js --help` 退出码 0，输出完整用法（见 `cli/help-output.txt`）：
- 子命令：`spark` / `spark up` / `spark mcp`；`--api <url>`（缺省 `http://127.0.0.1:4318`）。
- 键位表（Enter 发送、`/` 命令前缀、Tab 切换提交模式、Esc 中断、1/2/3 审批、Ctrl+O 折叠、Ctrl+N 新建、`?` 帮助、Ctrl+U 清空、Ctrl+C×2 退出、Ctrl+R 重试）。
- 一次性模式：`-p`、`--output-format text|json`、`--cwd <dir>`。

### 3.2 TUI 启动与交互（tmux 140×42，连真实 sidecar :40373）
启动命令：`node apps/cli/bin/spark.js --api http://127.0.0.1:40373`。

| 操作 | 现象 | 截图 |
|---|---|---|
| 冷启渲染 | ASCII `Spark` logo + 欢迎框（`>_ Spark (v未知版本)`、`API Key \| mock/mock-model`）、`[now] > 输入您的消息或 @ 文件路径`、状态栏 `→user · mock/mock-model · [now] · ? 帮助 · /stats 明细` | `cli/tui-01-initial.png` |
| 输入中文 | `[now] > 你好，Spark，这是一条测试消息` 逐字渲染，无乱码 | `cli/tui-04-input.png` |
| 按 `?` | 弹出帮助面板：tabs `概览 命令 键位`，正文 `会话管理：/new · /resume · /stats` 等 | `cli/tui-03-help.png` |
| 按 `/` | SlashMenu 弹出（约 3s 后拉到 `/api/commands` 填充），列出 `/init /compact /plan /goal /voice /new /resume /fork`，底部 `(1/3) 续页 · ↑↓ 选择 Enter 确认 Esc 关闭` | `cli/tui-02-slashmenu.png` |

> 注：截图 PNG 由 tmux `capture-pane` 文本经 Noto Sans CJK 渲染生成；同目录 `.txt` 为原始终端捕获（含 ANSI 结构），`help-output.txt` 为 --help 原文。

### 3.3 TUI 发现的小问题
- **P4 logo banner 重绘残影**：会话信息（`/home/user`）加载后，欢迎 ASCII logo 块被重绘一次但旧帧未清，屏上出现两个重叠的 logo 框（见 initial / slashmenu 截图上部）。Ink 全屏重绘在 overlay 切换时的常见问题，不影响功能。
- SlashMenu 首帧需 ~3s 才填充命令（取决于 `/api/commands` 往返），空窗期只显示输入框里的 `/`，属正常加载但无 spinner。

---

## 四、任务三：CLI 一次性模式

命令（注意：任务书写的 `--project` 实际不存在，正确参数是 `--cwd`）：
```
node apps/cli/bin/spark.js -p "你好" --cwd /tmp/test-project
```
- 进程内装配 Engine（不起 server、不经 HTTP），跑完即出，**未挂起**（远小于 10min 超时）。
- text 输出：`(无文本输出)`，**退出码 1**。
- `--output-format json` 事件链（见 `cli/oneshot-events.json`）：
  1. `session.created` { cwd:/tmp/test-project, model: mock/mock-model }
  2. `user.message` { text:"你好" }
  3. `turn.started` { delivery:"now" }
  4. `error` { scope:"llm", message:"E_LLM_PROVIDER: 未知 provider mock（v1 支持见 PROVIDERS 表；自定义 OpenAI 兼容端点请用已知 provider 名 + baseUrl）" }
  5. `turn.completed` { finish:"error", usage:{0,0} }

行为评价：一次性模式管线（in-process client → 建会话 → 发消息 → 等 turn.completed → 输出 → 优雅 shutdown）**完全按设计工作**，fail-fast 不悬挂、退出码 1 与 `finish:error` 一致。本次无文本输出仅因测试用 `mock` provider 不是已知 LLM provider（运行期被拒），并非 CLI 缺陷；配真实 provider+key 即可产出 assistant 文本。

---

## 五、发现的问题清单

| 编号 | 严重度 | 问题 | 证据 / 复现 | 建议 |
|---|---|---|---|---|
| P1 | 中 | 首启无 `~/.spark/models.json` 时 sidecar 直接 `E_CONFIG` 崩溃、壳闪退，无首启引导兜底 | 首次启动 stderr ConfigError | 桌面壳在 sidecar 早退时给出"先配模型"的引导/错误对话框，而非静默退出；或内置一个可写入的默认 models.json 模板 |
| P2 | 低 | 配置 schema 允许任意 provider 名，但运行期 LLM 网关只认内置 provider；`~/.spark/models.json` 写 `mock` 能过启动校验、跑 turn 才报 `E_LLM_PROVIDER` | oneshot 事件 4 | loadConfig 阶段即对 `defaultModel.provider` 做已知 provider 校验，把错误前移到启动时 |
| P3 | 低 | 一次性模式参数 `--project` 不存在却被静默忽略（不报错），实际用 `--cwd` | `spark -p hi --project /tmp/x` 不报错但 cwd 退回当前目录 | parsePrintArgs 遇到未知 flag 应报 `E_USAGE`，避免用户误传 |
| P4 | 低 | TUI 欢迎 logo banner 在会话信息加载后重绘残留（双 logo 叠影） | tui-01/02 截图上部 | Ink overlay 切换前先清屏或用绝对重绘 |
| P5 | 提示 | SlashMenu 填充有 ~3s 空窗无加载指示 | 按 `/` 后先见空框 | 空窗期显示"加载命令…"占位 |
| P6 | 环境 | 沙箱首次 `electron --version` 触发 postinstall 自动下载二进制；无 dbus/GPU 产生若干噪声日志 | electron.log | 已知 headless 现象，生产打包无需处理 |

---

## 六、截图 / 产物清单

### desktop/
- `electron-spark-window.png` — **真实 Electron 窗口**：原生菜单 File/Edit/View/Window + 欢迎引导页（主证据）
- `electron-window.png` — X root 全帧（含同屏 Chrome，仅作环境参考）

### cli/
- `help-output.txt` — `spark --help` 原文
- `tui-01-initial.png` / `.txt` — TUI 初始启动
- `tui-02-slashmenu.png` / `.txt` — 按 `/` 弹出 SlashMenu（8 命令 + 分页）
- `tui-03-help.png` / `.txt` — 按 `?` 帮助面板
- `tui-04-input.png` / `.txt` — 中文输入框渲染
- `oneshot-events.json` — 一次性模式完整 durable 事件数组

### 其他
- `_audit/render_tui.py` — 终端文本→PNG 渲染脚本

---

## 七、复现命令备忘
```bash
# 环境
unset NPM_CONFIG_PREFIX; export NVM_DIR=$HOME/.config/nvm
. "$NVM_DIR/nvm.sh"; nvm use --delete-prefix v24.21.0
corepack prepare pnpm@9.15.9 --activate
export npm_config_registry=https://registry.npmjs.org/

# 桌面端
pnpm --filter @spark/desktop build
DISPLAY=:99.0 apps/desktop/node_modules/.bin/electron .     # 需先有 ~/.spark/models.json

# CLI
node apps/cli/bin/spark.js --help
tmux new -s tui -x 140 -y 42
node apps/cli/bin/spark.js --api http://127.0.0.1:<sidecar-port>
tmux capture-pane -t tui -p -S -100

# 一次性
node apps/cli/bin/spark.js -p "你好" --cwd /tmp/test-project --output-format json
```
