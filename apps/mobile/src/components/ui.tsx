/**
 * 共享 UI 原语（DESIGN §13.J.3 控件规格表）：
 * 白卡 radius 16 无边框无阴影、分组行 56 hairline、浮动圆钮 44 白底单档阴影、
 * 页头居中标题 17 semibold + 左浮动圆钮（J.1）。禁多层阴影（§13.I）——elevation 单档。
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import type { ComponentProps, ReactNode } from 'react'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/use-theme'
import { darkTheme, mobileMetrics } from '../theme/tokens'

export type FeatherIconName = ComponentProps<typeof Feather>['name']

/** 白卡（J.3：radius 16、无边框无阴影、内边距 16；暗色用 card token） */
export function Card({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: t.card }, style]}>{children}</View>
  )
}

/** 行内 hairline 分隔（缩进对齐文案，J.0） */
export function Hairline({ inset = 0 }: { inset?: number }) {
  const t = useTheme()
  return (
    <View
      style={[
        styles.hairline,
        { backgroundColor: t.border, marginLeft: inset },
      ]}
    />
  )
}

/** 浮动圆形钮（J.3：44 白底、图标 20、单档阴影；页头左钮/返回钮共用） */
export function RoundFloatButton({
  icon,
  onPress,
  label,
}: {
  icon: FeatherIconName
  onPress: () => void
  /** 无障碍标签 */
  label: string
}) {
  const t = useTheme()
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.floatButton,
        { backgroundColor: t.card },
        floatShadow(),
      ]}
    >
      <Feather name={icon} size={20} color={t.foreground} />
    </TouchableOpacity>
  )
}

/** 页头（J.1）：居中标题 17 semibold + 左浮动圆钮；避让顶部安全区 */
export function ScreenHeader({
  title,
  leftIcon,
  onLeftPress,
  leftLabel,
}: {
  title: string
  leftIcon: FeatherIconName
  onLeftPress: () => void
  leftLabel: string
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerFloat}>
        <RoundFloatButton icon={leftIcon} onPress={onLeftPress} label={leftLabel} />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.headerTitle, { color: t.foreground }]}
      >
        {title}
      </Text>
    </View>
  )
}

/** 空态（J.4：居中两行式纯排版，禁插画填充） */
export function EmptyState({ title, detail }: { title: string; detail: string }) {
  const t = useTheme()
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: t.foreground }]}>{title}</Text>
      <Text style={[styles.emptyDetail, { color: t.mutedForeground }]}>{detail}</Text>
    </View>
  )
}

/** 单档 subtle shadow（§13.I：禁多层阴影——仅此一档，浮钮/菜单共用） */
const subtleShadow: StyleProp<ViewStyle> = {
  elevation: 2,
  shadowColor: '#000000',
  shadowOpacity: 0.08,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
}

function floatShadow(): StyleProp<ViewStyle> {
  // 暗色：不叠阴影层次，靠卡底色差分层（J.0 同律）
  return useTheme() === darkTheme ? undefined : subtleShadow
}

const styles = StyleSheet.create({
  card: {
    borderRadius: mobileMetrics.cardRadius,
    padding: mobileMetrics.cardPadding,
    overflow: 'hidden',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
  },
  floatButton: {
    width: mobileMetrics.floatButtonSize,
    height: mobileMetrics.floatButtonSize,
    borderRadius: mobileMetrics.floatButtonSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerFloat: {
    position: 'absolute',
    left: 16,
    bottom: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: mobileMetrics.headerTitle,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 4,
  },
  emptyTitle: {
    fontSize: mobileMetrics.headerTitle,
    fontWeight: '600',
  },
  emptyDetail: {
    fontSize: mobileMetrics.caption,
  },
})
