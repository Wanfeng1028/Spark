/**
 * i18n 消费单测（工单 19.29 接 19.17 框架）：语言解析优先级（服务端 ui.language 单源
 * 优先、系统探测只作回落）与 miniT 取词（读 store 当前语言，切档即时生效）。
 * 另守一条使用纪律：本端只接字典里已存在的键——缺键 translate 回落 **key 本身**
 * （不是中文），所以长尾文案直写中文而不是先接键再指望回落。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../src/store/app-store'
import { miniT, resolveLanguage } from '../src/i18n'

afterEach(() => {
  useAppStore.getState().setLanguage('zh-CN')
})

describe('resolveLanguage（优先级：服务端档 > 系统探测）', () => {
  it('服务端声明的语言赢，哪怕系统候选是别的', () => {
    expect(resolveLanguage('en', ['zh_CN'])).toBe('en')
    expect(resolveLanguage('zh-CN', ['en-US'])).toBe('zh-CN')
  })

  it('无服务端档落系统候选（微信给 zh_CN 式下划线值，detectLanguage 归一）', () => {
    expect(resolveLanguage(undefined, ['en-US'])).toBe('en')
    expect(resolveLanguage(undefined, ['zh_CN'])).toBe('zh-CN')
    expect(resolveLanguage(undefined, ['fr-FR'])).toBe('zh-CN')
    expect(resolveLanguage(undefined, [])).toBe('zh-CN')
  })
})

describe('miniT（store 语言 → 取词）', () => {
  it('已登记键随语言切换；未登记键回落 key 本身（故不接长尾键）', () => {
    useAppStore.getState().setLanguage('en')
    expect(miniT('shell.settings')).toBe('Settings')
    expect(miniT('action.retry')).toBe('Retry')
    useAppStore.getState().setLanguage('zh-CN')
    expect(miniT('shell.settings')).toBe('设置')
    expect(miniT('action.save')).toBe('保存')
    expect(miniT('mini.unregistered')).toBe('mini.unregistered')
  })
})
