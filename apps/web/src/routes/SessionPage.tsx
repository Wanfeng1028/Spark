/**
 * 工作台 /session/:id（doc/02 §6.2.2）：ChatView 虚拟化会话流 + Composer 三模式输入区。
 * 事件 → store 接线在 TransportProvider（applyEvent 唯一写入口）；本页只消费选择器。
 * 顶部悬浮：TurnStatusBar（进行中指示）· compaction 细条 · error finish 黄条+重试（重发
 * 最后一条 user.message）。右下 ErrorToast（error 事件；fatal 全屏态）。
 * mock 场景条 + 「模拟断线」开关是开发夹具（阶段验收要求断线重连条在 mock 下可走查）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { ids } from '@spark/protocol'
import { useTransport, replaySessionEvents } from '@/transports/context'
import { MOCK_SCENARIOS } from '@/transports/mock'
import type { MockScenario } from '@/transports/mock'
import { ChatView } from '@/features/chat/ChatView'
import { Composer } from '@/features/chat/Composer'
import { TurnStatusBar } from '@/features/chat/TurnStatusBar'
import { ErrorToast } from '@/features/chat/ErrorToast'
import { useActiveTurn, useSessionItems, useSessionStore } from '@/stores/session'
import { useConnectionStore } from '@/stores/connection'

/** 打开会话：GET 全量 durable → resetSlice → 批量 apply（§6.10 时序①；mock 流式夹具不走此路径） */
type LoadState = 'loading' | 'ready' | { error: string }

export function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { transport, mock, scenario, setScenario } = useTransport()

  const sid = ids.session(sessionId ?? '')
  const turn = useActiveTurn(sid)
  const items = useSessionItems(sid)
  const topBanner = useSessionStore((s) => s.byId[sid]?.topBanner ?? null)
  const compacting = useSessionStore((s) => s.byId[sid]?.compacting ?? false)
  const connStatus = useConnectionStore((s) => s.status)
  const setConnStatus = useConnectionStore((s) => s.setStatus)
  // http 打开态（加载/错误呈现；mock 即挂即用）。函数式初值防 sid 切换时沿用旧态
  const [load, setLoad] = useState<LoadState>(() => (mock ? 'ready' : 'loading'))
  const [reloadKey, setReloadKey] = useState(0)

  const busy = turn !== null
  const waiting = turn?.waiting === true

  // 路由激活 + 冷启动回放：StatusBar/Sidebar 的「当前会话」数据源
  useEffect(() => {
    useSessionStore.getState().setActiveId(sid)
  }, [sid])

  useEffect(() => {
    if (mock) return
    let cancelled = false
    setLoad('loading')
    replaySessionEvents(transport, sid)
      .then(() => {
        if (!cancelled) setLoad('ready')
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [transport, sid, mock, reloadKey])

  // 欢迎页 chip 发送失败的回填草稿（§6.2.1：不丢用户输入）
  const initialDraft = (location.state as { draft?: string } | null)?.draft ?? ''

  // 压缩完成轻提示（工单 4.3）：compacting true→false 沿变时显示 2.5s（§6.4 细条）
  const [compactDone, setCompactDone] = useState(false)
  const wasCompacting = useRef(false)
  useEffect(() => {
    const finished = wasCompacting.current && !compacting
    wasCompacting.current = compacting
    if (!finished) return
    setCompactDone(true)
    const t = setTimeout(() => setCompactDone(false), 2500)
    return () => clearTimeout(t)
  }, [compacting])

  // TurnStatusBar props：运行中工具名从 items 推导（activeTurn.runningTools 是 CallId 集）
  const turnProp = useMemo(() => {
    if (turn === null) return null
    const runningTools = items.flatMap((i) =>
      i.kind === 'tool' && i.status === 'running' ? [i.name] : [],
    )
    return { turnId: turn.turnId, stepCount: turn.stepCount, runningTools, waiting: turn.waiting }
  }, [turn, items])

  async function switchScenario(s: MockScenario) {
    if (s === scenario) return
    setScenario(s)
    const dto = await transport.createSession()
    // 场景脚本的 sessionId 固定——切回同场景会命中旧 slice（含上次挂起的审批）。
    // 切场景即重放开端：清掉旧 slice，UI 不残留僵尸审批卡（transport 已重置）。
    useSessionStore.getState().resetSlice(ids.session(dto.id))
    void navigate(`/session/${dto.id}`, { replace: true })
  }

  /** error finish 重试：重发最后一条 user.message（§6.2.2 状态矩阵） */
  async function retryLastMessage() {
    const text = [...items].reverse().find((i) => i.kind === 'user')
    if (text !== undefined && text.kind === 'user') await transport.sendMessage(sid, text.text)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {mock && (
        <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-border px-3">
          {/* 开发夹具：断线重连条 mock 走查开关（真实断线由 HttpTransport 状态机驱动，阶段三） */}
          <button
            type="button"
            onClick={() => setConnStatus(connStatus === 'open' ? 'reconnecting' : 'open')}
            title="开发夹具：模拟连接断开/恢复"
            className={
              'h-6 rounded-md px-2 font-mono text-xs ' +
              (connStatus === 'open'
                ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                : 'bg-primary text-primary-foreground')
            }
          >
            {connStatus === 'open' ? '模拟断线' : '恢复连接'}
          </button>
          {MOCK_SCENARIOS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void switchScenario(s)}
              className={
                'h-6 rounded-md px-2 font-mono text-xs ' +
                (s === scenario
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')
              }
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 px-6 py-3">
        <div className="mx-auto h-full max-w-2xl">
          <div className="relative h-full">
            {/* 顶部悬浮细条组（§6.2.2：TurnStatusBar / compaction / error finish 黄条） */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 pt-1">
              <div className="pointer-events-auto">
                <TurnStatusBar turn={turnProp} />
              </div>
              {compacting && (
                <div className="rounded-md border border-border bg-background/95 px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
                  上下文压缩中…
                </div>
              )}
              {!compacting && compactDone && (
                <div className="rounded-md border border-border bg-background/95 px-2.5 py-0.5 font-mono text-xs text-[var(--spark-accent)]">
                  上下文已压缩
                </div>
              )}
              {topBanner !== null && (
                <div className="pointer-events-auto flex h-7 items-center gap-2 rounded-md border border-[var(--spark-warn)]/40 bg-[var(--spark-warn)]/[0.06] px-2.5 text-xs">
                  <span className="text-[var(--spark-warn)]">本轮以 error 结束</span>
                  <button
                    type="button"
                    onClick={() => void retryLastMessage()}
                    className="rounded-md border border-border px-2 py-0.5 hover:bg-accent"
                  >
                    重试
                  </button>
                </div>
              )}
            </div>
            {load === 'loading' ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                加载会话…
              </div>
            ) : typeof load === 'object' ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
                <p className="font-mono text-xs text-[var(--spark-warn)]">{load.error}</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="h-7 rounded-md border border-border px-3 text-[13px] hover:bg-accent"
                >
                  重试
                </button>
              </div>
            ) : (
              <ChatView sessionId={sessionId ?? ''} />
            )}
            <ErrorToast sid={sid} />
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-6 py-3">
        <div className="mx-auto max-w-2xl">
          <Composer
            busy={busy}
            waiting={waiting}
            initialDraft={initialDraft}
            onSend={(text, delivery, attachments) =>
              transport.sendMessage(sid, text, {
                delivery,
                ...(attachments ? { attachments } : {}),
              })
            }
            onInterrupt={() => void transport.interrupt(sid)}
            onCompact={() => transport.compact(sid)}
          />
        </div>
      </div>
    </div>
  )
}
