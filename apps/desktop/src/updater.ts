/**
 * 自更新判据（工单 19.34；electron-updater + GitHub Releases feed）。
 * 纯判据模块——electron-updater 本体（网络/下载/安装器交互）不进单测，判定面在这里
 * 把关（同 multi-window/window-behavior 的分工纪律）。差分更新由 electron-updater
 * 对 NSIS 目标自动启用（消费同 release 的 .blockmap），本模块无需配置。
 *
 * 发布链口径：electron-builder.yml publish=github（Wanfeng1028/Spark），tag 推送时
 * release.yml 的 desktop job 构建 NSIS 产物并发布（latest.yml + .blockmap 同批上传，
 * feed 才完整）；代码签名挂起待证书采购（无签名不分发——19.34 卡面红线，Windows
 * 无签名 exe 只在自更场景从自家 Releases 拉取，不对外分发安装包）。
 */
import type { AppUpdater } from 'electron-updater'

/** GitHub Releases feed 元组（owner/repo 单源；electron-builder.yml 的 publish 段与之对账） */
export const UPDATE_FEED = { owner: 'Wanfeng1028', repo: 'Spark' } as const

/**
 * 本进程该不该跑自动更新：
 * - 打包态才跑（app.isPackaged=false 的开发/测试态永不自更——自己更新自己只发生在
 *   用户装的 exe 里）；
 * - desktop.json `autoUpdate: false` 显式关（缺省开）；
 * - 环境变量 SPARK_SKIP_AUTO_UPDATE=1 供 CI/走查临时关（不进 desktop.json 的运行时开关，
 *   与 SPARK_PORT 同类的进程级逃生口）。
 */
export function shouldAutoUpdate(opts: {
  isPackaged: boolean
  autoUpdate: boolean
  env?: Readonly<Record<string, string | undefined>>
}): boolean {
  if (!opts.isPackaged) return false
  if (!opts.autoUpdate) return false
  if (opts.env?.SPARK_SKIP_AUTO_UPDATE === '1') return false
  return true
}

/**
 * 挑选可安装的更新资产名（dry-run 判据：发布链产物自检）。
 * electron-updater 对 win nsis 需要 `*.exe` + `latest.yml` + `*.exe.blockmap` 三件齐
 * 才能走差分；本函数按文件名清单核验收——发布后缺件 = feed 不完整，提前在 CI 报红。
 */
export function missingUpdateAssets(files: readonly string[]): string[] {
  const has = (pred: (f: string) => boolean): boolean => files.some(pred)
  const missing: string[] = []
  if (!has((f) => f.endsWith('.exe'))) missing.push('*.exe')
  if (!has((f) => f.endsWith('.blockmap'))) missing.push('*.exe.blockmap')
  if (!has((f) => f === 'latest.yml')) missing.push('latest.yml')
  return missing
}

/**
 * electron-updater 事件 → 人话状态行（设置页/日志用；不暴露原始英文枚举给界面）。
 * 错误只映射已知类：其余原样透传 message（不吞不猜）。
 */
export function updaterStateText(
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error',
  detail?: string,
): string {
  switch (state) {
    case 'checking':
      return '正在检查更新…'
    case 'available':
      return `发现新版本${detail !== undefined ? `（${detail}）` : ''}，后台下载中`
    case 'not-available':
      return '已是最新版本'
    case 'downloading':
      return detail !== undefined ? `下载中 ${detail}` : '下载中…'
    case 'downloaded':
      return '更新已就绪，重启桌面应用后安装'
    case 'error':
      return `更新检查失败：${detail ?? '未知错误'}`
  }
}

/** 把 autoUpdater 的事件接到日志出口（main 进程装配用；状态机在此单点，事件面不散） */
export function wireUpdaterEvents(
  updater: AppUpdater,
  log: (line: string) => void,
): void {
  updater.on('checking-for-update', () => log(updaterStateText('checking')))
  updater.on('update-available', (info) => log(updaterStateText('available', info.version)))
  updater.on('update-not-available', () => log(updaterStateText('not-available')))
  updater.on('download-progress', (p) =>
    log(updaterStateText('downloading', `${Math.round(p.percent)}%`)),
  )
  updater.on('update-downloaded', () => log(updaterStateText('downloaded')))
  updater.on('error', (err) => log(updaterStateText('error', err.message)))
}
