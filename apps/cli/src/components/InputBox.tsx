/**
 * 输入框（单行编辑——终端形态；web Composer 的终端对位）：
 * 字符插入/退格/左右光标/Ctrl+U 清空/Enter 提交。
 * 全局键（Tab/Esc/Ctrl+C/审批键）由 App 层 useInput 处理，本组件一律忽略；
 * `active` 为 false 时不接收输入（审批挂起让位审批键）。
 * `onPreview`（工单 10.10）：逐键上报输入预览——slash 菜单过滤数据源。
 * 编辑态以 ref 为权威源：同一批输入（粘贴/快速连击）逐键同步回调时，
 * 渲染闭包里的 state 尚未提交，读 state 会丢字符——ref 保证逐键累积正确。
 * 显示宽度口径（工单 10.19①③）：光标/退格/左右移按字位（grapheme）移动——
 * CJK 一字占 2 列、代理对/组合字符不切半反显；整行按可用宽度窗口化渲染
 * （光标所在窗口优先可见，超宽不再压到 Footer 折行）。
 * IME 组合态（§13.K K.9）：候选窗由终端/系统绘制；组合确认文本整段到达时
 * 按原子文本插入（不猜键；键位分层见 App 层，深层残余挂 V2-26）。
 */
import { Box, Text, measureElement, useCursor, useInput, type DOMElement } from 'ink'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { displayWidth, graphemesOf } from '../text-width.js'

export interface InputBoxProps {
  active: boolean
  prefix: string
  placeholder: string
  onSubmit: (text: string) => void
  onPreview?: (value: string) => void
  /** 空格且输入为空时触发（resume 面板 Space 预览——工单 10.11）；不插入空格 */
  onSpace?: () => void
  /** 输入行可用显示宽度（缺省不限——超宽由终端折行；工单 10.19③） */
  maxWidth?: number
  /** 边框/横线颜色（工单 10.45：审批挂起黄，缺省灰） */
  border?: 'gray' | 'yellow'
}

/** 外部命令式句柄（工单 10.53）：@ 补全选中路径后回写输入框——不扰动 ref 权威打字模型 */
export interface InputBoxHandle {
  /** 置 value 并把光标移到末尾（字位口径），同步上报 preview */
  setValue: (text: string) => void
}

/** 渲染窗口：含光标的字位区间，宽度不超 maxW（光标优先可见，剩余宽度回填头部） */
function renderWindow(
  graphemes: string[],
  cursor: number,
  maxW: number,
): { start: number; end: number } {
  if (maxW <= 0) return { start: cursor, end: cursor }
  let w = 0
  let end = cursor
  while (end < graphemes.length) {
    const g = graphemes[end]
    if (g === undefined) break
    const gw = displayWidth(g)
    if (w + gw > maxW) break
    w += gw
    end += 1
  }
  let start = cursor
  while (start > 0) {
    const g = graphemes[start - 1]
    if (g === undefined) break
    const gw = displayWidth(g)
    if (w + gw > maxW) break
    w += gw
    start -= 1
  }
  return { start, end }
}

export const InputBox = forwardRef<InputBoxHandle, InputBoxProps>(function InputBox(
  {
    active,
    prefix,
    placeholder,
    onSubmit,
    onPreview,
    onSpace,
    maxWidth,
    border = 'gray',
  },
  ref,
) {
  const [value, setValue] = useState('')
  /** 光标语义 = 字位下标（工单 10.19①：非 UTF-16 code unit） */
  const [cursor, setCursor] = useState(0)
  const valueRef = useRef('')
  const cursorRef = useRef(0)
  // 物理光标定位（工单 10.42，qwen BaseTextInput 同模式）：IME 组字窗跟随终端物理光标——
  // 软光标（inverse）不移动物理光标，组字串会画到帧外（实测左下角）。渲染期 setter +
  // getter 延迟求值（布局完成后再读 yoga 坐标），active=false / 未挂载时隐藏。
  const boxRef = useRef<DOMElement | null>(null)
  const { setCursorPosition } = useCursor()

  /** 写权威源 + 触发渲染（两源同步——渲染只读 state，键处理只读 ref） */
  function commit(v: string, c: number): void {
    valueRef.current = v
    cursorRef.current = c
    setValue(v)
    setCursor(c)
    onPreview?.(v)
  }

  // @ 补全回写（工单 10.53）：外部选中路径 → 整段替换草稿，光标落末尾（字位）
  useImperativeHandle(ref, () => ({
    setValue: (text: string) => commit(text, graphemesOf(text).length),
  }))

  useInput(
    (input, key) => {
      // 全局键直通不处理（App 层统一接管）
      if (key.tab || key.escape) return
      const v = valueRef.current
      const cur = cursorRef.current
      if (key.return) {
        const text = v.trim()
        if (text !== '') {
          commit('', 0)
          onSubmit(text)
        }
        return
      }
      // 退格（向后删一个**字位**——代理对/组合字符整体删除，不切半）
      if (key.backspace || key.delete) {
        const graphemes = graphemesOf(v)
        const c = Math.min(cur, graphemes.length)
        if (c === 0) return
        const next = graphemes.slice(0, c - 1).join('') + graphemes.slice(c).join('')
        commit(next, c - 1)
        return
      }
      if (key.leftArrow) {
        commit(v, Math.max(0, cur - 1))
        return
      }
      if (key.rightArrow) {
        commit(v, Math.min(graphemesOf(v).length, cur + 1))
        return
      }
      if (key.ctrl && input === 'u') {
        commit('', 0)
        return
      }
      if (!key.ctrl && !key.meta && input !== '') {
        // 输入为空的空格交给 onSpace（resume 预览切换——过滤词不以空格开头无歧义）
        if (input === ' ' && onSpace !== undefined && v === '') {
          onSpace()
          return
        }
        // 字位口径插入（组合确认文本整段到达 = 原子插入，工单 10.19④）
        const graphemes = graphemesOf(v)
        const c = Math.min(cur, graphemes.length)
        const next = graphemes.slice(0, c).join('') + input + graphemes.slice(c).join('')
        commit(next, c + graphemesOf(input).length)
      }
    },
    { isActive: active },
  )

  // ---------- 渲染：显示宽度窗口化（工单 10.19③） ----------

  const graphemes = graphemesOf(value)
  const safeCursor = Math.min(cursor, graphemes.length)
  const available =
    maxWidth !== undefined ? Math.max(0, maxWidth - displayWidth(prefix)) : undefined
  const win = available !== undefined ? renderWindow(graphemes, safeCursor, available) : null
  const before =
    win !== null ? graphemes.slice(win.start, safeCursor).join('') : graphemes.slice(0, safeCursor).join('')
  const cursorGrapheme = graphemes[safeCursor]
  const after =
    win !== null
      ? graphemes.slice(safeCursor + 1, win.end).join('')
      : graphemes.slice(safeCursor + 1).join('')

  // 物理光标位置（工单 10.42；10.56 §6 换 ink7 原生 measureElement——x/y 为沿布局树累加
  // 各祖先偏移的帧内绝对坐标，等价原手搓 absolutePosition）：渲染期计算并 setter（Ink 在
  // commit 布局完成后才读 getter）；y = 内容行帧内行号，x = 前缀 + 光标前文本的显示宽度
  const abs = boxRef.current !== null ? measureElement(boxRef.current) : null
  if (active && abs !== null) {
    const col = displayWidth(prefix) + displayWidth(before)
    setCursorPosition({
      get x() {
        return abs.x + col
      },
      get y() {
        return abs.y
      },
    })
  } else {
    setCursorPosition(undefined)
  }

  return (
    <Box flexDirection="column" width={maxWidth}>
      {/* Qwen 对齐（工单 10.36/10.38，BaseTextInput 同款）：顶横线与底边框盒同宽——
          不约束宽度时 Yoga 让 border 盒收缩到内容宽，与全宽横线错位（实测占位重叠） */}
      <Text color={border} wrap="truncate-end">
        {'─'.repeat(Math.max(0, maxWidth ?? 80))}
      </Text>
      <Box
        ref={boxRef}
        borderStyle="single"
        borderColor={border}
        borderBottom
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        width={maxWidth}
      >
        <Text>
          <Text color="#CBA6F7">{prefix}</Text>
          {value === '' ? (
            <Text color="gray" dimColor>
              {placeholder}
            </Text>
          ) : (
            <>
              {before}
              <Text inverse>{cursorGrapheme === undefined ? ' ' : cursorGrapheme}</Text>
              {after}
            </>
          )}
        </Text>
      </Box>
    </Box>
  )
})
