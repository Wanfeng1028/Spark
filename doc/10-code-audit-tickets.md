# 代码审查整改工单

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| --- | --- | --- | --- |
| v1.2 | 2026-09-19 | AI 编写：ZCode · Union Alpha；发起与拍板：晚风（Wanfeng1028，"这个我需要 dsh 的对话框改造，你把相应的文档改一下"指令） | **§5 DSH 判决更新：整体退回 → 已解禁**——晚风拍板采纳 DSH 对话框改造；规格已按 DESIGN 尾注纪律先行修订（DESIGN v2.19 新增 §13.L + §6/§12.1/§12.4/§12.8 豁免判注；ARCHITECTURE v1.50 新增 D43，D32 不变项按域修订）。WO-052~078 解禁交豆包执行，以 §13.L 过滤范围（排除审批接管/Lexical/TurnRail/StatsPills/英文 shimmer）。 |
| v1.3 | 2026-09-19 | AI 编写：ZCode · Union Alpha（其中 AUD-08/09/12/13/14 由并行子会话执行、本会话复核）；发起与授权：晚风（Wanfeng1028，"所有的该你干的工单要全部完成"指令） | **AUD-01~AUD-14 全量实施完毕并推送**（本机零验证，以 CI 裁决）。§2 工单索引状态更新；新增 §10 实施记录（逐单 commit 与实现要点/偏差）。AUD-RT-01 与 docs/audit 的 WO 系列工单留豆包执行；doc/02 v4.56 规格同步（§4.7/§5.3/§5.6.4/§5.8.4/§6.10） |
| v1.4 | 2026-09-19 | AI 编写：ZCode · Union Alpha | **CI 全绿收口（run 35380218227）**。修红链六提交：9d02c57（desktop port 作用域）、121ddbd（测试追加脚本 \n 写成真实换行的字面量断裂）、ba92255（exactOptionalPropertyTypes 三处）、86eb37b（ErrorBoundary children/测试 as const）、55b587c（**补回 AUD-10 静默丢失的 tailTorn 捕获行**——前批 python 替换未命中且无断言，功能链路曾断裂；另 lint 四处）、878594e+e7790fd+8d62308（tsx 后缀/断言过严/bash 上限按剩余空间切片）。教训：脚本化批量编辑必须逐处断言命中 |
| v1.5 | 2026-09-19 | AI 编写：ZCode · Union Alpha；发起与分工确认：晚风（Wanfeng1028，"写代码的你来，豆包负责真机测试"） | **DSH 对话框改造实施完毕（d59a541）+ WO 系列余项清账（3ef5f27/8030b8d/880df0d）**。① §5 解禁的 19 项全部落地（DESIGN §13.L：token/22px 卡/34px 蓝钮/14px 字号/sweep/气泡/操作行/33px 行/间距/附件皮肤/文件卡/窄屏最小适配）；WO-073 不实施（web 无分页通道属功能新增，登记）。② WO 系列属实单新增落地：019/020/025/027/040/044/050（engine/server/cli/desktop 卫生批）、038/039（miniapp）、010 实修（SessionPage 错误态禁用 Composer）、001/002/003/012/013/014/016/017/018/031/047/048（official 批，og-image 由零依赖 node 脚本生成 1200×630 PNG）。③ 不实施登记：WO-015（AGENTS §2.10 删除保护须人类五层级确认）、WO-030（维持 @fontsource 的工程判断）、WO-033（P3，无量测不盲拆）、WO-036（v1 口径维持）、WO-042/049（D24 设计/桌面密度不适用）、WO-026（无规格依据的速率限制，需立项）。至此 33 个属实单中除上述登记项外全部闭环；AUD-RT-01 现场走查留豆包 |
| v1.6 | 2026-09-19 | AI 编写：ZCode · Union Alpha | **DSH+WO 全批 CI 全绿收口（CI run 2a13736 + Official 296668d 双绿）**。实施提交：d59a541（DSH 19 项）、3ef5f27（WO 卫生批 019/020/025/027/040/044/050）、8030b8d（038/039/010）、880df0d（official 批 001/002/003/012/013/014/016/017/018/031/047/048）。修红链八提交（2408cbf/296668d/6cfb892/2a13736 等）：sitemap 误用 LINKS 对象、MessageItem model 解构、build.mjs 改 node:path+正则（JSON.parse any 在 typed lint 对 .mjs 生效且 JSDoc 注解不豁免）、robots/sitemap force-static（output:export）、**waiting 态 Composer 整卡 pointer-events 穿透**（e2e reject 场景 disabled textarea 对流程尾部审批按钮的 hit-test 干扰——等待中唯一交互焦点是审批卡，穿透语义正确）、miniapp 测试桩补 getAppBaseInfo。配合分工：真机走查 AUD-RT-01 留豆包 |
| v1.7 | 2026-09-19 | AI 编写：ZCode · Union Alpha；回归验证执行：豆包 | **AUD-RT-01 部分回报收编（550385a）**：豆包回归报告（基线 6e4219b，2477 测试全绿 + AUD-01~14 逐单源码/单测核对 + AUD-12 Electron 首启引导窗现场确认 + step-3.7-flash 真实模型端到端）经 PR #25 提交——**PR 不合并**（分支基线落后约 30 提交，diff 为对 main 现有修复的反向回滚），仅提取报告与 5 张截图入 docs/audit/regression/。报告发现①采纳（proxy-fetch 测试全组代理桩）；②③登记备查（checkpoint 非 git cwd 预期报错 / server dist esbuild external 链路）。**AUD-RT-01 余项仍留豆包**：① 移动端真机四场景 ② 小程序走查 ⑤ 语音真实链路 ⑥ LSP 真实 server ⑦ MCP 外配 ⑧ mitm 代理 ⑨ npm 发布冒烟（已完成：③ Electron 首启、④ 真实模型端到端） |
| v1.8 | 2026-09-19 | AI 编写：ZCode · Union Alpha；第二轮测试执行：豆包（PR #26 已合并 6764e97） | **第二轮复测收编 + 7 项 UI 修复批**（新增 §11）：2341 单测全绿无新增回归，官网标题/复制按钮两项闭环确认；复测不变的 7 项全部修复——WO-079 窄屏（工具栏可换行+模型选择器收图标+chips 防竖排）、裸 /settings 重定向路由缺失、WO-080 Esc 关 + 菜单、WO-081 面板开时收起弹层、WO-082 沙箱标签收短、搜索清除钮、侧边栏右键菜单（归档/删除两段式内联确认，替换违反 DESIGN §5 的 window.confirm；重命名需 header 重写设计登记缺口）。MCP github（环境预期）与技能页只读（v2 挂池）维持 |
| v1.9 | 2026-09-19 | AI 编写：ZCode · Union Alpha；拍板：晚风（Wanfeng1028，四问四答） | **三项人类决策落地**：① WO-015 官网死代码 → **冻结保留**（不删除）；② G7 spike-pi-ai lock 残留 → **冻结保留**（doc/05 v1.3 同步）；③ 两张 D28 重号 → **永久维持双编号 + 主题消歧**（ARCHITECTURE v1.51 同步）。**发布拍板：先修链路再发**——apps/server 打包链路修复（pi-ai/pino 入 bundle + check-dist 自校验，回归报告发现③消解）；五公开包版本 1.0.0 + CHANGELOG 1.0.0 节；tag v1.0.0 触发 release.yml（npm publish 需 NPM_TOKEN/或 Trusted Publishing + @spark scope 组织，缺则发布步红如实报告）。池子决策：会话重命名做（标题已事件化——session.title durable + titleOf 取最新，端点=发事件+自动标题覆盖守卫，小 ADR 随批）；其余四项（检查器版本校验/loadOlder 优化/ContextMeter/技能启停）defer 挂池 |
| v1.11 | 2026-09-19 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"你先看豆包的测试报告，根据报告行动"指令；PR #27 已合并 72e18a3） | **第三轮走查项 RT3-01/03/04/06 修复收官（§12 状态表更新 + RT3-05/07 登记）**：RT3-01 首启引导窗+自动续启（622f96a，壳侧判例 A）、RT3-03 代理同源 undici 配对（3fd0336，根因=跨包 dispatcher 不互通；修红 5cf0d4f）、RT3-04 MCP 30s+connectTimeoutMs 全链（1b5f96f）、RT3-06 窄视口一次性折叠（d2c1ba5）；新发现 RT3-07（MCP 管理页保存丢 args/env，12.6 遗留）立单。真实代理/npx 冷启动/Electron 首启复测留豆包现场 |
| v1.18 | 2026-09-20 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"继续找找官网、移动端、web、桌面端、cli 的前端还有没有 bug……找出来列工单去修复"） | **新增 §15 前端五端审计工单（WO-099~WO-114，全部待修）**：源码级只读审计坐实 16 枚——web 3（ArenaCard 竞答不出现/侧栏不吸新会话/空态 chips 无闸门）、cli 3（每键重跑 boot 致请求风暴+会话跳走/面板开关丢草稿/arena 面板快照不刷新）、mobile+miniapp 2（inverted 列表加载指示错位/列表返回不刷新）、desktop 4（单实例锁缺失/Windows 退出孤儿进程/app.exit 旁路 will-quit/will-navigate 白名单+通知标题陈旧）、official 4（**P0×2**：代码窗复制丢码行、示例调用不存在的 `client.events.onEvent`；事实漂移四处；npm 404+basePath 部署联动待核）。P0/P1 关键条均经二次抽核坐实；已核实排除的误报（ErrorToast 重复错误/Esc 空闲 interrupt）不列 |
| v1.17 | 2026-09-20 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起与拍板：晚风（Wanfeng1028，四图指认"这个对话框完全用 deepseek harness 的来写——文件夹和模式放到对话框的上边框上面；卡内靠左=加号+访问权限，靠右=模型+推理强度+发送"） | **§14 追加 WO-097/098（DSH 三批，L.8 上下文行）**：卡上文件夹/提交模式两枚 chip（DSH WorkspaceChip 同构 16px 圆角）；提交三态上移（busy Enter wire=显示档，修报文错位）；工具条重排左=＋/权限/语音右=模型/推理/发送；文件树钮并入 + 菜单；语音错误改瞬态提示行分色调（修工具条换行 bug）。DESIGN v2.29 L.2/L.8 同步 |
| v1.16 | 2026-09-19 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起与拍板：晚风（Wanfeng1028，"不是有源码吗？你为何都抄不来样子？？？？就把对话框这个先看人家的代码，给我好好的复现"） | **§14 追加 WO-095/096（DSH 二批收尾）**：WO-095 Composer 逐值照抄 dialog-redesign-spec §1.1/§2.x——卡阴影三段式（0.5px 环+双层柔影，暗环非 inset）、卡内距仅 pt-2、placeholder 色值/文案、+/选择器皮肤精确 hover 与 13px/500 非 mono、组距 12px justify-between、移除常驻 Enter 提示行（瞬态反馈保留）、EffortPicker 下拉补去框；WO-096 滚动条 overlay 化（默认透明、悬停/聚焦显淡滑块）。DESIGN v2.21 L.1/L.6 同步 |
| v1.15 | 2026-09-19 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起与拍板：晚风（Wanfeng1028，五图指认"对话框完全按 deepseek harness 做，不显示长方形格子线"+细滚动条+假空白+操作行常显） | **新增 §14 DSH 二批（去格子线，WO-089~094）**：规格先行 DESIGN v2.20 §13.L L.6 后同批实现——五弹层删 border 改 0.5px 描边环柔影、Composer 容器顶线去除、Segmented 轨道去边框、+菜单×文件树互斥、空 text 块跳过渲染（假空白根因）、助手操作行常显（修订 L.3）、全局细滚动条（theme.css 单点）、工具栏左组并排修复（裸块级按钮竖排 bug）。现场走查留豆包 |
| v1.14 | 2026-09-19 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；第四轮测试执行：豆包（PR #28 已合并 f860b9e） | **第四轮全功能深度测试收编（新增 §13）**：2481 单测全绿；11/11 修复验收通过——RT3-01/02/03/04/06 五项现场闭环（三轮对比见报告 §四）；全量回归（Web 核心流/20 设置子页/CLI/官网/Electron/375-768px）无 P0/P1；OBS-1（P3 窄屏展开侧栏挤压 → 挂池 V2-39）与 OBS-2（P3 偶发 oneshot 超时 → 不立项）登记；RT3-07 基线未含，现场复测留第五轮 |
| v1.13 | 2026-09-19 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，对 v1.11 总结中 RT3-07 的点名指令"你把这个修好"） | **RT3-07 修复落地（§12 状态更新，WO-088）**：MCP 配置读回通道全链——protocol `MCP_ENV_MASK` + `Transport.getMcpConfig`（GET /api/mcp/config）、engine `maskMcpConfigForClient`/`mergeMaskedMcpConfig` 纯函数（公共面单源）、PUT /api/mcp 掩码合并、web 管理页以读回配置为底保存/停用、sdk inprocess 与 mock 对等；env 明文不出引擎，掩码占位无既有真值 400 拒写。修复 12.6 遗留数据丢失（保存静默丢 args/env/connectTimeoutMs）。engine 4 例 + server 3 例新增。全本机零验证以 CI 裁决 |
| v1.12 | 2026-09-19 | AI 编写：ZCode · Union Alpha | **v1.0.0 发布执行记录**：tag v1.0.0 已打（指向 30babbe，main CI 绿）；release.yml run 35441250244——构建/文档检查/typecheck/test/四包 build/**check-dist 外置导入自校验全部通过**，publish 步红于 `ENEEDAUTH`（NPM_TOKEN secret 未配置）+ docs 步红于 GitHub Pages 未启用——两项均为**用户侧账号配置**（npmjs 建 @spark 组织 + 生成 publish token 后 `gh secret set NPM_TOKEN`，或按 release.yml 注记改用 Trusted Publishing；仓库 Settings→Pages 启用 GitHub Actions 源），配置后在 run 页 rerun failed jobs 即可，无需代码改动 |
| v1.10 | 2026-09-19 | AI 编写：ZCode · Union Alpha；第三轮测试执行：豆包（PR #27 已合并 72e18a3） | **第三轮复测收编 + 发布启动**（新增 §12）：二轮 7 项修复**全部验收通过**；真机走查——真实模型 E2E ✓、LSP server ✓、移动端/小程序/语音 headless 不可走查仍留；新立 RT3-01（P0 Electron 空 HOME 仍无配置向导——错误窗已交付，向导属增强，随桌面批次）、RT3-03（P1 带代理 LLM 请求无响应——undici dispatcher 兼容）、RT3-04（P2 MCP npx 冷启动 10s 超时）；**RT3-02 已由并行会话修复**（40ddd97 WO-084：spark --version/-v 独立退出，发布冒烟硬前置消解）。发版：五包 1.0.0 + CHANGELOG 1.0.0 + tag v1.0.0 触发 release.yml（发布结果如实登记） |
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
## 11. 第二轮复测修复批（round-2，豆包测试 → 本仓修复）

> 报告：`docs/audit/round2/round2-full-test-report.md`（PR #26 已合并，2341 单测全绿无新增回归；官网两项第一轮遗留确认闭环）。以下 7 项复测不变问题全部由本仓修复，待第三轮复测验收。

| # | 问题（豆包编号） | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | WO-079 P0：375px 窄屏工具栏按钮重叠/溢出、建议卡文字竖排 | WO-076 只做了档位标签隐藏，工具栏不可换行、模型名过长撑爆 | Composer 工具栏改 `min-h-8 flex-wrap`；ModelPicker <480px 收起文本保留图标（§13.L L.2）；欢迎页 chips `whitespace-nowrap` 防逐字换行 |
| 2 | P1：裸 `/settings` 右侧空白，重定向未生效 | 根因不是重定向逻辑——路由表只有 `/settings/:page`，裸 `/settings` **无匹配路由**，主区渲染 null | App.tsx 补 `/settings` → Navigate `/settings/appearance` |
| 3 | WO-080 P1：+ 附件菜单按 Escape 不关闭 | 菜单无 Escape 监听 | plusMenuOpen/treeOpen 挂 keydown Escape 关闭 |
| 4 | WO-081 P2：Ctrl+K 打开时 + 菜单残留 | 命令面板与底部弹层状态互不知晓 | 订阅 ui-store `paletteOpen`，打开时收起全部底部弹层 |
| 5 | WO-082 P2：bash 沙箱下拉文字截断 | 选项文案 13 字超出触发器宽 | 标签收短「开启（隔离）」，细节在行 description（ADR D15） |
| 6 | P2：搜索页无清除按钮 | 未实现 | 有输入时显示 X 清除钮 |
| 7 | P2：侧边栏会话项 hover/右键无菜单 | hover 按钮已存在（12.4）但无右键菜单；删除用 `window.confirm` 违反 DESIGN §5 | 行加 onContextMenu 弹归档/删除菜单；删除全触发点改内联两段式确认（3s 超时） |

**登记缺口**：会话重命名无后端端点——会话标题存 JSONL header 首行，重命名需 header 重写设计（append-only 语义冲突），随 v2 会话管理立项；DESIGN §13.J.2.3 会话菜单的「重命名」项同此依赖。

**维持不变**：MCP github 连接失败（无凭证环境预期）；技能页只读（v2 挂池，占位即明示）。
## 12. 第三轮复测与真机走查（round-3，豆包）

> 报告：`docs/audit/round3/round3-test-report.md`（PR #27）。二轮 7 项修复全部验收通过；AUD-RT-01 完成度：③ Electron 首启（部分——错误窗 ✓ 向导缺）、④ 真实模型 E2E ✓、⑥ LSP server ✓；①②⑤（移动端真机/小程序/语音）headless 环境不可走查，仍留现场。

| 编号 | 优先级 | 问题 | 状态 |
| --- | --- | --- | --- |
| RT3-01 | P0 | Electron 空 ~/.spark 首启：错误对话框已交付（AUD-12），配置向导仍缺 | **已修**（622f96a，WO-083）——壳侧首启检测：models.json 缺失先出引导窗（最小模板+自动打开配置目录+密钥纪律），文件出现自动续启；沿用 AUD-12 判例 A（不动 server 生命周期语义），engine fail-closed 不变。表单式配置向导仍留 v2（当前 UI 本就无模型新增端点，手编文件是既定路径） |
| RT3-02 | P1 | spark --version 掉 TUI raw-mode 报错 | **已修**（40ddd97，WO-084）——发布冒烟硬前置消解 |
| RT3-03 | P1 | 带代理环境 LLM 请求无响应（undici dispatcher 兼容） | **已修**（3fd0336，WO-085）——根因=跨包 dispatcher 配对（npm undici 8 的 ProxyAgent 塞给 Node 内置 undici 的 fetch，handler 协议不互通→静默无响应）；改用同包 fetch+Agent，直连路径零变化；配对回归锁进单测（mock undici）。真实代理链路复测留豆包 |
| RT3-04 | P2 | MCP filesystem npx 冷启动 10s 超时 | **已修**（1b5f96f，WO-086）——缺省 10s→30s + per-server `connectTimeoutMs`（上限 600s）；mcp.json schema/PUT /api/mcp/管理页表单全链透传；真实 npx 冷启动复测留豆包 |
| RT3-05 | P2 | 侧边栏会话项无"重命名" | 已登记（§11 缺口 + v1.9 拍板"会话重命名做"）——标题已事件化，端点随会话管理批次，不在本批 |
| RT3-06 | P2 | 375px 窄屏左侧边栏仍占 ~264px，主内容区不可用 | **已修**（d2c1ba5，WO-087）——挂载时窄视口（<640）一次性自动折叠侧栏（复用 toggleSidebar 持久化口径）；DESIGN §2 不做响应式断点，此为一次性缺省非断点体系，可再展开 |
| RT3-07 | P2 | 本批实施中新发现：MCP 管理页保存时"保留其余 server"仅回填 command——args/env/connectTimeoutMs 被静默丢弃（GET /api/mcp 状态 DTO 无配置字段，属 12.6 遗留数据丢失缺陷，先于本批存在） | **已修**（本批，WO-088）——新增配置读回通道：protocol `MCP_ENV_MASK` 占位 + Transport.getMcpConfig（GET /api/mcp/config）+ engine 纯函数 maskMcpConfigForClient/mergeMaskedMcpConfig（公共面单源，server 路由与 sdk inprocess 共用装配）；env 值永不明文出引擎（12.6 只进不回显纪律延续），PUT 掩码占位由引擎合并盘上真值、无真值 400 拒写；管理页保存/停用改以读回配置为底，未编辑 server 原样保留；mock 对等（静态配置，不持久语义如实）；engine 4 例 + server 路由 3 例新增 |

**实施记录（本仓修复批，全本机零验证以 CI 裁决）**：RT3-02=40ddd97（复用 WO-050 versionOf 单一来源，禁再写一份）；RT3-03=3fd0336（类型收窄修红 5cf0d4f）；RT3-04=1b5f96f（doc/02 §5.1 + ARCHITECTURE D16 正文同步）；RT3-06=d2c1ba5；RT3-01=622f96a（renderFirstRunHtml 纯函数 + fatal.test 补 3 例）。

## 13. 第四轮全功能深度测试验收（round-4，豆包）

> 报告：`docs/audit/round4/round4-test-report.md`（PR #28 已合并 f860b9e）。被测基线 `1a49044`（含 round3 修复批 WO-083~087；**RT3-07 修复 d909635 在基线之后，现场复测留第五轮**）。构建绿、`pnpm -r test` **2481 passed / 4 skipped / 0 failed**（protocol 1244 / engine 715 / web 236 / server 134 / cli 77 / miniapp 41 / desktop 11 / sdk 14 / skill-kit 7 / sdk-bot 2）。

**修复验收 11/11 全部通过**（逐项方法与 20 张证据截图见报告 §二）：裸 /settings 重定向、WO-080 +菜单 Esc、WO-081 Ctrl+K 无残留、WO-082 沙箱下拉、搜索清除钮、侧栏右键菜单（归档/两段式删除/抽屉恢复全链）、WO-079+RT3-06 375px（无溢出 + 侧栏折叠 48px + 工具栏不重叠）、RT3-02 `spark --version`、RT3-03 带代理 LLM 真实流式（WO-085 undici 同源配对生效）、RT3-04 MCP filesystem 30s 连接成功（round3 的 10s 超时未复现）、RT3-01 空 HOME 首启引导页（不再 E_CONFIG 崩溃，xdg-open 配置目录行为确认）。

**全量回归无 P0/P1**：Web 核心流（流式/审批三按钮/停止/模型自适应）、20 个设置子页逐一渲染、自动化页、搜索跳转、CLI（--version/--help/oneshot）、官网 build（5 路由标题唯一 + Copy code 钮）、Electron 桌面单测 11/11、375/768px 两档视口无横向溢出。三轮对比表见报告 §四——RT3-01/02/03/04/06 **五项全部闭环**。

**新发现登记（均非阻断）**：

| 编号 | 级别 | 内容 | 去向 |
| --- | --- | --- | --- |
| OBS-1 | P3 | 375px 下用户手动展开侧栏再进会话，展开态侧栏挤压主区为预期态（WO-087「挂载缺省折叠、可再展开」口径），非回归 | 改造建议（展开态做 overlay drawer）挂池 **V2-39**（doc/02 §8.7），浮层规格先过 DESIGN 再立项 |
| OBS-2 | P3 | 一次 oneshot 60s 超时被 kill（EXIT=124），重跑 3.9s 正常——npx 冷启动 × 代理抖动叠加的偶发，未稳定复现 | 不立项；若后续可稳定触发，重评 RT3-04 的 connectTimeoutMs 缺省值 |

**已知不修项维持**（报告 §六）：MCP github 无凭证环境预期、技能页只读归 v2、会话重命名后端缺口已登记、审批拒绝二次确认设计如此。

## 14. DSH 对话框二批：去格子线（晚风 2026-09-19 五图指认 → 本仓修复）

> 规格：DESIGN v2.20 §13.L **L.6**（规格先行）。指认原话："对话框完全按照 deepseek harness 的对话框做吧，没必要把长方形的格子线显示出来"；后追加"右边的这个条也不需要显示，显示成细窄滑块即可""为什么要空这么多""回复完为什么没有复制这些"。全部本机零验证，以 CI 裁决。

| 工单 | 问题（截图指认） | 根因 | 修复 |
| --- | --- | --- | --- |
| WO-089 | +菜单/文件树/权限档位/@//菜单/模型选择弹层全是 1px 矩形框线 | 弹层用 `border border-border`+shadow-md，非 DSH 的 0.5px 描边环 | 五弹层删 `border`，改 L.6 环阴影字面量（暗色环 white/0.16）；内部 hairline 保留 |
| WO-089 | Composer 上方一条横贯分隔线+空条 | SessionPage footer 容器 `border-t border-border py-3` | 去 `border-t`，改 `pt-2 pb-3`（DSH 输入卡浮在底色上） |
| WO-089 | 立即/插话/排队分段控件画框 | Segmented 轨道 `border border-border` | 轨道去边框，选中胶囊（bg-secondary）自承载选中态 |
| WO-090 | +菜单与文件树浮层同屏叠放（图1） | 两浮层各自独立 state，开一不清另一 | 两钮 onClick 开一关一（互斥） |
| WO-091 | 会话流两段大空白（思考过程后/审批已允许后） | AssistantBlock 对空/纯空白 text 块照渲染——Streamdown 空 `<p>` 自带外距=假空白 | `c.text.trim()===''` 跳过渲染 |
| WO-092 | 回复完成后复制/👍/👎 不可见（仅 hover 渐显） | AssistantActions 行 `opacity-0 group-hover/msg:opacity-100`；且隐形行占布局空间——空正文 assistant（纯工具调用/中断空稿）的隐形行正是会话流"假空白"另一半根因 | 去 hover 门控完成态**常显**（修订 §13.L L.3）+ MessageItem 空正文不挂操作行（`assistantTextOf().trim()!==''` 闸门） |
| WO-093 | 滚动条为 Windows 经典粗轨+箭头 | 未定制滚动条样式 | theme.css 全局 `scrollbar-width: thin` + `scrollbar-color`（浅 black/0.2 暗 white/0.2，透明轨道；单点维护） |
| WO-094 | 工具栏 + 与文件树两钮竖排堆叠 | 左组容器 `relative shrink-0` 无 flex——两个块级按钮裸放天生竖排（非折行问题） | 容器补 `flex items-center gap-1` |
| WO-095 | Composer 整体与 DSH 截图"抄不来样子"（晚风二批指认：卡面几乎无边界、发送钮无 DSH 质感、工具条间距散、Enter 提示行多余） | 上批实现未照抄 §1.1 精确值——卡阴影误用 `0 2px 10px /0.05` 单层（DSH=0.5px 环+双层柔影）、暗色误用 inset 环、卡内距多加 pr/pl/pb、选择器残留 mono/rounded-full/12px、组距 6px、静态 Enter 提示行 DSH 本无 | 逐值照抄 dialog-redesign-spec §1.1/§2.x：卡阴影三段式精确值（暗环 white/0.12 非 inset）、卡内距仅 pt-2、placeholder 色值 #ADB2B8/#81858C 与文案、+ 钮 text-foreground + hover #F1F3F5/#353638、权限/模型/推理三选择器统一 `h-7 rounded-lg px-2 pr-5 13px/500` 非 mono、组距 12px justify-between（max-[479px] wrap 兜底 WO-079）、**移除常驻 Enter 提示行**（瞬态反馈 §5 保留）；EffortPicker 下拉补去框（漏网第六弹层）；e2e 三 spec 占位符定位器同步新文案 |
| WO-096 | 滚动条细窄化后仍常显（晚风："进度条为啥还在"） | thin 滑块恒可见——DSH 是 overlay 观感（平时隐形） | theme.css：scrollbar-color 默认全透明，悬停滚动区/其内聚焦才显淡滑块（浅 black/0.18 暗 white/0.22，轨道恒透明）；滚轮滚动时指针本在悬停态，滑块随显随隐 |
| WO-097 | Composer 缺 DSH 卡上上下文行（晚风三批四图指认："文件夹和模式放到对话框的上边框上面"；DSH hero=WorkspaceChip+模式钮浮于卡上） | 卡内工具条承载过多元素——提交模式 Segmented 占卡内右组、无任何文件夹入口（cwd 只在会话顶栏 chip） | 新增 §13.L L.8：卡上左对齐两枚 chip（16px 圆角/13px/500 全对比度文本/chevron caption/transparent 底 hover bg-accent，组距 12px）——**文件夹 chip**（欢迎页=最近会话 cwd 去重 ≤8+「默认工作区」下拉、未选「选择文件夹」占位、createSession({cwd}) 落地；会话页=只读 title=完整 cwd；无数据不渲染）+ **模式 chip**（提交三态上移下拉，禁用矩阵与 §13.E 不变，busy Enter wire 取显示档 segmentDisplay——修 UI 显插话实发 now 的报文错位） |
| WO-098 | 语音错误红字常驻工具条挤压换行（欢迎页 560px 宽下 justify-between 折行、发送钮掉第二行——截图实证 bug） | `voice.error` 以内联 pill 渲染在工具条中列（max-w-56），DSH 错误走 Toast hold-then-fade 不占布局 | 错误并入卡下瞬态提示行分色调（info=accent 2.5s/error=destructive 4s 自动消退）；工具条重排——左组=＋/权限/语音、右组=模型/推理/发送；文件树独立钮撤除并入 + 菜单「浏览文件树」项（弹层互斥与 Esc/面板收口逻辑不变）；Composer 测试 radio→菜单流同步 + 上下文行两用例新增 |

**验收口径**：五弹层无框线只剩柔影；Composer 区无顶部分隔线；分段控件无框；空块不留白；回复完成即见操作行；全应用细滚动条；+/文件树并排且两浮层互斥。现场走查留豆包下一轮。**L.8 补充（DSH 三批）**：卡上文件夹/模式两 chip 与 DSH hero 同构；工具条恒单行（右组=模型/推理/发送）；语音错误不再出现于工具条。
## 15. 第五轮全功能深度测试（round-5，豆包）

> 报告：`docs/audit/round5/round5-test-report.md`（PR #29 已合并 ae376c1）。2497 passed / 4 skipped；Web 全功能（欢迎/会话/审批三按钮+拒绝二次确认/停止/@补全//命令/+菜单/语音降级/搜索/自动化/设置全子页含阶段十九电脑控制页）、移动端视口、重叠专项、CLI、官网逐项点验通过，round3/4 闭环项无回退。

| 编号 | 优先级 | 问题 | 状态 |
| --- | --- | --- | --- |
| P1-1 | P1 | ComputerSettingsPage 单测确定性失败——测试-实现契约漂移：effect 内联进 description 文本节点（`${a.desc} · ${effect}`），`getAllByText('缺省逐次询问')` 按独立节点精确匹配必失配；页面渲染本身正常 | **已修**（并行会话 4968fb0：档位断言改正则子串匹配，语义 8 行不变） |
| WO-097 | P2 | 审计日志工具过滤大小写敏感——占位符示例即小写 `bash`，过滤必落空（engine audit/log.ts `e.tool !== query.tool` 精确比较） | **已修**（本批）：过滤 toLowerCase 两边归一（round5 P2-2） |
| WO-098 | P2 | 375px 设置页双栏挤压——`/settings/*` 恒 264px 侧栏，内容列 ~175px、描述逐字竖排 | **已修**（本批）：AppShell 窄视口一次性判定（<640，同 WO-087 一次性缺省口径）+ SettingsSidebar `compact` 变体——设置导航转顶部横滚 chip 条（返回+页面平铺、active bg-secondary、status 点保留），内容列独占全宽；桌面/iPad 双栏不变（round5 P2-3） |

**观察项登记（均非缺陷）**：OBS-1 engine 并行套件偶发 `write EPIPE`（vscode-jsonrpc LSP 子进程 teardown，单跑干净 725 断言全过）；OBS-2 `spark -p` 未导 `STEP_PLAN_API_KEY` 返回空（密钥注入前置）；OBS-3 TUI 偶现「目标不存在」（临时 root + 会话引用同步，复现稳定再查）。**复测归 round6**。

---

## §15 前端五端审计工单（WO-099~WO-114，2026-09-20）

> 发起：晚风（"继续找找官网、移动端、web、桌面端、cli 的前端还有没有 bug。特别是交互和生命周期的显示 bug，遮挡之类的，重复之类的，位置不合理之类的。找出来列工单去修复"）。
> 方式：源码级只读审计（web/cli/mobile/miniapp 逐文件核 + desktop/official 子代理审计 + P0/P1 逐条抽核坐实）；本机零验证，修复批以 CI 裁决。审计已核实排除的疑点不列（如 web ErrorToast 重复错误不重现——reducer 每次写新对象引用、CLI Esc 空闲 interrupt——引擎幂等 no-op）。
> 状态口径：全部 **待修**；P0 两枚（官网）建议最先修——用户复制即踩。

| 编号 | 端 | 严重度 | 现象 | 根因（位置） | 修复方向 |
| --- | --- | --- | --- | --- | --- |
| WO-099 | web | P1 | 竞答开赛后卡片永不出现——`/arena` 在当前会话发起后 ArenaCard 不渲染，离开页面重进才可见 | ArenaCard 只在挂载时拉一次快照 + `status==='running'` 才轮询（apps/web/src/features/chat/ArenaCard.tsx:24-59）；`arena===null`（本会话发起前挂载）后无任何重取触发，词表也无 arena 事件可订阅 | `arena===null` 时低频轮询（如 5s）直到非 null；或发起动作侧（命令回执）触发重取 |
| WO-100 | web | P1 | 新会话不入侧栏——欢迎页建会话/竞答子会话/其他端新建均不出现，须手点刷新钮或刷新页面 | useSessionList 仅挂载拉一次（apps/web/src/hooks/useSessionList.ts:16）；Sidebar 的 refresh 只挂在归档/删除/手点（components/layout/Sidebar.tsx:101/113/338），无路由/事件驱动刷新 | 路由进入 `/session/:id` 且该 id 不在列表时 refresh；或订阅 session.title/created 类事件触发 |
| WO-101 | web | P2 | 会话流空态 chips 双击双发、失败无反馈——点击直接 `void transport.sendMessage`，无 busy 闸门、rejection 无人接（§6.2.1 不丢用户输入在此失效） | apps/web/src/features/chat/ChatView.tsx:130 EmptyChat chips | 走 Composer 同链路：busy 防抖 + catch → 行内错误提示（或改填入输入框语义同欢迎页） |
| WO-102 | cli | P1 | 每次按键/↑↓ 重跑 boot——每键触发 listSessions+listModels+listCommands 三连请求；且 boot 内 `setActiveSession(最新会话)`：停留在非最新会话时打一个字即被跳走（since=0 重订阅全量重放刷屏） | actions useMemo deps 含 resumeFiltered/resumeSelected（apps/cli/src/hooks/use-cli-actions.ts:292-307），draft 每键生成新数组 → memo 每键失效 → app.tsx:171 `useEffect(() => actions.boot(), [actions])` 每键重跑（boot 返回 cleanup 抵消disposed，但新请求照发） | memo deps 收敛到稳定引用（resumeFiltered/resumeSelected 改 getState() 调用时读取）；boot 加 booted ref 幂等 |
| WO-103 | cli | P1 | 面板开关丢草稿——输入一半开 `?`/model/agents 等任意面板再关闭，已输入文本全丢 | InputBox `useState('')` 不从 draftPreview 水合（apps/cli/src/components/InputBox.tsx:81）+ app.tsx:327 `key={panel}` 面板切换即重挂 + Esc 关面板 `setDraftPreview('')`（use-cli-keys.ts:133） | 重挂初值水合 draftPreview；Esc 关面板不清 draft（面板态草稿归输入框，resume 过滤词除外） |
| WO-104 | cli | P2 | `/arena` 面板定格发起时刻快照——running 态不刷新，进度/完成状态永不更新，须关开面板 | useLoad 挂载装一次（apps/cli/src/components/CommandPanels.tsx:69-90,254-255）；use-cli-actions.ts:277 注释声称"快照轮询"与实现不符 | running 态 interval 轮询（对齐 web ArenaCard POLL_MS=2s），面板关闭时清理 |
| WO-105 | mobile | P2 | 上拉翻页菊花与「已加载全部历史」显示在视觉底部（最新消息下方、紧贴输入框），而加载动作发生在顶部 | inverted FlatList 的 ListHeaderComponent 渲染在数据流末尾=视觉底部（apps/mobile/src/screens/SessionScreen.tsx:245-253）；RN inverted 列表头/尾位置反转 | 指示移入 ListFooterComponent（inverted 下渲染在视觉顶部）；或改 inverted={false} + data 不反转统一口径 |
| WO-106 | mobile+miniapp | P2 | 会话列表返回不刷新——从会话页返回/桌面端新建会话后列表陈旧，须下拉手动刷新 | 两端列表均挂载时拉一次且页面常驻（apps/mobile/src/screens/SessionsScreen.tsx:76-79；apps/miniapp/src/pages/sessions/index.tsx:52-55）；mobile 头注宣称"刷新/聚焦时刻 REST 快照"但无 useFocusEffect，miniapp 无 useDidShow | mobile 补 useFocusEffect(refresh)、miniapp 补 useDidShow(refresh)，与头注口径对齐 |
| WO-107 | desktop | P2 | 双击启动两实例——各自拉起 sidecar，同 `~/.spark` 数据目录双写、通知重复 | main.ts 无 `requestSingleInstanceLock`（apps/desktop/src/main.ts 全文件已核） | 启动首行 `app.requestSingleInstanceLock()` 失败即退出 + `second-instance` 聚焦既有窗口 |
| WO-108 | desktop | P2 | Windows 退出残留孤儿进程——MCP stdio/LSP/在跑 bash 全部存活占资源 | will-quit `child.kill()` 在 Windows = TerminateProcess，server 的 SIGINT/SIGTERM 优雅退出（engine.shutdown 关 MCP/LSP）永不触发（apps/desktop/src/main.ts:272-284；对照 apps/server/src/index.ts:92-104） | win32 分支 `taskkill /pid <pid> /T /F` 树杀；或 server 侧父进程消亡监视（process.ppid 轮询/管道断开） |
| WO-109 | desktop | P2 | 就绪后 main() 后半段抛错（loadURL 失败等）走 `app.exit(1)`——app.exit 不触发 will-quit，sidecar 成孤儿无头 server 继续占 4318 | apps/desktop/src/main.ts:286-294（catch → app.exit(1)，杀 sidecar 逻辑全在 will-quit） | 抽 `killSidecarThenExit()` 公共路径：app.exit 前同步 kill sidecar |
| WO-110 | desktop | P3 | 两处低危：① will-navigate 白名单 `startsWith('http://127.0.0.1:')` 放行本机任意端口而非仅 sidecar 端口；② 通知标题缓存永不更新（session.title 事件到达后通知仍显示「新会话」） | apps/desktop/src/main.ts:254-256；apps/desktop/src/notify-wiring.ts:40-53 | ① 前缀比对收紧到 `http://127.0.0.1:${port}/`；② titles 缓存监听 session.title 刷新 |
| WO-111 | official | **P0** | 开发者区代码窗 Copy 按钮复制出的文本缺全部代码行——只剩注释与 `});` | plainText 提取只下钻一层：TS_LINES 的 l0/l2/l4 是 Fragment 包 span（span 文本在第二层），`typeof c === "string"` 对 span 全 false → 整行提取为空串（official/src/components/sections/ProtocolSection.tsx:45-47,77-92；已抽核坐实） | 递归提取文本，或 TS_LINES 每行同时保存 `plain` 字符串字段 |
| WO-112 | official | **P0** | 首页示例代码调用不存在的方法——`client.events.onEvent(...)` 复制执行即 TypeError | SDK 便利分组实际面是 `events.subscribe`（packages/sdk/src/client.ts:61-72,104-106；已抽核坐实）——违反官网"代码为真实 API 面"自律 | 示例改 `client.events.subscribe((envelope) => {…})` |
| WO-113 | official | P1 | 事实漂移四处（对着源码同步一批）：① 统计行「内置命令 23」实为 24（19.2 新增 computer）；② 快速上手审批键位「1/2/3/4 四键」产品实为三值（once/always/reject，CLI y/a/n）；③ 首屏演示终端键位 `[a]批准一次 [A]总是 [r]拒绝` 同错；④ features 页「67 个方法」实为 69 | official/src/lib/constants.ts:11；quickstart/page.tsx:188-189；SessionDemoZone.tsx:117-122；features/page.tsx:99（对照 packages/protocol/src/commands.ts 24 条、keymap.ts、transport.ts 69 方法——①已抽核坐实） | 一次批对照源码改常量与文案；FACTS 计数纳入 check_doc_links 同步面（或注释改"以源码为准"去掉假"CI 校同步"声明） |
| WO-114 | official | P1 待核 | 主 CTA `npm i -g @spark/cli` 现状 404（包未发布）；metadataBase/canonical 指向 GitHub Pages 项目页但未设 basePath，真部署时 `/_next/*` 资源与站内链接全 404 | registry 实测 404（tag v1.0.0 已打、发布未落地——发布窗口期问题）；official/next.config.ts:3-8 与 layout.tsx:9 两处口径未联动 | 发布落地前：CTA 改源码安装话术或挂「即将发布」态；部署到项目页时同步设 basePath/assetPrefix，或 SITE_URL 改根域名。两处均发布/部署前置条件，随发布批处理 |

**审计口径备注**：web/cli/mobile/miniapp 四端经协议层共享核（apply-event/session-page-controller/SessionStreamCore/ui-copy）沉淀的纪律良好——本轮四端发现集中在**端侧装配层**（轮询触发、列表刷新时机、memo 依赖面、inverted 列表头尾），无一涉及事件投影与流状态机。official 的两条 P0 属"事实面漂移"类（官网自律"代码为真实 API 面/CI 校同步"未覆盖到本区域，check_doc_links 不扫 official/）。
