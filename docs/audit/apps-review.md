# Spark `apps/` 深度代码审查报告

- 审查范围：`apps/{web,server,cli,desktop,mobile,miniapp,docs}`
- 审查基准：React 19 + TypeScript strict + Vite + Tailwind + shadcn；server = Fastify 5 + zod 4
- 审查日期：2026-09-18
- 代码体量：`apps/web/src` 约 12,946 行 TS/TSX；server `src/` 含 6 域路由插件 + 全套 vitest 契约测试

> 总体第一印象：这是一个**纪律性极强、远高于行业平均水平**的 monorepo 前端/后端实现。
> 事件溯源（event-sourcing）作为唯一状态源、`applyEvent` reducer、严格 TS、错误闭合
> （"不吞、不假成功"）、定时器清理纪律、zod `strictObject` 全量入参校验，都做得非常到位。
> 本次未发现 P0 级致命问题；以下问题以 P1/P2 为主，多数为边界条件与加固项。

---

## 一、各 app 概览

| App | 技术栈 | 职责 | 规模印象 |
|-----|--------|------|----------|
| `apps/web` | React 19 + Zustand 5 + React Router 7 + Vite + react-virtuoso + streamdown/shiki + Radix/shadcn | 主 UI：会话流、设置中心、命令面板、@/补全、语音听写 | ~90 个文件，核心重点 |
| `apps/server` | Fastify 5 + zod 4 + pino + playwright-core | 薄壳后端：6 域路由插件 + SSE + 配对鉴权 + 静态托管；引擎在 `@spark/engine` | 12 源文件 + 18 个测试 |
| `apps/cli` | Ink 7 + React + Zustand | 终端 TUI：输入框、SlashMenu、消息行、面板路由 | ~25 组件 |
| `apps/desktop` | Electron sidecar（`ELECTRON_RUN_AS_NODE=1` 跑 server bundle） | 拉 sidecar、探活、开窗口、系统通知 | 3 源文件，简洁 |
| `apps/mobile` | Expo + React Native + zustand + react-native-sse | 移动端：会话/设置屏、SSE 续播 | 复用 protocol 下沉内核 |
| `apps/miniapp` | Taro 4 + React + zustand（weapp/h5 双端） | 微信小程序：session/sessions/settings | transport 自实现 SSE 泵 |
| `apps/docs` | VitePress | 开发者文档站（无运行时依赖） | 1 配置 + 1 脚本 |

**架构亮点**：事件流是 UI 唯一状态源；HTTP/SSE 内核下沉 `@spark/protocol`，web/cli/mobile/miniapp
四端共用 `SessionStreamCore` / `HttpTransport`；`VITE_SPARK_MOCK=1` 提供对等 MockTransport。

---

## 二、问题清单

### P0（阻断 / 必须立即修）

无。本次审查未发现可直接导致数据丢失、远程代码执行、鉴权绕过或隐私泄露的 P0 问题。

---

### P1（应尽快修 —— 资源泄漏 / 渲染级健壮性）

#### P1-1 语音录制：组件卸载时未释放麦克风流（MediaStream 泄漏）
- **文件**：`apps/web/src/features/chat/useVoiceInput.ts`
- **位置**：`cleanup()`（L52–59）仅在 `recorder.onstop` 内被调用（L92）；**没有任何 `useEffect` 在卸载时调用 `cleanup()`**
- **描述**：用户在录音中切走路由（离开 SessionPage → Composer 卸载），`MediaRecorder` 与 `getUserMedia` 返回的 `MediaStream` tracks 不会被 stop。后果：浏览器麦克风指示灯常亮、系统认为仍在录音、tracks 与 `ondataavailable`/`onstop` 闭包滞留，直到 GC。这正是审查要求中的"未清理的订阅/定时器"类问题，且涉及硬件资源与用户感知（隐私灯）。
- **建议**：增加
  ```ts
  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    cleanup()
  }, [cleanup])
  ```
  注意 `cleanup()` 会把 `streamRef.current = null`，但 tracks 已 stop，语义正确。

#### P1-2 整个 web 端无 React ErrorBoundary（渲染异常即白屏）
- **文件**：`apps/web/src/main.tsx`、`apps/web/src/App.tsx`
- **位置**：全局 grep `ErrorBoundary|componentDidCatch|getDerivedStateFromError` **0 命中**
- **描述**：应用对**数据层**错误覆盖极好（ErrorBanner/ErrorToast/三态 hook），但对**渲染层**异常没有任何兜底。流式 markdown（streamdown）、畸形事件投影、`AssistantBlock` 任一渲染期抛错，React 19 会整体卸载组件树 → 用户看到纯白屏，无法自救（无重试入口、无日志）。
- **建议**：在 `App.tsx` 的 `<TransportProvider>` 外包一层 `ErrorBoundary`，渲染"界面崩溃"兜底 + "重载"按钮（调用 `location.reload()`），并把错误上报 `console.error`。建议同时给 `ChatView` 的 `itemContent` 加行级边界，避免单条坏消息拖垮整段会话流。

---

### P2（建议修 —— 边界条件 / 加固 / 一致性）

#### P2-1 `useCopy` 的 `setTimeout` 未在卸载时清理（web + mobile + miniapp 同型）
- **文件**：`apps/web/src/hooks/useCopy.ts:13`；`apps/mobile/src/components/session-items.tsx:66`；`apps/miniapp/src/components/session-items.tsx:62`
- **描述**：`setTimeout(() => setCopied(false), 1500)` 没有保存句柄、也没有卸载清理。React 18+ 已不对卸载后 setState 报警告，故影响轻微，但仍是定时器泄漏（1.5s 内组件已销毁）。
- **建议**：改 `useRef` 存 timer + 卸载 effect 里 `clearTimeout`，与项目其它 14 处定时器的清理纪律保持一致。

#### P2-2 Composer 用 props 初始化 state，父级后续变更不同步
- **文件**：`apps/web/src/features/chat/Composer.tsx:118`（`useState(initialDraft)`）、`:128`（`useState(defaultDelivery)`）
- **描述**：这是"非受控初值"模式。`initialDraft` 来自 router `location.state`，`defaultDelivery` 来自 settings store。组件挂载后若父级再次传入新的 `initialDraft`，本地 `draft` 不会更新；用户在设置里改了默认提交档，已挂载的 Composer 的 `segment` 也不会跟随。当前靠 SessionPage 传新草稿的场景少，风险窗口小，但属隐性 stale state。
- **建议**：若确有"父级会二次推草稿"的语义，加 `useEffect` 同步；否则在注释中明确"仅初值"契约。

#### P2-3 `@` 补全的 listFs 防抖存在在途竞态
- **文件**：`apps/web/src/features/chat/Composer.tsx:248–261`
- **描述**：防抖 timer 有 `clearTimeout`，但已发出的 `transport.listFs(...)` promise 没有 `cancelled` 旗标。若请求 A 慢于请求 B，A 后 resolve 会用旧结果覆盖 `atEntries`（用户已继续输入）。150ms 防抖 + 本地 fs 查询，实际窗口极小。
- **建议**：与 `useTransportQuery` 同型，在 `.then` 前加 `if (cancelled) return`。

#### P2-4 附件上传 `decodeURIComponent` 可能抛 500 而非 400
- **文件**：`apps/server/src/routes/sessions.ts:258`
- **描述**：`const name = decodeURIComponent(nameHeader)`。恶意/畸形 `x-file-name` 头含非法 `%` 序列会抛 `URIError`，经全局错误处理器 `toApiError` 命中兜底 → `500 E_INTERNAL`（还会打一条 error 日志）。用户输入类问题应是 400。
- **建议**：`try { decodeURIComponent(...) } catch { name = 'image.' + ext }`。

#### P2-5 SSE 的 `drain` 监听在关闭时未移除
- **文件**：`apps/server/src/sse.ts:110`（`res.on('drain', () => sub.resume())`）
- **描述**：`req.raw.on('close')`（L122）里清了 heartbeat、unsubscribe、删 clients，但 `res` 上的 `drain` 监听器没 `removeListener`。`ServerResponse` 销毁后由 GC 回收，实际影响很小，但与本文件其它资源"成对清理"的纪律不一致。
- **建议**：close 回调里 `res.removeListener('drain', resume)`（或改命名函数引用）。

#### P2-6 会话切换时权限档位短暂显示旧值
- **文件**：`apps/web/src/routes/SessionPage.tsx:83–89`
- **描述**：`useTransportQuery` 在 deps（`sid`）变化时重新拉取，但**不清空旧 `data`**。切换会话瞬间，`presetLoaded` 仍是上一会话的值，`useEffect` 把它写进 `preset`，直到新请求回来才覆盖。一个短暂的"跨会话档位串台"窗口。
- **建议**：在 `useTransportQuery` 或此处，deps 变化时把本地 `preset` 重置为缺省 `confirm-each`（fail-closed 方向本来就是项目偏好）。

#### P2-7 server 数据面无通用速率限制（仅配对自举口有限流）
- **文件**：`apps/server/src/` 全局（grep `rate.limit|429` 仅命中 pairing 的 5 次失败锁定）
- **描述**：缺省绑定 `127.0.0.1` 且无鉴权，本地威胁模型下限流意义不大；但 ADR D24 允许"非环回 + 配对鉴权"暴露到局域网/外网，此时 `POST /api/sessions/:id/messages`、`/api/transcribe`（base64 音频）等重操作**无任何速率/并发节流**。
- **建议**：非环回模式下至少对写/重端点加一层最小限流（如 `@fastify/rate-limit`）；当前可在文档中明确"非环回仅限可信网络"。

#### P2-8 Electron BrowserWindow 未显式硬化 webPreferences / 导航
- **文件**：`apps/desktop/src/main.ts:107–114`
- **描述**：窗口只加载 `http://127.0.0.1:<port>`，且未显式声明 `webPreferences`。现代 Electron 默认 `contextIsolation:true / nodeIntegration:false` 是安全的，但**显式声明**更稳健，也不依赖版本默认值；同时缺少 `will-navigate` / `setWindowOpenHandler` 拦截（理论上渲染内容若被诱导跳转外链，无护栏）。
- **建议**：`webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }`；加 `win.webContents.on('will-navigate', e => e.preventDefault())`。

#### P2-9 外观页 shiki highlighter 从不 dispose
- **文件**：`apps/web/src/features/settings/AppearancePage.tsx:16–23`
- **描述**：注释自称"单例"，但每次主题变更都 `createHighlighter(...)` 新建一个实例且从不 `hl.dispose()`。设置页是低频操作，影响可忽略，但会反复占用 WASM/语法资源。
- **建议**：模块级缓存 highlighter，或 effect cleanup 里 `hl.dispose()`。

---

## 三、亮点（值得肯定的工程实践）

1. **唯一状态源纪律**：`applyEvent` reducer 是 store 唯一写入口，UI 状态只来自事件流；注释反复强调"不造假、不吞错"。SessionPage 冷启动用"缓存即渲染 + 后台全量回放对齐 seq"避免闪空，设计成熟。
2. **严格类型**：`apps/web/src` 全量 grep **0 个 `: any`、0 个 `as any`**；路由侧全部 `z.strictObject`（拒绝未知字段），`SendMessageBody`/`DeleteSessionBody{confirm: literal(true)}` 等形状精确。
3. **错误闭合闭环**：`useAsyncOp` / `useTransportQuery` 把 busy/error/loading/empty 三态收敛成单点；发送失败回填草稿"不丢用户输入"；server 侧 `E_*` 前缀 → HTTP 状态码映射表完整，并把 Fastify 框架层 `FST_ERR_*` 也收编进统一 `{code,message}` 形态。
4. **资源清理纪律**：14+ 处 `setTimeout/setInterval` 全部成对 `clearTimeout/clearInterval`；SSE 背压 + seq 水位去重 + 撤销即断；移动端 SSE 复用下沉的 `SessionStreamCore`（退避/终态/generation 防竞态）。
5. **安全基线扎实**：默认 `127.0.0.1` + 非环回 fail-closed 启动护栏；路径穿越用 `resolveInRoot` 硬边界；附件/截图文件名走白名单正则；pino 日志用 `redactTokenQuery` 剥 `?token=`；鉴权走 Bearer（不用 Cookie → 天然无 CSRF）；密钥仓"只进不回"；附件 `bodyLimit: 11MB`。唯一的 XSS 面（`AppearancePage` 的 `dangerouslySetInnerHTML`）经核实是 shiki 渲染**硬编码常量**，无用户注入面。
6. **性能**：聊天流用 react-virtuoso 虚拟化；事件流用 `requestAnimationFrame` 批量 flush（同帧多事件只提交一次渲染）；zustand `useShallow` 选择器；`MessageItem` 用 `memo`。
7. **可访问性**：`aria-live`、`aria-expanded/haspopup/label`、`role=menu/menuitem`、菜单 ↑↓/Enter/Esc 键盘导航齐备；单键快捷键正确跳过 INPUT/TEXTAREA/contentEditable。
8. **优雅退出**：server 三步序列（SSE bye → close → engine.shutdown）幂等；desktop sidecar SIGTERM + 5s SIGKILL 兜底。

---

## 四、总体评价

| 维度 | 评级 | 说明 |
|------|------|------|
| React 正确性 | A− | hooks 依赖数组规范；唯一实质泄漏是 P1-1 麦克风流与 P1-2 缺 ErrorBoundary |
| 类型安全 | A | web 零 any；server zod strict 全覆盖 |
| 错误处理 | A | 三态 hook 收敛、失败闭合、人话文案单一来源 |
| 安全 | A− | 默认环回 fail-closed、路径穿越/文件名/日志脱敏到位；扣分点为非环回无通用限流（P2-7） |
| 性能 | A | 虚拟化 + rAF 批处理 + shallow 选择器 |
| 可访问性 | A− | aria/键盘导航完整；浮层多为 mousedown 外点关闭，Escape 覆盖尚可 |
| 后端健壮性 | A | 统一错误映射、参数校验、SSE 背压；扣分点为 `decodeURIComponent` 500（P2-4） |

**结论**：这是一份生产就绪度很高的实现，架构约束（事件流唯一状态源、Mock 对等纪律、组件 copy-in）执行得非常彻底。
建议优先处理 **P1-1（麦克风泄漏）** 与 **P1-2（补 ErrorBoundary）**——前者影响硬件资源与隐私感知，后者是唯一能让整页白屏的健壮性缺口；其余 P2 可随迭代顺带修复。
