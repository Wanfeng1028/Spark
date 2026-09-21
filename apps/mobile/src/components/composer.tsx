/**
 * Composer 多行自增胶囊（工单 9.3，J.2.1/J.2.3；19.27 补排队语义）：
 * 左右边距 16、高 52 起、radius full、白底；占位"描述你的任务…"13 meta；
 * 右发送黑圆钮 40——turn 运行中变停止 ■（中断走 Transport.interrupt）。
 * 高度/行数纯函数在 src/session/session-rows.ts（Jest 把关）。
 *
 * 提交档（19.27）：运行中在胶囊上方浮一枚档钮（立即/插话/排队），点按切档——
 * 空闲恒 now（§13.E 禁用矩阵：无活动轮可插话/排队，故空闲不显示档钮，不摆设）。
 *
 * 左"+"附件钮已撤除（工单 19.27 判定，非遗漏）：uploadAttachment 要图片字节，
 * RN 侧取字节需 expo-image-picker（新依赖，AGENTS §2.3a 禁止本机安装），且
 * sendMessage 的 wire 目前不带 attachments 字段（protocol HttpTransport 显式丢弃 +
 * server SendMessageBody 为 strictObject）。两头都没通之前挂一个"+"就是置灰承诺，
 * 而本单验收正是"置灰/承诺缺口 grep 清零"。补齐路径见 doc/02 §8 19.27 报告。
 */
import { useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import type { NativeSyntheticEvent, TextInputContentSizeChangeEventData } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Delivery } from '@spark/protocol'
import { useTheme } from '../theme/use-theme'
import { mobileMetrics } from '../theme/tokens'
import { composerHeight, composerLinesFromContentSize } from '../session/session-rows'

/** 档钮文案（与 submit-channel 的排队语义呈现同源） */
const DELIVERY_LABEL: Record<Delivery, string> = {
  now: '立即发送',
  steer: '插话注入',
  queue: '排队发送',
}

export interface ComposerProps {
  /** turn 运行中：右钮呈停止 ■（按 = 中断） */
  running: boolean
  /** 发送请求在途（防重复提交） */
  busy: boolean
  /** 占位文案随提交档切换（排队语义的常驻面） */
  placeholder: string
  /** 当前提交档（空闲时恒 now，由父级归一） */
  delivery: Delivery
  /** 切档（仅运行中可达——档钮只在 running 时渲染） */
  onDeliveryChange: (d: Delivery) => void
  onSend: (text: string) => void
  onStop: () => void
}

export function Composer({
  running,
  busy,
  placeholder,
  delivery,
  onDeliveryChange,
  onSend,
  onStop,
}: ComposerProps) {
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
    <View style={styles.wrap}>
      {running && (
        <View style={styles.deliveryRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`提交方式：${DELIVERY_LABEL[delivery]}，点按切换`}
            onPress={() => onDeliveryChange(delivery === 'steer' ? 'queue' : 'steer')}
            activeOpacity={0.7}
            style={[styles.deliveryChip, { borderColor: t.border }]}
          >
            <Feather name={delivery === 'queue' ? 'clock' : 'message-square'} size={14} color={t.mutedForeground} />
            <Text style={[styles.deliveryText, { color: t.mutedForeground }]}>
              {DELIVERY_LABEL[delivery]}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={[styles.capsule, { backgroundColor: t.card }]}>
        <TextInput
          accessibilityLabel="消息输入框"
          style={[styles.input, { color: t.foreground, height: composerHeight(lines) - 20 }]}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
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
            // 合理禁用（非承诺缺口）：空文本不发送、在途不重复提交
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
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  deliveryRow: {
    flexDirection: 'row',
  },
  deliveryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
  },
  deliveryText: {
    fontSize: mobileMetrics.caption,
  },
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
