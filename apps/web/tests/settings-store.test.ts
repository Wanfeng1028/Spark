/**
 * settings-store 外观字段单测（工单 6.4 / DESIGN §13.D②）：
 * 坏数据收窄（非法字号/主题槽错配/非布尔开关回默认）、setter 持久化全量、
 * applyAppearance 副作用（CSS 变量 + html class）。
 * node 环境无 DOM——stubGlobal 注入 document/window/localStorage 后动态 import
 * （store 模块级副作用在 import 时执行）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** DOM/localStorage 最小桩：只覆盖 settings.ts 顶层与 applyAppearance 用到的面 */
function stubDom(): { classes: Set<string>; vars: Map<string, string>; kv: Map<string, string> } {
  const classes = new Set<string>()
  const vars = new Map<string, string>()
  const kv = new Map<string, string>()
  vi.stubGlobal('document', {
    documentElement: {
      classList: {
        toggle(c: string, on: boolean) {
          if (on) classes.add(c)
          else classes.delete(c)
        },
        contains(c: string) {
          return classes.has(c)
        },
      },
      style: {
        setProperty(k: string, v: string) {
          vars.set(k, v)
        },
        getPropertyValue(k: string) {
          return vars.get(k) ?? ''
        },
      },
    },
  })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false, addEventListener: () => undefined }),
  })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => kv.get(k) ?? null,
    setItem: (k: string, v: string) => {
      kv.set(k, v)
    },
  })
  return { classes, vars, kv }
}

/** 干净加载 store（resetModules 重跑模块级 load/apply；stub 先行） */
async function freshStore() {
  vi.resetModules()
  const mod = await import('../src/stores/settings')
  return mod.useSettingsStore
}

describe('settings-store 外观字段', () => {
  let dom: ReturnType<typeof stubDom>

  beforeEach(() => {
    dom = stubDom()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('默认值：GitHub Light / Minimal Dark（min-dark）/ 行号开 / 换行开 / 字号 13+12', async () => {
    const store = await freshStore()
    const s = store.getState()
    expect(s.codeThemeLight).toBe('github-light')
    expect(s.codeThemeDark).toBe('min-dark')
    expect(s.showLineNumbers).toBe(true)
    expect(s.wrapLongLines).toBe(true)
    expect(s.uiFontSize).toBe(13)
    expect(s.codeFontSize).toBe(12)
  })

  it('坏数据收窄：非法字号/主题槽错配/非布尔开关一律回默认', async () => {
    dom.kv.set(
      'spark.settings',
      JSON.stringify({
        uiFontSize: 99,
        codeFontSize: '12',
        codeThemeLight: 'dracula', // 深色主题混入浅色槽
        codeThemeDark: 'nord',
        showLineNumbers: 'yes',
        wrapLongLines: null,
      }),
    )
    const store = await freshStore()
    const s = store.getState()
    expect(s.uiFontSize).toBe(13)
    expect(s.codeFontSize).toBe(12)
    expect(s.codeThemeLight).toBe('github-light')
    expect(s.codeThemeDark).toBe('nord')
    expect(s.showLineNumbers).toBe(true)
    expect(s.wrapLongLines).toBe(true)
  })

  it('setter 即存即生效：全量持久化 + CSS 变量与 html class 副作用', async () => {
    const store = await freshStore()
    store.getState().setUiFontSize(15)
    store.getState().setCodeFontSize(11)
    store.getState().setWrapLongLines(false)
    store.getState().setCodeThemeDark('tokyo-night')

    const saved = JSON.parse(dom.kv.get('spark.settings') ?? '{}') as Record<string, unknown>
    expect(saved).toMatchObject({
      uiFontSize: 15,
      codeFontSize: 11,
      wrapLongLines: false,
      codeThemeDark: 'tokyo-night',
      codeThemeLight: 'github-light',
      theme: 'light',
    })

    expect(dom.vars.get('--spark-ui-font-size')).toBe('15px')
    expect(dom.vars.get('--spark-code-font-size')).toBe('11px')
    expect(dom.classes.has('spark-code-wrap')).toBe(false)
  })

  it('换行开关往返：html class 默认在，关→无，再开→在', async () => {
    const store = await freshStore()
    expect(dom.classes.has('spark-code-wrap')).toBe(true)
    store.getState().setWrapLongLines(false)
    expect(dom.classes.has('spark-code-wrap')).toBe(false)
    store.getState().setWrapLongLines(true)
    expect(dom.classes.has('spark-code-wrap')).toBe(true)
  })

  it('坏 JSON 整体回默认（不抛错）', async () => {
    dom.kv.set('spark.settings', '{not json')
    const store = await freshStore()
    expect(store.getState().uiFontSize).toBe(13)
  })
})
