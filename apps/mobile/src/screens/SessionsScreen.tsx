/**
 * 会话列表屏（DESIGN §13.J.2.2）：标题行“全部会话 ˅”→ 筛选菜单（评审 G2：
 * 白卡 radius 12、行高 44、图标+文案、选中 ✓），下拉刷新（transport.listSessions()），
 * 时间分组（今天/更早；“按项目”档改按 cwd 目录名分组，无项目信息归“未分组”）、
 * 行=状态点 8px+标题 16 单行截断+右侧日期 13 meta、行高 52、右下 FAB 56 accent 白“+”。
 * 列表快照纪律同 cli（AGENTS §2.7）：刷新/聚焦时刻 REST 快照，不轮询。
 *
 * 工单 19.27：三档筛选全接真数据源——“已归档”此前是置灰占位（V2-23 判“无后端支撑”），
 * 现走 `listSessions(true)`（工单 12.4 落的后端），V2-23 在移动端消解。
 * 取数与筛选态收敛到 src/session/session-list.ts 的控制器，屏幕只渲染与接线。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DrawerNavigationProp } from '@react-navigation/drawer'
import type { SessionDto } from '@spark/protocol'
import { dotColor, errorMessageOf, fmtDate } from '@spark/protocol'
import { useAppStore } from '../store/app-store'
import { useConfigStore } from '../store/config-store'
import { getHttpTransport } from '../transport/runtime'
import { useTheme } from '../theme/use-theme'
import type { ThemeTokens } from '../theme/tokens'
import { mobileMetrics } from '../theme/tokens'
import { Card, EmptyState, Hairline, MenuCard, RoundFloatButton } from '../components/ui'
import type { MenuRowSpec } from '../components/ui'
import type { DrawerParamList } from '../navigation/params'
import {
  createSessionListController,
  groupSessions,
  type SessionFilter,
  type SessionListController,
  type SessionListSnapshot,
} from '../session/session-list'

const UNCONFIGURED_NOTICE = '未配置服务器：请先在设置页完成配对'

const FILTERS: ReadonlyArray<{
  value: SessionFilter
  label: string
  icon: 'list' | 'folder' | 'archive'
}> = [
  { value: 'all', label: '全部', icon: 'list' },
  { value: 'project', label: '按项目', icon: 'folder' },
  { value: 'archived', label: '已归档', icon: 'archive' },
]

/** 标题行措辞：全部档保留“全部会话”（J.2.2 实测原文），其余档即档位名 */
const HEADER_LABELS: Record<SessionFilter, string> = {
  all: '全部会话',
  project: '按项目',
  archived: '已归档',
}

const EMPTY_SNAPSHOT: SessionListSnapshot = {
  filter: 'all',
  sessions: [],
  refreshing: false,
  notice: null,
  loaded: false,
}

export function SessionsScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<DrawerNavigationProp<DrawerParamList>>()
  const setSessions = useAppStore((s) => s.setSessions)
  const setNotice = useAppStore((s) => s.setNotice)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const [snap, setSnap] = useState<SessionListSnapshot>(EMPTY_SNAPSHOT)
  const [menuOpen, setMenuOpen] = useState(false)
  const controllerRef = useRef<SessionListController | null>(null)

  useEffect(() => {
    const c = createSessionListController({
      rest: () => getHttpTransport(serverUrl, token),
      onUpdate: setSnap,
      unconfiguredNotice: UNCONFIGURED_NOTICE,
    })
    controllerRef.current = c
    return () => {
      c.dispose()
      controllerRef.current = null
    }
  }, [serverUrl, token])

  // 聚焦即重取（列表快照纪律）：装载、下拉之外的第二个入口，也是归档/改名/删除
  // 在会话页发生后回到列表能看到新态的原因——不轮询。effect 声明顺序保证
  // 首次聚焦时控制器已就绪。
  useFocusEffect(
    useCallback(() => {
      void controllerRef.current?.refresh()
    }, []),
  )

  // 列表快照同时喂 app-store（会话页的归档态数据源 = 这张表）
  useEffect(() => {
    if (!snap.loaded) return
    setSessions(snap.sessions)
    setNotice(snap.notice)
  }, [snap, setSessions, setNotice])

  const sections = useMemo(
    () => groupSessions(snap.sessions, snap.filter),
    [snap.sessions, snap.filter],
  )

  const onCreate = useCallback((): void => {
    const transport = getHttpTransport(serverUrl, token)
    if (transport === null) {
      setNotice(UNCONFIGURED_NOTICE)
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

  const emptyTitle = snap.filter === 'archived' ? '暂无已归档会话' : '暂无会话'
  const emptyDetail =
    serverUrl === ''
      ? '先在设置页完成配对，再从右下角新建'
      : snap.filter === 'archived'
        ? '在会话页的“…”菜单里归档的会话会出现在这里'
        : '下拉刷新，或从右下角新建会话'

  const menuRows = useMemo<readonly MenuRowSpec[]>(
    () =>
      FILTERS.map((f) => ({
        icon: f.icon,
        label: f.label,
        selected: snap.filter === f.value,
        onPress: () => {
          setMenuOpen(false)
          controllerRef.current?.setFilter(f.value)
        },
      })),
    [snap.filter],
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
            {HEADER_LABELS[snap.filter]}
          </Text>
          <Feather name="chevron-down" size={16} color={t.mutedForeground} />
        </TouchableOpacity>
      </View>
      {snap.notice !== null && (
        <View style={[styles.noticeBar, { backgroundColor: t.card }]}>
          <Text style={[styles.rowDate, { color: t.sparkErr }]}>{snap.notice}</Text>
        </View>
      )}
      {sections.length === 0 && !snap.refreshing ? (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={snap.refreshing}
              onRefresh={() => {
                void controllerRef.current?.refresh()
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
        <MenuCard
          accessibleName="会话筛选"
          rows={menuRows}
          top={insets.top + 60}
          rowHeight={mobileMetrics.menuRowHeight}
          onDismiss={() => setMenuOpen(false)}
        />
      ) : null}
    </View>
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
        {/* 归档压过状态色（工单 19.21 尾巴，规则单源在 protocol dotTokenOf）：已归档会话
            未装载、status 一律 'idle'，画绿点等于谎称它仍在工作区里活跃 */}
        <View
          style={[
            styles.dot,
            { backgroundColor: dotColor(dto.status, t, dto.archivedAt !== undefined) },
          ]}
        />
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
  noticeBar: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'center',
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
