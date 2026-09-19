/**
 * computer.* 工具族（阶段十九工单 19.1 / ADR D43）：电脑控制八操作——
 * screenshot/click/type/key/scroll/window/app/clipboard。执行体注入
 * （makeTaskTool/makeBrowserTools 同判例）；主开关在执行期读引擎内存配置
 * （isEnabled 闭包），关闭时全操作 E_COMPUTER_DISABLED（fail-closed，缺省关）。
 * 审批：action 统一 computer.use，resource = computer://<op>（规则可按操作通配，
 * 如 computer://screenshot 固化截图、computer://click 逐次询问）。
 * 一律 parallelizable: false——屏幕/输入是共享可变状态，操作顺序即语义。
 * 截图图片本体不进对话上下文（browser.screenshot 同纪律）：落 shotsDir 经
 * GET /api/artifacts/:file 供图，输出只带文件名与字节数。
 */
import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolOutput } from '../definition.js'
import type { ComputerExecutor } from '../../computer/executor.js'

/** 输入文本上限（键入到目标应用是逐字符 SendInput，超长文本应走剪贴板粘贴） */
const TYPE_MAX_CHARS = 2000

/** 主开关关闭的统一拒绝（缺省 false fail-closed——ADR D43） */
function disabledError(): Error {
  return new Error(
    'E_COMPUTER_DISABLED: 电脑控制未启用（spark.json engine.computerUseEnabled）——经用户明示开启后可用',
  )
}

const ScreenshotInput = z.strictObject({})
const ClickInput = z.strictObject({
  /** 屏幕像素坐标（主/虚拟屏坐标系，与 computer.screenshot 输出画面对应） */
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  button: z.enum(['left', 'right', 'middle']).optional(),
  double: z.boolean().optional(),
})
const TypeInput = z.strictObject({
  text: z.string().min(1).max(TYPE_MAX_CHARS),
})
const KeyInput = z.strictObject({
  key: z.string().min(1).max(32),
  modifiers: z.array(z.enum(['ctrl', 'alt', 'shift', 'meta'])).max(4).optional(),
})
const ScrollInput = z.strictObject({
  /** 正 = 向上滚，负 = 向下滚（Windows 轮档语义） */
  deltaY: z.number().int().min(-10_000).max(10_000),
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
})
const WindowInput = z.strictObject({
  action: z.enum(['list', 'focus']),
  title: z.string().min(1).max(200).optional(),
  pid: z.number().int().positive().optional(),
})
const AppInput = z.strictObject({
  action: z.enum(['launch', 'list']),
  command: z.string().min(1).max(500).optional(),
})
const ClipboardInput = z.strictObject({
  action: z.enum(['read', 'write']),
  text: z.string().max(100_000).optional(),
})

type ScreenshotInput = z.infer<typeof ScreenshotInput>
type ClickInput = z.infer<typeof ClickInput>
type TypeInput = z.infer<typeof TypeInput>
type KeyInput = z.infer<typeof KeyInput>
type ScrollInput = z.infer<typeof ScrollInput>
type WindowInput = z.infer<typeof WindowInput>
type AppInput = z.infer<typeof AppInput>
type ClipboardInput = z.infer<typeof ClipboardInput>

export interface ComputerToolsOptions {
  /** 平台执行体（engine 装配 createComputerExecutor；测试注入假体） */
  executor: ComputerExecutor
  /** 主开关（引擎内存配置读取闭包；热生效） */
  isEnabled: () => boolean
}

export function makeComputerTools(opts: ComputerToolsOptions): ToolDefinition[] {
  const { executor, isEnabled } = opts

  const screenshotTool: ToolDefinition<ScreenshotInput> = {
    name: 'computer.screenshot',
    description:
      '截取当前整个屏幕（多显示器虚拟屏）的 PNG 截图。返回截图文件名与字节数' +
      '（图片本体经 /api/artifacts 提供，不进入对话上下文）。用于先看屏幕再做操作；' +
      '点击坐标与截图画面对应。',
    inputSchema: ScreenshotInput,
    permission: {
      action: 'computer.use',
      resourceOf: () => 'computer://screenshot',
    },
    parallelizable: false,

    async execute(ctx: ToolContext, _input: ScreenshotInput): Promise<ToolOutput> {
      if (!isEnabled()) throw disabledError()
      const r = await executor.screenshot(ctx.signal)
      return { output: { file: r.file, bytes: r.bytes }, isError: false }
    },
  }

  const clickTool: ToolDefinition<ClickInput> = {
    name: 'computer.click',
    description:
      '在屏幕坐标 (x, y) 处点击（缺省左键单击，可选右/中键与双击）。' +
      '坐标应来自 computer.screenshot 的画面；盲点坐标前先截图确认。',
    inputSchema: ClickInput,
    permission: {
      action: 'computer.use',
      resourceOf: () => 'computer://click',
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: ClickInput): Promise<ToolOutput> {
      if (!isEnabled()) throw disabledError()
      const r = await executor.click(input, ctx.signal)
      return { output: r, isError: false }
    },
  }

  const typeTool: ToolDefinition<TypeInput> = {
    name: 'computer.type',
    description:
      '向前台窗口逐字符键入文本（UNICODE 输入，中文可用；\\n 转回车）。' +
      '长文本建议先 computer.clipboard 写入再粘贴（Ctrl+v），避免前台焦点漂移丢字。',
    inputSchema: TypeInput,
    permission: {
      action: 'computer.use',
      resourceOf: () => 'computer://type',
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: TypeInput): Promise<ToolOutput> {
      if (!isEnabled()) throw disabledError()
      const r = await executor.type(input, ctx.signal)
      return { output: r, isError: false }
    },
  }

  const keyTool: ToolDefinition<KeyInput> = {
    name: 'computer.key',
    description:
      '按单个按键或组合键（如 Enter/F5/a；modifiers 组合 ctrl/alt/shift/meta）。' +
      '键名跟随平台：Windows 按键枚举名（Enter、Tab、Escape、F1-F12）、Linux X11 keysym 名、' +
      'macOS 键名；不认识的键名如实报错，不静默吞掉。',
    inputSchema: KeyInput,
    permission: {
      action: 'computer.use',
      resourceOf: () => 'computer://key',
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: KeyInput): Promise<ToolOutput> {
      if (!isEnabled()) throw disabledError()
      const r = await executor.key(input, ctx.signal)
      return { output: r, isError: false }
    },
  }

  const scrollTool: ToolDefinition<ScrollInput> = {
    name: 'computer.scroll',
    description:
      '在指定坐标（缺省当前鼠标位置）滚动滚轮：deltaY 正 = 向上滚、负 = 向下滚，' +
      '数值为轮档格数（一格 120）。',
    inputSchema: ScrollInput,
    permission: {
      action: 'computer.use',
      resourceOf: () => 'computer://scroll',
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: ScrollInput): Promise<ToolOutput> {
      if (!isEnabled()) throw disabledError()
      const r = await executor.scroll(input, ctx.signal)
      return { output: r, isError: false }
    },
  }

  const windowTool: ToolDefinition<WindowInput> = {
    name: 'computer.window',
    description:
      '窗口管理：action=list 列出有主窗口的进程（pid/名称/标题，用于选定操作目标）；' +
      'action=focus 把匹配 pid 或标题子串的窗口置前。聚焦失败返回错误，先 list 再 focus。',
    inputSchema: WindowInput,
    permission: {
      action: 'computer.use',
      resourceOf: () => 'computer://window',
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: WindowInput): Promise<ToolOutput> {
      if (!isEnabled()) throw disabledError()
      if (input.action === 'focus' && input.title === undefined && input.pid === undefined) {
        throw new Error('E_COMPUTER_ARGS: focus 需要提供 title 或 pid')
      }
      const r = await executor.window(input, ctx.signal)
      return { output: r, isError: false }
    },
  }

  const appTool: ToolDefinition<AppInput> = {
    name: 'computer.app',
    description:
      '应用管理：action=list 列出运行中进程（按内存降序，前 50）；' +
      'action=launch 启动可执行本体（仅程序名或路径，不带参数——带参数的命令走 bash）。' +
      '启动任意程序是高敏感操作，缺省逐次审批。',
    inputSchema: AppInput,
    permission: {
      action: 'computer.use',
      resourceOf: () => 'computer://app',
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: AppInput): Promise<ToolOutput> {
      if (!isEnabled()) throw disabledError()
      if (input.action === 'launch' && input.command === undefined) {
        throw new Error('E_COMPUTER_ARGS: launch 需要提供 command（程序名或路径）')
      }
      const r = await executor.app(input, ctx.signal)
      return { output: r, isError: false }
    },
  }

  const clipboardTool: ToolDefinition<ClipboardInput> = {
    name: 'computer.clipboard',
    description:
      '读写系统剪贴板（纯文本）：action=read 取当前内容；action=write 写入文本。' +
      '与 computer.type 配合可实现长文本粘贴。',
    inputSchema: ClipboardInput,
    permission: {
      action: 'computer.use',
      resourceOf: () => 'computer://clipboard',
    },
    parallelizable: false,

    async execute(ctx: ToolContext, input: ClipboardInput): Promise<ToolOutput> {
      if (!isEnabled()) throw disabledError()
      if (input.action === 'write' && input.text === undefined) {
        throw new Error('E_COMPUTER_ARGS: write 需要提供 text')
      }
      const r = await executor.clipboard(input, ctx.signal)
      return { output: r, isError: false }
    },
  }

  return [
    screenshotTool,
    clickTool,
    typeTool,
    keyTool,
    scrollTool,
    windowTool,
    appTool,
    clipboardTool,
  ]
}
