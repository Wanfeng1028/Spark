/**
 * 工作台 /session/:id（doc/02 §6.2.2 / DESIGN §13.A）：顶栏 44px（标题 13px semibold +
 * 项目 chip，分支 chip 暂无数据源不渲染）+ ChatView 虚拟化会话流（内容列 768px 居中）+
 * Composer 沉底（768px）。事件 → store 接线在 TransportProvider（applyEvent 唯一写入口）；
 * 本页只消费选择器。顶部悬浮：TurnStatusBar（进行中指示）· compaction 细条 · error finish
 * 黄条+重试（重发最后一条 user.message）。右下 ErrorToast（error 事件；fatal 全屏态）。
 * mock 场景条 + 「模拟断线」开关是开发夹具（阶段验收要求断线重连条在 mock 下可走查）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { FolderGit2, GitBranch, History } from 'lucide-react'
import { ids } from '@spark/protocol'
import type { ModelsDto, PermissionPreset } from '@spark/protocol'
import { useTransport, replaySessionEvents } from '@/transports/context'
import { MOCK_SCENARIOS, MockTransport } from '@/transports/mock'
import type { MockScenario } from '@/transports/mock'
import { ChatView } from '@/features/chat/ChatView'
import { Composer } from '@/features/chat/Composer'
import { TurnStatusBar } from '@/features/chat/TurnStatusBar'
import { ErrorToast } from '@/features/chat/ErrorToast'
import { SessionTreeDialog } from '@/features/chat/SessionTreeDialog'
import { CheckpointDialog } from '@/features/chat/CheckpointDialog'
import { projectOf } from '@/components/layout/Sidebar'
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
  // 顶栏数据：标题/项目来自 slice.meta（事件流推导；undefined = 尚未加载）
  const sliceTitle = useSessionStore((s) => s.byId[sid]?.meta.title)
  const sliceCwd = useSessionStore((s) => s.byId[sid]?.meta.cwd)
  const connStatus = useConnectionStore((s) => s.status)
  const setConnStatus = useConnectionStore((s) => s.setStatus)
  // http 打开态（加载/错误呈现；mock 即挂即用）。函数式初值防 sid 切换时沿用旧态
  const [load, setLoad] = useState<LoadState>(() => (mock ? 'ready' : 'loading'))
  const [reloadKey, setReloadKey] = useState(0)
  // 会话树浮层（工单 4.5）：分叉入口 + 树视图
  const [treeOpen, setTreeOpen] = useState(false)
  // 检查点浮层（工单 4.6）：快照列表 + 回滚入口；turn 进行中回滚按钮禁用
  const [ckptOpen, setCkptOpen] = useState(false)
  // 权限档位（§13.E 四档；会话级内存态）。装载失败保持缺省档 confirm-each——
  // 与引擎缺省一致且最安全（fail-closed 方向），切档失败由 Composer hint 如实反馈
  const [preset, setPreset] = useState<PermissionPreset>('confirm-each')
  useEffect(() => {
    let cancelled = false
    transport
      .getPermissionPreset(sid)
      .then((p) => {
        if (!cancelled) setPreset(p)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [transport, sid])

  // 模型管理（工单 6.5）：目录一次装载；当前模型以 slice.meta 为基线 + 换模型内存覆盖。
  // 装载失败不渲染选择器（禁假状态），失败静默——重进会话即重试
  const [models, setModels] = useState<ModelsDto | null>(null)
  const sliceModel = useSessionStore((s) => s.byId[sid]?.meta.model)
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    transport
      .listModels()
      .then((m) => {
        if (!cancelled) setModels(m)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [transport])
  // 会话切换：换模型覆盖归零（新会话以 slice.meta 为准）
  useEffect(() => {
    setModelOverride(null)
  }, [sid])

  const busy = turn !== null
  const waiting = turn?.waiting === true

  // 路由激活 + 冷启动回放：StatusBar/Sidebar 的「当前会话」数据源
  useEffect(() => {
    useSessionStore.getState().setActiveId(sid)
  }, [sid])

  useEffect(() => {
    // mock：脚本会话走流式回放（全量 replay 会剧透未回放事件）；fork 子会话无流，走全量回放
    if (mock && transport instanceof MockTransport && transport.isLiveScriptSession(sid)) return
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
      {/* 顶栏 44px（§13.A）：会话标题（13px semibold 截断）+ 项目 chip（24px，cwd 目录名）；
          分支 chip 无数据源（事件流/DTO 不含 git 分支）暂不渲染，禁假状态 */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <h1 className="min-w-0 shrink truncate text-[13px] font-semibold">
          {sliceTitle === undefined ? '…' : sliceTitle === '' ? '新会话' : sliceTitle}
        </h1>
        {sliceCwd !== undefined && sliceCwd !== '' && (
          <span
            className="flex h-6 shrink-0 items-center gap-1 rounded-full border border-border px-2 text-[11px] text-muted-foreground"
            title={`工作区：${sliceCwd}`}
          >
            <FolderGit2 className="size-3" />
            {projectOf(sliceCwd)}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* 会话树入口（工单 4.5）：turn 进行中仍可查看，分叉按钮在浮层内禁用 */}
          <button
            type="button"
            aria-label="会话树"
            title="会话树"
            onClick={() => setTreeOpen(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <GitBranch className="size-4" />
          </button>
          {/* 检查点入口（工单 4.6）：回滚动作在浮层内 */}
          <button
            type="button"
            aria-label="检查点"
            title="检查点"
            onClick={() => setCkptOpen(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <History className="size-4" />
          </button>
        </div>
      </header>

      {mock && (
        <div className="flex h-6 shrink-0 items-center justify-end gap-1 border-b border-border px-3">
          {/* 开发夹具：断线重连条 mock 走查开关（真实断线由 HttpTransport 状态机驱动，阶段三） */}
          <button
            type="button"
            onClick={() => setConnStatus(connStatus === 'open' ? 'reconnecting' : 'open')}
            title="开发夹具：模拟连接断开/恢复"
            className={
              'h-5 rounded-md px-2 font-mono text-xs ' +
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
                'h-5 rounded-md px-2 font-mono text-xs ' +
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
        <div className="mx-auto h-full max-w-[768px]">
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
            <SessionTreeDialog open={treeOpen} onOpenChange={setTreeOpen} sid={sid} busy={busy} />
            <CheckpointDialog open={ckptOpen} onOpenChange={setCkptOpen} sid={sid} busy={busy} />
            <ErrorToast sid={sid} />
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-6 py-3">
        <div className="mx-auto max-w-[768px]">
          <Composer
            busy={busy}
            waiting={waiting}
            initialDraft={initialDraft}
            permission={{
              preset,
              onChange: (p) =>
                transport.setPermissionPreset(sid, p).then(() => {
                  setPreset(p)
                }),
            }}
            model={
              models !== null && sliceModel !== undefined && sliceModel !== ''
                ? {
                    current: modelOverride ?? sliceModel,
                    models: models.models,
                    providers: models.providers,
                    onChange: (m) =>
                      transport.setSessionModel(sid, m).then((applied) => {
                        setModelOverride(applied)
                        return applied
                      }),
                  }
                : undefined
            }
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
