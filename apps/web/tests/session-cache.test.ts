/**
 * 切会话缓存判定纯逻辑单测（工单 10.16）：
 * warm 会话（store 已有持久投影，lastSeq>0）立即渲染缓存不进加载白屏；
 * 仅 lastSeq===0 的真冷会话（或无 slice）显示加载态。
 * 现场走查（左右切换无白屏/冷会话仍有加载态/切回不丢新事件）留用户执行。
 */
import { describe, expect, it } from 'vitest'
import { emptySessionSlice, ids } from '@spark/protocol'
import { hasCachedProjection } from '@/stores/session'

describe('hasCachedProjection（工单 10.16）', () => {
  it('无 slice 或空白 slice（lastSeq=0）→ 冷会话，进加载态', () => {
    expect(hasCachedProjection(undefined)).toBe(false)
    expect(hasCachedProjection(emptySessionSlice(ids.session('ses_cold00000000000001')))).toBe(false)
  })

  it('lastSeq>0 → 缓存投影即时渲染（免白屏）', () => {
    const slice = emptySessionSlice(ids.session('ses_warm00000000000001'))
    slice.lastSeq = 3
    expect(hasCachedProjection(slice)).toBe(true)
  })
})
