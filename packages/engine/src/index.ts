/**
 * @spark/engine 入口（doc/02 §5.0）。
 * 阶段三逐工单填充：config → bus → session → runtime → run-loop → tools →
 * permission → llm-gateway → projector → createEngine 门面。
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
