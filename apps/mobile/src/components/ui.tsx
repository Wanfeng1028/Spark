/**
 * 共享 UI 原语（DESIGN §13.J.3 控件规格表）：
 * 白卡 radius 16 无边框无阴影、分组行 56 hairline、浮动圆钮 44 白底单档阴影、
 * 页头居中标题 17 semibold + 左浮动圆钮（J.1）+ 副标题行与右动作钮（J.2.3）、
 * 浮层菜单卡（J.2.2/J.2.3 共用）、全屏 sheet（J.2.8 配对设备页）。
 * 禁多层阴影（§13.I）——elevation 单档。
 */
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import type { ComponentProps, ReactNode } from 'react'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/use-theme'
import { darkTheme, mobileMetrics } from '../theme/tokens'
import type { ThemeTokens } from '../theme/tokens'

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
        floatShadowOf(t),
      ]}
    >
      <Feather name={icon} size={20} color={t.foreground} />
    </TouchableOpacity>
  )
}

/** 页头（J.1）：居中标题 17 semibold + 左浮动圆钮 + 副标题行 13 meta（J.2.3 项目名位）
 *  + 右浮动圆钮（会话页"…"菜单；缺省不渲染——禁假控件）；避让顶部安全区 */
export function ScreenHeader({
  title,
  subtitle,
  leftIcon,
  onLeftPress,
  leftLabel,
  rightIcon,
  onRightPress,
  rightLabel,
}: {
  title: string
  /** J.2.3 副标题（图标 + 来源/项目名）；缺省不占行 */
  subtitle?: string | undefined
  leftIcon: FeatherIconName
  onLeftPress: () => void
  leftLabel: string
  rightIcon?: FeatherIconName | undefined
  onRightPress?: (() => void) | undefined
  rightLabel?: string | undefined
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerFloat}>
        <RoundFloatButton icon={leftIcon} onPress={onLeftPress} label={leftLabel} />
      </View>
      <View style={styles.headerCenter}>
        <Text
          numberOfLines={1}
          style={[styles.headerTitle, { color: t.foreground }]}
        >
          {title}
        </Text>
        {subtitle !== undefined && subtitle !== '' ? (
          <Text numberOfLines={1} style={[styles.headerSubtitle, { color: t.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightIcon !== undefined && onRightPress !== undefined ? (
        <View style={styles.headerFloatRight}>
          <RoundFloatButton
            icon={rightIcon}
            onPress={onRightPress}
            label={rightLabel ?? '更多操作'}
          />
        </View>
      ) : null}
    </View>
  )
}

/** 菜单行描述（会话菜单/筛选菜单共用一张表：图标 + 文案 + 危险档 + 选中勾） */
export interface MenuRowSpec {
  icon: FeatherIconName
  label: string
  /** 危险动作（红字——J.3"危险操作"档） */
  danger?: boolean | undefined
  /** 单选态（右侧 ✓） */
  selected?: boolean | undefined
  note?: string | undefined
  onPress: () => void
}

/**
 * 浮层菜单卡（J.2.2/J.2.3：白卡 radius、单档阴影、外点关闭）。
 * 行高由调用方给（筛选 44 / 会话动作 48），本组件不猜规格。
 */
export function MenuCard({
  rows,
  top,
  width = 220,
  rowHeight,
  radius = mobileMetrics.menuRadius,
  onDismiss,
  accessibleName,
}: {
  rows: readonly MenuRowSpec[]
  top: number
  width?: number
  rowHeight: number
  radius?: number
  onDismiss: () => void
  accessibleName: string
}) {
  const t = useTheme()
  return (
    <View style={styles.menuBackdrop} accessibilityViewIsModal>
      <Pressable
        accessibilityLabel={`关闭${accessibleName}`}
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
      />
      <View
        accessibilityLabel={accessibleName}
        style={[styles.menuCard, { backgroundColor: t.card, top, width, marginLeft: -width / 2, borderRadius: radius }, floatShadowOf(t)]}
      >
        {rows.map((row, i) => (
          <View key={row.label}>
            {i > 0 ? <Hairline inset={0} /> : null}
            <MenuRow row={row} rowHeight={rowHeight} />
          </View>
        ))}
      </View>
    </View>
  )
}

function MenuRow({ row, rowHeight }: { row: MenuRowSpec; rowHeight: number }) {
  const t = useTheme()
  const color = row.danger === true ? t.sparkErr : t.foreground
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={row.label}
      accessibilityState={{ selected: row.selected === true }}
      onPress={row.onPress}
      activeOpacity={0.7}
      style={[styles.menuRow, { height: rowHeight }]}
    >
      <Feather name={row.icon} size={20} color={color} />
      <Text style={[styles.menuRowLabel, { color }]} numberOfLines={1}>
        {row.label}
      </Text>
      {row.note !== undefined ? (
        <Text style={[styles.menuRowNote, { color: t.mutedForeground }]}>{row.note}</Text>
      ) : null}
      {row.selected === true ? <Feather name="check" size={16} color={t.sparkAccent} /> : null}
    </TouchableOpacity>
  )
}

/**
 * 全屏 sheet（J.3"菜单/sheet"档：拖拽把手 + 居中标题 + 右圆 X）——
 * 配对设备管理页用（J.2.8 的"配对设备 >"落点），不新开导航栈。
 */
export function SheetScreen({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.sheet, { backgroundColor: t.pageBackground }]}>
        <View style={[styles.sheetBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.sheetHandle} />
          <Text numberOfLines={1} style={[styles.sheetTitle, { color: t.foreground }]}>
            {title}
          </Text>
          <View style={styles.sheetClose}>
            <RoundFloatButton icon="x" onPress={onClose} label="关闭" />
          </View>
        </View>
        <View style={styles.sheetBody}>{children}</View>
      </View>
    </Modal>
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

function floatShadowOf(t: ThemeTokens): StyleProp<ViewStyle> {
  // 暗色：不叠阴影层次，靠卡底色差分层（J.0 同律）
  return t === darkTheme ? undefined : subtleShadow
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
  headerFloatRight: {
    position: 'absolute',
    right: 16,
    bottom: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    maxWidth: '100%',
    textAlign: 'center',
    fontSize: mobileMetrics.headerTitle,
    fontWeight: '600',
  },
  headerSubtitle: {
    maxWidth: '100%',
    textAlign: 'center',
    fontSize: mobileMetrics.caption,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  menuCard: {
    position: 'absolute',
    left: '50%',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 10,
  },
  menuRowLabel: {
    flex: 1,
    fontSize: mobileMetrics.rowTitle,
  },
  menuRowNote: {
    fontSize: mobileMetrics.caption,
  },
  sheet: {
    flex: 1,
  },
  sheetBar: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d4d4d8',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: mobileMetrics.headerTitle,
    fontWeight: '600',
  },
  sheetClose: {
    position: 'absolute',
    right: 16,
    bottom: 8,
  },
  sheetBody: {
    flex: 1,
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
