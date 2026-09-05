/**
 * Playwright 驱动（ADR D27）：playwright-core headless chromium 懒启动。
 * 动态 import——构造期零依赖；包或浏览器二进制缺失时 open 执行期
 * E_BROWSER_LAUNCH fail-closed（`npx playwright install chromium` 显式前置）。
 */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { errText } from '../errs.js'
import type { SparkLogger } from '../logger.js'
import type {
  BrowserActionResult,
  BrowserDriver,
  BrowserOpenResult,
  BrowserReadResult,
  BrowserShotResult,
} from './driver.js'

/** 截图文件名白名单形状（/api/artifacts/:file 供图校验同源） */
export const SHOT_FILE_RE = /^shot-[0-9]+-[0-9]+\.png$/

interface PlaywrightPage {
  goto(url: string, opts: { timeout: number }): Promise<unknown>
  click(selector: string, opts: { timeout: number }): Promise<void>
  innerText(selector: string): Promise<string>
  evaluate<R>(fn: () => R): Promise<R>
  title(): Promise<string>
  url(): string
  screenshot(opts: { path: string }): Promise<Buffer>
  locator(selector: string): {
    innerText(): Promise<string>
    screenshot(opts: { path: string }): Promise<Buffer>
  }
}

interface PlaywrightBrowser {
  newPage(): Promise<PlaywrightPage>
  close(): Promise<void>
}

export function createPlaywrightDriver(
  shotsDir: string,
  logger: SparkLogger,
): () => Promise<BrowserDriver> {
  return async () => {
    let chromium: { launch(opts: { headless: boolean }): Promise<PlaywrightBrowser> }
    try {
      ({ chromium } = await import('playwright-core'))
    } catch (err) {
      throw new Error(
        `E_BROWSER_LAUNCH: playwright-core 不可用（${errText(err)}）`,
      )
    }

    let browser: PlaywrightBrowser
    try {
      browser = await chromium.launch({ headless: true })
    } catch (err) {
      throw new Error(
        `E_BROWSER_LAUNCH: chromium 启动失败——请先运行 npx playwright install chromium（${errText(err)}）`,
      )
    }

    let page: PlaywrightPage | null = null
    let shotSeq = 0

    async function ensurePage(): Promise<PlaywrightPage> {
      if (page === null) page = await browser.newPage()
      return page
    }

    const driver: BrowserDriver = {
      async open(url: string, timeoutMs: number): Promise<BrowserOpenResult> {
        const p = await ensurePage()
        try {
          await p.goto(url, { timeout: timeoutMs })
        } catch (err) {
          throw new Error(
            `E_BROWSER_NAVIGATION: 页面加载失败（${errText(err)}）`,
          )
        }
        return { title: await p.title(), finalUrl: p.url() }
      },

      async click(selector: string, timeoutMs: number): Promise<BrowserActionResult> {
        const p = await ensurePage()
        try {
          await p.click(selector, { timeout: timeoutMs })
        } catch (err) {
          throw new Error(
            `E_BROWSER_SELECTOR: 点击失败——选择器 ${selector} 未命中或不可交互（${errText(err)}）`,
          )
        }
        return { finalUrl: p.url() }
      },

      async readText(selector: string | undefined): Promise<BrowserReadResult> {
        const p = await ensurePage()
        let text: string
        try {
          text = selector !== undefined
            ? await p.locator(selector).innerText()
            : await p.evaluate(() => document.body.innerText)
        } catch (err) {
          throw new Error(
            `E_BROWSER_SELECTOR: 读取失败——选择器 ${selector} 未命中（${errText(err)}）`,
          )
        }
        return { text, finalUrl: p.url() }
      },

      async screenshot(selector: string | undefined): Promise<BrowserShotResult> {
        const p = await ensurePage()
        await mkdir(shotsDir, { recursive: true })
        const file = `shot-${Date.now()}-${shotSeq}.png`
        shotSeq += 1
        const path = join(shotsDir, file)
        try {
          if (selector !== undefined) {
            await p.locator(selector).screenshot({ path })
          } else {
            await p.screenshot({ path })
          }
        } catch (err) {
          throw new Error(
            `E_BROWSER_SELECTOR: 截图失败——选择器 ${selector} 未命中（${errText(err)}）`,
          )
        }
        const bytes = (await readFile(path)).length
        logger.info('browser.screenshot', { file, bytes })
        return { file, bytes, finalUrl: p.url() }
      },

      currentUrl(): string {
        return page?.url() ?? ''
      },

      async close(): Promise<void> {
        page = null
        await browser.close()
      },
    }
    return driver
  }
}
