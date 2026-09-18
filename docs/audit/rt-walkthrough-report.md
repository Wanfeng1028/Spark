# AUD-RT-01 现场走查报告

**日期**: 2026-09-19
**环境**: Cloud VM (Linux, Node v24.21.0, pnpm 9.15.9)
**走查人**: AI Agent
**配置**: Step Plan provider (step-3.7-flash, OpenAI 兼容)

---

## 走查结果总览

| # | 走查项 | 结果 | 说明 |
|---|--------|------|------|
| 1 | 真实模型端到端 | ✅ 通过 | Step Plan API 真实流式回复确认 |
| 2 | Electron 首启引导 | ❌ 失败 | 空 ~/.spark 时 sidecar 崩溃，无引导页 |
| 3 | LSP 真实 server | ⚠️ 部分通过 | 配置层 OK，工具调用未完整验证 |
| 4 | MCP 外配实调 | ⚠️ 部分通过 | 配置格式 OK，npx 冷启动超时 |
| 5 | 发布冒烟（版本号） | ❌ 失败 | `spark --version` 未实现，进入 TUI 报错 |
| 6 | 语音真实链路 | ➖ 无法测试 | headless 无麦克风/无 sox |
| 7 | 代理实流验证 | ⚠️ 部分通过 | 代理可达，但 undici ProxyAgent 不兼容 |

---

## 1. 真实模型端到端（核心）— ✅ 通过

### 验证内容
- 配置 `~/.spark/models.json` 加入 Step Plan provider（OpenAI 兼容格式）
- 配置 `~/.spark/secrets.json` 存储 API Key
- 启动 Spark server（端口 4318）
- CLI 一次性模式发送真实消息

### 结果
```
$ node apps/cli/bin/spark.js -p "你好，请用一句话介绍你自己" --cwd /tmp/test-project

你好！我是OpenClaw的AI助手，具备文本编辑、代码分析、文件操作、
浏览器自动化、长期记忆和子任务执行等能力，可以帮助你高效完成
各类技术任务。
```

- **真实模型回复**: ✅ 确认（非 mock，input=2313, output=71 tokens）
- **流式输出**: ✅ 正常（finish=stop）
- **TUI 连接 server**: ✅ server API 正常响应（`/api/models` 返回 step-plan provider）
- **TUI 完整渲染**: ⚠️ headless 环境无法渲染 Ink TUI（需交互式 TTY）

### 截图
- `screenshots/rt/01a-models-config.png` — models.json 配置 + API 验证
- `screenshots/rt/01b-cli-oneshot-real-model.png` — CLI 一次性模式真实回复
- `screenshots/rt/01c-tui-server-connection.png` — TUI server 连接状态

---

## 2. Electron 首启引导（AUD-12 回归）— ❌ 失败

### 验证内容
- 备份并清空 `~/.spark`（模拟全新安装）
- Xvfb (DISPLAY=:99.0) 下启动 Electron

### 结果
```
[Sidecar] ConfigError: models.json 缺失：defaultModel 必填（E_CONFIG）
[Sidecar]     at loadConfig (.../build/server/index.mjs:120638:11)
[Sidecar]     code: 'E_CONFIG'
```

**P0 问题**: 空 `~/.spark` 时 sidecar 直接崩溃退出，Electron 窗口秒退，**无引导页/配置向导**。

### 对比：有配置时
```
[Sidecar] Server listening at http://127.0.0.1:32843
[WebUI]   GET / → 200 (Web UI loaded)
[WebUI]   GET /api/models → 200
```
有配置时 Electron 正常启动，Web UI 正常加载。

### 截图
- `screenshots/rt/02-electron-firstrun-crash.png` — 首启崩溃（P0）
- `screenshots/rt/02b-electron-with-config.png` — X 截图（有配置时窗口正常）
- `screenshots/rt/02c-electron-with-config-log.png` — 有配置时启动日志

---

## 3. LSP 真实 server — ⚠️ 部分通过

### 验证内容
- 检查 `typescript-language-server`（npx v6.0.0 可用）
- 配置 `~/.spark/lsp.json`
- 创建含已知类型错误的 TS 测试文件

### 结果
- **typescript-language-server**: ✅ v6.0.0（npx 可用）
- **lsp.json 配置格式**: ✅ 正确（version:1 + languages）
- **LSP 诊断触发**: ⚠️ headless CLI 模式下模型调用 LSP 工具耗时较长，未完整验证

### 截图
- `screenshots/rt/03-lsp-server-config.png` — LSP 配置验证

---

## 4. MCP 外配实调 — ⚠️ 部分通过

### 验证内容
- 配置 `~/.spark/mcp.json` 加入 filesystem MCP server
- 重启 server 验证连接

### 结果
```
[warn] MCP server filesystem 连接超时（10000ms）
[info] Server listening at http://127.0.0.1:4318
```

- **mcp.json 配置格式**: ✅ 正确（version:1 + servers）
- **连接尝试**: ✅ server 启动时尝试连接 MCP
- **连接结果**: ⚠️ 10s 超时（npx 首次下载包冷启动慢）
- **Graceful degradation**: ✅ 超时后 server 继续启动

### 截图
- `screenshots/rt/04-mcp-filesystem-config.png` — MCP 配置与超时日志

---

## 5. 发布冒烟（版本号检查）— ❌ 失败

### 验证内容
- 运行 `spark --version`

### 结果
```
$ node apps/cli/bin/spark.js --version
ERROR Raw mode is not supported on the current process.stdin...
```

**P1 问题**: `--version` 标志未实现独立退出，直接进入 Ink TUI 初始化，headless 环境报 Raw mode 错误。

- **package.json 版本**: 0.1.0
- **CHANGELOG**: 有 [Unreleased] 段
- **spark --version**: ❌ 不工作

### 截图
- `screenshots/rt/05-version-check.png` — 版本号检查结果

---

## 6. 语音真实链路 — ➖ 无法测试

### 验证内容
- 检查 SoX、麦克风硬件、转写端点

### 结果
- **sox**: ❌ 未安装
- **/dev/snd**: ❌ 无音频硬件
- **Step Plan ASR 模型**: ✅ 存在（stepaudio-2.5-asr）

**原因**: headless 云 VM 无麦克风硬件，无法录音测试。需在有音频设备的本地环境完整验证。

### 截图
- `screenshots/rt/06-voice-test.png` — 环境不支持记录

---

## 7. 代理实流验证 — ⚠️ 部分通过

### 验证内容
- 检查环境代理变量
- 测试直连 vs 代理连接
- 验证 Spark 代理配置

### 结果
```
$ # 直连: HTTP 401 in 0.114s  ✓
$ # 代理: HTTP 401 in 0.261s  ✓
```

- **代理环境变量**: ✅ 已配置（vortexip.cn-beijing2.volces.com:8080）
- **curl 代理连通**: ✅ 正常
- **Spark LLM 请求走代理**: ❌ undici ProxyAgent 与 OpenAI SDK 版本不兼容

**P1 问题**: 设了 `https_proxy` 环境变量后，LLM 请求报 `E_LLM_NETWORK: Connection error... undici dispatcher incompatible`。绕过方法：`unset http_proxy https_proxy` 后直连正常。

### 截图
- `screenshots/rt/07-proxy-test.png` — 代理验证结果

---

## 发现的问题列表

### P0（阻断性）

| ID | 问题 | 位置 | 影响 |
|----|------|------|------|
| P0-01 | 空 ~/.spark 时 sidecar 崩溃，无首启引导页 | `apps/desktop/build/server/index.mjs` loadConfig | 全新用户无法完成首次安装，Electron 秒退 |

### P1（重要）

| ID | 问题 | 位置 | 影响 |
|----|------|------|------|
| P1-01 | `spark --version` 未实现，进入 TUI 初始化 | `apps/cli/dist/main.js` | 版本号检查不可用，发版冒烟失败 |
| P1-02 | undici ProxyAgent 与 OpenAI SDK 不兼容 | `packages/engine` llm-gateway | 设了代理后 LLM 请求全部失败 |
| P1-03 | MCP npx 冷启动 10s 超时 | `packages/engine/src/mcp/manager.ts` | 首次连接外部 MCP server 易超时失败 |

### P2（建议改进）

| ID | 问题 | 说明 |
|----|------|------|
| P2-01 | CLI one-shot 模式不读取 secrets.json | 只认 apiKeyEnv 环境变量，需手动 export |
| P2-02 | models.json 不支持 `undefined` 值 | 写入 `undefined` 会导致 JSON 解析失败 |

---

## 截图索引

| 文件名 | 对应走查项 | 说明 |
|--------|-----------|------|
| `01a-models-config.png` | RT-01 | models.json + API 验证 |
| `01b-cli-oneshot-real-model.png` | RT-01 | CLI 一次性模式真实回复 |
| `01c-tui-server-connection.png` | RT-01 | TUI server 连接状态 |
| `02-electron-firstrun-crash.png` | RT-02 | 首启崩溃（P0） |
| `02b-electron-with-config.png` | RT-02 | X 截图（有配置时） |
| `02c-electron-with-config-log.png` | RT-02 | 有配置时启动日志 |
| `03-lsp-server-config.png` | RT-03 | LSP 配置验证 |
| `04-mcp-filesystem-config.png` | RT-04 | MCP 配置与超时 |
| `05-version-check.png` | RT-05 | 版本号检查 |
| `06-voice-test.png` | RT-06 | 语音环境不支持 |
| `07-proxy-test.png` | RT-07 | 代理验证 |
