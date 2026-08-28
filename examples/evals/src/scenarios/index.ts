/**
 * 场景注册表：ScriptedLlm 确定性回归（无网络、无真实模型——PR/nightly/本地同跑）。
 * 新增场景纪律：一个文件一个场景，run 内自带夹具与清理（见 harness.ts）。
 */
import { approvalScenario } from './approval.js'
import { compactionScenario } from './compaction.js'
import { interruptScenario } from './interrupt.js'
import { surfaceScenario } from './surface.js'
import type { EvalScenario } from '../harness.js'

export const scenarios: EvalScenario[] = [
  approvalScenario,
  interruptScenario,
  compactionScenario,
  surfaceScenario,
]
