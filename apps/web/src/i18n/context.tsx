/**
 * i18n Provider（阶段十九 19.17 第一批）：语言状态 + t() 翻译器。
 * 语言来源优先级：spark.json `ui.language`（GET /api/settings，服务端单源）>
 * localStorage 本机选择 > navigator 系统语言探测。写入经 PUT /api/settings
 * （服务端单源，四端一致）；探测/回落只在无服务端配置时生效。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { detectLanguage, translate, type Language } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { setUiLanguage } from '@/lib/error-copy'

const LOCAL_KEY = 'spark.ui.language'

interface I18nValue {
  lang: Language
  setLang: (l: Language) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function localLang(): Language | null {
  const raw = localStorage.getItem(LOCAL_KEY)
  return raw === 'zh-CN' || raw === 'en' ? raw : null
}

export function I18nProvider({ children }: { children: ReactNode }): React.ReactElement {
  const { transport } = useTransport()
  const { data } = useTransportQuery((t) => t.getSettings())
  const serverLang = data?.ui?.language
  const [local, setLocal] = useState<Language | null>(localLang)

  const lang: Language = serverLang ?? local ?? detectLanguage(navigator.languages ?? [navigator.language])

  // 错误文案在错误发生那刻就定稿（约 40 处 setOpError/setError 存的是人话串），渲染时再翻译来不及；
  // 故由本 provider 单点把语言同步给 lib/error-copy 的模块单例，调用点不必逐个传 lang
  useEffect(() => {
    setUiLanguage(lang)
  }, [lang])

  const setLang = useCallback(
    (l: Language) => {
      setLocal(l)
      try {
        localStorage.setItem(LOCAL_KEY, l)
      } catch {
        // 存不进（隐私模式）——仅本次会话生效
      }
      void transport.updateSettings({ ui: { language: l } }).catch(() => {
        // 写盘失败不回滚本地选择（界面语言即时生效优先；服务端配置下次启动对齐）
      })
    },
    [transport],
  )

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext)
  if (v === null) throw new Error('useI18n 必须在 I18nProvider 内使用')
  return v
}
