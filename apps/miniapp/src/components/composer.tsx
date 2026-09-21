/**
 * Composer 多行自增胶囊（工单 9.4——语义对齐 apps/mobile composer.tsx，J.2.1/J.2.3；
 * 工单 19.29 小程序补齐批：左"+"附件入口落地）。
 * 小程序差异：Textarea autoHeight 原生自增（无需 RN 端手算行高的纯函数）；
 * 发送=右圆钮 ↑，turn 运行中变停止 ■（中断走 REST.interrupt）。
 *
 * 附件入口（19.29）：选图即上传（`Transport.uploadAttachment`，工单 12.2a 既有方法），
 * 成功后落在胶囊上方的待发条里，可逐张撤下。**待发条带一行状态说明**——
 * 服务端发送体（`SendMessageBody` strictObject）与引擎 `SessionHandle.send` 目前都
 * 不承载 attachments，端上塞进去只换 400，故本端与 HttpTransport 同口径不发；
 * 待发附件不清空、不冒充已发送（详见 src/session/attachments.ts 头注释）。
 */
import { useState } from 'react'
import { Text, Textarea, View } from '@tarojs/components'
import type { BaseEventOrig, TextareaProps } from '@tarojs/components'
import type { AttachmentDto } from '@spark/protocol'
import { useTheme } from '../store/theme-store'
import { attachmentUrlOf, filesOf } from '../session/attachments'
import { AttachmentThumb } from './ui'
import './composer.css'

export interface ComposerProps {
  /** turn 运行中：右钮呈停止 ■（按 = 中断） */
  running: boolean
  /** 发送请求在途（防重复提交） */
  busy: boolean
  /** 待发附件（已上传成功、尚未随消息发出） */
  attachments: readonly AttachmentDto[]
  /** 上传在途："+"钮禁按（防连点并发选图） */
  uploading: boolean
  /** 取图基址与 token（缩略图 URL 用；<Image> 带不上 Authorization 头 → ?token= 双口径） */
  baseUrl: string
  token: string
  onPickAttachment: () => void
  onRemoveAttachment: (file: string) => void
  onSend: (text: string, attachments: string[]) => void
  onStop: () => void
}

export function Composer({
  running,
  busy,
  attachments,
  uploading,
  baseUrl,
  token,
  onPickAttachment,
  onRemoveAttachment,
  onSend,
  onStop,
}: ComposerProps) {
  const t = useTheme()
  const [text, setText] = useState('')

  const submit = (): void => {
    const trimmed = text.trim()
    if (trimmed === '' || busy) return
    onSend(trimmed, filesOf(attachments))
    setText('')
  }

  const sendDisabled = text.trim() === '' || busy
  return (
    <View className="composer-block">
      {attachments.length > 0 && (
        <View className="composer-attach-strip" style={{ backgroundColor: t.card }}>
          <View className="composer-attach-thumbs">
            {attachments.map((a) => (
              <AttachmentThumb
                key={a.file}
                url={attachmentUrlOf(baseUrl, a.file, token)}
                name={a.name}
                onRemove={() => onRemoveAttachment(a.file)}
              />
            ))}
          </View>
          <Text className="composer-attach-note" style={{ color: t.mutedForeground }}>
            附件已存服务器，暂不能随消息发出（发送通道待接 attachments）
          </Text>
        </View>
      )}
      <View className="composer-capsule" style={{ backgroundColor: t.card }}>
        <View
          className="composer-attach"
          aria-label="添加图片附件"
          onClick={() => {
            if (!uploading) onPickAttachment()
          }}
          style={{ opacity: uploading ? 0.35 : 1 }}
        >
          <Text className="composer-attach-glyph" style={{ color: t.mutedForeground }}>
            +
          </Text>
        </View>
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
    </View>
  )
}
