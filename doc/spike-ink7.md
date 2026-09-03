# Spark ink 7 升级可行性 spike 报告（工单 10.55）

> 性质：**只调研不改 main**（批次 6 工单 10.55，V2-26 治本前置）。本报告为静态分析产物；真机升级 + 全量测试由后续 10.56 升级实施单 + CI 执行。

## 版本记录

| 版本 | 日期       | 作者                                                    | 变更内容                                                                                                                                       |
| ---- | ---------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0 | 2026-09-02 | AI 编写：Qoder；发起：晚风（Wanfeng1028，“继续”指令） | 初稿：ink 6.8.0 → 7.1.1 升级可行性 spike——API 面 diff + 7.0.0 breaking 映射 + qwen ink+7.0.3.patch 分析 + 结论「升」+ 10.56 实施单草案 + 10.50 口径外溢修正 |
| v1.1 | 2026-09-04 | AI 编写：Qoder；发起：晚风（Wanfeng1028，“继续”指令） | **10.56 实施结果登记（§9）**：最小升级 commit ec8bca5 CI 双绿（frozen-lockfile + typecheck + lint + test 62/62 + e2e，断点 0 得证）；§6 简化重构落地 2 项——**API 名修正**：absolutePosition 的原生等价是 `measureElement`（x/y=沿布局树累加祖先偏移的绝对坐标）而非 §6 原写的 `useBoxMetrics`（经 getComputedLayout 返回**父相对** left/top，会破坏物理光标——核装 ink7 源码判定不可用）；app.tsx columns/rows+resize nonce → `useWindowSize`。**跳过** `useAnimation`（LoadingIndicator useNow 提供墙钟 now 算 `sec=(now-turn.startedAt)/1000`，animation.time 挂载相对非墙钟，替换回归 resume/重连耗时秒数） |

## 0. 结论（先读这个）

**判决：升（低风险，建议立 10.56 升级实施单）。**

一句话依据：Spark 用到的 ink 导出符号在 7.1.1 **全部保留**；ink 7 唯二的行为级 breaking（Backspace 改报 `key.backspace`、Escape 不再置 `key.meta`）Spark 代码**已防御性兼容、零改动**；Node 22 / React 19.2 门槛**已满足**；且 ink 7.0.0 **原生修复**了 Spark 的真实痛点（CJK 截断、宽字符切半 #930、尾换行增量渲染 #910——qwen 需打 patch 回填的正是这些）。qwen 的 `ink+7.0.3.patch` **Spark 不需要**（那是鼠标选区 + 全屏光标，Spark 无此特性）。

**重要外溢结论**：10.50（IME 组字深层防御）原设想「在 ink 6.8 上手搓 qwen patch 子集」——spike 判定应**改为并入 10.56 升级之后**再做，因为 ink 7 原生 `usePaste`（bracketed paste）+ Kitty 键盘协议 + #930/#910 修复，才是 IME/组字/宽字符问题的正解，升级本身可能消解大部分症状（详见 §7）。

## 1. 方法（可复核，AGENTS §2.12 在线访问禁克隆）

| 证据 | 来源 |
| ---- | ---- |
| Spark ink 6 使用面（22 处 import） | `apps/cli/src` grep + `pnpm-lock.yaml`（解析版本 ink@6.8.0） |
| ink 6.8.0 vs 7.1.1 公开 API 面 | jsdelivr CDN 直读 `ink@{6.8.0,7.1.1}/build/index.d.ts` |
| ink 7.0.0 breaking / new / fixes | `gh api repos/vadimdemedes/ink/releases/tags/v7.0.0` |
| qwen patch（53642 B，15 文件） | `gh api repos/QwenLM/qwen-code/contents/patches/ink+7.0.3.patch`（raw） |
| ink 7.1.1 engines / peer | jsdelivr `ink@7.1.1/package.json` |
| ink-testing-library peer | jsdelivr `ink-testing-library@4.0.0/package.json`（latest=4.0.0） |

**局限**：静态分析（API 面 diff + release notes 映射 + 代码 grep）。运行时行为回归（尤其 ink-testing-library 4.0.0 对 ink 7 render/Instance 的实际兼容）需 10.56 真机升级 + CI 全量测试确证。

## 2. Spark 的 ink 6 使用面（升级影响半径）

| 符号 | Spark 用处 | ink 7.1.1 |
| ---- | ---- | ---- |
| `Box` `Text` | 全组件基元 | ✓ 保留（Text + `wrap="hard"`；Box + `maxWidth/maxHeight/borderBackgroundColor/aspectRatio/position` 等新选项，纯增） |
| `render` | main.tsx（`{exitOnCtrlC:false}`） | ✓ 保留（+ `alternateScreen`/`interactive` 新选项） |
| `useApp` | app.tsx（`exit`） | ✓ 保留 |
| `useStdout` | app.tsx（`stdout.columns`） | ✓ 保留（可迁 `useWindowSize`，§6） |
| `useInput` | use-cli-keys / InputBox / CommandPanels | ✓ 保留（行为变更见 §3） |
| `useCursor` | InputBox（`setCursorPosition`） | ✓ 保留 |
| `Static` | MessagePane（已定型区） | ✓ 保留（+ #905 dangling staticNode 修复） |
| `DOMElement`(type) | InputBox | ✓ 保留 |
| `measureElement` | InputBox（经 DOMElement） | ✓ 保留（+ `useBoxMetrics`/`ElementMetrics` 新选，§6） |

**导出面结论**：Spark 用到的符号 ink 7.1.1 **无一移除**。ink 7 相对 6.8.0 纯**新增**：`usePaste` / `useAnimation` / `useWindowSize` / `useBoxMetrics` / `SuspendTerminal` / `ElementMetrics`；唯一类型级变化：`StdinProps` 由 `Props` 改派生自 `PublicProps`（Spark 未直接用 StdinProps，无影响）。

## 3. ink 7.0.0 breaking × Spark 映射（核心——断点计数 0）

| breaking | Spark 现状 | 影响 |
| ---- | ---- | ---- |
| Require Node.js 22 | `apps/cli` engines `>=24` | ✓ 已满足 |
| Require React 19.2+（内部用 `useEffectEvent` 免每次渲染重订阅输入处理器） | lockfile 解析 `react@19.2.8` | ✓ 已满足；`apps/cli/package.json` 声明 `^19.1.0` → 建议顺提 `^19.2.0` 对齐 peer |
| Backspace 改报 `key.backspace`（原误报 `key.delete`） | InputBox.tsx:135 `if (key.backspace \|\| key.delete)` **双查** | ✓ 防御性兼容，ink6/7 均可，**零改动** |
| Escape 不再置 `key.meta`（仅 `key.escape`；meta 留给真 Alt/Meta） | use-cli-keys.ts:130 + InputBox.tsx:123 用 `key.escape`；:155 `!key.meta` 仅作修饰卫 | ✓ **零改动**（ink7 下语义更正确） |

**断点计数：0 处需改代码。** 仅两个声明版本可顺带对齐（react `^19.2.0`；ink-testing-library 复核见 §8）。

## 4. ink 7.0.0 原生修复 = Spark 痛点直击

| 官方修复 | Spark 关联 |
| ---- | ---- |
| #930 宽字符（emoji/CJK）重叠写切半 | InputBox 字位光标（工单 10.19 emoji 代理对 / CJK 一次删一整字）——**渲染层根因原生修** |
| CJK 文本截断超 `<Box>` 宽 | 中文 TUI 核心体验——**原生修** |
| #910 尾换行增量渲染 | qwen patch `hasTrailingNewline` 回填的正是这个——**ink 7.0.0 已原生** |
| #905 dangling `staticNode` 引用 | MessagePane `Static`——稳定性 |
| #902 `useInput` 未映射键码崩溃 | 键处理鲁棒性（10.50 相关） |

## 5. qwen `ink+7.0.3.patch` 分析（Spark 是否需要）

patch 面：15 文件，**全改 `node_modules/ink/build/*.js`**（patch-package 口径）。内容三类：

1. **鼠标文本选区**：`Text` 加 `selectable/selectionFlow/selectionBreakAfter/selectionJoiner` props + 新增 `frame-controller.js`（`FrameController`：`getFrame/getSelection/setSelection/subscribe/publishFrame` 应用↔渲染器双向桥，选区高亮）+ `log-update` 选区序列化。
2. **全屏光标**：`cursor-helpers.buildCursorSuffix` 加 `hasTrailingNewline`（全屏模式光标落最后可见行尾而非下一行）。
3. **光标快照生命周期**：`log-update` 加 `prepareActiveCursor/consumeActiveCursor/invalidateActiveCursor`（每 flush 一数值快照，禁跨 flush 边界）。

**判决：Spark 不需要此 patch。**

- 鼠标选区 / frame-controller：Spark 无鼠标选区特性——**不适用**。
- 全屏光标 `hasTrailingNewline`：ink 7.0.0 已原生修 #910；Spark 未用全屏（若未来要，走原生 `alternateScreen` render 选项，**无需 patch**）。
- patch 针对 **7.0.3** build 产物；Spark 上 **7.1.1**，逐 hunk 未必干净套用——但因本就不需要，**无移植成本**。

## 6. ink 7 新能力 = 简化机会（非必须，10.56 可选纳入独立提交）

| 新 API | 替换 Spark 现状 |
| ---- | ---- |
| `useBoxMetrics` / `ElementMetrics` | **InputBox.tsx:68 `absolutePosition()`**（工单 10.42 手搓 yogaNode.parent 链累加 left/top——注释自陈「qwen ink7 getAbsolutePosition 的 ink6.8 等价实现，ink7 已将其 API 化」）→ 可删手搓改原生（精确 API 名 10.56 核） |
| `useWindowSize` | app.tsx `useStdout().stdout.columns ?? 80` 手读 → hook 返回 `{columns,rows}` 且 resize 自动重渲 |
| `useAnimation` | LoadingIndicator 手搓 500ms spinner timer（工单 10.52）→ 原生帧计数（interval + pause/resume + unmount 清理） |
| `usePaste`（bracketed paste） | **10.50 IME/粘贴防御正解**：粘贴/批量输入作为单串到达，不被 `useInput` 误拆为逐键 |
| `alternateScreen` render 选项 | 全屏模式（若未来要）——原生，替代 qwen patch 全屏光标 |

## 7. 对 10.50（IME 组字深层防御）的口径修正

10.50 原设想：移植 qwen ink7 patch 的 `terminalRedrawOptimizer` + redraw 拦截到 ink 6.8。**spike 修正**：

- qwen patch 主体是**鼠标选区 + 全屏光标**，**并非** IME 组字防御（§5）——原工单描述对 patch 用途的判断需修正。
- ink 7 **原生**给了更强的 IME/组字工具：`usePaste`（bracketed paste 免逐键误拆）+ Kitty 键盘协议（7.0.0 起 auto 模式查询所有终端，非硬编码白名单）+ #930/#910 宽字符与增量渲染原生修（消半字符/光标跳列的渲染根因）。

**故 10.50 应并入 10.56 升级后再评估**：升级本身可能消解大部分 IME 症状；届时若仍有组字中间态问题，用 ink 7 原生 `usePaste`/Kitty 而非手搓 patch 子集。仍需真实终端 spike 记录 ConPTY 组字序列（该动作不变，但在 ink 7 底座上做）。

## 8. 10.56 升级实施单草案（若批准升级）

**目标**：`apps/cli` ink 6.8.0 → 7.1.1，零功能回归 + 收获 §4 原生修复。

步骤：

1. `apps/cli/package.json`：`ink ^6.2.0 → ^7.1.1`；`react ^19.1.0 → ^19.2.0`（对齐 peer）。复核 `ink-testing-library`：latest=4.0.0 且**无 ink peer 约束**（仅 optional `@types/react`），理论版本无关兼容；无 ink7 定向新版可升，沿用 4.0.0。
2. `pnpm install` → 更新 lockfile（注意 ink 7 新传递依赖 `ws ^8.20.0`（react-devtools 用）+ `react-reconciler ^0.33.0`/`scheduler ^0.27.0`/`yoga-layout ~3.2.1`——bundle 体积微增，无功能风险）。
3. `pnpm --filter cli typecheck`：验证导出面（预期全绿——§2 已核）。
4. `pnpm --filter cli test`（本地）+ 全量 CI：验证 62 例（重点 InputBox 字位/backspace、MessagePane Static、@ 补全 FsMenu）。
5. **真机走查**（晚风执行）：中文组字、emoji 退格、CJK 截断、@ 路径补全、/resume 双行、慢链路 spinner——对照 §4 修复点验收。
6.（可选，独立提交）§6 简化：`absolutePosition`→`useBoxMetrics`、`useStdout`→`useWindowSize`、spinner→`useAnimation`。
7. doc：本报告追加 v1.1 登记升级结果；doc/02 批次 6 表 10.56 勾选 + 版本行；10.50 依 §7 重排到 10.56 之后。

**风险与回退**：

- 风险 **LOW**。主要未知：ink-testing-library 4.0.0 运行时对 ink 7 `render`/`Instance` 的实际兼容（静态无 peer 阻断，动态待 CI 验证）。
- 回退：`git revert` 升级提交（package.json + lockfile）→ ink 6.8.0 恢复。10.56 独立提交，零 main 污染。

**红线**：不引 qwen patch（§5 判定不需要）；升级独立提交便于回退；不改 wire 类型；真机走查由人类执行。

## 9. 10.56 实施结果（v1.1 追加——升级已落地）

### 9.1 最小升级（commit ec8bca5，CI run 33791777856 双绿）

- `apps/cli/package.json`：ink `^6.2.0→^7.1.1`、react `^19.1.0→^19.2.0`；`pnpm-lock.yaml` 解析 `ink@7.1.1`（engines node>=22 已满足；cli react 解析 19.2.3，各包独立声明范围互不影响）。
- CI：`pnpm install --frozen-lockfile` ✓ + `check_doc_links` ✓ + typecheck ✓ + lint ✓ + test ✓（cli 62/62）+ e2e ✓——**断点 0 得证**（§3 静态判断经运行时验证）。唯一 annotation 是预存 Node20 弃用告警（与本次无关）。

### 9.2 §6 简化重构（独立提交）——2 项落地 + 2 项跳过（核装 ink7 源码后修正 §6）

**落地**：

| 改动 | 原生 API | 核装证据 |
| ---- | ---- | ---- |
| InputBox `absolutePosition()` 手搓（13 行）删除 | `measureElement(boxRef.current)` → `{x,y}` | **§6 API 名修正**：真正等价的是 `measureElement` 不是 `useBoxMetrics`。核 `measure-element.js`：`x/y` = 从自身 `getComputedLeft/Top` 起沿 `parentNode` 链累加各祖先偏移——与手搓 `absolutePosition` **逐行同构**（渲染期读上一帧 yoga 布局的行为也一致，getter 延迟求值不变）。`abs.left/top`→`abs.x/y`。 |
| app.tsx `columns/rows` 手读 + resize nonce useState/useEffect（8 行）删除 | `useWindowSize()` → `{columns,rows}` | 核 `use-window-size.js`：内部 `getWindowSize(stdout)` + 订阅 `stdout.on('resize')` 自动 setSize 重渲——与原手搓模式同构；`getWindowSize`（utils.js）缺省 `terminal-size()\|\|80×24`，兼容原 `?? 80/24`。`stdout` 仍留（clearScreen 写 ANSI）。 |

**跳过（附核装证据——非臆断）**：

| §6 原建议 | 判定 | 依据 |
| ---- | ---- | ---- |
| `useBoxMetrics` 替 absolutePosition | **不可用** | `use-box-metrics.js` 经 `yogaNode.getComputedLayout()` 返回 `left/top`，类型文档明写「All positions are relative to the element's **parent**」——**父相对**非绝对。物理光标 `setCursorPosition` 需帧内绝对 y（InputBox 在 MessagePane/菜单/错误区之后的布局深处，累加必不可少），换用会把 IME 组字窗画到帧顶。真正绝对坐标 API 是 `measureElement`（见上）。 |
| `useAnimation` 替 LoadingIndicator spinner | **不划算（回归风险）** | `useNow`（components/rows/shared.ts）返回 `Date.now()` 墙钟；LoadingIndicator `sec=(now-turn.startedAt)/1000` **依赖墙钟**。`useAnimation.time` 是「挂载/上次 reset 起的相对毫秒」非墙钟，替换后 resume/重连（组件晚于 turn 挂载）耗时秒数会错。且 `now` 一值三用（spinner 帧/短语 seed/耗时），单换帧需并存两 timer = 复杂度不降反升。 |

**净结果**：删 21 行手搓（absolutePosition 13 + resize 块 8），换 2 处原生 API；跳过 2 项经源码核实的误配。§6「简化机会」5 项：2 落地、2 证伪、1（usePaste/alternateScreen）留给 10.50/未来全屏。本机 cli typecheck + test 62/62 + 双文件 eslint 全绿。

### 9.3 真机走查（晚风执行——留待记录）

中文组字 / emoji 退格 / CJK 截断（#930）/ 尾换行（#910）/ @ 补全 / resume 双行 / 慢链路 spinner / **物理光标定位（measureElement 换后重点验 IME 组字窗跟随）** / **resize 重排（useWindowSize 换后重点验终端缩放不错行）**。
