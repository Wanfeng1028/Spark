/**
 * CLI 主组件（工单 10.43 拆分后=组装壳）：store 订阅 / 派生态 / 优雅退出 / 清屏机制 /
 * 渲染组装。职责分布：全局键位=hooks/use-cli-keys；会话事件流=hooks/use-session-stream；
 * 会话与命令操作=hooks/use-cli-actions；消息流=components/MessagePane。
 */
import { Box, Text, useApp, useStdout, useWindowSize } from 'ink'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { HttpTransport, humanizeError } from '@spark/protocol'
import type { FsEntryDto, RequestId } from '@spark/protocol'
import { useCliStore } from './store.js'
import { InputBox, type InputBoxHandle } from './components/InputBox.js'
import { Footer } from './components/Footer.js'
import { BootHeader } from './components/BootHeader.js'
import { LoadingIndicator } from './components/LoadingIndicator.js'
import { ApprovalPrompt } from './components/ApprovalPrompt.js'
import type { ApprovalItem } from './components/ApprovalPrompt.js'
import { SlashMenu, SLASH_PAGE_SIZE } from './components/SlashMenu.js'
import { FsMenu, FS_PAGE_SIZE, parseAtToken } from './components/FsMenu.js'
import { useCliKeys } from './hooks/use-cli-keys.js'
import { useFsCompletion } from './hooks/use-fs-completion.js'
import { useSessionStream } from './hooks/use-session-stream.js'
import { PanelRouter } from './components/PanelRouter.js'
import { useSlashMenu } from './hooks/use-slash-menu.js'
import { useResumePanel } from './hooks/use-resume-panel.js'
import { useCliActions } from './hooks/use-cli-actions.js'

export function App({ baseUrl }: { baseUrl: string }) {
  const { exit } = useApp()
  const { stdout } = useStdout() // clearScreen 写 ANSI 用（尺寸改由 useWindowSize 提供）
  // 终端尺寸（工单 10.17③ resize 即时重排 · 10.56 §6：useWindowSize 原生封装——内部订阅
  // stdout resize 自动重渲，替代原手搓 columns/rows 读取 + resize nonce 监听）
  const { columns, rows } = useWindowSize()

  // REST-only transport（事件流走会话级 SessionEventSource——since=seq 续播，工单 8.4）
  const transport = useMemo(() => new HttpTransport({ baseUrl, eventStream: false }), [baseUrl])
  const exitingRef = useRef(false)

  const activeSessionId = useCliStore((s) => s.activeSessionId)
  const connStatus = useCliStore((s) => s.status)
  const delivery = useCliStore((s) => s.delivery)
  const notice = useCliStore((s) => s.notice)
  const panel = useCliStore((s) => s.panel)
  const sessions = useCliStore((s) => s.sessions)
  const models = useCliStore((s) => s.models)
  const commands = useCliStore((s) => s.commands)
  const draftPreview = useCliStore((s) => s.draftPreview)
  const bootError = useCliStore((s) => s.bootError)
  const replayNonce = useCliStore((s) => s.replayNonce)
  const slice = useCliStore((s) =>
    s.activeSessionId === null ? null : (s.byId[s.activeSessionId] ?? null),
  )

  /** 挂起审批（至多一条待答——引擎审批串行；取第一条 pending） */
  const pendingApproval = useMemo(
    () =>
      (slice?.items.find(
        (it): it is ApprovalItem => it.kind === 'approval' && it.status === 'pending',
      ) ?? null),
    [slice],
  )

  /** 拒绝反馈模式（3 之后展开——工单 8.3/10.9） */
  const [rejecting, setRejecting] = useState<RequestId | null>(null)
  // ---------- slash 菜单派生态（R-G②：use-slash-menu hook） ----------

  const slash = useSlashMenu(panel, draftPreview, commands)
  const slashItems = slash.items
  const slashSelected = slash.selected
  const setSlashSelected = slash.setSelected
  const slashOpen = slash.open

  // ---------- @ 文件路径补全派生态（工单 10.53）：尾部 @ token 触发，cwd 目录列举 ----------

  // 与 slash 互斥（草稿不会同时以 / 开头又以 @ 尾词触发）；panel!=='none' 时不触发
  const atToken = panel === 'none' ? parseAtToken(draftPreview) : null
  const fsQuery = atToken === null ? null : atToken.query
  const fsItems = useFsCompletion(transport, activeSessionId, fsQuery)
  const [fsSelected, setFsSelected] = useState(0)
  // Esc 关闭后的隐藏位（过滤词变化重现——同 slashSelected 回位机制）
  const [fsHidden, setFsHidden] = useState(false)
  useEffect(() => {
    setFsSelected(0)
    setFsHidden(false)
  }, [fsQuery])
  const fsOpen = atToken !== null && !fsHidden && fsItems.length > 0
  // @ 补全回写句柄（工单 10.53）：InputBox 提交前会清空自身，故用 onSubmit 传入的 text 解析 token
  const inputRef = useRef<InputBoxHandle>(null)
  const acceptFsEntry = useCallback((baseText: string, entry: FsEntryDto): void => {
    const tok = parseAtToken(baseText)
    if (tok === null) return
    // qwen 口径：目录补全后不关闭不加尾空格（继续下钻）；文件加尾空格并关闭（尾部空白使 token 失效）
    const suffix = entry.isDir ? '/' : ' '
    inputRef.current?.setValue(`${baseText.slice(0, tok.start)}@${entry.path}${suffix}`)
  }, [])

  // ---------- /resume 面板派生态（R-G②：use-resume-panel hook） ----------

  const resume = useResumePanel(panel, draftPreview, sessions)
  const resumeFiltered = resume.filtered
  const resumeSelected = resume.selected
  const setResumeSelected = resume.setSelected
  const resumePreview = resume.preview
  const setResumePreview = resume.setPreview

  // ---------- 清屏 + Static 重挂（工单 10.38/10.40，qwen refreshStatic 同款） ----------

  // ANSI 清屏归位（2J 视口 + 3J scrollback + H 归位——缺 3J 输出会插在旧消息中间）
  // + staticEpoch++，BootHeader 首项与历史整屏重印——"回到欢迎首屏"统一机制
  const [staticEpoch, setStaticEpoch] = useState(0)
  const clearScreen = useCallback((): void => {
    stdout?.write('\x1b[2J\x1b[3J\x1b[H')
    setStaticEpoch((n) => n + 1)
  }, [stdout])

  // ---------- 优雅退出（工单 8.4：无悬挂 turn） ----------

  const quit = useMemo(
    () => (): void => {
      if (exitingRef.current) return
      exitingRef.current = true
      const sid = useCliStore.getState().activeSessionId
      const turn = sid === null ? null : (useCliStore.getState().byId[sid]?.activeTurn ?? null)
      const done = (): void => {
        transport.dispose()
        exit()
      }
      if (sid !== null && turn !== null) {
        // 在途 turn 先中断再退——不悬挂（失败不阻塞退出）
        void transport.interrupt(sid).finally(done)
      } else {
        done()
      }
    },
    [transport, exit],
  )

  useEffect(() => {
    process.on('SIGINT', quit)
    return () => {
      process.removeListener('SIGINT', quit)
    }
  }, [quit])

  // ---------- 动作 / 事件流 / 全局键位（10.43 抽取的 hooks） ----------

  const actions = useCliActions({ transport, clearScreen, resumeFiltered, resumeSelected })
  // 启动流程（10.43 重构回补：listSessions/createSession/models/commands 装载）
  useEffect(() => actions.boot(), [actions])
  useSessionStream(baseUrl, transport)

  const lastFailedRef = useRef<string | null>(null)
  useCliKeys({
    transport,
    boot: actions.boot,
    quit,
    resumeFiltered,
    resumeSelected,
    setResumeSelected,
    slashOpen,
    slashItems,
    slashSelected,
    setSlashSelected,
    fsOpen,
    fsCount: fsItems.length,
    fsSelected,
    setFsSelected,
    onFsDismiss: () => setFsHidden(true),
    lastFailedRef,
    pendingApproval,
    rejecting,
    setRejecting,
    actions: {
      replyApproval: actions.replyApproval,
      newSession: actions.newSession,
      switchSession: actions.switchSession,
      confirmResume: actions.confirmResume,
    },
    panel,
    draftPreview,
  })

  // ---------- 提示行：REST 失败优先；引擎 error 事件人话化（共享文案表，§13.K K.8） ----------

  // 已加载项目指引路径（10.49 状态行——qwen Read context files 同款）；查找逻辑与
  // engine locateProjectInstructions 同构（不引 engine——避免 CLI 依赖树膨胀）
  const agentsPath = useMemo(() => {
    const cwd = slice?.meta.cwd
    if (cwd === undefined || cwd === '') return null
    let dir = dirname(resolve(cwd))
    const home = homedir()
    while (true) {
      const p = join(dir, 'AGENTS.md')
      if (existsSync(p)) return p
      if (dir === home || dir === dirname(dir)) break
      dir = dirname(dir)
    }
    return null
  }, [slice])

  const errorInfo = useMemo(() => {
    if (notice !== null) return { title: notice, code: null as string | null, detail: null as string | null }
    const le = slice?.lastError
    if (le !== undefined && le !== null) return humanizeError(le.message)
    return null
  }, [notice, slice])

  const inputActive = pendingApproval === null || rejecting !== null
  // 输入框只在主界面与 resume 过滤态激活（其余面板 ↑↓/Enter 归面板——键位分层）
  const inputBoxActive = inputActive && (panel === 'none' || panel === 'resume')

  /**
   * live 区行数预算（工单 10.33；10.51 Footer 单行化后回收 1 行）：终端行数 − 底部固定件
   * （menu 模式面板按行计不进此列——面板态 MessagePane 不渲染；此处只算与会话流同帧共存的件）：
   * InputBox 2 行（顶横线+内容行）+ Footer 1 行（+断线异常行 1）+ slash 菜单（开着才计）
   * + @ 补全面板（开着才计，与 slash 互斥）+ 错误区 2 行（出现才计）+ 审批框（挂起才计，保守 6）。
   * live 折叠提示行也占预算——再减 1。
   */
  const slashRows = slashOpen && slashItems.length > 0 && panel === 'none' ? SLASH_PAGE_SIZE + 1 : 0
  const fsRows = fsOpen ? FS_PAGE_SIZE + 1 : 0
  const errorRows = errorInfo !== null ? 2 : 0
  const approvalRows = pendingApproval !== null ? 6 : 0
  const abnormalRows = connStatus !== 'open' ? 1 : 0
  const liveBudget = Math.max(
    1,
    rows - 2 - 1 - abnormalRows - slashRows - fsRows - errorRows - approvalRows - 1,
  )

  // ---------- 渲染：启动错误屏优先 / 面板族 / boot 骨架 / 会话流 ----------

  if (bootError !== null) {
    return (
      <Box flexDirection="column">
        <BootHeader slice={null} models={null} columns={columns} />
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">启动失败：{bootError}</Text>
          <Text color="gray">Ctrl+R 重试 · Ctrl+C ×2 退出</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <PanelRouter
        panel={panel}
        draft={panel === 'resume' ? draftPreview : ''}
        columns={columns}
        sessions={resumeFiltered}
        resumeSelected={resumeSelected}
        resumePreview={resumePreview}
        activeSessionId={activeSessionId}
        slice={slice}
        models={models}
        actions={actions}
        transport={transport}
        liveBudget={liveBudget}
        staticKey={staticEpoch + replayNonce}
        {...(agentsPath !== undefined ? { agentsPath } : {})}
      />
      {slashOpen && slashItems.length > 0 && panel === 'none' ? (
        <SlashMenu
          items={slashItems}
          selected={slashSelected}
          page={Math.floor(slashSelected / SLASH_PAGE_SIZE)}
        />
      ) : null}
      {fsOpen ? (
        <FsMenu
          entries={fsItems}
          selected={fsSelected}
          page={Math.floor(fsSelected / FS_PAGE_SIZE)}
        />
      ) : null}
      {errorInfo !== null ? (
        <Box flexDirection="column">
          <Text color="red">
            ✕︎ {errorInfo.title}
          </Text>
          {/* 细节行（§13.K K.8）：原错误码折叠呈现 + 重试键位提示 */}
          <Text color="gray">
            {errorInfo.code !== null ? `${errorInfo.detail ?? errorInfo.code} · ` : ''}Ctrl+R 重试
          </Text>
        </Box>
      ) : null}
      {/* Qwen 对齐（工单 10.36，Composer 同构）：运行中指示行在输入框上方 */}
      {slice !== null && slice.activeTurn !== null ? <LoadingIndicator slice={slice} /> : null}
      {pendingApproval !== null && rejecting === null ? (
        <ApprovalPrompt item={pendingApproval} />
      ) : null}
      {rejecting !== null ? (
        <InputBox
          active
          prefix="拒绝理由："
          placeholder="填写后 Enter 确认拒绝，Esc 取消"
          maxWidth={columns}
          onSubmit={(text) => {
            actions.replyApproval(rejecting, 'reject', text)
            setRejecting(null)
          }}
        />
      ) : (
        <InputBox
          ref={inputRef}
          key={panel}
          active={inputBoxActive}
          maxWidth={columns}
          border={pendingApproval !== null && rejecting === null ? 'yellow' : 'gray'}
          prefix={panel === 'resume' ? '过滤：' : `[${delivery}] > `}
          placeholder={
            panel === 'resume'
              ? '输入关键词过滤会话，↑↓ 选择，Space 预览，Enter 恢复'
              : pendingApproval !== null
                ? '等待审批——1 允许一次 / 2 总是允许 / 3 拒绝'
                : '输入您的消息或 @ 文件路径'
          }
          onSubmit={(text) => {
            // @ 补全面板开启：Enter = 选中路径回写，不发送（工单 10.53；同 resume 拦截模型）
            if (fsOpen) {
              const entry = fsItems[fsSelected]
              if (entry !== undefined) acceptFsEntry(text, entry)
              return
            }
            actions.submit(text)
          }}
          onPreview={(v) => useCliStore.getState().setDraftPreview(v)}
          {...(panel === 'resume'
            ? {
                onSpace: () =>
                  setResumePreview((v) => !v), // Space 预览（工单 10.11 / §13.K K.7）
              }
            : {})}
        />
      )}
      <Footer slice={slice} />
    </Box>
  )

}
