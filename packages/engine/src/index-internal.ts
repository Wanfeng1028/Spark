/**
 * @spark/engine **内部件入口**（`@spark/engine/internal`，工单 14.1 公共面治理）。
 *
 * ⚠️ **无稳定性承诺**：本路径下的符号随实现演进，不遵循 semver 约束——只供本仓单测与
 * `examples/evals` 使用。**生产代码（apps/*\/src）不得引用**（tests/public-surface.test.ts
 * 有不变量网断言；grep 亦为验收手段）。需要长期依赖某个内部件时，走 doc/02 §4.6 裁决表
 * 把它提升到公共入口，而不是就地引用。
 *
 * 公共面（Engine/配置/错误/日志/id/gateway 形状/resolveInRoot/buildTrace/MCP 配置读写）
 * 由 `./index.js` 承载，此处一并转出，使内部消费者只需一个入口。
 */
export * from './index.js'

// ---- 配置与事件总线 ----
export { loadProjectRules } from './config.js'
export { EventBus, type EventSink, type SubscribeHandle } from './bus.js'

// ---- 会话存储 / 树 / 输入队列 / 运行时 ----
export {
  SessionStore,
  mungeDir,
  sessionFileName,
  danglingTurnIds,
  type SessionHeader,
  type SessionFile,
} from './session/store.js'
export { EventTree } from './session/tree.js'
export {
  InputQueue,
  type InputItem,
  type SubmitResult,
  type SubmitResultKind,
} from './session/input-queue.js'
export { SessionRuntime, type RuntimeStatus } from './session/runtime.js'

// ---- 测试替身（评测与单测用；不是生产网关） ----
export { ScriptedLlm, type ScriptedStep, type ScriptedDelta } from './scripted-llm.js'

// ---- run loop 与端口 ----
export {
  runSessionLoop,
  runTurn,
  type Budget,
  type Projector,
  type Compactor,
  type Checkpointer,
  type ToolCallPending,
  type ToolPipelineResult,
  type ToolPipeline,
  type TurnCtx,
  type RunLoopDeps,
} from './run-loop.js'

// ---- 工具：定义 / 注册表 / 管线 / 输出溢写 / 内置件 / 沙箱 / 护栏 ----
export {
  type ToolContext,
  type ToolOutput,
  type ToolDefinition,
} from './tools/definition.js'
export { ToolRegistry } from './tools/registry.js'
export { ToolPipelineImpl, type PipelineDeps } from './tools/pipeline.js'
export { ToolOutputStore } from './tools/output-store.js'
export { type PermissionCheck, type PermissionService } from './tools/permission-port.js'
export {
  registerBuiltinTools,
  readTool,
  grepTool,
  exitPlanModeTool,
  writeTool,
  editTool,
  bashTool,
  makeBashTool,
  makeTaskTool,
  type BashToolOptions,
  type TaskInput,
  type TaskRunner,
} from './tools/builtin/index.js'
export {
  bwrapArgs,
  seatbeltProfile,
  resolveSandboxWrapper,
  wrapperAvailable,
  type BashSandboxMode,
  type SandboxWrapper,
} from './tools/sandbox.js'
export { IoGuard, type IoWarning, type GuardDeps } from './tools/guard.js'
export { memorySaveTool, memorySearchTool } from './tools/builtin/memory.js'

// ---- MCP 运行时（配置读写在公共面） ----
export {
  McpManager,
  makeMcpToolDef,
  mcpToolName,
  serializeMcpContent,
  type McpManagerDeps,
} from './mcp/manager.js'

// ---- 权限：规则求值与服务实现 ----
export { evaluate, type Effect } from './permission/rules.js'
export { PermissionServiceImpl, type PermissionServiceDeps } from './permission/service.js'

// ---- 形状类型转出：以下三个符号必须 export（出现在同文件已导出接口的字段类型位置，
// 私有会让声明发射报 TS4033），转到这里使它们有消费者，knip 才不再报未引用导出 ----
export { type ProviderApiKind } from './model-catalog.js'
export { type SkillHookDef } from './skills/loader.js'
export { type GrepMatch } from './tools/builtin/grep.js'

// ---- 投影 / 压缩 / 检查点 ----
export {
  ProjectorImpl,
  reasoningIncluded,
  estimateTokens,
  projectSurface,
  type ProjectorDeps,
  type SurfaceEntry,
  type Projection,
} from './projector.js'
export { CompactorImpl, COMPACTION_PROMPT, type CompactorDeps } from './compaction.js'
export {
  GitCheckpointer,
  SESSION_ALIAS,
  type CheckpointRecord,
  type GitCheckpointerDeps,
} from './checkpoint.js'

// ---- LLM 网关实现与装饰器 ----
export {
  PiGateway,
  classifyLlmError,
  backoffDelayMs,
  toPiMessages,
  toSparkContent,
  toSparkUsage,
  type PiStreamFn,
  type PiGatewayDeps,
  type LlmErrorKind,
} from './pi-gateway.js'
export {
  FallbackGateway,
  type FallbackGatewayDeps,
  type FallbackLogger,
} from './fallback-gateway.js'

// ---- 提示词 / 密钥仓 / 成本计量 ----
export { buildSystemPrompt, locateProjectInstructions } from './prompts.js'
export { SecretStore, resolveApiKey, type SecretSource } from './secrets/store.js'
export { CostTracker, type UsageTotal } from './cost-tracker.js'

// ---- 钩子 / 命令装载 ----
export {
  UserHookRunner,
  DEFAULT_HOOK_TIMEOUT_MS,
  type HookPoint,
  type HookLogger,
  type HookFirePayload,
  type UserHookDef,
  type UserHookCommandDef,
  type UserHookSkillDef,
  type UserHooksConfig,
  type UserHookRunnerDeps,
} from './hooks/runner.js'
export {
  BUILTIN_COMMANDS,
  COMMAND_NAME_RE,
  expandCommandPrompt,
  loadCommands,
  type LoadedCommand,
  type CommandLogger,
} from './commands/loader.js'

// ---- 记忆 / 自动化 / 审计 / 搜索 / 浏览器管理 ----
export { MemoryStore } from './memory/store.js'
export { AutomationManager, type FireDeps } from './automation/manager.js'
export { AutomationRegistry, type TriggerDef, type TriggerRun } from './automation/registry.js'
export { parseCron, cronMatches, type CronSpec } from './automation/cron.js'
export {
  AuditLog,
  type AuditEntry,
  type AuditQuery,
  type AuditKind,
  type AuditSink,
} from './audit/log.js'
export { SearchStore, type SearchEntry, type SearchEntryType } from './search/store.js'
export { BrowserManager } from './browser/driver.js'
