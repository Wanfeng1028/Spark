# AUD-01~14 回归测试报告

- 执行时间：2026-09-19
- 基线 commit：`6e4219b`（main，Merge PR #24）
- 环境：Node v24.21.0 / pnpm 9.15.9 / Linux Cloud VM / 视口 1000×1000
- 范围：仅验证与记录，未修改任何源码

---

## 一、构建与全量测试结果

### 构建
- `pnpm install`：成功（lockfile up to date，7s）
- `pnpm build`：成功（apps/web vite 构建 16.10s，仅 chunk 体积警告，无错误）

### 全量测试（干净环境，清除代理 env）
**EXIT=0，全绿。**

| 包 | 测试文件 | 通过 | 跳过 |
|---|---|---|---|
| packages/protocol | 18 | 1244 | 0 |
| packages/engine | 49 (1 skipped) | 713 | 2 |
| apps/web | 25 | 236 | 0 |
| apps/server | 15 (1 skipped) | 134 | 1 |
| apps/cli | 6 | 77 | 1 |
| apps/miniapp | 7 | 41 | 0 |
| packages/sdk | 2 | 14 | 0 |
| packages/skill-kit | 1 | 7 | 0 |
| apps/desktop | 2 | 9 | 0 |
| examples/sdk-bot | 1 | 2 | 0 |
| **合计** | **126** | **2477** | **4** |

> 注：首次带沙箱默认 env 跑时 `packages/engine/tests/proxy-fetch.test.ts`（工单 12.9，**非 AUD 工单**）1 例失败——根因是沙箱注入了 `PROXY`/`HTTP_PROXY`/`http_proxy` 等代理变量，而该测试 `afterEach` 只清理 `HTTPS_PROXY`/`https_proxy` 两项。清除全部代理 env 后该文件 3/3 通过。**判定：环境污染，非 AUD 回归。**

---

## 二、AUD-01~14 逐个验证结论

| 工单 | 主题 | 源码确认 | 对应单测 | 结论 |
|---|---|---|---|---|
| AUD-01 | 审批写盘失败不再放行（fail-closed） | `permission/service.ts:257`「resolved 落盘成功才向工具侧放行」 | `permission.test.ts`（含 AUD-01 describe，55 tests） | ✅ 通过 |
| AUD-02 | bash 输出执行期限界 + UTF-8 边界解码 | `tools/builtin/bash.ts:173,239`（4 倍缓冲 + TextDecoder 收尾残字） | `tools-builtin.test.ts`（35 tests） | ✅ 通过 |
| AUD-03 | 文件工具/checkpoint 原子写 | `checkpoint.ts:157,197`（atomicWriteFile） | `tools-builtin.test.ts` | ✅ 通过 |
| AUD-04 | symlink 硬边界 | `tools/definition.ts:82`（realpath 上判定越界） | `tools-builtin.test.ts` | ✅ 通过 |
| AUD-05 | 附件投影缓存 | `projector.ts:195,205`（cachedAttachment LRU） | `projector.test.ts`（19 tests） | ✅ 通过 |
| AUD-06 | 错误文案脱敏 | `run-loop.ts:162`（redactedMessage 包裹全部 error emit） | `run-loop.test.ts`（25 tests） | ✅ 通过 |
| AUD-07 | run-loop 三缺陷 | `run-loop.ts:185,386,421`（续步入预算/finally 释放运行态/吞错收窄） | `run-loop.test.ts` | ✅ 通过 |
| AUD-08 | web 回放代际协调 | `web/src/transports/replay.ts` + `context.tsx:95` | `web/tests/replay.test.ts`（3 tests） | ✅ 通过 |
| AUD-09 | session-page 销毁闸门 | `protocol/session-page.ts:159,173,257`（dispose 后静默） | `protocol/tests/session-page.test.ts`（13 tests） | ✅ 通过 |
| AUD-10 | 坏尾行受控修复 | `session/store.ts:149`（备份+截断到有效边界+续写可重读） | `store.test.ts`（28 tests） | ✅ 通过 |
| AUD-11 | 背压分级 + drain 自愈 | `bus.ts:299,307`（durable 分级）+ `pipeline.ts:427`（ProgressGate drain） | `bus.test.ts` + `pipeline.test.ts`（34 tests） | ✅ 通过 |
| AUD-12 | 桌面首启引导窗 | `desktop/main.ts:35` + `fatal.ts`（就绪前早退走引导窗） | `desktop/tests/fatal.test.ts`（3 tests） | ✅ 通过 |
| AUD-13 | ErrorBoundary/麦克风/剪贴板 | `ErrorBoundary.tsx` + `useVoiceInput.ts:61` + `useCopy.ts` | `error-boundary.test.tsx` + `voice-input.test.tsx` + `use-copy.test.ts`（11 tests） | ✅ 通过 |
| AUD-14 | 竞态批 + inprocess dispose 对等 | `useTransportQuery.ts`（genRef 闸门）+ `sdk/inprocess.ts:102`（assertNotDisposed） | `use-transport-query.test.tsx`（2）+ `inprocess-dispose.test.ts`（9） | ✅ 通过 |

### 单测聚合结果（AUD 相关文件单独复跑，干净环境）
- 引擎类 7 文件：**196/196 通过**
- protocol AUD-09：**13/13 通过**
- sdk AUD-14：**9/9 通过**
- web AUD-08/13/14 5 文件：**16/16 通过**
- desktop AUD-12：**3/3 通过**

---

## 三、功能验证截图索引

| 截图 | 文件 | 验证点 |
|---|---|---|
| 01 | `01-web-welcome.png` | web 端 mock 启动，欢迎页/会话列表/输入框/「已连接」状态栏正常 |
| 02 | `02-web-session-error-graceful.png` | AUD-13 韧性：未知会话错误以红色横幅+重新加载按钮呈现，未整壳崩溃 |
| 03 | `03-web-chat-approval-flow.png` | 审批流 UI（step 3 edit 等待审批 + 审批卡 + 状态栏 seq） |
| 04 | `04-electron-firstrun-fatal.png` | **AUD-12**：全新用户目录无 models.json → sidecar 崩，但 Electron 壳**未秒退**，弹出「Spark 启动失败」引导窗（原因 + stderr 尾部 + ConfigError） |
| 05 | `05-web-e2e-real-model.png` | 端到端：Step Plan API（step-3.7-flash）真实对话，模型返回「你好，我是 AI 助手…」，状态栏显示 ↑12.3k ↓56 水位 2% |

### CLI 版本号验证（AUD 历史问题「v未知版本」）
- `BootHeader.versionOf()` 从 `package.json` 解析 version；dist 构建后 `require('../../package.json')` 正确解析到 **0.1.0**，不再回落「未知版本」。`SPARK_VERSION='0.1.0'`（engine-types.ts）。

### 端到端 API 验证
- 配置 `models.json`（provider=stepfun，baseUrl=https://api.stepfun.com/step_plan/v1，model=step-3.7-flash）+ `secrets.json`
- `POST /api/sessions` → 201，自动识别 git 分支 main
- `POST /api/sessions/:id/messages` → 200 started
- SSE `/api/event` 收到完整流：turn.started → user.message → reasoning(10 delta) → assistant.delta(14) → assistant.message → checkpoint.created → turn.completed(finish=stop, input=2313/output=56)

---

## 四、发现的新问题

1. **（环境性，非代码 bug）`proxy-fetch.test.ts` 测试隔离不完整**：`afterEach` 只删 `HTTPS_PROXY`/`https_proxy`，未删 `PROXY`/`HTTP_PROXY`/`http_proxy`。在注入全套代理 env 的 CI/沙箱环境下首例会失败。建议补全清理项。**工单 12.9，不在 AUD-01~14 范围内。**

2. **（运行时提示，非阻断）cwd 非 git 仓库时 checkpoint 快照报错**：`E_CHECKPOINT_SNAPSHOT: git ... does not have a commit checked out`。io 级错误，不阻断 turn；换用 git 仓库 cwd 即正常。属预期行为（checkpoint 依赖 git）。

3. 首次 `apps/server` 打包产物 `dist/index.js` 因 esbuild external 了 `@earendil-works/pi-ai` 但该包未提升到 server 目录 node_modules，直接 `node dist/index.js` 报 ESM 解析失败；用 `tsx src/index.ts`（dev 模式）运行正常。**属打包/部署链路问题，与 AUD 修复无关，CI 走测试不打生产包故未暴露。**

---

## 五、结论

**AUD-01~14 全部修复生效。** 全量测试 2477 通过 / 4 跳过 / 0 失败（干净环境）；14 个工单均有对应单测且全绿，源码修复点逐一核对无误；功能层面 web/Electron/CLI/server 端到端验证通过，AUD-12 首启引导窗与 AUD-13 渲染韧性现场确认。
