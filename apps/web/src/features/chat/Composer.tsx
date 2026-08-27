/**
 * Composer（doc/02 §6.2.2 / §6.3 / DESIGN §13.E，工单 6.3 重做）：
 * 容器=圆角 12px + 1px border + 聚焦 ring 2px + 内边距 12px；多行 1→6 行自增后内滚。
 * 三态——空闲：Enter 发送；运行中：**输入不禁用**（Enter 按分段档发送，插话/排队）；
 * 审批挂起：输入禁用（焦点交还上方 ApprovalCard）。
 * 底部工具条（§13.E）：左=[＋附件][权限档位]；右=[提交模式分段][发送/停止 32px 圆形主钮]。
 * @ 菜单 / / 菜单（composer-menus.ts 纯逻辑）：↑↓ 选择、Enter 确认、Esc 关闭。
 * 提交三态（started/steered/queued）内联提示反馈（DESIGN §5：异步动作必须有反馈）。
 * 快捷 chips 填充走 imperative handle（fill）——空态页 chips「点击即填入输入框」（§13.E）。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronsUpDown,
  Paperclip,
  Square,
  X,
} from 'lucide-react'
import type {
  CommandDto,
  Delivery,
  ModelEntryDto,
  ModelProviderDto,
  PermissionPreset,
  SubmitOutcome,
} from '@spark/protocol'
import { Segmented } from '@/components/ui/segmented'
import { ModelPicker } from './ModelPicker'
import { useSettingsStore } from '@/stores/settings'
import { cn } from '@/lib/utils'
import { errorMessageOf } from '@/lib/error-copy'
import {
  PERMISSION_TIERS,
  detectMenu,
  filterCommands,
  mergeSlashCommands,
  parseCommandInput,
  segmentDisplay,
  tierOf,
  type MenuQuery,
} from './composer-menus'

export interface ComposerProps {
  busy: boolean
  /** 审批挂起（activeTurn.waiting）——输入区整体禁用 */
  waiting: boolean
  /** 欢迎页 chip 发送失败时的回填草稿（doc/02 §6.2.1：不丢用户输入） */
  initialDraft?: string
  /** 权限档位（§13.E 四档；缺省=无会话上下文（欢迎页）不渲染档位钮） */
  permission?: {
    preset: PermissionPreset
    onChange: (preset: PermissionPreset) => Promise<void>
  }
  /** 会话级模型选择器（§13.E 工具条中位 / 工单 6.5；缺省不渲染——欢迎页无会话上下文） */
  model?: {
    current: string
    models: ModelEntryDto[]
    providers: ModelProviderDto[]
    /** 返回生效的 "provider/model"（成功后父级更新 current） */
    onChange: (model: string) => Promise<string>
  } | undefined
  onSend: (text: string, delivery: Delivery, attachments?: string[]) => Promise<SubmitOutcome>
  onInterrupt: () => void
  /**
   * 命令分发（工单 7.4）：首词 / 命中注册表（静态基线 + commands 合并）时回调，
   * 由父级决定执行体（client 命令本地导航；action/prompt 走 transport.executeCommand）。
   */
  onCommand: (name: string, args: string) => void | Promise<void>
  /** 引擎命令注册表（GET /api/commands；缺省/未加载 = 仅静态基线） */
  commands?: readonly CommandDto[]
}

/** 空态 chips「点击即填入输入框」（§13.E）——外部填词的 imperative 通道 */
export interface ComposerHandle {
  fill(text: string): void
}

/** §13.E：6 行上限（约 144px）后内部滚动 */
const MAX_HEIGHT = 144

const OUTCOME_TEXT: Record<SubmitOutcome['result'], string> = {
  started: '已开始本轮',
  steered: '已插话注入当前轮',
  queued: '已排队（下一轮执行）',
}

/** 分段选中值（运行中可切 steer/queue；空闲恒 now——见 composer-menus.segmentDisplay） */
type SegmentValue = Delivery

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { busy, waiting, initialDraft = '', permission, model, onSend, onInterrupt, onCommand, commands },
  ref,
) {
  const defaultDelivery = useSettingsStore((s) => s.defaultDelivery)
  const [draft, setDraft] = useState(initialDraft)
  const [attachments, setAttachments] = useState<string[]>([])
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachInput, setAttachInput] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  const [menu, setMenu] = useState<MenuQuery | null>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  /** Esc 关闭签名：同词不重开，词变（继续输入）即重开 */
  const dismissedSig = useRef<string | null>(null)
  const [segment, setSegment] = useState<SegmentValue>(defaultDelivery)
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useImperativeHandle(ref, () => ({
    fill(text: string): void {
      setDraft(text)
      dismissedSig.current = null
      requestAnimationFrame(() => {
        const el = taRef.current
        if (el === null) return
        el.focus()
        el.setSelectionRange(text.length, text.length)
        setCaret(text.length)
      })
    },
  }))

  // 自适应高度（1→6 行，§13.E）
  useEffect(() => {
    const el = taRef.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [draft])

  useEffect(() => {
    return () => {
      if (hintTimer.current !== null) clearTimeout(hintTimer.current)
    }
  }, [])

  // 档位菜单在容器失焦/外部点击时关闭（onMouseDown preventDefault 保焦点，仍需兜底）
  useEffect(() => {
    if (!presetMenuOpen) return
    function onDocMouseDown(e: MouseEvent): void {
      if (e.target instanceof Element && !e.target.closest('[data-preset-menu]')) {
        setPresetMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [presetMenuOpen])

  function showHint(text: string): void {
    if (hintTimer.current !== null) clearTimeout(hintTimer.current)
    setHint(text)
    hintTimer.current = setTimeout(() => setHint(null), 2500)
  }

  // ---- @ / / 菜单（§13.E）：光标词驱动，Esc 同词不重开 ----

  function updateCaret(el: HTMLTextAreaElement): void {
    const pos = el.selectionStart ?? 0
    setCaret(pos)
    if (pos !== (el.selectionEnd ?? pos)) {
      setMenu(null) // 选中区间不触发菜单
      return
    }
    const q = detectMenu(el.value, pos)
    if (q === null) {
      dismissedSig.current = null
      setMenu(null)
      return
    }
    const sig = `${q.kind}:${q.start}:${q.query}`
    if (dismissedSig.current === sig) return
    dismissedSig.current = null
    setMenu(q)
    setMenuIndex(0)
  }

  /** / 菜单命令全集（工单 7.4：静态基线 + 引擎动态清单合并） */
  const allCommands = mergeSlashCommands(commands ?? [])
  /** / 菜单当前命令行（过滤后；技能组阶段七接入，空组壳） */
  const slashItems = menu?.kind === 'slash' ? filterCommands(menu.query, allCommands) : []

  /** 扁平可选行数（@ 菜单两组皆空壳 → 0，仅浏览结构与底部提示） */
  const menuItemCount = menu?.kind === 'slash' ? slashItems.length : 0

  function closeMenu(): void {
    if (menu !== null) dismissedSig.current = `${menu.kind}:${menu.start}:${menu.query}`
    setMenu(null)
  }

  /** 菜单确认：/ 命令回写草稿（发送时由注册表分发执行） */
  function confirmMenu(): void {
    if (menu === null) return
    if (menu.kind === 'slash') {
      const cmd = slashItems[menuIndex]
      if (cmd !== undefined) {
        const el = taRef.current
        const next = `${draft.slice(0, menu.start)}/${cmd.name} ${draft.slice(caret)}`
        setDraft(next)
        setMenu(null)
        dismissedSig.current = null
        requestAnimationFrame(() => {
          if (el === null) return
          const pos = menu.start + cmd.name.length + 2
          el.setSelectionRange(pos, pos)
          setCaret(pos)
        })
        return
      }
    }
    closeMenu()
  }

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (menu === null) return false
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMenuIndex((i) => (menuItemCount === 0 ? 0 : (i + 1) % menuItemCount))
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMenuIndex((i) => (menuItemCount === 0 ? 0 : (i - 1 + menuItemCount) % menuItemCount))
      return true
    }
    if (e.key === 'Enter' && menuItemCount > 0) {
      e.preventDefault()
      confirmMenu()
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
      return true
    }
    return false
  }

  // ---- 发送 ----

  const hasText = draft.trim().length > 0

  async function send(delivery: Delivery): Promise<void> {
    if (!hasText || waiting) return
    const text = draft.trim()
    // 命令分发（工单 7.4）：首词 / 命中注册表 → onCommand（不进消息通道）；
    // /compact 迁入注册表后的行为回归——引擎侧同一 compactor.compact() 入口
    const cmd = parseCommandInput(text, allCommands)
    if (cmd !== null) {
      setDraft('')
      setAttachments([])
      setAttachOpen(false)
      setMenu(null)
      try {
        await onCommand(cmd.name, cmd.args)
      } catch (err) {
        showHint(errorMessageOf(err))
      }
      return
    }
    setDraft('')
    setMenu(null)
    try {
      const outcome = await onSend(text, delivery, attachments.length > 0 ? attachments : undefined)
      setAttachments([])
      setAttachOpen(false)
      showHint(OUTCOME_TEXT[outcome.result])
    } catch (err) {
      // 失败闭合 + 不丢用户输入（§6.2.1）：发送失败如实提示并回填草稿
      setDraft(text)
      showHint(errorMessageOf(err))
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (onMenuKeyDown(e)) return // 菜单开放时 ↑↓/Enter/Esc 归菜单
    if (e.key !== 'Enter' || e.shiftKey) return // Shift+Enter 换行走默认
    e.preventDefault()
    if (waiting) return
    if (busy) {
      // Enter 按分段档发送（steer/queue）；Ctrl+Enter 恒排队（§6.2.2 原快捷键保留）
      const delivery: Delivery = e.ctrlKey || e.metaKey ? 'queue' : segment
      void send(delivery)
    } else {
      void send('now')
    }
  }

  function addAttachment(): void {
    const p = attachInput.trim()
    if (p === '') return
    setAttachments((a) => (a.includes(p) ? a : [...a, p]))
    setAttachInput('')
  }

  async function choosePreset(p: PermissionPreset): Promise<void> {
    if (permission === undefined || p === permission.preset) return
    setPresetMenuOpen(false)
    try {
      // 显示态只随父级 onChange 成功后的 props 更新（禁乐观更新）；失败进 hint 如实反馈
      await permission.onChange(p)
    } catch (err) {
      showHint(errorMessageOf(err))
    }
  }

  async function chooseModel(m: string): Promise<string> {
    if (model === undefined) return m
    try {
      const applied = await model.onChange(m)
      showHint(`已切换 ${applied}（下一轮生效）`)
      return applied
    } catch (err) {
      showHint(errorMessageOf(err))
      return model.current
    }
  }

  const preset: PermissionPreset = permission?.preset ?? 'confirm-each'
  const tier = tierOf(preset)
  const segmentValue = segmentDisplay(segment, busy, defaultDelivery)
  const enterHint = busy
    ? 'Enter 按分段档发送 · Ctrl+Enter 排队 · Shift+Enter 换行'
    : 'Enter 发送 · Shift+Enter 换行'

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          'relative flex flex-col rounded-xl border border-input bg-card p-3',
          'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25',
        )}
      >
        {/* @ / / 菜单（§13.E）：容器上方浮层，Enter 确认/Esc 关闭 */}
        {menu !== null && !waiting && (
          <div className="absolute inset-x-3 bottom-full z-20 mb-1.5 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
            <ul
              role="listbox"
              aria-label={menu.kind === 'at' ? '提及菜单' : '命令菜单'}
              className="max-h-64 overflow-y-auto py-1"
            >
              {menu.kind === 'slash' ? (
                slashItems.length > 0 ? (
                  <>
                    <li className="px-2.5 py-1 text-[11px] text-muted-foreground">命令</li>
                    {slashItems.map((c, i) => (
                      <li
                        key={c.name}
                        role="option"
                        aria-selected={i === menuIndex}
                        onMouseDown={(e) => {
                          e.preventDefault() // 保输入焦点
                          setMenuIndex(i)
                          requestAnimationFrame(() => confirmMenu())
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px]',
                          i === menuIndex && 'bg-accent',
                        )}
                      >
                        <span className="font-mono text-xs text-muted-foreground">/{c.name}</span>
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          {c.description}
                        </span>
                      </li>
                    ))}
                  </>
                ) : (
                  <li className="px-2.5 py-2 text-xs text-muted-foreground">没有匹配的命令</li>
                )
              ) : (
                <>
                  <li className="px-2.5 py-1 text-[11px] text-muted-foreground">文件</li>
                  <li className="px-2.5 py-2 text-xs text-muted-foreground">
                    文件搜索将在阶段七接入（引擎目录 API）
                  </li>
                  <li className="px-2.5 py-1 text-[11px] text-muted-foreground">技能</li>
                  <li className="px-2.5 py-2 text-xs text-muted-foreground">暂无已加载技能</li>
                </>
              )}
            </ul>
            <p className="border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
              {menu.kind === 'at'
                ? '输入内容以搜索文件或技能'
                : '输入内容以搜索命令、技能或子智能体'}
            </p>
          </div>
        )}

        {/* 权限档位菜单（§13.E 四档；当前档右侧勾选，full-access 图标 warn） */}
        {permission !== undefined && presetMenuOpen && (
          <div
            data-preset-menu
            className="absolute bottom-full left-3 z-20 mb-1.5 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-md"
          >
            <ul>
              {PERMISSION_TIERS.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={t.id === preset}
                    onMouseDown={(e) => e.preventDefault()} // 保输入焦点
                    onClick={() => void choosePreset(t.id)}
                    className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-accent"
                  >
                    <t.icon
                      className={cn('mt-0.5 size-4 shrink-0', t.warn && 'text-[var(--spark-warn)]')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-tight">{t.label}</span>
                      <span className="block text-xs leading-tight text-muted-foreground">
                        {t.description}
                      </span>
                    </span>
                    {t.id === preset && <Check className="mt-0.5 size-4 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 附件路径 chips（v1 只收路径文本） */}
        {(attachOpen || attachments.length > 0) && !waiting && (
          <div className="mb-2 flex flex-col gap-1.5">
            {attachments.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="附件路径">
                {attachments.map((p) => (
                  <li
                    key={p}
                    className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 font-mono text-xs text-muted-foreground"
                  >
                    <span className="max-w-56 truncate">{p}</span>
                    <button
                      type="button"
                      aria-label={`移除附件 ${p}`}
                      onClick={() => setAttachments((a) => a.filter((x) => x !== p))}
                      className="text-muted-foreground/60 hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {attachOpen && (
              <input
                value={attachInput}
                onChange={(e) => setAttachInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addAttachment()
                  }
                }}
                placeholder="输入文件路径后回车添加（v1 只收路径文本）"
                className="h-7 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground/60 focus:border-ring"
              />
            )}
          </div>
        )}

        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            updateCaret(e.target)
          }}
          onSelect={(e) => updateCaret(e.currentTarget)}
          onClick={(e) => updateCaret(e.currentTarget)}
          onKeyDown={onKeyDown}
          disabled={waiting}
          rows={1}
          placeholder={
            waiting
              ? '等待审批中——请先处理上方审批卡'
              : busy
                ? '继续输入以排队后续修改'
                : '向 Spark 提问，使用 @ 添加上下文，使用 / 选择命令或能力'
          }
          className="max-h-36 min-h-7 w-full resize-none bg-transparent px-0.5 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-60"
        />

        {/* 底部工具条（§13.E）：左=[＋附件][权限档位]；右=[提交模式分段][发送/停止] */}
        <div className="mt-2 flex h-8 items-center gap-1.5">
          <button
            type="button"
            aria-label="添加附件"
            aria-pressed={attachOpen}
            disabled={waiting}
            onClick={() => setAttachOpen((v) => !v)}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Paperclip className="size-4" />
          </button>

          {permission !== undefined && (
            <button
              type="button"
              data-preset-menu
              aria-haspopup="menu"
              aria-expanded={presetMenuOpen}
              disabled={waiting}
              onClick={() => setPresetMenuOpen((v) => !v)}
              title={`权限档位：${tier.label}——${tier.description}`}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <tier.icon
                className={cn('size-4', tier.warn && 'text-[var(--spark-warn)]')}
              />
              {tier.label}
              <ChevronsUpDown className="size-3 opacity-60" />
            </button>
          )}

          {/* 模型选择器（§13.E 工具条中位）：供应商/模型级联下拉，切换下一轮生效 */}
          {model !== undefined && (
            <ModelPicker
              current={model.current}
              models={model.models}
              providers={model.providers}
              onChange={chooseModel}
              disabled={waiting}
            />
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {!waiting && (
              <Segmented<Delivery>
                aria-label="提交模式"
                value={segmentValue}
                onChange={(v) => setSegment(v)}
                options={[
                  {
                    value: 'now',
                    label: '立即',
                    ...(busy ? { disabledReason: '本轮已在进行' } : {}),
                  },
                  {
                    value: 'steer',
                    label: '插话',
                    ...(!busy ? { disabledReason: '无进行中的轮可注入' } : {}),
                  },
                  {
                    value: 'queue',
                    label: '排队',
                    ...(!busy ? { disabledReason: '空闲时无需排队' } : {}),
                  },
                ]}
              />
            )}

            {/* 发送/停止 32px 圆形主钮（§13.E）：运行中变停止 ■ */}
            {busy ? (
              <button
                type="button"
                onClick={onInterrupt}
                title="停止当前轮"
                aria-label="停止当前轮"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground enabled:hover:bg-primary/90"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send('now')}
                disabled={!hasText || waiting}
                title="发送（Enter）"
                aria-label="发送"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <p
        aria-live="polite"
        className={cn(
          'h-4 text-xs',
          hint !== null ? 'text-[var(--spark-accent)]' : 'text-muted-foreground/60',
        )}
      >
        {hint ?? (waiting ? '等待审批中——请先处理上方审批卡' : enterHint)}
      </p>
    </div>
  )
})
