/**
 * 桌面壳窗口/托盘/电源/登录项的纯判据（阶段十九工单 19.30）：关窗隐藏还是退出、
 * 保持运行的持锁生命周期、开机自启的平台支持面。
 *
 * 与 main.ts 的分工：这里只出判断，Electron 的 BrowserWindow / Tray /
 * powerSaveBlocker / app.setLoginItemSettings 全在壳层调用——否则本模块不可单测
 * （同 notify.ts / sidecar-env.ts 的模式）。托盘图标位图另在 tray-icon.ts。
 */

export type CloseAction = 'hide' | 'quit'

/**
 * 关窗语义：hideOnClose 只在**托盘可用**时才隐藏——托盘创建失败（Linux 缺 app-indicator
 * 等）时隐藏等于应用再也找不回来，故回退退出（失败闭合）。quitting（托盘「退出」/
 * Cmd+Q / 系统注销）一律放行销毁，否则 app.quit() 会被 preventDefault 卡死。
 */
export function decideCloseAction(opts: {
  hideOnClose: boolean
  trayReady: boolean
  quitting: boolean
}): CloseAction {
  if (opts.quitting) return 'quit'
  if (!opts.hideOnClose) return 'quit'
  return opts.trayReady ? 'hide' : 'quit'
}

export interface AutoLaunchDecision {
  /** 本平台本次能不能改登录项（false = 不调 setLoginItemSettings） */
  supported: boolean
  openAtLogin: boolean
  /** 需要如实告知用户的话（无则 null）——配了不生效还不吭声即假配置 */
  note: string | null
}

/**
 * 开机自启（app.setLoginItemSettings）：Electron 只实现 Windows/macOS，Linux 需桌面
 * autostart 条目（本仓打包面也只有 win nsis）；开发态（未打包）不注册——那会把
 * electron.exe 写进用户登录项。不可生效时只有用户真配了 true 才 warn（缺省 false 无话可说）。
 */
export function resolveAutoLaunch(
  cfg: { autoLaunch: boolean },
  env: { platform: NodeJS.Platform; packaged: boolean },
): AutoLaunchDecision {
  if (env.platform === 'linux') {
    return {
      supported: false,
      openAtLogin: false,
      note: cfg.autoLaunch ? '开机自启仅 Windows/macOS 实现，Linux 上 autoLaunch 不生效' : null,
    }
  }
  if (!env.packaged) {
    return {
      supported: false,
      openAtLogin: false,
      note: cfg.autoLaunch ? '开发态（未打包）不注册登录项，autoLaunch 需装包后生效' : null,
    }
  }
  return { supported: true, openAtLogin: cfg.autoLaunch, note: null }
}

/**
 * powerSaveBlocker 持锁生命周期。类型取 **prevent-display-sleep**：Electron 文档写明
 * prevent-app-suspension 只是"系统睡着后本应用不被挂起"，并不阻止系统入睡——那不是
 * 「保持电脑运行」，长回合该跑的还在跑。display-sleep 阻止息屏即阻止入睡（代价是屏幕亮着，
 * 故缺省关，由 desktop.json keepAwake 显式开）。
 */
export interface PowerSaveBlockerLike {
  start(type: 'prevent-display-sleep'): number
  stop(id: number): boolean
}

/**
 * 保持运行的启停：一次 apply 至多一个持锁 id（重复 start 会叠多个系统级持锁），
 * release() 在退出路径无条件收口——powerSaveBlocker 泄漏 = 用户笔记本永不停止发热。
 */
export class SleepBlocker {
  private id: number | null = null

  constructor(
    private readonly blocker: PowerSaveBlockerLike,
    private readonly log: (msg: string) => void = () => undefined,
  ) {}

  get active(): boolean {
    return this.id !== null
  }

  apply(keepAwake: boolean): void {
    if (keepAwake && this.id === null) {
      this.id = this.blocker.start('prevent-display-sleep')
      this.log(`已启动保持运行（powerSaveBlocker id=${String(this.id)}）`)
      return
    }
    if (!keepAwake) this.release()
  }

  /** 退出收口（幂等）：没有持锁时什么都不做 */
  release(): void {
    if (this.id === null) return
    const id = this.id
    this.id = null
    if (!this.blocker.stop(id)) this.log(`powerSaveBlocker.stop(${String(id)}) 返回 false（该 id 未持有）`)
  }
}
