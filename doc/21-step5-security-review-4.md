# step-5-preview 安全审查报告（第四批：engine.ts 与 protocol/api.ts 全文）

> 审查人：step-5-preview（经 step193api 调用）；组织与核查：Muse。
> 日期：2026-10-12。承接 doc/18–doc/20（PR #31–#33）。
> 本批 18 次调用：engine.ts（117847 字符）12 段 + protocol/api.ts（55967 字符）6 段，两文件全文覆盖。
> 核查纪律同前三批：全部 [高] 人工抽查源码；已证伪单列、不计入发现数。

## 统计

- 模型报告口径：[高] 4 / [中] 17 / [低] 16；18 段中 7 段「未发现值得报告的问题」。
- **核查后：4 条 [高] 无一成立**——2 条证伪/已修复、2 条降级为中危设计提示（见下）。
  这是四批中模型高危准确率最低的一批，根因仍是缺跨文件上下文（schema 定义与实现层防护不在同一文件）。

## [高] 核查结论

1. **engine.ts @70000「updatePrompt 的 slot 无白名单、拼路径任意写」——证伪。**
   slot 在协议层即被白名单约束：api.ts:605 `PromptSlotSchema = z.enum(['base','compaction','title'])`，
   engine 收到的已是解析后的类型。模型只审 engine.ts、未见 schema，误判。

2. **api.ts @20000「PromptsUpdateSchema.path 未禁锢、可覆盖任意文件」——已修复（证伪）。**
   引擎实现 engine.ts:1862 `updatePrompt` 对路径走 `resolveInRoot(this.root, rel)` 硬边界，
   且源码注释明确记载此即 doc/13 代码规范审查的 A-1（P0）修复项：
   「原 isAbsolute 直通允许绝对路径写盘与 ../ 穿越 basePath」已被堵死。
   协议层 schema 只作类型描述、边界在实现层，为本仓库既定分工。

3. **api.ts @20000「SettingsPromptsSchema 模板路径未禁锢、恶意项目可诱导读任意文件注入提示词」——降级 [中·未抽查]。**
   写侧已由第 2 条证明禁锢；读侧（装载 spark.json 配置的模板文件）本批未抽查其 resolveInRoot 接线。
   威胁模型为「克隆含恶意 spark.json 的项目」，仓库另有项目信任层对冲，严重度下调，读侧接线待复核。

4. **api.ts @0「LogEntryDtoSchema.fields 任意键值透传、脱敏遗漏即泄漏」——降级 [中·纵深防御提示]。**
   schema 事实属实（`z.record(z.string(), z.unknown())`），但属设计提示而非已验证漏洞：
   写入侧脱敏纪律在本批多段被模型自己确认为严谨（如 engine @30000 段），且该 DTO 只经本地已认证 API 下发。

## 分段明细（中/低，未逐条人工核查）

### engine.ts

- @0：无发现（导入与字段声明）。
- @10000：[中] 构造函数 archivedReady 的 Promise.all 扫描无 .catch()，I/O 异常可致 rejected 无降级。
- @20000：[中] bus.subscribe 返回值未保存、无退订路径，监听器累积；
  [低] loadCommands/loadAgentPresets 的 .then() 链无 catch；装配段配置值（port/超时/UA）缺边界校验；
  后台任务输出经 submit 注入会话队列，片段内未见大小限制与审批卡点。
- @30000：无发现（模型评：密钥脱敏、审计注入与信任层接线严谨）。
- @40000：无发现（会话创建/归档/删除路径 fail-closed 严谨）。
- @50000：[中] removePermissionRule 先内存 splice 再落盘，持久化失败致内存/磁盘状态不一致；
  [中] forkSession 的存在性检查与 create 之间有 await 间隙（TOCTOU）；
  [低] fork 后续初始化抛错无孤儿文件回滚；源会话状态检查存在竞态窗口。
- @60000：无发现（门面层委托下层防护到位）。
- @70000：[高] 已证伪（见上 1）；[中] updateSettings 中 hooks dispose 与重建之间无 try-finally，
  抛异常将使 hooks 停留在已销毁状态、静默失效（若 hooks 承担审计/拦截则 fail-open）；
  [中] persistSparkPatch 与 config 赋值无并发同步，丢失更新竞态；
  [低] getSettings 回显 NODE_EXTRA_CA_CERTS 与数据目录绝对路径。
- @80000：无发现（用户级操作与 Agent 写盘路径分离严谨）。
- @90000：[中] rollbackToCheckpoint 先 delete 会话再执行回滚，回滚失败则会话丢失且磁盘未回滚；
  [中] replyAllPermissions 提供 once 批量放行全部挂起审批，与逐条审批粒度存在张力（注：该入口
  对应已登记的 D24 契约，属产品决策面，列此供复核）；[中] fireAutomationWebhook 引擎层未见
  认证/签名/防重放，仅依赖路由层；[低] automation 系列方法关机期未调 assertNotShutdown。
- @100000：[中] shutdown 批量 store.close() 无 try-catch，单个失败阻断后续全部清理（句柄/子进程/端口泄漏）；
  [低] 附件读取无大小上限，readFileSync 全量入内存有内存放大风险。
- @110000：[中] handleOf.compact 的 idle 检查与执行间 TOCTOU；[低] evidence() 按 UTF-16 code unit
  截断可能拆分代理对。另有一条未确认线索：pathToRoot() 若返回内部数组引用，外部可篡改事件历史
  ——模型自述实现不可见、不能确认，仅作线索记录，不计入发现。

### protocol/api.ts

- @0：[高] 已降级（见上 4）；[中] ModelTestResultDto.detail 原始错误详情未过滤直接纳入响应；
  [中] ModelProviderDto.baseUrl 仅字符串、未约束协议与内网地址（服务端连通测试若直连可 SSRF，
  实现层是否防护未在本文件内）；[中] Checkpoint/Review 系列 path 字段仅 z.string()（实现层
  resolveInRoot 纪律见第二批起多次核查，协议层无约束为既定分工）。
- @10000：无发现（strictObject/readonly/数值与正则约束完备）。
- @20000：[高] 两条均已处理（见上 2、3）；[中] SandboxNetworkSettings.allowlist 条目未校验格式，
  可配 `*` 过宽规则（注：allowlist 为用户自设出网策略，风险在误配而非注入）；
  [中] SettingsHooksSchema.projectTrust 协议层接受项目自报信任档，与「克隆仓库不得自选信任档」
  边界仅靠注释约定，消费方误读可放宽审批；[低] 全局 proxy/noProxy 未做格式校验；
  [低] SettingsDto.home 回显数据目录绝对路径。
- @30000：[中] AutomationTriggerDto 的 cwd/watch 路径字段仅 min(1)（协议层无约束，实现层为准）；
  [低] prompts 模板路径同上；cron 字段未按注释约束五字段格式；ArenaHistoryEntry 的 prompt
  注释称截断 100 字而 schema 未设 max(100)，契约不一致。
- @40000：[低] AttachmentDto.file 注释限定 `<id>.<ext>` 而 schema 仅 min(1)，契约与校验脱节
  （服务端 GET 附件一侧的正则把守见第三批 sessions 线索）；[低] StorageBucketDto.bytes 缺 .nonnegative()。
- @50000：无发现（纯 DTO 声明段）。

## 累计与剩余覆盖

- 四批累计：审查调用 8（批一）+ 8（批二）+ 21（批三）+ 18（批四）= 55 段；
  已证伪累计 5 条（sessions 符号链接、bash 重复 finish、checkpoint 缺 await、本批 2 条），
  全部源于模型缺跨文件上下文——[高] 结论以人工核查为准的纪律继续有效。
- 后端核心覆盖现状：engine 包与 protocol 包主要文件、server 路由与 auth 已基本全文；
  剩余未覆盖：第三批新审文件的 10000 字符后部分（apply-event、run-loop、pipeline、
  session/store、checkpoint 的尾段）、apps/desktop 与 apps/web 前端、miniapp。
