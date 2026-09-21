# @spark/miniapp —— Spark 微信小程序壳（Taro 4）

阶段九工单 9.4 产物（ADR D21），阶段十九工单 19.29 补齐批（筛选菜单 / 附件入口 /
topBanner+attachments 渲染 / i18n 消费 / token 存储重估 / 语音与中继结论）。
逻辑层复用 `@spark/protocol`（applyEvent 投影、session-page controller、
splitSseFrames/envelopeFromSseFrame 帧解析、ERROR_COPY 错误文案、i18n 字典），
与 web/cli/RN 四端同口径。

## 运行形态与合法域名（如实说明）

- **可用形态（两种，都不是正式发布形态）**：
  ① 微信开发者工具打开 `dist`（`pnpm --filter @spark/miniapp dev` 生成），配合
  `project.config.json` 的 `urlCheck: false`（不校验合法域名）；
  ② 真机预览 / 体验版**开调试模式**（体验版菜单里打开"调试"后同样跳过域名校验）。
- **为什么不能直接正式发布**：小程序 `request` 合法域名只收 **https + 已备案域名 +
  443 端口**，不接受 IP 与自定义端口；`connectSocket` 只支持 **wss**。Spark 服务端
  缺省 `127.0.0.1:4318` 纯 http，无任何公网入口 → 正式版连不上是平台规则的必然后果，
  不是端上少写了代码。正式分发的前置是**中继/反代**，判决与待落地改动见下节。
- **配对**：手输 6 位码为主路径；`Taro.scanCode` 扫码解析 `spark://pair?...` 为可选
  增强，失败不阻塞。
- **token 存储**：明文存本地缓存（`Taro.setStorageSync`）——小程序侧没有安全存储 API，
  重估结论与残余风险见 `src/store/config-store.ts` 头注释（设置页在 token 输入框下
  把"明文 + 撤销兜底"直接写给用户）。
- **本机联调**：服务端以非环回地址启动（局域网 IP），预览/体验版局域网可见。

## 正式分发中继：结论（工单 19.29；ADR 待与中继实现同批立）

三档路线按"改动量 / 时延 / 依赖"排序，判决 = **短期不接，接的时候走 C→B**：

| 方案 | 做法 | 端上/协议代价 | 外部前置 |
| --- | --- | --- | --- |
| A 反代直连 | caddy/nginx 挂 TLS + 备案域名转发到局域网引擎，SSE 原样透传（需 `X-Accel-Buffering: no` 关缓冲） | 零改码（`?token=` 与 Bearer 双口径已就绪） | 公网 IP/内网穿透 + 域名备案 + 证书；把家庭网络上的引擎整体暴露到公网，与"本地优先、127.0.0.1 是刻意的"（AGENTS §2.9）冲突面最大 |
| B WSS 中继 | 公网中继持配对 token，`connectSocket(wss://…)` 收帧、内部订阅引擎 SSE 后转发 | 端上需新增 socket 通道（帧解析可复用 `splitSseFrames`）；**`baseUrlOf` 写死 `http://`** 与 `PairCodeDto.qr` 只能带局域网 host:port 是硬阻塞，需协议面开 scheme/公网基址 | 一台常驻中继服务（不在本仓）+ 域名备案；中继要持凭据转发 = 新增信任边界，审批与数据都不该经过它 |
| C 轮询网关 | 只做 HTTPS 反代，事件流走本端**已有的轮询降级通道**（`forcePolling` + `filterFreshEvents`，数据面 `GET /api/sessions/:id?limit=200`） | 零新事件、零新协议方法；3s 时延与 REST 开销换掉 SSE | 与 A 同（TLS + 备案域名），但可关掉除 sessions 之外的端点面 |

判决要点：本端不新增 Transport 方法（§1.1 落点纪律），中继若在服务端开新端点必须先经
protocol 登记；因此**中继落地 = 一次跨包工单（protocol `pair-link` 扩 scheme + server
settings 增公网基址 + 反代配置文档 + ADR）**，不在补齐批内偷做。

## 语音听写：可行性结论（工单 19.29，先出结论不出代码）

**技术上能做，卡点在审核与分发形态，不在代码**：

- 平台能力齐：`Taro.getRecorderManager()`（微信 `wx.getRecorderManager`，基础库 2.1.0 起，
  本端 2.20.2 门槛已覆盖）→ `start({format:'mp3'})` → `onStop` 给 `tempFilePath` →
  FileSystemManager 读 → base64 → `POST /api/transcribe`。mp3 对应 `audio/mpeg`，
  **恰在引擎转写白名单内**（`packages/engine/src/voice/transcriber.ts` 的 `ALLOWED_MIME`），
  10MB 上限与附件同量级；协议面 `Transport.transcribe` 已存在（工单 16.6），本端只需给
  `MiniRestClient` 加一个方法 + 输入条一个录音钮，约 60 行。
- 三条真卡点：① 录音要 `app.config.ts` 声明 `permission.scope.record` 并在公众平台
  「用户隐私保护指引」勾选麦克风（附使用场景说明），未过审 `start()` 直接 fail；
  ② 开发者工具不支持录音，验证只能真机走查（本仓本机零验证，且需上表的中继形态才进得了正式版）；
  ③ 音频上传仍受 request 合法域名约束——与中继是同一条前置。
- 因此：在正式分发中继落地前接语音，只会做出一条"永远只能在真机调试里按一次"的路径，
  故本批不动代码。中继工单开工时，语音作为其附带项（同一次走查能覆盖）。

## 本端已接 / 未接的协议面（防"以为端上漏了"式误判）

- 已接：`listSessions(archived?)`（筛选菜单三档）、`uploadAttachment`（附件入口）、
  `getSettings`（电脑控制指示 + 界面语言）、`getSession` 分页回放、`sendMessage`、
  `interrupt`、`replyPermission`、`redeemPair`。
- **未接（后端已有方法，缺的是端上 UI）**：反馈投票 `submitFeedback/listFeedback/withdrawFeedback`
  —— 👍👎 需要 assistant 行的 eventId 定位与投票态回读，本批范围外，实现形状与 web 同形；
  归档写入 `archiveSession`（本端只读筛选，归档动作在 web 侧栏）；Transport 其余方法按
  D21 体积纪律不进小程序包（本端 REST 子集只列用到的）。
- **未接（后端本身没通）**：附件随消息发出——见下条整改清单。

## 附件通道现状（工单 19.29 抓到的跨包缺口）

选图 → 读字节 → 上传（`POST /api/sessions/:id/attachments`）→ 缩略图渲染已通；
但 `user.message.attachments` 在真实链路上**永远不会出现**，因为发送通道三处都不承载该字段：
`server SendMessageBody`（strictObject，多塞只换 400）→ `SessionHandle.send` 形参
（`runtime.submit` 已支持 attachments、`projector` 已会读图转 base64）→
`SessionPageController.send`（四端共享的会话页控制器，无附件入参）。
所以本端与 `HttpTransport` 同口径**不发 attachments**，待发条不清空并带一行状态说明
（不冒充已发送）。整改清单见 doc/08 与本目录 `src/session/attachments.ts` 头注释。

## 依赖与许可证（ADR D23：MIT 白名单）

| 包 | 版本 | 许可证 |
| --- | --- | --- |
| @tarojs/cli、@tarojs/taro、@tarojs/components、@tarojs/react、@tarojs/runtime、@tarojs/shared、@tarojs/helper、@tarojs/plugin-framework-react、@tarojs/plugin-platform-weapp、@tarojs/plugin-platform-h5、@tarojs/webpack5-runner、babel-preset-taro | 4.2.1 | MIT |
| react / react-dom（仅本包锁 18.3.1） | 18.3.1 | MIT |
| @pmmmwh/react-refresh-webpack-plugin（devDep，H5 dev fast-refresh） | 0.6.3 | MIT |
| react-refresh（devDep，同上，babel 侧） | ^0.14.2 | MIT |
| zustand | ^5.x | MIT |
| @babel/runtime | ^7.x | MIT |
| webpack（devDep） | ^5.x | MIT |
| vitest（devDep） | ^3.x | MIT |
| typescript（devDep） | ^5.x | Apache-2.0（仓库存量同版本） |

> React 版本决策：Taro 4 的 `@tarojs/plugin-framework-react` peer 要求 React ^18，
> 仓库其余包用 React 19.x——**仅本包锁 18.3.1**，pnpm 隔离实例，不扩散。

> react-dom 是 H5 构建的硬依赖：`@tarojs/plugin-framework-react` 的 H5 分支以
> `resolveSync('react-dom')` 解析后写进 webpack alias（解析不到时返回 null，而
> webpack 的 alias schema 不收 null——表现为"Invalid configuration object"）；
> 小程序（weapp）分支 alias 到 `@tarojs/react`，故 weapp 构建不需要它。

## 事件流主路径与降级

- **主路径（SSE）**：小程序无 EventSource——`Taro.request({ enableChunked: true })`
  + `onChunkReceived`（ArrayBuffer 分块）→ 手写 UTF-8 流式解码 → `splitSseFrames`
  → `envelopeFromSseFrame`。基础库门槛 2.20.2。
- **降级路径（轮询）**：低基础库或分块连接异常（未收到任何数据即失败且非鉴权问题）
  时退化为定时 `GET /api/sessions/:id?limit=200` 取尾部、过滤 `seq>水位` 补齐事件。
  取舍：时延 ~3s、多 REST 开销，换低端设备可用；两路共用同一帧解析与 seq 去重
  （applyEvent 口径），切换重叠期不重复投影；进入轮询后本实例生命期内不回试 SSE
  （避免振荡，重建实例即重新探测）。

## 体积纪律（D21：主包 <2MB）

- 不引第三方小程序 UI 组件库全家桶（§13.I 白名单制：基础组件自绘）。
- `@spark/protocol` 按需 import 逻辑层符号（不引 HttpTransport 全家桶——
  REST 用 Taro.request 自封装子集）。

## 命令

```pwsh
pnpm --filter @spark/miniapp dev          # 构建并监听（产物在 dist/）
pnpm --filter @spark/miniapp dev:h5       # H5 构建（浏览器联调；产物在 dist/）
pnpm --filter @spark/miniapp typecheck    # tsc --noEmit
pnpm --filter @spark/miniapp test         # 逻辑层单测（vitest）
npx taro build --type weapp                # 一次性构建（体积验证用）
npx taro build --type h5                   # 一次性 H5 构建
```

> 不设 `build` script：根 `pnpm -r build` 语义不含小程序产物（开发者工具上传才发布），
> 避免根构建误触发。

## 本地不做真机/体验版测试

界面走查由用户在开发者工具进行；本包交付三关（typecheck/lint/test）全绿 + 构建可用。
