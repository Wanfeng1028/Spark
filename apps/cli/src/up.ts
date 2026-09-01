/**
 * spark up（工单 11.6）：npm 全局安装后一条命令可用——子进程拉起 server 单文件 bundle
 * （build 脚本 esbuild 产物 dist/server/index.mjs，与 desktop 5.1 sidecar 同源；
 * SPARK_PORT 注入端口，desktop 同机制）→ 轮询 /api/healthz 就绪 → 交给 TUI。
 * 已有 server 在跑则直接复用（healthz 探测命中不重复拉起）；TUI 退出后 stop()
 * 回收本命令拉起的 server 子进程（不留残留进程）。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface UpHandle {
  baseUrl: string
  /** 回收本命令拉起的 server 子进程（复用既有 server 时为空操作） */
  stop(): void
}

const HEALTH_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 200

async function healthy(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/healthz`)
    return res.ok
  } catch {
    return false
  }
}

export async function startUp(): Promise<UpHandle> {
  const port = process.env.SPARK_PORT ?? '4318'
  const baseUrl = `http://127.0.0.1:${port}`
  if (await healthy(baseUrl)) {
    process.stderr.write(`已发现运行中的 server（${baseUrl}），直接复用\n`)
    return { baseUrl, stop: () => {} }
  }

  // bundle 产物相对 dist/main.js 定位；dev（tsx 跑 src）下不存在——提示先 build，禁假状态
  const serverPath = fileURLToPath(new URL('./server/index.mjs', import.meta.url))
  if (!existsSync(serverPath)) {
    process.stderr.write(
      `缺少 server bundle（${serverPath}）。\n请先在仓库执行 pnpm install 后运行：pnpm --filter @spark/cli build\n`,
    )
    process.exit(1)
  }

  const child = spawn(process.execPath, [serverPath], {
    // SPARK_HOST 不注入——server 按缺省/用户 spark.json 绑定（非环回须显式配置且鉴权启用，ADR D24）
    env: { ...process.env, SPARK_PORT: port },
    stdio: 'ignore',
  })
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (!(await healthy(baseUrl))) {
    if (Date.now() > deadline) {
      child.kill()
      process.stderr.write(`server 启动超时（${HEALTH_TIMEOUT_MS}ms）——查看 server 日志与端口占用\n`)
      process.exit(1)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  return {
    baseUrl,
    stop: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill()
    },
  }
}
