/**
 * 模型目录缓存（工单 6.6）：GET /api/models 的一次性装载 + 内存缓存——
 * StatusBar 水位（contextWindow 匹配）与 SessionPage 模型选择器共用。
 * load 幂等（已有 dto 不重复请求）；失败保留 null，调用方下次挂载重试。
 */
import { create } from 'zustand'
import type { ModelsDto, Transport } from '@spark/protocol'

interface ModelsStoreState {
  dto: ModelsDto | null
  /** 幂等装载（同 transport 生命周期内只请求一次；失败可重试） */
  load: (transport: Transport) => void
}

export const useModelsStore = create<ModelsStoreState>((set, get) => ({
  dto: null,
  load: (transport) => {
    if (get().dto !== null) return
    transport
      .listModels()
      .then((dto) => set({ dto }))
      .catch(() => undefined) // 失败静默：水位/选择器不渲染，下次挂载重试
  },
}))
