# 长对话压缩与滚动摘要调研：各家机制与 Spark 设计（CK-12② + doc/14 #3.5 设计输入）

> 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| ---- | ---- | ---- | ---- |
| v1.0 | 2026-10-05 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起与拍板：晚风（Wanfeng1028，CK-12② 决策"看看各家都是怎么做的，我们也要做"） | 初稿：六家横评（Gemini CLI / opencode / pi / Claude Code（泄露源码分析仓）/ Kimi Code / Spark 现状）——压缩触发/摘要生成方式/保留策略/切分点规则/摘要注入形态逐项带文件路径证据；滚动摘要专题与安全切分点专题；Spark 推荐设计两方案（最小增量 / 完整形态）。全程 `gh api` raw 直读，未克隆未下载（§2.12/§2.3a） |

## 0. 取证口径

**对象与证据等级**：Gemini CLI（A——源码直读）、opencode（A）、pi（A——官方 compaction.md 参考文档 + 源码树）、Claude Code（A——泄露源码分析仓 `Wanfeng1028/claude-code-analysis` 直读）、Kimi Code（B——doc/14 已精读 fullCompaction/strategy.ts，本报告引用其结论）。网络 EOF 多次，退避重试。

**Spark 现状**（对照基准）：`packages/engine/src/compaction.ts`——水位过 `compactionThreshold`（缺省 0.8）触发 LLM 摘要；`compaction.started/completed` 事件 durable（`keptFromEventId` 保留边界 + `distilled` 工具输出蒸馏表）；`microcompact_boundary` 工具输出层清占位；CK-12① 已落 `rebuildState`（压缩后状态复灌：readFileState 基线上提构造区，compact 完成时状态块拼进 summary 尾部——`engine.ts:2749` 起）。

## 1. 六家横评

| 维度 | Gemini CLI | opencode | pi | Claude Code | Kimi Code |
| --- | --- | --- | --- | --- | --- |
| **触发** | token 超窗口 **0.5** 阈值（`DEFAULT_COMPRESSION_TOKEN_THRESHOLD`，chatCompressionService.ts:38）+ `/compress` 手动 | 水位 + 手动 `/compact`（core/session/compaction.ts） | `contextTokens > contextWindow - reserveTokens`（缺省留 16384）+ `/compact [instructions]`；检查点在 `prepareNextTurn` | 自动（autoCompact.ts，按模型窗口算 threshold）+ `/compact`；**microcompact 先行**（compact.ts:97-99——先清工具输出再全量摘要） | 水位 + 溢出反应式（CK-7 同型） |
| **摘要生成** | **专用压缩模型**（chat-compression-3-flash 等映射，:333-345）——主模型不干这活 | 独立 summarization agent（`compaction.txt` 系统提示："You are a context summarization agent"，结构化模板输出） | 主 LLM 一发（总结请求禁 prompt-cache 写入——一次性提示不值得缓存） | **主对话模型自身**（fork 路径共享 prompt cache——实验数据：不共享则 98% cache miss，fleet 级 ~38B tok/日成本，compact.ts:432-435） | 主模型 |
| **保留策略** | `RECENT_TURNS_PROTECTED = 3`（近 3 轮工具响应保全真值）+ **检索类工具豁免折叠**（read_file/grep 等 9 个白名单——多步推理必需，:46-56） | `keep` 段（:131）；结构化模板含 previous summary 迭代 | `keepRecentTokens` 缺省 **20k**，从尾部反向累积找切点（doc/compaction.md §How It Works） | `POST_COMPACT` 重注入：压缩后**主动恢复**最近读过的文件（MAX 5 文件 × 5k token/文件，预算 50k；skills 另有 25k 预算，:122-130）——**"压缩后状态复灌"的最完整形态** | canSplitAfter 四规则 + 保尾窗口双向拟合（doc/14 §3.5） |
| **切分点规则** | `findCompressSplitPoint`（:286-323）：**只在"非工具响应的 user 消息"处切**（`role==='user' && !functionResponse`）；找不到则检查尾部是否"model 结尾且无 functionCall"（可全压）；否则退最近切点 | 切点 = 消息边界（:147-156 head/recent 两段） | **user-message span 边界优先**；单 span 超 20k 时在 span 内 assistant 处切（"split user-message span"专节） | microcompact 的分组逻辑在 grouping.ts（按工具结果分组清占位） | 不在 user 后切/不在带 toolCalls 的 assistant 后切/不在 tool 结果前切/不切进未闭合 tool 交换（strategy.ts:242-266） |
| **摘要注入形态** | 替换历史（newHistory = 摘要 + 保留尾部） | 摘要进 system 侧 + previous summary **迭代**（"Add new progress… update the summary"——**滚动摘要实做**） | `CompactionEntry`（summary + `firstKeptEntryId`）追加进会话；**重复压缩从上次保留边界起摘（不重摘已摘段）**——滚动语义；LLM 所见 = system + summary + 保留消息 | 摘要作合成 user 消息 + `<analysis>` 草稿块剥离（prompt.ts）；8+1 段结构化模板（Primary Request/Key Concepts/Files and Code/Errors and fixes/…/Current Work/Next Step——**带 verbatim 引用防任务漂移**） | 压缩结果必须塞回保尾窗口内，溢出按最小缩减比递减重试 ≤3 |
| **溢出恢复** | CONTENT_TRUNCATED 态（:1254） | — | provider overflow/length → 一次 compact-and-retry（恢复序：persist → turn_end → agent_end → omission edits → compaction → fresh retry） | compact 请求自身 prompt-too-long → 截断重试（CC-1180，:462）+ 流式重试 ≤2 | 反应式压缩重试（CK-7 同型） |

**关键路径证据**：Gemini `packages/core/src/context/chatCompressionService.ts`；opencode `packages/core/src/session/compaction.ts` + `packages/opencode/src/agent/prompt/{compaction,summary}.txt`；pi `packages/coding-agent/docs/compaction.md`（官方参考文档，含图示）；Claude `src/services/compact/{compact,autoCompact,prompt,microCompact,grouping}.ts`。

## 2. 滚动摘要专题（CK-12② 核心）

**真正在做"滚动"（跨次压缩迭代更新而非每次全量重摘）的两家**：

- **opencode**：摘要模板显式带 `previousSummary` 输入（compaction.ts:52-54："Add new progress, decisions, constraints, and context from the conversation. If a blocker has been resolved, update the summary to reflect that"）——摘要是一份**持续更新的活文档**。
- **pi**：`CompactionEntry.firstKeptEntryId` 链——重复压缩的摘要范围**从上一次的保留边界起算**（"preserves messages that survived the earlier compaction by including them in the next summarization pass"），且摘要把上一次的 summary 作为迭代上下文传入。效果等价于滚动：旧摘要作为输入、新摘要覆盖其内容、永不重复摘要同一段。

**Claude Code 的近似物**：8 段结构化模板本身就是"滚动友好"的（每段都是状态型而非事件型），加上 POST_COMPACT 文件重注入——它不滚动摘要文本，而是滚动**状态注入**。

**防漂移手段对比**：opencode/pi 靠"把旧摘要喂进新摘要"保持连续性；Claude 靠模板第 6 段"All user messages: List ALL user messages"（用户原话全保留——**拍板与意图不进摘要压缩**）与第 9 段的 verbatim 引用要求。**没有一家让摘要改写 durable 历史**——全部是"原始记录仍在，只是不再发给 LLM"（append-only 纪律各家一致，与 Spark JSONL 单写者完全同构）。

## 3. 安全切分点专题（doc/14 #3.5 吸收判定）

| 家 | 显式"不可切分位置"判定 | 规则 |
| --- | --- | --- |
| Kimi | ✅（最细） | 四规则 + 深度窗口双向拟合 + 重试降档 |
| Gemini | ✅ | 只在真 user 消息边界切（工具响应排除）；尾部无 toolCall 才可全压 |
| pi | ✅ | user span 边界优先；超长 span 内 assistant 处切 |
| Claude | 部分 | microcompact 按工具结果组清占位（不切语义单元）；全量摘要无切点概念（整段进摘要） |
| opencode | 部分 | 消息边界切，无 tool 交换完整性判定 |

**结论**：Kimi 四规则是超集，Gemini/pi 的 user-边界规则是其实例。Spark 吸收 Kimi 四规则即可覆盖全部已知实践。

## 4. Spark 推荐设计

**方案 A（最小增量，建议先做）——切分点 + 迭代摘要，零协议面**

1. **canSplitAfter 吸收**（`packages/engine/src/compaction.ts`）：在现有压缩前置计算里加四规则判定——`user.message` 后不切、带 toolCall 的 `assistant.message` 后不切、`tool.started` 与 `tool.completed` 之间不切、未闭合 tool 交换不切；切点从尾部反向找（`keepRecent` 对齐 pi 的 20k 语义，可复用现有 compactionThreshold 换算）。
2. **迭代摘要**（零新事件）：`CompactorDeps` 摘要 prompt 拼上**上一次 compaction.completed 的 summary**（durable 事件流里就有——`session-page`/引擎重放可得），模板学 opencode（"更新而非重写：新增进度、已解决 blocker 要反映"）。
3. **用户消息全保留进摘要**（学 Claude 第 6 段）：摘要 prompt 显式要求罗列全部用户消息原意——拍板不因压缩失真。
4. **安全边界（AGENTS §2.0）**：摘要只做上下文垫底，**JSONL 原文一字不动**（现有 append-only 不变）；摘要来源可追溯（compaction.completed 事件本就 durable 记录 summary 全文）；压缩失败 fail-closed（现有行为保持——不降级到"硬截断"）。
   成本 **S-M**；验收：切点单测（构造 tool 交换中/未闭合场景断言不切）+ 迭代摘要单测（两次压缩后 summary 含旧摘要要点）。

**方案 B（完整形态，后做）——POST_COMPACT 状态复灌扩展**
学 Claude 的压缩后主动恢复：最近读过的 N 个文件（5 个 × 5k token）+ 当前 todo 投影 + goal 状态拼进 summary 尾部（CK-12① 的 rebuildState 已落一个状态块，本项扩展为多源）。成本 **M**；依赖方案 A。

**两方案共同不做的**：专用压缩模型路由（Gemini 那套 flash 映射——Spark 模型面缺省走 compactionModel 已有配置位，无必要再加映射层）；后台子代理写摘要（pi/Claude 都证明主路径一发 + 迭代足够，后台子代理引入竞态面，CK-12② 原卡设想作废）。

## 5. 裁决建议表（最终由晚风拍板）

| 项 | 建议 | 成本 | 理由 |
| --- | --- | --- | --- |
| 方案 A（切分点 + 迭代摘要 + 用户消息保全） | **做** | S-M | 六家实践的最大公约数；零协议面；CK-12② 的安全形态 |
| 方案 B（POST_COMPACT 多源复灌） | A 落地后做 | M | Claude 验证过的完整形态；①已铺好端口 |
| 后台子代理写摘要 | **不做** | — | 无一家实做；竞态面 + 成本高；主路径迭代足够 |
| 专用压缩模型路由 | 不做（已有 compactionModel 配置位） | — | Gemini 的映射层是它的模型族特有 |

**待晚风确认**：方案 A 是否开工（本报告即设计输入，拍板后立实施单）。
