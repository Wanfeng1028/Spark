/**
 * 移动端连接配置与外观偏好（设置页数据源）。
 * 存储选择（汇报②）：expo-secure-store（MIT，Expo 官方）——token 属鉴权凭据，
 * 走系统密钥链/Keystore 加密存储；API 为 getItemAsync/setItemAsync 两枚，比
 * AsyncStorage 明文存储更安全且同样简单。外观偏好与配置同键存放（单一配置面）。
 * 持久化边界封装在 load/persist 两函数；首批单测不覆盖本 store（涉及原生模块）。
 */
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { AppearancePreference } from '../theme/tokens'
import type { PairLink } from '../transport/pair-link'

const CONFIG_KEY = 'spark.config'

export interface MobileConfig {
  /** 服务器基址（配对所得或手输 `http://host:port`）；空 = 未配置 */
  serverUrl: string
  /** 配对长效 token（非环回必需；环回缺省形态可空） */
  token: string
  /** §13.C 三档外观（缺省跟随系统） */
  appearance: AppearancePreference
}

interface PersistedConfig {
  serverUrl: string
  token: string
  appearance: AppearancePreference
}

export const DEFAULT_CONFIG: MobileConfig = {
  serverUrl: '',
  token: '',
  appearance: 'system',
}

export interface ConfigState extends MobileConfig {
  /** 启动装载是否完成（首帧避免持久化值闪烁） */
  hydrated: boolean
  /** 深链待配对（spark://pair 解析产物；设置页呈现确认卡后兑换） */
  pendingPair: PairLink | null

  setServerUrl: (url: string) => void
  setToken: (token: string) => void
  setAppearance: (a: AppearancePreference) => void
  /** 保存连接配置并持久化（失败如实上抛，不静默） */
  saveConnection: (serverUrl: string, token: string) => Promise<void>
  /** 断开连接：清配置并持久化（= 撤销本端配对态，J.2.4⑤） */
  disconnect: () => Promise<void>
  setPendingPair: (p: PairLink | null) => void
  load: () => Promise<void>
}

async function persist(cfg: PersistedConfig): Promise<void> {
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(cfg))
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
  ...DEFAULT_CONFIG,
  hydrated: false,
  pendingPair: null,

  setServerUrl: (serverUrl) => set({ serverUrl }),
  setToken: (token) => set({ token }),
  setAppearance: (appearance) => {
    set({ appearance })
    const { serverUrl, token } = get()
    // 外观即时持久化（失败不阻塞交互，只记日志——非鉴权数据）
    void persist({ serverUrl, token, appearance }).catch((err: unknown) => {
      console.error('[config] 外观持久化失败', err)
    })
  },
  saveConnection: async (serverUrl, token) => {
    const { appearance } = get()
    await persist({ serverUrl, token, appearance })
    set({ serverUrl, token })
  },
  disconnect: async () => {
    const { appearance } = get()
    await persist({ serverUrl: '', token: '', appearance })
    set({ serverUrl: '', token: '', pendingPair: null })
  },
  setPendingPair: (pendingPair) => set({ pendingPair }),
  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(CONFIG_KEY)
      if (raw === null) {
        set({ hydrated: true })
        return
      }
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) {
        set({ hydrated: true })
        return
      }
      const p = parsed as Partial<PersistedConfig>
      const appearance: AppearancePreference =
        p.appearance === 'light' || p.appearance === 'dark' ? p.appearance : 'system'
      set({
        serverUrl: typeof p.serverUrl === 'string' ? p.serverUrl : '',
        token: typeof p.token === 'string' ? p.token : '',
        appearance,
        hydrated: true,
      })
    } catch (err: unknown) {
      // 失败闭合：读不到配置按未配置呈现（不拿坏数据冒充），如实记录
      console.error('[config] 装载失败', err)
      set({ hydrated: true })
    }
  },
}))
