/**
 * 会话列表屏（DESIGN §13.J.2.2）：标题行“全部会话 ˅”→ 筛选菜单（评审 G2：
 * 白卡 radius 12、行高 44、图标+文案、选中 ✓；已归档无后端支撑置灰禁用），
 * 下拉刷新（transport.listSessions()）、时间分组（今天/更早；“按项目”档改按
 * cwd 目录名分组，无项目信息归“未分组”）、行=状态点 8px+标题 16 单行截断+
 * 右侧日期 13 meta、行高 52、右下 FAB 56 accent 白“+”。列表快照纪律同 cli
 * （AGENTS §2.7）：刷新/聚焦时刻 REST 快照，不轮询。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DrawerNavigationProp } from '@react-navigation/drawer'
import type { SessionDto, SessionStatus } from '@spark/protocol'
import { errorMessageOf, fmtDate, isToday } from '@spark/protocol'
import { useAppStore } from '../store/app-store'
import { useConfigStore } from '../store/config-store'
import { getHttpTransport } from '../transport/runtime'
import { useTheme } from '../theme/use-theme'
import type { ThemeTokens } from '../theme/tokens'
import { mobileMetrics } from '../theme/tokens'
import { Card, EmptyState, Hairline, RoundFloatButton } from '../components/ui'
import type { FeatherIconName } from '../components/ui'
import type { DrawerParamList } from '../navigation/params'

/** 筛选档（J.2.2；“已归档”无后端支撑（V2-23），菜单项置灰禁用占位） */
type FilterMode = 'all' | 'project'

/** 状态点配色（J.2.2：绿空闲/accent 运行/amber 待审批；灰=完成态 v2 归档预留） */
function dotColor(status: SessionStatus, t: ThemeTokens): string {
  switch (status) {
    case 'running':
      return t.sparkAccent
    case 'waiting-approval':
      return t.sparkWarn
    case 'idle':
      return t.sparkOk
  }
}

/** “按项目”档分组键：cwd 目录名（数据面=现有 listSessions 返回字段；取不到归“未分组”） */
function projectOf(dto: SessionDto): string {
  const m = /([^/\\]+)[/\\]*$/.exec(dto.cwd.trim())
  const name = m?.[1] ?? ''
  return name === '' ? '未分组' : name
}

type Section = { key: string; title: string; items: SessionDto[] }

export function SessionsScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<DrawerNavigationProp<DrawerParamList>>()
  const sessions = useAppStore((s) => s.sessions)
  const setSessions = useAppStore((s) => s.setSessions)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setNotice = useAppStore((s) => s.setNotice)
  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [menuOpen, setMenuOpen] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const transport = getHttpTransport(serverUrl, token)
    if (transport === null) {
      setNotice('未配置服务器：请先在设置页完成配对')
      return
    }
    try {
      setSessions(await transport.listSessions())
      setNotice(null)
    } catch (err: unknown) {
      // 失败闭合：列表失败如实提示，保留旧快照（不拿空列表冒充）
      setNotice(errorMessageOf(err))
    }
  }, [serverUrl, token, setSessions, setNotice])

  useEffect(() => {
    setRefreshing(true)
    void refresh().finally(() => setRefreshing(false))
  }, [refresh])

  const sections = useMemo<Section[]>(() => {
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    if (filter === 'project') {
      // 按项目分组：首现顺序（组内仍按 updatedAt 倒序）
      const groups = new Map<string, SessionDto[]>()
      for (const dto of sorted) {
        const key = projectOf(dto)
        const list = groups.get(key)
        if (list === undefined) groups.set(key, [dto])
        else list.push(dto)
      }
      return [...groups.entries()].map(([name, items]) => ({
        key: `project:${name}`,
        title: name,
        items,
      }))
    }
    const today = sorted.filter((s) => isToday(s.updatedAt))
    const earlier = sorted.filter((s) => !isToday(s.updatedAt))
    const out: Section[] = []
    if (today.length > 0) out.push({ key: 'today', title: '今天', items: today })
    if (earlier.length > 0) out.push({ key: 'earlier', title: '更早', items: earlier })
    return out
  }, [sessions, filter])

  const onCreate = useCallback((): void => {
    const transport = getHttpTransport(serverUrl, token)
    if (transport === null) {
      setNotice('未配置服务器：请先在设置页完成配对')
      return
    }
    void transport
      .createSession()
      .then((dto) => {
        setActiveSession(dto.id)
        navigation.navigate('Sessions', {
          screen: 'Session',
          params: { sessionId: dto.id, title: dto.title },
        })
      })
      .catch((err: unknown) => setNotice(errorMessageOf(err)))
  }, [serverUrl, token, navigation, setActiveSession, setNotice])

  const openSession = useCallback(
    (dto: SessionDto): void => {
      setActiveSession(dto.id)
      navigation.navigate('Sessions', {
        screen: 'Session',
        params: { sessionId: dto.id, title: dto.title },
      })
    },
    [navigation, setActiveSession],
  )

  return (
    <View style={[styles.screen, { backgroundColor: t.pageBackground }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerFloat}>
          <RoundFloatButton
            icon="menu"
            onPress={() => navigation.openDrawer()}
            label="打开抽屉"
          />
        </View>
        {/* J.2.2：标题行“全部会话 ˅”（17 semibold + 下拉 chevron 16 meta）→ 筛选菜单 */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="会话筛选"
          onPress={() => setMenuOpen((v) => !v)}
          activeOpacity={0.7}
          style={styles.titleButton}
        >
          <Text numberOfLines={1} style={[styles.headerTitle, { color: t.foreground }]}>
            全部会话
          </Text>
          <Feather name="chevron-down" size={16} color={t.mutedForeground} />
        </TouchableOpacity>
      </View>
      {sections.length === 0 && !refreshing ? (
        <EmptyState
          title="暂无会话"
          detail={
            serverUrl === ''
              ? '先在设置页完成配对，再从右下角新建'
              : '下拉刷新，或从右下角新建会话'
          }
        />
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void refresh().finally(() => setRefreshing(false))
              }}
              tintColor={t.mutedForeground}
            />
          }
          data={sections}
          keyExtractor={(s) => s.key}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: t.mutedForeground }]}>
                {section.title}
              </Text>
              <Card style={styles.sectionCard}>
                {section.items.map((dto, i) => (
                  <View key={dto.id}>
                    {i > 0 ? <Hairline inset={32} /> : null}
                    <SessionRow dto={dto} onPress={() => openSession(dto)} theme={t} />
                  </View>
                ))}
              </Card>
            </View>
          )}
        />
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="新建会话"
        onPress={onCreate}
        activeOpacity={0.85}
        style={[styles.fab, { backgroundColor: t.sparkAccent }]}
      >
        <Feather name="plus" size={24} color="#ffffff" />
      </TouchableOpacity>
      {menuOpen ? (
        <FilterMenu
          filter={filter}
          headerOffset={insets.top + 48}
          onSelect={(mode) => {
            setFilter(mode)
            setMenuOpen(false)
          }}
          onDismiss={() => setMenuOpen(false)}
        />
      ) : null}
    </View>
  )
}

/** 筛选菜单（J.2.2：白卡 radius 12、行高 44、图标+文案、选中 ✓；已归档置灰禁用占位） */
function FilterMenu({
  filter,
  headerOffset,
  onSelect,
  onDismiss,
}: {
  filter: FilterMode
  headerOffset: number
  onSelect: (mode: FilterMode) => void
  onDismiss: () => void
}) {
  const t = useTheme()
  return (
    <View style={styles.menuBackdrop}>
      <Pressable accessibilityLabel="关闭筛选菜单" style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <View
        style={[
          styles.menuCard,
          { backgroundColor: t.card, top: headerOffset },
        ]}
      >
        <FilterRow
          icon="list"
          label="全部"
          selected={filter === 'all'}
          onPress={() => onSelect('all')}
        />
        <FilterRow
          icon="folder"
          label="按项目"
          selected={filter === 'project'}
          onPress={() => onSelect('project')}
        />
        {/* 已归档：无后端支撑（V2-23）——置灰禁用占位并标注 */}
        <FilterRow icon="archive" label="已归档" disabled note="v2 可用" />
      </View>
    </View>
  )
}

function FilterRow({
  icon,
  label,
  selected = false,
  disabled = false,
  note,
  onPress,
}: {
  icon: FeatherIconName
  label: string
  selected?: boolean
  disabled?: boolean
  note?: string
  onPress?: () => void
}) {
  const t = useTheme()
  // 禁用态：前景 opacity 40%（§13.B 三态色同律）
  const color = disabled ? `${t.foreground}66` : t.foreground
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.menuRow, { height: mobileMetrics.menuRowHeight }]}
    >
      <Feather name={icon} size={20} color={color} />
      <Text style={[styles.menuRowLabel, { color }]}>{label}</Text>
      {selected ? <Feather name="check" size={16} color={t.sparkAccent} /> : null}
      {note !== undefined ? (
        <Text style={[styles.menuRowNote, { color: t.mutedForeground }]}>{note}</Text>
      ) : null}
    </TouchableOpacity>
  )
}

function SessionRow({
  dto,
  onPress,
  theme: t,
}: {
  dto: SessionDto
  onPress: () => void
  theme: ThemeTokens
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.row, { height: mobileMetrics.sessionRowHeight }]}>
        <View style={[styles.dot, { backgroundColor: dotColor(dto.status, t) }]} />
        <Text
          numberOfLines={1}
          style={[styles.rowTitle, { color: t.foreground }]}
        >
          {dto.title !== '' ? dto.title : '新会话'}
        </Text>
        <Text style={[styles.rowDate, { color: t.mutedForeground }]}>
          {fmtDate(dto.updatedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
  titleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  headerTitle: {
    fontSize: mobileMetrics.headerTitle,
    fontWeight: '600',
    flexShrink: 1,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  menuCard: {
    position: 'absolute',
    left: '50%',
    width: 220,
    marginLeft: -110,
    borderRadius: mobileMetrics.menuRadius,
    paddingHorizontal: 8,
    paddingVertical: 4,
    elevation: 2,
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 96,
  },
  section: {
    marginBottom: mobileMetrics.cardGap,
  },
  sectionTitle: {
    fontSize: mobileMetrics.caption,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  dot: {
    width: mobileMetrics.statusDot,
    height: mobileMetrics.statusDot,
    borderRadius: mobileMetrics.statusDot / 2,
    marginRight: 12,
  },
  rowTitle: {
    flex: 1,
    fontSize: mobileMetrics.rowTitle,
  },
  rowDate: {
    fontSize: mobileMetrics.caption,
    marginLeft: 12,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: mobileMetrics.fabSize,
    height: mobileMetrics.fabSize,
    borderRadius: mobileMetrics.fabSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
})
