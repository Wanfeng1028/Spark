/**
 * Composer 多行自增胶囊（工单 9.4——语义对齐 apps/mobile composer.tsx，J.2.1/J.2.3）。
 * 小程序差异：Textarea autoHeight 原生自增（无需 RN 端手算行高的纯函数）；
 * 左“+”附件占位省略（非交互元素在小程序里易被误点，记 v2）；
 * 发送=右圆钮 ↑，turn 运行中变停止 ■（中断走 REST.interrupt）。
 */
import { useState } from 'react'
import { Text, Textarea, View } from '@tarojs/components'
import type { BaseEventOrig, TextareaProps } from '@tarojs/components'
import { useTheme } from '../store/theme-store'
import './composer.css'

export interface ComposerProps {
  /** turn 运行中：右钮呈停止 ■（按 = 中断） */
  running: boolean
  /** 发送请求在途（防重复提交） */
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
}

export function Composer({ running, busy, onSend, onStop }: ComposerProps) {
  const t = useTheme()
  const [text, setText] = useState('')

  const submit = (): void => {
    const trimmed = text.trim()
    if (trimmed === '' || busy) return
    onSend(trimmed)
    setText('')
  }

  const sendDisabled = text.trim() === '' || busy
  return (
    <View className="composer-capsule" style={{ backgroundColor: t.card }}>
      <Textarea
        className="composer-input"
        style={{ color: t.foreground }}
        value={text}
        placeholder="描述你的任务…"
        placeholderStyle={`color: ${t.mutedForeground}`}
        autoHeight
        maxlength={-1}
        confirmType="send"
        cursorSpacing={16}
        adjustPosition
        onInput={(e: BaseEventOrig<TextareaProps.onInputEventDetail>) => setText(e.detail.value)}
        onConfirm={() => submit()}
      />
      {running ? (
        <View
          className="composer-send"
          aria-label="停止当前任务"
          onClick={onStop}
          style={{ backgroundColor: t.primary }}
        >
          {/* 停止 ■：方块自绘（反 AI 味——不引图标字体伪造实心方块） */}
          <View className="composer-stop-square" style={{ backgroundColor: t.primaryForeground }} />
        </View>
      ) : (
        <View
          className="composer-send"
          aria-label="发送消息"
          onClick={() => {
            if (!sendDisabled) submit()
          }}
          style={{ backgroundColor: t.primary, opacity: sendDisabled ? 0.35 : 1 }}
        >
          <Text className="composer-send-glyph" style={{ color: t.primaryForeground }}>
            ↑
          </Text>
        </View>
      )}
    </View>
  )
}
