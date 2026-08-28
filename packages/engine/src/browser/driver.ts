/**
 * browser 工具族（阶段七工单 7.10 / H09 / ADR D27）：BrowserDriver 端口 +
 * BrowserManager。生产实现 = playwright.ts（playwright-core 懒启动）；
 * 测试以假驱动替身（引擎与管线不感知 Playwright）。
 */

export interface BrowserOpenResult {
  title: string
  finalUrl: string
}

export interface BrowserActionResult {
  finalUrl: string
}

export interface BrowserReadResult {
  text: string
  finalUrl: string
}

export interface BrowserShotResult {
  /** 截图文件名（白名单形状，经 /api/artifacts/:file 供图） */
  file: string
  bytes: number
  finalUrl: string
}

export interface BrowserDriver {
  open(url: string, timeoutMs: number): Promise<BrowserOpenResult>
  click(selector: string, timeoutMs: number): Promise<BrowserActionResult>
  readText(selector: string | undefined): Promise<BrowserReadResult>
  screenshot(selector: string | undefined): Promise<BrowserShotResult>
  /** 当前页 URL（同步读；无页为空串）——审批 resource 用 */
  currentUrl(): string
  close(): Promise<void>
}

/**
 * 引擎级单例单页（ADR D27）：open 懒启动驱动；click/read/screenshot 要求
 * 页面已开（不自动拉起——E_BROWSER_NO_PAGE 先于一切副作用）；四工具
 * parallelizable=false 串行执行，天然互斥。
 */
export class BrowserManager {
  private driver: BrowserDriver | null = null
  private launching: Promise<BrowserDriver> | null = null

  constructor(private readonly make: () => Promise<BrowserDriver>) {}

  currentUrl(): string {
    return this.driver?.currentUrl() ?? ''
  }

  private async ensure(): Promise<BrowserDriver> {
    if (this.driver !== null) return this.driver
    if (this.launching === null) {
      this.launching = this.make().catch((err: unknown) => {
        this.launching = null
        throw err
      })
    }
    const driver = await this.launching
    this.launching = null
    this.driver = driver
    return driver
  }

  /** click/read/screenshot 前置：无页直接拒绝，不触发启动 */
  private require(): BrowserDriver {
    if (this.driver === null) {
      throw new Error('E_BROWSER_NO_PAGE: 尚无打开的页面——先调用 browser.open')
    }
    return this.driver
  }

  async open(url: string, timeoutMs: number): Promise<BrowserOpenResult> {
    const driver = await this.ensure()
    return driver.open(url, timeoutMs)
  }

  async click(selector: string, timeoutMs: number): Promise<BrowserActionResult> {
    return this.require().click(selector, timeoutMs)
  }

  async readText(selector: string | undefined): Promise<BrowserReadResult> {
    return this.require().readText(selector)
  }

  async screenshot(selector: string | undefined): Promise<BrowserShotResult> {
    return this.require().screenshot(selector)
  }

  async close(): Promise<void> {
    if (this.driver === null) return
    const driver = this.driver
    this.driver = null
    await driver.close()
  }
}
