/**
 * 会话列表屏（DESIGN §13.J.2.2）：下拉刷新（transport.listSessions()）、
 * 时间分组（今天/更早）、行=状态点 8px+标题 16 单行截断+右侧日期 13 meta、
 * 行高 52、右下 FAB 56 accent 白"+"。列表快照纪律同 cli（AGENTS §2.7）：
 * 刷新/聚焦时刻 REST 快照，不轮询。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { DrawerNavigationProp } from '@react-navigation/drawer'
import type { SessionDto, SessionStatus } from '@spark/protocol'
import { errorMessageOf } from '@spark/protocol'
import { useAppStore } from '../store/app-store'
import { useConfigStore } from '../store/config-store'
import { getHttpTransport } from '../transport/runtime'
import { useTheme } from '../theme/use-theme'
import type { ThemeTokens } from '../theme/tokens'
import { mobileMetrics } from '../theme/tokens'
import { Card, EmptyState, Hairline, ScreenHeader } from '../components/ui'
import type { DrawerParamList } from '../navigation/params'

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

function isToday(ts: number): boolean {
  const d = new Date(ts)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

/** 右侧日期 13 meta：今天=时分，更早=月/日 */
function fmtDate(ts: number): string {
  const d = new Date(ts)
  if (isToday(ts)) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

type Section = { key: 'today' | 'earlier'; title: string; items: SessionDto[] }

export function SessionsScreen() {
  const t = useTheme()
  const navigation = useNavigation<DrawerNavigationProp<DrawerParamList>>()
  const sessions = useAppStore((s) => s.sessions)
  const setSessions = useAppStore((s) => s.setSessions)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setNotice = useAppStore((s) => s.setNotice)
  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const [refreshing, setRefreshing] = useState(false)

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
    const today = sorted.filter((s) => isToday(s.updatedAt))
    const earlier = sorted.filter((s) => !isToday(s.updatedAt))
    const out: Section[] = []
    if (today.length > 0) out.push({ key: 'today', title: '今天', items: today })
    if (earlier.length > 0) out.push({ key: 'earlier', title: '更早', items: earlier })
    return out
  }, [sessions])

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
      <ScreenHeader
        title="全部会话"
        leftIcon="menu"
        leftLabel="打开抽屉"
        onLeftPress={() => navigation.openDrawer()}
      />
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
