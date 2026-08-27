/**
 * @spark/engine 入口（doc/02 §5.0）。
 * 阶段三逐工单填充：config → bus → session → runtime → run-loop → tools →
 * permission → llm-gateway → projector → createEngine 门面。
 */
export {
  loadConfig,
  loadProjectRules,
  ConfigError,
  type EngineConfig,
  type SparkConfig,
  type ModelsConfig,
  type ModelRef,
  type PermissionsConfig,
  type PermissionRule,
} from './config.js'
export {
  EventBus,
  type EventSink,
  type EventHandler,
  type SubscribeHandle,
  type EventBusOptions,
} from './bus.js'
export { ulid, newIds } from './ulid.js'
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
export {
  ZERO_USAGE,
  addUsage,
  type LlmGateway,
  type ResolvedModel,
  type LlmMessage,
  type ToolSpec,
  type StreamRequest,
  type StreamResult,
  type StopReason,
  type OnceRequest,
} from './llm-gateway.js'
export {
  ScriptedLlm,
  type ScriptedStep,
  type ScriptedDelta,
} from './scripted-llm.js'
export {
  runSessionLoop,
  runTurn,
  type Projector,
  type Compactor,
  type Checkpointer,
  type ToolCallPending,
  type ToolPipelineResult,
  type ToolPipeline,
  type TurnCtx,
  type RunLoopDeps,
} from './run-loop.js'
export {
  resolveInRoot,
  type ToolContext,
  type ToolOutput,
  type ToolDefinition,
} from './tools/definition.js'
export { ToolRegistry, type AdvertisedTool } from './tools/registry.js'
export {
  ToolPipelineImpl,
  type PipelineDeps,
} from './tools/pipeline.js'
export {
  ToolOutputStore,
} from './tools/output-store.js'
export {
  type PermissionCheck,
  type PermissionService,
} from './tools/permission-port.js'
export {
  registerBuiltinTools,
  readTool,
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
export {
  loadMcpConfig,
  type McpConfig,
  type McpServerConfig,
} from './mcp/config.js'
export {
  McpManager,
  makeMcpToolDef,
  mcpToolName,
  serializeMcpContent,
  type McpManagerDeps,
} from './mcp/manager.js'
export { evaluate, type Effect } from './permission/rules.js'
export {
  PermissionServiceImpl,
  type PermissionServiceDeps,
} from './permission/service.js'
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
  Engine,
  SPARK_VERSION,
  type SessionMeta,
  type SessionHandle,
  type SessionTreeNode,
  type SessionTreeInfo,
  type ForkChildInfo,
  type EngineDeps,
  type ReplyOutcome,
} from './engine.js'
export { buildSystemPrompt } from './prompts.js'
export {
  SecretStore,
  resolveApiKey,
  type SecretSource,
} from './secrets/store.js'
export { IoGuard, type IoWarning, type GuardDeps } from './tools/guard.js'
export {
  FallbackGateway,
  type FallbackGatewayDeps,
  type FallbackLogger,
} from './fallback-gateway.js'
export { CostTracker, type UsageTotal } from './cost-tracker.js'
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
  Logger,
  type SparkLogger,
  type LogFields,
  type LogMsg,
} from './logger.js'
