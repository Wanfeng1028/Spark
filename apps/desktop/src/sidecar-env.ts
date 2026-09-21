/**
 * sidecar 子进程 env 装配（阶段十九工单 19.31 / V2-06 桌面半边）：桌面设置
 * （`~/.spark/desktop.json` 的 `certificates.nodeExtraCaCerts`）→ `NODE_EXTRA_CA_CERTS`。
 *
 * 独立模块 + 纯函数：main.ts 引 electron，不可单测，注入链路的判据都放这里。
 * Node 只在进程启动时读 NODE_EXTRA_CA_CERTS，运行期改 desktop.json 不影响已起的
 * sidecar——生效时机是「重启桌面应用」（壳退出即 SIGTERM sidecar），故设置行只读回显
 * 当前进程实际读到的值（19.13 裁决：不提供"保存后生效"的假控件）。
 */

export function buildSidecarEnv(opts: {
  baseEnv: NodeJS.ProcessEnv
  nodeExtraCaCerts: string | null
  port: number
  webDist: string
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...opts.baseEnv,
    ELECTRON_RUN_AS_NODE: '1',
    SPARK_PORT: String(opts.port),
    SPARK_HOST: '127.0.0.1',
    SPARK_WEB_DIST: opts.webDist,
  }
  // 空串/纯空白 = 未配置，不设该键（未配置时保留继承值——从终端带 env 启动的形态照旧可用）
  const ca = opts.nodeExtraCaCerts?.trim() ?? ''
  // 路径有效性不在壳侧兜：以配置值为准原样注入，读不到文件由 Node 自己在 sidecar 启动时
  // 裁决（早退即走 AUD-12 引导窗）——壳侧静默丢弃配置只会掩盖真因
  if (ca !== '') env.NODE_EXTRA_CA_CERTS = ca
  return env
}
