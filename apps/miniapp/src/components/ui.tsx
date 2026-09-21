/**
 * 自绘基础组件（工单 9.4——§13.I 组件库白名单制：不引第三方 UI 全家桶，
 * 白卡/分隔/空态/浮钮自绘；这是主包 <2MB 的最稳路径，ADR D21）。
 * 反 AI 味：系统字体（不设 font-family）、至多单档阴影、禁渐变/emoji。
 * 色值一律经 ThemeTokens 内联传入（暗色模式即时生效，不进 WXSS 变量）。
 */
import { useState } from 'react'
import type { PropsWithChildren } from 'react'
import { Image, Text, View } from '@tarojs/components'
import { useTheme } from '../store/theme-store'
import './ui.css'

/** 白卡：radius 24rpx（12px×2）、内边距 32rpx、暗色跟随 token.card */
export function Card({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  const t = useTheme()
  return (
    <View className={`spark-card ${className ?? ''}`} style={{ backgroundColor: t.card }}>
      {children}
    </View>
  )
}

/** hairline 分隔（1px 固定——发丝线不参与 rpx 换算） */
export function Hairline() {
  const t = useTheme()
  return <View className="spark-hairline" style={{ backgroundColor: t.border }} />
}

/** 空态（禁插画/3D 拟物——标题+明细两行文案，J.2.10 同律） */
export function EmptyState({ title, detail }: { title: string; detail: string }) {
  const t = useTheme()
  return (
    <View className="spark-empty">
      <Text className="spark-empty-title" style={{ color: t.foreground }}>
        {title}
      </Text>
      <Text className="spark-empty-detail" style={{ color: t.mutedForeground }}>
        {detail}
      </Text>
    </View>
  )
}

/** 圆形浮钮（FAB/回到底部；单档阴影，底色由调用方传入：FAB=accent/回底=card） */
export function FloatButton({
  glyph,
  label,
  onPress,
  background,
  glyphColor,
}: {
  /** 自绘字面图形（反 AI 味：不引图标字体） */
  glyph: string
  /** 无障碍语义（aria-label） */
  label: string
  onPress: () => void
  background: string
  glyphColor: string
}) {
  return (
    <View
      className="spark-fab"
      aria-label={label}
      onClick={onPress}
      style={{ backgroundColor: background }}
    >
      <Text className="spark-fab-glyph" style={{ color: glyphColor }}>
        {glyph}
      </Text>
    </View>
  )
}

/**
 * 附件缩略方块（工单 19.29；输入条待发区与会话流 user 气泡共用一份实现）。
 * 取图 URL 由调用方给（`session/attachments.attachmentUrlOf`——非环回要带 ?token=）。
 * 加载失败回落文件名文字：图丢了至少知道发的是哪张，不出现空方块冒充有图。
 */
export function AttachmentThumb({
  url,
  name,
  onRemove,
}: {
  url: string
  name: string
  /** 传入即右上挂移除角标（待发区可撤；会话流历史只看不撤） */
  onRemove?: () => void
}) {
  const t = useTheme()
  const [failed, setFailed] = useState(false)
  return (
    <View className="spark-thumb-wrap">
      {failed ? (
        <View
          className="spark-thumb-fallback"
          style={{ backgroundColor: t.muted, borderColor: t.border }}
        >
          <Text className="spark-thumb-fallback-text" style={{ color: t.mutedForeground }}>
            {name}
          </Text>
        </View>
      ) : (
        <Image
          className="spark-thumb"
          src={url}
          mode="aspectFill"
          style={{ backgroundColor: t.muted }}
          onError={() => setFailed(true)}
        />
      )}
      {onRemove !== undefined ? (
        <View
          className="spark-thumb-remove"
          aria-label={`移除附件 ${name}`}
          onClick={onRemove}
          style={{ backgroundColor: t.primary }}
        >
          <Text className="spark-thumb-remove-glyph" style={{ color: t.primaryForeground }}>
            ×
          </Text>
        </View>
      ) : null}
    </View>
  )
}
