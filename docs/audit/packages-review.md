# Spark `packages/` 深度代码审查报告

> 审查范围：`packages/engine`、`packages/protocol`、`packages/sdk`、`packages/skill-kit`
> 技术栈：pnpm monorepo + TypeScript（`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`）+ Node ≥ 24
> 审查方式：逐文件通读核心源文件（run-loop / pipeline / permission/service / pi-gateway / projector / bus / session-store / apply-event / transport-node / session-stream-core / 各 builtin 工具 / sdk / skill-kit），并做定向 grep（`any`、类型断言、路径边界、配置校验）。

---

## 一、各包概览

| 包 | 源码文件数 | 源码行数（估算） | 主要模块 | 定位 |
|---|---|---|---|---|
| `@spark/engine` | 88 | ~14,300 | `run-loop`、`tools/pipeline`、`permission/service`、`pi-gateway`、`projector`、`bus`、`session/{runtime,store,tree}`、`tools/builtin/{bash,read,edit,write,grep,lsp,...}`、`lsp/manager`、`mcp/manager`、`automation/*`、`observability/*`、`config`、`goals`、`compaction` | 引擎核心：会话状态机、LLM 网关、工具管线、权限、事件总线、持久化 |
| `@spark/protocol` | 24 | ~5,200 | `events`、`api`、`apply-event`、`transport-node`、`session-stream-core`、`commands`、`schema`、`extend`、`pair-link`、`keymap` | 四端共享运行时核：事件词表（zod）、事件 reducer、HTTP/SSE transport、重连状态机；零运行时依赖（仅 zod） |
| `@spark/sdk` | 3 | ~735 | `client`（assembleClient）、`inprocess`（InProcessTransport）、`index` | L2 薄客户端装配层，双子入口（HTTP / 进程内），零业务逻辑 |
| `@spark/skill-kit` | 1 | ~124 | `lib`（init 骨架生成 + lint 清单校验） | skill 声明式创作套件 |

**模块划分质量**：依赖方向干净——`protocol` 零依赖 engine（仅 zod）；`sdk` 主入口 `.` 零 engine 依赖（`@spark/engine` 为 optional peer）；`engine` 唯一 import pi-ai 的点是 `pi-gateway.ts`（隔离点明确）。分层契约与文档（ADR D18/D22/D30/D31）高度一致。

---

## 二、问题清单

> 严重程度：**P0** = 安全漏洞 / 数据丢失 / 崩溃；**P1** = 功能缺陷 / 性能瓶颈；**P2** = 代码质量 / 可维护性。

### P0（安全 / 数据丢失 / 崩溃）

**本次未发现确凿 P0。** 代码在失败闭合、路径边界、fail-closed 审批、单写者持久化上的纪律执行到位。以下两条是最接近 P0 的边界问题，但因前置条件较窄，定级 P1（详见下文）：

- 符号链接逃逸（`resolveInRoot` 词法解析不跟随 symlink）
- bash 工具全量输出驻留内存（超大输出 OOM 风险）

---

### P1（功能缺陷 / 性能瓶颈）

#### P1-1　`resolveInRoot` 词法解析不跟随符号链接 → 路径越界读
- **文件:行号**：`packages/engine/src/tools/definition.ts:77-85`（调用方 `read.ts:35`、`grep.ts:79`、`lsp.ts:314`）
- **描述**：`resolveInRoot` 用 `path.resolve` + `path.relative` 做词法边界判定，不调用 `fs.realpath`/`realpathSync`。若工作区内存在指向区外目录的符号链接（例如 `ln -s /etc ./etc`，或 git clone 带入的 link），`read`/`grep`/`lsp` 等只读工具会沿 symlink 读到 cwd 之外的文件，硬边界被绕过。写类（write/edit）虽有 `fs.write` 审批门兜底，但读面无第二道闸。
- **修复建议**：在 `resolveInRoot` 内对解析后的目标先 `await fs.realpath(abs)`（或对 read/grep 的遍历起点 `realpathSync`），再对 realpath 结果做 `relative(rootReal, ...)` 判定；或在文档中显式声明"不跟随 symlink 逃逸"并在 grep/read 遍历时 `lstat` 跳过 symlink。

#### P1-2　bash 工具全量输出先落内存再截断 → 超大输出 OOM
- **文件:行号**：`packages/engine/src/tools/builtin/bash.ts:172-182, 216-217`；`packages/engine/src/tools/output-store.ts:16-24`
- **描述**：`bash.ts` 把 child 的 stdout/stderr 全部 push 进 `chunks: string[]`，`child.on('close')` 时 `chunks.join('')` 得到完整字符串后才 resolve。`output-store.bound()` 在此之后才做 32KB 截断与溢写文件。即一条 `cat 1GB.log` 或 `find / -type f` 会让整段输出常驻内存（数倍于输出字节的 string 开销），再进入 `JSON.stringify`/base64 等后续处理才被裁剪。progress 流式只是"边产边播"，并未做背压或落盘分流。
- **修复建议**：在 `chunks` 累计到阈值（如 toolOutputLimitKB×4）后即停止累积、改写临时文件（与 output-store 溢写共用），close 时只回传"截断头 + 指针"；或让 `bound()` 支持流式分片写入而不是先聚合成一个大 string。

#### P1-3　Projector 每步重读并重编码附件图片 → 随步数线性放大的磁盘 IO
- **文件:行号**：`packages/engine/src/projector.ts:151-156`；调用点 `run-loop.ts:272, 275`
- **描述**：`modelContext()` 在**每个 step** 都被调用（run-loop 第 272 行组装上下文、压缩后第 275 行重投影）。其中对每条 `user.message` 的每个 attachment 都调 `attachmentReader?.(file)` 读盘，再 `img.bytes.toString('base64')`。一个长 turn（maxStepsPerTurn=40）里只要某条用户消息带图，这张图就会被读盘 + base64 编码多达 40 次，且每次 `toPiMessages` 又把 base64 字符串塞进 messages。图片越大、步数越多，放大越明显。
- **修复建议**：在 ProjectorImpl 内按 attachment file 名做缓存（`Map<file, { mime, dataBase64 }>`），读盘与 base64 只做一次；或把 base64 串作为 LlmMessage 的不可变部分缓存，而非每步重算。

#### P1-4　`ProgressGate.close()` 在失败路径可能二次抛错
- **文件:行号**：`packages/engine/src/tools/pipeline.ts:105-122`、`313`、`328`
- **描述**：`ProgressGate` 用 `this.drain = this.drain.then(() => this.emit(chunk))` 链式派发。若 `emit`（即 `bus.emitLive`）抛错（zod fail-fast 或 live 广播异常），`drain` 进入 rejected 态。正常路径第 313 行 `await gate.close()` 会 reject → 落入第 327 行 catch → 第 328 行**再次** `await gate.close()`，此时 `accepting` 已 false、`drain` 仍 rejected，`close()` 里 `await this.drain` 会**再次 reject**，跳出 catch，使 `runOne` 的拒绝逃出（经 `Promise.all` 冒泡）。即一次 live 广播的瞬时失败会让整个工具调用以"未闭合"形态失败，且丢失本可走 mapError 的人话错误。
- **修复建议**：`close()` 内 `await this.drain` 改为 `await this.drain.catch(() => undefined)`（与 bus/store 的"链不断"同手法）；或在 catch 里只调一次 `close()` 并包 try/catch 兜底。

---

### P2（代码质量 / 可维护性）

#### P2-1　`runSessionLoop` 对 `takeInput` 兜底 catch 静默吞错
- **文件:行号**：`packages/engine/src/run-loop.ts:173-176`
- **描述**：`input = await rt.takeInput()` 的 `catch { break }` 注释为 E_QUEUE_CLOSED 正常退出。但 `queue.take()` 若因编程错误/其他原因 reject，也会被静默 break，常驻循环无声退出且无任何日志。
- **修复建议**：catch 内区分错误类型——非 `E_QUEUE_CLOSED` 时至少 `logger.error`/`bus.emit` 一条 engine error，再 break。

#### P2-2　`edit` / `write` 工具写文件非原子，与仓内 `atomicWriteFile` 纪律不一致
- **文件:行号**：`packages/engine/src/tools/builtin/edit.ts:92`、`packages/engine/src/tools/builtin/write.ts:33`
- **描述**：`fsutil.atomicWriteFile`（tmp+rename）已存在并用于配置/权限仓，但 `edit`（readFile→replace→writeFile）与 `write`（mkdir→writeFile）直接 `writeFile`。进程在 write 中途崩溃会留下截断/半写文件，而 `fsutil` 注释明确写了"原子写：崩溃只可能留多余 tmp，主文件恒完整"。
- **修复建议**：write/edit 改用 `atomicWriteFile(abs, content)`（或 `fs.writeFile` 配合 tmp+rename），与既有 crash-safety 纪律对齐。

#### P2-3　`pi-gateway` 错误信息可能回显 provider 返回的 apiKey
- **文件:行号**：`packages/engine/src/pi-gateway.ts:386`、`380`
- **描述**：`classifyLlmError(final.errorMessage)` 只做模式分类，最终错误文案 `${cls.kind}: ${final.errorMessage}` 原样塞进结果并经 `bus.emit('error')` 落盘/广播。若某 provider 在错误体里回显请求头（含 `Authorization: Bearer <key>`），密钥会进 error 事件 → JSONL 磁盘与所有订阅者。`FATAL_PATTERN` 只识别 "invalid api key" 文本，不做密钥值剥离。
- **修复建议**：在拼 `error` 文案前过一遍 `IoGuard`/redaction 的 `BEARER_RE`/`SECRET_RE`（仓内已有单一来源），或对 errorMessage 做 token 形状截断。

#### P2-4　`pi-gateway.outputToText` 对循环引用/特殊值会抛
- **文件:行号**：`packages/engine/src/pi-gateway.ts:169-172`
- **描述**：`JSON.stringify(output) ?? String(output)`。`JSON.stringify` 对循环引用抛 `TypeError: Converting circular structure to JSON`，对 `undefined`/function 返回 `undefined`（此时 `?? String(output)` 兜底为 `"undefined"`，可接受）。循环引用场景未被 try 包住，会从 `toPiMessages` → `stream` 抛出，被 stream 的 `catch`（358 行）兜成 error 结果，功能上不算崩溃，但工具输出若含循环引用会静默变成 provider 错误而非工具错误。
- **修复建议**：`outputToText` 内 try/catch，失败时回退 `"[unserializable output]"`。

#### P2-5　`PermissionService.settle`：bus.emit 失败时事件不发但 promise 已 resolve
- **文件:行号**：`packages/engine/src/permission/service.ts:274-288`
- **描述**：`settle` 在 try 里 `await bus.emit('permission.resolved')`，finally 里 `entry.resolve(allowed)`。若落盘失败（如磁盘错误），finally 仍 resolve(allowed)，管线拿到 allowed 继续执行工具，但 UI/磁盘**从未收到** `permission.resolved` 事件——审批卡悬挂在 pending 态，与工具实际执行不一致。
- **修复建议**：emit 失败时即便 resolve(allowed)，也应把失败经 `onResolved` 或审计旁路上抛（当前 `onResolved` 只在成功分支调）；或失败路径 resolve 为 reject 由 pipeline 走 E_INTERNAL（但这会让 fail-closed 语义反转，需权衡——至少要可观测）。

#### P2-6　`ProjectorImpl.danglingWarned` 集合随会话无界增长
- **文件:行号**：`packages/engine/src/projector.ts:190, 200-202`
- **描述**：`danglingWarned: Set<EventId>` 只为"同一悬空锚点只告警一次"，但只增不减。长跑/大量 compaction 的会话会累积所有历史 anchorId。量级小，属于慢性内存占用。
- **修复建议**：会话结束/卸载时 clear，或改为按"当前 anchor"单值记录（同一次投影只关心最新锚点）。

#### P2-7　SSE 鉴权 token 走 URL query → 经代理/访问日志泄漏
- **文件:行号**：`packages/protocol/src/session-stream-core.ts:150-158`、`transport-node.ts:155`
- **描述**：注释已说明"SSE 无法自定义头 → ?token="。但 URL query 会进 server access log、反向代理日志、浏览器历史。这是已知约束，但建议至少在 server 端对 `/api/event?token=` 的日志做脱敏，且文档显式提示该权衡。
- **修复建议**：server 访问日志模板过滤 `token=` 查询段；README/security note 登记该设计取舍。

#### P2-8　`InProcessTransport.getArena` 不必要的类型断言
- **文件:行号**：`packages/sdk/src/inprocess.ts:208`
- **描述**：`this.engine.arenaSnapshot(sessionId) as ArenaStatusDto | null`。引擎返回类型未严格对齐 DTO，靠断言抹平。
- **修复建议**：让引擎 `arenaSnapshot` 返回类型直接声明为 `ArenaStatusDto | null`（或其 narrow 等价物），去掉 `as`。

#### P2-9　`transport-node.uploadAttachment` body 的三重条件类型断言
- **文件:行号**：`packages/protocol/src/transport-node.ts:636`
- **描述**：`file.bytes as unknown as Parameters<typeof fetch>[1] extends infer I ...` 是为抹平三端 fetch body 类型差异的宽化断言。功能正确但可读性差，且绕过了类型检查。
- **修复建议**：收敛为 `body: file.bytes as BodyInit`（Node/DOM 下 `Uint8Array` 本就合法），或在 Transport 接口层把 body 类型统一为 `Uint8Array | string`。

#### P2-10　`run-loop` 成本熔断 `limitUsd() ?? 0` 与 budget 已定义的前提不自洽
- **文件:行号**：`packages/engine/src/run-loop.ts:259`、`337`
- **描述**：`if (deps.budget !== undefined && deps.budget.exceeded())` 分支里又 `deps.budget.limitUsd() ?? 0`。若 budget 对象存在但 `limitUsd()` 返回 `undefined`（未配置上限），`exceeded()` 按端口语义应恒为 false，分支本不应进入；进入了就说明 `exceeded()` 与 `limitUsd()` 实现不一致。
- **修复建议**：在 Budget 端口文档里钉死"`limitUsd()` 返回 undefined ⟹ `exceeded()` 恒 false"，或 run-loop 分支内对 undefined limitUsd 直接走 error 文案不带 `?? 0`。

#### P2-11　`run-loop` 压缩阈值对 `contextWindow=0` 退化
- **文件:行号**：`packages/engine/src/run-loop.ts:273`
- **描述**：`ctx.tokens > deps.compactionThreshold * deps.model.contextWindow`。若某模型 `contextWindow` 被配成 0（zod schema 未在本次审查范围内确认下限），阈值恒为 0，每个 step 都会触发 compact。
- **修复建议**：`projector`/run-loop 对 `contextWindow <= 0` fail-fast 或跳过压缩判定（配置层 zod 加 `.positive()`）。

#### P2-12　`splitCommandPatterns` 纯文本切分可误判审批粒度（已知，但记录在案）
- **文件:行号**：`packages/engine/src/tools/builtin/bash.ts:74-80`
- **描述**：按 `&& || ; |` 正则切分命令，不解析引号。注释已声明"v1 纯文本切分，误分段只让审批更细不会更粗"。这是有意取舍，但 `"echo a;b"` 这类引号内 `;` 会被错切，导致审批 patterns 与实际命令段不符（方向偏严，可接受）。
- **修复建议**：v2 若引入真正的 shell tokenizer 可消除；当前维持，补一句"引号内分号也会被切"的说明即可。

---

## 三、亮点（做得好的地方）

1. **类型纪律极强**：整个 `packages/**/src`（生产代码）grep 不到一处 `: any` / `as any` / `<any>`。`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` 下，所有索引访问都有 `undefined` 守卫（如 `store.ts`、`apply-event.ts` 大量 `if (it === undefined)`），类型安全几乎无逃逸。
2. **失败闭合（failure closure）纪律贯彻到底**：
   - `run-loop.ts` 的 turn 配对：`started` 一旦发出，`finally` 必补 `turn.completed`；未 started 失败不造悬挂。
   - `pipeline.ts` 的工具配对：未启动即 abort 补 `E_ABORTED` 事件对；边界后跳过补 `E_MODE_BOUNDARY` 对。
   - `bus.ts` 的 per-session 串行队列：`st.tail = task.catch(() => undefined)` 保证单事件失败不阻塞同会话后续事件，又把失败透传给调用方。
3. **fail-closed 审批模型**：`permission/service.ts` 超时/abort/dispose/模式变更一律 resolve(deny) + `permission.resolved{reject}`；`settled` 守卫防 double-settle；`plan` 档兜底 `*` deny 再逐层 allow/ask 的优先级翻译清晰。
4. **单写者 JSONL**：`session/store.ts` 全部写入经 `this.queue` 串行链；"先盘后树"（appendFile 成功才 `tree.append`）保证盘/树不分裂；坏行策略分尾行（丢弃 warn）与非尾行（fail-closed），语义精确。
5. **事件流顺序与并发防护**：
   - `apply-event.ts` 用模块级 `WeakMap<UiItem[], ItemIndex>` 旁路缓存，把高频 delta/progress 的 O(n) 反查降为 O(1)，且 copy-on-write 不破坏不可变分叉；索引失配时安全回退线性扫（"最坏退化为性能问题，不改投影结果"）。
   - `session-stream-core.ts` 用 `generation` 代际计数防 dispose 后迟到回调驱动状态机；水位取 max(seq) 防乱序。
6. **路径硬边界**：`resolveInRoot`（definition.ts）在审批之前就对 `../` 逃逸与跨盘（`isAbsolute(rel)`）兜底，read/write/edit/grep/lsp 全部先走它。
7. **密钥/敏感面**：`guard.ts` 复用 pino 三层脱敏 + 密钥仓值动态纳入；共享 `/g` 正则每次 `test` 前复位 `lastIndex`（防跨调用状态泄漏漏检，这个细节很多人会漏）；告警只带规则名不回传原文（防注入内容二次广播）。
8. **错误分类与重试**：`pi-gateway.ts` 的 `classifyLlmError` 把 fatal/ratelimit/network/server 分四档，指数退避 + ±20% jitter，且"已交付即不重试"（避免重复输出）——LLM 流式重试的坑都想到了。
9. **文档化程度**：几乎每个文件头注释都带 doc 章节号、工单号、ADR 编号，并记录了"与 qwen-code/dsh/opencode 的偏离及理由"（如 permission/service 主动结清 vs 惰性快照、pipeline 执行边界只在成功后跳）。可维护性极高。
10. **sdk 双子入口的结构保证**：`assembleClient` 让 HTTP 与进程内通道的便利分组是"同一份转发"而非两份碰巧一样；进程内通道对不支持项一律 `E_UNSUPPORTED` 如实报错，不假造 parity。

---

## 四、总体评价

**总体质量：高（A-）。** 这是一份训练有素、纪律严格的 TypeScript monorepo：类型安全、失败闭合、fail-closed 审批、单写者持久化、事件顺序保证等核心约束都被显式实现并配上了与知名开源项目（opencode/qwen-code/dsh/Codex）的对照注释。没有发现 P0 级别的安全漏洞或数据丢失路径。

**最需要跟进的三件事（按优先级）**：
1. **P1-2 bash 全量输出驻留内存**——这是最容易在真实使用中（一条 `cat` 大日志）触发 OOM 的点，建议优先做流式落盘分流。
2. **P1-1 resolveInRoot 不跟随 symlink**——只读工具的路径边界存在理论绕过，建议补 realpath 或 lstat 跳过。
3. **P1-3 Projector 每步重读附件**——长会话多图场景的 IO 放大，加一层缓存即可。

**可接受的遗留**：P2 各项多为防御性加固、原子写一致性、错误文案脱敏与已知设计取舍（SSE token in URL），不阻塞当前版本，但建议列入后续工单（与仓内"工单驱动"的开发节奏一致）。

**一句话结论**：架构与纪律在线，核心不变量（事件即真相、审批 fail-closed、单写者）落地扎实；主要改进空间在资源的流式化（bash 输出、附件重读）与边界的物理化（symlink），而非类型或并发正确性。
