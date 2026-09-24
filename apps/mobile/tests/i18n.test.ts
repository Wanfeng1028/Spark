/**
 * 移动端 i18n 消费单测（工单 19.17 第四批）：语言单源是服务端 `ui.language`，取词与
 * 错误文案都读 app-store 当前语言。口径与 apps/miniapp/tests/i18n.test.ts 对齐——
 * `syncUiLanguage` 本身不在此测（它是一次 GET /api/settings 的装配，与 miniapp 的
 * app.tsx 装载同层，那一层仓库历来交真机/联调走查，不在单测里造假服务端）。
 */
import { useAppStore } from '../src/store/app-store'
import { mobileErrorMessageOf, mobileT } from '../src/i18n'

afterEach(() => {
  // store 是模块级单例：逐例复位语言，避免上一例的 'en' 漏进下一例
  useAppStore.getState().setLanguage('zh-CN')
})

describe('mobileErrorMessageOf（store 语言 → 错误码人话文案）', () => {
  it('同一错误码随语言给出两套文案，切回即恢复', () => {
    const err = new Error('E_ALREADY_RESOLVED: request r1')
    expect(mobileErrorMessageOf(err)).toBe('该审批已答复过，无需重复操作')
    useAppStore.getState().setLanguage('en')
    expect(mobileErrorMessageOf(err)).toBe(
      'This approval was already answered — no need to reply again',
    )
    useAppStore.getState().setLanguage('zh-CN')
    expect(mobileErrorMessageOf(err)).toBe('该审批已答复过，无需重复操作')
  })

  it('未知码回落原始消息——不把 err.E_* 键名当文案上屏', () => {
    useAppStore.getState().setLanguage('en')
    expect(mobileErrorMessageOf(new Error('E_NO_SUCH_CODE: 上游给的生僻码'))).toBe(
      '上游给的生僻码',
    )
  })

  it('无码消息与非 Error 原样成串：两语都不翻译（没有码就没有文案可查）', () => {
    useAppStore.getState().setLanguage('en')
    expect(mobileErrorMessageOf(new Error('模型未配置'))).toBe('模型未配置')
    expect(mobileErrorMessageOf('boom')).toBe('boom')
  })
})

describe('mobileT（store 语言 → 取词）', () => {
  it('已登记键随语言切换；未登记键回落 key 本身（故长尾文案直写中文而非乱接键）', () => {
    expect(mobileT('shell.settings')).toBe('设置')
    useAppStore.getState().setLanguage('en')
    expect(mobileT('shell.settings')).toBe('Settings')
    expect(mobileT('action.retry')).toBe('Retry')
    expect(mobileT('mobile.unregistered')).toBe('mobile.unregistered')
  })
})
