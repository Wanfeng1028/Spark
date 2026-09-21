/**
 * 会话页形态（工单 19.36 自 routes/SessionPage.tsx 参数化抽出；规格见该文件头注释与
 * doc/02 §6.2.2 / DESIGN §13.A）：同一份实现两种形态——
 * - `page`：路由主区（内容列 768px 居中 + mock 场景夹具 + 登记「当前会话」）；
 * - `drawer`：辅助会话抽屉内的第二个实例（占满抽屉宽度，夹具条与「当前会话」登记关闭）。
 *
 * 两实例并存的铁律是**互不串流**（工单 19.36 验收）：
 * ① 投影按 sessionId 分片（session store 的 byId），各自只回放/只渲染自己那条会话；
 * ② drawer 不写 `setActiveId`——侧栏状态点、StatusBar、Composer 水位里的「当前会话」
 *    永远指主区那条，辅助会话不得劫持（劫持即串流）；
 * ③ drawer 不吃 `sessionDialogRequest` / `effortCycleSeq` 这两个一次性全局信号——
 *    它们由命令面板发给主会话，两个实例都消费会出现「主会话开检查点框、抽屉也开一个」。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { useNavigate } from 'react-router'
import { Activity, FolderGit2, GitBranch, History, MessagesSquare, X } from 'lucide-react'
import { ids } from '@spark/protocol'
import type { PermissionPreset, ReasoningEffort, SessionId } from '@spark/protocol'
import { useTransport, replaySessionEvents } from '@/transports/context'
import { MOCK_SCENARIOS, MockTransport } from '@/transports/mock'
import type { MockScenario } from '@/transports/mock'
import { ChatView } from '@/features/chat/ChatView'
import { ArenaCard } from '@/features/chat/ArenaCard'
import { Composer } from '@/features/chat/Composer'
import { clientActionOf } from '@/features/chat/client-commands'
import { TurnStatusBar } from '@/features/chat/TurnStatusBar'
import { ErrorToast } from '@/features/chat/ErrorToast'
import { cn } from '@/lib/utils'
import { ErrorBanner } from '@/features/chat/ErrorBanner'
import { SessionTreeDialog } from '@/features/chat/SessionTreeDialog'
import { TraceDialog } from '@/features/chat/TraceDialog'
import { CheckpointDialog } from '@/features/chat/CheckpointDialog'
import { projectOf } from '@/components/layout/Sidebar'
import { hasCachedProjection, useActiveTurn, useSessionItems, useSessionStore } from '@/stores/session'
import { useConnectionStore } from '@/stores/connection'
import { useModelsStore } from '@/stores/models-store'
import { useCommands } from '@/hooks/useCommands'
import { useUiStore } from '@/stores/ui'
import { useTransportQuery } from '@/hooks/useTransportQuery'

/** 打开会话：GET 全量 durable → resetSlice → 批量 apply（§6.10 时序①；mock 流式夹具不走此路径） */
type LoadState = 'loading' | 'ready' | { error: string }

export interface SessionSurfaceProps {
  sessionId: SessionId
  /** 形态：主区页 / 辅助抽屉实例（缺省 page，路由适配器与旧调用零改动） */
  variant?: 'page' | 'drawer'
  /** 搜索跳转定位（工单 7.13，仅 page 形态由路由传入） */
  focusEventId?: string
  /** 欢迎页 chip 发送失败回填的草稿（§6.2.1，仅 page 形态） */
  initialDraft?: string
  /** drawer 形态的关闭钮（AppShell 传 closeAux）；page 形态不渲染 */
  onClose?: () => void
  /** drawer 形态的「换一条辅助会话」入口（回选择器）；page 形态不渲染 */
  onSwitchSession?: () => void
}

export function SessionSurface({
  sessionId: sid,
  variant = 'page',
  focusEventId,
  initialDraft = '',
  onClose,
  onSwitchSession,
}: SessionSurfaceProps) {
  const isPage = variant === 'page'
  const navigate = useNavigate()
  const { transport, mock, scenario, setScenario } = useTransport()
  const { commands } = useCommands()
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const openAux = useUiStore((s) => s.openAux)

  const turn = useActiveTurn(sid)
  const items = useSessionItems(sid)
  const topBanner = useSessionStore((s) => s.byId[sid]?.topBanner ?? null)
  const compacting = useSessionStore((s) => s.byId[sid]?.compacting ?? false)
  // 顶栏数据：标题/项目/分支来自 slice.meta（事件流推导；undefined = 尚未加载/取不到）
  const sliceTitle = useSessionStore((s) => s.byId[sid]?.meta.title)
  const sliceCwd = useSessionStore((s) => s.byId[sid]?.meta.cwd)
  const sliceBranch = useSessionStore((s) => s.byId[sid]?.meta.branch)
  const sliceEffort = useSessionStore((s) => s.byId[sid]?.meta.effort)
  const connStatus = useConnectionStore((s) => s.status)
  const setConnStatus = useConnectionStore((s) => s.setStatus)
  // http 打开态（加载/错误呈现；mock 即挂即用）。函数式初值防 sid 切换时沿用旧态；
  // 工单 10.16：缓存会话（投影已在 store）初值即 ready，不进加载白屏
  const [load, setLoad] = useState<LoadState>(() =>
    mock || hasCachedProjection(useSessionStore.getState().byId[sid]) ? 'ready' : 'loading',
  )
  const [reloadKey, setReloadKey] = useState(0)
  // 会话树浮层（工单 4.5）：分叉入口 + 树视图
  const [treeOpen, setTreeOpen] = useState(false)
  // 命令面板对话框/档位信号（阶段十九 19.21：/checkpoint /tree /effort）——只属于主区实例
  const dialogRequest = useUiStore((s) => s.sessionDialogRequest)
  const clearDialogRequest = useUiStore((s) => s.clearSessionDialogRequest)
  const effortCycleSeq = useUiStore((s) => s.effortCycleSeq)
  // 链路浮层（工单 13.7）：回合级聚合——时长/步与 token/工具调用与重试/护栏告警
  const [traceOpen, setTraceOpen] = useState(false)
  // 检查点浮层（工单 4.6）：快照列表 + 回滚入口；turn 进行中回滚按钮禁用
  const [ckptOpen, setCkptOpen] = useState(false)

  // 一次性信号消费（19.21）：dialogRequest 非空 → 开对应对话框并清信号；
  // effortCycleSeq 变化 → 按 low→medium→high→null(provider 缺省) 循环
  useEffect(() => {
    if (!isPage || dialogRequest === null) return
    if (dialogRequest === 'checkpoint') setCkptOpen(true)
    else setTreeOpen(true)
    clearDialogRequest()
  }, [dialogRequest, clearDialogRequest, isPage])

  // 权限档位（§13.E 四档）。null = 复位中/未装载（AUD-14：sid 切换即清，杜绝旧会话
  // 档位串台）；装载失败保持缺省档 confirm-each——与引擎缺省一致且最安全
  // （fail-closed 方向），切档失败由 Composer hint 如实反馈
  const [preset, setPreset] = useState<PermissionPreset | null>('confirm-each')
  // 当前会话模式（工单 16.3）：durable 事件投影，也是档位重读的信号源（见下）
  const sliceMode = useSessionStore((s) => s.byId[sid]?.mode)
  // 档位装载（R-E① 二批）：错误不渲染（缺省 confirm-each 即引擎缺省，fail-closed
  // 方向最安全），但如实进控制台（AUD-14：不再纯静默；UI 不打断）。
  // deps 带 sliceMode（工单 16.3）：模型经 exit_plan_mode 退出计划模式时档位是**引擎侧**改的，
  // 本地 state 不重读就会继续显示"计划模式"档（假状态）——模式事件到达即重拉一次
  const { data: presetLoaded, error: presetError } = useTransportQuery(
    (t) => t.getPermissionPreset(sid),
    [sid, sliceMode],
  )
  useEffect(() => {
    if (presetError !== null) {
      console.warn('[session] 权限档位装载失败，保持缺省档 confirm-each：', presetError)
    }
  }, [presetError])
  useEffect(() => {
    if (presetLoaded !== null) setPreset(presetLoaded)
  }, [presetLoaded])

  // 模型管理（工单 6.5）：目录一次装载（models-store 缓存，与 StatusBar 水位共用）；
  // 当前模型以 slice.meta 为基线 + 换模型内存覆盖。装载失败不渲染选择器（禁假状态）
  const models = useModelsStore((s) => s.dto)
  useEffect(() => {
    useModelsStore.getState().load(transport)
  }, [transport])
  const sliceModel = useSessionStore((s) => s.byId[sid]?.meta.model)
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  // 推理档位覆盖（工单 10.6）：引擎内存态不持久，与换模型同纪律
  const [effortOverride, setEffortOverride] = useState<ReasoningEffort | null>(null)
  // 会话切换：换模型/档位覆盖归零（新会话以 slice.meta 为准）；
  // AUD-14：权限档位一并复位（null = 未装载），新会话档位装载成功前不显示旧会话的值
  useEffect(() => {
    setModelOverride(null)
    setEffortOverride(null)
    setPreset(null)
  }, [sid])

  // /effort 循环（阶段十九 19.21）：low → medium → high → provider 缺省（null）
  useEffect(() => {
    if (!isPage || effortCycleSeq === 0) return
    const order: (ReasoningEffort | null)[] = ['low', 'medium', 'high', null]
    const cur = effortOverride ?? sliceEffort ?? null
    const next = order[(order.indexOf(cur) + 1) % order.length] ?? null
    setEffortOverride(next)
    // effortOverride/sliceEffort 刻意不入依赖：只在序号变化时循环（入依赖会把切会话复位当一次循环）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effortCycleSeq, isPage])

  const busy = turn !== null
  const waiting = turn?.waiting === true

  // 路由激活 + 冷启动回放：StatusBar/Sidebar 的「当前会话」数据源。
  // 工单 19.36：只主区实例登记——辅助会话不劫持「当前会话」（侧栏状态点/水位仍属主会话）
  useEffect(() => {
    if (isPage) useSessionStore.getState().setActiveId(sid)
  }, [sid, isPage])

  useEffect(() => {
    // mock：脚本会话走流式回放（全量 replay 会剧透未回放事件）；fork 子会话无流，走全量回放
    if (mock && transport instanceof MockTransport && transport.isLiveScriptSession(sid)) return
    let cancelled = false
    // 工单 10.16：缓存会话（lastSeq>0）原位即时渲染，后台全量回放取回后同步覆写对齐——
    // 不先 resetSlice、不闪空；仅 lastSeq===0 的真冷会话进加载态。错误态切换也经此复位
    if (hasCachedProjection(useSessionStore.getState().byId[sid])) setLoad('ready')
    else setLoad('loading')
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

  /** 内容列：主区 768px 居中（§13.A），抽屉实例占满抽屉宽（Composer 自带 max-[479px] 兜底） */
  const colClass = isPage ? 'mx-auto h-full max-w-[768px]' : 'h-full w-full'
  const composerColClass = isPage ? 'mx-auto max-w-[768px]' : 'w-full'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶栏 44px（§13.A）：会话标题（13px semibold 截断）+ 项目 chip（24px，cwd 目录名）
          + 分支 chip（工单 10.6：创建时 git 只读探测真值；取不到不渲染，禁假状态）。
          drawer 形态追加：换一条 / 关闭（工单 19.36） */}
      <header
        className={cn(
          'flex h-11 shrink-0 items-center gap-2 border-b border-border',
          isPage ? 'px-4' : 'px-3',
        )}
      >
        <h1 className="min-w-0 shrink truncate text-[13px] font-semibold">
          {sliceTitle === undefined ? '…' : sliceTitle === '' ? '新会话' : sliceTitle}
        </h1>
        {isPage && sliceCwd !== undefined && sliceCwd !== '' && (
          <Badge variant="outline" title={`工作区：${sliceCwd}`}>
            <FolderGit2 className="size-3" />
            {projectOf(sliceCwd)}
          </Badge>
        )}
        {isPage && sliceBranch !== undefined && sliceBranch !== '' && (
          <Badge variant="outline" className="font-mono" title={`git 分支（会话创建时探测）：${sliceBranch}`}>
            <GitBranch className="size-3" />
            {sliceBranch}
          </Badge>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* 辅助会话入口（工单 19.36）：只在主区实例出现——抽屉里不再开抽屉 */}
          {isPage && (
            <button
              type="button"
              aria-label="辅助会话"
              title="辅助会话（在右侧抽屉另开一个会话，与主会话并发）"
              onClick={openAux}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <MessagesSquare className="size-4" />
            </button>
          )}
          {/* 链路入口（工单 13.7）：只读聚合视图，turn 进行中也可看（已完成回合） */}
          <button
            type="button"
            aria-label="会话链路"
            title="会话链路"
            onClick={() => setTraceOpen(true)}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Activity className="size-4" />
          </button>
          {/* 会话树入口（工单 4.5）：turn 进行中仍可查看，分叉按钮在浮层内禁用 */}
          <button
            type="button"
            aria-label="会话树"
            title="会话树"
            onClick={() => setTreeOpen(true)}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <GitBranch className="size-4" />
          </button>
          {/* 检查点入口（工单 4.6）：回滚动作在浮层内 */}
          <button
            type="button"
            aria-label="检查点"
            title="检查点"
            onClick={() => setCkptOpen(true)}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <History className="size-4" />
          </button>
          {!isPage && onSwitchSession !== undefined && (
            <button
              type="button"
              aria-label="换一条辅助会话"
              title="换一条辅助会话"
              onClick={onSwitchSession}
              className="flex h-7 shrink-0 items-center rounded-full border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              换一条
            </button>
          )}
          {/* 关闭抽屉（工单 19.36）：只收面板——在途 turn 由引擎继续跑，事件仍进全局 store */}
          {!isPage && onClose !== undefined && (
            <button
              type="button"
              aria-label="关闭辅助会话"
              title="关闭辅助会话（在途回合不中断）"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      {isPage && mock && (
        <div className="flex h-6 shrink-0 items-center justify-end gap-1 border-b border-border px-3">
          {/* 开发夹具：断线重连条 mock 走查开关（真实断线由 HttpTransport 状态机驱动，阶段三） */}
          <button
            type="button"
            onClick={() => setConnStatus(connStatus === 'open' ? 'reconnecting' : 'open')}
            title="开发夹具：模拟连接断开/恢复"
            className={
              'h-5 rounded-full px-2 font-mono text-xs ' +
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
                'h-5 rounded-full px-2 font-mono text-xs ' +
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

      <div className={cn('min-h-0 flex-1', isPage ? 'px-6 py-3' : 'px-3 py-2')}>
        <div className={colClass}>
          <div className="relative h-full">
            {/* 顶部悬浮细条组（§6.2.2：TurnStatusBar / compaction / error finish 黄条） */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 pt-1">
              <div className="pointer-events-auto">
                <TurnStatusBar turn={turnProp} />
              </div>
              {compacting && (
                <div className="rounded-full border border-border bg-background/95 px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
                  上下文压缩中…
                </div>
              )}
              {!compacting && compactDone && (
                <div className="rounded-full border border-border bg-background/95 px-2.5 py-0.5 font-mono text-xs text-[var(--spark-accent)]">
                  上下文已压缩
                </div>
              )}
              {topBanner !== null && (
                <div className="pointer-events-auto flex h-7 items-center gap-2 rounded-full border border-[var(--spark-warn)]/40 bg-[var(--spark-warn)]/[0.06] px-2.5 text-xs">
                  <span className="text-[var(--spark-warn)]">本轮以 error 结束</span>
                  <button
                    type="button"
                    onClick={() => void retryLastMessage()}
                    className="rounded-full border border-border px-2 py-0.5 hover:bg-accent"
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
                {/* 工单 6.7：错误人话化——文案表单一来源（E_MOCK_UNKNOWN_SESSION 等），原码折叠详情 */}
                <ErrorBanner
                  message={load.error}
                  onRetry={() => setReloadKey((k) => k + 1)}
                  retryLabel="重新加载会话"
                />
              </div>
            ) : (
              <>
                {/* 竞答卡片（工单 16.8 / ADR D42）：有竞答快照才渲染（组件内轮询，null 不渲染） */}
                <ArenaCard sessionId={sid} />
                <ChatView sessionId={sid} {...(focusEventId !== undefined ? { focusEventId } : {})} />
              </>
            )}
            <SessionTreeDialog open={treeOpen} onOpenChange={setTreeOpen} sid={sid} busy={busy} />
            <TraceDialog open={traceOpen} onOpenChange={setTraceOpen} sid={sid} />
            <CheckpointDialog open={ckptOpen} onOpenChange={setCkptOpen} sid={sid} busy={busy} />
            <ErrorToast sid={sid} />
          </div>
        </div>
      </div>

      {/* §13.L L.6：DSH 输入卡浮在底色上——无顶部分隔线，顶部留白收小让卡贴近滚动区 */}
      <div className={cn('shrink-0', isPage ? 'px-6 pb-3 pt-2' : 'px-3 pb-2 pt-1')}>
        {/* WO-010：会话加载失败时禁用 Composer——错误态下发送会让事件落入无关会话 */}
        <div className={cn(composerColClass, typeof load === 'object' && 'pointer-events-none opacity-50')}>
          {/* 上下文水位只留 StatusBar 百分比（工单 10.5⑦，待拍板 a 按建议执行：大条与
              StatusBar 重复、ZCode 无此元素——UsageBar 组件停用，文件删除留人工确认） */}
          <Composer
            busy={busy}
            waiting={waiting}
            sessionId={sid}
            initialDraft={initialDraft}
            folder={
              isPage && sliceCwd !== undefined && sliceCwd !== ''
                ? { label: projectOf(sliceCwd), cwd: sliceCwd }
                : undefined
            }
            permission={{
              preset: preset ?? 'confirm-each',
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
            effort={{
              current: effortOverride ?? sliceEffort,
              onChange: (v) =>
                transport.setSessionEffort(sid, v).then((applied) => {
                  setEffortOverride(applied)
                  return applied
                }),
            }}
            onSend={(text, delivery, attachments) =>
              transport.sendMessage(sid, text, {
                delivery,
                ...(attachments ? { attachments } : {}),
              })
            }
            onInterrupt={() => void transport.interrupt(sid)}
            {...(commands !== null ? { commands } : {})}
            onCommand={(name, args) => {
              // 命令分发（工单 7.4）：client 命令本地执行（导航/面板）；
              // action（compact）/prompt（自定义 .md）走引擎统一入口
              const client = clientActionOf(name)
              if (client !== undefined) {
                if (client.kind === 'palette') setPaletteOpen(true)
                else if (client.kind === 'voice') useUiStore.getState().cycleVoiceMode()
                else void navigate(client.path)
                return
              }
              return transport.executeCommand(sid, name, args === '' ? undefined : args)
            }}
          />
        </div>
      </div>
    </div>
  )
}
