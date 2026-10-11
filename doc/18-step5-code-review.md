# Spark Engine 代码审查报告（step-5-preview）

- 审查日期：2026-10-11
- 模型：step-5-preview（StepFun 按量 API，`https://api.stepfun.com/v1`）
- 范围：`packages/engine/src` 下 8 个文件；其中 config.ts、cost-tracker.ts、hooks/runner.ts 超过 8000 字符，仅审查前 8000 字符（已注明"部分审查"）
- 可信度说明：高/中严重度发现已由人工抽查源码验证（见文末"验证记录"）；低严重度为模型输出，仅供参考

## computer/executor.ts（完整审查）

- [低] 行 81：`window()` 返回联合类型 `{ windows } | { focused }` 无判别字段，调用方无法做类型收窄，易用错分支。
- [低] 行 83：`app()` 返回类型强制要求 `apps` 字段，`launch` 动作只关心 `pid` 时语义不清。
- [低] 行 95-106：工厂函数顶层直接 import 三个平台实现，任一模块加载失败则整个模块不可用，无降级处理。

## browser/driver.ts（完整审查）

- [高] `open(url)`：URL 未做任何校验，`file://` 等协议可经 Playwright 直接 `p.goto` 访问本地文件，存在 SSRF / 本地文件读取风险（已验证：`driver.ts` 与 `playwright.ts` 两层均无协议白名单）。
- [中] `ensure()`/`open()`：`driver.open()` 失败后 `this.driver` 已被赋值，后续 `require()` 不再抛 `E_BROWSER_NO_PAGE`，调用方可能在未正确初始化的 driver 上执行操作；失败的浏览器进程也未被关闭。
- [低] `ensure()`：`launching` Promise 无超时机制，`make()` 挂起则所有等待调用永久阻塞。
- [低] `close()`：`driver.close()` 抛错时状态已重置为 null，底层资源可能泄漏且无日志。

## config.ts（部分审查，前 8000 字符）

- [中] 模型 schema 中 `z.url()` 与 `z.string().url()` 混用：若项目使用 Zod v3，`z.url()` 不是有效 API，会在运行时直接报错；即使 Zod v4，写法不一致也是隐患。建议统一并确认 Zod 版本。
- [低] 可见范围内 `errText`、`projectSnapDir` 等导入未被使用（可能位于被截断的后半部分，未能确认）。

## errs.ts（完整审查）

- [中] 行 8、14：`String(err)` 在 `err` 为 Symbol 时会抛 TypeError，`errText`/`asError` 对外承诺返回 string/Error，传入 Symbol 会违背契约。
- [低] 行 8、14：`instanceof Error` 跨 realm（如 vm/iframe）失效，跨上下文的 Error 会被误判包装而非透传。
- [低] 行 8：传入伪造 Error 实例（如 `Object.create(Error.prototype)` 未设 message）时，`err.message` 为 undefined，违反返回 `string` 的类型契约。

## cost-tracker.ts（部分审查，前 8000 字符）

- [中] `buckets` 数组无上限：`add()` 用 `Array.find` 做 O(n) 查找，`usage.json` 随运行时间无限增长，长期运行有性能退化风险。
- [低] 构造函数中 `existsSync` 与 `readFileSync` 之间存在 TOCTOU 窗口：文件在此间被删除会抛原生 ENOENT，而非统一的 ConfigError。
- [低] `summary()` 用 `localeCompare` 做 day/provider/model 排序，注释称"字典序"，locale 相关排序与严格字典序可能不一致。
- 注：可见范围内 `add()`/`reset()` 调用了 `this.persist()`，其定义位于被截断的后半部分，未能审查其原子性实现。

## fallback-gateway.ts（完整审查）

- [中] `stream()` 未做 try-catch：`inner.stream()` 若抛异常（而非返回 error stopReason），fallback 链不会触发，直接上抛；`generateOnce()` 有 try-catch（行 73），两者行为不一致（已验证）。
- [低] `generateOnce()` 的 catch 块中调用 `chain()`，若 `chain()` 本身抛错会掩盖原始 `primaryErr`。
- [中] 错误汇总字符串直接拼接 `result.error`/`attempt.error`，若上游错误信息含敏感内容（key、内部 URL），会进入日志与返回给调用方的错误文本。
- [低] fallback 全部失败时抛出的新 `Error` 丢失原始错误的堆栈与类型，调用方无法区分网络错误/认证错误等。

## automation/cron.ts（完整审查）

- [中] `parseField` 步长分支：范围端点未校验（如 `10-5/2`），`lo > hi` 时循环不执行，返回空 Set，该字段永久不匹配且无报错，属静默错误配置。
- [中] `cronMatches` 对"日"与"周"字段用 AND 语义（`spec.daysOfMonth.has(...) && spec.daysOfWeek.has(...)`），但标准 Vixie cron 中两者是 OR 关系（已验证）。
- [低] 步长大于范围（如 `*/61`）时静默只取起点值，无报错或警告。

## hooks/runner.ts（部分审查，前 8000 字符）

- [低] 行 19-40：注释称"十三挂点"，但 `HookPoint` 联合类型实际有 16 个（含子代理双挂点与 permission.request），注释与代码不一致。
- [低] `runBlockingCommand` 中 `timeoutMs` 未校验：传入负数、0 或 NaN 时 `setTimeout` 行为异常（立即触发或永不触发）。
- [低] `dispose()` 中 `child.kill()` 无错误处理，子进程已退出等情况下可能抛错。
- 注：文件末尾超出 8000 字符被截断，`runBlockingCommand` 后半部分未能审查。

## 总体评价

八个文件整体工程质量较好：注释详尽、错误码体系统一（E_ 前缀）、fail-closed 思想贯穿（如 UnsupportedComputerExecutor、配置校验失败即停）。主要风险集中在三处：一是 browser/driver.ts 的 URL 未校验（本地文件访问风险），二是 fallback-gateway.ts 的 stream 路径缺少异常捕获导致 fallback 纪律不一致，三是 automation/cron.ts 的日/周 AND 语义与标准 cron 不符。另有若干低严重度问题（类型设计、注释漂移、边界校验缺失），建议按优先级逐步修复。部分审查的三个文件因长度截断，结论覆盖不全，完整审计建议分段补审。

## 验证记录

人工抽查（2026-10-11）：

1. browser/driver.ts `open(url)` → `driver.open(url)` → `playwright.ts` 的 `p.goto(url)`，两层均无协议校验，`file://` 可直达。**属实**。
2. fallback-gateway.ts `stream()`（行 48-49）无 try-catch，`generateOnce()`（行 73）有 try-catch。**属实**。
3. automation/cron.ts `cronMatches`（行 82-89）日/周字段为 `&&` 连接，与 Vixie cron 的 OR 语义不符。**属实**。
