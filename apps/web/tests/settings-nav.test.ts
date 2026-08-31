/**
 * 设置导航纯逻辑单测（工单 10.14①）：返回目的地计算。
 * 交互面（分区互切 replace、浏览器后退不陷入设置内部）走现场走查（提交说明附步骤）。
 */
import { describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import { settingsBackTarget } from '@/features/settings/SettingsSidebar'

describe('settingsBackTarget（工单 10.14①）', () => {
  it('有激活会话：直达该会话（不再 navigate(-1) 逐历史回退）', () => {
    const sid = ids.session('ses_nav00001')
    expect(settingsBackTarget(sid)).toBe(`/session/${sid}`)
  })

  it('无激活会话：回欢迎页兜底', () => {
    expect(settingsBackTarget(null)).toBe('/welcome')
  })
})
