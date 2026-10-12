# Spark 安全审查报告（第二批，step-5-preview）

- 审查日期：2026-10-12
- 模型：step-5-preview（StepFun 按量 API，`https://api.stepfun.com/v1`）；Momo 验收另用 step-1o-turbo-vision，不在本报告内
- 范围：8 个高危面文件（engine 审批/执行/沙箱/MCP、protocol 传输、server 路由），每文件审查前 10000 字符（均注明"部分审查"）
- 可信度说明：全部 [高] 已由人工抽查源码核验，结论分三类——**已验证**（代码与所述一致）、**未抽查**（仅模型输出，待人工复核）、**已证伪**（核查后不成立，单列于文末，不计入发现数）。[中]/[低] 为模型输出，仅供参考。
- 统计（不含已证伪）：高 6、中 23、低 19。

## packages/engine/src/tools/builtin/bash.ts（部分审查，前 10000 字符）

- 未发现 [高]/[中] 问题。模型对可见范围的明确结论：fail-closed 设计完整，拒绝凑数。
- [低] `resolveShell`（Windows 分支）：跳过 WSL stub 的正则只匹配 `system32\bash.exe` 与 `windowsapps\bash.exe` 结尾，`System32\WSL\bash.exe` 这类路径不在跳过范围内；是否构成问题取决于该路径的实体性质，模型自评"不一定是 bug"，仅作观察记录。

## packages/engine/src/permission/service.ts（部分审查，前 10000 字符）

- [高]（已验证）`assert`（162–163 行）：危险命令闸 `dangerVerdict` 仅在 `check.action === 'bash' || check.resource.startsWith('cmd:')` 时触发；其他能执行 shell 的工具若使用别的 action 名，可完全绕过语法树危险检查，规则层 allow 后直接放行，失去 fail-closed 降级保护。
- [中] `assert`（约 135–142 行，`alwaysAskForcesAsk`）：`!(winningLayer === 'user' || winningLayer === 'session')` 把项目层（project）allow 也降为 ask，与注释"项目层 allow 不压制"直接矛盾，项目级白名单在敏感工具上被过度收紧。
- [中] `assert`（约 200–215 行，`new Promise` executor）：`fireBlockingRace(...)` 同步抛错时 Promise 直接 reject、`assert` 向上抛异常而非返回 `false`；调用方未捕获时审批流程可能异常中断甚至 fail-open。
- [中] `assert`（约 203 行）：`check.signal.addEventListener('abort', ...)` 注册后，entry 正常 settle（timeout/hook/reply）时未移除监听器，长生命周期 AbortSignal 上 listener 无限累积，长时间会话内存泄漏。
- [低] `assert`（约 185–205 行）：`permission.asked` emit 成功后、pending 注册与 abort listener 添加前存在竞态窗口，此窗口内 signal 中止不触发 listener，审批挂起直至 timeout 才 deny（仍 fail-closed，但浪费超时窗口）。
- [低] `assert`（约 210–225 行）：hook 竞速 payload 中 `sourceEventId` 硬编码为 `null`，未关联刚 emit 的事件 ID，hook 拒绝原因无法回溯到具体审批事件，审计链断裂。

## packages/engine/src/sandbox/proxy.ts（部分审查，前 10000 字符）

- [高]（机制已验证，可达性存疑）`stop()` 与 `start()` 的 listen 回调竞态：`this.server` 仅在 listen 回调中赋值（250 行），`stop()`（259 行）读到 null 即直接返回；若调用方未 await `start()` 就调用 `stop()`，回调随后仍会把 server 置为监听中，形成停止后继续监听的 fail-open 缺口。是否可达取决于调用点（本次未审调用方）。
- [高]（未抽查）`handleSocks` / `handleHttpConnect`（约 330+ 行）：allowlist 仅校验目标主机名，未限制 CONNECT 端口，也未在 DNS 解析后校验目标 IP 是否为私有/环回/保留段；已允许域名可被用来连内网任意端口，构成 SSRF 与端口扫描面。
- [中] `start()`（约 245 行）：`server.listen` 未强制绑定 `127.0.0.1`，`opts.host` 可配为 `0.0.0.0`，本地出口代理可能暴露给同网段主机。
- [中] `start()`（约 250 行）：连接级 `sock.setTimeout(HANDSHAKE_TIMEOUT_MS)` 覆盖 socket 整个生命周期，握手完成后空闲隧道仍会在 15s 后被 destroy，破坏 WebSocket、长轮询等合法长连接。
- [中] `ChunkQueue.readUntil`（约 178 行）：`indexOf` 命中后直接返回 `acc`，不再检查 `acc.length > max`，`HTTP_HEAD_MAX` 可被超出 marker 长度的流量绕过。
- [中] `ChunkQueue.readUntil`（约 188 行）：`Buffer.concat([acc, chunk])` 在长度检查之前执行，单个大 chunk 造成瞬时大内存分配，形成 DoS 向量。
- [低] `hostAllowed` / `normalizeHost`（约 65 行）：IPv6 字面量未做方括号解包与 IPv4-mapped 规范化，allowlist 字符串与 SOCKS5 atyp=4 格式化结果难以一致。
- [低] `hostAllowed`（约 58 行）：`*.example.com` 通配会命中 `x..example.com` 等含连续点的畸形主机名，扩大通配允许面。
- [低] `ChunkQueue.attachSink`（约 195 行）：冲刷积压队列时 `write` 同步抛错，`queue` 与 `buffered` 已被清空，内部缓冲状态不一致。

总体评价：fail-closed 域名过滤与协议分流设计清晰，但停止竞态、SSRF/端口未限制、超时作用域过大需在沙箱边界收紧。

## packages/engine/src/tools/bash-pool.ts（部分审查，前 10000 字符）

- [高]（存疑待复核）`run`：未见对 `opts.signal.aborted` 的前置检查。已核查：signal 接线存在（306 行注册 abort 监听、233 行移除）；但若信号在注册监听前已中止，`abort` 事件不会重发，命令仍可能启动并写入 stdin 执行，构成 fail-open。需人工复核 `run()` 开头确认。
- [中] `run`/`emit`：`maxOutputChars` 缺省为 `Infinity`，输出收集上限形同虚设，单条命令可无限累积输出耗尽引擎内存。
- [中] `run`：已存在的 shell 条目忽略 `opts.spawnCwd`，仅 `changeTo` 能调整目录，调用方显式指定的起始目录被静默丢弃。
- [低] `onClose`：仅对 `stderrDecoder` 调用 `end()`，`stdoutDecoder` 缺收尾冲刷，shell 异常死亡时 stdout 末尾不完整的 UTF-8 字符被静默丢弃。
- [低] `onStdout`：对无尾换行的输出统一追加 `'\n'`，收集结果与命令实际输出存在差异，可能误导下游解析。
- [低] `run`/`emit`：`COLLECT_TRUNCATION_MARK` 不计入 `collectedChars`，触发截断后总输出可能略超声明上限。
- [低] `finish`：`killTimer` 未调用 `unref()`，Node 进程退出可能被 SIGKILL 宽限定时器短暂阻塞。

## packages/engine/src/mcp/manager.ts（部分审查，前 10000 字符）

- [高]（未抽查）`makeMcpToolDef.execute`：`errText(err)` 与 MCP 错误文本未脱敏直接作为 `output.message` 返回给模型，本地堆栈、文件路径或凭据可能经 LLM 响应泄漏。
- [中] `defaultTransport`：`new URL(cfg.url)` 未限制 http/https 协议，`file:` 等非网络协议可被配置，存在本地文件读取或非预期处理风险。
- [中] `mcpToolName`：server/tool 名含 `__` 时扁平化拼接产生命名冲突，不同 MCP 工具可能注册同名或审批资源标识混淆。
- [中] `makeMcpToolDef.handleFailure` expired 分支：reconnect 成功后当前闭包仍持旧 client 且无版本隔离，重连窗口内并发请求继续打到失效会话，旧 client 未关闭导致资源泄漏。
- [中] `SESSION_EXPIRED_RE`：`\b404\b` 匹配过宽，普通"资源不存在"错误被误判为会话过期，触发不必要 reconnect 或向模型返回误导性错误。
- [中] `makeMcpToolDef.execute`：外部 server 可通过 isError 文本注入 401/404 关键词毒化 needs-auth 缓存，同 server 全部工具被恶意拒绝 15 分钟。
- [低] `serializeMcpContent`：`JSON.stringify(structuredContent)` 未防护循环引用，异常 server 数据可使工具调用崩溃进入 catch 分支。
- [低] `defaultTransport`：`authorization` 小写与用户 `Authorization` 大写合并后可能产生重复 HTTP 头，令牌可能被覆盖或认证失败。

总体评价：核心审批与 fail-closed 骨架正确，但错误边界脱敏、外部输入分类鲁棒性及并发重连隔离存在明显短板。

## packages/protocol/src/transport-node.ts（部分审查，前 10000 字符）

- [中] `splitSseFrames`：仅归一化 `\r\n` 后按 `\n\n` 切帧，未支持 SSE 规范允许的裸 `\r` 分隔；若流以 `\r\r` 分帧，缓冲区 `rest` 无限增长，造成内存泄漏/DoS。
- [中] `HttpTransport.req`：`init?.headers` 为 `Headers` 实例或二维数组时，对象展开无法继承其键值对，调用方传入的安全相关自定义请求头被静默丢弃。
- [中] `HttpTransport.req`：`body: null` 满足 `init?.body !== undefined` 而错误附加 `content-type: application/json`，与服务端 Fastify 5 空 body 校验叠加时可能导致请求被拒（FST_ERR_CTP_EMPTY_JSON_BODY）。
- [中] `HttpTransport.req`：超时 timer 在 `fetch()` 返回后即清理，响应体读取阶段（`res.json()`/`res.text()`）失去超时保护；服务端发送响应头后挂起 body 时调用无限期悬挂。
- [低] `pumpSseStream`：`envelopeFromSseFrame` 抛错时未在 `finally` 中取消/释放 `reader`，异常路径下流锁与连接资源泄漏。
- [低] `pumpSseStream`：流结束时未调用无参 `decoder.decode()` flush，尾部不完整 UTF-8 字节序列可能损坏或丢失。
- [低] `HttpTransport`：`openSessions` 只增不减，断线重连时对已关闭会话仍触发全量回放（resync），浪费带宽与计算。
- [低] `HttpTransport.req`：`assertNotDisposed()` 与 `fetch()` 之间存在时序窗口，dispose 后已出发的请求仍可能完成，缺乏飞行中请求的统一中止跟踪。

总体评价：整体遵循 fail-closed 与超时防护设计，但 SSE 帧切分兼容性、请求头合并与 body 阶段超时存在若干正确性缺陷。

## apps/server/src/routes/sessions.ts（部分审查，前 10000 字符）

- [中] `GET /api/sessions/:id/fs/tree`（catch 块）：`E_PATH_OUTSIDE` 被重新抛出而非按注释返回空清单，违背 fail-closed 静默拒绝原则，且可能通过 500 响应泄露内部路径信息。
- [低] `GET /api/sessions/:id/fs`：`replace(/\\/g, '/')` 在 POSIX 上把文件名中合法的反斜杠视为路径分隔符，特定文件名路径解析失败或混淆。
- [低] `GET /api/sessions/:id/fs/tree`：`query.path` 未规范化直接作返回数据的路径前缀，输入含 `./`、`//` 时响应路径格式不一致，可能引发前端解析错误。
- [提示] 模型原标 [高] 的"`POST /api/sessions` 的 `cwd` 参数未经验证即设为会话根目录"：经核查属本地工具的既定设计（会话根由使用者自选项目目录），不构成漏洞，降为设计提示记录在此。

## apps/server/src/routes/readonly.ts（部分审查，前 10000 字符）

- [高]（已验证·路由层）`app.post('/api/sessions/:id/commands/:name')`（59–66 行）：直接调用 `engine.executeCommand` 执行命令，**未调用 `confirmGate`**；同文件其他写操作（MCP 配置写入 109 行、LSP 安装 207 行）均有确认门。路由层的不一致属实；`engine.executeCommand` 内部是否另有审批闸不在本次审查范围，需人工确认后定级。
- [中] `PUT /api/mcp`（`McpPutBodySchema.url`）：允许配置任意 `streamable-http` URL 且无 SSRF 防护，引擎会向用户指定的任意内网/本地地址发起连接。
- [中] `app.post('/api/browser/cleanup')`：直接触发 `engine.cleanupBrowserArtifacts()` 删除截图产物，无确认门，非环回来源可无审批触发数据删除。
- [中] `app.post('/api/storage/cleanup')`：直接触发存储桶清理（删除/移动数据），无确认门，与敏感写操作应显式确认的策略不一致。
- [中] `app.post('/api/hooks/project-trust')`：直接修改项目 hooks 信任状态，无确认门，非环回来源可远程篡改安全信任开关，弱化 hooks 安全基线。
- [低] `app.post('/api/mcp/:server/auth')`：可被非环回来源直接触发 OAuth 授权流程，无 `confirmGate`，可能导致未授权的浏览器跳转。

总体评价：该文件对 LSP 安装与 MCP 配置写入引入了条件确认，但对命令执行、数据清理、信任状态修改等敏感写操作缺乏一致的 fail-closed 审批门，管控明显不一致。

## 经核查不成立（已证伪，不计入发现）

- ~~[高] sessions.ts：`resolveInRoot` 仅做词法路径约束、符号链接可逃逸沙箱~~ —— 证伪：`resolveInRoot` 实现位于 `packages/engine/src/tools/definition.ts:188`，内部用 `cachedRootRealpath(root)` 与 `deepestRealpath(abs)` 解析真实路径后再比对根目录，符号链接已处理。模型仅审到调用方文件、未见实现，属推断错误。

## 总体评价

第二批的真实风险集中在三处：审批闸的覆盖一致性（permission 的 action 名绕过、readonly 命令路由缺确认门）、沙箱网络代理的边界（CONNECT 端口/IP 段、停止竞态）、长连接与外部输入的鲁棒性（transport 超时/切帧、MCP 错误分类与脱敏）。bash.ts 可见范围内未发现高/中危，engine 核心执行路径的 fail-closed 骨架总体成立。建议修复顺序：先补两处审批闸一致性，再收代理 SSRF 面，其余按中低危排期。
