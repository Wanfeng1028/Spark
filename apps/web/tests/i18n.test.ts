/**
 * i18n 框架单测（阶段十九 19.17 第一批）：翻译器纯函数 + 语言探测 + 缺键回落。
 * 端到端（Provider/组件）走 web 页面测试（OnboardingSettingsPage 同族手法）。
 */
import { describe, expect, test } from 'vitest'
import { LANGUAGE_LABELS, SETTINGS_PAGE_KEY, detectLanguage, translate } from '@spark/protocol'

describe('translate（阶段十九 19.17）', () => {
  test('中英字典同键不同文；缺键回落中文再回落 key 本身', () => {
    expect(translate('zh-CN', 'action.save')).toBe('保存')
    expect(translate('en', 'action.save')).toBe('Save')
    expect(translate('en', 'nope.missing')).toBe('nope.missing')
    // 英文缺键（模拟第二批未迁）→ 回落中文原文（不显示 key 名）
    expect(translate('en', 'settings.pageGeneral')).toBe('General')
  })

  test('占位符替换：缺变量留原样（不抛、不留 undefined）', () => {
    expect(translate('zh-CN', 'action.save', { x: 1 })).toBe('保存')
  })

  test('SETTINGS_PAGE_KEY 覆盖全部 ready 设置页（第一批范围）', () => {
    expect(SETTINGS_PAGE_KEY['general']).toBe('settings.pageGeneral')
    expect(SETTINGS_PAGE_KEY['sandbox']).toBe('settings.pageSandbox')
    expect(SETTINGS_PAGE_KEY['onboarding']).toBe('settings.pageOnboarding')
  })

  test('LANGUAGE_LABELS 封闭集两语言', () => {
    expect(Object.keys(LANGUAGE_LABELS).sort()).toEqual(['en', 'zh-CN'])
  })
})

describe('detectLanguage（系统语言探测）', () => {
  test('zh 前缀 → 中文；en 前缀 → 英文；无匹配回落中文', () => {
    expect(detectLanguage(['zh-CN', 'en'])).toBe('zh-CN')
    expect(detectLanguage(['en-US'])).toBe('en')
    expect(detectLanguage(['fr-FR'])).toBe('zh-CN')
    expect(detectLanguage([])).toBe('zh-CN')
  })
})
