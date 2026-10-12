# DeepSeek-V4-Flash 安全审查报告（第五批：后端补尾 + 前端三端首审）

> 审查人：DeepSeek-V4-Flash（经微信 ChatAPI 调用）；组织与核查：Muse。
> 日期：2026-10-13。承接 doc/21（第四批）。
> 说明：第五批原定由 step-5-preview 执行（step193api），31 段已于 2026-10-12 夜跑完，
> 但结果只落在 /tmp，VM 更换时被清空、未能成稿；用户拍板用微信 dpsk 重跑本批。
> 本批模型与前四批不同，结论独立成册；核查纪律不变：全部 [高] 人工抽查源码，
> 结论分「已验证」「降级」「已证伪」「已知设计」四类。
> 本批共 31 次调用：①后端补尾 9 段（run-loop / pipeline / apply-event /
> session/store / checkpoint 的 10000 字符后部分 + sessions @10000 未成稿段重审），
> 至此后端主要文件全文覆盖；②前端三端首审 22 段（desktop 主进程全文及其终端/
> 更新/窗口模块、web 设置存储与聊天渲染面、miniapp 传输层与会话页）。

## 统计（模型报告口径，不含已证伪）

- [高] 17 条；[中] 51 条；[低] 55 条。
- 无发现片段 10 段：run-loop @20000、apply-event @30000、desktop-main @30000、
  web-settings @10000、miniapp-rest、miniapp-pair-runtime、miniapp-eventsrc 尾段、
  web-sessionsurface @0、miniapp-sessionpage @10000、web-bridge-ui。
- **核查结论：17 条 [高] 无一按原级成立**——降级为 [中] 4 项（源 5 条）、降级为 [低] 3 条、
  已证伪 6 条、已知设计 2 条、分层误判 1 条、并入相邻条目 1 条。本批 [高] 准确率与第四批同为最低档，
  再次印证：单段审查缺跨文件上下文时，[高] 结论必须以人工核查为准。

## 重点发现（经人工核查后，按核查等级）

1. **[中·已验证机制] desktop main.ts：本地端口竞态 + 探活无身份校验（模型原报 2 条 [高]，合并降级）。**
   pickPort（124 行）以 listen(0) 取端口后 close，sidecar 随后重绑，存在 TOCTOU 窗口（代码注释自承
   「本地量级竞态可忽略」）；waitReady（252 行）轮询 /api/healthz 仅判 res.ok，无随机 token/路径握手。
   若本地恶意进程在窗口期抢绑并伪装 200，壳会把攻击者页面加载进 BrowserWindow。利用前提苛刻
   （同机进程 + 应用启动瞬间竞态），定 [中]；建议探活加一次性随机路径或 nonce 校验。

2. **[中·已验证机制] desktop terminal-pty.ts：终端槽位归属只绑输出、不验输入（模型原报 [高]）。**
   create 以 webContentsId 建槽（slots 存归属、onData 只推回创建窗口、killForContents 按窗口清槽），
   但 input/resize/exit（terminal-pty.ts:102-124）仅按 slot 号查表，不校验调用者是否为槽位属主；
   slot 为自增整数（nextSlot++）可猜。多窗口形态下任一渲染进程可向他人窗口的 PTY 写入或将其杀掉，
   与 S4「多窗口不串台」的设计目标不一致。窗口均为自家页面、需先有渲染层沦陷才可利用，定 [中]；
   建议 input/resize/exit 补属主校验（IPC 注册处把 event.sender.id 透传进 manager）。

3. **[中·已验证] desktop main.ts:394-396：will-navigate 白名单只有 127.0.0.1 前缀、端口未钉死（模型原报 [高]）。**
   `url.startsWith('http://127.0.0.1:')` 放行任意本地端口/路径，同机其他本地服务的页面一旦在壳窗口内
   导航成功，将与 sidecar 页面共享同一套 webPreferences（含 preload 终端桥）。setWindowOpenHandler
   一侧有 isShellPage(url, shellBase) 按完整基址把守（模型同段所报 sessionId 注入一条因此不成立，见
   已证伪 6），缺口仅在 will-navigate 一侧。建议改为与 shellBase（含端口）精确比对。

4. **[中·部分验证] miniapp pages/session/index.tsx:85-86：路由参数 title 直接 decodeURIComponent（模型原报 [高]）。**
   `decodeURIComponent(router.params.title ?? '')` 在渲染期同步执行，标题含裸 `%`（如「100% 掌握」类
   会话名经二次编码/解码错位）时抛 URIError 致整页崩溃——崩溃面属实；模型所称「外部构造链接注入
   导航栏文案做钓鱼」不成立（标题源为用户自己的会话名、显示在自己设备的导航栏）。定 [中]，
   建议 decode 加 try/catch 兜底并限长。

5. **[低·提示] 其余降级条**：sidecar env 透传 process.env（NODE_OPTIONS 等可被继承——env 来自用户
   自身启动环境，属纵深防御项，模型原报 [高]）；apply-event 的 WeakMap 索引陈旧担忧为推测、无具体
   失配分支（原报 [高]）；Composer 的 @ 菜单 effect 依赖对象引用，但已有 150ms 防抖 + 代际丢弃，
   请求放大有限（原报 [高]，实为性能小疵）。

## 分段明细（模型原文，[高] 的核查结论见上节与文末）


**packages/engine/src/run-loop.ts @10000**：

[高] 行 553（`deps.tools.runAll(turn, calls)`）与行 541：`calls` 直接来自 LLM 输出的 `result.content`，工具名与 `input` 未经本函数任何校验就批量执行。虽然最终执行点在 tools 层，但本循环对 `calls.length`、`turn.step` 的检查均在 `runAll` 之前完成后即整体委派，且截断分支（行 490-491）与步数分支（行 549）都以同一 `calls` 对象闭合，缺少对单个 call 的独立复核。影响：若 tools 层的白名单/参数校验存在缺口，模型可通过一次响应注入多个调用绕过逐调用校验；且 `closeDanglingCalls` 与 `runAll` 使用同一批对象，校验与执行之间无不可变快照。

[高] 行 425-438：溢出重试路径中 `continue` 前未重置 `turn.step`，也未检查 `deps.maxStepsPerTurn`。`overflowCooled` 仅保证一次，但压缩后 `continue` 回到循环顶部再次 `turn.step += 1`；若压缩后模型持续返回 `error`/overflow 交替，`overflowCooled=true` 后走 error 分支，此处本身有限。但真正的风险在行 436 `continue` 后，`turn.step` 已自增而 `turn.toolCalls`/`turn.usage` 未回滚，`assistant.message` 未 emit 就重新采样，造成 usage 记账与事件流不一致（行 413-414 已 addUsage 并写 turn.usage）。影响：预算熔断（行 423/473）按 usage 判定，重复计数会提前触发熔断；事件流中该 step 无 assistant.message 但有 usage，投影层状态不一致。

[中] 行 355-357：steering 队列 `rt.drainSteer()` 产出的 `item.text` 直接作为 `user.message` 落盘，且注入了 `turn.step` 循环内、`user_prompt_submit` hook（行 324）之后。影响：steering 文本绕过了 `deps.mentionExpand`（行 321）与 `user_prompt_submit` hook，若 mention 展开或 hook 承担了输入消毒/审计职责，则 steer 路径是鉴权与审计盲区；恶意/被污染的下游可通过 steer 注入未经处理的指令进入模型上下文。

[中] 行 528-537：`ZC3_MAX_CONTINUATIONS` 续写路径在 `turn.step >= deps.maxStepsPerTurn` 检查（行 521）之后追加 `user.message` 并 `continue`，但 `turn.continuations` 与 `turn.step` 是两个独立计数。影响：每次续写仍消耗 step，步数上限最终会拦截，但 `truncated.length === 0` 时先自增 continuations 再判断，边界上可多跑一轮；且续写指令文本（行 535）固定注入，模型若反复返回纯文本 length，会在 `maxStepsPerTurn` 与 `ZC3_MAX_CONTINUATIONS` 之间产生非预期的步数消耗，影响预算熔断判定口径。

[中] 行 559-560：`runaway.observeAndDetect` 传入 `calls.map(c => c.input)` 与 `toolResults.map(r => r.output)`，`input`/`output` 为 LLM 与工具返回的任意对象。影响：若 runaway 实现内部对 `input` 做属性访问/序列化（如 JSON.stringify、深层遍历）而无类型/深度约束，存在原型污染或循环引用导致抛错的风险；此处未做任何防御，抛错会被行 589 catch 捕获并使整个 turn 以 error 闭合（fail-closed 但可用性受损），同时该 turn 的 toolResults 已执行完毕（行 553），结果已产生副作用但未落盘。

[中] 行 343-350 与 473-487：预算熔断在两处检查，但行 343 处检查发生在 `turn.started` 已 emit（行 334）之后。影响：`turn.started` 已落盘而 turn 以 error 闭合，事件流中出现"已开始但被拒"的 turn；若下游消费者按 turn.started 分配资源，可能造成状态泄漏。此外行 343 的 `deps.budget.exceeded()` 与行 423 的 `add` 之间无原子性，同一 turn 内多次调用可并发越过阈值。

[低] 行 407-411：`onDelta`/`onThinking` 回调中直接 `emitLive`，`thinking += text` 累积无长度上限。影响：模型若在 reasoning 阶段输出超长文本，`thinking` 字符串可无界增长直至 `reasoning.ended`（行 465）一次性 emit，存在内存放大风险；`emitLive` 的背压行为未在本文件约束。

[低] 行 431：`classifyLlmError(result.error).kind` 在 `result.error !== undefined` 已判空后调用，但 `classifyLlmError` 若对未知错误返回 undefined 或抛错，行 431 的 `.kind` 访问会抛错并被行 589 捕获，导致本可降级为普通 error 的路径变为整体 turn error。判断依据：本行未对 `classifyLlmError` 返回值做空值保护。

**packages/engine/src/run-loop.ts @20000**：

未发现值得报告的问题。

**packages/engine/src/tools/pipeline.ts @10000**：

[高] 第 322-347 行（`effectiveInput` / 权限门）：hook 改写输入（`hookVerdict.rewrittenInput`）在 `pre_tool_use` 之后直接作为权限判定的资源来源，但代码注释承认改写可来自 hook。若 hook 改写绕过/放宽了资源，`resourceOf`、`patternsOf`、`alwaysAsk` 全部基于改写值计算，而 `tool.started` 载荷保留原始输入——权限审计与事件流所见输入不一致，存在以改写值提权的风险。判断依据：权限判定输入（effectiveInput）与事件载荷（hookInput）不同源，且代码仅在注释中断言"改写不可越权提权"，无任何强校验保证 hook 改写后的输入不扩大资源范围。

[中] 第 367 行（`def.inputSchema.parse(effectiveInput)`）：`inputSchema.parse` 若抛出 ZodError，会被第 424 行 catch 捕获并 `mapError`，但 `mapError` 的具体映射未在此文件可见；若 mapError 将 schema 校验错误映射为普通错误而非 fail-closed 的拒绝语义，则形状非法的输入可能被当成一般执行错误处理。判断依据：`inputSchema.parse` 是同步抛错点，位于 try 内，错误语义完全依赖外部 `mapError` 实现，本文件无法保证 fail-closed。

[中] 第 396-409 行（guard 过滤）：`this.deps.guard.apply(bounded)` 对输出做敏感片段过滤与注入扫描，但告警仅 `emit` 事件、不阻断（注释明说"告警不阻断 turn"）。若 guard 检出注入但仅告警，`finalOutput` 仍为过滤后的输出并继续回填到 run-loop，可能导致被注入内容进入下一轮上下文。判断依据：代码在检出 warnings 后仍返回 `finalOutput`（可能含未被规则覆盖的注入内容），且无二次阻断。

[中] 第 428-432 行（catch 中 `gate.close()`）：catch 内对 `gate.close()` 的异常做静默吞没。虽然注释说明是为闭合链完整，但若 `close()` 抛出的不是"已消费的 drainError"而是新的、未上报的错误（例如底层流错误），会被静默丢弃。判断依据：`catch {}` 无任何记录/上报，无法区分"已消费"与"新错误"。

[低] 第 452 行（`emitCompleted`）：`tool.completed` 载荷包含 `output`（原始未过滤的 `finalOutput` 已在 415 行传入），而方法注释（440-441 行）声称"载荷不含 output"。注释与实现不符，且 output 可能超大/含敏感内容被写入事件总线。判断依据：452-458 行 `output` 被显式放入 emit 载荷，与 440 行注释矛盾。

[低] 第 459-464 行 / 467-472 行（hooks `fire`）：`tool.completed`/`post_tool_use*` hook 的 `fire` 未 await，异常/拒绝未被处理。判断依据：调用点无 `await` 也无 `.catch`，若 fire 返回 rejected promise 会成为 unhandled rejection；与 295 行 `fireBlocking` 的 await 语义不一致。

[低] 第 281 行（`hookInput`）与 322-323 行（`effectiveInput`）：`resolveInput` 在权限门之前运行且其结果进入 `tool.started` 载荷（287 行）和 hook 数据（299 行），若 `resolveInput` 会做路径解析/展开，其输出可能包含绝对路径等敏感信息进入事件总线。判断依据：resolveInput 的返回值未经任何脱敏即进入事件载荷。

**packages/protocol/src/apply-event.ts @10000**：

[高] `applyEvent` / 行 463：去重判定在 `existing.lastSeq` 上做 `e.seq <= existing.lastSeq`，但当事件无 `seq`（`e.seq === undefined`）时完全跳过去重。如果同一持久事件在回放与直播路径下一条带 seq、一条不带（或两条都不带），会产生重复投影（重复 items、重复 usage 累加，如 `turn.completed` 的 `addUsage`）。判断依据：行 463 的条件要求 `e.seq !== undefined`，而下游如 `turn.completed`（行 578）、`turn.started`（行 569）等对 items/usage 的追加是无幂等的。

[高] `applyEvent` / 行 465–471：索引缓存以 `items` 数组引用为键写入 WeakMap，但 `reduceEvent` 内部多处通过 `next.items = [...]`（如行 569、586–588）产生新引用，若某些分支返回的 `result.byId[e.sessionId]` 与传入的 `s.byId[e.sessionId]` 是同一对象（例如早退分支 `session.resumed`/`goal.completed` 中 `next.items` 未变，`next = {...slice}` 仍是新对象，items 引用等于输入），则 `itemIndexCache.set(out.items, idxBox.idx)` 会用「基于旧 items 构建的 idx」覆盖同一数组引用的缓存条目。若 `idxBox.idx` 在 reduce 中未随 items 变化更新（例如分支内只改了 items 未维护索引，或走的是 fallback 重建但未回写），后续对同一 items 引用的查询会命中陈旧索引。判断依据：行 470 无条件 set，缺少「idx 与 out.items 实际一致」的校验；虽然 `toolIndexOf`/`openAssistantIndexOf` 有谓词校验兜底，但 `openAssistantIndexOf`/`openReasoningIndexOf` 在 `streaming` 语义上依赖 `assistantOpen`/`reasoningOpen` 下标，若索引指向的槽位恰好仍满足谓词但已非「最近敞口」，会静默返回错误项。

[中] `buildItemIndex` / 行 380–393：`turns.get(turnId) ?? {...}` 每次拿到已有对象后就地修改（`t.reasoningSeen = true` 等）再 `turns.set`。虽然该对象只在本函数内新建并放入 Map，但 `turnEntryOf`（行 329–337）在 miss 时返回**新建**对象，调用方若把返回值当作可写状态持有并与 `idx.turns` 共享同一对象，则对 `idx.turns` 的后续演进会污染此前返回的引用。判断依据：`buildItemIndex` 就地改 `t`，而 `ItemIndex.turns` 的值类型 `TurnStreaming` 是可变的（字段非 readonly），与文件顶部声明的「不可变纪律」注释矛盾。

[中] `applyEvent` / 行 460 + 476：`existing` 用 `s.byId[e.sessionId]` 取，`reduceEvent` 内部又用 `s.byId[e.sessionId] ?? emptySessionSlice(...)` 重新取。两次读取之间无并发，但 `emptySessionSlice` 生成的新 slice 若其 `items` 是共享的模块级空数组（未在本段展示），则 `itemIndexCache` 会以该共享数组为键缓存索引，后续所有新 session 共享同一索引条目，一旦某个分支错误写入会造成跨 session 索引污染。判断依据：行 465 以 `curItems` 为键，行 476 fallback 新建 slice，若 `emptySessionSlice` 返回共享 items 引用则触发上述风险。

[中] `reduceEvent` / 行 531–539 `goal.updated`：`pausedReason` 只在 `e.data.status === 'paused'` 时从 `next.goal.pausedReason` 顺延，但 `next.goal` 可能为 `null`（行 536 已判空）。更严重的是 `goal.updated` 未校验 `e.data.iterations`/`usedTokens` 的合法性（负数、非有限数），这些值直接进入投影并被 UI 展示，可被构造事件污染。判断依据：行 532–534 直接透传 `e.data` 字段，无 sanitize。

[中] `applyEvent` / 行 463：`e.seq <= existing.lastSeq` 使用 `<=` 判定重复。若两条不同事件拥有相同 `seq`（例如引擎侧 seq 冲突或跨 session 复用），第二条会被静默丢弃，造成状态不一致且无告警。判断依据：行 463 直接丢弃，无日志或断言；文件注释声称「durable 且 seq <= lastSeq → 跳过」，但未区分「同 seq 不同事件」与「真正重放」。

[低] `reduceEvent` / 行 587：`items2[ti] = { ...cur, finishedAt: e.time, finish: e.data.finish }` 就地改写新数组中的元素，随后 `next.items = items2`。但 `findLastTurn(next.items, ...)` 用的是 `next.items`（可能是旧引用），而 `items2 = [...next.items]` 拷贝后按下标 `ti` 写入。若 `ti` 来自对旧数组的查找且旧数组与 `next.items` 在此时不一致（例如前面分支已替换 `next.items`），下标会错位。判断依据：行 582 查找与行 586 拷贝之间无引用一致性保证。

[低] `openAssistantIndexOf` / 行 419–433：谓词校验只检查 `it.streaming !== undefined` 与 `it.turnId === turnId`，未校验 `it.streaming` 是否仍处于「未闭合」语义（注释称 streaming !== undefined 即开放，但 `buildItemIndex` 行 391 用 `it.streaming !== undefined` 记录 open，语义应一致）。若某分支将 `streaming` 置为 `false` 而非 `undefined` 来闭合，索引会误判为仍开放。判断依据：行 426 与行 391 对「开放」的判定标准必须与闭合路径的写值保持一致，本段未展示闭合路径，存在契约漂移风险。

**packages/protocol/src/apply-event.ts @20000**：

[高] 位置：`tool.progress` / `tool.completed` 分支（行 822–858，函数内 `toolIndexOf(items, ...)` 与 `items = [...items]` 的时序）
问题：`tool.progress` 在索引命中后执行 `items = [...items]` 再做替换，但 `toolIndexOf` 使用的是外层的 `items`（第 824 行传参为 `items`，而此时 `items` 仍是上一事件分支留下的引用）。在 `tool.completed`（836–857）中，`i` 基于旧的 `items` 计算，随后 `items = [...items]` 重新拷贝并写入 `items[i]`，但如果命中项在 `toolIndexOf` 与写入之间被并发/交错修改（同一 reducer 中多个 tool 事件串行处理时通常一致，但一旦 `idxBox.idx` 与 `items` 数组因索引失配回退线性扫得出不同位置），会写错条目。判断依据：多处使用“先按索引查位置、再拷贝数组写回”的两段式，索引维护与数组拷贝非原子，且 `toolIndexOf` 的回退线性扫与索引结果可能不一致。

[中] 位置：`assistant.message` 分支（行 662–719）
问题：定稿时对 `e.data.content` 中每个 `toolCall` 无条件 `items.push` 新的 `tool` running 项，未检查是否已存在同 `callId` 的项（与 `tool.started` 分支第 798 行的去重逻辑不一致）。若 `tool.started` 先于 `assistant.message` 到达（或两者针对同一 callId），会产生重复 tool 项，且 `withToolCall` 覆盖索引指向最后 push 的位置，导致先前项成为孤儿。
影响：UI 重复展示工具调用、状态错乱（一个 completed、一个仍 running），并可能造成 `runningTools` 集合与 items 不一致。
判断依据：`tool.started` 分支显式做了 `toolIndexOf === -1` 去重（行 800），而 `assistant.message` 的 toolCall 展开（行 699–713）没有同样的检查。

[中] 位置：`tool.completed` 分支（行 851–855）与 `tool.started`（行 813–817）
问题：`runningTools` 用 `Set` 重建并写回，但 `tool.completed` 在 `toolIndexOf` 未命中（i === -1，即该项不存在）时仍会执行 `running.delete(callId)` 并写回 activeTurn。若此前从未 add（例如 `activeTurn` 是后来才建立的），该 delete 是空操作无害；但若 callId 因重复项被索引指向了错误条目，`runningTools` 的增删会与实际 items 脱节。
影响：`activeTurn.runningTools` 与实际运行中的工具项不一致，可能导致 turn 无法正确判定结束/等待。
判断依据：`runningTools` 与 items 中 tool 项的状态是两套独立状态，没有在每次工具状态变更时强制同步。

[低] 位置：`assistant.delta` 分支（行 635–639）与 `reasoning.delta`（行 734–737）
问题：迟到 delta 直接 `return s`（返回原 state 引用），但此前若已对 `idxBox.idx` 做了 `withTurn` 等原地副作用（本例中该分支未改 idx，故仅潜在风险）。这类“先改共享可变索引、后提前返回”的模式在其它分支（如 597–606、680–684）中真实存在：`idxBox.idx` 已被修改，但返回的 state 是新的 `s`，二者通过闭包共享 `idxBox`。若调用方在失败/重试路径上复用同一 `idxBox`，索引会与实际 state 不一致。
影响：索引与状态不一致，后续 O(1) 查询可能命中错误条目，进而写错 item。
判断依据：`idxBox.idx` 是可变的外部闭包状态，`return s` 早退路径不会回滚已做的 `withTurn` 变更。

[低] 位置：`reasoning.ended`（行 769–771）与 `assistant.message`（行 671–678）
问题：定稿时用 `e.time - cur.startedAt` 计算 `durationMs`，未校验 `e.time` 是否可能小于 `startedAt`（乱序/时钟回拨的事件流）。会得到负的 durationMs。
影响：UI 展示负时长，或下游按 durationMs 做聚合统计时出错。
判断依据：事件 `time` 来自外部输入，reducer 未做单调性校验，直接相减。

**packages/protocol/src/apply-event.ts @30000**：

未发现值得报告的问题。

说明：本段为纯投影 reducer，仅做不可变状态更新与数组过滤/映射，未涉及注入、路径穿越、鉴权、凭证、动态执行/反序列化、SSRF、XSS、原型污染或资源泄漏。竞态与 fail-open 方面也无实质缺陷：`task.completed`/`task.progress` 对未知 id 静默忽略、`question.resolved` 未命中时仍按设计清除 `waiting`、`io.warning` 失配时不修改 items，均符合其注释声明的重放容错语义；`ofType` 判别的字段访问均在对应事件分支内，未发现越界或未校验导致的崩溃路径。

**packages/engine/src/session/store.ts @10000**：

[中] `seed()`（行 294–306）：批量落盘过程中未复用 `append()` 的"先盘后树"失败闭合语义——若某条事件 `appendFile` 成功但 `tree.append` 抛错，或循环中途某次写失败，已写入的事件已在磁盘但树状态与磁盘分裂（与行 280–282 明确承诺的"写失败时树/磁盘不分裂"矛盾）。影响：fork 种子部分持久化后 `tree` 与文件不一致，后续 resume/回放可能读到重复或缺失的种子事件。判断依据：`append()` 逐条先写盘再 append 树并依赖单次成功闭合；`seed()` 在循环内无回滚/补偿，且同样把 `this.queue` 吞掉错误（行 304），失败后队列继续接受后续写入，放大不一致窗口。

[中] `writeLine()`（行 320–322）与 `flush()`/`close()`（行 309–318）：`this.fh?.` 可选链使已关闭会话（fh=null）时写入静默变为 no-op，而 `append()`/`seed()` 对 fh===null 显式抛 `E_SESSION_CLOSED`（fail-closed）。`writeLine` 存在 fail-open 路径：调用方以为已落盘实际丢弃。影响：会话关闭后仍可"成功"写入审计/事件行导致静默数据丢失。判断依据：同一类中两处对 fh===null 的处理语义相反。

[低] `close()`（行 314–318）：`await this.flush()` 内部先 `await this.queue` 再 `sync()`，但 flush 与 close 非互斥；若在 `flush` 的 `await` 期间有新的 `append()` 入队（fh 尚未置 null），该事件会在 `sync()` 之后、`close()` 之前被 `appendFile` 排队，存在关闭与并发追加的竞态，可能造成关闭前最后一次写入未 fsync。判断依据：fh 置 null 在 await 之后，关闭窗口未阻止新任务入队。

**packages/engine/src/checkpoint.ts @10000**：

[中] 行 338（`git` 方法）：陈旧锁回收存在竞态。判断依据：仅凭 `mtime > 30s` 就 `rm(index.lock)`，而"无并发写者"这一前提从未真正验证——若另一进程正在执行一次耗时超过 30s 的 git 操作（大仓库 add/commit、慢速磁盘、被挂起的进程），其锁会被误删，导致两个 git 进程并发写 index，可能造成索引损坏或提交丢失。影响：检查点索引损坏、快照静默丢失。行 333–336 的注释也表明作者知道锁可能被并发持有，但该分支仍直接判定为 stale。

[中] 行 343–349（`gitRaw`）与行 352–357（`gitShow`）：git 命令未设置 `GIT_CONFIG_NOSYSTEM`/`GIT_CONFIG_GLOBAL`，也未使用 `-c` 固定配置。判断依据：`git show`/`git diff` 的行为受用户与系统级配置影响（如 `core.pager`、`diff.external`、`core.hooksPath`、`filter.*`、`core.fsmonitor`、别名等）；若仓库内 `.git/config`（或环境）被污染，`diff.external`/textconv 之类的配置会触发外部程序执行。影响：在受不可信工作区影响的场景下可导致意外命令执行或输出被篡改（进而污染审查结果）。

[中] 行 279–282（未跟踪文件扫描）：以 `bytes.subarray(0, 8000).includes(0)` 判定二进制，并对整个文件 `toString('utf8')` 与 `countLines`。判断依据：只有前 8000 字节被检测，含 NUL 的更靠后内容会被当作文本；且文件被整体读入内存并做 UTF-8 解码，未对单个文件大小设限（仅对文件数量 `MAX_REVIEW_UNTRACKED` 设限）。影响：超大未跟踪文件（如日志、core dump、镜像）可导致内存放大/长时间阻塞；同时行数统计会因无效 UTF-8 替换字符而失真，进而影响 `additions` 与实际 patch 内容。

[低] 行 363（`appendIndex`）：读-改-写非原子事务，存在丢失更新。判断依据：`list()` 读取 + push + `atomicWriteFile` 之间没有文件锁或乐观并发校验；两个并发的 checkpoint 追加会互相覆盖，后写者丢弃先写者的记录（`atomicWriteFile` 只保证单次写入不撕裂，不保证跨调用的互斥）。影响：快照索引条目丢失，后续基于 checkpoint 的恢复/审计出现缺口。

[低] 行 311 与行 323–341：`ensure()` 中 `this.ready` 的检查与置位之间存在 await 窗口，多个并发调用会重复执行 `git init`。判断依据：`ready` 在 `await` 完成后才置为 `true`，期间重入会各自执行 `mkdir`/`git init`/写 `info/exclude`。影响：并发初始化时的重复执行与可能的 `exclude` 写入竞争，通常无害但会放大与行 338 锁回收竞态叠加的概率。

**apps/server/src/routes/sessions.ts @10000（第三批未成稿段，本批重审）**：

[高] 行 301-304（GET /api/attachments/*）：路径穿越依赖 AttachmentFileParams 正则白名单，但代码本身在拼接 `join(attachmentsDir, file)` 时未做独立校验；若该 schema 未严格锚定（`^...$`）或允许 `.`/`/`，`file` 可为 `../../...` 导致读取任意文件。判断依据：`file` 直接取自通配段原始字符串，`join` 不做规范化约束，安全性完全外包给未在此展示的正则，属高风险单点依赖。建议在拼接前显式拒绝含 `..`、绝对路径、分隔符的输入并校验解析后路径仍在 `attachmentsDir` 内。

[中] 行 260、298-299：`mime`/`ext` 白名单查表使用对象字面量 `MIME_EXT`/`EXT_MIME`，`Record` 继承自 `Object.prototype`，`MIME_EXT['constructor']`、`EXT_MIME['__proto__']` 等原型键会返回非 `undefined` 值，绕过 `=== undefined` 白名单检查。影响：`ext` 变为如 `constructor`，写入文件名 `attachmentId.constructor`；读取侧同理可返回非图片 MIME。判断依据：普通对象索引未用 `Object.create(null)` 或 `Object.hasOwn`。建议改 `Map` 或用 `Object.hasOwn`。

[中] 行 284-287（POST attachments）：`id` 来自 `IdParams` 且仅经 `requireHandle` 校验，随后直接 `join(attachmentsDir, id)` 作为目录名。若 `IdParams` 未严格限制 `id` 字符集（如允许 `..`/`/`），可写入任意路径（写文件原语）。判断依据：会话 id 被用作文件系统路径分量，缺少 `path.resolve` 后的前缀校验。

[中] 行 302-307（GET /api/attachments/*）：读取失败统一 `notFound`，`catch` 吞掉所有异常（包括权限、IO、路径非法）。属 fail-open/信息不足，且会掩盖路径穿越等异常。判断依据：空 `catch` 将任意错误（含 EACCES、EISDIR）映射为 404，不利于检测攻击与排障。

[低] 行 271-280：`x-file-name` 仅做 `decodeURIComponent`，未做长度限制与内容清洗，随后原样回显在 JSON 响应 `name` 字段。若前端将该 `name` 用于 DOM 渲染（如缩略图 title/下载名），存在存储型 XSS/响应头注入风险（含 `\r\n` 等）。判断依据：解码后未过滤控制字符、未限长、未做安全编码，属不可信输入直传下游。

[低] 行 285：`mkdirSync(dir, { recursive: true })` 与行 286 `writeFileSync` 为同步阻塞调用，位于异步请求处理路径中。影响：10MB 级写入阻塞事件循环，可被用于 DoS/拖慢并发。判断依据：应使用 `fs/promises` 异步 API。

[低] 行 288：响应包含 `file`（`${id}/${attachmentId}.${ext}`），将内部会话 id 与存储布局暴露给客户端，且未设 `Content-Disposition`/`X-Content-Type-Options`。GET 端点行 304 仅 `reply.type(mime)` 返回字节，若 MIME 判断可被绕过（见上条原型键问题），可能以非预期类型渲染。判断依据：缺少 `nosniff` 等安全响应头。

**apps/desktop/src/main.ts @0**：

[高] 行 144–155 `startSidecar`：以 `process.execPath`（Electron 二进制）+ `ELECTRON_RUN_AS_NODE=1` 方式启动 sidecar，`buildSidecarEnv` 若将 `baseEnv: process.env` 整体透传且未剔除/覆盖 `ELECTRON_RUN_AS_NODE`，子进程行为依赖环境变量注入；此处无法看到 `buildSidecarEnv` 实现，但 `cwd: homedir()` 与完整 `process.env` 透传会把用户环境中的 `NODE_OPTIONS`、`NODE_EXTRA_CA_CERTS`、`NODE_TLS_REJECT_UNAUTHORIZED=0` 等一并带入 server 进程，可能被利用为不安全执行/证书校验绕过。判断依据：`env: buildSidecarEnv({ baseEnv: process.env, ... })` 传入整个 `process.env`，且未见 `NODE_OPTIONS` 过滤。

[高] 行 124–137 `pickPort`：先 `listen(0)` 取端口再 `close()`，随后才由 sidecar 重新绑定该端口，存在典型 TOCTOU 端口抢占窗口。本地其他进程（或同机恶意进程）可在 close 与 sidecar bind 之间抢占该端口，导致 sidecar 绑定失败或更糟——若攻击者抢先绑定并伪装 `/api/healthz` 返回 200，`waitReady` 会误判就绪，壳随后把 `http://127.0.0.1:<port>` 加载进 BrowserWindow，前端将连接攻击者控制的本地服务（凭证/会话数据泄漏）。判断依据：注释自承「本地量级竞态可忽略」，但探活仅校验 HTTP 200，无任何身份校验（如随机 token 握手）。

[高] 行 252–270 `waitReady` + 行 9 加载 URL：探活仅检查 `res.ok`，无共享密钥/随机路径校验；结合上面的端口抢占，任何能绑定该 127.0.0.1 端口的本地进程都可冒充后端并被壳当作可信数据源加载。判断依据：`net.fetch(url)` 只判 `res.ok`，且 URL 为可预测的 `http://127.0.0.1:${port}/api/healthz`。

[中] 行 190、217 `loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))`：`html` 由 `renderFatalHtml` / `renderFirstRunHtml` 生成，输入包含 `reason`（含 sidecar stderr 尾部内容）与路径。虽然用了 `encodeURIComponent` 作为 URL 编码，但 HTML 本身若未对 `reason`/stderr 做 HTML 转义，stderr 中若含 `<script>`/`<img onerror>` 等会被渲染执行。判断依据：`reason` 来自 `stderrTailText()`（行 107–109）即 sidecar 原始 stderr，属不可信输入，`encodeURIComponent` 只做 URL 编码不做 HTML 转义；此文件的 data: 页面 `sandbox: true` 且 `nodeIntegration:false`，故定为中危而非高。

[中] 行 232 `mkdirSync(sparkDir, { recursive: true })`：`sparkDir` 来自 `process.env.SPARK_HOME`（行 187 `resolve(process.env.SPARK_HOME)`），环境变量可被父进程/启动脚本污染；虽然 `resolve` 会规范化，但若 `SPARK_HOME` 指向符号链接或敏感目录，会在该位置创建目录并被 `shell.openPath` 打开。判断依据：`resolve(process.env.SPARK_HOME)` 未做白名单/归属校验即用于 `mkdirSync` 与 `shell.openPath`。

[中] 行 239–248 `waitForFirstRunConfig` 轮询循环：无退出上限，仅靠 `firstRunWin === null` 或文件出现终止；若 `firstRunWin` 被外部逻辑置空失败或窗口对象泄漏，循环会永久运行并持续 `existsSync` 轮询。判断依据：`for (;;)` 无超时/次数上限。

[低] 行 256 `sidecar?.exitCode !== null && sidecar !== null`：逻辑顺序反了——先对可能为 `null` 的 `sidecar` 取 `exitCode` 再判 `sidecar !== null`。由于 `?.` 在 `sidecar` 为 null 时返回 `undefined`，`undefined !== null` 为 `true`，随后 `sidecar !== null` 为 `false`，整体短路为 false，语义上恰好正确，但写法颠倒易在后续维护中引入误判。判断依据：可选链与 null 检查顺序与惯用写法相反。

[低] 行 194–195、220–221 错误路径中 `killSidecar()` 与 `app.exit(1)`：`killSidecar` 定义未出现在本片段（>10000 字符外），无法确认其是否同步等待子进程退出；`app.exit` 立即终止进程，若 `killSidecar` 只是发信号不等待，可能留下孤儿 sidecar 进程。判断依据：`app.exit` 语义为立即退出，不触发正常清理钩子（代码注释亦承认「app.exit 不走 will-quit」），而 `killSidecar` 实现不在本区间。

**apps/desktop/src/main.ts @10000**：

[高] 行 341–344（terminal.* IPC 注册）：`terminal.input`/`terminal.exit` 使用 `ipcMain.on` 且只把 `event.sender.id` 传给 `create`，而 `input`/`resize`/`exit` 直接接收 `raw` 载荷、未见传入 sender 身份做归属校验；`terminal.resize` 用 `handle` 但同样未校验调用者。若 `TerminalPtyManager` 内部未以「创建者 wcId」绑定校验，任意渲染进程（含被 XSS 或导航到非白名单页面的窗口）可向他人窗口的 PTY 写入/调整/终止，形成跨窗口越权与注入面。判断依据：`resolveWindow` 按 `webContentsId` 反查通道说明槽位有归属概念，但这里 4 个调用点只有 create 传了 sender.id。

[高] 行 389–392（`setWindowOpenHandler`）：`isShellPage(url, shellBase)` 校验通过后立即 `void openWindow(sessionIdOfUrl(url))` 且返回 `deny`。`openWindow` 会用 `windowUrlOf(shellBase, sessionId)` 重建 URL，但 `sessionIdOfUrl(url)` 从外部传入的 url 中提取会话 id，若 `sessionIdOfUrl` 未做严格白名单/字符校验（如允许 `..`、`/`、`%2f`、`?`、`#`），可能拼出越出 shellBase 的 URL，绕过行 393–395 的导航白名单（那里只做 `startsWith('http://127.0.0.1:')` 前缀判断，任何 127.0.0.1 端口/路径都放行）。判断依据：白名单是前缀匹配且端口不限，配合未净化的 sessionId 可指向非 sidecar 的本地服务。

[高] 行 393–395（`will-navigate`）：白名单仅为 `url.startsWith('http://127.0.0.1:')`，没有端口与路径的精确校验，也允许 `http://127.0.0.1:任意端口/任意路径`。同机其它本地服务（开发服务器、用户自建服务）页面将获得与本应用相同的 webPreferences（preload 已注入、contextBridge 暴露的终端桥），导致终端 IPC 暴露给非受信本地页面。判断依据：行 353–359 的 preload 会随任意被允许导航的页面一起加载。

[中] 行 307–322（`spawnPty` 缺省工厂）：`env: process.env` 把主进程完整环境变量（可能含 API key、token、代理凭据）传给 PTY 子进程，且 `cwd: homedir()`。终端里任何命令及其子进程都能读取全部环境凭证；若终端命令涉及外部输入（用户粘贴、被注入的命令），凭证泄漏面被放大。判断依据：注释只声明「IPC 面没有 shell 路径字段」，未对 env 做最小化。

[中] 行 341、343（`terminal.create` / `terminal.resize`）：`ipcMain.handle` 直接透传 `event.sender.id` 与 `raw`，未见速率/尺寸上限校验。若 manager 内对 `cols`/`rows` 仅做类型校验而无范围限制，恶意渲染进程可传入极大值触发 pty 端内存/资源问题；`terminal.input`（行 342）同理无大小限制。判断依据：注释称「zod 校验在 manager 内」，但这里无法确认有数值上下界，属需确认项——若 manager 无界即为缺陷。

[中] 行 532–542（`sidecar.on('exit')` 早退分支）：就绪前退出只调 `showFatalWindow(...)`，不设重试/退避，也不重置 `sidecar` 引用；若 `showFatalWindow` 内部或用户操作触发再次启动流程，可能对已退出进程重复监听或误判状态。同时 `ready`/`quitting` 为跨事件共享可变状态，未见加锁，存在竞态导致「崩溃后仍认为就绪」或「退出时仍重启」。判断依据：注释自述「不立即 app.quit」，状态机靠外部事件推进，缺少互斥。

[低] 行 518–519（`sparkDir`）：`process.env.SPARK_HOME` 经 `resolve` 后直接用于拼接 `models.json`/`desktop.json` 路径，未做路径规范化或来源可信校验。虽然来自本机环境变量（威胁等级低），但若上层脚本/启动器可被注入，可将配置指向任意目录。判断依据：`resolve` 只做相对路径转绝对，不限制根目录。

[低] 行 365–374（`close` 处理器）：`decideCloseAction` 返回非 quit 时一律 `preventDefault()+hide()`，没有对「正在进行的数据写入/终端会话」做 flush 或确认。在 `hideOnClose` 为真且托盘可用时，用户以为已关闭但 PTY 与 sidecar 继续运行，属预期行为（注释已说明），但缺少向用户提示的可见状态，可能造成「找不到的进程」体验问题。判断依据：注释承认该语义，未提供任何 UI 指示。

**apps/desktop/src/main.ts @20000**：

[高] 行 550、564、609、667：`shellBase` 用 `http://127.0.0.1:${port}` 拼 URL，而 `port` 来源（sidecar 输出）未见校验；`shellBase` 仅做空串判断（609/667）便放行 `openWindow`。若 sidecar 端口来源被污染（如 sidecar stderr 注入/环境变量/端口协商被劫持），可导致窗口加载非预期本地服务（SSRF/本地提权面）。判断依据：基址是后续导航白名单与页面判定的唯一权威，却只做非空检查，缺少 `Number.isInteger(port) && port>0 && port<65536` 之类约束。

[高] 行 644–647、677–685：win32 分支 `killSidecar()` 用 `spawn('taskkill', ['/PID', String(child.pid), ...])`。参数数组形式本身避免了 shell 注入，但 `child.pid` 若为 `undefined` 已在 680 行判掉，问题不大；真正的风险在 `will-quit` 的 win32 分支直接 `return` 且不 `preventDefault`——若 `killSidecar` 内 `spawn` 抛错（例如 PATH 中 `taskkill` 不可用）则异常冒泡，退出流程 fail-open，sidecar 及其派生的 MCP/LSP 子进程成为孤儿。判断依据：`spawn` 未包 try/catch，`killSidecar` 无返回值、调用处也不检查是否真的发出 kill。

[中] 行 641：`if (sidecar === null || sidecar.exitCode !== null) return`。`exitCode` 只在进程已退出后非 null；进程处于「已 spawn 但尚未真正退出」时该判断正确，但若 `sidecar` 对象已被替换或 `exitCode` 因某种原因未同步（Node 事件时序），可能提前放行导致 `will-quit` 不 `preventDefault`，app 直接退出而 sidecar 存活。判断依据：依赖单一可变字段 `exitCode` 作为「已死」判据，未结合 `killed`/`signalCode`。

[中] 行 652–655：`child.once('exit', ...)` 中调用 `app.quit()`。若 `child` 因信号被杀（`signalCode` 非空）也会触发 `exit`，此时 `clearTimeout(killTimer)` 后 `app.quit()` 会再次进入 `will-quit`；第二次进入时 `sidecar.exitCode` 可能仍为 null（信号退出时 `exitCode` 为 null，`signalCode` 才非空），导致 641 行判断为假，再次 `preventDefault` 并注册新的 `once('exit')`——但进程已退出，`once('exit')` 永不触发，`app.quit()` 卡死、5s 后 SIGKILL 无对象。判断依据：退出判据 `exitCode !== null` 与信号退出场景不匹配。

[中] 行 574–584：`autoUpdater.logger = null` 后调用 `checkForUpdatesAndNotify()`。`void` 丢弃 Promise 且无 `.catch`，虽然外层 try/catch 只能捕获同步错误；`checkForUpdatesAndNotify` 的异步失败（如签名校验失败、下载劫持）不会走 581 行 catch，也不会被 `wireUpdaterEvents` 之外的地方记录。若更新包校验依赖默认 logger 的告警路径，置 null 可能吞掉安全相关告警。判断依据：`logger = null` 移除了 updater 内部的错误/校验日志出口，且异步失败无兜底。

[中] 行 587–594：`startNotifications` 在 `openWindow`/`applyDesktopBehavior`/自更新初始化之后启动，且其返回的 `notify` 在 `will-quit` 中才 `stop()`。若 `startNotifications` 内部持有 sidecar 连接/定时器，而 `will-quit` 的 641 行早退分支（`sidecar === null || exitCode !== null`）在 `notify.stop()` 之前就已 `return`——不对，635–636 行在 641 行之前，`notify.stop()` 会执行。此项撤回。

[低] 行 617–620：`browser-window-focus` 里直接 `lastFocused = win` 并 `refreshMenus()`。`win` 来自事件，若窗口已销毁（destroyed）仍被赋给 `lastFocused`，后续 `revealTargetWindow` 可能对已销毁窗口操作。判断依据：未检查 `win.isDestroyed()`。

[低] 行 665–671：`second-instance` 处理器中，当 `shellWindows().length === 0` 且 `shellBase === ''` 时直接 `return`，不唤窗也不提示；第二个实例已在 663 行 `app.quit()`，用户会看到第二个实例无声退出而第一个实例无任何反馈（sidecar 未就绪窗口期的竞态）。判断依据：`shellBase` 为空时静默返回，无日志/无 UI 反馈。

[低] 行 607–613：`activate` 与 `second-instance` 逻辑几乎重复，且都只判 `shellBase !== ''` 就调 `openWindow`，未判 sidecar 是否仍存活（`sidecar.exitCode`）。sidecar 崩溃后 `shellBase` 仍为旧值，此时 `openWindow` 会加载一个已死端口的 URL，得到连接失败页而非明确错误。判断依据：`shellBase` 只在启动时赋值一次，未随 sidecar 退出清空。

**apps/desktop/src/main.ts @30000**：

未发现值得报告的问题。

**apps/desktop/src/terminal-pty.ts + terminal-shell.ts（全文）**：

[中] apps/desktop/src/terminal-pty.ts 第 95–98 行（`input`）：槽位越权（跨窗口写终端）——`input` 只按 `slot` 查表写入，未校验 `entry.webContentsId` 是否与调用来源窗口一致。虽然 `slot` 由 main 分配且推送只回创建窗口，但任一 renderer（或被注入的 renderer/其他窗口）只要猜中/遍历到非负整数 slot，即可向别的窗口的 pty 注入按键（等同于在他人 shell 中执行命令）。判断依据：`input`/`resize`/`exit` 三个入口的签名只收 `input: unknown`，没有 `webContentsId` 参数，`SlotInput`/`InputData` schema 中也不含来源校验，与注释声明的 S3「槽位号绑定」目标不符。

[中] apps/desktop/src/terminal-pty.ts 第 72–92 行（`create`）：槽位号单调递增且不回收，`nextSlot` 无上限、无循环复用，长时间运行会持续增长（Number 溢出后 `set` 会因 `nextSlot += 1` 超过 `Number.MAX_SAFE_INTEGER` 而精度丢失导致 slot 碰撞/覆盖已有条目）。影响：极端长期使用下槽位碰撞可能让 `input` 写入错误 pty，且 Map 的键语义被破坏。判断依据：第 79–80 行 `const slot = this.nextSlot; this.nextSlot += 1`，无边界检查、无复用策略。

[中] apps/desktop/src/terminal-pty.ts 第 86–90 行（`create` 的 `onExit` 回调）：`exit`/`killForContents`/`killAll` 与 pty 异步 `onExit` 之间存在竞态——renderer 调 `exit` 后 `slots.delete(slot)` 已执行，随后 pty 真正退出触发 `onExit` 时仍会 `win.push(DATA_CHANNEL, { slot, data: EXIT_MARKER })` 推一条退出标记；若此期间 `nextSlot` 已复用同号（当前实现不复用，但一旦引入复用即错位），会把退出标记推给新终端。更直接的现实影响：`killAll`/`killForContents` 清表后 `onExit` 仍向可能已销毁的窗口 `push`，缺乏 `win` 存活/`slots` 是否仍持有该 slot 的检查，可能抛异常或误推。判断依据：第 88 行在 `onExit` 内无条件 `win.push`，未先校验 `this.slots.get(slot) === entry`。

[低] apps/desktop/src/terminal-pty.ts 第 82–85 行（`create` 的 `onData` 回调）：`win.push` 被闭包捕获，窗口销毁后仍持有 `TerminalWindowPush` 引用；若 `resolveWindow` 返回的 push 内部未做销毁检查，pty 在窗口关闭到 `killForContents` 生效之间产生的输出会推向已销毁窗口。属资源/生命周期健壮性问题，非直接安全漏洞。

[低] apps/desktop/src/terminal-shell.ts 第 45–50 行（`gitBashCandidates` PATH 兜底）：`env.Path`/`env.PATH` 分割后直接 `join(dir.trim(), 'bash.exe')` 并交给 `existsSync`/最终 spawn，未做目录合法性校验（如空段、含引号/换行）。在 Windows 上 PATH 可被用户/安装器写入，若攻击者能改 PATH 即可让终端 spawn 其放置的 `bash.exe`（DLL/可执行劫持的经典面）。影响面有限（需本地写 PATH 权限），但属于「spawn 路径由环境决定、未固定」的加固点。判断依据：第 47–49 行无路径规范化或白名单。

[低] apps/desktop/src/terminal-shell.ts 第 66–67 行（`shellProfileOf`）：`env.windir ?? 'C:\\Windows'` 直接用环境变量 `windir` 拼接 `System32\\cmd.exe`，同样未校验，环境变量被篡改时指向任意 `cmd.exe`（同 PATH 劫持面）。此外 `gitBashCandidates` 中 `env['CommonProgramFiles(x86)']` 未涵盖 `CommonProgramFiles`（非 x86 的 Common Files），与第 2–8 行注释「Common Files 与 ProgramFiles 两处惯例路径」的声明不完全一致——属正确性瑕疵。

**apps/desktop/src/updater.ts + sidecar-env.ts（全文）**：

[低] `apps/desktop/src/sidecar-env.ts:17-23`（`buildSidecarEnv`）— 问题：`baseEnv` 被整体展开后仅覆写少数键，未清理父进程可能已存在的敏感/危险环境变量（如 `NODE_OPTIONS`、`NODE_PATH`、`ELECTRON_RUN_AS_NODE` 之外的 Electron/Node 注入面）。影响：从终端以带污染 env 的形态启动时，`NODE_OPTIONS`（如 `--require` / `--import`）会被 sidecar 继承并在子进程启动时执行任意代码，形成本地提权/代码执行面。判断依据：注释明确"从终端带 env 启动的形态照旧可用"即继承语义是刻意保留的，但 `NODE_OPTIONS` 这类可执行任意脚本的变量不属于 CA 路径等无害配置，继承它等于把父进程的任意加载指令传给子进程；代码未做任何白名单/剔除。

[低] `apps/desktop/src/updater.ts:41-48`（`missingUpdateAssets`）— 问题：资产名核验仅用后缀匹配（`f.endsWith('.exe')`、`f.endsWith('.blockmap')`、`f === 'latest.yml'`），未校验 `.exe` 与 `.blockmap` 是否属于同一基名，也未排除 `latest.yml` 之外的重复/伪造项。影响：发布链若出现 `OtherApp.exe` + `OtherApp.exe.blockmap` + `latest.yml`，或 blockmap 属于另一个 exe，该函数会误判"资产齐全"，dry-run 自检失效，`latest.yml` 指向的 exe 与差分 blockmap 不匹配时更新可能安装到错误产物或差分失败回退。判断依据：三个判据彼此独立（`some` 分别判断），未做基名配对约束；函数注释自称"三件齐才能走差分"，但实现无法保证三者同源。

[低] `apps/desktop/src/updater.ts:54-71`（`updaterStateText`）— 问题：`detail` 被直接拼接进返回字符串（`available`、`downloading`、`error` 分支），而 `detail` 来源包含 `info.version` 与 `err.message`，其中 `error` 分支的 `err.message` 来自 electron-updater 对远端 feed 的解析结果。影响：若上游 feed/网络返回内容进入错误消息，或版本号被远端控制，会原样进入日志/设置页展示文本，构成从更新 feed 到 UI 的注入面（展示层转义不在此模块可控范围，函数本身无净化）。判断依据：注释自称"不暴露原始英文枚举给界面"、"不吞不猜"，但对 `detail` 未做长度/字符约束，属未经净化的外部输入透传。

其余部分（`shouldAutoUpdate` 的开关逻辑、`wireUpdaterEvents` 的事件绑定、`UPDATE_FEED` 常量）未发现值得报告的安全或严重正确性问题。

**apps/desktop/src/multi-window.ts + window-behavior.ts + preload-terminal.ts（全文）**：

[中] `apps/desktop/src/multi-window.ts:33`（`sessionIdOfUrl`）— 该正则用 `^https?://` 校验，但 `isShellPage` 只做前缀比较。若调用方先用 `sessionIdOfUrl` 从 URL 提取会话 id 再据此做导航/鉴权，攻击者可用 `http://evil.com/session/xxx` 命中；`sessionIdOfUrl` 未校验 URL 是否落在 sidecar 基址内，与 `isShellPage` 的口径不一致，调用方若只调前者即产生"任意站点 URL 被当作合法会话页"的判据漏洞。依据：两个导出函数的信任边界不同（`isShellPage` 带 baseUrl 校验，`sessionIdOfUrl` 不带），文件注释强调"窗口绑定从 URL 派生"，派生源未受基址约束。

[中] `apps/desktop/src/multi-window.ts:43-45`（`windowUrlOf`）— `sessionId` 仅经 `encodeURIComponent` 编码后拼进 URL 路径，未校验是否来自可信来源或是否符合 ULID 形态。若 sessionId 由渲染进程/IPC 传入且未在入口校验，`encodeURIComponent` 不编码 `..`、`%2e%2e` 等序列，可能造成路径穿越（如 base 为 `http://127.0.0.1:4318`，sessionId 含 `../` 变体经浏览器规范化后跳到非预期路径）。依据：`encodeURIComponent('../foo')` 得到 `..%2Ffoo`，多数服务器会解码后按路径段处理，且函数无任何白名单/格式校验。

[低] `apps/desktop/src/preload-terminal.ts:24-32`（`onData`）— 订阅时未对同一 handler 重复订阅去重，返回的退订函数依赖调用方在组件卸载时必然调用；若渲染层因异常/竞态未退订，`ipcRenderer.on('terminal.data', …)` 监听器会累积（资源泄漏），且每次推送都会重复回调旧 handler。依据：代码未提供幂等退订保护，`removeListener` 需调用方保证配对。

[低] `apps/desktop/src/preload-terminal.ts:9-21` — `create`/`input`/`resize`/`exit` 四个通道把 `input` 参数（含 `slot`、`cols`、`rows`、`data`）原样透传给主进程，preload 侧无类型/范围校验。若主进程 `terminal.*` 处理器信任这些字段（尤其 `data` 作为写入 pty 的原始字节、`slot` 作为索引），渲染进程被 XSS 后可直接驱动任意 slot 的终端输入输出（越权/注入面）。依据：preload 作为信任边界应做基本约束（slot 存在性、cols/rows 正整数范围），此处全无。

[低] `apps/desktop/src/window-behavior.ts:88-95`（`SleepBlocker.apply`）— `blocker.start` 返回值未校验是否为有效 id（如 -1 或异常值），`active` 判据仅看 `id !== null`，若 start 返回 0/负值仍会被当作持锁成功，后续 `stop` 可能失败而静默。依据：Electron `powerSaveBlocker.start` 正常返回正整数 id，代码未防御非预期返回值，属错误处理薄弱。

**apps/web/src/stores/settings.ts @0**：

[中] 行 128-167（`load`）：`JSON.parse` 的结果仅做逐字段类型/枚举校验，但 `model` 字段只校验 `typeof === 'string'`，未做长度/字符限制。该值后续会作为新建会话默认模型名（provider/model）传入引擎，持久化数据被篡改（如通过 XSS 写入 localStorage，或共享/导入配置）可注入任意模型字符串。影响：模型名注入/意外请求；判断依据：行 138 仅类型检查，无格式白名单。

[低] 行 246-249（`save`）：`const s = { ...get(), ...patch } as PersistedSettings` 将整个 store 状态（含所有 action 函数）与 patch 合并后强转类型再 `JSON.stringify`。虽然 `JSON.stringify` 会忽略函数，但 `get()` 返回的 state 若含非持久化字段/未来新增的敏感字段会被一并写入 localStorage。影响：持久化范围不受 `PersistedSettings` 约束，类型断言掩盖了泄漏面；判断依据：`as` 断言绕过了结构校验，`persist(s)` 实际写入的是运行时对象。

[低] 行 234-242（`matchMedia` 监听器）：事件回调未做任何清理/防抖，且通过模块顶层注册，在 HMR 或多次模块求值场景下可能重复注册监听器，导致回调累积。影响：资源泄漏与重复执行（每次系统主题变化多次调用 `applyTheme`/`applyWallpaperAccent`）；判断依据：模块级 `addEventListener` 无对应的 `removeEventListener`，无 `import.meta.hot` 处理。

[低] 行 203 / 215-217（`applyWallpaperAccent`）：`resolved.accent` / `resolved.hover` 直接经 `setProperty` 写入内联 CSS 变量，未见对取值做来源校验或转义。若 `wallpaperOf`/`resolveThemeAccent` 的返回值可被外部数据影响（壁纸定义为可扩展/可加载），恶意值可注入 CSS 声明。影响：CSS 注入/样式覆盖；判断依据：`setProperty` 前无白名单或格式校验（如颜色格式），取决于 accent-gate 上游是否可信。

**apps/web/src/stores/settings.ts @10000**：

未发现值得报告的问题。

**apps/miniapp/src/transport/rest.ts（全文）**：

未发现值得报告的问题。

**apps/miniapp/src/transport/pair.ts + runtime.ts + sse-pump.ts（全文）**：

未发现值得报告的问题。

**apps/miniapp/src/transport/mini-event-source.ts @0**：

[中] `connectOnceSse`（行 177–187、183）— 降级判定 fail-open 导致鉴权失败被误判为「非鉴权问题」而降级轮询。`requestTask.catch` 分支仅凭 `!chunkReceived && !authBlocked` 即切 `mode='polling'`；但 `authBlocked` 只在 `then` 成功回调或 `onHeadersReceived` 中置位。若请求以 reject 形式失败（网络层错误、被平台以异常方式返回的 401/403）且此时尚未收到 headers 回调，`authBlocked` 仍为 false，会错误降级到轮询而非上报鉴权失败。影响：鉴权失效时错误地被呈现为「降级可用」，且轮询路会再次触发鉴权失败，状态机收敛行为偏离设计（评审 I6/I1 的意图）。判断依据：`authBlocked` 的赋值点仅两处（行 172、195），均依赖非 reject 路径。

[中] `connectOnceSse`（行 200、211）— 2xx 头部到达即调用 `ctx.noteOpen()`，但 `onHeadersReceived` 的 2xx 判定未排除服务端返回「伪 SSE」场景（如 200 但 body 是 JSON 错误体）。影响：在服务端以 200 返回非事件流（如网关/代理改写）时，连接被判为 open 后立即结束，内核按「已连过」走重连退避而非降级轮询，用户侧表现为反复重连无数据。判断依据：行 200 仅检查 `statusCode >= 200 && < 300`，未校验 content-type 或首帧到达；对比 chunk 路径行 211 才真正 noteOpen。

[低] `pollOnce`（行 255–257）— 鉴权状态码从错误消息正则解析，`/^HTTP_(40[13])/` 与 `/^E_AUTH/` 两条判定存在不一致：`E_AUTH` 前缀命中时不会解析真实码，固定落 401。影响：403 场景下若 REST 客户端以 `E_AUTH: ...` 形式抛出（未携带 `HTTP_403` 前缀），会被记为 401，与 SSE 路去重口径不一致，可能影响鉴权收敛状态。判断依据：行 255 分支中 `parsed` 仅从 `HTTP_40[13]` 提取，`E_AUTH` 分支 `parsed` 为 undefined 故取 401（行 257）。

[低] `connectOnceSse`（行 232）— `ctx.signal.addEventListener('abort', finish, { once: true })` 未在 `finish` 正常路径中移除监听。虽然 `{ once: true }` 保证触发一次即移除，但若连接正常完成（`finish` 由 then/catch 触发）而 signal 后续才 abort，监听仍会残留至 signal 触发或 GC。影响：长生命期 signal（如跨多次 connectOnce 复用同一 core signal）下每次连接残留一个已 `settled` 的 `finish` 闭包，属轻微资源滞留，非泄漏级。判断依据：行 232 添加监听，`finish`（行 140–151）未调用 `removeEventListener`。

[低] `connectOnceSse`（行 161、190–191、203–204）— `task` 赋值与 `onHeadersReceived`/`onChunkReceived` 能力探测之间无同步保证：`Taro.request` 同步返回 task，但若平台在极端时序下 `task` 为 null（行 139 初始化）而 `finish` 已被调用（如 `ctx.signal.aborted` 于行 228 判定），`task.abort` 分支被跳过，请求可能未被 abort。判断依据：行 143 `if (task !== null)`，行 228–231 在 `task` 赋值后判定，理论上 task 已非 null；但若 `Taro.request` 抛异常则 `task` 保持 null 且 Promise executor 抛出会导致外层 reject（无 catch）。影响有限，属健壮性提示。

**apps/miniapp/src/transport/media.ts（全文）+ mini-event-source.ts @10000**：

未发现值得报告的问题。

**apps/web/src/features/chat/Composer.tsx @0**：

[高] `useEffect`（行 272–293）依赖 `menu` 对象整体：`menu` 每次 `setMenu(q)` 都产生新引用，`updateCaret` 在光标移动/输入时可能反复触发 `setMenu`（即便 query 未变，行 226 无条件 `setMenu(q)`），导致该 effect 频繁重建、防抖定时器被反复清除，`listFs` 请求被高频触发。虽代际校验（`atGenRef`）能丢弃旧响应，但存在请求放大（每次光标移动一次定时器重建），在输入 `@path` 时对后端形成放大的 fs 列举请求。判断依据：`menu` 为对象状态且每次均为新对象，effect 依赖其引用。

[中] `insertTrigger`（行 188–200）使用 `draft` 闭包值拼接而非函数式更新：`setDraft(draft.slice(0,pos)+ch+draft.slice(pos))`。若在两次渲染之间（如语音转写追加、其他异步 setDraft）`draft` 已变化，会覆盖最新内容，造成用户输入丢失。判断依据：闭包捕获的 `draft` 可能过期，与行 251 处语音追加采用的函数式更新形成不一致。

[中] `atItems`/`atEntries`（行 285）对 `listFs` 返回的 `r.entries` 仅做 `slice(0,20)`，未见对路径字符串做任何规范化/校验；该路径随后经 `parseCommandInput`/`insertTrigger` 插入草稿并最终由 `onSend`/`onCommand` 提交。若下游（`@` 引用解析）直接以该字符串作为 fs 路径使用，可能引入路径穿越风险。此文件本身无法确认下游处理，故为中风险提示——需确认 `listFs` 返回的 `path` 在服务端被约束在 sessionId 对应 cwd 内。

[低] 行 268–270 `useEffect(() => { if (voice.error !== null) showHint(voice.error, 'error') }, [voice.error])`：`showHint` 会重置 `hintTimer`，但若 `voice.error` 为同一字符串重复出现（引用/值相同则不触发 effect），错误提示可能不再刷新；同时该 effect 未把 `showHint` 列入依赖，属常见但此处可接受（`showHint` 为稳定函数体内定义，实际每次渲染重建）。影响有限。

[低] 行 202–206 `showHint` 定时器与行 172–176 的清理 effect 未覆盖组件重挂载场景下的竞态：`hintTimer` 在 `setHint` 后设置，若 `showHint` 在卸载后被调用（如 voice 回调晚到），`setHint` 会对已卸载组件 setState。React 18 下不报错但属状态泄漏；影响轻微。

**apps/web/src/features/chat/SessionSurface.tsx @0**：

未发现值得报告的问题。

**apps/web/src/features/settings/DataManagementPage.tsx @0**：

[低] 行 90：确认定时器超时后未将 `confirmTimer.current` 置空，仅 `setConfirming(null)`。后续 `askConfirm` 因 `confirming === null` 走 `!same` 分支会先 `clearTimeout` 再重设，功能上无害；但该 ref 会残留一个已触发的旧 timer id，语义上不干净（非安全/正确性缺陷）。

[低] 行 111：`await importFile.text()` 未限制文件大小与类型校验，导入内容完全由 `transport.storageImport` 服务端决定；若服务端未做校验，大文件可造成内存/解析压力。此页仅作 UI 传参，风险取决于服务端——但前端未加任何尺寸/条目上限，属防御纵深缺失。

[低] 行 121–129：`exportBundle` 中 `a.click()` 后立即 `URL.revokeObjectURL(url)`。部分浏览器（尤其 Firefox/Safari）在点击后到实际下载启动之间存在异步窗口，过早 revoke 可能导致下载失败或得到空文件。建议在下一个 tick/`requestAnimationFrame` 后再 revoke。

[低] 行 62/99：`run` 包裹的操作若在 `await` 期间组件卸载，`setLastResult`/`setImportFile`/`refresh()` 会在已卸载组件上触发状态更新（React 18 不再警告但仍是状态不一致风险）；未做 mounted/abort 守卫。

[低] 行 81–86：`askConfirm` 的 `same` 判断逻辑对 `import` 分支无 bucket 比较，两个不同来源的 import 会被视为同一次确认；虽当前仅有一个 import 入口，但逻辑上对 `ConfirmAction` 变体新增时会引入误确认。

以上均为低危/健壮性问题，未发现注入、路径穿越、鉴权绕过、凭证泄漏、动态执行、SSRF、XSS、原型污染或 fail-open 类安全问题。

**apps/desktop/src/notify-stream.ts + notify-wiring.ts（全文）**：

[中] `notify-wiring.ts:44-57`（`titleOf`）、`98` 调用点 — 竞态与无界缓存：`titleOf` 每次未命中都会并发触发一次 `/api/sessions` 全量拉取并写 `titles`，而 `handleNotifyEnvelope` 的调用未做串行化，短时间多条通知会产生并发重复请求；`titles` Map 只增不减，`session.title` 事件与列表拉取都往里写，长时间运行会随会话数无界增长。影响：本地 sidecar 被重复打请求、内存缓慢泄漏。判断依据：44-52 行无 in-flight 去重、无容量上限，51 行对返回列表无条件 `titles.set`。

[中] `notify-wiring.ts:48-52` — 对 `/api/sessions` 响应缺少形状校验：`(await res.json()) as Array<{id,title}>` 仅做类型断言，随后直接 `s.id`/`s.title` 读取并写入 Map。若响应为对象/含 null 元素（sidecar 版本不匹配、代理返回错误页 JSON），会在 51 行抛 `TypeError`，被 53 行 catch 吞掉后回退短 id；虽不致命，但 48 行 fetch 同样未传 `controller.signal`，`stop()` 无法中断在途的标题请求。判断依据：48 行 `fetchFn` 未接 signal，50-51 行无逐元素校验。

[低] `notify-wiring.ts:41-42` — `console.warn` 只按「一次 warn」注释实现，但 `startNotifications` 若被多次调用（重连/重建接线）会重复告警；此外 `opts.platform` 与 `process.platform` 混用无校验，属噪声级问题。

[低] `notify-stream.ts:53-64`（`parseSseFrame`）— `data:` 行过滤后 `.join('\n')` 再 `JSON.parse`，对超长/恶意帧无长度上限，且 `JSON.parse` 结果直接交给 `onEvent`（`notify-wiring.ts:80`）做属性读取。当前 `onEvent` 只读 `type`/`sessionId`/`data.title` 并做 typeof 校验，无原型污染落点，故仅记为加固建议（限制帧大小、拒绝 `__proto__` 键）。

[低] `notify-stream.ts:125` — `backoff[Math.min(retries, backoff.length - 1)] ?? 1000`：当调用方传入 `backoffMs: []`（空数组）时 `Math.min(retries, -1)` 为 `-1`，索引为 `undefined`，回退到硬编码 1000ms 并无限快速重连，退避形同失效。判断依据：空数组未被 110 行的 `??` 兜住（空数组非 nullish）。

[低] `notify-wiring.ts:89-93` — `session.title` 事件写入 `titles` 无上限且不校验来源会话是否存在；配合上面无界缓存问题，可被 sidecar 端伪造的任意 `sessionId` 持续撑大内存。判断依据：91 行仅校验字符串类型与非空，未限制数量。

**apps/miniapp/src/pages/session/index.tsx @0**：

[高] 第 85–86 行（SessionPage 顶部）：`sid` 与 `title` 直接取自 `router.params`，`title` 经 `decodeURIComponent` 后传入 `Taro.setNavigationBarTitle`（第 137 行）。`decodeURIComponent` 对含 `%` 的畸形输入会抛 `URIError`，页面渲染期同步崩溃；且 `title` 未做长度/控制字符约束，若来源可控（小程序 URL query 可被外部唤起/分享链接构造），可注入任意导航栏文案（含伪造系统提示类文本），构成 UI 欺骗/钓鱼风险。判断依据：参数来自外部可构造的路由 query，无白名单、无 try/catch。

[中] 第 142–165 行（controller 装配 effect）：`getRestClient(serverUrl, token)` 与 `openSessionStream({ sessionId: sid, serverUrl, token, ... })` 把 `token` 作为闭包捕获进 controller；当依赖 `[sid, serverUrl, token]` 变化时旧 controller 的 `dispose()` 在 cleanup 中执行，但 `openStream` 回调可能在 dispose 之后仍被异步调用（流降级轮询路径），此时会用**旧 token/旧 serverUrl** 发起请求，导致凭证在已切换/登出后仍被使用（凭证生命周期超出配置变更点）。判断依据：`openStream` 每次调用重新读闭包变量而非读当前 store，且未见 dispose 后置的失效标志。

[中] 第 210–237 行（handlePickAttachment）：上传流程的并发闸门是 `uploadingRef.current` + `setUploading`，但 `finally` 中先置 `uploadingRef.current = false` 再 `setUploading(false)`；`pickImages(1)` 与 `uploadPickedImages` 之间是异步链，若组件在此期间卸载（会话切换/返回），`setAttachments`/`setAttachNotice` 会在已卸载组件上 setState（React 警告 + 潜在状态错配到新会话），且上传结果会被错误合并进**新会话**的待发附件列表（`setAttachments((cur) => ...)` 不校验 sid）。判断依据：缺少 `cancelled`/sid 一致性校验，`handleSend`/附件状态均无卸载保护。

[中] 第 174–178 行（attachNotice 自清 effect）：`setTimeout` 5s 后 `setAttachNotice(null)`，无卸载清理以外的去重；但 `attachNotice` 仅按字符串比较触发，若连续两次错误文案相同（例如连续两次「未配置服务器…」），第二次设置不会改变状态值，effect 不重跑，第一条定时器到期即把第二条提示一并清除，提示提前消失。判断依据：依赖值为字符串本身，同值不触发 effect。

[低] 第 259 行（flags 拉取 catch）：`getSession` 失败被静默吞掉（`.catch(() => undefined)`），`flags` 保持 `null`，菜单渲染据此可能把 pinned/archived 呈现为「未置位」；后续用户点菜单动作若基于错误初值，会执行与真实状态相反的操作（如对已归档会话再次归档）。判断依据：失败态未区分「未知」与「false」，注释虽称动作时会报错，但菜单展示层已 fail-open 呈现为确定状态。

[低] 第 200–205 行（handleQuestionReply）：`answers` 由卡片传入并直接透传给 `rest.replyQuestion`，未见长度/枚举校验；若 QuestionCard 的选项来源受会话事件流影响（服务端/模型输出可控），则可被诱导提交超出预期范围的选项值。判断依据：对外发送前无 schema 校验，依赖上游类型约束而非运行时校验。

**apps/miniapp/src/pages/session/index.tsx @10000**：

未发现值得报告的问题。

**apps/web/src/features/terminal/bridge.ts + stores/ui.ts（全文）**：

未发现值得报告的问题。

**apps/web/src/features/settings/GeneralPage.tsx @0**：

[中] ServerBindSection（第 81–91 行，save 函数）：校验失败时静默 return，无任何用户反馈。当端口非法（非整数/越界）或 host 为空时点击"保存"完全无响应，用户无法得知为何没生效。判断依据：第 83–84 行 `return` 前无错误设置或提示，opError 也不会被填充。

[中] ServerBindSection（第 108–119 行）：监听地址 host 无任何格式/白名单校验，仅检查非空即写盘。描述中明示"缺省 127.0.0.1（本地专用，刻意不对网卡暴露——§2.9 红线：不上公网）"，但 UI 允许写入 `0.0.0.0` 或任意网卡地址，直接违背该红线且无二次确认或警告。判断依据：第 84 行仅 `host.trim() === ''` 判空，第 108 行描述与实现相矛盾。

[中] NetworkProxySection（第 145–152 行）：proxy 字段无 URL 校验，任意字符串（含 `file://`、非法 scheme、注入换行等）直接写盘为全局出网代理，影响 LLM/embedding/MCP 子进程 env 与连通测试。判断依据：第 148 行仅 `proxy.trim()`，无 scheme/格式校验；描述第 158 行声称"http/https URL"但代码未强制。

[低] NetworkProxySection（第 139–143 行）与 ArchivePolicySection（第 199–203 行）、ServerBindSection（第 75–79 行）：useEffect 依赖 `data`，每次 refresh 后用服务端值覆盖本地编辑状态。若用户在请求返回前已开始输入，refresh 会覆盖其未保存内容，存在编辑丢失/状态不一致。判断依据：第 139–143、199–203、75–79 行均为无条件的 `setX(data...)`。

[低] RestartBadge（第 52–64 行）：每个 RestartBadge 实例各自调用 `useTransportQuery((t) => t.getSettings())`，同页多处使用（第 105、117 行）会造成重复请求，无共享缓存保证时存在资源浪费；若各实例返回时序不同步，同一字段的徽标可能短暂不一致。判断依据：第 53 行在组件内独立发起查询，未见 query key 去重说明。

**apps/miniapp/src/components/session-items.tsx @0**：

[中] UserBubble（行 50–60）：附件文件名直接拼进缩略图 URL（attachmentUrlOf(baseUrl, file, token)）且以 file 作 key，未做路径/协议校验；若服务端或事件投影中的文件名被污染（如 `../`、`?`、`#`、`//evil.com`），在小程序端可能造成取图请求指向非预期路径或携带 token 泄漏到其他 host。依据：组件只做 `baseUrl !== ''` 判断，未对 file 做白名单/编码校验，token 作为查询参数一并带出。

[中] ToolCard（行 211–220）：对非字符串 output 直接 JSON.stringify 后渲染；若 output 为循环引用对象或含 BigInt，JSON.stringify 会抛异常，渲染期抛出将导致整棵消息流组件树崩溃（会话页整体不可用）。依据：无 try/catch 或安全序列化兜底，异常发生在 render 阶段。

[低] DiagnosticsCard（行 253）：`item.uri.startsWith('file:')` 仅剥离前缀即直接展示为文件名，未处理 `file://` 三斜杠或路径穿越形式（如 `file:///etc/passwd` 会显示 `/etc/passwd`），可能暴露服务端文件系统路径信息。依据：无归一化与 basename 处理。

[低] DiagnosticsCard（行 284）：以数组下标 `key={i}` 渲染诊断列表，列表内容变化（清零后重发、过滤）时复用节点可能造成状态/内容错配；诊断条目本身无稳定 id 时属可接受，但配合折叠态易出现视觉错位。依据：React key 使用索引。

[低] AssistantBlock（行 96–110）与 UserBubble：复制/取图等失败路径全部静默吞掉（`.catch(() => {})`），复制失败时用户得到"未变文案"而非错误提示；不属 fail-open 安全问题，但失败不可观测（无日志、无埋点），排障困难。依据：catch 块空实现。


## 已证伪 / 不成立（人工核查，6 条 + 分层误判 1 条，不计入发现数）

1. **apply-event「无 seq 事件跳过去重致重复投影」**：durable 事件的 seq 由 EventBus 统一分配
   （bus.ts:81、185，per-session 计数器与 store.append 同一互斥链）；无 seq 的是 LiveOnly 类型
   （emitLive），不经回放×直播重叠路径。模型设想的「同事件一条带 seq 一条不带」在现有总线下不产生。
2. **apply-event「toolIndexOf 两段式索引/拷贝竞态」**：reduceEvent 是同步纯函数，单次调用内无 await、
   无交错窗口；索引查位与拷贝写回之间不存在并发修改者。
3. **sessions「附件 file 参数路径穿越依赖正则」**：AttachmentFileParams 正则完全锚定
   （shared.ts:64-66：`^(?:ses_[0-9A-Za-z]+\/)?[a-f0-9]{32}\.(png|jpg|gif|webp)$`），
   不容任何路径分量，join 前已 safeParse 把守，不存在穿越面。
4. **desktop-main「shellBase 的 port 来自 sidecar 输出未校验」**：port 由 main 自家 pickPort()
   （main.ts:124、530）以 listen(0) 生成的整数，全程在壳内传递，不存在外部污染来源。
5. **desktop-main「killSidecar 的 spawn(taskkill) 抛错致退出 fail-open、子进程成孤儿」**：
   child_process.spawn 对二进制缺失以异步 'error' 事件报告、不步抛错；且 taskkill 带 /T 树杀，
   正是为收掉 sidecar 派生的 MCP/LSP 子进程而设计（LA-44）；pid 为 undefined 时有前置判空（685 行）。
6. **desktop-main「setWindowOpenHandler 的 sessionIdOfUrl 未净化可拼越界 URL」**：该分支先经
   isShellPage(url, shellBase) 按完整基址（含端口）判定，openWindow 又以 windowUrlOf(shellBase, ...)
   在基址上重建 URL，sessionId 不能把导航带出 shellBase。
7. **（分层误判）run-loop「runAll 批量执行前无逐调用校验」**：逐调用校验本就在 tools 层——
   pipeline 对每个 call 依次走 hook 裁决、permission.assert、zod parse fail-closed（第三批已核，
   本批 pipeline @10000 段亦可见）。run-loop 是调度层而非校验层，模型以「若 tools 层有缺口」立论，
   属假设性指控，不成立。

## 已知设计（2 条）

1. **run-loop 溢出重试的 usage 记账口径**：模型称 continue 前不回滚 usage 致「重复计数、事件流不一致」。
   源码注释明示口径（run-loop.ts:413-432 一带）：全部流式调用（含 error/aborted）都计入指标与成本
   熔断——「调用量本身就是事实」；overflow 分支先于 assistant.message emit，continue 重采样
   「无悬空副作用」是 CK-7 的登记设计。turn.step 随循环自增是步数计数的本义。
2. **pipeline 的 hook rewrittenInput 作为权限判定输入**：CK-2 批 2 登记设计——改写后权限判定与
   zod 校验全部以改写值重走、坏形状 fail-closed；tool.started 载荷保留原始输入是明示的审计口径
   （「改写是 hook 内部裁决」）。且 hook 为用户本机自配代码，不构成外部攻击面。残余项仅为审计
   可见性提示：审批界面若只展示原始输入，用户对「实际执行输入」的感知可再加强（记 [低]）。

## 方法注记

- 五批累计已证伪/不成立 [高] 累计达 12 条量级，共同根因仍是单段审查缺跨文件上下文
  （schema 锚定、总线 seq 分配、设计注释口径、Electron API 语义）。[高] 一律以人工核查为准。
- 本批模型（DeepSeek-V4-Flash）与 step-5-preview 对比：出稿快（31 段约 9 分钟）、条目更密
  （中低危数量约为 step-5 批次的 2.5 倍），但 [高] 误报率同样高，且多条 [高] 为「若某未展示
  代码有缺口」的条件式指控——引用时需逐条落到源码。
- 至此覆盖状态：后端 engine/protocol/server 主要文件全文；前端 desktop 主进程全文、
  web 与 miniapp 为高风险面抽样（各 @0 段为主），web 的 Composer/SessionSurface 等大文件
  尾段与 miniapp 其余页面未覆盖，可作第六批。
