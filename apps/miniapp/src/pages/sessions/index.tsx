/**
 * 会话列表页（工单 9.4——语义对齐 apps/mobile SessionsScreen，DESIGN §13.J.2.2；
 * 工单 19.29 小程序补齐批：筛选菜单落地）。
 * 形态收敛说明（§13.J.1 + 工单口径）：
 * - 小程序原生页面栈导航：头部右侧"设置"文字钮直达设置页（替代 RN 抽屉）；无 tab bar。
 * - 标题行"全部会话 ⌄"→ 筛选菜单（全部 / 按项目 / 已归档）：三档皆有后端支撑
 *   （listSessions(archived?) 工单 12.4），原"浮层交互成本高故收敛为仅时间分组"的
 *   偏离声明作废。菜单为页内浮层（绝对定位白卡 + 透明遮罩收点），不用原生 ActionSheet
 *   ——后者只给行高 44 的选项列表，装不下"选中 ✓ + 档位说明"的 J.2.2 形态。
 * - 下拉刷新 = 页面级 enablePullDownRefresh + usePullDownRefresh（当前档重取快照）。
 * - 行：状态点 16rpx + 标题单行截断 + 右侧日期 24rpx meta，行高 104rpx（J.2.2 52px×2）。
 *   已归档档的状态点走灰档（工单 19.21 尾巴兑现）：规则单源在 protocol `dotTokenOf`，
 *   本端只把 `dotColor` 的第三参传归档位——原"等端主题补 sparkMeta 再收敛"的注记作废，
 *   两端 ThemeTokens 早有 `mutedForeground`，再立同值同义的第四色只会让人分不清用哪个。
 * - 右下 FAB 112rpx accent 白"+"。
 * 列表快照纪律同四端（AGENTS §2.7）：刷新/聚焦时刻 REST 快照，不轮询。
 */
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import type { SessionDto } from '@spark/protocol'
import { dotColor, fmtDate } from '@spark/protocol'
import { useAppStore } from '../../store/app-store'
import { useConfigStore } from '../../store/config-store'
import { useTheme } from '../../store/theme-store'
import { miniErrorMessageOf, miniT } from '../../i18n'
import { getRestClient } from '../../transport/runtime'
import {
  SESSION_FILTERS,
  archivedQueryOf,
  buildSections,
  listTitleOf,
  type SessionFilter,
} from '../../session/session-list-filter'
import { Card, EmptyState, FloatButton, Hairline } from '../../components/ui'
import './index.css'

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
  const [filter, setFilter] = useState<SessionFilter>('all')
  const [menuOpen, setMenuOpen] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const rest = getRestClient(serverUrl, token)
    if (rest === null) {
      setNotice('未配置服务器：请先在设置页完成配对')
      return
    }
    try {
      const archived = archivedQueryOf(filter)
      setSessions(await rest.listSessions(archived))
      setNotice(null)
    } catch (err: unknown) {
      // 失败闭合：列表失败如实提示，保留旧快照（不拿空列表冒充）
      setNotice(miniErrorMessageOf(err))
    }
  }, [serverUrl, token, filter, setSessions, setNotice])

  // 档位切换即重取快照（数据源随档变化——归档档不在"全部"的返回里，客户端筛不出）
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

  const sections = buildSections(sessions, filter)

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
      .catch((err: unknown) => setNotice(miniErrorMessageOf(err)))
  }, [serverUrl, token, setActiveSession, setNotice])

  const emptyDetail =
    filter === 'archived'
      ? '没有已归档的会话（归档在桌面/网页端侧栏操作）'
      : serverUrl === ''
        ? '先在设置页完成配对，再从右下角新建'
        : '下拉刷新，或从右下角新建会话'

  return (
    <View className="sl-screen" style={{ backgroundColor: t.pageBackground }}>
      <View className="sl-header">
        <View
          className="sl-title-button"
          aria-label="会话筛选"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Text className="sl-title" style={{ color: t.foreground }}>
            {listTitleOf(filter)}
          </Text>
          <Text className="sl-title-caret" style={{ color: t.mutedForeground }}>
            ⌄
          </Text>
        </View>
        <Text
          className="sl-settings"
          aria-label="打开设置"
          style={{ color: t.sparkAccent }}
          onClick={() => {
            void Taro.navigateTo({ url: '/pages/settings/index' })
          }}
        >
          {miniT('shell.settings')}
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
            {miniT('action.retry')}
          </Text>
        </View>
      )}
      {sections.length === 0 && !refreshing ? (
        <EmptyState title="暂无会话" detail={emptyDetail} />
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
                    <View className="sl-row" onClick={() => openSession(dto)}>
                      {/* 归档压过状态色（工单 19.21 尾巴，规则单源在 protocol dotTokenOf） */}
                      <View
                        className="sl-dot"
                        style={{
                          backgroundColor: dotColor(dto.status, t, dto.archivedAt !== undefined),
                        }}
                      />
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
      {/* 筛选菜单（J.2.2：白卡 radius 12、行高 44、选中 ✓；遮罩层先挂故点外即收） */}
      {menuOpen && (
        <View className="sl-menu-backdrop">
          <View
            className="sl-menu-mask"
            aria-label="关闭筛选菜单"
            onClick={() => setMenuOpen(false)}
          />
          <View className="sl-menu-card" style={{ backgroundColor: t.card }}>
            {SESSION_FILTERS.map((opt, i) => (
              <View key={opt.value}>
                {i > 0 ? <Hairline /> : null}
                <View
                  className="sl-menu-row"
                  aria-label={`筛选：${opt.label}`}
                  onClick={() => {
                    setFilter(opt.value)
                    setMenuOpen(false)
                  }}
                >
                  <Text className="sl-menu-label" style={{ color: t.foreground }}>
                    {opt.label}
                  </Text>
                  {filter === opt.value ? (
                    <Text className="sl-menu-check" style={{ color: t.sparkAccent }}>
                      ✓
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  )
}
