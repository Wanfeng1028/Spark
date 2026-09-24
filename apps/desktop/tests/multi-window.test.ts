/**
 * 多窗口纯判据单测（工单 19.33）：URL ↔ 会话绑定、壳内页面判定、窗口显示名、唤窗目标。
 * Electron 的装配面在 main.ts，不在此测（同 window-behavior.test 的分工）。
 */
import { describe, expect, it } from 'vitest'
import {
  isShellPage,
  pickRevealTarget,
  sessionIdOfUrl,
  windowLabelOf,
  windowUrlOf,
} from '../src/multi-window.js'

const BASE = 'http://127.0.0.1:4318'

describe('isShellPage（引导窗不得进窗口菜单）', () => {
  it('sidecar 基址下的页面算工作窗口', () => {
    expect(isShellPage(BASE, BASE)).toBe(true)
    expect(isShellPage(`${BASE}/`, BASE)).toBe(true)
    expect(isShellPage(`${BASE}/session/ses_1`, BASE)).toBe(true)
    expect(isShellPage(`${BASE}/settings/appearance`, BASE)).toBe(true)
    // 基址带尾斜杠也要认（装配处两种写法都出现过）
    expect(isShellPage(`${BASE}/welcome`, `${BASE}/`)).toBe(true)
  })

  it('data: 引导窗与别的端口都不算（前缀比较带 / 边界，4318 不吃 43189）', () => {
    expect(isShellPage('data:text/html;charset=utf-8,abc', BASE)).toBe(false)
    expect(isShellPage('http://127.0.0.1:43189/session/ses_1', BASE)).toBe(false)
    expect(isShellPage('https://example.com/', BASE)).toBe(false)
  })
})

describe('sessionIdOfUrl（窗口绑定从 URL 派生，不另存状态）', () => {
  it('会话页取 id；其余页面返 null（窗口没绑定就如实说没绑定）', () => {
    expect(sessionIdOfUrl(`${BASE}/session/ses_01J8Z`)).toBe('ses_01J8Z')
    expect(sessionIdOfUrl(`${BASE}/welcome`)).toBeNull()
    expect(sessionIdOfUrl(`${BASE}/settings/keymap`)).toBeNull()
    expect(sessionIdOfUrl(`${BASE}/`)).toBeNull()
  })

  it('查询串与 hash 不参与匹配，但 id 后带它们仍取得到', () => {
    expect(sessionIdOfUrl(`${BASE}/session/ses_1?token=tk`)).toBe('ses_1')
    expect(sessionIdOfUrl(`${BASE}/session/ses_1#anchor`)).toBe('ses_1')
    // 更深一层同样取首段：web 路由只有 /session/:id，/session/x/edit 不是可达状态，
    // 宽松匹配在这种形状下最多把窗口标成"绑着 x"，不会造出一个不存在的绑定
    expect(sessionIdOfUrl(`${BASE}/session/ses_1/edit`)).toBe('ses_1')
  })

  it('空 id 不当成绑定（/session/ 结尾是 web 路由不会命中的形状，但派生函数不能回空串）', () => {
    expect(sessionIdOfUrl(`${BASE}/session/`)).toBeNull()
  })
})

describe('windowUrlOf（新窗口起始 URL）', () => {
  it('给了会话直达该会话，没给落根（/ → /welcome 由 web 路由负责）', () => {
    expect(windowUrlOf(BASE, null)).toBe(`${BASE}/`)
    expect(windowUrlOf(BASE, 'ses_1')).toBe(`${BASE}/session/ses_1`)
    expect(windowUrlOf(`${BASE}/`, 'ses_1')).toBe(`${BASE}/session/ses_1`)
  })

  it('会话 id 进 URL 前转义（id 是 ULID 不含特殊字符，但派生 URL 不赌上游口径）', () => {
    expect(windowUrlOf(BASE, 'a/b')).toBe(`${BASE}/session/a%2Fb`)
  })
})

describe('windowLabelOf（窗口显示名）', () => {
  it('有标题用标题（web 把 document.title 设成会话标题）', () => {
    expect(windowLabelOf('重构登录模块', 1)).toBe('重构登录模块')
    expect(windowLabelOf('  带空白的标题  ', 2)).toBe('带空白的标题')
  })

  it('标题是 Spark 或空则退到「窗口 N」——不退到会话 id（ULID 在菜单里读不出区别）', () => {
    expect(windowLabelOf('Spark', 1)).toBe('窗口 1')
    expect(windowLabelOf('', 3)).toBe('窗口 3')
    expect(windowLabelOf('   ', 4)).toBe('窗口 4')
  })
})

describe('pickRevealTarget（唤窗目标 = 最近聚焦）', () => {
  it('最近聚焦的窗口在列表里就唤它', () => {
    const a = { id: 'a' }
    const b = { id: 'b' }
    expect(pickRevealTarget([a, b], b)).toBe(b)
  })

  it('最近聚焦的已被销毁则退到第一个；空列表返 null', () => {
    const a = { id: 'a' }
    const gone = { id: 'gone' }
    expect(pickRevealTarget([a], gone)).toBe(a)
    expect(pickRevealTarget([a], null)).toBe(a)
    expect(pickRevealTarget([], a)).toBeNull()
    expect(pickRevealTarget([], null)).toBeNull()
  })
})
