/**
 * 会话菜单动作控制器（工单 19.27）：改名 / 归档 / 删除 / 反馈 / 权限档位 / 退出计划模式。
 *
 * 铁律落点：
 * - 不做乐观更新——动作成功只回调 `onChanged`，界面状态仍来自 REST 返回值与事件流；
 * - 单飞闸门（同 session-page 审批防抖 H3 的口径）：一次只允许一个动作在途，
 *   连点第二次直接丢弃（服务端会 409/重复行，前端要的是不误导的错误条）；
 * - 失败闭合：`errorMessageOf` 人话文案单源，不吞异常、不假报成功。
 *
 * 置顶不做：置顶的协议面与引擎索引列还没落地（工单 19.41 未开工）——菜单里
 * 不放置灰的置顶项（置灰项本身就是承诺缺口），见 doc/02 §8 阶段十九 19.27 报告。
 */
import type { EventId, FeedbackEntryDto, FeedbackVote, PermissionPreset, SessionDto, SessionId, Transport } from '@spark/protocol'
import { errorMessageOf } from '@spark/protocol'

export type SessionActionsRest = Pick<
  Transport,
  | 'renameSession'
  | 'archiveSession'
  | 'deleteSession'
  | 'submitFeedback'
  | 'listFeedback'
  | 'withdrawFeedback'
  | 'getPermissionPreset'
  | 'setPermissionPreset'
  | 'executeCommand'
>

/** 在途动作名（null = 空闲）；按钮禁用态的数据源 */
export type SessionActionKind =
  | 'rename'
  | 'archive'
  | 'delete'
  | 'feedback'
  | 'preset'
  | null

export interface SessionActionsSnapshot {
  running: SessionActionKind
  notice: string | null
  /** 会话权限档位（GET /api/sessions/:id/permission-preset；null = 尚未取到） */
  preset: PermissionPreset | null
  /** 档位读档失败（引擎内存态不可用时如实呈现，不回落成"缺省档"冒充真值） */
  presetUnavailable: boolean
  /**
   * 已提交的反馈（eventId → 票型集合；数据源 GET /api/feedback）。
   * 反馈不进事件流（用户侧评价非会话状态），所以这份态只能由 REST 装载 + 动作成功后
   * 就地更新——不做乐观更新：请求没成功就不写这张表。
   */
  votes: Partial<Record<EventId, FeedbackVote[]>>
}

export interface SessionActions {
  /** 改名（19.20 的 Transport.renameSession；空白标题拒绝，不发请求） */
  rename(title: string): Promise<SessionDto | null>
  /** 归档/恢复（12.4 的 archiveSession；返回新 DTO 供列表就地校正） */
  setArchived(archived: boolean): Promise<SessionDto | null>
  /** 两段式删除（JSONL 进 trash；运行中会话服务端 409，文案照实呈现） */
  remove(): Promise<boolean>
  /** 反馈票型装载（19.19 的 listFeedback；进会话页时一次） */
  loadVotes(): Promise<void>
  /**
   * 反馈投票（19.19）：同票再点 = 撤回，异票 = 改票（后端按 vote 分行，互不覆盖）。
   * 成功后才写 votes 表——失败保持原态（不假装已反馈）。
   */
  toggleVote(eventId: EventId, next: FeedbackVote): Promise<boolean>
  /** 备注（同票幂等更新，不堆行） */
  saveNote(eventId: EventId, vote: FeedbackVote, note: string): Promise<boolean>
  loadPreset(): Promise<void>
  setPreset(preset: PermissionPreset): Promise<boolean>
  /** 退出计划模式：走 /plan exit 命令（引擎侧恢复原档位，前端不自己猜上一档） */
  exitPlan(): Promise<boolean>
  /** 卸载收口：在途回调与定时器此后一律静默（AUD-09 同律） */
  dispose(): void
}

/** 反馈列表 → 票型表（同 event 可有两张不同票型的行，后端不互相覆盖——表按 event 聚合） */
export function votesOf(list: readonly FeedbackEntryDto[]): Partial<Record<EventId, FeedbackVote[]>> {
  const out: Partial<Record<EventId, FeedbackVote[]>> = {}
  for (const entry of list) {
    const cur = out[entry.eventId] ?? []
    if (!cur.includes(entry.vote)) out[entry.eventId] = [...cur, entry.vote]
  }
  return out
}

export function createSessionActionsController(opts: {
  sessionId: SessionId
  rest: () => SessionActionsRest | null
  onUpdate: (s: SessionActionsSnapshot) => void
  /** 归档/删除/改名成功后的端侧动作（列表校正、返回上一页） */
  onChanged?: (kind: Exclude<SessionActionKind, null>, dto: SessionDto | null) => void
  noticeMs?: number
}): SessionActions {
  const noticeMs = opts.noticeMs ?? 5000
  let state: SessionActionsSnapshot = {
    running: null,
    notice: null,
    preset: null,
    presetUnavailable: false,
    votes: {},
  }
  let disposed = false
  let noticeTimer: ReturnType<typeof setTimeout> | null = null

  const emit = (): void => {
    if (disposed) return
    opts.onUpdate({ ...state })
  }

  /** 票型表校正（只在请求成功后调用——不做乐观更新） */
  const setVote = (eventId: EventId, vote: FeedbackVote, present: boolean): void => {
    const votes: Partial<Record<EventId, FeedbackVote[]>> = { ...state.votes }
    const cur = votes[eventId] ?? []
    const next = present
      ? cur.includes(vote)
        ? cur
        : [...cur, vote]
      : cur.filter((v) => v !== vote)
    votes[eventId] = next
    state = { ...state, votes }
  }

  const setNotice = (message: string): void => {
    if (disposed) return
    state = { ...state, notice: message }
    emit()
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      if (disposed) return
      noticeTimer = null
      state = { ...state, notice: null }
      emit()
    }, noticeMs)
  }

  /** 单飞包装：在途时返回 null 并丢弃本次调用（连点不产生第二次请求） */
  async function run<T>(
    kind: Exclude<SessionActionKind, null>,
    fn: (t: SessionActionsRest) => Promise<T>,
  ): Promise<T | null> {
    if (disposed || state.running !== null) return null
    const transport = opts.rest()
    if (transport === null) {
      setNotice('未配置服务器：请先在设置页完成配对')
      return null
    }
    state = { ...state, running: kind }
    emit()
    try {
      return await fn(transport)
    } catch (err: unknown) {
      setNotice(errorMessageOf(err))
      return null
    } finally {
      state = { ...state, running: null }
      emit()
    }
  }

  return {
    async rename(rawTitle) {
      const title = rawTitle.trim()
      if (title === '') {
        setNotice('标题不能为空')
        return null
      }
      const dto = await run('rename', (t) => t.renameSession(opts.sessionId, title))
      if (dto !== null) opts.onChanged?.('rename', dto)
      return dto
    },

    async setArchived(archived) {
      const dto = await run('archive', (t) => t.archiveSession(opts.sessionId, archived))
      if (dto !== null) opts.onChanged?.('archive', dto)
      return dto
    },

    async remove() {
      const ok = await run('delete', (t) => t.deleteSession(opts.sessionId).then(() => true))
      if (ok === true) opts.onChanged?.('delete', null)
      return ok === true
    },

    async loadVotes() {
      const list = await run('feedback', (t) => t.listFeedback({ sessionId: opts.sessionId }))
      if (list === null) return
      state = { ...state, votes: votesOf(list) }
      emit()
    },

    async toggleVote(eventId, next) {
      const has = (state.votes[eventId] ?? []).includes(next)
      const ok = await run('feedback', (t) =>
        has
          ? t.withdrawFeedback(opts.sessionId, eventId, next).then(() => true)
          : t.submitFeedback({ sessionId: opts.sessionId, eventId, vote: next }).then(() => true),
      )
      if (ok === true) setVote(eventId, next, !has)
      emit()
      return ok === true
    },

    async saveNote(eventId, vote, note) {
      const trimmed = note.trim()
      const entry = await run('feedback', (t) =>
        t.submitFeedback({
          sessionId: opts.sessionId,
          eventId,
          vote,
          ...(trimmed === '' ? {} : { note: trimmed }),
        }),
      )
      return entry !== null
    },

    async loadPreset() {
      // 档位是引擎内存态（重启回缺省）：读不到就标不可用，不回落 'confirm-each' 冒充真值
      const preset = await run('preset', async (t) => {
        try {
          return await t.getPermissionPreset(opts.sessionId)
        } catch (err: unknown) {
          state = { ...state, presetUnavailable: true }
          throw err
        }
      })
      if (preset !== null) state = { ...state, preset, presetUnavailable: false }
      emit()
    },

    async setPreset(preset) {
      const applied = await run('preset', (t) =>
        t.setPermissionPreset(opts.sessionId, preset).then(() => true),
      )
      if (applied !== true) return false
      state = { ...state, preset, presetUnavailable: false }
      emit()
      return true
    },

    async exitPlan() {
      const done = await run('preset', (t) =>
        t.executeCommand(opts.sessionId, 'plan', 'exit').then(() => true),
      )
      return done === true
    },

    dispose() {
      disposed = true
      if (noticeTimer !== null) clearTimeout(noticeTimer)
      noticeTimer = null
    },
  }
}
