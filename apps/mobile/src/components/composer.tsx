/**
 * Composer 多行自增胶囊（工单 9.3，J.2.1/J.2.3）：
 * 左右边距 16、高 52 起、radius full、白底；占位"描述你的任务…"13 meta；
 * 右发送黑圆钮 40——turn 运行中变停止 ■（中断走 Transport.interrupt）。
 * 高度/行数纯函数在 src/session/session-rows.ts（Jest 把关）。
 */
import { useState } from 'react'
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native'
import type { NativeSyntheticEvent, TextInputContentSizeChangeEventData } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTheme } from '../theme/use-theme'
import { mobileMetrics } from '../theme/tokens'
import { composerHeight, composerLinesFromContentSize } from '../session/session-rows'

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
  const [lines, setLines] = useState(1)

  const onContentSizeChange = (
    e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ): void => {
    setLines(composerLinesFromContentSize(e.nativeEvent.contentSize.height))
  }

  const submit = (): void => {
    const trimmed = text.trim()
    if (trimmed === '' || busy) return
    onSend(trimmed)
    setText('')
    setLines(1)
  }

  const sendDisabled = text.trim() === '' || busy
  return (
    <View style={[styles.capsule, { backgroundColor: t.card }]}>
      {/* J.2.1 左侧“+”圆钮 32——附件/上下文占位（真实附件逻辑记 v2）：
          置灰占位语义、非可交互元素（不挂按钮角色冒充当态），反 AI 味：线性图标无 emoji */}
      <View
        accessibilityLabel="附件（v2 规划）"
        style={[styles.plusButton, { backgroundColor: t.muted }]}
      >
        <Feather name="plus" size={18} color={t.mutedForeground} />
      </View>
      <TextInput
        accessibilityLabel="消息输入框"
        style={[styles.input, { color: t.foreground, height: composerHeight(lines) - 20 }]}
        value={text}
        onChangeText={setText}
        placeholder="描述你的任务…"
        placeholderTextColor={t.mutedForeground}
        multiline
        onContentSizeChange={onContentSizeChange}
        onSubmitEditing={submit}
        blurOnSubmit={false}
      />
      {running ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="停止当前任务"
          onPress={onStop}
          activeOpacity={0.7}
          style={[styles.sendButton, { backgroundColor: t.primary }]}
        >
          {/* 停止 ■：白方块自绘（反 AI 味——不引图标字体伪造实心方块） */}
          <View style={[styles.stopSquare, { backgroundColor: t.primaryForeground }]} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="发送消息"
          onPress={submit}
          disabled={sendDisabled}
          activeOpacity={0.7}
          style={[
            styles.sendButton,
            { backgroundColor: t.primary, opacity: sendDisabled ? 0.35 : 1 },
          ]}
        >
          <Feather name="arrow-up" size={20} color={t.primaryForeground} />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: mobileMetrics.ctaHeight,
    borderRadius: mobileMetrics.ctaHeight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: mobileMetrics.rowTitle,
    lineHeight: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  plusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 14,
    height: 14,
    borderRadius: 2,
  },
})
