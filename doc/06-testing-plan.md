# Spark 测试体系补全计划——从 456 例单测到五层测试金字塔

## 版本记录

| 版本 | 日期       | 作者                                                                                                                                                            | 变更内容                                                                                                                                                    |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0 | 2026-08-26 | AI 编写：ZCode CLI · ox-alpha（model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；发起：晚风（Wanfeng1028，D5 测试计划指令） | 初稿：五层分层与选型 / CI 流水线 / 性能基线表 / 既有 456 例分层归属与升级建议 / 四端手工走查清单模板；workflow 随各阶段落地（6.8 首批、7.11 eval、阶段八 CLI、阶段九移动端） |
| v1.1 | 2026-08-26 | AI 编写：Trae · GLM-5.3；发起：晚风（Wanfeng1028，阶段六开工指令） | **阶段六工单 6.8 首批落地**：L2 组件测试 22 例（tests/components/——ApprovalCard 三键+feedback+resolved 收起 / ToolCard 三态+展开区 / Composer 三态优先+发送失败回填，vitest+Testing Library+jsdom，dom-stubs 补 matchMedia/rAF）；L3 E2E 7 例（apps/web/e2e/——mock 四场景回归+断线两例+三视口截图，Playwright chromium 单档，`pnpm --filter @spark/web e2e`）；L3.5 基线截图 6 张入 apps/web/e2e/__screenshots__/（welcome+session × 1280/1440/375）。**落地差异两条**：①沙箱内 PLAYWRIGHT 官方 CDN 被网关拦截——playwright.config.ts 支持 SPARK_E2E_BROWSER 指向系统 Chrome executablePath 兜底（CI 有官方浏览器时不设该变量即可）；②E2E 虚拟列表（react-virtuoso）节点回收会重置 ToolCard 展开态——展开断言留在 L2，E2E 以 TurnStatusBar（role=status 恒在 DOM）为就绪信号+「回到底部」滚屏后再断言下方内容。web 用例总数 122→144（vitest）+7（Playwright） |

> **定位**：本文是测试体系的**规划文档**——只定分层、选型、命令、基线与入库位置；workflow 与代码随 doc/02 §8 各阶段工单落地（阶段六工单 6.8 落首批组件/E2E，阶段七工单 7.11 接 eval 与 nightly，阶段八补 CLI 层，阶段九补移动端层）。落地时若与本文冲突，先改本文（附版本记录）再写代码。
> **现状基线**（2026-08-26 实测，main=`ace77d5`）：456 例单测全绿 + typecheck/lint 全绿 + CI（`check_doc_links.py` → typecheck → lint → test）；测试框架 vitest ^3.2.4 全仓统一。
> **阶段六 6.8 后**（2026-08-26，feat/stage6-ui）：L2 组件 22 例 + L3 E2E 7 例 + L3.5 基线截图 6 张已入库（见版本记录 v1.1）；CI 追加 Playwright job 待 PR 合并后接（§2 PR 行）。

---

# 1. 分层与选型（五层 + 契约）

| 层 | 对象 | 选型 | 入库位置 | 启用时机 |
| -- | ---- | ---- | -------- | -------- |
| L1 单测 | 引擎/协议纯逻辑 | vitest（现状延续） | packages/*/tests/ | 已启用（456 例） |
| L1.5 契约 | protocol zod schema ↔ server 路由 ↔ 前端消费 | vitest + 由 zod schema 自动生成往返用例 | packages/protocol/tests/contract/ | 阶段六起（见 §4 升级建议） |
| L2 组件 | web React 组件 | vitest + @testing-library/react + jsdom | apps/web/tests/components/ | 阶段六工单 6.8 首批 |
| L3 E2E | 用户旅程（mock 四场景 + 真实 server 冒烟 + 断线） | Playwright（chromium 单浏览器，禁多浏览器矩阵） | apps/web/e2e/ | 阶段六工单 6.8 首批 |
| L3.5 视觉回归 | 页面截图 diff | Playwright 截图 + pixelmatch，阈值 0.1% | apps/web/e2e/__screenshots__/ | 阶段六起新页面才入基线 |
| L4 CLI | Ink 渲染树 | @testing-library/ink（test-renderer 快照）+ pseudo-tty 模拟 | apps/cli/tests/ | 阶段八工单 8.5 |
| L5 移动端 | RN 组件 + 真机旅程 | Jest + React Native Testing Library；E2E 用 Maestro（YAML 用例入库 apps/mobile/e2e/） | apps/mobile/__tests__/ | 阶段九工单 9.2/9.5 |
| L5.5 小程序 | Taro 壳 | miniprogram-simulate | 小程序包 tests 目录（阶段九工单 9.4 定名） | 阶段九工单 9.4 |

**E2E 标准用例集**（阶段六首批，全部跑在 `VITE_SPARK_MOCK=1` 与真实 server 两态）：

1. mock 四场景回归：normal / long-output / reject / error-finish（`examples/mock-sessions/*.jsonl`，与 MockTransport 同源）——流式渲染、工具三态、审批挂起→拒绝→feedback、error 重试各一条；
2. 真实 server 冒烟：起 apps/server（ScriptedLlm 注入）→ 建会话 → 发消息 → 断言 SSE 事件到达与 UI 投影——CI 不依赖真实 API key；
3. **用户断线场景（标准用例）**：mock 返回 E_MOCK_UNKNOWN_SESSION → 断言顶部细条人话文案（"会话不存在或已被清理"）与原码折叠详情——这是 6.7 错误人话化的验收载体，也是所有错误态 E2E 的模板。

**契约测试生成规则**：以 packages/protocol 的 zod schema 为唯一事实源，脚本生成两类用例——①合法 payload 打 server 路由断言 2xx 与响应 DTO schema；②非法 payload 断言 400 E_VALIDATION。生成物入库 packages/protocol/tests/contract/，schema 变更时重生成（CI 校验生成物与 schema 同步）。

---

# 2. CI 流水线（现状 → 目标）

| 触发 | 现状（ci.yml，ubuntu-latest，node 24） | 目标追加 |
| ---- | ---- | ---- |
| push main | `check_doc_links.py` → `pnpm typecheck` → `pnpm lint` → `pnpm test` | 不变（快速反馈层，<10 分钟） |
| PR | 同上 | 追加 Playwright job（L3 E2E + L2 组件），仅 chromium 一档 |
| nightly（新增 workflow） | 无 | 视觉回归三视口 + 性能基线断言（§3）+ eval 回归（7.11 的 pnpm eval） |
| desktop 打包 | desktop-win.yml（手动，windows-latest，NSIS 产物上传 artifact） | 打包后 smoke：安装 → healthz 200 → Web UI 伺服（5.1 已实证的 Linux `--win zip` 路径固化为 job 内一步） |
| 发布前（人工） | 无 | Maestro 双端（iOS/Android 真机）跑 §5 四幕；NSIS 本机安装走查 |

纪律：nightly 红灯不阻塞 PR 合并，但必须在 24h 内出修复工单（挂 doc/02 §8 对应阶段 checklist）；视觉基线更新只允许随实现同一 PR 提交，禁止"只改基线不改码"。

---

# 3. 性能基线表（有数值有测法，nightly 断言）

| 指标 | 基线 | 测法 | 入 CI 方式 |
| ---- | ---- | ---- | ---- |
| SSE 千事件回放 | <500ms（墙钟，含 applyEvent 全量） | server 测试扩展：预置 1000 条 durable 事件会话，`GET /api/sessions/:id` 全量回放计时；web 侧同批 applyEvent 计时 | vitest 断言上限 500ms（留 2 倍抖动余量，nightly 记趋势） |
| 10k 消息虚拟列表 | 60fps（滚动掉帧 <5%） | mock long-output 场景扩到 10k 项；Playwright `page.trace` 采样 rAF 帧间隔，统计 >16.7ms 帧占比 | nightly Playwright 脚本，超 5% 红灯 |
| CLI 冷启 | <1s（进程起到首帧渲染） | `node apps/cli` 计时到 Ink 首帧回调 | 阶段八起 vitest 断言 |
| 移动端冷启 | <2s（点击图标到会话列表可交互） | Maestro `launchApp` 计时 | 阶段九起 nightly Maestro 断言 |
| 长会话内存上限 | 引擎常驻 RSS <512MB（10 万 durable 事件会话回放后静置 5min）；web 渲染 10k 项 heap <1GB | engine：测试进程 `process.memoryUsage()` 断言；web：Playwright CDP `Performance.getMetrics` | nightly 断言 |
| 压缩触发及时性 | tokens 越阈值后下一 step 前必触发（0.8×contextWindow） | 既有 run-loop 单测覆盖（ScriptedLlm 构造超限序列） | 已在 L1（不新增） |

---

# 4. 既有 456 例分层归属标注与升级建议

当日实测分布：**engine 324（20 文件）/ protocol 46（2 文件）/ web 53（3 文件）/ server 33（2 文件）**。

| 包 | 现状归属 | 判定与升级建议 |
| -- | ---- | ---- |
| protocol 46 | events round-trip + mock 场景校验 | **实为契约测试**（wire 层往返）。保留；阶段六起把"DTO→路由→DTO"往返生成规则（§1）挂到同一目录，schema 变更自动重生成 |
| engine 324 | 模块单测（config/bus/store/run-loop/pipeline/permission/projector…）+ 集成（mcp 真实子进程 e2e、subagent 全链路、skills e2e、scripted-llm 闭环） | 归属正确，不动。mcp/subagent/skills 三组 e2e 是集成层样板，7.x 新模块（secrets/memory/hooks/automation）照此标准各带四路径单测 + 一条集成 |
| server 33 | routes + sse | **一半实为契约测试**（zod 400/404/409 映射）。阶段六起重复部分由契约生成物替代，手写只留 SSE 背压/心跳/bye 帧这类时序断言 |
| web 53 | applyEvent 19 事件逐一（554 行）+ http/mock transport | applyEvent 是**契约消费侧测试**，保留为 reducer 单测；**缺渲染断言**——6.8 引入 Testing Library 后，新增组件测试从"事件→store"升到"事件→渲染 DOM"（ApprovalCard 三键、ToolCard 三态、Composer 三模式优先）；transport 两文件保留 |
| desktop 0 | 无 | 维持零（壳层三件事已由 Linux `--win zip` 实证路径覆盖）；§2 打包 smoke 固化后即为 desktop 的测试层 |

升级顺序（随工单，不单独立项）：6.8 首批组件测试 + E2E → 契约生成物替换 server 重复用例 → 7.11 eval → 8.5 CLI 层 → 9.5 移动端层。

---

# 5. 四端手工走查清单模板（正常 / 审批 / 中断 / 断线重连 四幕 × 四端）

> 每阶段验收时复制本表填写（阶段六起入 PR 描述或验收记录）；web=浏览器、desktop=Electron 安装包、cli=终端、mobile=真机+模拟器。

| 幕 | 步骤 | web | desktop | cli | mobile |
| -- | ---- | --- | ------- | --- | ------ |
| 一 正常 | 建会话→发消息→流式回复→工具调用展开→完成 | ☐ | ☐ | ☐ | ☐ |
| 二 审批 | 触发 bash 审批→挂起→允许一次→再触发→总是允许→第三触发直过→拒绝路径 feedback 回喂 | ☐ | ☐ | ☐ | ☐ |
| 三 中断 | 流式中断 turn→无悬挂事件→状态回 idle→queue 残留转主队列 | ☐ | ☐ | ☐ | ☐ |
| 四 断线 | 杀 server→断线条出现→重启 server→自动重连→续播不丢事件→错误码人话文案 | ☐ | ☐ | ☐ | ☐ |

记录要求：每幕记 端/版本/日期/结果/截图或录屏（mobile 必须录屏归档）；任一幕失败则该端验收不通过，修复后全幕重跑。

---

_本文完（v1.0）。与 doc/02 §8 各阶段验收行互引：6.8（首批 L2/L3/视觉基线）、7.11（eval+nightly）、8.5（L4）、9.5（L5+Maestro）。_
