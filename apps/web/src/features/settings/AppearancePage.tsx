/**
 * 外观页（DESIGN §13.D② 全量字段）：界面主题三档/界面字号（默认 13）/
 * 浅色代码主题（GitHub Light）/深色代码主题（Minimal Dark）/显示行号（开）/
 * 长行自动换行（开）/代码字号（12）；底部浅深双栏代码预览+当前生效 badge。
 * 全部字段即存即生效（settings-store 副作用 + AssistantBlock 消费）。
 */
import { useEffect, useMemo, useState } from 'react'
import { useSettingsStore, CODE_THEMES, UI_FONT_SIZES, CODE_FONT_SIZES } from '@/stores/settings'
import type { CodeTheme, Theme } from '@/stores/settings'
import { Select } from '@/components/ui/select'
import type { SelectOption } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SettingRow, SettingGroupCard } from './SettingRow'

/** shiki 单主题渲染预览（createHighlighter 单例；主题变更时重建——设置页低频操作可接受） */
async function renderPreview(code: string, lang: string, themes: [CodeTheme, CodeTheme]) {
  const { createHighlighter } = await import('shiki')
  const hl = await createHighlighter({ themes: [...themes], langs: [lang] })
  return {
    light: hl.codeToHtml(code, { lang, theme: themes[0] }),
    dark: hl.codeToHtml(code, { lang, theme: themes[1] }),
  }
}

const PREVIEW_CODE = `function greet(name: string): string {
  const msg = \`Hello, \${name}!\`
  return msg // 一段足够长的注释文本用来演示长行换行行为——超出栏宽时应折行而非横向滚动
}`

export function AppearancePage() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const uiFontSize = useSettingsStore((s) => s.uiFontSize)
  const setUiFontSize = useSettingsStore((s) => s.setUiFontSize)
  const codeThemeLight = useSettingsStore((s) => s.codeThemeLight)
  const setCodeThemeLight = useSettingsStore((s) => s.setCodeThemeLight)
  const codeThemeDark = useSettingsStore((s) => s.codeThemeDark)
  const setCodeThemeDark = useSettingsStore((s) => s.setCodeThemeDark)
  const showLineNumbers = useSettingsStore((s) => s.showLineNumbers)
  const setShowLineNumbers = useSettingsStore((s) => s.setShowLineNumbers)
  const wrapLongLines = useSettingsStore((s) => s.wrapLongLines)
  const setWrapLongLines = useSettingsStore((s) => s.setWrapLongLines)
  const codeFontSize = useSettingsStore((s) => s.codeFontSize)
  const setCodeFontSize = useSettingsStore((s) => s.setCodeFontSize)

  const [preview, setPreview] = useState<{ light: string; dark: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    renderPreview(PREVIEW_CODE, 'ts', [codeThemeLight, codeThemeDark])
      .then((html) => {
        if (!cancelled) setPreview(html)
      })
      .catch(() => {
        // shiki 加载失败：预览区留空，不影响字段设置本身
      })
    return () => {
      cancelled = true
    }
  }, [codeThemeLight, codeThemeDark])

  const themeOptions = useMemo<SelectOption<Theme>[]>(
    () => [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
      { value: 'system', label: '跟随系统' },
    ],
    [],
  )
  const uiFontSizeOptions = useMemo(
    () => UI_FONT_SIZES.map((n) => ({ value: n, label: `${n} px` })),
    [],
  )
  const codeFontSizeOptions = useMemo(
    () => CODE_FONT_SIZES.map((n) => ({ value: n, label: `${n} px` })),
    [],
  )
  const lightThemeOptions = useMemo(
    () => CODE_THEMES.filter((t) => !t.dark).map((t) => ({ value: t.id, label: t.label })),
    [],
  )
  const darkThemeOptions = useMemo(
    () => CODE_THEMES.filter((t) => t.dark).map((t) => ({ value: t.id, label: t.label })),
    [],
  )

  return (
    <div className="flex flex-col gap-5">
      <SettingGroupCard>
        <SettingRow title="界面主题" description="浅色默认；跟随系统时随系统外观即时切换">
          <Select
            aria-label="界面主题"
            value={theme}
            options={themeOptions}
            onChange={setTheme}
            className="w-32"
          />
        </SettingRow>
        <SettingRow title="界面字号" description="界面基础字号（默认 13）">
          <Select
            aria-label="界面字号"
            value={uiFontSize}
            options={uiFontSizeOptions}
            onChange={setUiFontSize}
            className="w-24"
          />
        </SettingRow>
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow title="浅色代码主题" description="界面主题为浅色时使用（默认 GitHub Light）">
          <Select
            aria-label="浅色代码主题"
            value={codeThemeLight}
            options={lightThemeOptions}
            onChange={setCodeThemeLight}
            className="w-48"
          />
        </SettingRow>
        <SettingRow title="深色代码主题" description="界面主题为深色时使用（默认 Minimal Dark）">
          <Select
            aria-label="深色代码主题"
            value={codeThemeDark}
            options={darkThemeOptions}
            onChange={setCodeThemeDark}
            className="w-48"
          />
        </SettingRow>
        <SettingRow title="显示行号" description="代码块左侧行号">
          <Switch aria-label="显示行号" checked={showLineNumbers} onChange={setShowLineNumbers} />
        </SettingRow>
        <SettingRow title="长行自动换行" description="关闭时代码块横向滚动">
          <Switch
            aria-label="长行自动换行"
            checked={wrapLongLines}
            onChange={setWrapLongLines}
          />
        </SettingRow>
        <SettingRow title="代码字号" description="代码块字号（默认 12）">
          <Select
            aria-label="代码字号"
            value={codeFontSize}
            options={codeFontSizeOptions}
            onChange={setCodeFontSize}
            className="w-24"
          />
        </SettingRow>
      </SettingGroupCard>

      <section aria-label="代码预览" className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          代码预览（浅深双栏并排；随界面主题标示当前生效）
        </p>
        <div className="grid grid-cols-2 gap-3">
          <PreviewPane label="浅色" active={theme === 'light'} html={preview?.light ?? null} />
          <PreviewPane label="深色" active={theme === 'dark'} html={preview?.dark ?? null} />
        </div>
        {theme === 'system' && (
          <p className="text-[11px] text-muted-foreground/70">跟随系统——当前生效栏由系统外观决定</p>
        )}
      </section>
    </div>
  )
}

function PreviewPane({
  label,
  active,
  html,
}: {
  label: string
  active: boolean
  html: string | null
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex h-7 items-center justify-between border-b border-border bg-muted/50 px-2.5">
        <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
        {active && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] leading-none text-secondary-foreground">
            当前生效
          </span>
        )}
      </div>
      <div className="min-h-16 overflow-x-auto p-3 font-mono text-[var(--spark-code-font-size,12px)] leading-relaxed [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
        {html === null ? (
          <p className="text-xs text-muted-foreground/60">加载预览…</p>
        ) : (
          <div
            // shiki codeToHtml 产物（本页自建，无用户输入注入面）；
            // 内层专职承接 innerHTML，外层 children 与 dSIH 永不共存于同一元素
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  )
}
