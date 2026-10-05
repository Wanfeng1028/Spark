/**
 * 会话页纯函数集——本文件已收敛为 protocol 单源的端侧转发（审计 doc/13 §4.1 B-1 /
 * §4.2 B-2 下沉：与 mobile 曾逐字双份，落点 packages/protocol/src/session-rows.ts）。
 * 新代码请直接从 @spark/protocol 导入；本 shim 只为既有页面/测试的导入路径保持不动。
 * Composer 高度计算除外：小程序 Textarea autoHeight 原生自增，无需手算。
 */
export {
  TIMESTAMP_GAP_MS,
  buildSessionRows,
  lastUserTextOf,
  shouldInsertTimestamp,
} from '@spark/protocol'
export type { SessionRow } from '@spark/protocol'
