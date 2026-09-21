/**
 * 小程序连接配置与外观偏好（设置页数据源；镜像 apps/mobile config-store 语义）。
 * 存储选择：Taro.setStorageSync/getStorageSync（微信本地缓存）。
 *
 * **token 加密存储重估（工单 19.29 结论，替换此前的占位口径）**：
 * 小程序侧没有任何安全存储 API——`wx.setStorage` 系落进应用沙箱的明文 KV，
 * 微信官方也不提供密钥链/生物识别解锁（对比：移动端 apps/mobile 用
 * expo-secure-store 的系统 Keychain/Keystore）。可选项逐条核过：
 * ① 前端自加解密后存缓存——密钥必须存在同样的可读位置（代码常量/同一份缓存），
 *    能读到密文的人就能读到密钥，**只是把明文换个写法**，属假实现（ARCHITECTURE §9），不做；
 * ② 只存内存不持久化——冷启动即要求重新配对，而配对码 60s 一次性且要桌面端在场，
 *    可用性坍塌，且体验版/正式版每次重进都要人配合，判决留给有公网分发形态时重议；
 * ③ 服务端侧兜底（采纳）：token 是**设备级长效凭据**，可在桌面端「设备与配对」页
 *    `revokePairDevice` 即时撤销（撤销后已连 SSE 立即断开，auth.ts 头注），本机
 *    「断开连接」等价于清本机凭据；日志侧 `redactTokenQuery` 保证 ?token= 不落 pino。
 * 残余风险如实登记：拿到已解锁手机 + 本小程序缓存的人，在撤销前可读写本机所连
 * 会话。缓解面 = 服务端撤销 + 本机清除 + 127.0.0.1 缺省无鉴权形态（未配对设备
 * 连不上非环回地址）。设置页在 token 输入框下把这段判断与撤销动作直接写给用户。
 */
import Taro from '@tarojs/taro'
import { create } from 'zustand'
import type { PairLink } from '@spark/protocol'
import type { AppearancePreference } from '../theme/tokens'

const CONFIG_KEY = 'spark.config'

interface MiniConfig {
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

const DEFAULT_CONFIG: MiniConfig = {
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
