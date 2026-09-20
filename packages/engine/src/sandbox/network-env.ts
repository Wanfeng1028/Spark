/**
 * bash 出口引导环境变量（阶段十九 19.7 / ADR D50）：allowlist 档时注入命令环境，
 * 尊重代理设置的客户端（curl/wget/Node fetch 经 undici 不支持、npm 等）经本地代理
 * 过域名清单。**socks5h 而非 socks5**：主机名交给代理解析，allowlist 才能按域名判定
 * （socks5 让客户端本地解析，代理只见 IP，域名清单失效）。NO_PROXY 放行本机回环。
 * 诚实边界见 proxy.ts 头注：这是出口引导，不是内核隔离。
 */

/** 独立 shell 路径：spawn env 覆盖（在 process.env 之上） */
export function sandboxProxyEnv(port: number): Record<string, string> {
  const http = `http://127.0.0.1:${port}`
  const socks = `socks5h://127.0.0.1:${port}`
  return {
    HTTP_PROXY: http,
    http_proxy: http,
    HTTPS_PROXY: http,
    https_proxy: http,
    ALL_PROXY: socks,
    all_proxy: socks,
    NO_PROXY: 'localhost,127.0.0.1,::1',
    no_proxy: 'localhost,127.0.0.1,::1',
  }
}

/**
 * 常驻 shell 路径：每条命令前插 export 行（不改 BashShellPool 签名）。
 * 常驻 shell 的环境跨调用保持，创建时注入 env 会在模式热切换后 fail-open
 * （旧 shell 没有代理变量却仍被执行）——逐命令前缀保证 allowlist 档**始终**生效。
 */
export function sandboxProxyExportLine(port: number): string {
  const entries = Object.entries(sandboxProxyEnv(port))
    .map(([k, v]) => `${k}=${shellSingleQuote(v)}`)
    .join(' ')
  return `export ${entries}`
}

/** POSIX 单引号安全编码（与 bash-pool shellQuote 同规则，此处自足避免循环依赖） */
function shellSingleQuote(v: string): string {
  return `'${v.replaceAll("'", "'\\''")}'`
}
