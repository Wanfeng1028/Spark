# step-5-preview 安全审查报告（第三批：第二批补审 + 新文件首审）

> 审查人：step-5-preview（经 step193api 调用）；组织与核查：Muse。
> 日期：2026-10-12。承接 doc/19（第二批）。
> 本批共 21 次调用：①补审第二批 8 个文件的未审区间（每段 10000 字符）；②新审 8 个文件的前 10000 字符。
> 核查纪律同前两批：全部 [高] 人工抽查源码，结论分「已验证」「未抽查」「已证伪」「已知设计」四类；
> 已证伪条目单列一节、不计入发现数；模型输出被截断未成稿的片段单独注明，不以思考稿充数。

## 统计（模型报告口径，不含已证伪与未成稿）

- [高] 6 条；[中] 20 条；[低] 20 条。
- 无发现片段：permission @20000、bash-pool @10000、run-loop、apply-event、secrets 路由。
- 已证伪 2 条（见文末）；未成稿 1 段（sessions @10000）。

## 重点发现（经人工核查后）

1. **[高·已验证] mcp/manager.ts @10000：serverStatuses 与 clients 平行数组失同步。**
   push 模式连接失败时只 push 失败 status、不 push client（约 369 行），数组自此错位；
   reconnectServer（288 行起）按 serverStatuses 的 name 索引去 `clients.splice(idx, 1)`（296 行），
   会关掉并移除错误的 MCP client——正常 server 被误杀，且 status 与实际句柄彻底失同步。

2. **[高·已验证机制] tools/pipeline.ts：executionBoundary 仅组间生效。**
   代码只在组开始前检查 boundary 标志（约 198 行）、组完成后才置位（230 行）；
   同一并行组内的多个 batch 之间、串行组内的逐个调用之间均不检查。
   与本文件头注释声明的语义「executionBoundary 工具成功后，同批剩余调用不执行」（工单 16.3）存在粒度差：
   边界工具所在组内的后续调用仍会执行。严重度取决于工单对「批」的定义，建议按注释口径修齐。

3. **[高→中·已验证] protocol/transport-node.ts：URL 路径参数编码不一致。**
   全文件 16 处用了 encodeURIComponent，但 sendMessage/interrupt/compact 等大量方法仍以
   模板字符串裸拼 sessionId（242、254、260 行等）。核查意见：sessionId 为服务端生成的受控格式，
   实际可利用性低，定性为防御一致性缺陷（模型原评 [高]，核查后降为 [中] 级处理）；
   另有 listFs/uploadAttachment 等方法的同类问题（@30000 段 [中]）。

4. **[高·未抽查] permission/service.ts @10000：reply() 的 always 级联放行竞态。**
   模型称级联仅按 project key 过滤即 settle(true)，未复核目标 pending 是否已被 mode-change/abort
   等 deny 路径处理。注：级联放行本身是已登记设计（文件头注「pending 级联放行，opencode 自动放行」），
   争议仅在模式收紧后的竞态窗口，本批未抽查，待复核。

5. **[高·未抽查] tools/builtin/bash.ts @10000：前台转后台回调未检查 aborted/timedOut。**
   模型称预算到点转后台时若 abort/超时已发 SIGTERM 但子进程未退出，finish 会清除 killTimer 与 abort 监听，
   使被中止的命令转为后台存活。本批未抽查，待复核。

6. **[高→已知设计] transport-node.ts @30000：SSE 长效 token 经 URL 查询参数传递。**
   模型担心 URL 被日志/历史记录导致凭证泄漏。核查意见：此为仓库已登记的设计决策
   （AGENTS.md v1.22：D24 客户端契约含 REST Bearer 与 SSE `?token=` 双口径鉴权；SSE 无法设置请求头），
   属明示权衡而非缺陷；服务端配套有 redactTokenQuery 日志脱敏（见 auth 一节的残余风险条）。

## 分段明细

### 补审（第二批文件的剩余区间）

**protocol/transport-node.ts @10000**：[高] 路径参数未编码（见重点 3）；[中] removePermissionRule 以
DELETE 带 body 传删除条件，代理/框架可能忽略请求体致删除静默失败、残留规则 fail-open；
[中] deleteSession 同为 DELETE 带 `{confirm:true}`，请求体被剥离且服务端不 fail-closed 时退化为无确认裸删；
[低] limit 裸拼查询串；getSessionReview 编码策略不一致；setTrust 客户端不校验 path 直接透传。

**protocol/transport-node.ts @20000**：[中] setSessionModel/executeCommand/renameSession/removeMemory
等方法路径参数未编码；[低] limit 裸拼；withdrawFeedback 的 DELETE 带 body 可靠性问题。

**protocol/transport-node.ts @30000**：[高] SSE token 经 URL（见重点 6）；[中] listFs/listFsTree/
uploadAttachment 的 sessionId 未编码；[低] redeemPair 缺 content-type 头；uploadAttachment 的
file.mime 未验证直接作 content-type 发送。

**engine/permission/service.ts @10000**：[高] always 级联竞态（见重点 4）；
[中] always 固化时 `store.add(rule)` 后又手动 push 同一规则，评估列表重复追加；
[中] settle() 将 resolve 置于 finally，同步抛错会覆盖业务异常；
[低] isDenied() 未含会话级与 preset 层规则；addSessionRules() 无去重。

**engine/permission/service.ts @20000**：未发现值得报告的问题（预设规则表，缺省 confirm-each 为 fail-closed）。

**engine/sandbox/proxy.ts @10000**：[中] tunnel 的 upstream error 回调未检查客户端 socket 是否已关闭，
向已销毁 socket 写响应可能触发未捕获流错误；
[低] parseAuthority 对无方括号 IPv6 按最后冒号拆分误判端口；未拒绝含 `@` 等畸形 authority。

**engine/mcp/manager.ts @10000**：[高] 平行数组失同步（见重点 1）；
[中] close() 后异步 OAuth 完成仍 reconnect 创建新 Client，后续无法关闭，资源/进程泄漏；
[中] withTimeout 超时后底层 connect 仍继续，与 client.close() 竞态，stdio 子进程可能清理不彻底；
[中] 日志脱敏仅注册长度 ≥6 的 env/header 值，短令牌明文入日志；
[低] replace 模式连接失败时 status 未标记 connected:false，对外仍显示在线。

**engine/mcp/manager.ts @20000**：空区间——该文件按字节 23006、按解码字符约 19611，
@20000 起无内容；前段已覆盖至文件尾附近，无遗漏。

**engine/tools/builtin/bash.ts @10000**：[高] 转后台中止竞态（见重点 5）；
[中] bgPush 的 `room = TASK_BUFFER_CAP_CHARS - bg.collectedChars` 可为负，负索引 slice 使后台收集上限失效。

**engine/tools/builtin/bash.ts @20000**：[高] 已证伪（见文末）；
[中] 进程被信号终止时 code 为 null 仍落入 E_EXIT_CODE 分支且 exitCode 为 null，语义不匹配；
[低] converted 为 true 但 bgManager/bgTaskId 缺失时直接 return，前后台均无终态，可能悬挂。

**engine/tools/bash-pool.ts @10000**：未发现值得报告的问题（idle 清理与逐出逻辑，对 busy 条目有保护）。

**apps/server/routes/sessions.ts @10000**：**未成稿**——模型输出在思考阶段被 token 上限截断，
未给出正式结论。可供复核的线索：附件上传的输入错误被映射为 500 而非 400（注释自承期望 400）；
路由内同步 IO（mkdirSync/writeFileSync）阻塞事件循环；附件路径穿越经模型推演后自行排除
（schema 正则把守，未见源码不下结论）。

**apps/server/routes/readonly.ts @10000**：[中] /api/feedback、/api/prompts、/api/index/vectors/rebuild
的 catch 将 err.message 原样返回客户端，可能泄漏绝对路径与内部状态；
[低] /api/storage/import 的 bundle 仅约束 min(1) 无 max，超大载荷可致内存/磁盘耗尽；
[低] /api/link-preview 的 url 仅非空校验；[低] prompts PUT 把引擎内部异常统一映射 400，语义混淆；
[低] 文件名 readonly 却注册多个写路由，易使维护者/中间件产生只读假设。

### 新审（前 10000 字符）

**engine/run-loop.ts**：未发现值得报告的问题（类型与契约为主，错误处理呈失败闭合）。

**engine/tools/pipeline.ts**：[高] 边界组内不即时中断（见重点 2）；
[中] materialize 在 registry.resolve 返回 undefined 时仍保留该 spec 于广告面，模型可见不可解析工具。

**protocol/apply-event.ts**：未发现值得报告的问题（纯函数式类型与流式工具，无 I/O）。

**engine/session/store.ts**（据模型定稿文本整理，正式列表未及输出）：
[中] sessionFileName 未消毒 sessionId，含 `/` 或 `../` 时文件名拼接可致路径穿越（引擎以自生成 ID 调用，
属防御性问题）；[中] migrateLegacyCompaction 索引错位可致迁移失败；[低] resume 的备份与修复非原子，
存在崩溃窗口。

**engine/checkpoint.ts**：[高] 已证伪（见文末）；
[中] constructor 以未校验的 sessionId 拼 checkpointRoot 路径，含 `../` 可逃逸仓库目录；
[低] review() 的 patch 预算在首个超限项后未中止循环，truncated 标注不准、返回体量可超预算。

**apps/server/auth.ts**（正式输出 2 条，另 3 条在思考稿中已定稿未及输出，一并注明）：
[中] preHandler 对未匹配路由（pattern === undefined）直接豁免，违反 fail-closed；
[中] /api 前缀检查用 startsWith('/api') 而非 '/api/'，边界不严；
[中·未成稿] redactTokenQuery 仅为日志脱敏工具、无法强制所有记录 req.url 的位置都调用，
`?token=` 仍可能经访问日志/Referer 明文泄漏（与重点 6 的设计权衡配套看）；
[低·未成稿] /api/healthz 豁免未限定 GET 方法；[低·未成稿] Bearer  scheme 大小写敏感，不合 RFC 7235。

**apps/server/routes/secrets.ts**：未发现值得报告的问题（路由层仅校验与转发，密钥逻辑在 engine 层）。

**apps/server/routes/permissions.ts**：[中] PUT /api/trust 对 body.path 未做范围/合法性校验即调
engine.setTrust 写全局信任列表（与 transport @10000 的 setTrust 条互为表里），若引擎侧同样无约束，
任意敏感路径可被信任而绕过审批；[低] PUT /api/extensions/:id/enabled 不校验返回结果、总响应
`{ ok: true }`，扩展状态可能虚假成功（fail-open）。

## 已证伪（人工核查不成立，不计入发现数）

1. **bash.ts @20000「error 与 close 双触发重复 finish」**：finish 本身有幂等守卫——
   bash.ts:441 `let settled = false`、456-457 `if (settled) return; settled = true`；
   模型只看到回调注册处、未见守卫，误判。
2. **checkpoint.ts「rollback 的 atomicWriteFile 缺 await」**：atomicWriteFile 是**同步函数**
   （fsutil.ts:14 `export function atomicWriteFile(...): void`，内部 openSync），无需 await；
   模型缺跨文件签名信息，误判。

## 方法注记

- 本批补审使第二批 8 个文件达到全文覆盖（transport-node 38643、permission 29214、bash 26822、
  mcp 约 19611 字符、proxy 16542、sessions 15755、readonly 19025、bash-pool 13016，除 sessions
  尾段未成稿外均已审完）。
- 仍未覆盖的大文件：engine.ts（3130 行）、protocol/api.ts（71312 字符）、apply-event.ts 与
  run-loop.ts、pipeline.ts 的 10000 字符之后部分，可作第四批。
- 三批累计已证伪 3 条，共同根因：模型缺跨文件/跨段上下文（realpath 解析、幂等守卫、同步签名）。
  后续引用模型结论时，[高] 一律以人工核查结论为准。
