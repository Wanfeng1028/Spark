/**
 * Composer 多行自增胶囊（工单 9.3，J.2.1/J.2.3；19.27 补排队语义）：
 * 左右边距 16、高 52 起、radius full、白底；占位"描述你的任务…"13 meta；
 * 右发送黑圆钮 40——turn 运行中变停止 ■（中断走 Transport.interrupt）。
 * 高度/行数纯函数在 src/session/session-rows.ts（Jest 把关）。
 *
 * 提交档（19.27）：运行中在胶囊上方浮一枚档钮（立即/插话/排队），点按切档——
 * 空闲恒 now（§13.E 禁用矩阵：无活动轮可插话/排队，故空闲不显示档钮，不摆设）。
 *
 * 附件（19.27 接真，撤"已撤除"判定）：wire 已通（SendMessageBody.attachments +
 * HttpTransport/inprocess 透传）+ expo-image-picker 取图（新依赖走 §2.3a 流程，
 * 锁文件由人类重算）。本组件保持哑件：待发清单与上传态由父级持有——
 * 左"+"钮（上传中禁点）、待发 chips（名字截断 + × 移除）。
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

/** 待发附件（uploadAttachment 产物；id 进 sendMessage wire，name 仅供 chips 展示） */
interface PendingAttachment {
  id: string
  name: string
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
  /** 待发附件清单与上传态（父级持有，本组件哑件） */
  pending: readonly PendingAttachment[]
  uploading: boolean
  onPickAttachment: () => void
  onRemoveAttachment: (id: string) => void
  onSend: (text: string) => void
  onStop: () => void
}

export function Composer({
  running,
  busy,
  placeholder,
  delivery,
  onDeliveryChange,
  pending,
  uploading,
  onPickAttachment,
  onRemoveAttachment,
  onSend,
  onStop,
}: ComposerProps) {
  const t = useTheme()
  const [text, setText] = useState('')
  const [lines, setLines] = useState(1)
  // 语音听写占位（19.28 批 0，晚风拍板"先做一个占位"）：按钮唯一行为是展开/收起
  // 诚实提示条——不摆"点了没反应"的假录音钮；真功能上线后此钮换录音手势
  const [voiceHintOpen, setVoiceHintOpen] = useState(false)

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
  const attachDisabled = busy || uploading
  return (
    <View style={styles.wrap}>
      {(pending.length > 0 || uploading) && (
        <View style={styles.attachRow}>
          {uploading && (
            <View style={[styles.attachChip, { borderColor: t.border }]}>
              <Text style={[styles.attachName, { color: t.mutedForeground }]}>上传中…</Text>
            </View>
          )}
          {pending.map((a) => (
            <View key={a.id} style={[styles.attachChip, { borderColor: t.border }]}>
              <Text numberOfLines={1} style={[styles.attachName, { color: t.foreground }]}>
                {a.name}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`移除附件 ${a.name}`}
                onPress={() => onRemoveAttachment(a.id)}
                hitSlop={8}
              >
                <Feather name="x" size={12} color={t.mutedForeground} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
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
      {/* 语音占位提示条（19.28 批 0）：点话筒展开/收起——安全提示随行（语音将上传转写服务商） */}
      {voiceHintOpen && (
        <View style={styles.deliveryRow}>
          <View style={[styles.deliveryChip, { borderColor: t.border }]}>
            <Feather name="mic-off" size={14} color={t.mutedForeground} />
            <Text style={[styles.deliveryText, { color: t.mutedForeground }]}>
              语音听写筹备中——上线后此处按住说话；语音将上传转写服务商
            </Text>
          </View>
        </View>
      )}
      <View style={[styles.capsule, { backgroundColor: t.card }]}>
        {/* 语音占位钮（19.28 批 0）：真功能上线前唯一行为 = 展开提示条 */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="语音听写（筹备中）"
          onPress={() => setVoiceHintOpen((v) => !v)}
          activeOpacity={0.7}
          style={styles.attachButton}
        >
          <Feather name="mic" size={20} color={t.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="附加图片"
          disabled={attachDisabled}
          onPress={onPickAttachment}
          activeOpacity={0.7}
          style={[styles.attachButton, { opacity: attachDisabled ? 0.35 : 1 }]}
        >
          <Feather name="plus" size={20} color={t.mutedForeground} />
        </TouchableOpacity>
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
  attachRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
  },
  attachName: {
    fontSize: mobileMetrics.caption,
    flexShrink: 1,
  },
  attachButton: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
