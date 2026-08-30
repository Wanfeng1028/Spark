/**
 * 自绘基础组件（工单 9.4——§13.I 组件库白名单制：不引第三方 UI 全家桶，
 * 白卡/分隔/空态/浮钮自绘；这是主包 <2MB 的最稳路径，ADR D21）。
 * 反 AI 味：系统字体（不设 font-family）、至多单档阴影、禁渐变/emoji。
 * 色值一律经 ThemeTokens 内联传入（暗色模式即时生效，不进 WXSS 变量）。
 */
import type { PropsWithChildren } from 'react'
import { Text, View } from '@tarojs/components'
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
