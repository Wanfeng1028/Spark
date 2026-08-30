/**
 * 会话列表页（工单 9.4——语义对齐 apps/mobile SessionsScreen，DESIGN §13.J.2.2）。
 * 形态收敛说明（§13.J.1 + 工单口径）：
 * - 小程序原生页面栈导航：头部右侧"设置"文字钮直达设置页（替代 RN 抽屉）；
 *   无 tab bar。筛选菜单（全部/按项目/已归档）依赖较多浮层交互，小程序端收敛为
 *   仅时间分组（今天/更早）——记偏离：筛选档留 v2。
 * - 下拉刷新 = 页面级 enablePullDownRefresh + usePullDownRefresh（transport.listSessions()）。
 * - 行：状态点 16rpx + 标题单行截断 + 右侧日期 24rpx meta，行高 104rpx（J.2.2 52px×2）。
 * - 右下 FAB 112rpx accent 白"+"。
 * 列表快照纪律同四端（AGENTS §2.7）：刷新/聚焦时刻 REST 快照，不轮询。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import type { SessionDto, SessionStatus } from '@spark/protocol'
import { errorMessageOf } from '@spark/protocol'
import { useAppStore } from '../../store/app-store'
import { useConfigStore } from '../../store/config-store'
import { useTheme } from '../../store/theme-store'
import type { ThemeTokens } from '../../theme/tokens'
import { getRestClient } from '../../transport/runtime'
import { Card, EmptyState, FloatButton, Hairline } from '../../components/ui'
import './index.css'

/** 状态点配色（J.2.2：绿空闲/accent 运行/amber 待审批） */
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

/** 右侧日期 24rpx meta：今天=时分，更早=月/日 */
function fmtDate(ts: number): string {
  const d = new Date(ts)
  if (isToday(ts)) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

type Section = { key: string; title: string; items: SessionDto[] }

export default function SessionsPage() {
  const t = useTheme()
  const sessions = useAppStore((s) => s.sessions)
  const setSessions = useAppStore((s) => s.setSessions)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const notice = useAppStore((s) => s.notice)
  const setNotice = useAppStore((s) => s.setNotice)
  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const rest = getRestClient(serverUrl, token)
    if (rest === null) {
      setNotice('未配置服务器：请先在设置页完成配对')
      return
    }
    try {
      setSessions(await rest.listSessions())
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

  usePullDownRefresh(() => {
    setRefreshing(true)
    void refresh().finally(() => Taro.stopPullDownRefresh())
  })

  // 人话提示条 5s 自清（不留陈旧错误冒充现状）
  useEffect(() => {
    if (notice === null) return () => undefined
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  const sections = useMemo<Section[]>(() => {
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    const today = sorted.filter((s) => isToday(s.updatedAt))
    const earlier = sorted.filter((s) => !isToday(s.updatedAt))
    const out: Section[] = []
    if (today.length > 0) out.push({ key: 'today', title: '今天', items: today })
    if (earlier.length > 0) out.push({ key: 'earlier', title: '更早', items: earlier })
    return out
  }, [sessions])

  const openSession = useCallback(
    (dto: SessionDto): void => {
      setActiveSession(dto.id)
      void Taro.navigateTo({
        url: `/pages/session/index?sessionId=${dto.id}&title=${encodeURIComponent(dto.title)}`,
      })
    },
    [setActiveSession],
  )

  const onCreate = useCallback((): void => {
    const rest = getRestClient(serverUrl, token)
    if (rest === null) {
      setNotice('未配置服务器：请先在设置页完成配对')
      return
    }
    void rest
      .createSession()
      .then((dto) => {
        setActiveSession(dto.id)
        return Taro.navigateTo({
          url: `/pages/session/index?sessionId=${dto.id}&title=${encodeURIComponent(dto.title)}`,
        })
      })
      .catch((err: unknown) => setNotice(errorMessageOf(err)))
  }, [serverUrl, token, setActiveSession, setNotice])

  return (
    <View className="sl-screen" style={{ backgroundColor: t.pageBackground }}>
      <View className="sl-header">
        <Text className="sl-title" style={{ color: t.foreground }}>
          全部会话
        </Text>
        <Text
          className="sl-settings"
          aria-label="打开设置"
          style={{ color: t.sparkAccent }}
          onClick={() => {
            void Taro.navigateTo({ url: '/pages/settings/index' })
          }}
        >
          设置
        </Text>
      </View>
      {notice !== null && (
        <View className="sl-notice" style={{ backgroundColor: t.card }}>
          <Text className="sl-notice-text" style={{ color: t.sparkErr }}>
            {notice}
          </Text>
          {/* 错误=细条+人话文案+重试钮（§13.J.4——评审 I10） */}
          <Text
            className="sl-notice-retry"
            style={{ color: t.sparkAccent }}
            onClick={() => {
              void refresh()
            }}
          >
            重试
          </Text>
        </View>
      )}
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
        <View className="sl-list">
          {sections.map((section) => (
            <View key={section.key} className="sl-section">
              <Text className="sl-section-title" style={{ color: t.mutedForeground }}>
                {section.title}
              </Text>
              <Card className="sl-section-card">
                {section.items.map((dto, i) => (
                  <View key={dto.id}>
                    {i > 0 ? <Hairline /> : null}
                    <View
                      className="sl-row"
                      onClick={() => openSession(dto)}
                    >
                      <View className="sl-dot" style={{ backgroundColor: dotColor(dto.status, t) }} />
                      <Text className="sl-row-title sl-ellipsis" style={{ color: t.foreground }}>
                        {dto.title !== '' ? dto.title : '新会话'}
                      </Text>
                      <Text className="sl-row-date" style={{ color: t.mutedForeground }}>
                        {fmtDate(dto.updatedAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </View>
      )}
      <View className="sl-fab-wrap">
        <FloatButton
          glyph="+"
          label="新建会话"
          onPress={onCreate}
          background={t.sparkAccent}
          glyphColor="#ffffff"
        />
      </View>
    </View>
  )
}
