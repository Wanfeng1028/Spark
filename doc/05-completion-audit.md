# Spark 完成度审计报告——阶段三后的源码级核查

## 版本记录

| 版本 | 日期       | 作者                                                                                                                                                                                                   | 变更内容                                                                                             |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| v1.0 | 2026-08-25 | AI 编写：ZCode CLI · ox-alpha（model id `57d26d76-3d24-4c1c-95b3-88fcc03173f9/stealth/ox-alpha`）；人作者：晚风（Wanfeng1028，发起与审核，附外部评审意见） | 初稿：验证方法与实测结果 · 各阶段完成度判定 · 缺口清单（G1–G7）· 对外部评审的采纳与保留意见 · 动工顺序建议 |
| v1.1 | 2026-08-25 | 同上；指误：晚风（Wanfeng1028）                                                    | **v1.0 作者栏勘误**：初稿误沿既有文档版本表的"GLM-5.3（`builtin:zai-start-plan/GLM-5.3`）"署名——该标签系历史会话所留，本会话无法核实；本会话可确证的标识仅为 ox-alpha 与上列 model id。历史行的署名不回改（见 docs-update 规范），此后新增行一律以可确证标识署名 |

> 本文回答三个问题：**①远端代码是不是与提交日志声称的一致（真实现还是骨架）？②缺口具体在哪？③下一步按什么顺序动工？**
> 编号说明：原 doc/04-frontend-rules.md 已并入 DESIGN.md 退役（见 README v1.4），本文顺延为 doc/05。
> 审计时点：main = `0f081a0`（阶段三完成），`feat/stage4-depth` 领先 main 3 个提交未合入。所有数字为当日本地实测，非转抄文档。

---

# 1. 审计方法（可复现）

结论不取自提交信息与文档勾选，全部来自以下四条独立证据链：

1. **全量本地验证**：`pnpm install && pnpm -r typecheck && pnpm -r lint && pnpm -r test`，三项退出码均为 0。
2. **核心模块逐行走读**（清单见 §3 表）：不看声明看实现。
3. **反模式全仓扫描**：grep TODO/FIXME/HACK/stub/not-implemented/空 catch。
4. **协议 emit 点覆盖扫描**：对 19 种事件逐一统计引擎/server 源码中的 emit 调用数——专抓"前端会渲染、引擎没人发"的接口空转。

---

# 2. 实测结果

| 验证项           | 结果                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| 测试             | **367 例全绿 / 22 个测试文件**：protocol 46 + web 47 + engine 251 + server 23          |
| typecheck / lint | 均零错误退出                                                                           |
| TODO/FIXME 扫描  | 零残留（唯一命中是 `packages/engine/src/compaction.ts` 提示词字符串里的正常英文文本）  |
| 吞异常检查       | 全部 catch 为有注释的刻意路径（坏行丢弃、进程已退出、写队列链不断等），无空 catch      |

源码规模（不含测试）：protocol 7 文件 331 行；engine 29 文件 4148 行；server 5 文件 440 行；web 36 文件 3736 行。

---

# 3. 核心模块走读结论：真实现，非骨架

| 模块                                   | 行数 | 关键机制核实到位                                                                                                                     |
| -------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/engine/src/run-loop.ts`      | 283  | steering 在下一 step 前注入；stopReason=length 截断 toolCall 补 E_TRUNCATED 事件对回喂；压缩阈值触发重投影；finally 失败闭合          |
| `packages/engine/src/session/store.ts` | 211  | 单写者 Promise 链串行；先盘后树（写失败树/盘不分裂）；尾行半写丢弃、非尾行 fail-closed；seq 断洞拒载；悬挂 turn 补闭合                |
| `packages/engine/src/permission/service.ts` | 193 | 超时/中断/shutdown 三路 fail-closed 全部 resolve(deny)；always 级联放行扫描；reject 级联同会话其余挂起 + feedback 注入 user.message |
| `packages/engine/src/pi-gateway.ts`    | 412  | 真实 import pi-ai（lazy 加载 provider SDK）；错误四类正则分类；指数退避 ±20% jitter；已交付 delta 不重试                              |
| `packages/engine/src/tools/pipeline.ts` | 279 | 并行/串行分组 barrier；ProgressGate 关门排水保证 progress 不晚于 completed；abort 补 started/completed 事件对                         |
| `packages/engine/src/tools/builtin/bash.ts` | 145 | 真 spawn；Unix 进程组树杀 / Windows taskkill /T /F；SIGTERM→5s→SIGKILL                                                          |
| `packages/engine/src/engine.ts`        | 540  | 五步 shutdown 序列；resume 补闭合悬挂 turn；同 id 并发 create/resume 只初始化一次                                                     |
| `apps/server/src/routes.ts`            | 162  | 全端点 zod 校验；404/409/400 错误映射与引擎 ReplyOutcome 对齐                                                                        |
| `apps/web/src/stores/session.ts`       | 437  | 19 种事件全覆盖纯 reducer；回放×直播 seq 去重；shallow 选择器                                                                        |

---

# 4. 各阶段完成度判定

| 阶段   | 判定                    | 依据                                                                                                  |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| 阶段一 | ✅ 100%                 | 工单 1.1–1.6 代码在位，验收通过                                                                       |
| 阶段二 | ✅ 100%                 | 前端全量 UI 在位，reducer 19 事件全覆盖有单测                                                         |
| 阶段三 | 🔶 代码 100%，验收 90%  | 引擎/server 全量落地且实测全绿；真人模型闭环验收依赖 `examples/e2e-smoke.sh`，脚本备妥但无运行记录（见 G1） |
| 阶段四 | 🔶 约 40%（未合入 main） | 工单 4.1/4.2/4.3 已完成于 `feat/stage4-depth` 分支（25 文件 +651/−80）；其余四工单未动工（见 G2/G3/G4/G5） |
| 阶段五 | ⬜ 0%                   | 无任何代码                                                                                            |

---

# 5. 缺口清单（按优先级）

| 编号 | 优先级 | 缺口                                                                 | 证据位置                                            | 归属                     |
| ---- | ------ | -------------------------------------------------------------------- | --------------------------------------------------- | ------------------------ |
| G1   | P0     | 阶段三真人模型验收未闭环：e2e 冒烟三场景（真实模型闭环/SSE 断线重连/kill -9 resume）从未实际执行 | `examples/e2e-smoke.sh` 存在、无运行产物或记录；需自配 DEEPSEEK_API_KEY | 阶段三验收尾巴           |
| G2   | P1     | 阶段四已完成部分滞留特性分支，未合入 main                            | `feat/stage4-depth` 领先 3 提交（4.1 协议锚点演进 / 4.2 steer+queue 时序单测 / 4.3 手动 /compact 全链路），CI 绿 | 流程动作，合并即消解     |
| G3   | P1     | `session.title` 与 `checkpoint.created` 协议已定义、前端 reducer 已支持，**引擎侧 0 个 emit 点** | 全仓 emit 扫描：17/19 种事件有 emit 点，此两种为零  | 阶段四工单（自动标题/checkpoint）——接口就绪、实现未动 |
| G4   | P1     | 审批 always 规则仅存内存 Map，跨会话/重启即失效                      | `packages/engine/src/permission/service.ts` sessionRules 字段 | 阶段四工单（权限持久化 + 规则管理 UI） |
| G5   | P2     | fork/tree REST 路由未注册                                            | `apps/server/src/routes.ts` 头注明示"tree/fork 阶段四，不注册" | 计划内缺口               |
| G6   | P2     | 仓库根目录无 LICENSE 文件，各 package.json 亦无 license 字段         | 根目录与各 manifest 实测（外部评审提出，本次审计核实属实）   | 法律合规；选型 MIT 或 Apache-2.0 由人定 |
| G7   | P3     | `examples/spike-pi-ai/pnpm-lock.yaml`（42KB）实验残留                | 目录实测；CI lint 已排除 spike 目录故不影响构建      | 清理属删除操作，须走 AGENTS §2.10 五层级确认，AI 不得自行删 |

---

# 6. 对外部评审（2026-08-25）的采纳与保留意见

**采纳并列入缺口清单**：

- LICENSE 缺失（G6）——没有 license 的公开仓库在法律上并非开源，补齐是动工顺序里的第一步级事项。
- spike 实验残留（G7）——属实；受文件删除保护约束，仅登记不由 AI 清理。
- **阶段四 EventTree 复杂度预警**——fork/checkpoint 会使回放从线性变为分支状态机，评审建议"动工前先补分叉后回放一致性回归测试"，采纳进 §7 顺序（测试前置比事后修便宜）。
- demo 可发现性（录屏 GIF/repo description）——方向认可，属产品运营决策，不在本文技术缺口范围内展开。

**保留意见（不建议照做）**：

1. **调研档案外移到独立分支/release 附件**——doc/01 是纯档案可议，但 doc/02-development-plan.md 不是"存档"而是**带版本记录持续演进的活规格**（现 v2.15+，每批源码对照后仍在更新），且是全仓交叉引用体系的锚点；外移会切断引用链并违反单一来源纪律。若要瘦身仓库首屏，只评估 doc/01。
2. **多套 AI 工具规则收敛为单指针**——现状已是"摘要 shim + 以 AGENTS.md 为准"设计（AGENTS §8.1 对照表逐工具核实过读取机制），并非内容复制。真实风险是语义漂移，而 `scripts/check_doc_links.py` 只能查链接与计数、查不了语义——风险成立，但解法不是删 shim（会牺牲 Cursor/Windsurf/Trae/Qoder 等工具的开箱命中），而是在 shim 内容变更时强制过一遍对照表复核。维持现状。

---

# 7. 下一步动工顺序建议

1. **合入 `feat/stage4-depth`** → main（消解 G2）。
2. **跑通 `examples/e2e-smoke.sh` 三场景** → 阶段三正式关账（消解 G1；需 DEEPSEEK_API_KEY）。
3. **EventTree 分叉回放一致性回归测试先行**（评审采纳项）——再动 fork/checkpoint。
4. 阶段四剩余四工单：自动标题（补 `session.title` emit）/ checkpoint（补 `checkpoint.created` emit）/ 权限持久化 + 规则管理 UI（消解 G3、G4）/ node:sqlite 会话索引 + metrics 端点。
5. 补 LICENSE 文件与各 package.json license 字段（消解 G6；MIT 或 Apache-2.0 由人作者定）。
