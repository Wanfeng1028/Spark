/**
 * 全量回放代际协调器（AUD-08）：防旧快照覆盖直播事件。
 *
 * 问题：getSession 全量回放在途时，全局 SSE 直播可能已把更新写进 session-store
 * （如 turn.completed）；旧快照到达后 resetSlice+全量 apply 会把这些更新抹掉
 * （全局流不重发，数据真丢失）。多次回放乱序返回同病。
 *
 * 机制（per-sid 代际）：
 * - replay() 先自增代际并置 buffering；快照返回时若代际已被更新代取代则整体丢弃；
 * - buffering 期间的直播事件由 ingest() 缓存进 pending（不写 store——写了也会被
 *   旧快照的 resetSlice 抹掉）；快照提交后补应用 pending：seq 在快照水位内的事件
 *   被 applyEvent 的 seq 去重天然跳过（apply-event.ts 外壳去重），水位之后正常生效；
 * - 失败闭合：getSession 失败原样上抛（调用方 catch 语义不变）；finally 里若仍是
 *   当前代，先把 pending 补进 store（直播数据不丢）再清 buffering——直播通道恢复
 *   常规路径，旧快照未提交不抹任何数据。
 *
 * 职责边界：只管 session-store 的回放一致性，不碰 connection store（直播水位
 * noteSeq 由调用方处理）。单例见 context.tsx——所有回放调用方（resync 重连/
 * 打开会话/回滚后重放）共享同一份 per-sid 代际状态，协调才成立。
 * 新代际清空 pending 是安全的：事件到达客户端前必已落盘，新快照（取数晚于入队）
 * 必含它们，由 seq 去重吸附；仅 live-only 增量（本就不落盘、重连即失效）被丢弃。
 */
import type { SessionId, SparkEventEnvelope, Transport } from '@spark/protocol'
import { useSessionStore } from '@/stores/session'

/** 协调器合同（模块内私有——knip 硬门：导出面只留被消费的 createReplayCoordinator） */
interface ReplayCoordinator {
  /** 全量回放：快照提交与 pending 补应用在同一次续体内完成 */
  replay(transport: Transport, sid: SessionId): Promise<void>
  /** 该 sid 正在回放时缓存事件并返回 true（调用方跳过常规 rAF 通道）；否则 false */
  ingest(e: SparkEventEnvelope): boolean
}

export function createReplayCoordinator(): ReplayCoordinator {
  const gens = new Map<SessionId, number>()
  const buffering = new Set<SessionId>()
  const pending = new Map<SessionId, SparkEventEnvelope[]>()

  return {
    async replay(transport, sid) {
      const gen = (gens.get(sid) ?? 0) + 1
      gens.set(sid, gen)
      buffering.add(sid)
      pending.set(sid, [])
      let committed = false
      try {
        const dto = await transport.getSession(sid)
        if (gens.get(sid) !== gen) return // 已被更新代取代——旧快照整体丢弃，不写 store
        const store = useSessionStore.getState()
        store.resetSlice(sid)
        for (const e of dto.events ?? []) store.applyEvent(e)
        for (const e of pending.get(sid) ?? []) store.applyEvent(e)
        committed = true
      } finally {
        if (gens.get(sid) === gen) {
          if (!committed) {
            // 失败闭合：快照未提交——buffering 期间缓存的直播事件补进 store，不丢数据
            const store = useSessionStore.getState()
            for (const e of pending.get(sid) ?? []) store.applyEvent(e)
          }
          buffering.delete(sid)
          pending.delete(sid)
        }
      }
    },

    ingest(e) {
      if (!buffering.has(e.sessionId)) return false
      pending.get(e.sessionId)?.push(e)
      return true
    },
  }
}
