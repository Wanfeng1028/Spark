# @spark/miniapp —— Spark 微信小程序壳（Taro 4）

阶段九工单 9.4 产物（ADR D21）。逻辑层复用 `@spark/protocol`（applyEvent 投影、
splitSseFrames/envelopeFromSseFrame 帧解析、ERROR_COPY 错误文案、DEFAULT_BACKOFF_MS 退避），
与 web/cli/RN 四端同口径。

## v1 口径（如实说明）

- **运行方式**：微信开发者工具打开 `dist` 目录（`pnpm --filter @spark/miniapp dev` 生成）；
  体验版走局域网 IP 直连。
- **合法域名**：`project.config.json` 设 `urlCheck: false` 仅开发态生效（不校验合法域名）。
  正式分发需配置 request 合法域名或中继服务——**记 v2（届时补 ADR，本阶段不做）**。
- **体验版限制**：体验版要求 https/合法域名，局域网 IP 直连仅在开发者工具
  （勾选"不校验合法域名"）可用；此为平台能力边界，如实记录。
- **配对**：手输 6 位码为主路径；`Taro.scanCode` 扫码解析 `spark://pair?...` 为可选
  增强，失败不阻塞。
- **token 存储**：小程序无密钥链，token 明文存本地缓存（`Taro.setStorageSync`），
  平台能力上限，v2 重估。
- **本机联调**：服务端以非环回地址启动（局域网 IP），体验版局域网可见。

## 依赖与许可证（ADR D23：MIT 白名单）

| 包 | 版本 | 许可证 |
| --- | --- | --- |
| @tarojs/cli、@tarojs/taro、@tarojs/components、@tarojs/react、@tarojs/runtime、@tarojs/shared、@tarojs/helper、@tarojs/plugin-framework-react、@tarojs/plugin-platform-weapp、@tarojs/webpack5-runner、babel-preset-taro | 4.2.1 | MIT |
| react / react-dom（仅本包锁 18.3.1） | 18.3.1 | MIT |
| zustand | ^5.x | MIT |
| @babel/runtime | ^7.x | MIT |
| webpack（devDep） | ^5.x | MIT |
| vitest（devDep） | ^3.x | MIT |
| typescript（devDep） | ^5.x | Apache-2.0（仓库存量同版本） |

> React 版本决策：Taro 4 的 `@tarojs/plugin-framework-react` peer 要求 React ^18，
> 仓库其余包用 React 19.x——**仅本包锁 18.3.1**，pnpm 隔离实例，不扩散。

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
pnpm --filter @spark/miniapp typecheck    # tsc --noEmit
pnpm --filter @spark/miniapp test         # 逻辑层单测（vitest）
npx taro build --type weapp               # 一次性构建（体积验证用）
```

> 不设 `build` script：根 `pnpm -r build` 语义不含小程序产物（开发者工具上传才发布），
> 避免根构建误触发。

## 本地不做真机/体验版测试

界面走查由用户在开发者工具进行；本包交付三关（typecheck/lint/test）全绿 + 构建可用。
