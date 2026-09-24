/**
 * 配对设备管理控制器（工单 19.27 收口的"承诺未兑现"缺口）：
 * 设置页原文案承诺"配对与设备管理在设置页"，而实际只有一个断开本机连接的按钮
 * ——撤销服务端设备记录（revokePairDevice）从未接线。本控制器把三件事接真：
 * 列表（getPairStatus）/ 撤销（revokePairDevice）/ 签发配对码（createPairCode）。
 *
 * 撤销后必重取列表：服务端撤销是终态（已连 SSE 立即断开），本地乐观摘除会与之分叉。
 */
import type { PairCodeDto, PairStatusDto, Transport } from '@spark/protocol'
// 错误文案经本端语言收口（工单 19.17）：读 store 当前语言，store 是同步全局态、单测可直接 setLanguage
import { mobileErrorMessageOf } from '../i18n'

export type PairDevicesRest = Pick<
  Transport,
  'getPairStatus' | 'revokePairDevice' | 'createPairCode'
>

export interface PairDevicesSnapshot {
  status: PairStatusDto | null
  /** 最近签发的配对码（6 位短码 60s 有效；null = 未签发） */
  code: PairCodeDto | null
  busy: boolean
  /** 撤销在途的设备 id（该行按钮禁用态数据源） */
  revoking: string | null
  notice: string | null
}

export interface PairDevicesController {
  refresh(): Promise<void>
  revoke(id: string): Promise<boolean>
  issueCode(): Promise<void>
  dispose(): void
}

export function createPairDevicesController(opts: {
  rest: () => PairDevicesRest | null
  onUpdate: (s: PairDevicesSnapshot) => void
}): PairDevicesController {
  let state: PairDevicesSnapshot = {
    status: null,
    code: null,
    busy: false,
    revoking: null,
    notice: null,
  }
  let disposed = false

  const emit = (): void => {
    if (disposed) return
    opts.onUpdate({ ...state })
  }

  async function run<T>(fn: (t: PairDevicesRest) => Promise<T>): Promise<T | null> {
    if (disposed) return null
    const transport = opts.rest()
    if (transport === null) {
      state = { ...state, notice: '未配置服务器：请先在设置页完成配对' }
      emit()
      return null
    }
    state = { ...state, busy: true, notice: null }
    emit()
    try {
      return await fn(transport)
    } catch (err: unknown) {
      state = { ...state, notice: mobileErrorMessageOf(err) }
      return null
    } finally {
      state = { ...state, busy: false }
      emit()
    }
  }

  return {
    async refresh() {
      const dto = await run((t) => t.getPairStatus())
      if (dto !== null) state = { ...state, status: dto }
      emit()
    },

    async revoke(id) {
      state = { ...state, revoking: id }
      emit()
      const ok = await run((t) => t.revokePairDevice(id).then(() => true))
      state = { ...state, revoking: null }
      if (ok === true) await this.refresh()
      else emit()
      return ok === true
    },

    async issueCode() {
      const dto = await run((t) => t.createPairCode())
      if (dto !== null) state = { ...state, code: dto }
      emit()
    },

    dispose() {
      disposed = true
    },
  }
}
