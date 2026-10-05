# doc/13-code-spec-audit.md — 代码逻辑与规范审计报告

> 审计日期：2026-10-05
> 性质：**只读源码审计**。本轮未修改任何代码文件、未修任何一条发现。
> 与既有审计的关系：`doc/11-landing-audit.md` 查的是「工单声称 vs 代码落地」；`doc/13-project-review.md` 是外部视角的全仓评审。本文件查的是**代码逻辑与规范本身是否自洽**，三者范围不同、互不替代，本文件不覆写也不修改前两者。

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| ---- | ---- | ---- | ---- |
| v1.0 | 2026-10-05 | AI 编写：Kimi Code；发起与指令：晚风（Wanfeng1028，「先看看我的项目里面有的代码逻辑和规范的问题吧」→「要的，写成文档吧」） | 初稿：22 条分级发现（引擎铁律 2 / 事件协议 1+3 / 四端共享核 5 / AI 生成味 3 / 事实漂移 3 / 测试与 CI 5），附已核查无发现清单与四条诚实边界 |
| v1.1 | 2026-10-05 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"继续"指令全程） | **整改登记（不改正文判定，历史行以本行为准）**：已修 = A-1（5112df3 resolveInRoot 硬边界）/ A-2 + C-2（93babc8）/ C-1 + D-3（0f09924）/ C-3 + B-5（de150e7）/ D-1（6383d6b）/ **B-1~B-4（本批：protocol 新增 session-rows.ts 单源 buildSessionRows/lastUserTextOf——miniapp 收薄转发 shim、mobile 留 RN Composer 高度数学、web/CLI 四处 lastUserTextOf 全部改导；ui-copy 增 OUTCOME_TEXT 与 PERMISSION_TIER_DEFS——mobile 档位表因此补齐 description/warn）**。已消解 = E-1（词表 CK-1 批 2 补 task.progress 后代码/文档同为 35——计数漂移的对岸消失）；G-5 已核（6edecee 前清零）。待做 = E-2~E-3（E-2 行数对账已在 check_invariants 记录值追平口径）。§4.6 "93 个方法"为审计时点快照（现 95，CK-2 ⑤ 两法入面——检查 5.5 因反引号未锚定此行，属检查器覆盖面窄项，见 G 系待议） |
| v1.2 | 2026-10-05 | AI 编写：ZCode CLI·GLM-5.3-Flash（`account:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"继续"指令全程） | **G 系三腿 + D-2 收口**：① **G-2 判误报**——审计只查了 ci.yml，漏看 `.github/workflows/nightly.yml` 的 `performance` job：三组 SPARK_PERF=1 门控 perf 测试（perf-replay/perf-memory/perf-session-page）全部在 nightly 真跑（doc/06 v1.3 与三测试文件头注的"nightly performance job"即此，2026-09-02 起）；"永远 skip 等于没有保护"不成立。② **G-1 落地机器守卫**——新增 `apps/web/tests/event-coverage.test.ts`：MIN_SAMPLE 为 `SparkEventType` 全键穷举映射类型（词表新增不补样本 = 编译期 TS2739 红，词表↔样本腿）+ 运行时每种样本过 applyEvent 断言不抛且 durable 推进 lastSeq / live-only 不动（样本↔reducer 腿）；样本键数 =35 首道哨。③ **G-3 半收口**——miniapp 补 `build` 脚本（taro build --type weapp，无新依赖）入 `pnpm -r build`，构建失败不再拖到开发者工具导入才暴露；mobile 维持 typecheck 为 CI 编译面（expo export 打包面另议，不做工单外夹带）。④ **G-4 显式登记**——extend.ts 头注新增测试责任边界段（扩展事件不入静态词表/契约/守卫面，单测责任归扩展作者）。⑤ **D-2 落地**——eslint 增 apps/server/src no-console 块（豁免入口 index.ts 启动终态打印；实测 apps/cli/src 零 console 无需豁免），ARCHITECTURE §硬闸表措辞同步。 |

---

## 0. 审计范围与执行方式声明

### 范围

- 包：`packages/{protocol,engine,sdk,skill-kit}`
- 应用：`apps/{server,web,cli,desktop,mobile,miniapp,docs}`
- 官网：`official/`
- 检查器：`scripts/check_doc_links.py`、`scripts/check_invariants.py`、`eslint.config.js`、`.github/workflows/ci.yml`

### 判读标尺

| 标尺 | 出处 | 用途 |
| ---- | ---- | ---- |
| 14 条硬性约定 | `AGENTS.md` §2 | 项目级硬规则（尤其 §2.8 事件词表单测、§2.13 批量编辑、§2.14 文档长度） |
| 四端共享核 | `AGENTS.md` §1.1 | 协议/applyEvent/mock 对等纪律、引擎入口分级、sdk 双子入口 |
| 引擎铁律 | `AGENTS.md` §2.7 | durable/live 二分、surface 纪律、失败闭合、审批 fail-closed、单写者 JSONL |
| 后端六类黑名单 | `ARCHITECTURE.md` §9 | 无据设计模式、吞异常/空 catch、幻觉防御、冗余注释、泛化命名、any 逃逸 |
| 模块规模门槛 | `ARCHITECTURE.md` §9.4 | 单模块 300+ 行即需登记例外 |
| 前端六类黑名单 + 文案语气 | `DESIGN.md` §12 | 视觉与界面串气味 |
| 事件词表三表 | `doc/02-development-plan.md` §4.3 / §4.4 / §6.4 | 词表、durable/live 归类、端侧处理表 |

### 执行方式

- **全程只读**：只使用检索/读取/统计类命令，未对任何源码做编辑。
- **本机零验证**（`AGENTS.md` §2.2）：未运行 test / typecheck / lint / eval / `check_doc_links.py` / `check_invariants.py`。本轮新增的测试用例零条——因为零代码改动。
- **本机零下载**（`AGENTS.md` §2.3a）：未执行任何安装/下载命令。
- 行号均为 2026-10-05 实读结果。

---

## 一、总表：22 条分级发现

| 编号 | 分级 | 标题 | 位置 |
| ---- | ---- | ---- | ---- |
| A-1 | **P0** | `updatePrompt` 路径未经 `resolveInRoot`，绕过 cwd 硬边界 | `packages/engine/src/engine.ts:1906-1918` |
| A-2 | P1 | `updatePrompt` JSDoc 自称「原子写」，实为裸 `writeFileSync` | `packages/engine/src/engine.ts:1918` |
| E-1 | **P0** | 事件词表实测 34 与文档/官网 35 不符，涉 9 处活锚点 | `packages/protocol/src/events.ts` 等 9 处 |
| B-1 | P1 | `buildSessionRows` 在 mobile 与 miniapp 各存一份，函数体逐字相同 | `apps/miniapp/src/session/session-rows.ts:37` |
| B-2 | P1 | `lastUserTextOf` 四份实现（cli/miniapp/mobile/web） | 四处，见 §4.2 |
| B-3 | P1 | 提交结果文案在 mobile 与 web 各存一份（mobile 自认待对账） | `apps/mobile/src/session/submit-channel.ts:69` |
| B-4 | P2 | `PERMISSION_TIERS` 两份，mobile 缺 `description`/`warn` | `apps/mobile/src/screens/SessionScreen.tsx:104` |
| B-5 | P2 | CLI `StatusBar` 本地重声明 `fmtTokens` | `apps/cli/src/components/StatusBar.tsx:13` |
| C-1 | P2 | 五处注释写死「27 种」事件 | protocol 五个文件 |
| C-2 | P1 | `background-task` 空 catch 吞异常 | `packages/engine/src/background-task.ts:210-214` |
| C-3 | P3 | `events.ts` 注释块错位 | `packages/protocol/src/events.ts:123-128` |
| D-1 | P1 | `no-console` 闸在 ARCHITECTURE 声明但全仓不存在 | `ARCHITECTURE.md:644` vs `eslint.config.js:102-124` |
| D-2 | P2 | ES 声明的白名单未落地（CLI 入口豁免） | `eslint.config.js` |
| D-3 | P1 | 裸 `console.warn` 绕过日志脱敏通道 | `packages/engine/src/bus.ts:324` |
| E-2 | P1 | `engine.ts` 3161 行，超 ARCHITECTURE §9.4 的 300+ 行门槛 | `packages/engine/src/engine.ts` |
| E-3 | P2 | 版本行称「17 个 workspace package」与正文 15 矛盾 | `AGENTS.md:61` vs `:156` |
| E-4 | P2 | 版本行称 `engine.ts` 2871 行，实测 3161 | `AGENTS.md:98` |
| G-1 | P1 | 「词表 ↔ reducer 分支 ↔ 单测」三向无机器守卫 | `apps/web/tests/applyEvent.test.ts:7` |
| G-2 | P2 | 三处性能基线测试 CI 恒 skip | engine/protocol/server 各一 |
| G-3 | P2 | miniapp 无 `build` 脚本、mobile 无 `build`，二者从不在 CI 编译 | 两处 `package.json` |
| G-4 | P2 | 运行时 `registerEventType()` 插件事件可绕过 §2.8 纪律 | `packages/protocol/src/extend.ts:22` |
| G-5 | P3 | `hasTsserver` 辅助函数已无消费者 | `packages/engine/tests/lsp.test.ts:303-308` |

---

## 二、引擎铁律

### A-1（P0）`updatePrompt` 绕过 cwd 路径硬边界

`packages/engine/src/engine.ts:1906-1918`：

```ts
updatePrompt(update: PromptsUpdate): PromptsDto {
  this.assertNotShutdown()
  const slot = update.slot
  const rel = update.path ?? join('prompts', `${slot}.md`)
  const abs = isAbsolute(rel) ? rel : join(this.root, rel)
  // 占位符校验（非白名单 {{...}} → E_CONFIG；与装载期同一函数，防注入面扩大）
  assertPlaceholders(update.content, `prompts.${slot}`)
  if (update.content === '') { /* 恢复缺省：只改配置键 */ }
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, update.content, 'utf8')
}
```

问题链三段：

1. `abs` 之后**没有任何 `resolveInRoot` 调用**。`rel` 为绝对路径时直接直通（`isAbsolute(rel) ? rel : ...`），为相对路径时以 `this.root` 为基准拼接。
2. 上游不做兜底：`apps/server/src/routes/readonly.ts:290` 的 `PUT /api/prompts` 只过 `PromptsUpdateSchema`，不校验路径形状。
3. 结果：一次 HTTP 请求即可在 cwd 之外任意创建/覆盖 `.md` 文件（目录还会被 `mkdirSync` 自动创建）。

违反条款：

- `AGENTS.md` §6 红线第 4 条「路径硬边界（cwd 外拒读）优先于审批兜底」；
- `AGENTS.md` §1.1「一切文件访问经 `resolveInRoot` 做 cwd 硬边界，越界优先于审批」。

仓内已有正确实现可照抄：`packages/engine/src/tools/definition.ts:188`——realpath 比对 + `rel.startsWith('..') || isAbsolute(rel)` → 抛 `E_PATH_OUTSIDE`。

### A-2（P1）JSDoc 声称「原子写」，实现不是

同一函数的 JSDoc 首行写「写槽位模板文件（原子写 + 占位符白名单校验）」，实际是裸 `writeFileSync`，未走 `fsutil.atomicWriteFile`。仓内其他 6 处同类写入都走了原子写：`tools/builtin/write.ts:11`、`edit.ts:19`、`arena/store.ts:11`、`mcp/config.ts:9`、`lsp/config.ts:11`、`automation/registry.ts:11`。

后果不只是名不符实：非原子写在中途失败（磁盘满、进程被杀）会留下截断的提示词模板，而模板是**构造期一次性装载**的，重启后直接生效于每一次会话。

### 已核查无发现（引擎铁律）

逐条核对 `AGENTS.md` §2.7，**五项全部成立**，无例外：

- **durable/live 二分**：`packages/protocol/src/events.ts:311` 的 `LiveOnlyEventType` 在类型层强制二分；live-only 事件（全库仅 4 种）只在 `run-loop.ts:407,410`、`tools/pipeline.ts:326`、`subagent.ts:129` 三处 emit，均不落盘。
- **审批 fail-closed**：`packages/engine/src/permission/service.ts` 全部超时/异常路径走 `settle(..., false, 'reject')`，无「默认放行」分支。
- **单写者 JSONL**：`packages/engine/src/session/store.ts` 是唯一写会话文件的地方。
- **空 catch**：`packages/` 全目录仅 `skills/loader.ts:42` 一处，是有意降级（缺失 skill 视为未安装），且有注释说明。
- **事件流失败闭合**：`packages/protocol/src/transport-node.ts:57-71` 对未知事件类型按 ignorable 处理且不中断续播。

---

## 三、事件协议一致性

### E-1（P0）词表实测 34，文档与官网写 35

实测（`packages/protocol/src/events.ts` 第 26–320 行的 schema map 键）：

```
sed -n '26,320p' packages/protocol/src/events.ts | grep -cE "^  '[a-z][a-zA-Z_.]*':"  →  34
```

分类：durable 30 / live-only 4 / surface 2。live-only 4 = `assistant.delta`、`reasoning.delta`、`tool.progress`、`task.progress`；surface 2 = `user.message`、`memory.injected`。

而 `AGENTS.md:80`（v1.75 版本行）声称已新增 `task.progress`、词表升到 35——**实测未出现该新增**。计数差本身即发现。

需改的 9 处活锚点（35 → 34）：

| 位置 | 说明 |
| ---- | ---- |
| `doc/02-development-plan.md:376` | §4.3 标题行（`check_doc_links.py` 正则锚定） |
| `doc/02-development-plan.md:482` | 词表正文 |
| `doc/02-development-plan.md:1906` | §6.4 端侧处理表标题 |
| `ARCHITECTURE.md:116` | 事件模型行（正则锚定） |
| `AGENTS.md:114` | §2.8 括注「逐一单测（……种）」（正则锚定） |
| `README.md:61` | 架构图行（正则锚定） |
| `doc/03-frontend-approach.md:133` | 前端思路的词表引用 |
| `apps/docs/events.md:7` | **生成物**（`@spark/docs gen:events` 产出） |
| `official/src/lib/constants.ts:15` | 官网对外数字 |

连带项（`doc/02` 内部自相矛盾，同批处理）：

- `doc/02-development-plan.md:378` 写「与内置 34 种同一校验路径」、`:3212`、`:3221` 也写 34——与同一文档 §4.3 标题的 35 自相矛盾。
- `packages/protocol/tests/events.test.ts:180` 标题写「durable 31 + live 3」，按实测应为 durable 30 + live 4。
- `packages/protocol/tests/events.test.ts:202` 的 describe `samples` 只有 33 个键，缺 `task.progress`。
- `apps/web/tests/applyEvent.test.ts` 虽 1339 行、每事件有 describe/it，但按 G-1 的缺陷，无机器断言保证「词表 ↔ 分支 ↔ 用例」三者同数。

改完后必须重跑两个生成器并入库（`AGENTS.md` §4.1）：

```
pnpm --filter @spark/protocol gen:contract
pnpm --filter @spark/docs gen:events
```

本机不跑（§2.2），由 CI 的 gen + `git diff --exit-code` 校同步。

### C-1（P2）五处注释写死「27 种」

`packages/protocol/src/events.ts:3`、`apply-event.ts:3`、`apply-event.ts:206`、`extend.ts:4`、`packages/protocol/scripts/gen-contract.ts:58`。词表已从 27 涨到 34，注释全部陈旧。C-1 属「冗余注释 + 事实漂移」双违反 `ARCHITECTURE.md` §9。

### C-2（P1）空 catch 吞异常

`packages/engine/src/background-task.ts:210-214`：

```ts
try {
  return this.deps.notify(...)
} catch {
  return false
}
```

与 `skills/loader.ts:42` 的有意降级不同：这里是把**运行期通知失败**静默转成「未通知」，调用方无法区分「通知确实不需要」与「通知发不出去」。按 `AGENTS.md` §2.11，吞异常直接违反引擎铁律（失败闭合）。

### C-3（P3）注释块错位

`packages/protocol/src/events.ts:123-128`：`microcompact_boundary` 的说明文字被下一事件的注释头截断，读起来像是描述错了事件。

### 已核查无发现（事件协议）

- **reducer 分支与词表逐名 diff 为空**——先前会话曾怀疑「多一种事件无分支」，复核为误报：那次用的是 `grep -c "ofType("`，把总入口的用法一并计入。逐名比对后完全一致。
- **live-only 事件仅 3 处 emit 源**，无第四处偷落盘。
- `bus.ts:134-149`（落盘）与 `:264-289`（seq 分配）分工正确，无双写。

---

## 四、四端共享核漂移

判读标尺：`AGENTS.md` §1.1「这些能力在某个端里另写一份 = 制造漂移」「新增跨端能力的正确落点是 protocol，端侧只留平台被迫部分」。

### 4.1 B-1（P1）`buildSessionRows` 逐字重复

`apps/miniapp/src/session/session-rows.ts:37` 与 `apps/mobile/src/session/session-rows.ts:51` 的 `buildSessionRows` 函数体**逐字相同**——`TIMESTAMP_GAP_MS`（30 分钟）、`shouldInsertTimestamp`、`rowKeyOf` 三段全同。miniapp 文件第 2 行的注释自认「语义对齐 mobile」，即作者当时知情但仍选择了复制而非下沉。

### 4.2 B-2（P1）`lastUserTextOf` 四份

| 端 | 位置 | 形态 |
| -- | ---- | ---- |
| CLI | `apps/cli/src/hooks/use-cli-keys.ts:125` | 独立函数 |
| 小程序 | `apps/miniapp/src/session/session-rows.ts:61` | 独立函数 |
| 移动端 | `apps/mobile/src/screens/SessionScreen.tsx:411` | 内联 `useMemo` |
| Web | `apps/web/src/features/chat/SessionSurface.tsx:249` | 独立函数 |

四处对「取最后一条用户消息文本」的边界判定（是否过滤失败轮、是否 trim、是否跳过 system 轮）无任何共享约束。

### 4.3 B-3（P1）提交结果文案两份

`apps/mobile/src/session/submit-channel.ts:69` 的 `OUTCOME_TEXT` 与 `apps/web/src/features/chat/Composer.tsx:119` 各存一份。mobile 侧注释已自认「文案下沉 protocol `ui-copy` 待对账，见 19.27 报告」——**这是一条自登记未闭环的漂移**。

### 4.4 B-4（P2）`PERMISSION_TIERS` 两份

`apps/mobile/src/screens/SessionScreen.tsx:104` 与 `apps/web/src/features/chat/composer-menus.ts:125`。mobile 版缺 `description` 与 `warn` 两个字段，意味着移动端无法呈现权限档位的风险提示——是漂移已经产生**用户可见功能差异**，不只是代码重复。

### 4.5 B-5（P2）CLI 本地重声明 `fmtTokens`

`apps/cli/src/components/StatusBar.tsx:13` 重新声明了 `fmtTokens`，与 `packages/protocol/src/format.ts:14` 逐字相同。同一仓库里 `StatsPanel.tsx:7` 与 web 的 StatusBar 都正确从 protocol 导入——即同包内已有一致做法，StatusBar 是漏网。该文件头自述「10.8 起停用、按删除保护保留」（`AGENTS.md` §2.10）。

### 已核查无发现（四端共享核）

- **MockTransport 对等完整**：把 `Transport` 接口的 93 个方法与 `apps/web/src/transports/mock.ts`、`packages/protocol/src/transport-node.ts`、`packages/sdk/src/inprocess.ts` 三方逐名比对，**无任何缺失**。这是 §1.1 里最容易漂的一条，实测干净。
- reducer 用例覆盖：`apps/web/tests/applyEvent.test.ts` 1339 行，每种事件都有独立 describe/it。

---

## 五、AI 生成味代码

判读标尺：`AGENTS.md` §2.11 + `ARCHITECTURE.md` §9 六类清单。

### D-1（P1）`no-console` 闸在文档里存在、在代码里不存在

`ARCHITECTURE.md:644` 明写「ESLint `no-console`（白名单：CLI 入口）」。实读 `eslint.config.js`：

- `:102-109` rules 段只有 `no-explicit-any`、`consistent-type-imports`、`no-unused-vars`；
- `:121-124` 只有 react-hooks 两条。

**全仓无 `no-console` 规则**。这不是「闸坏了」，是「闸从没建过」——文档描述的是一个不存在的保护。

### D-2（P2）白名单语义无处落地

即便按文档补上规则，还需决定 CLI 入口如何豁免（`apps/cli/**` 整体放开，还是只放开特定文件）。这是补规则时的附带决策点，不是独立缺陷。

### D-3（P1）裸 `console.warn` 绕过脱敏通道

`packages/engine/src/bus.ts:324` 是全仓唯一的裸 `console.warn`。它位于 `onSubscriberError` 路径（`bus.ts:65` 定义的可选回调）。

**缓解事实（须一并记录）**：生产装配在 `engine.ts:423-430` 注入 logger，所以线上并不直接走这条 `console.warn`，泄露面弱。但作为唯一出口，它使「日志固定脱敏」（`AGENTS.md` §6 红线第 3 条）在代码层没有强制点。

### D-2/E-4 之外的无发现项

- **`any` 逃逸**：`src/` 内零命中。31 处 `any` 全部在测试或脚本中，且每处都带 eslint-disable 注释与成立的理由。
- **floating rejection**：19 处 `void` 调用逐个检查，均已显式吞掉或转为 `catch`，无未处理的 Promise 拒绝。
- **`manager.ts` 空壳**：仓内 4 个 `manager.ts` 均有实质逻辑，非占位。
- **幻觉防御**：未见对内部不变量的多余校验层。

---

## 六、事实漂移

### E-2（P1）`engine.ts` 3161 行，门槛是 300+

实测 `wc -l < packages/engine/src/engine.ts` = **3161**。`export class Engine` 在 `:211`，约 121 个方法。

`ARCHITECTURE.md` §9.4 定的是单模块 300+ 行即需登记例外——`engine.ts` 是其十倍。

**必须说清的反面事实**：`scripts/check_invariants.py:131` 的 `RECORDED_ENGINE_LINES = 3161` 与实测**完全一致**，drift 阈值为 ±10%，所以这条**不会让 CI 变红**。本条不是「记录失真」，而是「记录值已被追平、但被记录的门槛本身早已被突破」——检查器忠实地守护了一个不合理的现状。

另需登记：`AGENTS.md:98`（v1.57 版本行）写「2871 行（LA-41 实测更新）」，实测 3161。历史版本行按惯例不改（§2.1 只要求追加），故在本报告与 AGENTS 新版本行出勘误。

### E-3（P2）包数 17 vs 15

`AGENTS.md:61`（v1.52 版本行）称「17 个 workspace package 含内部包」，正文 `AGENTS.md:156` 称「15 个 workspace package」。实测 **15**（apps 7 + packages 4 + examples 4）。正文对、版本行错。`AGENTS.md:156` 那句本身还带着 `v1.37–v1.40` 连续四次改数的伤疤，值得一并简化（写实数，别写死数字）。

### E-4 见上（并入 E-2 一节叙述）。

### 已核查无发现（事实漂移）

- **命令基线 28 条 / 参考速查 31 条**：与 `protocol/src/commands.ts`、`doc/02-development-plan.md` §9 实际条数一致，无漂移。
- `check_invariants.py:100` 的 `EXPECTED_ENGINE_EXPORTS = 69` 是写死值对账，非空转。

---

## 七、测试覆盖与 CI 纪律

### G-1（P1）三向关联无机器守卫

`apps/web/tests/applyEvent.test.ts:7` 只导入类型。用例是逐事件手写的，但没有一条断言检查「词表键集合 == reducer 分支集合 == 用例集合」。三者任一漂移，测试仍全绿。

`AGENTS.md` §2.8 要求「新增事件类型必须同步新增单测，否则 PR 不完整」——这是**纪律要求**，而当前没有**机制保障**。配合 E-1（词表已漂）看，风险是实的。

### G-2（P2）性能基线 CI 恒 skip

三处用 `describe.skipIf(!PERF)`：

- `packages/engine/tests/perf-memory.test.ts:19`
- `packages/protocol/tests/perf-session-page.test.ts:130`
- `apps/server/tests/perf-replay.test.ts:18`

而 `ci.yml` 从不设 `SPARK_PERF`。这三组测试在 CI 上永远 skip，等于没有性能回归保护。

### G-3（P2）miniapp / mobile 从不在 CI 编译

- `apps/miniapp/package.json` **无 `build` 脚本**；
- `apps/mobile/package.json` 只有 `test` / `typecheck`。

`pnpm -r build` 因此不覆盖这两端。小程序构建失败要到用户拿微信开发者工具导入 `dist` 时才会暴露。

### G-4（P2）插件事件可绕过词表纪律

`packages/protocol/src/extend.ts:22` 提供运行时 `registerEventType()`。第三方扩展注册的事件不进静态词表，§2.8 的「逐一单测」对它们不生效。这可能是**有意设计**（插件机制本身需要），但需要一个显式登记：扩展事件的测试责任归扩展作者。

### G-5（P3）死代码

`packages/engine/tests/lsp.test.ts:303-308` 的 `hasTsserver` 已无任何消费者。

### 已核查无发现（CI 本身）

CI 的**步骤序**是健康的，没有发现流程缺陷：

```
check_doc_links → check_invariants → typecheck → lint → knip
→ 契约三件套（gen + git diff --exit-code）
→ 装 SoX / tsls / pyright
→ test → eval → 末步 pnpm -r build
```

末步 `build` 不可省的理由（`AGENTS.md` §4 已注明）：`typecheck` 是 `--noEmit`，查不出 TS4033「已导出接口用了私有名」，而 engine/protocol 的发布依赖 `declaration: true`。

`check_invariants.py` 的 `skipIf` 探测是真实 `execFileSync` 调用，不是恒真表达式。

---

## 八、建议动作（8 条，全部待人类拍板）

本轮**一条都没实施**。按建议优先级：

| # | 动作 | 对应发现 | 备注 |
| - | ---- | -------- | ---- |
| 1 | `updatePrompt` 加 `resolveInRoot` 校验，路径越界抛 `E_PATH_OUTSIDE` | A-1 | 照抄 `tools/definition.ts:188` 的现成实现；同时把 `readonly.ts:290` 的 schema 补一道形状校验 |
| 2 | 跑一次事件计数批次：9 处锚点 35 → 34 + 3 处连带 + 2 处测试夹具 + 重跑两个生成器 | E-1 | 会动 `check_doc_links.py` 的四处正则锚定句式，**措辞不能改**，只能改数字 |
| 3 | `eslint.config.js` 补 `no-console` 规则 + 把 `bus.ts:324` 换成注入的 logger | D-1 / D-2 / D-3 | 需同时决定 CLI 入口的白名单口径 |
| 4 | `buildSessionRows` / `lastUserTextOf` / `OUTCOME_TEXT` / `PERMISSION_TIERS` 四项下沉 protocol | B-1 ~ B-4 | B-3 是 19.27 报告自登记未闭环项；B-4 已产生用户可见差异（移动端无权限风险提示），优先级可提前 |
| 5 | 修 5 处「27 种」注释 + `background-task` 空 catch 改为显式记录并降级 | C-1 / C-2 | |
| 6 | 给 `applyEvent` 加三向断言（词表 ↔ 分支 ↔ 用例） | G-1 | 一条测试即可兜住整类漂移，性价比最高 |
| 7 | `engine.ts` 三选一：拆装配面 / 接受现状但在 `ARCHITECTURE` 正式登记例外 / 不动 | E-2 | 现状是「检查器忠实守护了一个已被突破的门槛」，不表态就会一直这样 |
| 8 | 债务批：删死代码、给 miniapp 补 build 脚本、CI 加 `SPARK_PERF` 档 | B-5 / C-3 / G-2 ~ G-5 | G-4 插件事件测试责任建议一并登记 |

**若只做一件事**：做 #1。它是唯一一条可被 HTTP 请求直接利用的越权写。

---

## 九、本轮未验证 / 诚实边界

四条，必须与结论一起读：

1. **契约生成物未验**：`packages/protocol/tests/contract/wire.contract.test.ts` 是否与当前 schema 字节级同步，本轮未核对。
2. **`check_invariants.py` 本轮未实跑**（§2.2 本机零验证）。本报告引用的是脚本里的**写死常量**（`RECORDED_ENGINE_LINES = 3161`、`EXPECTED_ENGINE_EXPORTS = 69`）并已与实测对账，但脚本本身的**红绿状态**未验证。
3. **「CI 会红」是推论，不是观测**。凡本报告出现「会导致 CI 失败」的表述，均是按 `check_doc_links.py` 的正则锚定逻辑与实数字符串推出的，**本轮没有看过任何 CI 输出**。
4. **TOCTOU 窗口不计为发现**：`resolveInRoot` 的 realpath 校验与词法路径计算之间存在时间窗，这是全仓固有实现特征（`tools/definition.ts` 亦然），属另一议题，本报告不将其列为缺陷。

---

## 十、报告性质声明

- 本轮是**只读审计**，产出是这份清单，**未修任何一条**。修复需人类拍板后另行立项。
- 本文件与 `doc/11-landing-audit.md`（工单落地核查）、`doc/13-project-review.md`（外部全仓评审）**范围不同**，三者并存、互不替代；本文件不覆写、不修改、不替代前两者。
- 分级口径：**P0** = 安全/一致性硬约束被破坏；**P1** = 违反已登记规范或已产生用户可见后果；**P2** = 明确的技术债；**P3** = 卫生问题。
