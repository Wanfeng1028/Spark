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
