/**
 * 输入框（单行编辑——终端形态；web Composer 的终端对位）：
 * 字符插入/退格/左右光标/Ctrl+U 清空/Enter 提交。
 * 全局键（Tab/Esc/Ctrl+C/审批键）由 App 层 useInput 处理，本组件一律忽略；
 * `active` 为 false 时不接收输入（审批挂起让位审批键）。
 * 编辑态以 ref 为权威源：同一批输入（粘贴/快速连击）逐键同步回调时，
 * 渲染闭包里的 state 尚未提交，读 state 会丢字符——ref 保证逐键累积正确。
 */
import { Text, useInput } from 'ink'
import { useRef, useState } from 'react'

export interface InputBoxProps {
  active: boolean
  prefix: string
  placeholder: string
  onSubmit: (text: string) => void
}

export function InputBox({ active, prefix, placeholder, onSubmit }: InputBoxProps) {
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)
  const valueRef = useRef('')
  const cursorRef = useRef(0)

  /** 写权威源 + 触发渲染（两源同步——渲染只读 state，键处理只读 ref） */
  function commit(v: string, c: number): void {
    valueRef.current = v
    cursorRef.current = c
    setValue(v)
    setCursor(c)
  }

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
      // 退格（向后删）：ink 6 把主流终端 Backspace 键的 \x7F 解析为 key.delete，\b 才是
      // key.backspace；前向 Delete 键同报 key.delete 且 input 被清空不可区分——一律按退格
      if (key.backspace || key.delete) {
        const c = Math.min(cur, v.length)
        if (c === 0) return
        commit(v.slice(0, c - 1) + v.slice(c), c - 1)
        return
      }
      if (key.leftArrow) {
        commit(v, Math.max(0, cur - 1))
        return
      }
      if (key.rightArrow) {
        commit(v, Math.min(v.length, cur + 1))
        return
      }
      if (key.ctrl && input === 'u') {
        commit('', 0)
        return
      }
      if (!key.ctrl && !key.meta && input !== '') {
        const c = Math.min(cur, v.length)
        commit(v.slice(0, c) + input + v.slice(c), c + input.length)
      }
    },
    { isActive: active },
  )

  return (
    <Text>
      <Text color="gray">{prefix}</Text>
      {value === '' ? (
        <Text color="gray" dimColor>
          {placeholder}
        </Text>
      ) : (
        <>
          {value.slice(0, cursor)}
          <Text inverse>{value.slice(cursor, cursor + 1) === '' ? ' ' : value.slice(cursor, cursor + 1)}</Text>
          {value.slice(cursor + 1)}
        </>
      )}
    </Text>
  )
}
