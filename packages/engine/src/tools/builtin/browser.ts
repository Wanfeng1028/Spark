/**
 * browser 工具族（阶段七工单 7.10 / H09 / ADR D27）：
 * browser.open / browser.click / browser.read / browser.screenshot。
 * 执行体注入（同 makeTaskTool 先例）：BrowserManager 是 Engine 装配职责。
 * 四工具一律 parallelizable: false——单页共享，串行 barrier 天然互斥。
 * 审批默认 ask（空规则表缺省）：域名白名单可 always 固化（`url:https://docs.**`）。
 */
import { z } from 'zod'
import type { BrowserManager } from '../../browser/driver.js'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
/** read 正文截断（管线 32KB 输出限界之上的第一道保护） */
const READ_MAX_CHARS = 20_000

/** 仅放行 http/https（file:// 等本地协议是路径硬边界的旁门，一律拒绝） */
function parseHttpUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`E_BROWSER_NAVIGATION: 非法 URL——${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`E_BROWSER_NAVIGATION: 仅支持 http/https URL——${url.protocol}//`)
  }
  return url.toString()
}

/** 中断 race：signal 触发即返 E_ABORTED（底层操作跑到静默，ADR D27） */
async function withAbort<T>(signal: AbortSignal, op: Promise<T>): Promise<T> {
  if (signal.aborted) throw new Error('E_ABORTED: 浏览器操作被中断')
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new Error('E_ABORTED: 浏览器操作被中断'))
    signal.addEventListener('abort', onAbort, { once: true })
    op.then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}

const OpenInput = z.strictObject({
  url: z.string().min(1),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).optional(),
})

const ClickInput = z.strictObject({
  selector: z.string().min(1),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).optional(),
})

const ReadInput = z.strictObject({
  selector: z.string().min(1).optional(),
})

const ScreenshotInput = z.strictObject({
  selector: z.string().min(1).optional(),
})

type OpenInput = z.infer<typeof OpenInput>
type ClickInput = z.infer<typeof ClickInput>
type ReadInput = z.infer<typeof ReadInput>
type ScreenshotInput = z.infer<typeof ScreenshotInput>

export function makeBrowserTools(manager: BrowserManager): ToolDefinition[] {
  /** 当前页 URL 作 resource（无页为 url:<none>）——域名级规则可命中 */
  const pageResource = (): string => {
    const url = manager.currentUrl()
    return url === '' ? 'url:<none>' : `url:${url}`
  }

  const openTool: ToolDefinition<OpenInput> = {
    name: 'browser.open',
    description:
      '在本地无头浏览器中打开页面（仅 http/https）。返回最终 URL 与页面标题。' +
      '页面在引擎级共享：后续的 browser.click/read/screenshot 作用于最后打开的页面。' +
      '需要审批；对不确定来源的 URL 先向用户确认。',
    inputSchema: OpenInput,
    permission: {
      action: 'browser.navigate',
      resourceOf: (input) => `url:${input.url}`,
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: OpenInput): Promise<ToolOutput> {
      const url = parseHttpUrl(input.url)
      const r = await withAbort(
        ctx.signal,
        manager.open(url, input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      )
      return { output: { url: r.finalUrl, title: r.title }, isError: false }
    },
  }

  const clickTool: ToolDefinition<ClickInput> = {
    name: 'browser.click',
    description:
      '点击当前页面的元素（CSS 选择器）。点击可能触发导航——需要后续观察时，' +
      '用 browser.read 或 browser.screenshot 确认结果。选择器未命中返回错误，不要盲目重试。',
    inputSchema: ClickInput,
    permission: {
      action: 'browser.interact',
      resourceOf: () => pageResource(),
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: ClickInput): Promise<ToolOutput> {
      const r = await withAbort(
        ctx.signal,
        manager.click(input.selector, input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      )
      return { output: { clicked: true, url: r.finalUrl }, isError: false }
    },
  }

  const readTool: ToolDefinition<ReadInput> = {
    name: 'browser.read',
    description:
      `读取当前页面的可见文本（缺省整页，可用 CSS 选择器限定范围）。` +
      `正文上限 ${READ_MAX_CHARS} 字符（超限截断并标注）。适合提取文章/列表内容；` +
      `需要页面结构时改用 browser.screenshot。`,
    inputSchema: ReadInput,
    permission: {
      action: 'browser.read',
      resourceOf: () => pageResource(),
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: ReadInput): Promise<ToolOutput> {
      const r = await withAbort(
        ctx.signal,
        manager.readText(input.selector),
      )
      const truncated = r.text.length > READ_MAX_CHARS
      const text = truncated ? r.text.slice(0, READ_MAX_CHARS) : r.text
      return {
        output: { url: r.finalUrl, text, ...(truncated ? { truncated: true } : {}) },
        isError: false,
      }
    },
  }

  const screenshotTool: ToolDefinition<ScreenshotInput> = {
    name: 'browser.screenshot',
    description:
      '截取当前页面（缺省全页，可用 CSS 选择器截取元素）的 PNG 截图。' +
      '返回截图文件名与字节数（图片本体经 /api/artifacts 提供，不进入对话上下文）。' +
      '用于验证页面视觉状态或点击后的结果。',
    inputSchema: ScreenshotInput,
    permission: {
      action: 'browser.read',
      resourceOf: () => pageResource(),
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: ScreenshotInput): Promise<ToolOutput> {
      const r = await withAbort(ctx.signal, manager.screenshot(input.selector))
      return {
        output: { url: r.finalUrl, file: r.file, bytes: r.bytes },
        isError: false,
      }
    },
  }

  return [openTool, clickTool, readTool, screenshotTool]
}
