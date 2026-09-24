/**
 * i18n 框架（阶段十九 19.17 第一批，翻案 Q-2，消解 V2-12）：
 * 语言包结构 + 翻译器 + 系统语言探测。**第一批只收 shell 与设置面**（导航/页题/
 * 通用动作词/表单标签），长尾页（会话流、审批卡、错误文案等）留第二批——
 * 迁移一半留一半时，未迁移键**回落中文原文**（缺键不报错、不显示 key 名）。
 *
 * 落点纪律（AGENTS §8 一条规则一个来源）：
 * - 语言枚举与探测在 protocol（四端共享：web 先行，移动端/小程序/CLI 随各自批次迁）；
 * - 组件文案在各端字典里按命名空间分组（shell.* / settings.* / action.*）；
 * - 已有单源（ui-copy/error-copy）**不拆散**——它们是纯映射，第二批整体接入翻译层。
 */
import { z } from 'zod'

/** 支持的语言（封闭集；新增语言 = 加字典 + 加枚举，不许运行时拼包） */
export const LanguageSchema = z.enum(['zh-CN', 'en'])
export type Language = z.infer<typeof LanguageSchema>

/** 语言展示名（各端语言选择器共用） */
export const LANGUAGE_LABELS: Readonly<Record<Language, string>> = {
  'zh-CN': '中文',
  en: 'English',
}

/** 系统语言探测（navigator.languages → 首个匹配；无匹配回落 zh-CN） */
export function detectLanguage(candidates: readonly string[] = []): Language {
  for (const raw of candidates) {
    const tag = raw.toLowerCase()
    if (tag.startsWith('zh')) return 'zh-CN'
    if (tag.startsWith('en')) return 'en'
  }
  return 'zh-CN'
}

/** 字典（嵌套命名空间；占位符 {name} 形式，缺变量留空不抛） */
export type UiDictionary = {
  shell: {
    settings: string
    back: string
    sessions: string
    welcome: string
    loading: string
  }
  action: {
    save: string
    cancel: string
    confirm: string
    reset: string
    retry: string
    close: string
  }
  settings: {
    title: string
    groupBasic: string
    groupAgent: string
    groupData: string
    pageGeneral: string
    pageAppearance: string
    pageKeymap: string
    pageModels: string
    pageDevices: string
    pageBrowser: string
    pageComputer: string
    pagePermissionRules: string
    pageMemory: string
    pageSubagents: string
    pagePlugins: string
    pageSecurity: string
    pageMcp: string
    pageSkills: string
    pageLsp: string
    pageCommands: string
    pageHooks: string
    pagePrompts: string
    pageSandbox: string
    pageIndex: string
    pageUsage: string
    pageAudit: string
    pageDiagnostics: string
    pageOnboarding: string
    language: string
    languageDesc: string
    restartBadge: string
    saved: string
  }
  /** CLI（终端）面板共用文案——工单 19.25 起消费翻译层；面板标题与键位长尾随后批次 */
  cli: {
    loading: string
    writing: string
    saved: string
    failed: string
    confirmAgain: string
    escClose: string
    restartBadge: string
    navHint: string
    editHint: string
  }
  /**
   * 展示层文案单源（第二批接入翻译层）：ui-copy.ts 的各纯函数按 `lang` 查本命名空间。
   * 刻意不把文案散进各端——ui-copy 是四端共享资产（D22），拆散即回到"每端各写一份、
   * 漂移了才发现"的老路（该文件头注记的四份 closed 文案就是这么来的）。
   */
  copy: {
    connecting: string
    open: string
    reconnecting: string
    toolRunning: string
    toolCompleted: string
    toolError: string
    approvalOnce: string
    approvalAlways: string
    approvalReject: string
    /** 已处理但决策未知——不给假具体值 */
    approvalHandled: string
    copyButton: string
    copied: string
    /** streamdown 代码块控件的库特有键（原为 web 本地字面量，切语言不跟着变） */
    copyCode: string
    /** 占位 {n} */
    durationSeconds: string
    /** 占位 {m} {s} */
    durationMinutes: string
  }
  /**
   * 错误码 → 人话文案（error-copy.ts 的 ERROR_COPY 由此派生，不再是并列的第二份表）。
   * **显式列键而非 Record<string,string>**：漏一条 en 就编译不过——24 个码靠人记必漏，
   * 而"某码在某语言下没文案"在运行时是静默回落中文，测试也抓不到。
   */
  err: {
    E_VALIDATION: string
    E_NOT_FOUND: string
    E_ALREADY_RESOLVED: string
    E_TURN_ACTIVE: string
    E_TURN_MISMATCH: string
    E_INVALID_BOUNDARY: string
    E_OPEN_TURN: string
    E_ALREADY_EXISTS: string
    E_CHECKPOINT_ROLLBACK: string
    E_CONFIG: string
    E_SHUTTING_DOWN: string
    E_AUTH: string
    E_PAIR: string
    E_PAIR_DISABLED: string
    E_COMMAND_CLIENT: string
    E_INTERNAL: string
    E_TRANSCRIBE_UNCONFIGURED: string
    E_TRANSCRIBE_BLOCKED: string
    E_TRANSCRIBE_UPSTREAM: string
    E_TRANSCRIBE_MIME: string
    E_TRANSCRIBE_TOO_LARGE: string
    E_MOCK_UNKNOWN_SESSION: string
    E_MOCK_DISPOSED: string
    E_HTTP_DISPOSED: string
  }
}

const ZH: UiDictionary = {
  shell: {
    settings: '设置',
    back: '返回',
    sessions: '会话',
    welcome: '欢迎',
    loading: '加载中…',
  },
  action: {
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    reset: '恢复缺省',
    retry: '重试',
    close: '关闭',
  },
  settings: {
    title: '设置',
    groupBasic: '基础设置',
    groupAgent: 'Agent 能力',
    groupData: '数据与统计',
    pageGeneral: '常规',
    pageAppearance: '外观',
    pageKeymap: '键位',
    pageModels: '模型设置',
    pageDevices: '设备与配对',
    pageBrowser: '浏览器',
    pageComputer: '电脑控制',
    pagePermissionRules: '权限规则',
    pageMemory: '记忆',
    pageSubagents: '子智能体',
    pagePlugins: '扩展',
    pageSecurity: '安全与信任',
    pageMcp: 'MCP 服务器',
    pageSkills: '技能',
    pageLsp: '语言服务器',
    pageCommands: '命令',
    pageHooks: '钩子',
    pagePrompts: '提示词模板',
    pageSandbox: '沙箱与网络',
    pageIndex: '索引库',
    pageUsage: '使用统计',
    pageAudit: '审计日志',
    pageDiagnostics: '诊断',
    pageOnboarding: '引导',
    language: '界面语言',
    languageDesc: '界面语言（切换即时生效；长尾页面文案随批次迁移）',
    restartBadge: '下次启动生效',
    saved: '已保存',
  },
  cli: {
    loading: '装载中…',
    writing: '写入中…',
    saved: '已保存',
    failed: '失败',
    confirmAgain: '再按一次 Enter 确认：{label}',
    escClose: 'Esc 关闭',
    restartBadge: '下次启动生效',
    navHint: '↑↓ 选择 · Enter 执行',
    editHint: '输入后 Enter 保存 · Esc 取消',
  },
  // 值逐字取自 ui-copy.ts（中文侧零观感变化——接入翻译层不是改文案）
  copy: {
    connecting: '连接中…',
    open: '已连接',
    reconnecting: '已断线，重连中…',
    toolRunning: '运行中',
    toolCompleted: '完成',
    toolError: '失败',
    approvalOnce: '已允许本次',
    approvalAlways: '已始终允许',
    approvalReject: '已拒绝',
    approvalHandled: '已处理',
    copyButton: '复制',
    copied: '已复制',
    copyCode: '复制代码',
    durationSeconds: '{n} 秒',
    durationMinutes: '{m} 分 {s} 秒',
  },
  // 值逐字取自 error-copy.ts 的 ERROR_COPY（原表改由本命名空间派生，不再并列两份）
  err: {
    E_VALIDATION: '请求参数不合法，请检查输入后重试',
    E_NOT_FOUND: '目标不存在（会话/请求/快照可能已被清理）',
    E_ALREADY_RESOLVED: '该审批已答复过，无需重复操作',
    E_TURN_ACTIVE: '本轮对话仍在进行中，请等待结束后再操作',
    E_TURN_MISMATCH: '要插话的目标轮已变化，请重新发送',
    E_INVALID_BOUNDARY: '所选分叉位置不存在，请刷新会话树后重试',
    E_OPEN_TURN: '本轮对话尚未结束，暂不可分叉',
    E_ALREADY_EXISTS: '目标会话已存在',
    E_CHECKPOINT_ROLLBACK: '回滚失败：git 操作异常，详情见服务端日志',
    E_CONFIG: '模型配置无效：须为已配置供应商的 provider/model',
    E_SHUTTING_DOWN: '引擎正在关闭，请稍后重启应用',
    E_AUTH: '连接未通过鉴权：请重新配对设备或检查 token',
    E_PAIR: '配对码无效或已过期，请在桌面端重新获取',
    E_PAIR_DISABLED: '配对鉴权未启用：请先在桌面端设置页添加设备',
    E_COMMAND_CLIENT: '这是界面命令，由界面执行——不经引擎（检查命令面分派）',
    E_INTERNAL: '服务内部错误，请重试；若持续出现请查看服务端日志',
    E_TRANSCRIBE_UNCONFIGURED:
      '当前供应商未配置语音转写端点：在 models.json 给该供应商补 baseUrl 或 transcription 配置',
    E_TRANSCRIBE_BLOCKED: '转写端点地址被安全策略拒绝（内网/环回地址不可达）',
    E_TRANSCRIBE_UPSTREAM: '转写服务返回错误：请检查供应商密钥与转写模型配置',
    E_TRANSCRIBE_MIME: '不支持的录音格式：请使用 webm/mp4/wav/ogg/mpeg 录音',
    E_TRANSCRIBE_TOO_LARGE: '录音超过 10MB 上限：请缩短录音时长',
    E_MOCK_UNKNOWN_SESSION: '会话不存在或已被清理',
    E_MOCK_DISPOSED: '演示通道已关闭，请刷新页面',
    E_HTTP_DISPOSED: '连接已释放，请重启应用',
  },
}

const EN: UiDictionary = {
  shell: {
    settings: 'Settings',
    back: 'Back',
    sessions: 'Sessions',
    welcome: 'Welcome',
    loading: 'Loading…',
  },
  action: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    reset: 'Restore default',
    retry: 'Retry',
    close: 'Close',
  },
  settings: {
    title: 'Settings',
    groupBasic: 'General',
    groupAgent: 'Agent',
    groupData: 'Data & Stats',
    pageGeneral: 'General',
    pageAppearance: 'Appearance',
    pageKeymap: 'Keymap',
    pageModels: 'Models',
    pageDevices: 'Devices & Pairing',
    pageBrowser: 'Browser',
    pageComputer: 'Computer Use',
    pagePermissionRules: 'Permission Rules',
    pageMemory: 'Memory',
    pageSubagents: 'Subagents',
    pagePlugins: 'Extensions',
    pageSecurity: 'Security & Trust',
    pageMcp: 'MCP Servers',
    pageSkills: 'Skills',
    pageLsp: 'Language Servers',
    pageCommands: 'Commands',
    pageHooks: 'Hooks',
    pagePrompts: 'Prompt Templates',
    pageSandbox: 'Sandbox & Network',
    pageIndex: 'Index',
    pageUsage: 'Usage',
    pageAudit: 'Audit Log',
    pageDiagnostics: 'Diagnostics',
    pageOnboarding: 'Onboarding',
    language: 'Language',
    languageDesc: 'Interface language (applies immediately; long-tail pages migrate in later batches)',
    restartBadge: 'Takes effect after restart',
    saved: 'Saved',
  },
  cli: {
    loading: 'Loading…',
    writing: 'Writing…',
    saved: 'Saved',
    failed: 'Failed',
    confirmAgain: 'Press Enter again to confirm: {label}',
    escClose: 'Esc to close',
    restartBadge: 'Takes effect after restart',
    navHint: '↑↓ select · Enter act',
    editHint: 'Type then Enter to save · Esc to cancel',
  },
  copy: {
    connecting: 'Connecting…',
    open: 'Connected',
    reconnecting: 'Disconnected, reconnecting…',
    toolRunning: 'Running',
    toolCompleted: 'Done',
    toolError: 'Failed',
    approvalOnce: 'Allowed once',
    approvalAlways: 'Always allowed',
    approvalReject: 'Rejected',
    approvalHandled: 'Handled',
    copyButton: 'Copy',
    copied: 'Copied',
    copyCode: 'Copy code',
    durationSeconds: '{n}s',
    durationMinutes: '{m}m {s}s',
  },
  err: {
    E_VALIDATION: 'Invalid request parameters — check the input and retry',
    E_NOT_FOUND: 'Target not found (the session, request or snapshot may have been cleaned up)',
    E_ALREADY_RESOLVED: 'This approval was already answered — no need to reply again',
    E_TURN_ACTIVE: 'The current turn is still running — wait for it to finish',
    E_TURN_MISMATCH: 'The target turn changed before your message landed — send again',
    E_INVALID_BOUNDARY: 'The selected fork point no longer exists — refresh the session tree and retry',
    E_OPEN_TURN: 'The current turn has not finished — cannot fork yet',
    E_ALREADY_EXISTS: 'The target session already exists',
    E_CHECKPOINT_ROLLBACK: 'Rollback failed: git error — see the server log for details',
    E_CONFIG: 'Invalid model config: must be provider/model of a configured provider',
    E_SHUTTING_DOWN: 'The engine is shutting down — restart the app shortly',
    E_AUTH: 'Connection failed authentication — re-pair the device or check the token',
    E_PAIR: 'Pairing code is invalid or expired — get a new one on the desktop',
    E_PAIR_DISABLED: 'Pairing auth is not enabled — add a device in the desktop settings first',
    E_COMMAND_CLIENT:
      'This is a UI command, executed by the UI — it never reaches the engine (check command dispatch)',
    E_INTERNAL: 'Internal server error — retry; if it persists, check the server log',
    E_TRANSCRIBE_UNCONFIGURED:
      'This provider has no transcription endpoint — set baseUrl or transcription in models.json',
    E_TRANSCRIBE_BLOCKED:
      'The transcription endpoint was rejected by the security policy (internal and loopback addresses are unreachable)',
    E_TRANSCRIBE_UPSTREAM:
      'The transcription service returned an error — check the provider key and transcription model',
    E_TRANSCRIBE_MIME: 'Unsupported recording format — record as webm/mp4/wav/ogg/mpeg',
    E_TRANSCRIBE_TOO_LARGE: 'Recording exceeds the 10MB limit — shorten it',
    E_MOCK_UNKNOWN_SESSION: 'Session does not exist or was cleaned up',
    E_MOCK_DISPOSED: 'The demo transport is closed — refresh the page',
    E_HTTP_DISPOSED: 'The connection was released — restart the app',
  },
}

const DICTS: Readonly<Record<Language, UiDictionary>> = { 'zh-CN': ZH, en: EN }

/** 按点路径取值（'settings.pageGeneral'）；缺键回落 zh-CN，再缺回落 key 本身（不抛） */
export function translate(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(DICTS[lang], key) ?? lookup(ZH, key) ?? key
  if (vars === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name]
    return v === undefined ? m : String(v)
  })
}

function lookup(dict: UiDictionary, key: string): string | undefined {
  let cur: unknown = dict
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === 'string' ? cur : undefined
}

/**
 * 错误码 → 人话文案（第二批：`error-copy.ts` 的 ERROR_COPY 由 zh 表派生，不再并列两份）。
 * **缺码回 undefined 而不是走 `translate` 的"缺键回 key 本身"**：`humanizeError` 要靠
 * "表里没有这个码"来决定 title 回落原始消息；若这里回 `'err.E_FOO'`，键名就会被当文案显示给用户。
 */
export function errorCopyOf(code: string, lang: Language = 'zh-CN'): string | undefined {
  return lookup(DICTS[lang], `err.${code}`) ?? lookup(ZH, `err.${code}`)
}

/** zh-CN 的错误码文案表（ERROR_COPY 的派生源） */
export const ERROR_COPY_ZH: Readonly<Record<string, string>> = ZH.err

/** 设置页 id → 字典键（各端设置导航共用；缺映射的页不在第一批范围内） */
export const SETTINGS_PAGE_KEY: Readonly<Partial<Record<string, string>>> = {
  general: 'settings.pageGeneral',
  appearance: 'settings.pageAppearance',
  keymap: 'settings.pageKeymap',
  models: 'settings.pageModels',
  devices: 'settings.pageDevices',
  browser: 'settings.pageBrowser',
  computer: 'settings.pageComputer',
  'permission-rules': 'settings.pagePermissionRules',
  memory: 'settings.pageMemory',
  subagents: 'settings.pageSubagents',
  plugins: 'settings.pagePlugins',
  security: 'settings.pageSecurity',
  mcp: 'settings.pageMcp',
  skills: 'settings.pageSkills',
  lsp: 'settings.pageLsp',
  commands: 'settings.pageCommands',
  hooks: 'settings.pageHooks',
  prompts: 'settings.pagePrompts',
  sandbox: 'settings.pageSandbox',
  index: 'settings.pageIndex',
  usage: 'settings.pageUsage',
  audit: 'settings.pageAudit',
  diagnostics: 'settings.pageDiagnostics',
  onboarding: 'settings.pageOnboarding',
}
