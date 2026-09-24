/**
 * 多窗口多会话的纯判据（阶段十九工单 19.33 / V2-20）。
 *
 * 与 main.ts 的分工同 window-behavior.ts：这里只出判断（URL ↔ 会话绑定、窗口显示名、
 * 唤窗目标、壳内页面判定），BrowserWindow / Menu / Tray 的调用全在壳层——否则本模块
 * 不可单测。
 *
 * 绑定口径：**窗口绑定不是一份单独维护的状态，而是从窗口当前 URL 派生**。web 是
 * BrowserRouter（`/session/:sessionId`），用户在窗口里切会话即改 URL，派生值随之更新；
 * 若另存一份"这个窗口属于哪个会话"，切会话后它就是假的（禁假状态）。
 */

/** 去掉尾斜杠的基址（`http://127.0.0.1:4318/` 与不带斜杠的形式在比较时要同一个形状） */
function trimBase(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

/**
 * 壳内页面判定：只有 sidecar 基址下的页面算工作窗口。
 * 引导窗（fatal / 首启）是 `data:text/html` 页，进了窗口菜单点它只会得到一张启动失败提示。
 * 前缀比较带 `/` 边界——`…:4318` 不得把 `…:43189` 也算进来。
 */
export function isShellPage(url: string, baseUrl: string): boolean {
  const base = trimBase(baseUrl)
  return url === base || url === `${base}/` || url.startsWith(`${base}/`)
}

/**
 * 会话页 URL → 绑定的会话 id；非会话页（/welcome、/settings/…）返 null。
 * 查询串与 hash 不参与匹配（web 路由不用它们承载会话）。
 */
export function sessionIdOfUrl(url: string): string | null {
  const m = /^https?:\/\/[^/]*\/session\/([^/?#]+)/.exec(url)
  if (m === null) return null
  // 捕获组用了 `+`，命中即非空；此处只兜 noUncheckedIndexedAccess 的 undefined
  return m[1] ?? null
}

/**
 * 新窗口起始 URL：给了会话就直达该会话（第二个窗口看同一个会话是合法用法——
 * 例如一边跑长任务一边翻旧记录），否则落 web 根（`/` → `/welcome` 由 web 路由负责）。
 */
export function windowUrlOf(baseUrl: string, sessionId: string | null): string {
  const base = trimBase(baseUrl)
  return sessionId === null ? `${base}/` : `${base}/session/${encodeURIComponent(sessionId)}`
}

/**
 * 窗口显示名。web 会把 document.title 设成会话标题（工单 19.33 同批），故正常情况
 * 直接用标题；标题还是 index.html 的 `Spark` 或空（页面未加载完 / 旧版前端）时退到
 * 「窗口 N」——**不回退到会话 id**：ULID 串在菜单里既读不出区别也占满宽度。
 */
export function windowLabelOf(title: string, ordinal: number): string {
  const t = title.trim()
  return t === '' || t === 'Spark' ? `窗口 ${String(ordinal)}` : t
}

/**
 * 唤窗目标（托盘点击 / 通知点击 / macOS activate 共用）：最近聚焦的那个窗口。
 * 多窗口下"唤回主窗口"是有歧义的——用户心里的"主"是他刚才在用的那个。
 * 最近聚焦的窗口已经不在列表里（被销毁）则退到第一个；一个都没有返 null。
 */
export function pickRevealTarget<T>(windows: readonly T[], lastFocused: T | null): T | null {
  if (windows.length === 0) return null
  if (lastFocused !== null && windows.includes(lastFocused)) return lastFocused
  return windows[0] ?? null
}
