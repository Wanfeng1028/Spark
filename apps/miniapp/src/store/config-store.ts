/**
 * 小程序连接配置与外观偏好（设置页数据源；镜像 apps/mobile config-store 语义）。
 * 存储选择：Taro.setStorageSync/getStorageSync（微信本地缓存，单键 1MB 上限内绰绰有余）。
 * 小程序无系统密钥链——token 明文存本地缓存是平台能力上限（体验版局域网场景，
 * v1 口径；正式分发记 v2 时重估）。持久化边界封装在 load/persist 两函数。
 */
import Taro from '@tarojs/taro'
import { create } from 'zustand'
import type { AppearancePreference } from '../theme/tokens'
import type { PairLink } from '../transport/pair'

const CONFIG_KEY = 'spark.config'

export interface MiniConfig {
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

export const DEFAULT_CONFIG: MiniConfig = {
  serverUrl: '',
  token: '',
  appearance: 'system',
}

export interface ConfigState extends MiniConfig {
  /** 深链/扫码待配对（spark://pair 解析产物；设置页呈现确认卡后兑换） */
  pendingPair: PairLink | null

  setServerUrl: (url: string) => void
  setToken: (token: string) => void
  setAppearance: (a: AppearancePreference) => void
  /** 保存连接配置并持久化（失败如实上抛，不静默） */
  saveConnection: (serverUrl: string, token: string) => void
  /** 断开连接：清配置并持久化（= 撤销本端配对态，J.2.4⑤） */
  disconnect: () => void
  setPendingPair: (p: PairLink | null) => void
  /** 启动装载（同步读本地缓存——getStorageSync；坏数据按未配置呈现） */
  load: () => void
}

function persist(cfg: PersistedConfig): void {
  Taro.setStorageSync(CONFIG_KEY, JSON.stringify(cfg))
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
  ...DEFAULT_CONFIG,
  pendingPair: null,

  setServerUrl: (serverUrl) => set({ serverUrl }),
  setToken: (token) => set({ token }),
  setAppearance: (appearance) => {
    set({ appearance })
    const { serverUrl, token } = get()
    // 外观即时持久化（失败不阻塞交互，只记日志——非鉴权数据）
    try {
      persist({ serverUrl, token, appearance })
    } catch (err: unknown) {
      console.error('[config] 外观持久化失败', err)
    }
  },
  saveConnection: (serverUrl, token) => {
    const { appearance } = get()
    persist({ serverUrl, token, appearance })
    set({ serverUrl, token })
  },
  disconnect: () => {
    const { appearance } = get()
    persist({ serverUrl: '', token: '', appearance })
    set({ serverUrl: '', token: '', pendingPair: null })
  },
  setPendingPair: (pendingPair) => set({ pendingPair }),
  load: () => {
    try {
      const raw: unknown = Taro.getStorageSync(CONFIG_KEY)
      if (typeof raw !== 'string' || raw === '') return
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return
      const p = parsed as Partial<PersistedConfig>
      const appearance: AppearancePreference =
        p.appearance === 'light' || p.appearance === 'dark' ? p.appearance : 'system'
      set({
        serverUrl: typeof p.serverUrl === 'string' ? p.serverUrl : '',
        token: typeof p.token === 'string' ? p.token : '',
        appearance,
      })
    } catch (err: unknown) {
      // 失败闭合：读不到配置按未配置呈现（不拿坏数据冒充），如实记录
      console.error('[config] 装载失败', err)
    }
  },
}))
