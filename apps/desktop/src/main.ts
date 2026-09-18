/**
 * Spark 桌面壳主进程（阶段五工单 5.1，ADR D14：sidecar 模式）。
 *
 * 职责只有三件事：
 *  1. 拉起 server sidecar——用 Electron 自带二进制以 ELECTRON_RUN_AS_NODE=1 跑
 *     server 单文件 bundle（用户机零 Node 依赖；打包产物 resources/server/index.mjs）；
 *  2. 轮询 /api/healthz 直到就绪（server listen 成功即引擎可用）；
 *  3. BrowserWindow 加载 http://127.0.0.1:<port>——Web 前端与 HttpTransport 零改动复用
 *     （doc/02 §1.2：desktop 复用同一 HttpTransport）。
 *
 * 退出：SIGTERM sidecar（Windows 上为强制终止，崩溃一致性由 durable 日志 +
 * resume 补闭合兜底——阶段三 kill -9 验收已覆盖该路径）。
 * sidecar 意外退出：就绪后崩溃 = 壳没有数据源，跟随退出；就绪前早退（AUD-12，
 * 典型根因 = models.json 缺失抛 ConfigError）= showFatalWindow 引导窗替代静默
 * 秒退——展示原因/stderr 尾部、配置指引与日志位置，用户关窗即退出。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, net, Notification } from 'electron'
import { startNotifications } from './notify-wiring.js'
import { renderFatalHtml } from './fatal.js'

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
/** sidecar stderr 尾部环形缓冲（AUD-12） */
const stderrTail: string[] = []

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

function startSidecar(port: number): ChildProcess {
  const serverJs = serverBundlePath()
  if (!existsSync(serverJs)) {
    throw new Error(`E_SIDECAR_START: server bundle 不存在（${serverJs}）——先执行 pnpm --filter @spark/desktop build`)
  }
  const child = spawn(process.execPath, [serverJs], {
    cwd: homedir(), // 引擎默认会话工作区 = 用户主目录（桌面态无项目上下文）
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      SPARK_PORT: String(port),
      SPARK_HOST: '127.0.0.1',
      SPARK_WEB_DIST: webDistPath(),
    },
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

async function main(): Promise<void> {
  // AUD-12：启动序列（取端口/拉 sidecar/探活）失败 → 引导窗，不再静默 app.exit(1)。
  // 首启失败的典型根因（models.json 缺失抛 ConfigError）只有 stderr 可见，随窗展示
  let port: number
  try {
    port = await pickPort()
    sidecar = startSidecar(port)
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

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Spark',
    // WO-025：显式声明安全缺省（同 fatalWin）
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // WO-025：只允许本机 sidecar 页面——外部导航一律交给系统浏览器（§7.4），
  // 禁 window.open 弹窗
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://127.0.0.1:')) e.preventDefault()
  })
  await win.loadURL(`http://127.0.0.1:${port}`)

  // 工单 12.7：回合完成/审批等待系统通知（壳层第四件事——D14 补记）
  startNotifications({
    port,
    win,
    NotificationCtor: Notification,
    configPath: join(homedir(), '.spark', 'desktop.json'),
  })
}

app.on('window-all-closed', () => {
  app.quit()
})

// 优雅退出：SIGTERM sidecar，5s 未退则 SIGKILL；sidecar 退出后再放行 app 退出
app.on('will-quit', (event) => {
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
