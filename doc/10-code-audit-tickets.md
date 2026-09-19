# 代码审查整改工单

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| --- | --- | --- | --- |
| v1.2 | 2026-09-19 | AI 编写：ZCode · Union Alpha；发起与拍板：晚风（Wanfeng1028，"这个我需要 dsh 的对话框改造，你把相应的文档改一下"指令） | **§5 DSH 判决更新：整体退回 → 已解禁**——晚风拍板采纳 DSH 对话框改造；规格已按 DESIGN 尾注纪律先行修订（DESIGN v2.19 新增 §13.L + §6/§12.1/§12.4/§12.8 豁免判注；ARCHITECTURE v1.50 新增 D43，D32 不变项按域修订）。WO-052~078 解禁交豆包执行，以 §13.L 过滤范围（排除审批接管/Lexical/TurnRail/StatsPills/英文 shimmer）。 |
| v1.3 | 2026-09-19 | AI 编写：ZCode · Union Alpha（其中 AUD-08/09/12/13/14 由并行子会话执行、本会话复核）；发起与授权：晚风（Wanfeng1028，"所有的该你干的工单要全部完成"指令） | **AUD-01~AUD-14 全量实施完毕并推送**（本机零验证，以 CI 裁决）。§2 工单索引状态更新；新增 §10 实施记录（逐单 commit 与实现要点/偏差）。AUD-RT-01 与 docs/audit 的 WO 系列工单留豆包执行；doc/02 v4.56 规格同步（§4.7/§5.3/§5.6.4/§5.8.4/§6.10） |
| v1.4 | 2026-09-19 | AI 编写：ZCode · Union Alpha | **CI 全绿收口（run 35380218227）**。修红链六提交：9d02c57（desktop port 作用域）、121ddbd（测试追加脚本 \n 写成真实换行的字面量断裂）、ba92255（exactOptionalPropertyTypes 三处）、86eb37b（ErrorBoundary children/测试 as const）、55b587c（**补回 AUD-10 静默丢失的 tailTorn 捕获行**——前批 python 替换未命中且无断言，功能链路曾断裂；另 lint 四处）、878594e+e7790fd+8d62308（tsx 后缀/断言过严/bash 上限按剩余空间切片）。教训：脚本化批量编辑必须逐处断言命中 |
| v1.5 | 2026-09-19 | AI 编写：ZCode · Union Alpha；发起与分工确认：晚风（Wanfeng1028，"写代码的你来，豆包负责真机测试"） | **DSH 对话框改造实施完毕（d59a541）+ WO 系列余项清账（3ef5f27/8030b8d/880df0d）**。① §5 解禁的 19 项全部落地（DESIGN §13.L：token/22px 卡/34px 蓝钮/14px 字号/sweep/气泡/操作行/33px 行/间距/附件皮肤/文件卡/窄屏最小适配）；WO-073 不实施（web 无分页通道属功能新增，登记）。② WO 系列属实单新增落地：019/020/025/027/040/044/050（engine/server/cli/desktop 卫生批）、038/039（miniapp）、010 实修（SessionPage 错误态禁用 Composer）、001/002/003/012/013/014/016/017/018/031/047/048（official 批，og-image 由零依赖 node 脚本生成 1200×630 PNG）。③ 不实施登记：WO-015（AGENTS §2.10 删除保护须人类五层级确认）、WO-030（维持 @fontsource 的工程判断）、WO-033（P3，无量测不盲拆）、WO-036（v1 口径维持）、WO-042/049（D24 设计/桌面密度不适用）、WO-026（无规格依据的速率限制，需立项）。至此 33 个属实单中除上述登记项外全部闭环；AUD-RT-01 现场走查留豆包 |
| v1.6 | 2026-09-19 | AI 编写：ZCode · Union Alpha | **DSH+WO 全批 CI 全绿收口（CI run 2a13736 + Official 296668d 双绿）**。实施提交：d59a541（DSH 19 项）、3ef5f27（WO 卫生批 019/020/025/027/040/044/050）、8030b8d（038/039/010）、880df0d（official 批 001/002/003/012/013/014/016/017/018/031/047/048）。修红链八提交（2408cbf/296668d/6cfb892/2a13736 等）：sitemap 误用 LINKS 对象、MessageItem model 解构、build.mjs 改 node:path+正则（JSON.parse any 在 typed lint 对 .mjs 生效且 JSDoc 注解不豁免）、robots/sitemap force-static（output:export）、**waiting 态 Composer 整卡 pointer-events 穿透**（e2e reject 场景 disabled textarea 对流程尾部审批按钮的 hit-test 干扰——等待中唯一交互焦点是审批卡，穿透语义正确）、miniapp 测试桩补 getAppBaseInfo。配合分工：真机走查 AUD-RT-01 留豆包 |
| v1.1 | 2026-09-18 | AI 编写：ZCode · Union Alpha；发起：晚风（Wanfeng1028，"核验豆包审查报告+评估工单+补充发现+真机工单交豆包"指令） | 新增 §4 外部审查报告（docs/audit/，78 工单）逐条核验结论（40 条技术单：33 属实/6 部分属实/3 不属实）；§5 DSH 对话框改造 27 项判决退回（与 DESIGN.md 视觉宪法冲突清单）；§8 新增 AUD-02~AUD-14 工单（引擎资源/投影竞态/生命周期批）；§9 新增 AUD-RT-01 现场走查工单（交豆包执行）。仅文档，未改源码。 |
| v1.0 | 2026-09-18 | AI 编写：ZCode · Union Alpha；发起：晚风（Wanfeng1028） | 登记 AUD-01：审批事件持久化失败仍放行的静态审查证据、修复方案、执行计划与验收条件。仅创建工单，未修改源码或执行验证。 |

## 1. 范围与状态

本文登记本轮代码审查的整改工单，不代表全仓审查完成或其他模块已通过验收。工单依据本地源码静态阅读，不将静态推演写成动态复现结果。

本次授权仅为编制工单：不修改业务代码，不运行测试、类型检查、lint、构建或文档检查器，不下载、安装、联网、提交或推送，也不触发 CI。下文执行步骤和回归场景均是后续工作，不是已完成事项。

规则依据：[AGENTS.md](../AGENTS.md) §2、[ARCHITECTURE.md](../ARCHITECTURE.md) §3 与 D7；相关实现规格：[开发方案](./02-development-plan.md) §5.6.2、§5.7。

## 2. 工单索引

| 编号 | 优先级 | 标题 | 状态 |
| --- | --- | --- | --- |
| AUD-01 | P1 | 审批事件持久化失败时禁止释放工具执行许可 | 已实施（63368eb）；待 CI 验证 |
| AUD-02 | P1 | bash 工具输出执行期限界与 UTF-8 边界解码 | 已实施（d29bc47）；待 CI 验证 |
| AUD-03 | P1 | 用户文件工具与 checkpoint 原子写对齐 | 已实施（453cf03）；待 CI 验证 |
| AUD-04 | P1 | resolveInRoot 符号链接硬边界硬化 | 已实施（3590aac）；待 CI 验证 |
| AUD-05 | P1 | Projector 附件投影缓存 | 已实施（ca93408）；待 CI 验证 |
| AUD-06 | P1 | LLM 错误文案进事件流的脱敏兜底 | 已实施（58ad111）；待 CI 验证 |
| AUD-07 | P1 | run-loop 三缺陷收敛（length 续步/收尾清理/吞错卫生） | 已实施（6d534dd）；待 CI 验证 |
| AUD-08 | P1 | 客户端回放代际与竞态防覆盖（web 全量回放） | 已实施（979b5d1）；待 CI 验证 |
| AUD-09 | P1 | 会话页共享 controller 的 disposed 闸门 | 已实施（b42cdf9）；待 CI 验证 |
| AUD-10 | P1 | 会话文件坏尾行恢复策略（拒绝带病续写） | 已实施（eb5057d）；待 CI 验证 |
| AUD-11 | P2 | EventBus 背压 durable 丢弃与 ProgressGate drain 污染 | 已实施（d29bc47）；待 CI 验证 |
| AUD-12 | P1 | 桌面壳首启无配置秒退（E_CONFIG 无引导） | 已实施（1cb3fae）；待 CI 验证 |
| AUD-13 | P2 | web 渲染韧性与资源生命周期批（ErrorBoundary/麦克风/剪贴板定时器） | 已实施（50e1ee9）；待 CI 验证 |
| AUD-14 | P2 | 查询与补全竞态批（useTransportQuery 三态/Composer listFs/inprocess dispose） | 已实施（06858f5）；待 CI 验证 |
| AUD-RT-01 | P1 | 真机与真实环境现场走查（交豆包执行） | 待人类安排环境 |

## 3. AUD-01：审批事件持久化失败时禁止释放工具执行许可

### 3.1 基本信息

- **类型**：正确性 / 审批安全 / 持久化一致性。
- **优先级**：P1，优先于一般重构与样式整改。
- **影响范围**：经过 PermissionService 挂起审批、批准后由工具管线继续执行的调用。
- **证据等级**：源码调用链明确；未进行故障注入或动态复现。
- **前置依赖**：无需新增依赖、事件类型或 API；源码实施需另行授权。
- **完成定义**：修复、回归用例及验证记录齐备后才能关闭；仅写完工单不算修复完成。

### 3.2 问题与源码证据

主位置：[permission/service.ts](../packages/engine/src/permission/service.ts)，审查时第 253–288 行，`PermissionServiceImpl.settle()`。

1. 第 261–265 行先将 entry 标为 settled，清理定时器和 abort listener，并从 pending 集合移除。
2. 第 268–273 行记录决策。
3. 第 275–279 行等待 `bus.emit(..., 'permission.resolved', ...)`。
4. 第 286–287 行在 `finally` 中无条件执行 `entry.resolve(allowed)`。

消费位置：[tools/pipeline.ts](../packages/engine/src/tools/pipeline.ts)，审查时第 250–278 行：管线获得允许结果后进入工具执行。

写入保证：[bus.ts](../packages/engine/src/bus.ts)，审查时第 235–239 行：先等待 sink.append，成功后才推进 seq 并广播；append 失败时 emit 拒绝。

因此，当用户批准使 `allowed=true`，但 `permission.resolved` 写入失败时，`finally` 仍把 true 返回给工具侧等待方。审批调用方收到的异常不会撤销已释放的工具执行许可。

行号仅作本次审查定位，后续修改以方法名及实际调用链为准。

### 3.3 触发条件与影响

**触发条件**：一项挂起审批收到允许答复，但其 resolved 事件写入失败，例如底层文件追加返回 I/O 错误。

**可能结果**：审批接口报告失败，会话 JSONL 没有对应的批准事件，工具却继续执行。实际执行与可回放的批准事实不一致，并违反异常拒绝的既有约束。

本缺陷不是“未经过用户批准就自动执行”；它发生在批准后的持久化失败窗口。问题也不应靠关闭错误提示或吞掉异常处理。

### 3.4 修复方案

**建议采用权限服务内部的最小修复，不拆分 Engine，不新增审批框架。**

1. 将等待方最终结果初始化为拒绝；只有批准事件持久化成功，且该结算路径没有发生应拒绝的异常，才允许返回 true。
2. 所有异常路径仍必须结清等待方，不能将现有“错误放行”改成“永久等待”。保留 pending、定时器和 abort listener 的清理。
3. 区分审批事件写入与 `onResolved` 通知的职责和异常来源。核对通知的真实实现，明确其失败策略；不得用一个无条件允许的 finally 混合处理。实现默认遵守既有异常拒绝约束，不自行引入异常放行特例。
4. 核对 `recordDecision` 的记录时机与语义：用户提交批准意图和系统成功释放执行许可不是同一事实，不得让审计记录误报执行许可已成功结算。
5. 核对 `always` 路径的规则写入顺序：明确当前审批失败时已写入规则如何处理，以及后续调用是否受到影响。该项是实施检查点，本工单不将尚未复核的规则行为直接认定为第二个缺陷。
6. 持久化失败应继续向调用方报告，不伪造成功的 resolved 事件，不通过直接写 JSONL 绕过 EventBus/SessionStore。

**范围边界**：生产修改优先限定在权限服务及确有必要的调用点；不修改协议形状、前端审批交互、权限层级或正常 once/always/reject 语义。若确需扩大范围，先补充工单理由。

### 3.5 执行计划

| 顺序 | 工作项 | 产出与退出条件 |
| --- | --- | --- |
| 1 | 核对 settle 的全部调用方及审计、通知、always 规则写入顺序 | 明确成功、写入失败、通知失败及并发结算的结果表；不把旁路异常当作写入成功证明 |
| 2 | 修改权限结算实现 | 失败路径拒绝且结束等待；成功路径保留正常许可语义；不吞持久化异常 |
| 3 | 补权限服务回归用例 | 使用现有测试设施注入失败，覆盖下表场景；不依赖真实磁盘故障或新增包 |
| 4 | 补工具管线联动用例 | 模拟批准事件写入失败，断言工具 execute 未调用，等待链能够结束 |
| 5 | 更新工单实施记录 | 记录实际改动文件、异常策略、用例位置与尚未验证事项；本地不运行验证 |
| 6 | 在允许联网验证后完成远端验收 | 由远端 CI 执行相关质量门；保留真实结果。当前禁止推送和触发，不以静态阅读代替测试通过 |

建议作为一个独立修复单元实施，不夹带其他审查发现或无关重构。

### 3.6 回归场景与验收条件

以下均为待实施、待验证项。

| 场景 | 验收要求 |
| --- | --- |
| 正常允许一次 | resolved 成功持久化后才释放许可；工具仅执行一次 |
| 允许一次，但 resolved 写入失败 | 工具侧结果为拒绝；execute 调用次数为零；审批调用方获得错误 |
| 正常总是允许 | 正常规则行为不退化；当前调用的许可仍受本次结算约束 |
| 总是允许，但结算失败 | 当前工具不执行；规则写入副作用有明确处理和断言，不能含糊遗漏 |
| 主动拒绝 | 工具不执行；pending 与监听资源释放 |
| 超时、中断、级联拒绝、模式变更、shutdown | 各入口保持拒绝语义；即使事件写入失败，也不残留等待中的审批 Promise |
| 重复答复或答复与中断竞争 | 同一 entry 只结算一次；不重复执行工具、不重复释放资源 |
| onResolved 通知异常 | 与持久化失败分开覆盖；遵守明确的异常拒绝策略，等待方不会悬空 |
| 审计记录 | 能区分批准意图与实际结算失败；不得以成功记录掩盖未持久化的批准 |

关闭检查清单：

- [ ] 权限服务修复完成，持久化失败不返回允许。
- [ ] 工具管线联动用例覆盖 execute 零调用断言。
- [ ] 所有结算入口在异常下均能结束等待并释放资源。
- [ ] always 规则副作用与通知异常策略已记录并覆盖。
- [ ] 未新增协议事件、依赖或绕过 SessionStore 的写盘路径。
- [ ] 工单补齐实际实现记录及远端验证结果；未验证前保持未关闭。

### 3.7 当前执行记录

2026-09-18：完成工单编制。未修改源码、未编写或运行回归用例、未安装或下载、未联网、未提交推送。AUD-01 状态维持“待实施、待验证”。

2026-09-19：**已实施**（commit 63368eb）——settle 允许结果改为 resolved 落盘成功后生效，等待方在写盘失败时一律 deny、异常上抛 reply 调用方；审计与 metrics 移到落盘成功后记生效结果；always 规则固化先于结算的顺序已核对并注释（固化意图是持久事实，当前调用 deny 不回滚）。回归 3 例；验证交远端 CI。

## 4. 外部审查报告核验结论（docs/audit/，2026-09-18）

`docs/audit/` 下共 14 份报告（68 问题 + 78 工单 + 185 截图），由外部 agent 在 Linux 云 VM 完成真实安装/构建/点击测试。本仓对其 **40 条技术类工单逐条做了源码级核验**（两个只读子代理 + 人工复核），结论如下。点击测试的 44 项功能用例（37 过 / 5 失败 / 2 观察）与构建结论（全绿、~1121 测试 99.9% 通过）可信，不重复验证。

### 4.1 核验统计

| 裁决 | 数量 | 工单 |
| --- | --- | --- |
| 属实 | 33 | WO-001/002/003/004/005/006/008/009/012/013/014/015/016/017/018/019/020/021/022/024/028/029/030/031/033/035/036/038/039/040/044/047/048 |
| 部分属实（方向对，定性/机制有出入） | 6 | WO-007（drain 永久 rejected 影响面更宽，但触发前提几乎不可达）、WO-010（审批卡不是“被遮挡”而是错误态下整块不渲染，真实缺陷是错误态下发送会驱动无关脚本会话）、WO-023（防御性瑕疵，当前 reject 源只有 E_QUEUE_CLOSED）、WO-025（加固欠账而非可利用漏洞——Electron 44 缺省即安全）、WO-027（代码卫生，无实际泄漏）、WO-047（1.5s 而非 1s） |
| 不属实 | 3 | WO-037（es6/enhance/postcss=false 是 Taro 标准形态，转译由 Taro 构建链完成）、WO-045（SlashMenu 开启条件不含 running 状态，流式期间照样弹且 `/` 开头文本走命令分派不会被当普通消息）、WO-046（ThemeToggle aria-label 每渲染同步推导，无失步状态） |
| 前提失真 | 1 | WO-032（official/ 根本不存在 package-lock.json，"npm audit 报 2 漏洞"不可复现） |

### 4.2 工单合理性判决

1. **技术类 WO-001~051 基本采纳**，转入执行池时按本节修正：优先级校正——官网 SEO 三件套（WO-001/002/012/013）对未发布站点不是"阻断级"，改 **P1（发布前必须）**，且 WO-001 需要真实域名才能修（待晚风提供）；WO-033 chunk 分割降 P3；WO-042 SSE token 走 URL 是 **ADR D24 拍板的双口径设计**，降 P3 观察项；WO-049 44px 触摸目标不适用（web 是桌面应用，DESIGN §3 列表 32px 行高是刻意密度规格）。
2. **WO-043（web 响应式 P0）改判不做**：DESIGN.md §2 明文"不做移动端、不做响应式断点（这是桌面应用）"，移动端由 apps/mobile + apps/miniapp 承载；mobile web（dev:web）只是调试形态。同因驳回 final-ux 报告的 P0-1。
3. **WO-011 与 WO-034 重复**（同一问题两张单），合并执行。
4. **WO-015（官网死代码删除）执行方式受限**：死代码属实，但按 AGENTS §2.10 文件删除保护，任何删除须人类发起并走五层级确认——执行会话不得直接 `git rm`。
5. **WO-036（小程序 token 明文）维持既有登记口径**：`config-store.ts` 头注已声明"小程序无系统密钥链……v1 口径；正式分发记 v2 时重估"。属实但非新缺陷，随 v2 重估。
6. **DSH 对话框改造 WO-052~078（27 项）整体退回**，见 §5。
7. **报告引用路径勘误**：报告内 `_audit/` 实际为 `docs/audit/`；截图根目录同。

### 4.3 核验中发现的报告外问题（已并入 §8 工单）

- bash.ts 按 chunk 独立 `toString('utf8')`，多字节字符跨块被切断成 U+FFFD（长中文输出可复现）——并入 AUD-02。
- checkpoint.ts 两处非原子写：快照索引（:194）与**回滚覆写会话 JSONL**（:156，崩溃可损坏会话主文件）——并入 AUD-03。
- ProgressGate 的 drain Promise 一旦 reject 永久保持 rejected，同 gate 后续所有 close 复现抛错——并入 AUD-11。
- useCopy 三端 1.5s 定时器除无清理外，连续复制时前次定时器会提前复位"已复制"态——并入 AUD-13。
- `session-page.ts:265` 注释声称"登记为 v2 候选（工单 W12-FOLLOW）"，但 doc/08 §6 后置池与 doc/02 均无该条目——登记漂移，补登时随 AUD-08 批处理。

## 5. DSH 对话框改造工单（WO-052~078）判决：已解禁（2026-09-19 晚风拍板）

> **状态更新（v1.2）**：晚风拍板采纳 DSH 对话框改造，本节 v1.1 的"整体退回"判决就此**解除**。退回理由（与 DESIGN.md 视觉宪法冲突）依然成立，处置按 DESIGN 尾注纪律走"先改规格再写代码"：规格已先行修订——**DESIGN v2.19 新增 §13.L**（web 对话框 DSH 形态对齐，规格唯一来源）并同步修订 §6（sweep 豁免）/§12.1（点睛色豁免）/§12.4+§12.8（22px/14px 档位判注）/§13.B/§13.E/§13.H（域内取代标注）；**ARCHITECTURE v1.50 新增 D43**（D32 不变项按域修订清单）。
>
> **执行口径（交豆包）**：WO-052~078 按 §13.L 过滤后执行——在册项 WO-052/053/054/055/056/058/059/060/061/062/064/066/068/069/073/075/076/077/078；WO-057（环形 ContextMeter）记 Phase 3 可选；**明确不做**：WO-063（英文 shimmer——保留中文状态行）、WO-065（审批接管）、WO-067（Lexical）、WO-070（TurnRail）、WO-071/072（StatsPills/TurnUsagePanel）。数值与验收以 DESIGN §13.L 为准，本节以下历史冲突表保留作决策依据。

以下为 v1.1 历史记录（退回理由，现已被规格修订合法化）：

该组 27 项以 DeepSeek Harness（DSH）实测形态为目标改造 web 对话框，**整体与本仓视觉宪法冲突**，未经 DESIGN.md 修订前一律不得执行（DESIGN.md 尾注：突破规则先改本文再写代码；AGENTS §2.6/§2.11）。逐项冲突：

| 工单 | 冲突 |
| --- | --- |
| WO-052/058（22px 圆角 + 阴影 + 去边框；气泡 22px/70.2%） | 违反 DESIGN §13.B 圆角档位封闭集（五档：胶囊/8/12/16/18，之外一律违规，ADR D32）与"分隔优先边框与留白、不用阴影"；推翻 §13.H 晚风拍板（user 气泡 radius 18 + 右下 4px 收角 + 最大宽 80% + YOU 标签保留） |
| WO-055（发送钮改 DSH 蓝 #3964FE） | 违反 §12.1 P0"Tailwind 默认蓝"黑名单 + 单一 accent + `--primary` 语义 |
| WO-061/062/063（sweep 扫光 / shimmer 渐变 / "Deep diving" 英文 shimmer） | 违反 §6 动效规范（只允许 120-160ms opacity/transform 微动效）与 §12.1 渐变禁令；英文文案违反 §12.7 文案语言一致性 |
| WO-054（6 行→14 行） | 推翻 §13.E 实测定稿（6 行上限后内部滚动） |
| WO-078（13px→14px） | 违反 13px 密度体系（§3 / D32 不变项全清单） |
| WO-065（审批接管输入框） | 推翻 §8 ApprovalCard 规格（消息流内嵌卡片是明文规格）；属交互模式变更非样式对齐 |
| WO-067（引入 Lexical contenteditable） | 违反 ARCHITECTURE §9.1 过度设计（为 @ 芯片内嵌引入 3 天工的重依赖）；@ 补全已有成熟形态 |
| WO-056/057/060/064/066/068~077（布局重排/环形 ContextMeter/TurnRail/StatsPills 等） | 均为"以 DSH 为审美权威"的新功能/重排，无本仓规格依据 |

处置：该组不做逐条工单；若晚风确有意向对齐 DSH 观感，正确路径是先立 **DESIGN.md 规格修订提案**（列明推翻 §12/§13 哪些条款、新档位表、黑名单 grep 词调整），拍板后再生成实现工单。在现行规格下执行会话会与黑名单 grep 自查互相打架（D32 立项时同款教训）。

## 6. 前一份审计（.qoder/specs/审计工单清单）复核

W1~W19 共 19 张工单现状：**W1（doc/02 版本表 v3.93~v4.55 补录）、W2（§8 阶段十二~十八工单表）、W3（尾部结语）、W4（计数漂移全修，代码注释同步）、W5（doc/02 去数字化；ADR 历史行按 Q3 保留）、W6（settings-pages 20 页）、W7（质量闸注释补齐）、W8（workspace 计数已改写实数 15）、W9（检查器扩展锚点已落）、W11（nightly.yml performance job 已存在）、W13（apply-event WeakMap 索引已落）、W14（ArenaCard 条件轮询已落）、W17（§8.7 标题）、W18（mobile/miniapp turn 头与诊断卡已落）均已修复**。余项：W10（版本引用存在性校验）未实施——W1 修复后悬空引用已不存在，可作低优先级防复发项；W12（loadOlder O(n²)）未修，但 `session-page.ts:265` 已注明瓶颈与修法前提（applyEvent 需 prefix-merge 语义），**登记指针漂移**（doc/08 无 W12-FOLLOW 条目）；W15（两张 D28 重号）、W16（G1/G7 收口）留人类决策，合理。

## 7. 与本仓既有工单的重叠说明

AUD-01（§3）为本轮独立发现，与豆包报告零重叠（其报告未覆盖权限结算路径）。§8 新工单中 AUD-02~AUD-06、AUD-12 与豆包 WO-004/005/006/021/022/035 同源——本仓工单为其**核验后的扩展版**（并入报告外发现），执行时以本文为准；豆包其余属实工单（web/official/miniapp/cli 卫生类）按其工单原文执行即可，不在本文重复。

## 8. 新增工单（AUD-02~AUD-14）

> 均为源码级已确认、本机零验证交付；执行时走 AGENTS §7 节奏（改码+单测 → 文档版本表 → commit+push → CI 裁决）。行号为 2026-09-18 快照，以符号定位为准。

### AUD-02 P1 bash 工具输出执行期限界与 UTF-8 边界解码

- **证据**：`packages/engine/src/tools/builtin/bash.ts:172-181` chunks 无上限 push、`:217` close 时 join 全量字符串；限界在 `tools/pipeline.ts:295` 于 execute **返回后**才生效（`output-store.ts:16-24`，缺省 32KB）——`cat 1GB.log` 执行期间整段驻留内存。另 `bash.ts:174` 逐 chunk `toString('utf8')`，多字节字符跨块切断即 U+FFFD。
- **修复思路**：① 累计字节超 `toolOutputLimitKB` 上限（或其数倍缓冲）即停止收集、落临时文件或丢弃中段并标记截断，执行期生效；② 用 `string_decoder`（`node:string_decoder`）跨块增量解码。
- **验收**：大输出命令内存峰值有界；截断语义与现行一致；中文长输出无乱码；abort/timeout 路径同约束；单测覆盖块边界拆字。

### AUD-03 P1 用户文件工具与 checkpoint 原子写对齐

- **证据**：`tools/builtin/edit.ts:92`、`write.ts:33` 直接 `writeFile`；`fsutil.ts:9-19` 已有 `atomicWriteFile`（tmp+rename，8 处在用）。同族：`checkpoint.ts:156` 回滚**覆写会话 JSONL**、`:194` 快照索引写均为非原子——回滚中途崩溃损坏会话主文件。
- **修复思路**：四处统一改 `atomicWriteFile`；回滚路径评估"写 tmp → 校验 → rename"外是否需预备份（已有 checkpoints 快照兜底，说明取舍）。
- **验收**：崩溃注入下主文件恒完整；既有 round-trip 用例全绿。

### AUD-04 P1 resolveInRoot 符号链接硬边界硬化

- **证据**：`tools/definition.ts:77-85` 仅词法 resolve/relative 判定；`read.ts:35-45` 随后 stat/readFile 跟随 symlink——工作区内指向根外的符号链接可越界读/写。对照 `extensions/loader.ts:28-35` 已有 realpath 逃逸检查判例。
- **修复思路**：解析目标 `fs.realpath` 后再 relative 判定（read/grep/lsp 只读面与 write/edit 写面同闸）；注意性能（可按调用点缓存 realpath）与 Windows 大小写归一既有行为兼容。
- **验收**：`ln -s` 指向仓外后 read/grep/lsp/write/edit 全部 E_PATH_OUTSIDE；单测覆盖 symlink 进/出两向。

### AUD-05 P1 Projector 附件投影缓存

- **证据**：`projector.ts:150-156` 每次 `modelContext()`（每 step 一次）对每条 user.message 附件重读盘+base64；注入实现 `engine.ts:1705-1714` 裸 `readFileSync` 无缓存。40 步 turn 单图重复处理 40 次。
- **修复思路**：ProjectorImpl 按附件文件名+mtime（或事件 id）做 Map 缓存；附件覆盖写时失效。
- **验收**：多图长 turn 投影 IO 不随步数线性增长；内容变更后投影更新正确。

### AUD-06 P1 LLM 错误文案进事件流的脱敏兜底

- **证据**：`pi-gateway.ts:386` 将 provider 错误原文拼进 error 文案，`run-loop.ts:306-310` 逐字 emit 进 durable `error` 事件；脱敏单一来源 `observability/redaction.ts` 消费方仅 logger/audit/guard 三处，**事件发射路径不在覆盖内**。provider 错误体若回显 Authorization 头，密钥明文落盘+广播。
- **修复思路**：error 事件 emit 前过同一 redaction 管道（run-loop 单点），不动 provider 适配层。
- **验收**：构造含 `Authorization: Bearer sk-…` 的假 provider 错误，落盘事件与 SSE 帧均脱敏；非敏感错误文案不变形。

### AUD-07 P1 run-loop 三缺陷收敛

- **证据**：① `run-loop.ts:343-373` `stopReason==='length'` 无条件 `continue` 续采样，步数上限检查（`:382-385`）对该路径不可达——模型连续 length 截断可无限烧 token（无需 toolCall，纯文本 length 也中招）；② `run-loop.ts:400-421` finally 中 `turn.completed`→checkpoint.snapshot→store.flush 任一抛错跳过 `rt.endTurn()`（`:420`），会话永久卡 running（后续输入全被判 steer 滞留或 E_RUNTIME_TURN_ACTIVE）；③ `run-loop.ts:172-175` takeInput 裸 catch 吞错（当前 reject 源唯一，卫生化即可）。
- **修复思路**：① 步数预算检查移到所有续采样必经位，length 达预算以 `finish='length'` 收尾（保留 E_TRUNCATED 配对回喂）；② 运行态释放（endTurn）放入独立的、无条件执行的外层 finally；③ catch 收窄为 E_QUEUE_CLOSED 判别，其余上抛。
- **验收**：连续 length 场景在 maxStepsPerTurn 收口；收尾 fsync/checkpoint 失败注入后 turn 状态机正确复位、会话可继续输入；三条路径各有单测。

### AUD-08 P1 客户端回放代际与竞态防覆盖（web 全量回放）

- **证据**：`apps/web/src/transports/context.tsx:18-30` GET 返回后无条件 `resetSlice`+全量 apply；等待 GET 期间全局 SSE 直播事件（经 `:80-93` rAF）已写入 store，旧快照到达即抹掉已收更新——`turn.completed` 可回退成"运行中"且全局流不重发不补。多处回放乱序返回同病。协议层 `session-stream-core.ts` 重连 onResync 与直播并发同构。
- **修复思路**：per-sid 回放代际 + 回放期间直播事件缓冲，快照提交后按序补放；旧代请求一律丢弃提交；注意合法 rollback 水位下降路径需独立代际，不得用"水位低即丢弃"一刀切。顺带补登 `session-page.ts:265` 声称的 W12-FOLLOW 后置池条目。
- **验收**：回放与直播并发时序用例（快照 N、直播 N+1、乱序返回）无状态回退；rollback 回放正常。

### AUD-09 P1 会话页共享 controller 的 disposed 闸门

- **证据**：`packages/protocol/src/session-page.ts:156-176` emit/setNotice 无 disposed 检查；`:227-236` dispose 后 flush 仍回调；`:239-320` loadOlder/send/stop/reply 的 await 之后继续 emit/setNotice（可重建 notice 定时器）。消费端 `apps/mobile/src/screens/SessionScreen.tsx:110-130` 与 `apps/miniapp/src/pages/session/index.tsx:115-140` 在 sid/连接变化时销毁旧 controller——旧会话在途请求完成后把**旧会话整片快照**写进新页面的 `setSnap`，显示与操作目标（controllerRef）分裂。
- **修复思路**：修在 protocol 单源（一次覆盖两端，AGENTS §1.1 纪律）：emit/批处理/notice 入口统一 disposed/代际闸门，所有 await 后校验；dispose 后禁止新建定时器。
- **验收**：会话 A 在途操作跨越切换到 B 的时序用例，B 快照不被 A 污染；notice 不复活。

### AUD-10 P1 会话文件坏尾行恢复策略（拒绝带病续写）

- **证据**：`packages/engine/src/session/store.ts:146-158` resume 直接 `open(path,'a')` 追加；`:161-217` read 对尾行坏 JSON 仅 break 丢弃（内存），磁盘不修——恢复后追加的合法行接在坏尾后：坏尾带换行则其变非尾行（下次读 E_SESSION_BAD_LINE），不带换行则新事件直接拼在残缺 JSON 后。内存树与磁盘自此分叉，崩溃残留升级为持续损坏。
- **修复思路**：read 返回最后有效字节边界；resume 写前受控修复（备份后截断到有效边界、补换行、sync），不可安全修复则拒绝可写恢复（fail-closed，同 D12 纪律）。
- **验收**：坏尾（带/不带换行）→ resume → 追加 → 重读全绿的用例；修复动作落审计日志。

### AUD-11 P2 EventBus 背压丢弃策略与 ProgressGate drain 污染

- **证据**：① `packages/engine/src/bus.ts:289-292` 订阅者缓冲溢出 shift 丢最老项**不区分 durable/live**——慢 SSE 客户端丢 durable 后靠更高 seq 推进水位，缺口永久无法自动补齐（`session-stream-core.ts:187-189` 无缺口检测）；② `tools/pipeline.ts:114` drain Promise 一旦 reject 永久保持 rejected，同 gate 后续 close 全部复现抛错（WO-007 扩展面）。
- **修复思路**：① 溢出时优先淘汰 live-only（三类 delta/progress），durable 满则断开该订阅者连接（客户端以水位重连续播），服务端 `apps/server/src/sse.ts` 回放侧相应尊重背压；② drain 恢复路径（catch 后重置为 resolved 或重建链）。
- **验收**：慢消费者注入用例：durable 零丢失或连接显式断开；gate 单次故障不影响后续工具调用。

### AUD-12 P1 桌面壳首启无配置秒退（E_CONFIG 无引导）

- **证据**：`config.ts:273-275` models.json 缺失抛 ConfigError；`apps/server/src/index.ts:26` 顶层 loadConfig 在 try/catch 之外→进程退出；`apps/desktop/src/main.ts:100-103/146-150` sidecar 退出→壳静默 quit。web onboarding（12.8）依赖 server 在线——server 起不来则引导不可达，全新用户首启即秒退。
- **修复思路**：sidecar 早退时壳渲染"先配模型"引导页（含日志路径与文档链接）；或 server 对"配置缺失"降级为受限启动（仅暴露 onboarding 所需最小端点）。二选一需晚风拍板（后者动 server 生命周期语义）。
- **验收**：清空 ~/.spark 后桌面首启可见引导而非秒退；配置完成后全功能恢复。

### AUD-13 P2 web 渲染韧性与资源生命周期批

- **证据**：① 全 web 无 ErrorBoundary（grep 零命中，`main.tsx:8-14` 裸渲染树）——单条畸形投影白屏整树（WO-008）；② `useVoiceInput.ts` cleanup 仅挂 recorder.onstop，卸载不释放麦克风流（WO-009）；③ `useCopy.ts:13` 定时器无清理且连发时前次定时器提前复位态（三端同型：mobile/miniapp session-items）。
- **修复思路**：App 级 ErrorBoundary（崩溃兜底+重载）+ ChatView 行级边界；useVoiceInput 增 useEffect 卸载 cleanup；useCopy 换 useRef 计时器+清理+重入复位。
- **验收**：坏 item 不拖垮整页；录音中切路由麦克风灯灭；连点复制显示态正确。

### AUD-14 P2 查询与补全竞态批

- **证据**：① `useTransportQuery.ts` 自动查询成功不清旧 error（`AuditSettingsPage` 优先渲染 error——一次失败后永久停留）、refresh 无 cancelled 护栏、deps 变化不清旧 data（`SessionPage.tsx:83-89` 权限档位跨会话串台，且 preset 加载失败被吞致旧值无限期保留——WO-028 的加重形态）；② `Composer.tsx:248-261` @ 补全 listFs 无请求代际，慢响应覆盖新结果（WO-029）；③ `packages/sdk/src/inprocess.ts:197-216,396-399,505-510` extensions/arena/listLspServers/transcribe 绕过 disposed 闸门与 `sync`（对照 HTTP 通道统一检查——D31 parity 缺口）。
- **修复思路**：useTransportQuery 收敛单一代际执行入口（成功清错、依赖变化清态/显式 refreshing、卸载全失效）；Composer 加代际号；inprocess 全方法过 assertNotDisposed/sync。
- **验收**：三态恢复与并发刷新用例；补全乱序返回用例；inprocess dispose 后调用统一 E_DISPOSED 类错误（契约套件补 dispose 后拒绝组）。

## 9. AUD-RT-01 现场走查工单（交豆包执行）

> 性质：需要真实设备/真实密钥/真实外部系统的走查清单，CI 与静态审查均无法替代。执行环境由晚风安排；结果以追加记录回填本文（含截图/日志路径），发现问题立新 AUD 单。

| # | 走查项 | 环境 | 步骤要点 | 通过标准 |
| --- | --- | --- | --- | --- |
| 1 | 移动端真机四场景（Expo 真机/模拟器） | Android/iOS 真机 + 桌面 server 非环回 | 配对扫码→会话流式→审批操作→断线重连（飞行开关） | 配对成功；投影与桌面端一致；重连后续播无缺口 |
| 2 | 小程序开发者工具走查 | 微信开发者工具 + 局域网 IP（勾选不校验合法域名） | 同上四场景 + 分块 SSE 解帧长会话 | 无花屏/乱码；后台切前台恢复续播 |
| 3 | Electron 首启引导（AUD-12 修复后回归） | 全新用户目录（临时 HOME） | 安装/启动→引导→配模型→建会话 | 无秒退；引导闭环 |
| 4 | 真实模型端到端 | 配真实 API key（DEEPSEEK 或其他） | e2e 冒烟三场景（`examples/e2e-smoke.sh`：闭环/断线重连/kill -9 resume）+ /goal 小目标 2-3 轮 + /arena 双模型竞答 | 三场景通过；goal 达成或护栏暂停；arena 快照与胜者应用正常 |
| 5 | 语音真实链路 | 有 SoX 的机器 + 转写端点 | /voice 录音→转写回填→发送 | 转写文本正确；音频无残留文件 |
| 6 | LSP 真实 server | CI 已装 typescript-language-server；本机可选 pyright | /lsp 诊断→lsp 工具 12 操作抽测 | 诊断与 IDE 一致；配置变更后连接重建 |
| 7 | MCP 外配实调 | Claude Code 或其他 MCP 宿主 | `spark mcp` 接入外部 agent 完成一次真实任务 | 审计流归因正确；审批 fail-closed 生效 |
| 8 | 代理实流验证 | mitm 代理 | models.json provider.proxy 指向代理跑真实请求 | 流量经代理；无 proxy 时直连零变化 |
| 9 | 发布冒烟 | npm 全新环境 | `npm i -g @spark/cli && spark --version`（CI release.yml 已自动；本项为人工复核版本号非"未知版本"——关联 AUD-13 同源问题 WO-050） | 版本号正确显示 |

执行纪律：走查只读产品行为，不修复；本机规则（禁下载/零验证）对执行 agent 同样适用，外部工具一律 CI 预装或由晚风现场提供。

## 10. 实施记录（2026-09-19，全批本机零验证，以远端 CI 裁决）

| 工单 | commit | 要点与偏差 |
| --- | --- | --- |
| AUD-01 | 63368eb | settle 允许结果改为 emit 成功后生效；审计/metrics 记生效结果；回归 3 例（once/reject 落盘失败 + 正常回归） |
| AUD-02 | d29bc47 | 收集上限 = outputLimitBytes×4（经 ToolContext 注入，engine 接线）；StringDecoder 跨块解码；截断标记；已截断时跳过 end() 冲刷；用例 2 例 |
| AUD-03 | 453cf03 | edit/write/checkpoint 回滚与索引共四处改 atomicWriteFile（序列化形状逐字节一致）；atomicWriteFile 放宽接受 Uint8Array；OS 拒绝错误映射保留；用例 2 例 |
| AUD-04 | 3590aac | 根/目标先 realpath（目标不存在解析最深现存祖先），真实路径上 relative 判定；根 realpath 缓存；返回值仍为词法路径（调用方语义不变）；用例 4 例（文件 symlink 用例 win32 skip——junction 仅目录可用） |
| AUD-05 | ca93408 | ProjectorImpl 附件 LRU 缓存（32 条、含负缓存），经包装 reader 注入纯函数（签名不变）；用例 2 例 |
| AUD-06 | 58ad111 | redactSecretText（sk-/Bearer/env 值）+ run-loop 四处 error 发射点过脱敏；用例 2 例 |
| AUD-07 | 6d534dd | length 续采样入 maxSteps 预算（finish='length' 收口）；endTurn 移入无条件内层 finally；takeInput catch 收窄 E_QUEUE_CLOSED；用例 3 例 |
| AUD-08 | 979b5d1 | 新建 transports/replay.ts 回放代际协调器；偏差：模块级单例（replaySessionEvents 有模块级调用方，不经 React 上下文）；失败路径 finally 把 pending 补进 store（满足"直播数据不丢"验收） |
| AUD-09 | b42cdf9 | emit/setNotice 入口 disposed 闸门 + loadOlder await 后丢弃；noticeTimer 回调兜防；用例 4 例 |
| AUD-10 | eb5057d | read 返回 tailTorn{validBytes}（ignorable 行同样推进边界）；resume 备份 .torn-bak + truncate 修复；fail-closed 拒载不变；用例 3 例 |
| AUD-11 | d29bc47 | 背压分级（live 先丢/durable 驱逐 live/全 durable 断链通知 onDurableOverflow，sse res.end 让客户端按水位重连补播）+ ProgressGate drain 首错上抛一次、链自愈；既有 2 条背压用例按新策略更新；protocol 增 isLiveOnlyType；用例 4 例 |
| AUD-12 | 1cb3fae | 壳侧方案（工单二选一取 A，不动 server 生命周期语义）：fatal.ts renderFatalHtml 纯函数 + showFatalWindow（stderr 尾部 20 行现场）；用例 3 例 |
| AUD-13 | 50e1ee9 | 手写 ErrorBoundary（App 级 + ChatView 行级）；useVoiceInput 卸载收口（先摘 onstop 防死后假转写）；useCopy 三端定时器 ref 化；偏差：recorder 状态按 MediaRecorder 实际值（recording/paused/inactive） |
| AUD-14 | 06858f5 | useTransportQuery 代际闸门 + 成功清 error；SessionPage sid 切换补清 preset；Composer listFs 代际；inprocess 七方法 dispose 收口——偏差：异步方法用 assertNotDisposed 而非 sync 包裹（避免 Promise 嵌套推断风险），错误同为 E_DISPOSED、契约形状一致 |

**余下安排**：AUD-RT-01（§9）与 docs/audit 的 WO 系列属实工单、DSH 对话框改造（§5 解禁，按 DESIGN §13.L 过滤）由豆包执行。CI 红则在下一提交修（AGENTS §2.2）。