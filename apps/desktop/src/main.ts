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
 * sidecar 意外退出：壳没有数据源，跟随退出。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, net } from 'electron'

const START_TIMEOUT_MS = 20_000
const PROBE_INTERVAL_MS = 250

let sidecar: ChildProcess | null = null
let quitting = false

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
  return spawn(process.execPath, [serverJs], {
    cwd: homedir(), // 引擎默认会话工作区 = 用户主目录（桌面态无项目上下文）
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      SPARK_PORT: String(port),
      SPARK_HOST: '127.0.0.1',
      SPARK_WEB_DIST: webDistPath(),
    },
    stdio: 'inherit',
    windowsHide: true,
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
  const port = await pickPort()
  sidecar = startSidecar(port)
  sidecar.on('exit', () => {
    // 壳内没有数据源可降级——sidecar 没了就退出（重启即 resume 恢复）
    if (!quitting) app.quit()
  })

  await waitReady(port)

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Spark',
  })
  await win.loadURL(`http://127.0.0.1:${port}`)
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
    // 启动失败（bundle 缺失/探活超时/sidecar 早退）：stderr 报错退出，不进残废 UI
    console.error(err)
    app.exit(1)
  })
