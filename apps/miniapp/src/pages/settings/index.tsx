/**
 * 设置页（工单 9.4——语义对齐 apps/mobile SettingsScreen，DESIGN §13.J.2.4 精简）。
 * 服务器地址+token 配置区、深链/扫码待配对确认卡（spark://pair 解析）、
 * 手输配对（地址+6 位码——小程序主路径；扫码失败不阻塞落回手输）、
 * 外观三档（跟随系统/浅色/深色）、断开连接（红字独立白卡，J.2.4⑤）。
 */
import { useCallback, useState } from 'react'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { BaseEventOrig, InputProps } from '@tarojs/components'
import { errorMessageOf } from '@spark/protocol'
import { useConfigStore } from '../../store/config-store'
import { useTheme } from '../../store/theme-store'
import type { AppearancePreference } from '../../theme/tokens'
import { invalidateRest, redeemPairCode } from '../../transport/runtime'
import { baseUrlOf, parsePairCode, parsePairLink } from '../../transport/pair'
import { Card, Hairline } from '../../components/ui'
import './index.css'

const APPEARANCE_OPTIONS: ReadonlyArray<{ value: AppearancePreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

export default function SettingsPage() {
  const t = useTheme()
  const serverUrl = useConfigStore((s) => s.serverUrl)
  const token = useConfigStore((s) => s.token)
  const appearance = useConfigStore((s) => s.appearance)
  const pendingPair = useConfigStore((s) => s.pendingPair)
  const saveConnection = useConfigStore((s) => s.saveConnection)
  const disconnect = useConfigStore((s) => s.disconnect)
  const setPendingPair = useConfigStore((s) => s.setPendingPair)

  const [urlDraft, setUrlDraft] = useState(serverUrl)
  const [tokenDraft, setTokenDraft] = useState(token)
  const [pairUrlDraft, setPairUrlDraft] = useState('')
  const [pairCodeDraft, setPairCodeDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [localNotice, setLocalNotice] = useState<string | null>(null)

  const configured = serverUrl !== ''

  /** 保存手输连接配置（失败如实上屏，不静默） */
  const onSave = useCallback((): void => {
    const url = urlDraft.trim()
    if (url === '') {
      setLocalNotice('服务器地址不能为空')
      return
    }
    saveConnection(url, tokenDraft.trim())
    invalidateRest()
    setLocalNotice(null)
  }, [urlDraft, tokenDraft, saveConnection])

  /** 待配对确认卡"连接"：短码兑长效 token（兑换口无需 token——鉴权自举，9.1） */
  const onRedeem = useCallback((): void => {
    if (pendingPair === null) return
    setBusy(true)
    const base = baseUrlOf(pendingPair.host, pendingPair.port)
    void redeemPairCode(base, pendingPair.code)
      .then((dto) => {
        saveConnection(base, dto.token)
        invalidateRest()
        setPendingPair(null)
        setLocalNotice(null)
      })
      .catch((err: unknown) => setLocalNotice(errorMessageOf(err)))
      .finally(() => setBusy(false))
  }, [pendingPair, saveConnection, setPendingPair])

  /** 手输配对（小程序主路径）：地址 + 6 位码 → 兑换 */
  const onManualPair = useCallback((): void => {
    const url = pairUrlDraft.trim()
    if (url === '') {
      setLocalNotice('请输入服务器地址')
      return
    }
    const code = parsePairCode(pairCodeDraft)
    if (code === null) {
      setLocalNotice('配对码须为 6 位数字')
      return
    }
    setBusy(true)
    void redeemPairCode(url, code)
      .then((dto) => {
        saveConnection(url, dto.token)
        invalidateRest()
        setUrlDraft(url)
        setTokenDraft(dto.token)
        setPairCodeDraft('')
        setLocalNotice(null)
      })
      .catch((err: unknown) => setLocalNotice(errorMessageOf(err)))
      .finally(() => setBusy(false))
  }, [pairUrlDraft, pairCodeDraft, saveConnection])

  /** 扫码配对（可选路径）：Taro.scanCode 解析 spark://pair；失败/取消不阻塞 */
  const onScan = useCallback((): void => {
    void Taro.scanCode({ onlyFromCamera: false })
      .then((res) => {
        const link = parsePairLink(res.result)
        if (link === null) {
          setLocalNotice('未识别的二维码：请扫桌面端配对码')
          return
        }
        setPendingPair(link)
        setLocalNotice(null)
      })
      .catch(() => {
        // 用户取消/无相机权限：静默落回手输路径（不阻塞，工单口径）
      })
  }, [setPendingPair])

  const onDisconnect = useCallback((): void => {
    disconnect()
    invalidateRest()
    setUrlDraft('')
    setTokenDraft('')
    setLocalNotice(null)
  }, [disconnect])

  const inputOf = (setter: (v: string) => void) => (
    e: BaseEventOrig<InputProps.inputEventDetail>,
  ): void => setter(e.detail.value)

  return (
    <View className="st-screen" style={{ backgroundColor: t.pageBackground }}>
      <ScrollView className="st-scroll" scrollY>
        {/* 深链/扫码待配对确认卡（J.2.9：server 地址 + 连接/取消） */}
        {pendingPair !== null ? (
          <Card className="st-card">
            <Text className="st-card-title" style={{ color: t.foreground }}>
              待配对
            </Text>
            <Text className="st-pair-host" style={{ color: t.mutedForeground }}>
              {baseUrlOf(pendingPair.host, pendingPair.port)}
            </Text>
            <View
              className="st-cta"
              onClick={() => {
                if (!busy) onRedeem()
              }}
              style={{ backgroundColor: t.primary, opacity: busy ? 0.5 : 1 }}
            >
              <Text className="st-cta-text" style={{ color: t.primaryForeground }}>
                连接
              </Text>
            </View>
            <View
              className="st-cta-ghost"
              onClick={() => {
                if (!busy) setPendingPair(null)
              }}
              style={{ borderColor: t.border }}
            >
              <Text className="st-cta-ghost-text" style={{ color: t.mutedForeground }}>
                取消
              </Text>
            </View>
          </Card>
        ) : null}

        {/* 配对（小程序主路径=手输 6 位码；扫码可选，失败不阻塞） */}
        <Card className="st-card">
          <Text className="st-card-title" style={{ color: t.foreground }}>
            配对
          </Text>
          <Text className="st-field-label" style={{ color: t.mutedForeground }}>
            服务器地址
          </Text>
          <Input
            className="st-input"
            style={{ color: t.foreground, borderColor: t.border }}
            value={pairUrlDraft}
            placeholder="http://192.168.1.10:4318"
            placeholderStyle={`color: ${t.ring}`}
            onInput={inputOf(setPairUrlDraft)}
          />
          <Text className="st-field-label" style={{ color: t.mutedForeground }}>
            6 位配对码
          </Text>
          <Input
            className="st-input"
            style={{ color: t.foreground, borderColor: t.border }}
            value={pairCodeDraft}
            type="number"
            maxlength={6}
            placeholder="桌面端配对面板出示"
            placeholderStyle={`color: ${t.ring}`}
            onInput={inputOf(setPairCodeDraft)}
          />
          <View
            className="st-cta"
            onClick={() => {
              if (!busy) onManualPair()
            }}
            style={{ backgroundColor: t.primary, opacity: busy ? 0.5 : 1 }}
          >
            <Text className="st-cta-text" style={{ color: t.primaryForeground }}>
              {busy ? '连接中…' : '配对连接'}
            </Text>
          </View>
          <View
            className="st-cta-ghost"
            onClick={() => {
              if (!busy) onScan()
            }}
            style={{ borderColor: t.border }}
          >
            <Text className="st-cta-ghost-text" style={{ color: t.mutedForeground }}>
              扫码配对（可选）
            </Text>
          </View>
        </Card>

        {/* 连接配置区（J.2.4：服务器地址 + token 手输直连） */}
        <Card className="st-card">
          <Text className="st-card-title" style={{ color: t.foreground }}>
            服务器
          </Text>
          <Text className="st-field-label" style={{ color: t.mutedForeground }}>
            服务器地址
          </Text>
          <Input
            className="st-input"
            style={{ color: t.foreground, borderColor: t.border }}
            value={urlDraft}
            placeholder="http://192.168.1.10:4318"
            placeholderStyle={`color: ${t.ring}`}
            onInput={inputOf(setUrlDraft)}
          />
          <Text className="st-field-label" style={{ color: t.mutedForeground }}>
            配对 Token
          </Text>
          <Input
            className="st-input"
            style={{ color: t.foreground, borderColor: t.border }}
            value={tokenDraft}
            password
            placeholder="配对所得；环回直连可留空"
            placeholderStyle={`color: ${t.ring}`}
            onInput={inputOf(setTokenDraft)}
          />
          {localNotice !== null ? (
            <Text className="st-notice" style={{ color: t.sparkErr }}>
              {localNotice}
            </Text>
          ) : null}
          <View
            className="st-cta"
            onClick={() => {
              if (!busy) onSave()
            }}
            style={{ backgroundColor: t.primary, opacity: busy ? 0.5 : 1 }}
          >
            <Text className="st-cta-text" style={{ color: t.primaryForeground }}>
              保存
            </Text>
          </View>
        </Card>

        {/* 外观（§13.C 三档） */}
        <Card className="st-card">
          <Text className="st-card-title" style={{ color: t.foreground }}>
            外观
          </Text>
          {APPEARANCE_OPTIONS.map((opt, i) => (
            <View key={opt.value}>
              {i > 0 ? <Hairline /> : null}
              <View
                className="st-appearance-row"
                onClick={() => useConfigStore.getState().setAppearance(opt.value)}
              >
                <Text className="st-appearance-label" style={{ color: t.foreground }}>
                  {opt.label}
                </Text>
                {appearance === opt.value ? (
                  <Text className="st-check" style={{ color: t.sparkAccent }}>
                    ✓
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card>

        {/* 断开连接（J.2.4⑤：红字、独立白卡） */}
        {configured ? (
          <View className="st-card st-disconnect" style={{ backgroundColor: t.card }} onClick={onDisconnect}>
            <Text className="st-disconnect-text" style={{ color: t.sparkErr }}>
              断开连接
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}
