/**
 * 设置屏（DESIGN §13.J.2.4 精简——工单 9.2 范围）：
 * 服务器地址+token 配置区（未配置时展示配对引导占位，J.2.10 简化）、
 * 深链待配对确认卡（spark://pair 解析产物，连接=短码兑长效 token）、
 * 外观三档（跟随系统/浅色/深色）、断开连接（红字独立白卡）。
 */
import { useCallback, useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { DrawerNavigationProp } from '@react-navigation/drawer'
import { HttpTransport, errorMessageOf } from '@spark/protocol'
import { useConfigStore } from '../store/config-store'
import { invalidateTransport } from '../transport/runtime'
import { baseUrlOf } from '../transport/pair-link'
import { useTheme } from '../theme/use-theme'
import type { AppearancePreference } from '../theme/tokens'
import { mobileMetrics } from '../theme/tokens'
import { Card, Hairline, ScreenHeader } from '../components/ui'
import type { DrawerParamList } from '../navigation/params'

const APPEARANCE_OPTIONS: ReadonlyArray<{ value: AppearancePreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

export function SettingsScreen() {
  const t = useTheme()
  const navigation = useNavigation<DrawerNavigationProp<DrawerParamList>>()
  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const appearance = useConfigStore((s) => s.appearance)
  const pendingPair = useConfigStore((s) => s.pendingPair)
  const saveConnection = useConfigStore((s) => s.saveConnection)
  const disconnect = useConfigStore((s) => s.disconnect)
  const setPendingPair = useConfigStore((s) => s.setPendingPair)

  const [urlDraft, setUrlDraft] = useState(serverUrl)
  const [tokenDraft, setTokenDraft] = useState(token)
  const [busy, setBusy] = useState(false)
  const [localNotice, setLocalNotice] = useState<string | null>(null)

  const configured = serverUrl !== ''

  const onSave = useCallback((): void => {
    const url = urlDraft.trim()
    if (url === '') {
      setLocalNotice('服务器地址不能为空')
      return
    }
    setBusy(true)
    void saveConnection(url, tokenDraft.trim())
      .then(() => {
        invalidateTransport()
        setLocalNotice(null)
      })
      .catch((err: unknown) => setLocalNotice(errorMessageOf(err)))
      .finally(() => setBusy(false))
  }, [urlDraft, tokenDraft, saveConnection])

  const onRedeem = useCallback((): void => {
    if (pendingPair === null) return
    setBusy(true)
    const base = baseUrlOf(pendingPair.host, pendingPair.port)
    // 兑换口无需 token（鉴权自举——工单 9.1）；一次性短码服务端二次校验
    const transport = new HttpTransport({ baseUrl: base, eventStream: false })
    void transport
      .redeemPair({ code: pendingPair.code })
      .then((dto) => saveConnection(base, dto.token))
      .then(() => {
        invalidateTransport()
        setPendingPair(null)
        setLocalNotice(null)
      })
      .catch((err: unknown) => setLocalNotice(errorMessageOf(err)))
      .finally(() => {
        transport.dispose()
        setBusy(false)
      })
  }, [pendingPair, saveConnection, setPendingPair])

  return (
    <View style={[styles.screen, { backgroundColor: t.pageBackground }]}>
      <ScreenHeader
        title="设置"
        leftIcon="menu"
        leftLabel="打开抽屉"
        onLeftPress={() => navigation.openDrawer()}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 深链待配对确认卡（J.2.9：server 地址 + 连接/取消） */}
        {pendingPair !== null ? (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, { color: t.foreground }]}>待配对</Text>
            <Text style={[styles.pairHost, { color: t.mutedForeground }]}>
              {baseUrlOf(pendingPair.host, pendingPair.port)}
            </Text>
            <View style={styles.pairActions}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onRedeem}
                disabled={busy}
                style={[styles.cta, { backgroundColor: t.primary }]}
              >
                <Text style={[styles.ctaText, { color: t.primaryForeground }]}>连接</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setPendingPair(null)}
                disabled={busy}
                style={[styles.ctaGhost, { borderColor: t.border }]}
              >
                <Text style={[styles.ctaGhostText, { color: t.mutedForeground }]}>取消</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : null}

        {/* 连接配置区（J.2.4：服务器地址 + token） */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: t.foreground }]}>服务器</Text>
          <Text style={[styles.fieldLabel, { color: t.mutedForeground }]}>服务器地址</Text>
          <TextInput
            value={urlDraft}
            onChangeText={setUrlDraft}
            placeholder="http://192.168.1.10:4318"
            placeholderTextColor={t.ring}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: t.foreground, borderColor: t.border }]}
          />
          <Text style={[styles.fieldLabel, { color: t.mutedForeground }]}>配对 Token</Text>
          <TextInput
            value={tokenDraft}
            onChangeText={setTokenDraft}
            placeholder="扫码配对所得；环回直连可留空"
            placeholderTextColor={t.ring}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={[styles.input, { color: t.foreground, borderColor: t.border }]}
          />
          {localNotice !== null ? (
            <Text style={[styles.notice, { color: t.sparkErr }]}>{localNotice}</Text>
          ) : null}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onSave}
            disabled={busy}
            style={[styles.cta, { backgroundColor: t.primary }]}
          >
            <Text style={[styles.ctaText, { color: t.primaryForeground }]}>
              {busy ? '保存中…' : '保存'}
            </Text>
          </TouchableOpacity>
        </Card>

        {/* 未配置：配对引导占位（J.2.10 简化——虚线卡 + 步骤，禁插画/3D 拟物） */}
        {!configured && pendingPair === null ? (
          <View style={[styles.guide, { borderColor: t.border }]}>
            <Text style={[styles.guideTitle, { color: t.foreground }]}>扫码配对</Text>
            <Text style={[styles.guideStep, { color: t.mutedForeground }]}>
              1. 桌面端以非环回地址启动服务
            </Text>
            <Text style={[styles.guideStep, { color: t.mutedForeground }]}>
              2. 桌面端设置页出示配对二维码
            </Text>
            <Text style={[styles.guideStep, { color: t.mutedForeground }]}>
              3. 本应用扫码，或在上方手输地址与 Token
            </Text>
          </View>
        ) : null}

        {/* 外观（§13.C 三档） */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: t.foreground }]}>外观</Text>
          {APPEARANCE_OPTIONS.map((opt, i) => (
            <View key={opt.value}>
              {i > 0 ? <Hairline inset={0} /> : null}
              <AppearanceRow
                label={opt.label}
                selected={appearance === opt.value}
                onPress={() => useConfigStore.getState().setAppearance(opt.value)}
              />
            </View>
          ))}
        </Card>

        {/* 断开连接（J.2.4⑤：红字、独立白卡） */}
        {configured ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              // G6：异步口径一致——失败走本地人话提示（失败闭合，不静默吞）
              void disconnect()
                .then(() => {
                  invalidateTransport()
                  setUrlDraft('')
                  setTokenDraft('')
                })
                .catch((err: unknown) => setLocalNotice(errorMessageOf(err)))
            }}
            style={[styles.card, { backgroundColor: t.card }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.disconnect, { color: t.sparkErr }]}>断开连接</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  )
}

function AppearanceRow({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.appearanceRow, { height: mobileMetrics.rowHeight }]}>
        <Text style={[styles.appearanceLabel, { color: t.foreground }]}>{label}</Text>
        {selected ? <Feather name="check" size={16} color={t.sparkAccent} /> : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: mobileMetrics.cardGap,
  },
  card: {
    borderRadius: mobileMetrics.cardRadius,
  },
  cardTitle: {
    fontSize: mobileMetrics.rowTitle,
    fontWeight: '600',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: mobileMetrics.caption,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: mobileMetrics.value,
  },
  notice: {
    fontSize: mobileMetrics.caption,
    marginTop: 8,
  },
  cta: {
    height: mobileMetrics.ctaHeight,
    borderRadius: mobileMetrics.ctaHeight / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  ctaText: {
    fontSize: mobileMetrics.rowTitle,
    fontWeight: '600',
  },
  ctaGhost: {
    height: mobileMetrics.ctaHeight,
    borderRadius: mobileMetrics.ctaHeight / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  ctaGhostText: {
    fontSize: mobileMetrics.rowTitle,
  },
  pairHost: {
    fontSize: mobileMetrics.value,
    marginBottom: 4,
  },
  pairActions: {
    marginTop: 8,
  },
  guide: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  guideTitle: {
    fontSize: mobileMetrics.rowTitle,
    fontWeight: '600',
    marginBottom: 4,
  },
  guideStep: {
    fontSize: mobileMetrics.caption,
  },
  appearanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appearanceLabel: {
    fontSize: mobileMetrics.rowTitle,
  },
  disconnect: {
    fontSize: mobileMetrics.rowTitle,
    textAlign: 'center',
  },
})
