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
} from './tools/builtin/index.js'
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
