# v2 工单库·续篇（可抄挖掘批 CK 起）

> 本篇是 `doc/08-v2-roadmap.md` 的续篇——该篇 2026-09-27 达 2990 行触顶（AGENTS §2.14 文档长度上限与续篇拆分），后续新工单批次一律写进本篇（第三篇将是 doc/08-v2-roadmap-3.md）。`doc/02-development-plan.md` 同步触顶：工单执行细则以本篇为准，doc/02 §8 只留指针。

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| --- | --- | --- | --- |
| v1.1 | 2026-09-30 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与拍板：晚风（Wanfeng1028，"融入到我们的项目里面来吧！开始写工单"指令） | **新增 §3 阶段十九追加批 M：19.48 中文长文去 AI 味规则层与硬检查扩展**（判据来源外部 MIT 项目 lieflat-less-ai-tone，两轮在线调研 + LICENSE 署名独立核验，§2.12 合规）。批 1 规则层随立单交付 = DESIGN v2.50 §12.7.1 长文正文小节（句式级禁项 + 标点排版 + 反例硬表八项 + 信息守恒白名单，UI 界面串不适用、全节人工判据不进 grep）；批 2 待做 = 检查器词级 warn 档（检查 6，rg 命中数先行收敛词表）+ 对外长文句式级复查；上游 skill 不装、测量脚本不移植、统计数字不引。与 DESIGN v2.50、doc/08 主篇 v2.12（§5D 计数 47→48、A–L→A–M 指针）、doc/02 v4.164、AGENTS v1.71、README v1.50 同批。本批本机零验证，CI 裁决 |
| v1.2 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"你去做新的工单"指令） | **CK-1 批 1 后台任务平面（bash 半边）交付**（doc/02 v4.171）——卡内勾选与范围注记见 §2 CK-1；同批附带 CK-1 typecheck 修复（c98d7a0）。行序补记：本行此前漏加（CK-1 交付提交的 doc/02 v4.171 行已引用 v1.2，实际版本表未落——本行补账） |
| v1.3 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"继续"指令） | **CK-3 循环护栏交付**（run-loop 内存态观察器；六信号 + steer 纠偏 + 连环升级 E_RUNAWAY_LOOP；单测 11 例）——卡内勾选与范围注记见 §2 CK-3。同批 CK-1 typecheck 修复（c98d7a0）。与 doc/02 v4.172 同批 |
| v1.4 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"继续"指令） | **CK-2 批 1 Hooks 挂点矩阵交付**（4→13 点 + pre_tool_use 阻塞拦截 E_HOOK_BLOCKED；单测 7 例）——卡内勾选与批 2 留卡见 §2 CK-2。与 doc/02 v4.173 同批 |
| v1.5 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"继续"指令） | **CK-7 溢出即压缩交付**（E_LLM_OVERFLOW 分类桶 + run-loop 反应式压缩重试一次；直调 runTurn 闭环单测 8 例）——卡内勾选见 §2 CK-7。与 doc/02 v4.174 同批 |
| v1.6 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-9 Unicode 隐写防御交付**（unicode-sanitize 纯函数 + IoGuard/MCP 入参两点接入；单测 12 例）——卡内勾选见 §2 CK-9。同批附带 0e69478 lint 红 5 条修复（hooks-matrix 未用 import + overflow-compact 四个无 await async stub）。与 doc/02 v4.175、CHANGELOG 同批 |
| v1.7 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-14 无头模式结构化输出交付**（--output-schema 校验面 + --resume-last 免记 id 续跑；单测 8 例）——卡内勾选见 §2 CK-14。与 doc/02 v4.176、CHANGELOG 同批 |
| v1.8 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-15 @-mention 上下文注入交付**（mention.ts 引擎侧单源 + user.message 通道取舍；单测 8 例）——卡内勾选见 §2 CK-15。与 doc/02 v4.177、CHANGELOG 同批 |
| v1.9 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-8 prompt cache 落地**（sessionId 透传 + promptCache 开关 + settings 字段；单测 2 例）——卡内勾选见 §2 CK-8（含"断点策略 pi-ai 已内置、engine 只欠透传"的事实登记）。与 doc/02 v4.178、CHANGELOG 同批 |
| v1.10 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-5 批 1 MCP 韧性三小件交付**（描述截断 / needs-auth 15min 缓存短路 / 会话过期重连；单测 5 例）——卡内勾选见 §2 CK-5。与 doc/02 v4.179、CHANGELOG 同批 |
| v1.11 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-10 edit 容错匹配交付**（三级渐进 + CRLF 保持 + is_exact 上报 + DiffViewer 形状补齐；单测 8 例）——卡内勾选见 §2 CK-10。同批附带 CI 修复批：跨 4 提交的 9 处 typecheck 错一次清零（子代理取证：mentionExpand 返回形状 / gateway cacheEnabled 字段声明漏 / manager oldClient 收窄 / mcp.test import 三处 / unicode 断言重叠）。与 doc/02 v4.180、CHANGELOG 同批 |
| v1.12 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-6 批 1 结构化提问交付**（ask_user 工具 + QuestionBoard + 两事件词表 32 种 + web QuestionCard + Transport/server 全链；CLI 只读）——卡内勾选见 §2 CK-6。与 doc/02 v4.181、CHANGELOG 同批 |
| v1.13 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-4 批 1 会话任务清单交付**（todo.updated 事件 + todo_write/todo_read + nudge 收窄版；词表 33 种；单测 5 例 + reducer 3 态）——卡内勾选见 §2 CK-4。与 doc/02 v4.182、CHANGELOG 同批 |
| v1.14 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-11 ToolSearch 延迟加载交付**（deferred 双入口判定 + tool_search 检索/显现 + 广告面过滤；单测 8 例）——卡内勾选见 §2 CK-11。与 doc/02 v4.183、CHANGELOG 同批 |
| v1.15 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-12 批 1 压缩后状态复灌交付**（rebuildState 端口 + todo/deferred 清单复灌；单测 3 例）——卡内勾选见 §2 CK-12。与 doc/02 v4.184、CHANGELOG 同批 |
| v1.16 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-13 批 1 present 交付声明交付**（present 工具 + deliverables.presented 事件词表 34 种；单测 4 例）——卡内勾选见 §2 CK-13。与 doc/02 v4.185、CHANGELOG 同批 |
| v1.17 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-17 批 1 声明式安全六维交付**（ToolSafety 五维 + concurrentSafe 调度消费 + 迁移补声明；单测 3 例）——卡内勾选见 §2 CK-17。与 doc/02 v4.186、CHANGELOG 同批 |
| v1.18 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-17 批 2 riskLevel 消费交付**（PermissionCheck 透传 + high 档 reason 附加；单测 2 例）——卡内勾选见 §2 CK-17。与 doc/02 v4.187、CHANGELOG 同批 |
| v1.19 | 2026-10-01 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-12 批 2 部分交付：最近读取文件清单复灌**（readFileState 上提共享 + rebuildState 第三段；单测 4 例）——卡内勾选见 §2 CK-12。与 doc/02 v4.188、CHANGELOG 同批 |
| v1.20 | 2026-10-02 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"那你先把你能做的做完"） | **CK-13 批 2 web 交付卡片交付**（slice.deliverables reducer/merge + DeliverablesDialog + 顶栏入口；reducer 测试）——卡内勾选见 §2 CK-13。与 doc/02 v4.189 同批 |
| v1.21 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"继续把你该做的做完"指令） | **CK-13 批 2 CLI 交付卡交付，批 2 四端收口**——MessagePane live 区尾部 gray 只读行（`✓ 交付文件 N 个[：summary]`；slice 级「最后一次声明生效」投影，有声明才渲染禁假状态；mobile BannerRow 同款语义）+ render 测试 1 例（无声明不渲染/计数+summary/无 summary 不造默认句）。卡内勾选见 §2 CK-13。同批顺手：knip 首裁两条未使用导出类型去 export（PendingAttachment/FluidWallpaperId，同 ea8d188 判例；b0343e6）。与 doc/02 v4.196 同批。本批本机零验证，CI 裁决 |
| v1.22 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"继续把你该做的做完"指令） | **19.48 批 2 交付收口**（检查 6 词级 warn 档 + 句式级复查零增量 + 词表收敛结论）——卡内勾选见 §3。同批：terminal-shell.ts 平台路径根修（`node:path/win32`，19.32 批 1 的 CI Linux 三红，run 37116141358 取证）。与 DESIGN v2.52、doc/02 v4.197、AGENTS v1.74 同批。本批本机零验证，CI 裁决 |
| v1.23 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"继续把你该做的做完"指令） | **CK-6 批 2 交付收口**（CLI 交互作答 + mobile/miniapp 作答卡 + preview 聚焦预览按 description 承担的登记差异）——卡内勾选见 §2 CK-6。**里程碑：CI 首次全链真绿**（run 37118898435，eval/build 两关自立项以来首次真正裁决通过）；沿途清偿被红窗口掩盖的积债——miniapp 置顶段夹具写死纪元时间戳（7af75d3）、mobile manage.test 落错 runner（vitest 导入 vs jest 全局，5f9bd96）与 manage 判据两处真 bug（treeRowsOf 孤儿/环空返回 + contenderLineOf NaNs，90f0b6b）。与 doc/02 v4.198 同批。本批本机零验证，CI 裁决 |
| v1.24 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"继续把你该做的做完"指令） | **CK-5 批 2 第一步交付**（OAuth 判据与令牌仓；流程装配留第二步）——卡内勾选见 §2 CK-5。同批类型修复：QuestionCard onReply 统一双参（f050e76）。与 doc/02 v4.199 同批。本批本机零验证，CI 裁决 |
| v1.25 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"继续把你该做的做完"指令） | **CK-5 批 2 第二步交付**（auth-flow.ts 授权流程装配；manager 集成与面板动作留第三步）——卡内勾选见 §2 CK-5。与 doc/02 v4.200 同批。本批本机零验证，CI 裁决 |
| v1.26 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"把远端的报错都解决就继续做接下来的工单"指令） | **CK-5 批 2 第三步交付 + CK-2 批 2 部分交付**（OAuth 装配收口 / hooks 改写输入·超时档·子代理双挂点）——卡内勾选见 §2 CK-5 与 CK-2。沿途 CI 修复：knip 四条去 export（33df283）、Transport 方法计数锚点 92→93（startMcpAuth 新增，doc/08 与 official page 两处——检查 5.5/检查 7 锚定）。与 doc/02 v4.201 同批。本批本机零验证（例外：openapi 生成器重跑是工作产物），CI 裁决 |
| v1.27 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"继续"指令） | **三卡 CI 绿验收收官**（run 37130995113：mcp-oauth 11 / mcp-auth-flow 6 / mcp.test +4 / hooks-matrix +3 / background-task +2 首裁全过，eval/build 同轮通过）——CK-5 批 2 三步全收口（真实 OAuth server 走查留用户）、CK-2 批 2 部分交付、CK-1 批 2 第一片。沿途七轮 CI 修复闭环：knip 去 export ×4、测试断言全角括号、storage-paths 契约登记、Transport 锚点 92→93、TS2729/TS2565 字段次序 ×2、生成物漏跑 gen:events（判例二次）、inprocess Promise 面、task.started kind 两族化 + makeTaskTools 三元组、register 断言竞态 vi.waitFor。与 doc/02 v4.202 同批。本批本机零验证（例外：openapi/契约/词表页三个生成器重跑是工作产物），CI 裁决 |
| v1.28 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"继续吧"指令） | **CK-1 批 2 第二片交付（agent 后台化执行体）**——卡内勾选见 §2 CK-1（CI 绿 run 37169069928，引擎级 e2e 后台化全链首裁过）。与 doc/02 v4.203 同批。本批本机零验证，CI 裁决 |
| v1.29 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"go on"指令） | **CK-1 批 2 尾片交付（task.progress live + slice.tasks 投影）**——卡内勾选见 §2 CK-1（new-event-type 全流程：词表 35 种 + 三生成物重跑 + 六处锚点同改）。与 doc/02 v4.204、AGENTS v1.75、README v1.53、ARCHITECTURE v1.73 同批。本批本机零验证（例外：生成器重跑是工作产物），CI 裁决 |
| v1.30 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"go on"指令持续） | **CK-1 批 2 数据面三片 CI 绿验收收官**（run 37173002829：词表 35 种全链 test/eval/build 通过）。沿途六轮 CI 修复闭环：穷举样例表补 task.progress（编译期防线按设计接住）、backgrounded 变量补定义、doc/03 副锚点与 official eventTypes 事实常量 34→35、applyEvent 夹具补 notified、events.test 计数断言 34→35（第五处计数漏改——掩盖链三轮 typecheck bail 后 test 首裁暴露）。四端任务卡渲染留卡（纯 UI 片）。与 doc/02 v4.204 同批。本批本机零验证，CI 裁决 |
| v1.31 | 2026-10-03 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与指令：晚风（Wanfeng1028，"继续"指令） | **CK-1 批 2 四端任务卡渲染交付，批 2 全卡收口**（web TasksDialog + 顶栏入口 / CLI 灰行 / mobile+miniapp 只读条；slice.tasks 数据面批 2 已就绪，本片纯渲染）——卡内勾选见 §2 CK-1（CI 绿 run 37175161712）。沿途修复：幂等补丁漏带 import、TaskRow 去 export、CLI 行转义层级收敛。本批本机零验证，CI 裁决 |
| v1.0 | 2026-09-27 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与决策：晚风（Wanfeng1028，"能抄的全部写进工单"指令） | 初稿：可抄挖掘批 **CK-1~17** 立项。来源 = 四路子代理在线调研（全程 gh api/raw 直读，§2.12 禁克隆合规）：claude-code-analysis（AGENTS §6.1 v1.69 翻案后纳入）、MiniMax-AI/minimax-code、pi（earendil-works/pi）、deepseek-ai/deepseek-harness、opencode（anomalyco/opencode，已从 sst 迁移）、google-gemini/gemini-cli、openai/codex、xai-org/grok-build、openclaw/openclaw、qwenlm/qwen-code。doc/12 §12 遗漏未入池两条一并收录：hook-broker 竞速（并入 CK-2）、工具声明式安全六维（CK-17）。评估后不入池六项判决见附录。与 AGENTS v1.70、doc/02 v4.156、doc/08 v2.08 同批。本批纯规划零代码，本机零验证，CI 裁决 |

## 0. 批次说明

- **编号 = 建议执行顺序**（已按价值降序：多源独立收敛的排前）。优先级：P0 下一程先做 / P1 排队 / P2 观察后排 / P3 触发条件驱动。
- 每条候选都经三重排除后保留：Spark 已有清单、已立项工单（微压缩/alwaysAsk/输出续写/resolveInput/Stream Recovery/checkpoint git 隐藏提交/输入 CAS+hook 信任门/fig 注册表）、已判决不做（JSONL→SQLite/Vercel AI SDK/OpenTUI/多用户公网/Effect-RxJS）。
- 许可证口径：Claude Code 泄露源码按 §6.1（可抄，落仓按本仓风格重写）；MiniMax Code 第一方 MIT（third_party/sandbox-runtime 与 Pi 派生目录保留原声明）；pi/dsh/opencode/OpenClaw MIT；Gemini CLI/Codex/Grok Apache-2.0。Rust 实现（Codex/Grok）按"翻译思路"重写。
- 与 ZC-1~4（doc/02 §8 ZC 表，微压缩/alwaysAsk/输出续写/resolveInput）并行无冲突；ZC-Q1~Q4 待拍板项不受本批影响。

## 1. 索引

| 编号 | 工单 | 来源 | 优先级 | 成本 |
| --- | --- | --- | --- | --- |
| CK-1 | 后台任务平面（run_in_background + TaskOutput/TaskStop + 完成通知回注） | Claude Code + MiniMax + Grok + OpenClaw | P0 | M（批 1 bash）/ L（批 2 agent） |
| CK-2 | Hooks 全生命周期事件面（12 挂点 × command 形态 + hook-broker 竞速） | Claude Code + MiniMax + doc/12 #3 | P0 | M |
| CK-3 | 循环/空转指纹检测与 steer 纠偏 | MiniMax runaway-guard + Gemini CLI | P0 | M |
| CK-4 | TodoWrite/TodoRead 会话任务清单 + 验证 nudge | Claude Code + dsh + opencode | P1 | M |
| CK-5 | MCP 韧性四小件（截断/认证缓存短路/过期重连/OAuth） | Claude Code + Gemini CLI | P1 | S（批 1）+ M（批 2） |
| CK-6 | AskUserQuestion 结构化提问工具 | Claude Code | P1 | M |
| CK-7 | 溢出即压缩（context-overflow 分类 → 反应式压缩重试） | opencode | P1 | S |
| CK-8 | prompt cache_control 自动断点策略 | opencode + pi | P1 | S-M |
| CK-9 | Unicode 隐写防御（递归脱敏） | Claude Code | P1 | S |
| CK-10 | edit 容错匹配（fuzzy 归一 + CRLF 保持 + is_exact 上报） | pi | P2 | S-M |
| CK-11 | ToolSearch 延迟工具加载 | Claude Code | P2 | M |
| CK-12 | 压缩后状态复灌 + 滚动会话摘要 | Claude Code | P2 | M |
| CK-13 | turn 级变更交付面（workspace-changes + present 工具） | dsh | P2 | M |
| CK-14 | 无头模式结构化输出（--output-schema + resume --last） | Codex | P2 | S |
| CK-15 | @-mention 文件/目录上下文注入 | Gemini CLI | P2 | S |
| CK-16 | ACP 服务端（编辑器标准协议接入） | MiniMax（协议重写） | P3 | M |
| CK-17 | 工具声明式安全六维（一处声明处处消费） | doc/12 §12 #6（ZCode） | P2 | M |

## 2. 工单卡

### CK-1 后台任务平面：run_in_background + TaskOutput/TaskStop + 完成通知回注（P0）

**出处**：Claude Code src/tools/BashTool/BashTool.tsx（run_in_background 参数；detectBlockedSleepPattern 拦截 `sleep 300` 类阻塞命令强制转后台并给改写建议；assistantAutoBackgrounded 前台阻塞预算超限自动后台化，回执带任务 id 与输出路径）+ src/tasks.ts 统一 Task 注册表（shell/agent 两族 + TaskOutput/TaskStop/TaskList）+ src/coordinator/coordinatorMode.ts 的 task-notification 完成回注；MiniMax packages/agent-modules/background-task/src/manager.ts（前台 60s 无返回自动后台化、task_output 按字节偏移续读、首响应 24KiB 头尾预算）；Grok Build task/task_output/wait_tasks/kill_task 工具族；OpenClaw heartbeat 的 notifyOnExit 定向唤醒。

**Spark 缺口**：bash 常驻池是交互式池化（无模型侧后台语义）；task 子代理同步阻塞等最终文本；无任何"完成后主动唤醒主会话"机制。

**内容**：① bash 工具增 runInBackground 入参 + 前台阻塞预算（超时自动转后台返回 task id）；② TaskOutput（字节偏移续读 + 首响应头尾预算 + 溢写引用）/ TaskStop 工具族；③ 后台任务完成 → 经输入队列以 delivery=queue 回注系统通知，驱动主会话主动汇报一轮（复用 19.22 交付语义）；④ task 子代理后台化（返回 task id，完成后回注 + SendMessage 续聊）；⑤ task.started/progress/completed 事件面（durable/live 归类按词表纪律评估，走 new-event-type 全流程）。

**验收**：单测（后台化/预算转后台/偏移续读/完成回注入队/TaskStop 中断事件对）+ 四端任务卡展示；真实长命令走查留用户。**依赖**：无；与 ZC-Q1 正交。**分批**：批 1 = bash 半边（M）；批 2 = agent 半边（L）。**✅ 批 1 已交付（2026-10-01，doc/02 v4.171）**——bash `runInBackground` + 60s 前台预算自动转后台 + `task_output`（24KiB 头尾预算/偏移续读/会话隔离）/`task_stop` 两工具 + `BackgroundTaskManager`（task.started/completed 两事件 durable 非 surface；完成经输入队列 delivery=queue 回注，goal 续跑同通道）+ engine 6 例单测。**批 1 范围收窄登记**：⑤ 事件面只落 started/completed，`task.progress`（live 流式尾随）随批 2 四端任务卡一起（拉取模型已覆盖功能需要）；④ agent 后台化与 TaskList 为批 2。**⚙️ 批 2 第一片交付（2026-10-03，doc/02 v4.202）**——注册表两族化（kind bash/agent，缺省 bash 批 1 逐字节兼容）+ task.started 事件 kind 槽位超集扩展 + list() 会话隔离清单 + task_list 工具（工厂三元组第三位）+ 测试 2 例（CI 绿验收 run 37130995113；同批修 register 事件断言竞态——emit 排会话 tail 异步落，同步断言需 vi.waitFor）。**✅ 第二片交付（2026-10-03，doc/02 v4.203；CI 绿 run 37169069928）**——④ agent 后台化执行体：task 增 runInBackground（后台注册 kind:'agent' 任务即回 taskId + 指引），subagent 拆启动/收尾两段（turn 收尾闭包续跑 → manager.complete 结清：task.completed + 回注通道驱动父会话汇报；部分输出经 lastText 闭包实时可读——task_output 运行中即有内容），E_TASK_NO_PLANE 未接线如实拒绝，abort 级联与 TaskStop 树杀全路径保持，subagent_stop 挂点改显式路径触发（后台早退 finally 时机错误）；引擎级 e2e 1 例（脚本消费序竞态免疫设计：step2 两栖/step3 恒回注汇报）。SendMessage 续聊：子会话本就可经 POST /api/sessions/:id/messages 寻址（回注文本带 taskId 指引），无新增线。**✅ 尾片交付（2026-10-03，doc/02 v4.204）**——task.progress live-only 事件（new-event-type 全流程：词表 34→35，durable 31/live 4/surface 2；extend.ts 运行时对位 + gen-events 穷举表同改——两处漏改会让生成器把 live 归成 durable，词表页计数即错）；emit 点 = subagent 订阅 assistant.message （后台模式发全量快照，前台不发——消费者在等最终文本，progress 冗余）；reducer 三分支投影 slice.tasks（started 入列/completed 标 done/progress 尾随，未知 id 忽略竞态防线）+ session-page mergeTasks（E 清单权威 + P 尾随补回）+ web applyEvent 2 例。**四端任务卡渲染留卡**（数据面已就绪：slice.tasks 投影含 id/kind/command/done/tail——卡片是纯 UI 片，按端形态另排）。**✅ 尾片 CI 绿验收（37173002829：词表 35 种全链 test/eval/build 通过，applyEvent 2 例绿）。****✅ 四端任务卡渲染交付（2026-10-03，9ffa63e + 7f64f60/c3c027b 修复；CI 绿 37175161712）**——web 顶栏 Activity 入口 + TasksDialog（运行中/结束分态 + 分族 + 尾随首行预览；有任务才显示禁假状态；useSessionTasks 选择器带空数组常量防 zustand 不稳定快照）、CLI MessagePane 后台任务灰行（运行中/总数）、mobile BannerRow / miniapp sp-bar 只读条（deliverables 批 2 同构挂位）。**批 2 全卡至此收口**。沿途修复：幂等补丁第二轮漏带组件 import（TS2304）、TaskRow 去 export（knip）、CLI 行转义层级翻车改纯计数行（§2.13 同型第五次——fromCharCode 绕道后仍收敛为无转义形态）。

### CK-2 Hooks 全生命周期事件面：12 挂点 × command 形态 + hook-broker 竞速（P0）

**出处**：Claude Code src/entrypoints/sdk/coreTypes.ts（HOOK_EVENTS 全量：PreToolUse/PostToolUse/PostToolUseFailure/UserPromptSubmit/SessionStart/SessionEnd/Stop/SubagentStart/SubagentStop/PreCompact/PostCompact/PermissionRequest 等）+ src/utils/hooks/（命令 hook 经 stdin/stdout JSON 协议，started/progress/response 三段事件；hook 可改写输入/拒绝/注上下文）；MiniMax plugin-hooks 的 11 点位清单与 matcher/condition/timeout 声明；**doc/12 §12 #3（hook 与审批 broker 并发竞速）**——ask 时 hook 链与确认窗竞速而非串行（同步 hook 会闷死确认窗，ZCode 注释记录过真实事故），败者 abort，hook 改写输入后强制重过权限判定。

**Spark 缺口**：user hooks 仅 tool.completed 单挂点；无 PreToolUse 拦截/改写、无会话生命周期、无压缩钩子。

**内容**：① 挂点矩阵铺设（12 挂点，engine 现有 runner.ts 扩展）；② command hook 形态（stdin/stdout JSON 协议 + matcher + condition 谓词 + timeoutMs，超时/异常 fail-closed）；③ PreToolUse 可 deny / 改写输入（改写后强制重过 zod 校验与权限判定）；④ PermissionRequest hook 与审批 broker **并发竞速**（防同步 hook 闷死确认窗）；⑤ 声明落 .spark/hooks/（项目层声明变更信任门接 ZC-Q3，未拍板前先按 settings 重启档登记）。

**验收**：挂点矩阵单测（每挂点触发/拒绝/改写重校验/竞速超时 fail-closed）+ 用户 hook 真实脚本走查留用户。**依赖**：无；ZC-Q3 拍板后补信任门。**成本**：M。**⚙️ 批 1 已交付（2026-10-01，doc/02 v4.173）**——挂点矩阵 4→13（+session.start/end、user_prompt_submit、stop、pre_tool_use、post_tool_use(_failure)、pre/post_compact）+ `fireBlocking` 阻塞形态（exit 2 拦截/E_HOOK_BLOCKED 闭合；超时不判 deny 防 DoS）+ 单测 7 例。**⚙️ 批 2 部分交付（2026-10-03，doc/02 v4.201）**——③ 改写输入：fireBlocking 增 stdout JSON 最小协议（`{"input":{...}}` 首段采信，日志噪声/非 JSON 忽略）+ pipeline effectiveInput 替换（后续权限判定与 zod 校验全部以改写值重走——改写不可越权提权；tool.started 载荷保持原始形态，completed 反映真实执行）+ runner 测试 3 例；超时=deny 可配置档（UserHookCommandDef.timeoutDeny 逐条声明，缺省不变防 hung hook DoS）；子代理双挂点（subagent_start/subagent_stop，fire-and-forget，engine 懒解引防构造序快照 undefined）。**留卡**：④ PermissionRequest hook 与审批 broker 并发竞速（doc/12 #3——涉及 permission ask 路径重构，单独立项推进）、⑤ .spark/hooks/ 项目层声明 + ZC-Q3 信任门（依赖拍板）。**CI 绿验收（run 37130995113）：hooks-matrix +3 例首裁全过。**

### CK-3 循环/空转指纹检测与 steer 纠偏（P0）

**出处**：MiniMax packages/agent-modules/runaway-guard/（六信号：exact_action_repeat / exact_result_repeat / same_error_family / abab_action_cycle / polling_repeat / unchanged_progress_repeat；工具三档策略 detect/polling/exempt；turn-local shadow state 于 finishTurn 出 summary；提醒每 turn 限一次走 steer 且文案自带防持久化子句）；Gemini CLI packages/core/src/services/loopDetectionService.ts（流式历史窗口 5000、LLM 复核间隔 15 轮、置信度阈值，命中后询问用户是否继续）。

**Spark 缺口**：run-loop 只有 step 上限/预算/失败闭合的粗粒度事后熔断；无任何重复指纹/环检测。

**内容**：① run-loop step 边界挂观察器（引擎内存态，不出协议事件）；② 六信号检测 + bash 命令归一化指纹（复用 bash-command-parser）；③ 命中 → steer 通道注入纠偏提醒（每 turn 一次）；连续命中 → 按严重度升级为询问用户（审批面）；④ 轮询类工具/命令豁免档（防误报长跑任务）。**验收**：六信号注入式单测 + 提醒限频断言 + 豁免档。**依赖**：无（提醒通道现成）。**成本**：M。**✅ 已交付（2026-10-01，doc/02 v4.172）**——`runaway-guard.ts` 六信号 + steer 纠偏（每信号每 turn 一次，防持久化子句）+ 连续 ≥2 轮命中升级 E_RUNAWAY_LOOP 终止；task_output 豁免、polling 不升级；单测 11 例。**范围注记**：③ 的「询问用户（审批面）」以 error 终止兜底——真提问面随 CK-6 结构化提问工具落地后翻升；豁免档现为静态集合（task_output），per-tool 三档策略声明（detect/polling/exempt）登记为后续小件。**✅ 已交付（2026-10-01，doc/02 v4.172）**——`runaway-guard.ts` 六信号 + steer 纠偏（每信号每 turn 一次，防持久化子句）+ 连续 ≥2 轮命中升级 E_RUNAWAY_LOOP 终止；task_output 豁免、polling 不升级；单测 11 例。**范围注记**：③ 的「询问用户（审批面）」以 error 终止兜底——真提问面随 CK-6 结构化提问工具落地后翻升；豁免档现为静态集合（task_output），per-tool 三档策略声明（detect/polling/exempt）登记为后续小件。

### CK-4 TodoWrite/TodoRead 会话任务清单 + 验证 nudge（P1）

**出处**：Claude Code TodoWriteTool（todos 按 session 键控；**verificationNudgeNeeded**——主线程关掉 3+ 项却无任何验证步骤时，tool_result 注入"先派验证代理，不许用列举 caveat 冒充完成"的结构化 nudge）；dsh packages/todo（整表替换 + 会话日志事件持久 + 宿主常驻计划展示）；opencode session/todo（DB 表 + Updated 事件）。

**Spark 缺口**：无清单类工具（task 是子代理非清单）；无验证强制机制。

**内容**：① protocol 新事件 todo.updated（durable；surface 归类按词表纪律评估，走 new-event-type 全流程）；② 工具 todo_write（整表替换）+ todo_read；③ 验证 nudge（关 3+ 项且本 turn 无验证类工具调用 → tool_result 注入提醒文案）；④ 四端面板（web TodoPanel / CLI 区块 / mobile+miniapp 只读行）。**验收**：reducer 单测 + nudge 触发条件单测 + 四端投影。**依赖**：无。**成本**：M。**✅ 批 1 已交付（2026-10-01，doc/02 v4.182）**——① todo.updated 整表快照事件（durable 非 surface；词表 33 种；reducer 落 slice.todos 回放即重建）；② todo_write（整表替换 ≤50 项）/ todo_read 两工具（TodoBoard 内存表 + emit 事件持久化；失败闭合不落内存）；③ nudge 收窄版——单次写入新完成 ≥3 即注入提醒（**登记差异**：判据不做"本 turn 无验证调用"检查——本仓工具间无 turn 历史访问面，保守方向不漏报）；④ 四端面板批 2（本批 slice.todos 投影已就绪）。单测 5 例 + reducer 3 态。

### CK-5 MCP 韧性四小件（P1，批 1 三小件 S / 批 2 OAuth M）

**出处**：Claude Code src/services/mcp/client.ts（MAX_MCP_DESCRIPTION_LENGTH=2048 截断；mcp-needs-auth-cache 认证失败 15 分钟内同 server 全部短路，防百级并发同时刷 token 雪崩；isMcpSessionExpiredError——HTTP 404 / JSON-RPC -32001 → 清连接缓存自动重连）+ auth.ts OAuth；Gemini CLI packages/core/src/mcp/oauth-provider.ts（PKCE + 动态客户端注册 + refresh）。

**Spark 缺口**：mcp client 只有 stdio+streamable-http + 静态 headers；无截断、无失败缓存、无过期重连、无 OAuth。

**内容**：批 1：① 工具描述装配时 2048 截断（防 OpenAPI 型 server 挤爆上下文）；② needs-auth 缓存短路（15min）；③ 会话过期自动重连。批 2：④ OAuth（PKCE + 动态注册 + refresh + token 存储 0o600 走 secrets 纪律 + /mcp auth 命令面）。**验收**：三小件注入式单测 + OAuth 全流程走查留用户（真实 OAuth server）。**依赖**：无。**成本**：S + M。**✅ 批 1 已交付（2026-10-01，doc/02 v4.179）**——① MAX_MCP_DESCRIPTION_LENGTH=2048 截断 + [截断] 标注；② needs-auth 特征（401/403/unauthorized 等）→ 15min 缓存短路（E_MCP_AUTH_CACHED，McpManagerDeps.now 注入可测）；③ 会话过期特征（404/-32001）→ reconnectServer（registry.replace 换绑工具闭包到新 client；本次调用如实报 E_MCP_RECONNECTED——当前闭包持旧 client，就地重试必然再败，不做假成功）。单测 5 例。批 2 OAuth 留卡。**✅ 批 2 第一步已交付（2026-10-03，doc/02 v4.199）**——判据与存储层：oauth.ts（PKCE S256 对 / RFC 8414 元数据子集解析 / 授权 URL 构造 / token 交换与刷新 / 动态客户端注册 RFC 7591 / 到期余量判定；fetch 注入判据层零 I/O，单测 9 例 fetch 打桩断言请求形状）+ token-store.ts（~/.spark/mcp-tokens.json，server → token set，0o600 原子写同 secrets 口径，坏 JSON 拒收）+ SPARK_FILE 增 mcpTokens 键。**✅ 第二步已交付（2026-10-03，doc/02 v4.200）**——auth-flow.ts 流程装配：runAuthFlow 编排（元数据 → 动态注册或静态 client → loopback 授权 → state 对账 → token 交换；loopback 随机口全程固定保证注册/授权 redirectUri 一致；总超时 5min fail-closed；默认浏览器唤起与 node:http loopback 副作用全注入，单测 6 例桩回路逐段断言）。**✅ 第三步已交付（2026-10-03，doc/02 v4.201）**——manager 集成：tokens/oauthFetch/oauthOpenBrowser 三注入位 + Bearer 头进 streamable-http requestInit（用户 headers 同键优先）+ 临期静默刷新（tokenEndpoint 随仓落盘免二次发现；失败沿用旧令牌如实 warn，401 走批 1 闭环）+ startAuth 后台授权发起（运行中防抖，成功落仓重连）；触发面：engine.startMcpAuth + POST /api/mcp/:server/auth （false→409 如实）+ Transport 三实现对等（HttpTransport/MockTransport/InProcess）+ web MCP 面板「认证」动作 + config oauth 字段（PUT 掩码合并与读回掩码——clientSecret 单值掩码同 env 纪律，删字段=清值整文件语义）+ openapi 81 路径重生成 + mcp.test 4 例。**真实 OAuth server 全流程走查留用户（卡面验收原口径）**；已知边界：令牌过期且刷新失败后的 401 会进批 1 的 15min 短路（不自动重授权），重授权走面板再触发。**✅ 批 2 收口（2026-10-03，CI 全绿 run 37130995113：mcp-oauth 11 例 / mcp-auth-flow 6 例 / mcp.test +4 例首裁全过）——三步判据/流程/装配全落，真实 OAuth server 全流程走查留用户。**

### CK-6 AskUserQuestion 结构化提问工具（P1）

**出处**：Claude Code `src/tools/AskUserQuestionTool/`（1-4 问 × 每问 2-4 选项，label/description/preview 聚焦预览，multiSelect，用户可附 notes；提问走权限管线渲染；requiresUserInteraction + shouldDefer 标记；答案结构化回给模型）。

**Spark 缺口**：无此工具；exit_plan_mode 只覆盖计划审批一种交互，模型需要决策时只能自由文本追问。

**内容**：① 新工具 ask_user（zod input：questions 数组封闭形状）；② 复用审批挂起通道渲染（选项按钮 + 预览 + 多选 + 备注，超时 fail-closed 同审批纪律；未连接任何端时如实报错不假装已问）；③ 答案结构化进 tool result 回模型；④ 四端渲染 web/CLI 先行，mobile/miniapp 跟随。**验收**：工具单测（形状/超时 fail-closed/答案回环）+ web/CLI 渲染走查。**依赖**：无。**成本**：M。**✅ 批 1 已交付（2026-10-01，doc/02 v4.181）**——① ask_user 工具（1-4 问 × 2-4 封闭选项 + 多选/备注；action question.ask 四档预置 allow——提问无副作用，再走审批门是递归死锁；会话/用户层显式 deny 仍可拦）；② **独立 QuestionBoard 挂起表**（卡面"复用审批挂起通道"落地为同纪律不复用实现：超时复用 permissionTimeoutMs / abort 级联 / disposeAll fail-closed——裁决主体是用户选择而非权限策略，不进权限审计流）；③ 答案结构化 toolResult 回模型；④ 两枚新事件 question.asked/resolved（词表 32 种）+ Transport.replyQuestion + POST /api/questions/:requestId（80 路径）+ web QuestionCard（选项点选/多选/备注/提交）+ CLI 只读呈现；mock 脚本覆写对等 + sdk inprocess 直映射。单测：事件 round-trip 32 种 + reducer 两态。**批 2 留卡**：CLI 交互作答（选项键选）+ mobile/miniapp 渲染 + preview 聚焦预览。**✅ 批 2 已交付（2026-10-03，doc/02 v4.198）**——① CLI 交互作答：QuestionPrompt 作答框（数字 1-4 直达——单选即推进/多选 toggle，Enter 推进/提交，经 replyQuestion 回挂起表；审批挂起让位同键位序；`questionApplyKey` 纯函数键位逻辑渲染分离，单测 3 例；MessagePane 滤挂起提问与审批同款专渲纪律）；② mobile+miniapp 作答卡：QuestionCard（单选直选/多选 toggle/全答出提交钮，失败保留已选内联报错，成功由 resolved 事件翻牌；ApprovalCard 同构）+ MiniRestClient.replyQuestion（POST /api/questions/:requestId 四端同端点）；③ **preview 聚焦预览登记差异**：ask_user schema 选项只有 label/description（无 preview 字段），按 description 承担——已选/焦点项 description 提亮同行，未选项只留 label，不扩 schema。

### CK-7 溢出即压缩：context-overflow 分类 → 同 turn 反应式压缩重试（P1，S）

**出处**：opencode packages/llm/src/provider-error.ts（28 条 "prompt is too long / context window exceeded / request_too_large" 归一化正则 + rate-limit 排除表；isContextOverflow 判定 400/413）。

**Spark 缺口**：pi-gateway.ts 的 FATAL_PATTERN 把 invalid_request_error 一律判 fatal；上下文超窗是确定性错误，不该让整 turn 失败闭合。

**内容**：① 错误分类加 context-overflow 桶（正则表照抄重写）；② run-loop 捕获后同 turn 触发既有 compaction → 重注入重试**一次**（每 turn 限一次，再溢出仍 fatal——失败闭合不变）；③ 与水位前瞻压缩、已立项微压缩、ZC-Q1 Stream Recovery 三者正交（错误驱动 vs 阈值驱动 vs 粒度 vs 流断恢复）。**验收**：分类单测 + 溢出→压缩→重试一次→二次溢出 fatal 的闭环单测。**依赖**：无。**成本**：S。**✅ 已交付（2026-10-01，doc/02 v4.174）**——E_LLM_OVERFLOW 分类桶 + run-loop 反应式压缩重试一次（二次溢出 fatal 失败闭合不变）；单测 8 例。

### CK-8 prompt cache_control 自动断点策略（P1，S-M）

**出处**：opencode packages/llm/src/cache-policy.ts（auto = 最后一个工具定义 + 最后一个 system part + 最新 user 消息三处 CacheHint 断点；RESPECTS_INLINE_HINTS 集合外协议整段跳过）；pi 的 openai prompt-cache key（≤64 截断）。

**Spark 缺口**：engine 全仓无 cache_control 注入；cost-tracker 已有 cacheRead/cacheWrite 记账但请求侧从不打缓存标记——长会话输入费用大头，Anthropic 缓存读 0.1x 定价。

**内容**：LlmGateway 出站装配加 auto 断点策略（三断点；OpenAI 走 prompt_cache_key；不支持的 provider 跳过）+ spark.json 开关（缺省开）。**验收**：装配单测（断点位置/provider 跳过/开关）+ 用 cost-tracker 缓存分量验证命中。**依赖**：无。**成本**：S-M。**✅ 已交付（2026-10-01，doc/02 v4.178）**——落地比卡面预想窄：**断点策略 pi-ai 0.84 已内置**（Anthropic cache_control system+messages 自动断点、OpenAI prompt_cache_key 官方端点自动路由，缺省 retention=short）；engine 缺口实为**从未透传 sessionId 与开关**。落地：StreamRequest.sessionId（run-loop 传 sid——Anthropic cacheSessionId / OpenAI prompt_cache_key 路由）+ PiGatewayDeps.cacheEnabled getter（config.spark.engine.promptCache 热档，false=显式 none）+ protocol settings 字段。单测 2 例（透传/关闭）。usage.cacheRead/cacheWrite 映射与 cost-tracker 记账早已贯通（280 行映射 + D28 成本看板），命中验证随真实 provider 走查。

### CK-9 Unicode 隐写防御：递归脱敏（P1，S）

**出处**：Claude Code src/utils/sanitization.ts（partiallySanitizeUnicode：NFKC + 剥 Unicode Cf/Co/Cn 类 + 零宽/方向控制字符显式范围 + 迭代上限 10；recursivelySanitizeUnicode 连 object key 都脱敏；文件头注释引用 HackerOne #3086545——ASCII smuggling 经 MCP 注入 Claude Desktop 的真实案例）。

**Spark 缺口**：mcp client、browser.read、memory 检索、bash 输出多个外部内容进模型上下文的通道，零防御。

**内容**：纯函数脱敏模块（照设计重写）+ 接入面：MCP 工具输入/输出、browser.read 正文、memory 检索结果、bash 输出（guard.ts 管线点一次覆盖）。**验收**：纯函数单测（各类不可见字符/嵌套对象/迭代上限）+ 接入面抽查。**依赖**：无。**成本**：S。**✅ 已交付（2026-10-01，doc/02 v4.175）**——`unicode-sanitize.ts` 纯函数（NFKC + Cf/Co/Cn/零宽/方向控制 + 迭代上限 10）+ 接入面收敛为两点：IoGuard.sanitizeString 头部（**全部工具输出一次覆盖**——bash/MCP/browser.read/memory 检索都是工具输出，注入/密钥扫描改在消毒后文本上跑）+ MCP callTool 入参（模型→server 方向）。静默消毒（不发 warning——被剥字符按定义不可见；emoji ZWJ 序列连接符随 Cf 剥除降级为分离码点，登记语义）。单测 12 例。

### CK-10 edit 容错匹配：fuzzy 归一 + CRLF 保持 + is_exact 上报（P2，S-M）

**出处**：pi packages/coding-agent/src/core/tools/edit-diff.ts（normalizeForFuzzyMatch：NFKC + 智能引号→ASCII + 七种连字符归一 + NBSP/全角空格 + 逐行 trimEnd，渐进匹配；detectLineEnding/restoreLineEndings 保 CRLF；多段 MatchedEdit）。

**Spark 缺口**：edit.ts 裸 indexOf 精确匹配——模型给的 old_string 常带智能引号/NBSP/行尾空白差异，E_NOT_FOUND 失败率高。

**内容**：纯函数匹配层（精确 → 逐行 trimEnd → 全归一渐进）；CRLF 检测与回写保持；匹配结果带 is_exact 标记进 tool.completed output（非精确命中前端可提示）。**不碰 ZC-5 read-state 守卫**（守卫在匹配前已过）。**验收**：匹配策略单测 + CRLF 文件回写不翻行尾断言。**依赖**：无。**成本**：S-M。**✅ 已交付（2026-10-01，doc/02 v4.180）**——匹配层（exact indexOf → 逐行 trimEnd 行对齐 → normalized 全归一行对齐，区间切片替换从后往前）；CRLF 保持（detectCrlf + newString 裸 
 回写前转 
；LF oldString 经行对齐命中）；output 规整为 `{diff, path, replaced, isExact, strategy}`（顺带补齐 DiffViewer 既有形状缺口——此前 edit 返回裸字符串，diff 从未在前端显示过）；web DiffViewer 非精确命中提示行。单测 8 例（既有 2 处断言形状同步）。

### CK-11 ToolSearch 延迟工具加载（P2）

**出处**：Claude Code `src/tools/ToolSearchTool/`（工具声明 deferred 后不进初始 schema；模型 query 检索 + select:name 显现；精确名快路径、server 前缀匹配、searchHint 打分、描述 memoize 失效）。

**Spark 缺口**：mcp client 全量加载工具 schema 进上下文——OpenAPI 型 server 动辄 15-60KB 描述。

**内容**：① ToolDefinition 增 deferred 位（MCP server per-server 配置或按广告面总字节阈值自动 deferred 化）；② tool_search 工具（query/select）；③ 显现的动态 schema 注入下一轮广告面。**验收**：deferred 化/检索/显现回收单测 + 广告面字节断言。**依赖**：无；与 CK-5 截断互补。**成本**：M。**✅ 已交付（2026-10-01，doc/02 v4.183）**——① deferred 判定双入口：mcp.json per-server `deferTools: true` + 广告面字节阈值自动（TOOLSEARCH_AUTO_THRESHOLD 32KB，描述累计超出即自动延迟后续 server 工具）；② `tool_search` 工具（action tool.search 预置 allow——检索/显现无副作用；query 子串匹配 + `select:<名>` 显现 + 留空列全量）；③ **注册/执行面不变**（deferred 工具照常注册进 registry、权限门照走——只过滤 materialize 广告清单，显现后下一轮出现，与 hiddenTools getter 同过滤位）。单测 8 例。

### CK-12 压缩后状态复灌 + 滚动会话摘要（P2）

**出处**：Claude Code src/services/compact/compact.ts（压缩后重建：正在读的文件内文截取 + 进行中的 Plan/Skill 附件 + deferred 工具清单 delta 重新声明；PTL 剥洋葱重试——每次剥 20% 旧历史）+ sessionMemory.ts（后台 forked 子代理双阈值——token 增量 + 工具调用次数/自然断点——滚动维护会话摘要，压缩时直接复用省一次大模型调用）。

**Spark 缺口**：有水位 + 冷却的压缩，但压缩后"工作台状态"断裂（手里正读的文件、正做的计划、可用工具清单全部丢失）。

**内容**：① 压缩完成后重建状态注入摘要后缀；② 滚动会话摘要（后台子代理，压缩时复用）；③ 剥洋葱重试档。**与已立项 microcompact 正交**（microcompact 缩中间态，本单管压缩后重建）。**验收**：复灌内容单测 + 摘要复用路径单测。**依赖**：无。**成本**：M。**✅ 批 1 已交付（2026-10-01，doc/02 v4.184）**——① CompactorDeps 增可选 `rebuildState` 端口（装配层合成）：compact 完成时状态块拼进 summary 尾部（summary 即模型可见面，投影透传，零协议面）。批 1 复灌两类：**进行中任务**（todoBoard 非完成项）+ **延迟工具清单**（deferredIndex.list——压缩后 deferred 全丢，模型失忆 tool_search 可用性）。正在读文件的**内文**复灌留批 2（read-state 基线在管线实例内，需端口上提）。②③ 部分交付（2026-10-01，doc/02 v4.188）：**最近读取文件清单复灌落地**——readFileState Map 上提到 engine 构造区（管线构造注入同一实例），rebuildState 第三段列插入序最后 10 条路径（不含内文——路径在场模型可重读拿内文，省 token）；均空判定补 readPaths。**滚动摘要/剥洋葱/内文截取留卡**（滚动摘要需后台子代理调度面）。单测 4 例。

### CK-13 turn 级变更交付面：workspace-changes + present 工具（P2）

**出处**：dsh packages/deliverables/（present 工具：模型显式声明最终交付文件；workspace-changes 记录器：按 turn 从 git 工作树快照汇总变更文件与行数，产出 client-only durable 事件，turn 尾渲染变更卡片）。

**Spark 缺口**：无 turn 级"改了什么/交付了什么"汇总面（checkpoint.created 是快照通知非变更摘要；用户只能翻 tool.completed）。

**内容**：① workspace-changes 记录器（借 checkpoint 快照原料做 git diff 摘要）；② present 工具（显式交付声明）；③ durable 事件（new-event-type 全流程）→ 四端 turn 尾变更卡片。**验收**：记录器单测（变更归集/空 turn 零事件）+ present 单测 + 卡片投影。**依赖**：无。**成本**：M。**⚖️ 2026-10-01 重叠判决（登记）**：19.35 审查模式落地后（GET /:id/review——checkpoint shadow git 只读 diff 聚合 + web 双栏），① 的"变更文件与行数汇总"只读面已由其承担，不再重复建设；本单差异化收窄为 **② present 显式交付声明工具**（模型主动声明交付物 ≠ 只读聚合）与 **③ turn 尾自动汇总事件**。拆批：批 1 = present 工具 + deliverables 事件面；批 2 = turn 尾自动卡片（借 review 聚合）。待 CI 稳定后实施。**✅ 批 1 已交付（2026-10-01，doc/02 v4.185）**——present 工具（1-20 文件声明；resolveInRoot 硬边界 + 文件必须真实存在 E_DELIVERABLE_MISSING——不存在的交付物是假状态；部分缺失整单拒绝）+ `deliverables.presented` 事件（词表 34 种，durable 非 surface；模型可见面是 present 的 toolResult 回执）+ action deliverable.present 四档预置行（声明无副作用——文件已产出；**plan 档 deny**——计划模式不产出交付物）。单测 4 例。批 2 = turn 尾交付卡片（四端投影）。**✅ 批 2 web 已交付（2026-10-02，doc/02 v4.189）**——slice.deliverables reducer + session-page merge + web DeliverablesDialog（顶栏 PackageCheck 入口，**有声明才显示**禁假状态；文件清单 + 复制）+ reducer 测试。**✅ 批 2 mobile+miniapp 已交付（2026-10-02，75272fc）**——BannerRow/sp-bar 复用只读条（无声明不渲染）。**✅ 批 2 CLI 已交付（2026-10-03，doc/02 v4.196）**——MessagePane live 区尾部 gray 只读行（`✓ 交付文件 N 个[：summary]`；slice 级「最后一次声明生效」投影，有声明才渲染禁假状态；mobile BannerRow 同款语义）+ render 测试 1 例。批 2 四端收口。

### CK-14 无头模式结构化输出与免记 id 续跑（P2，S）

**出处**：Codex codex-rs/exec/src/cli.rs（--output-schema FILE：最终答案按 JSON Schema 校验；--output-last-message；codex resume --last 把位置参数重解释为 prompt——免记 session id 续跑）。

**Spark 缺口**：spark -p 已有 text/json 输出与退出码纪律，但无 schema 校验、续跑必须记 session id。

**内容**：print.ts 增 --output-schema（校验不过 exit 非零 + stderr 说明）与 resume --last；SDK/Transport 对等暴露。**验收**：schema 合格/不合格两路单测 + resume --last 单测。**依赖**：无。**成本**：S。**✅ 已交付（2026-10-01，doc/02 v4.176）**——print.ts：`--output-schema <file>`（z.fromJSONSchema 校验最终文本；合格输出格式化 JSON、不合法 JSON / 未过校验 / schema 文件非法三路各自 stderr 说明，exit 2 独立于 turn error 的 1）+ `--resume-last`（免记 session id——createdAt 降序取最近未归档会话续跑；root 随之用 sparkHome 而非临时目录，空 root 如实 E_PRINT_RESUME_EMPTY）；PrintOptions.root 测试缝；单测 8 例（schema 三路 + resume 两路 + 解析三态）。

### CK-15 @-mention 文件/目录上下文注入（P2，S）

**出处**：Gemini CLI packages/cli/src/ui/hooks/atCommandProcessor.ts（@文件/@目录解析为内容与目录树注入 + 权限检查 + shell 补全源）。

**Spark 缺口**：composer 文件树弹窗（12.5）只插入路径文本，无引擎侧内容注入。

**内容**：composer @路径补全 → 提交时展开为附件式内容注入（文件全文 / 目录树摘要；大小限额与截断；注入通道走附件/user.message 扩展，取舍工单内定）。**验收**：解析/限额/截断单测 + web/CLI 走查。**依赖**：12.5 文件树。**成本**：S。**✅ 已交付（2026-10-01，doc/02 v4.177）**——通道取舍 = **user.message 扩展**（surface 纪律天然成立：模型可见的注入就在 durable 的 surface 消息里，零新事件面）：引擎侧 `mention.ts` 单源展开，run-loop 在 user.message 落盘前调用（记忆查询仍用原始文本）；文件全文（32KB/个 + 96KB/条总量、截断标注）/ 目录浅树（深度 2、50 条）；cwd 外与不存在 token 原样保留（硬边界/禁假状态）；二进制跳过；邮箱不误吞（@ 前须行首/空白）。端侧 composer @补全（10.53）已插路径文本，零改动。单测 8 例。

### CK-16 ACP 服务端：编辑器标准协议接入（P3）

**出处**：MiniMax packages/tui/src/acp/（完整 Agent Client Protocol agent 实现：会话创建/恢复/fork、skills 与斜杠命令暴露给编辑器客户端）。

**Spark 缺口**：对外只有 REST/SSE + MCP server + SDK 三入口，无编辑器标准协议；后置池"IDE 集成"观察项（触发条件：编辑器用户群出现）。

**内容**：按 ACP 协议规范**重写**（不拷 MiniMax 的 Pi 派生目录——保留原声明）stdio agent 面。**验收**：协议一致性测试 + Zed 实接走查留用户。**依赖**：触发条件驱动。**成本**：M。

### CK-17 工具声明式安全六维：一处声明处处消费（P2）

**出处**：doc/12 §12 #6——ZCode ToolContractDeclaration 的六正交声明（readOnly / destructive / concurrentSafe / sideEffectScope / riskLevel / timeout 三元组），同时驱动调度、权限、UI、遥测。

**Spark 缺口**：ToolDefinition 只有 parallelizable 布尔 + permission.action；风险分级/破坏性/并发安全靠约定俗成，无结构化消费方。

**内容**：ToolDefinition 增六维声明位；① 调度：并行分组按 concurrentSafe/destructive 判定（替代现布尔，迁移兼容）；② 权限：riskLevel 进审批 reason 与审计；③ 超时：defaultMs/maxMs/allowCallOverride 统一进 timeout 档。**验收**：声明位编译期封闭断言 + 调度/权限消费单测 + 既有工具逐个补声明的迁移清单。**依赖**：无；是后续任何工具面工单的地基。**成本**：M。**✅ 批 1 已交付（2026-10-01，doc/02 v4.186）**——① `ToolSafety` 接口（readOnly/destructive/concurrentSafe/sideEffectScope/riskLevel 五维；**timeout 三元组不落声明位**——spark.json toolTimeoutMs 与 bash timeoutMs 已承担，留后续）；② 调度消费：group() 里 concurrentSafe === false 降级串行（**迁移兼容**：未声明 safety 的工具按 parallelizable 原语义逐字节不变）；③ 迁移补声明——read/grep（readOnly/concurrentSafe/none/low）、bash（external/high，destructive 不可断言不声明）、edit（workspace/medium）、computer.×8（destructive/concurrentSafe false/external/high）、todo_read/task_output（readOnly 并发安全）等；④ **批 2 已交付（2026-10-01，doc/02 v4.187）**——riskLevel 消费：PermissionCheck 增 riskLevel 透传（管线从 def.safety 读）→ permission.asked 的 reason 尾部附加（**仅 high**：`〔风险档：高〕`，medium/low 防噪声不加）。sideEffectScope 消费留后续（审计 schema 变更需对账）。单测 2 例。

## 3. 阶段十九追加批 M：19.48 中文长文去 AI 味规则层与硬检查扩展（2026-09-30 立项）

**立项**：晚风"融入到我们的项目里面来吧！开始写工单"指令（当日两轮在线调研与评估后拍板）。判据来源 = 外部 MIT 项目 larashero3-dotcom/lieflat-less-ai-tone（约 2.1k★，LICENSE 署名 Copyright (c) 2026 shiujan，已独立核验）——约 283 万字 AI/人类对照语料（629 篇：AI 侧 300 篇为五个 2026 世代模型各 60 篇，人类侧 329 篇公开文章）统计出的中文去 AI 味规则集：改写规则、反例硬表、信息守恒白名单、三个测量脚本。调研全程 gh api/raw 直读与 WebFetch 双通路，§2.12 禁克隆合规。**与既有线的关系**：19.44（词级禁项 + 检查 5）与 19.46（全站文案重写）清的是词；本单补句式层与"不许改"层——反例硬表与信息守恒是本仓规则体系此前没有的面，直接压在 19.44 类批量清查最容易的失败模式（过度改写）上。

**批 1（规则层，已随本批交付）**：DESIGN v2.50 新增 §12.7.1 长文正文小节——① 句式级禁项四条（空转翻案腔/概括词盖掉已有数据/翻译腔堆叠/人格化吹捧，全部带技术文档豁免："不是类型包，是运行时共享核"式实体对比句合法）；② 标点与排版四条（揭晓式破折号/空转冒号/顿号连排/序数词小标题，技术枚举与小标题冒号豁免）；③ 反例硬表八项（对照语料实测人类侧频率不低于 AI 侧，不能据此改文字）；④ 信息守恒白名单四条（只改命中处/不增事实/结构默认不动但工单与拍板优先/版本表历史行不清查）。适用边界 = 官网正文、README、CHANGELOG、apps/docs，**UI 界面串不适用**（无句式结构）。全节人工判据不进 grep——句式级规则不做语义判断必误伤技术写作。

**批 2（检查器与复查，待做）**：

1. 词级候选命中数验证：用 rg 统计候选词在检查 5 同款扫描面（`check_copy_slop` 的 `_iter_copy_code_files` + `COPY_SLOP_READMES` 三 README 正文、版本表行跳过）的命中数并逐处判定；只收"零命中或近零命中且 AI 腔专属性强"的词。候选与预判：「说到底」「说白了」（口语翻案腔，技术文档罕见，最可能入选）；「先说结论」（公告与 changelog 里人类也用，存疑）；「值得注意的是」（人类正式写作常用，预判不收）。命中不为零且不能逐处判定合法性的词一律不收——宁可少收，不误伤。
2. `scripts/check_doc_links.py` 新增检查 6（号位空缺：5 之后现有 5.5 与 7）——词级 **warn 档**：走 `report.warn`（现机制 `--strict` 才计失败，日常不挡 CI），与检查 5 的 error 档分离；扫描面复用 `check_copy_slop` 目标集，词表独立常量，不复用 `COPY_SLOP_PATTERNS`（两者失败语义不同）。DESIGN §12.8 加注记行（warn 档、扫描面、`--strict` 语义、与 §12.7.1 的判据关系）。
3. 对外长文按 §12.7.1 做句式级复查：官网 zh/en 正文、README/README.en、CHANGELOG、apps/docs。19.44/19.46 已两轮词级清查，预期增量小——有则改（信息守恒白名单生效），无则在本卡登记零增量结论。
4. 边界：不安装上游 skill（`npx skills add` 触 §2.3a）；上游 scripts/ 三个测量脚本（compare-human-ai / check-structure / check-translationese）不移植——本仓无对照语料，其"低歧义词进检查器"思路已由本批第 1-2 步吸收；上游统计数字不进本仓任何文档（计数以源码实数为准的 §4.1 纪律同样适用于外部引用）。

**验收**：批 2 = 检查 6 进 CI 且绿（warn 词表在本仓扫描面零命中或逐处豁免登记）；复查结论登记进本卡（改动文件清单或零增量）；§12.7.1 与检查 6 豁免口径互洽（版本表行、代码块、引用均不计）。**✅ 批 2 已交付（2026-10-03，doc/02 v4.197）**——① 词表收敛：四候选词在检查 5 扫描面（317 代码文件 + 三 README，版本表行跳过）**全部零命中**；「说到底」「说白了」收（口语翻案腔专属性强），「先说结论」「值得注意的是」按卡内预判不收（人类也用，宁可少收）。② 检查 6 落地：`check_doc_links.py` 增 `check_copy_slop_warn`（`report.warn` 档——日常不挡 CI，`--strict` 才计失败；扫描面复用检查 5 目标集、词表独立常量 `COPY_WARN_PATTERNS`）+ DESIGN §12.8 注记行（v2.52）。③ 句式级复查**零增量**：61 文件六族特征初筛全零命中；放宽兜底仅三处线索——apps/docs layers.md「不是功能多少，而是…」为实体对比句（§12.7.1 明文豁免，A/B 均有实体指涉且表格随即枚举）、另两处为官网组件代码注释（不在对外正文适用面），按信息守恒白名单全部不动。④ 边界遵守：未装上游 skill、未移植测量脚本、上游统计数字未入任何文档。

**开工提示词**：

> 按 doc/08-v2-roadmap-2 §3 工单 19.48 批 2 执行：先用 rg 对候选词（「说到底」「说白了」「先说结论」「值得注意的是」）在检查 5 扫描面统计命中数并逐处判定，收敛词表；再在 scripts/check_doc_links.py 新增检查 6（warn 级，扫描面与豁免复用 check_copy_slop 口径、词表独立常量），DESIGN §12.8 加注记行；然后按 DESIGN §12.7.1 对官网 zh/en、README/README.en、CHANGELOG、apps/docs 做句式级复查（信息守恒白名单生效，结构默认不动）。全程遵守 DESIGN §12.7.1 反例硬表、AGENTS §2.13（批量编辑逐处断言）与 §2.3a（零下载）；本机零验证，CI 裁决。

## 附录：评估后不入池（判决记录，防重提）

| 项 | 来源 | 判决与理由 |
| --- | --- | --- |
| Thread Goal 状态机 | MiniMax agent-modules/goal | 与 16.7 /goal（D33 三护栏：迭代 50/预算 200k/judge 25s）重叠，不另立 |
| OS 原生沙箱（Seatbelt/Landlock/execpolicy） | Codex | 与 19.6 spike 判决（Windows 无低成本可行路径）冲突，收益限 mac/linux；execpolicy 前缀规则思想由 fig 注册表（ZC-Q4）覆盖 |
| OTel 标准遥测 | Gemini CLI | 自研 metrics 够用，标准出口收益不抵依赖面；观察 |
| 模型路由分类器策略链 | Gemini CLI modelRouterService | 与静态 fallback 路由口径相性一般（boring code）；观察 |
| durable 图像附件管线 | dsh packages/attachment | **调研误判**：Spark 12.2a/12.2b + 19.21 已有附件上传/展示/投影全链路 |
| ignore 清单扩展（31 项 + whitelist） | opencode filesystem/ignore | 增量仅是硬编码清单扩展；随下次触碰 grep 的工单顺手做，不单立 |
