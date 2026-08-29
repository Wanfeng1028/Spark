/**
 * 根导航（DESIGN §13.J.1）：无 tab bar、单栈+抽屉。
 * 抽屉=会话（嵌套 native-stack：列表→会话页）/ 设置；页头一律自绘（ScreenHeader），
 * 导航库页头关闭。抽屉内容自绘（J.1 入口：会话/设置/配对——配对入口落设置页）。
 */
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native'
import { createDrawerNavigator } from '@react-navigation/drawer'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DrawerContentComponentProps } from '@react-navigation/drawer'
import { SessionsScreen } from '../screens/SessionsScreen'
import { SessionScreen } from '../screens/SessionScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { useTheme } from '../theme/use-theme'
import { darkTheme, mobileMetrics } from '../theme/tokens'
import type { DrawerParamList, SessionsStackParamList } from './params'

const Drawer = createDrawerNavigator<DrawerParamList>()
const SessionsStack = createNativeStackNavigator<SessionsStackParamList>()

function SessionsNavigator() {
  return (
    <SessionsStack.Navigator screenOptions={{ headerShown: false }}>
      <SessionsStack.Screen name="SessionList" component={SessionsScreen} />
      <SessionsStack.Screen name="Session" component={SessionScreen} />
    </SessionsStack.Navigator>
  )
}

/** 抽屉内容（自绘）：两行入口 + 底部配对说明；选中态 = muted 底（§13.C 侧栏选中同构） */
function SparkDrawerContent({ navigation, state }: DrawerContentComponentProps) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const items: ReadonlyArray<{ key: keyof DrawerParamList; label: string }> = [
    { key: 'Sessions', label: '全部会话' },
    { key: 'Settings', label: '设置' },
  ]
  const activeKey = items[state.index]?.key ?? 'Sessions'

  return (
    <View
      style={[
        styles.drawer,
        {
          backgroundColor: t.card,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      <Text style={[styles.brand, { color: t.foreground }]}>Spark</Text>
      <View style={styles.menu}>
        {items.map((item) => {
          const active = item.key === activeKey
          return (
            <TouchableOpacity
              key={item.key}
              accessibilityRole="button"
              onPress={() => navigation.navigate(item.key)}
              activeOpacity={0.7}
              style={[styles.menuItem, active ? { backgroundColor: t.muted } : null]}
            >
              <Text
                style={[
                  styles.menuItemText,
                  { color: active ? t.foreground : t.mutedForeground },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
      <Text style={[styles.drawerFoot, { color: t.mutedForeground }]}>
        配对与设备管理在设置页
      </Text>
    </View>
  )
}

export function AppNavigator() {
  const t = useTheme()
  return (
    <Drawer.Navigator
      drawerContent={(props) => <SparkDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: {
          width: 280,
          backgroundColor: t.card,
          // §13.I：禁多层阴影——抽屉边缘单档，暗色不加
          ...(t === darkTheme ? {} : { elevation: 2 }),
        },
        overlayColor: 'rgba(0,0,0,0.3)',
        swipeEdgeWidth: 24,
      }}
    >
      <Drawer.Screen name="Sessions" component={SessionsNavigator} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  )
}

const styles = StyleSheet.create({
  drawer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  brand: {
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  menu: {
    gap: 4,
  },
  menuItem: {
    height: mobileMetrics.rowHeight - 8,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  menuItemText: {
    fontSize: mobileMetrics.rowTitle,
  },
  drawerFoot: {
    marginTop: 'auto',
    fontSize: mobileMetrics.caption,
    paddingHorizontal: 12,
  },
})
