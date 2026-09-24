/**
 * Spark 桌面壳主进程（阶段五工单 5.1，ADR D14：sidecar 模式）。
 *
 * 职责只有四件事：
 *  1. 拉起 server sidecar——用 Electron 自带二进制以 ELECTRON_RUN_AS_NODE=1 跑
 *     server 单文件 bundle（用户机零 Node 依赖；打包产物 resources/server/index.mjs）；
 *     env 装配含桌面设置里的自定义 CA → NODE_EXTRA_CA_CERTS（工单 19.31，见 sidecar-env.ts）；
 *  2. 轮询 /api/healthz 直到就绪（server listen 成功即引擎可用）；
 *  3. BrowserWindow 加载 http://127.0.0.1:<port>——Web 前端与 HttpTransport 零改动复用
 *     （doc/02 §1.2：desktop 复用同一 HttpTransport）；
 *  4. 壳层行为（工单 19.30）：托盘 + 关窗隐藏 / 保持运行（powerSaveBlocker）/ 开机自启
 *     / 系统通知（12.7，含断线重连）——判据全在纯模块（window-behavior.ts / notify.ts /
 *     notify-stream.ts / tray-icon.ts），本文件只做 Electron 调用与装配；
 *  5. 多窗口多会话（工单 19.33）：BrowserWindow 多实例 + 窗口↔会话绑定（从窗口 URL 派生，
 *     不另存状态）+ 应用菜单的「窗口」子菜单与托盘逐窗列项——判据在 multi-window.ts。
 *
 * 退出：SIGTERM sidecar（Windows 上为强制终止，崩溃一致性由 durable 日志 +
 * resume 补闭合兜底——阶段三 kill -9 验收已覆盖该路径）。关窗隐藏（desktop.json
 * hideOnClose，工单 19.30）期间 sidecar 不退出：通知照常弹，点击唤回窗口。
 * sidecar 意外退出：就绪后崩溃 = 壳没有数据源，跟随退出；就绪前早退（AUD-12，
 * 典型根因 = models.json 缺失抛 ConfigError）= showFatalWindow 引导窗替代静默
 * 秒退——展示原因/stderr 尾部、配置指引与日志位置，用户关窗即退出。
 * 首启检测（RT3-01 / WO-083）：models.json 缺失 → 先出引导窗（模板+打开配置目录），
 * 文件出现自动续启——不再白起一个必然 E_CONFIG 早退的 sidecar（壳侧方案，doc/10
 * AUD-12 判例 A：不动 server 生命周期语义）。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  net,
  Notification,
  powerSaveBlocker,
  shell,
  Tray,
} from 'electron'
import { startNotifications, type NotifyWiring } from './notify-wiring.js'
import { loadDesktopConfig, type DesktopConfig } from './notify.js'
import { renderFatalHtml, renderFirstRunHtml } from './fatal.js'
import { buildSidecarEnv } from './sidecar-env.js'
import { buildTrayBitmap, TRAY_ICON_PX } from './tray-icon.js'
import {
  isShellPage,
  pickRevealTarget,
  sessionIdOfUrl,
  windowLabelOf,
  windowUrlOf,
} from './multi-window.js'
import { decideCloseAction, resolveAutoLaunch, SleepBlocker } from './window-behavior.js'
import type { MenuItemConstructorOptions } from 'electron'

const START_TIMEOUT_MS = 20_000
const PROBE_INTERVAL_MS = 250
/** stderr 环形缓冲行数（AUD-12：首启失败引导窗展示尾部现场） */
const STDERR_TAIL_LINES = 20

let sidecar: ChildProcess | null = null
let quitting = false
/** 服务端是否就绪（AUD-12：就绪前早退走引导窗；就绪后崩溃保留既有跟随退出语义） */
let ready = false
/** 首启失败引导窗（AUD-12）；null = 未显示 */
let fatalWin: BrowserWindow | null = null
/** RT3-01 首启引导窗；null = 未显示/已关闭 */
let firstRunWin: BrowserWindow | null = null
/** sidecar stderr 尾部环形缓冲（AUD-12） */
const stderrTail: string[] = []
/** 最近聚焦的壳内窗口（19.33）：多窗口下"唤回主窗口"是有歧义的，托盘/通知/activate 一律唤它 */
let lastFocused: BrowserWindow | null = null
/** sidecar 基址（19.33：判定壳内页面与拼新窗口 URL 都要它；就绪后才有值） */
let shellBase = ''
/** 桌面设置（19.33：菜单里「新建窗口」在 main() 之外触发，关窗判据要能读到 hideOnClose） */
let shellCfg: DesktopConfig | null = null
/** 托盘（创建失败即为 null——hideOnClose 随之退化为退出，见 decideCloseAction） */
let tray: Tray | null = null
/** 通知订阅句柄（退出前 stop：不让重连循环在收尾阶段继续打 sidecar） */
let notify: NotifyWiring | null = null
/** 保持运行的持锁生命周期（19.30 keepAwake）：will-quit 无条件 release，防 powerSaveBlocker 泄漏 */
const sleepBlocker = new SleepBlocker(powerSaveBlocker, (m) => console.warn(`[desktop] ${m}`))

function noteStderr(chunk: string): void {
  for (const line of chunk.split('\n')) {
    if (line === '') continue
    stderrTail.push(line)
    if (stderrTail.length > STDERR_TAIL_LINES) stderrTail.shift()
  }
}

function stderrTailText(): string {
  return stderrTail.length === 0 ? '' : `\n\nstderr 尾部：\n${stderrTail.join('\n')}`
}

/** sidecar 单文件 bundle：打包态在 resources/server；开发态在 apps/desktop/build/server */
function serverBundlePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'server', 'index.mjs')
    : join(__dirname, '..', 'build', 'server', 'index.mjs')
}

/** Web 构建产物：打包态在 resources/web；开发态直接指向 apps/web/dist（需先 pnpm --filter @spark/web build） */
function webDistPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '..', '..', 'web', 'dist')
}

/** 本地抓一个空闲端口（listen 0 → 取端口 → 关闭；本地量级竞态可忽略） */
function pickPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (typeof addr !== 'object' || addr === null) {
        reject(new Error('E_SIDECAR_START: 无法获取空闲端口'))
        return
      }
      srv.close(() => resolve(addr.port))
    })
  })
}

function startSidecar(port: number, cfg: DesktopConfig): ChildProcess {
  const serverJs = serverBundlePath()
  if (!existsSync(serverJs)) {
    throw new Error(`E_SIDECAR_START: server bundle 不存在（${serverJs}）——先执行 pnpm --filter @spark/desktop build`)
  }
  const child = spawn(process.execPath, [serverJs], {
    cwd: homedir(), // 引擎默认会话工作区 = 用户主目录（桌面态无项目上下文）
    env: buildSidecarEnv({
      baseEnv: process.env,
      nodeExtraCaCerts: cfg.certificates.nodeExtraCaCerts,
      port,
      webDist: webDistPath(),
    }),
    // AUD-12：stderr 收管道——环形留尾部 20 行，首启失败时进引导窗（stdout 保持 inherit）
    stdio: ['ignore', 'inherit', 'pipe'],
    windowsHide: true,
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    noteStderr(chunk)
    process.stderr.write(chunk) // 开发态 stderr 照常可见（与原 inherit 行为一致）
  })
  return child
}

/**
 * 首启失败引导窗（AUD-12）：替代静默秒退——显示原因（含 stderr 尾部现场）+
 * 配置指引（models.json / 应用内引导）+ 日志位置。不立即退出：用户关窗即退出
 * （window-all-closed → app.quit）。ready 之后的运行期故障不走此窗。
 */
function showFatalWindow(reason: string): void {
  console.error('[desktop] 启动失败：', reason)
  if (fatalWin !== null) {
    fatalWin.focus() // 已有引导窗（如探活超时后 sidecar 又早退）——只聚焦不重复弹
    return
  }
  fatalWin = new BrowserWindow({
    width: 480,
    height: 360,
    title: 'Spark',
    // WO-025：显式声明安全缺省（Electron 44 缺省已安全——显式化防未来漂移）
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  const html = renderFatalHtml({
    title: 'Spark 启动失败',
    reason,
    sparkDir: join(homedir(), '.spark'),
    logHint: join(homedir(), '.spark', 'logs'),
  })
  void fatalWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err: unknown) => {
    // 引导窗都加载失败（理论不该发生）：退回报错退出，不留悬空进程
    console.error('[desktop] 引导窗加载失败', err)
    fatalWin = null
    app.exit(1)
  })
}

/**
 * 首启引导窗（RT3-01 / WO-083）：全新用户 models.json 缺失时，sidecar 必然
 * E_CONFIG 早退——先给"配什么/放哪里/密钥纪律"的引导页并打开配置目录，
 * 文件出现后自动继续启动（轮询，无需重启应用）。壳侧方案（doc/10 AUD-12
 * 判例 A：不动 server 生命周期语义——engine 的 E_CONFIG 拒绝无配置启动不变）。
 */
function showFirstRunWindow(sparkDir: string, modelsPath: string): void {
  firstRunWin = new BrowserWindow({
    width: 560,
    height: 480,
    title: 'Spark',
    // WO-025：显式声明安全缺省（同 fatalWin）
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  firstRunWin.on('closed', () => {
    firstRunWin = null
  })
  const html = renderFirstRunHtml({ sparkDir, modelsPath })
  void firstRunWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err: unknown) => {
    console.error('[desktop] 首启引导窗加载失败', err)
    firstRunWin = null
    app.exit(1)
  })
}

/**
 * RT3-01 首启检测：models.json 存在 → 直接放行；缺失 → 引导窗 + 打开配置目录，
 * 每 1.5s 复查，文件出现即关窗续启。返回 false = 用户关闭引导窗（随
 * window-all-closed 退出，不再拉 sidecar）。
 */
async function waitForFirstRunConfig(sparkDir: string, modelsPath: string): Promise<boolean> {
  if (existsSync(modelsPath)) return true
  mkdirSync(sparkDir, { recursive: true }) // 引导动作前提：openPath 需要目录存在
  showFirstRunWindow(sparkDir, modelsPath)
  void shell.openPath(sparkDir).then((errMsg) => {
    // openPath 以 resolve('') / resolve(错误说明) 表达成败（不 reject）；打不开（罕见）
    // 时引导页文案本身已含完整路径，不阻断流程
    if (errMsg !== '') console.error('[desktop] 打开配置目录失败', errMsg)
  })
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500))
    if (firstRunWin === null) return false // 用户关窗退出
    if (existsSync(modelsPath)) {
      firstRunWin.destroy() // 触发 closed → 引用置 null；配置无效时走既有 fatal 窗路径
      return true
    }
  }
}

/** 轮询探活直到 200 / 超时抛错（失败闭合：不静默降级） */
async function waitReady(port: number): Promise<void> {
  const url = `http://127.0.0.1:${port}/api/healthz`
  const deadline = Date.now() + START_TIMEOUT_MS
  for (;;) {
    if (sidecar?.exitCode !== null && sidecar !== null) {
      throw new Error(`E_SIDECAR_START: server 进程已退出（code=${sidecar.exitCode}）`)
    }
    try {
      const res = await net.fetch(url)
      if (res.ok) return
    } catch {
      // 尚未 listen——继续轮询（探活期连接拒绝是预期状态）
    }
    if (Date.now() > deadline) {
      throw new Error(`E_SIDECAR_START: server ${START_TIMEOUT_MS}ms 内未就绪（${url}）`)
    }
    await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS))
  }
}

/**
 * 壳内窗口清单（19.33）：以 Electron 的活窗口为事实源再按基址过滤，不另存一份注册表——
 * 另存的表要与窗口生死同步，漏一处就是菜单里点一个已销毁的窗口。
 * 引导窗（fatal / 首启）是 data: 页，被 isShellPage 挡在外面。
 */
function shellWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && isShellPage(w.webContents.getURL(), shellBase),
  )
}

/** 唤回一个窗口：隐藏态下 isMinimized() 为 false，必须先 show() 再 focus()——只 focus 唤不出来 */
function revealWindow(win: BrowserWindow | null): void {
  if (win === null || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/**
 * 唤回目标窗口（19.30 的「唤回主窗口」在多窗口下的口径）：最近聚焦的那个。
 * 托盘点击 / 托盘菜单 / 通知点击 / macOS activate 共用——用户心里的"主窗口"是他刚才在用的那个。
 */
function revealTargetWindow(): void {
  revealWindow(pickRevealTarget(shellWindows(), lastFocused))
}

/**
 * 开一个新壳窗口（19.33）：sessionId 给了就直达该会话（同一个会话开两个窗口是合法用法——
 * 一边跑长任务一边翻旧记录），没给就落 web 根。窗口与会话的绑定不另存状态，从 URL 派生
 * （见 multi-window.ts 头注）。安全缺省与导航白名单沿用 WO-025 口径。
 */
async function openWindow(sessionId: string | null): Promise<void> {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Spark',
    // WO-025：显式声明安全缺省（同 fatalWin）
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // 关窗行为（19.30）：hideOnClose 且托盘可用 → 隐藏（sidecar 与通知继续跑）；否则维持
  // 既有语义销毁窗口。多窗口下每个窗口一律同一口径——不给"次窗口另有一套"的例外，
  // 例外会让"关了却还在托盘里"变成只有某些窗口才有的行为。
  win.on('close', (event) => {
    const action = decideCloseAction({
      hideOnClose: shellCfg?.hideOnClose ?? false,
      trayReady: tray !== null,
      quitting,
    })
    if (action === 'quit') return
    event.preventDefault()
    win.hide()
  })
  win.on('closed', () => {
    if (lastFocused === win) lastFocused = null
    refreshMenus()
  })
  // WO-025：只允许本机 sidecar 页面——外部导航一律交给系统浏览器（§7.4）。
  // 19.33 尾巴③：web 的「在新窗口打开此会话」走 window.open，本机页面由壳自己开一个
  // 新壳窗口——**不用 `action: 'allow'`**：那会让 Electron 按它自己的一套缺省
  // webPreferences 建窗，绕过本文件里显式声明的安全缺省（WO-025 的整个意义就在此）。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isShellPage(url, shellBase)) void openWindow(sessionIdOfUrl(url))
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://127.0.0.1:')) e.preventDefault()
  })
  // 窗口菜单的标签来自 webContents.getTitle()（web 把 document.title 设成会话标题，19.33 同批）；
  // SPA 内切会话是 in-page 导航，两个事件都要听，否则菜单里的绑定与标题会停在开窗那一刻
  win.webContents.on('page-title-updated', () => refreshMenus())
  win.webContents.on('did-navigate-in-page', () => refreshMenus())
  win.webContents.on('did-navigate', () => refreshMenus())
  await win.loadURL(windowUrlOf(shellBase, sessionId))
  refreshMenus()
}

/**
 * 菜单重建（19.33「窗口菜单」+ 19.30 托盘）：应用菜单与托盘菜单一起刷。
 * 应用菜单：文件/编辑/视图三项走 Electron role（编辑的角色项在 macOS 上是复制粘贴撤销的
 * 必经之路，不用 role 就得自己重实现一遍系统行为），窗口项列出各壳窗口并可点击唤回，
 * radio + checked 标出最近聚焦的那个。
 * 每次窗口生死/标题/焦点变化都重建——菜单模板是快照，不重建就会列出已经关掉的窗口。
 * 「新建窗口」刻意不带加速键：键位单一来源是 protocol KEYMAP（19.39），壳层自造一个
 * Ctrl+Shift+N 会变成表外的第五个快捷键面，登记为 19.33 尾巴待与 KEYMAP 的 surface 口径一并定。
 *
 * 托盘菜单为什么要逐窗列项：hideOnClose 下窗口是隐藏不是销毁，全部隐藏后 Windows/Linux
 * 的菜单栏随窗口一起不可见，托盘是唯一回路——只有「显示最近聚焦窗口」一项就等于把其余
 * 隐藏窗口藏成找不回来。单窗口时不列（与「显示窗口」重复）。
 */
function refreshMenus(): void {
  if (shellBase === '') return
  const wins = shellWindows()
  const winItems: MenuItemConstructorOptions[] = wins.map((w, i) => ({
    label: windowLabelOf(w.webContents.getTitle(), i + 1),
    type: 'radio',
    checked: w === lastFocused,
    click: () => revealWindow(w),
  }))
  // 平台差异项先落成带注解的常量再展开：`as` 断言会把 role 字面量放宽成 string，
  // 注解写法让 TS 直接按 role 联合校验（也更平——不用读者去确认那个断言是否安全）
  const darwinOnly: MenuItemConstructorOptions[] =
    process.platform === 'darwin' ? [{ role: 'appMenu' }] : []
  const darwinZoom: MenuItemConstructorOptions[] =
    process.platform === 'darwin' ? [{ role: 'zoom' }] : []
  const windowList: MenuItemConstructorOptions[] =
    winItems.length > 0 ? [{ type: 'separator' }, ...winItems] : []
  const template: MenuItemConstructorOptions[] = [
    ...darwinOnly,
    {
      label: '文件',
      submenu: [
        { label: '新建窗口', click: () => void openWindow(null) },
        {
          label: '在新窗口打开当前会话',
          click: () => {
            const target = pickRevealTarget(wins, lastFocused)
            void openWindow(target === null ? null : sessionIdOfUrl(target.webContents.getURL()))
          },
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: '窗口',
      submenu: [{ role: 'minimize' }, ...darwinZoom, ...windowList],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  if (tray !== null) {
    // 单窗口不逐窗列项：与「显示窗口」重复
    const trayWindowList: MenuItemConstructorOptions[] =
      wins.length > 1 ? [{ type: 'separator' }, ...winItems] : []
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示窗口', click: () => revealTargetWindow() },
        { label: '新建窗口', click: () => void openWindow(null) },
        ...trayWindowList,
        { type: 'separator' },
        { label: '退出 Spark', click: () => app.quit() },
      ]),
    )
  }
}

/**
 * 托盘（19.30）：唤窗 / 新建窗口 / 退出（退出走 app.quit()，与窗口关闭按钮同一路径）。
 * 菜单内容随后由 refreshMenus() 统一重建（多窗口时逐窗列项）——这里先给一份同形的初始菜单，
 * 不让托盘在首窗加载完成前处于"右键没反应"的状态。
 * Linux 缺 app-indicator 时 new Tray 会抛：调用方 catch 后置 null，hideOnClose 自动退化
 * 为退出（不会把应用藏成一个找不回来的进程）。
 */
function createTray(): Tray {
  const image = nativeImage.createFromBitmap(buildTrayBitmap(TRAY_ICON_PX), {
    width: TRAY_ICON_PX,
    height: TRAY_ICON_PX,
  })
  // macOS：按菜单栏配色单色渲染（我们的位图是黑环白心，template 化后由系统决定明暗）。
  // 章打在 NativeImage 上——Electron 44 的类型面里 setTemplateImage 属于 NativeImage，
  // Tray 上没有该方法（运行期同机制，new Tray(image) 直接吃这张图）
  if (process.platform === 'darwin') image.setTemplateImage(true)
  const t = new Tray(image)
  t.setToolTip('Spark')
  // 左键直接唤窗（Windows 托盘的习惯动作），右键出菜单；macOS 单击也是唤窗
  t.on('click', () => revealTargetWindow())
  t.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示窗口', click: () => revealTargetWindow() },
      { label: '新建窗口', click: () => void openWindow(null) },
      { type: 'separator' },
      { label: '退出 Spark', click: () => app.quit() },
    ]),
  )
  return t
}

/** 保持运行 / 开机自启（19.30）：判据在 window-behavior.ts，这里只落 Electron 调用 */
function applyDesktopBehavior(cfg: DesktopConfig): void {
  sleepBlocker.apply(cfg.keepAwake)
  const login = resolveAutoLaunch(cfg, { platform: process.platform, packaged: app.isPackaged })
  if (login.note !== null) console.warn(`[desktop] ${login.note}`)
  if (login.supported) app.setLoginItemSettings({ openAtLogin: login.openAtLogin })
}

async function main(): Promise<void> {
  // RT3-01（WO-083）：首启检测先行——models.json 缺失时引导配置而不是拉起必失败的
  // sidecar；文件出现后自动续启。用户关窗引导 = 返回 false，随 window-all-closed 退出
  const sparkDir = join(homedir(), '.spark')
  if (!(await waitForFirstRunConfig(sparkDir, join(sparkDir, 'models.json')))) return
  // 工单 19.31：桌面设置在拉起 sidecar 前装载——NODE_EXTRA_CA_CERTS 只在进程启动时生效，
  // 装载晚于 spawn 就等于这一版配置整个启动周期不生效（坏配置回缺省并 warn，不静默）
  const desktopConfigPath = join(sparkDir, 'desktop.json')
  const desktopCfg = loadDesktopConfig(desktopConfigPath, (m) => console.warn(m))
  // 19.33：菜单里「新建窗口」在 main() 之外触发，关窗判据要能读到这份配置
  shellCfg = desktopCfg
  // AUD-12：启动序列（取端口/拉 sidecar/探活）失败 → 引导窗，不再静默 app.exit(1)。
  // 首启失败的典型根因（models.json 缺失抛 ConfigError）只有 stderr 可见，随窗展示
  let port: number
  try {
    port = await pickPort()
    sidecar = startSidecar(port, desktopCfg)
    sidecar.on('exit', (code) => {
      if (quitting) return
      if (ready) {
        // 就绪后崩溃：壳内没有数据源可降级——跟随退出（重启即 resume 恢复），语义不变
        app.quit()
        return
      }
      // AUD-12：就绪前早退——引导窗替代静默 quit；不立即 app.quit（会销毁窗口），
      // 用户关窗即退出（window-all-closed → app.quit）
      showFatalWindow(`server 进程在就绪前退出（code=${String(code)}）。${stderrTailText()}`)
    })
    await waitReady(port)
  } catch (err) {
    showFatalWindow(`${err instanceof Error ? err.message : String(err)}${stderrTailText()}`)
    return
  }
  ready = true
  // 19.33：壳内页面判定与新窗口 URL 都以基址为准（此前散在各处的字面量收敛到这一处）
  shellBase = `http://127.0.0.1:${port}`

  // 托盘（19.30）：先于主窗口创建——hideOnClose 的判据要看托盘是否真的可用
  try {
    tray = createTray()
  } catch (err) {
    // Linux 缺 app-indicator/libappmenu 支持时 new Tray 抛错：如实报，关窗随之退化为退出
    // （decideCloseAction 的 trayReady=false 分支），不留一个"隐藏后找不回来"的进程
    console.error('[desktop] 托盘创建失败，关窗将按退出处理', err)
    tray = null
  }

  // 首窗（19.33 起与「新建窗口」共用同一条 openWindow 路径：安全缺省、导航白名单、
  // 关窗判据、标题/导航 → 菜单重建全部一处维护，不给首窗留一份手写副本）
  await openWindow(null)

  // 保持运行与开机自启（19.30）：都在窗口就绪后落地——自启注册是进程级副作用，
  // 首启失败/引导窗阶段不该写用户的登录项
  applyDesktopBehavior(desktopCfg)

  // 工单 12.7：回合完成/审批等待系统通知（壳层第四件事——D14 补记）；
  // 19.30 起断线退避重连 + 提示音/事件面/去抖窗走 desktop.json，点击唤窗
  notify = startNotifications({
    port,
    cfg: desktopCfg,
    NotificationCtor: Notification,
    reveal: revealTargetWindow,
  })
}

app.on('window-all-closed', () => {
  app.quit()
})

// macOS 惯例（19.30）：Dock 图标点击时把隐藏态的窗口唤回来（关窗隐藏形态的第二个入口）。
// 19.33：一个壳窗口都不剩时按 macOS 惯例补开一个（sidecar 未就绪则什么都不做——
// 那时 openWindow 会拼出一个空基址的 URL，加载必然失败）
app.on('activate', () => {
  if (shellWindows().length === 0) {
    if (shellBase !== '') void openWindow(null)
    return
  }
  revealTargetWindow()
})

// 焦点跟踪（19.33）：唤窗目标与菜单里的 checked 都以「最近聚焦」为准——多窗口下
// 「主窗口」是有歧义的，用户心里的主窗是他刚才在用的那个。焦点变了菜单要重建（挪勾选）。
app.on('browser-window-focus', (_e, win) => {
  lastFocused = win
  refreshMenus()
})

// 退出意图先行置位：app.quit() 会先关窗口，close 处理器要据此放行（否则 hideOnClose
// 会 preventDefault 把退出卡住）——Electron 顺序 before-quit → close → will-quit
app.on('before-quit', () => {
  quitting = true
})

// 优雅退出：SIGTERM sidecar，5s 未退则 SIGKILL；sidecar 退出后再放行 app 退出
app.on('will-quit', (event) => {
  // 19.30 收口：持锁、通知订阅、托盘都不该活过退出（powerSaveBlocker 泄漏 = 笔记本永不停止发热）
  sleepBlocker.release()
  if (notify !== null) notify.stop()
  notify = null
  if (tray !== null) {
    tray.destroy()
    tray = null
  }
  if (sidecar === null || sidecar.exitCode !== null) return
  event.preventDefault()
  quitting = true
  const child = sidecar
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000)
  child.once('exit', () => {
    clearTimeout(killTimer)
    app.quit()
  })
  child.kill()
})

void app
  .whenReady()
  .then(main)
  .catch((err: unknown) => {
    // ready 之后的故障（main 窗口创建/加载、通知装配）：stderr 报错退出，不进残废 UI。
    // AUD-12：首启序列失败已改走 showFatalWindow 引导窗，不再经此路径
    console.error(err)
    app.exit(1)
  })
