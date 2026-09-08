/**
 * @spark/engine **公共入口**（工单 14.1 公共面治理）：L0 嵌入面的稳定承诺集。
 *
 * 裁决口径（逐项裁决表见 doc/02 §4.6）：
 * - **公共** = 嵌入者把引擎跑起来所必需（Engine 与 EngineDeps 涉及的类型、配置装载与
 *   ConfigError、日志器、id 工具、自定义 LlmGateway 所需的形状与 usage 助手）
 *   + 生产端（apps/server、apps/cli）实际消费的符号（resolveInRoot 路径硬边界、
 *   buildTrace 链路聚合、MCP 配置读写）
 *   + **DTO 装配纯函数**（工单 14.4 / ADR D31 结论 4：sessionMetaDtoOf/sessionDtoOf/
 *   sessionTreeToDto——server 路由与 sdk 的 InProcessTransport 共用同一份，不拷第三份；
 *   不落 protocol 是因为 protocol 硬约束零依赖 engine，而这些函数要读 SessionMeta/SessionTreeInfo）；
 * - **内部件**（会话存储/运行时/输入队列/run-loop/工具与管线/权限实现/投影/压缩/检查点/
 *   PiGateway 与 fallback/提示词构造/密钥仓/I-O 护栏/成本计量/钩子/命令装载/记忆/自动化/
 *   审计/搜索/浏览器管理，以及 ScriptedLlm 测试替身）一律走 `@spark/engine/internal`
 *   —— **无稳定性承诺**，只供本仓测试与 examples/evals；生产代码（apps/*\/src）不得引用，
 *   由 tests/public-surface.test.ts 的不变量网断言。
 *
 * 演进规则：新增公共导出 = 扩大对外承诺，须在 doc/02 §4.6 裁决表加行并说明理由；
 * 拿不准就先放 internal（收窄容易、放宽难）。
 */
export {
  loadConfig,
  ConfigError,
  type EngineConfig,
  type SparkConfig,
  type ModelsConfig,
  type ModelRef,
  type PermissionsConfig,
  type PermissionRule,
} from './config.js'
export { ulid, newIds } from './ulid.js'
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
export { resolveInRoot } from './tools/definition.js'
export {
  loadMcpConfig,
  writeMcpConfig,
  type McpConfig,
  type McpServerConfig,
} from './mcp/config.js'
export {
  Engine,
  SPARK_VERSION,
  type SessionMeta,
  type SessionHandle,
  type SessionTreeNode,
  type SessionTreeInfo,
  type ForkChildInfo,
  type SearchHit,
  type EngineDeps,
  type ReplyOutcome,
} from './engine.js'
export { Logger, type SparkLogger, type LogFields, type LogMsg } from './logger.js'
export { buildTrace } from './trace.js'
// DTO 装配（工单 14.4 / ADR D31）：双通道共用的纯映射函数（详见 dto.ts 头注）
export { sessionDtoOf, sessionMetaDtoOf, sessionTreeToDto } from './dto.js'
// EngineDeps.browserDriver 是文档化的注入点，故其端口类型属公共面（实现类 BrowserManager 属内部）
export {
  type BrowserDriver,
  type BrowserOpenResult,
  type BrowserShotResult,
} from './browser/driver.js'
