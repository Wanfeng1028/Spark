/**
 * 配对设备管理（DESIGN §13.J.2.8“配对设备 >”+“断开并撤销配对”；工单 19.27 收口）。
 *
 * 为什么单列一个组件而不是塞进 SettingsScreen：这是一张有自己请求生命周期
 * （列表/撤销/签发）的子页，控制器在 src/session/pair-devices.ts，本文件只做渲染。
 *
 * 撤销是服务端终态操作（该设备的 SSE 立即断开），所以二次确认在端上做、
 * 撤销成功后一律重取列表（不本地摘行——避免与服务端记录分叉）。
 */
import { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { PairDevicesSnapshot } from '../session/pair-devices'
import { createPairDevicesController, type PairDevicesController } from '../session/pair-devices'
import { useConfigStore } from '../store/config-store'
import { getHttpTransport } from '../transport/runtime'
import { useTheme } from '../theme/use-theme'
import { mobileMetrics } from '../theme/tokens'
import { Card, Hairline, SheetScreen } from './ui'

const INITIAL: PairDevicesSnapshot = {
  status: null,
  code: null,
  busy: false,
  revoking: null,
  notice: null,
}

export function PairDevicesSheet({ onClose }: { onClose: () => void }) {
  const t = useTheme()
  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const [snap, setSnap] = useState<PairDevicesSnapshot>(INITIAL)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const controllerRef = useRef<PairDevicesController | null>(null)

  useEffect(() => {
    const c = createPairDevicesController({
      rest: () => getHttpTransport(serverUrl, token),
      onUpdate: setSnap,
    })
    controllerRef.current = c
    void c.refresh()
    return () => {
      c.dispose()
      controllerRef.current = null
    }
  }, [serverUrl, token])

  const status = snap.status

  return (
    <SheetScreen title="配对设备" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        {status === null ? (
          // 一次没读成功就不假装"有 0 台"：错误在位时呈现错误，否则才是加载中
          <Text style={[styles.meta, { color: snap.notice === null ? t.mutedForeground : t.sparkErr }]}>
            {snap.notice ?? '读取配对状态…'}
          </Text>
        ) : (
          <>
            {snap.notice !== null && (
              <Text style={[styles.meta, { color: t.sparkErr }]}>{snap.notice}</Text>
            )}
            <Card style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: t.foreground }]}>服务地址</Text>
              <Text style={[styles.meta, { color: t.mutedForeground }]}>
                {`${status.host}:${status.port}`}
                {' · '}
                {status.loopback ? '仅本机（环回）' : '局域网可达'}
                {' · '}
                {status.authEnabled ? '配对鉴权已启用' : '配对鉴权未启用'}
              </Text>
            </Card>
            <Card style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: t.foreground }]}>
                {`已配对设备（${status.devices.length}）`}
              </Text>
              {status.devices.length === 0 ? (
                <Text style={[styles.meta, { color: t.mutedForeground }]}>
                  还没有设备配对过。签发一个配对码，另一台设备凭它连接。
                </Text>
              ) : (
                status.devices.map((d, i) => (
                  <View key={d.id}>
                    {i > 0 ? <Hairline inset={0} /> : null}
                    <View style={styles.deviceRow}>
                      <View style={styles.deviceMain}>
                        <Text numberOfLines={1} style={[styles.rowLabel, { color: t.foreground }]}>
                          {d.name}
                        </Text>
                        <Text style={[styles.meta, { color: t.mutedForeground }]}>
                          {`最近活跃 ${new Date(d.lastSeenAt).toLocaleString('zh-CN')}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`撤销 ${d.name}`}
                        disabled={snap.busy}
                        onPress={() => setConfirmId(d.id)}
                        activeOpacity={0.7}
                        style={styles.revoke}
                      >
                        <Feather name="x" size={18} color={t.sparkErr} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </Card>
            {snap.code !== null && (
              <Card style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: t.foreground }]}>配对码</Text>
                <Text style={[styles.pairCode, { color: t.foreground }]}>{snap.code.code}</Text>
                <Text style={[styles.meta, { color: t.mutedForeground }]}>
                  另一台设备在配对引导里输入这 6 位数字；过期后重新签发。
                </Text>
              </Card>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="签发配对码"
              disabled={snap.busy}
              onPress={() => void controllerRef.current?.issueCode()}
              activeOpacity={0.7}
              style={[styles.cta, { backgroundColor: t.primary }]}
            >
              <Text style={[styles.ctaText, { color: t.primaryForeground }]}>
                {snap.busy ? '处理中…' : snap.code === null ? '签发配对码' : '重新签发配对码'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      {confirmId !== null && (
        <View style={styles.confirmBackdrop}>
          <View style={[styles.confirmCard, { backgroundColor: t.card }]}>
            <Text style={[styles.rowLabel, { color: t.foreground }]}>撤销这台设备？</Text>
            <Text style={[styles.meta, { color: t.mutedForeground }]}>
              撤销后该设备的连接立即断开，需重新配对才能恢复。
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="确认撤销"
              onPress={() => {
                const id = confirmId
                setConfirmId(null)
                void controllerRef.current?.revoke(id)
              }}
              activeOpacity={0.7}
              style={styles.confirmAction}
            >
              <Text style={[styles.rowLabel, { color: t.sparkErr }]}>撤销</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="保持配对"
              onPress={() => setConfirmId(null)}
              activeOpacity={0.7}
              style={styles.confirmAction}
            >
              <Text style={[styles.rowLabel, { color: t.mutedForeground }]}>保持</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SheetScreen>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: mobileMetrics.cardGap,
  },
  cardBody: {
    gap: 8,
  },
  cardTitle: {
    fontSize: mobileMetrics.rowTitle,
    fontWeight: '600',
  },
  meta: {
    fontSize: mobileMetrics.caption,
  },
  rowLabel: {
    fontSize: mobileMetrics.rowTitle,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: mobileMetrics.rowHeight,
    gap: 12,
  },
  deviceMain: {
    flex: 1,
    gap: 2,
  },
  revoke: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairCode: {
    fontSize: mobileMetrics.headerTitle,
    fontWeight: '600',
    letterSpacing: 4,
  },
  cta: {
    height: mobileMetrics.ctaHeight,
    borderRadius: mobileMetrics.ctaHeight / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: mobileMetrics.rowTitle,
    fontWeight: '600',
  },
  confirmBackdrop: {
    /* RN 0.86 的类型面只留了 absoluteFill（注册样式 id，不可展开），absoluteFillObject 已不在面上 */
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    padding: 32,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 3,
  },
  confirmCard: {
    borderRadius: mobileMetrics.cardRadius,
    padding: mobileMetrics.cardPadding,
    gap: 10,
  },
  confirmAction: {
    height: mobileMetrics.actionRowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
