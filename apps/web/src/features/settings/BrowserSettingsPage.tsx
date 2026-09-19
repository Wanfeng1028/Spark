/**
 * 浏览器设置页（阶段十九 19.12 / ADR D49）：占位页转真控件——
 * ① 引擎设置：headless / 默认操作超时 / UA（spark.json browser 段，PUT /api/settings，
 *    重启档——BrowserManager 构造期装配，页面如实标注"重启后生效"）；
 * ② 域名审批规则摘要：permission rules `url:` 前缀只读视图（增删改归权限规则页单一来源）；
 * ③ 截图产物清理：POST /api/browser/cleanup（内联两段式确认，照 19.11 判例）。
 */
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { SettingGroupCard, SettingRow } from './SettingRow'
import { useEffect, useState } from 'react'

const inputCls = 'h-7 w-28 font-mono text-xs'

export function BrowserSettingsPage() {
  const { transport } = useTransport()
  const { data: settings, refresh: refreshSettings } = useTransportQuery((t) => t.getSettings())
  const { data: rules } = useTransportQuery((t) => t.listPermissionRules())
  const { busy, opError, setOpError, run } = useAsyncOp()
  const [headless, setHeadless] = useState(true)
  const [timeoutMs, setTimeoutMs] = useState('')
  const [userAgent, setUserAgent] = useState('')
  const [confirmCleanup, setConfirmCleanup] = useState(false)
  const [cleanupNote, setCleanupNote] = useState<string | null>(null)

  useEffect(() => {
    if (settings === null) return
    setHeadless(settings.browser?.headless ?? true)
    setTimeoutMs(settings.browser?.defaultTimeoutMs !== undefined ? String(settings.browser.defaultTimeoutMs) : '')
    setUserAgent(settings.browser?.userAgent ?? '')
  }, [settings])

  const urlRules = (rules ?? []).filter((r) => r.resource.startsWith('url:'))

  async function save(): Promise<void> {
    const raw = timeoutMs.trim()
    let defaultTimeoutMs: number | undefined
    if (raw !== '') {
      const n = Number(raw)
      if (!Number.isInteger(n) || n <= 0 || n > 300_000) {
        setOpError('默认超时须为 1~300000 的整数毫秒')
        return
      }
      defaultTimeoutMs = n
    }
    await run(async () => {
      await transport.updateSettings({
        browser: {
          headless,
          ...(defaultTimeoutMs !== undefined ? { defaultTimeoutMs } : {}),
          ...(userAgent.trim() !== '' ? { userAgent: userAgent.trim() } : {}),
        },
      })
      await refreshSettings()
    })
  }

  async function cleanup(): Promise<void> {
    await run(async () => {
      const r = await transport.cleanupBrowserArtifacts()
      setCleanupNote(`已清理 ${String(r.removed)} 张截图产物`)
      setConfirmCleanup(false)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {opError !== null && <p className="px-3 py-2 font-mono text-xs text-destructive">{opError}</p>}

      <SettingGroupCard>
        <SettingRow title="无头模式（headless）" description="浏览器不显示窗口——关闭后可见浏览器界面（调试页面交互用）">
          <Switch aria-label="无头模式" checked={headless} onChange={setHeadless} />
        </SettingRow>
        <SettingRow title="默认操作超时（毫秒）" description="browser.open/click 未显式给 timeoutMs 时的缺省值（上限 300000）">
          <Input
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
            aria-label="默认操作超时毫秒"
            placeholder="30000"
            className={inputCls}
            inputMode="numeric"
          />
        </SettingRow>
        <SettingRow title="User-Agent 覆盖" description="留空 = playwright 缺省 UA；填写后全部请求携带该 UA">
          <Input
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
            aria-label="User-Agent 覆盖"
            placeholder="（留空 = 缺省）"
            className="h-7 w-64 font-mono text-xs"
          />
        </SettingRow>
        <div className="flex items-center gap-2 px-4 py-3">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
            保存（重启后生效）
          </Button>
          <span className="text-xs text-muted-foreground">browser 段为重启档——BrowserManager 构造期装配</span>
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="px-4 pt-3">
          <p className="font-mono text-[11px] text-muted-foreground">域名审批规则（url: 前缀，只读）</p>
        </div>
        <div className="divide-y divide-border">
          {urlRules.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              未设域名规则——browser.open 等操作缺省逐次询问。在权限规则页添加资源形如
              url:https://docs.** 的规则即可固化放行（deny 胜出）。
            </p>
          )}
          {urlRules.map((r) => (
            <SettingRow key={`${r.action}:${r.resource}`} title={r.resource} description={`${r.action} · ${r.effect}`} />
          ))}
        </div>
        <div className="px-4 pb-3 pt-2">
          <p className="text-xs text-muted-foreground">规则增删改在权限规则页（单一来源）。</p>
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow
          title="清理截图产物"
          description={`删除全部历史截图（shot-*.png，~/.spark/browser-shots/）。${cleanupNote ?? '当前会话已展示的截图不受影响——产物按需重取。'}`}
        >
          {confirmCleanup ? (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void cleanup()}
              >
                确认清理
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmCleanup(false)}>
                取消
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setConfirmCleanup(true)
                setTimeout(() => setConfirmCleanup(false), 3000)
              }}
            >
              清理
            </Button>
          )}
        </SettingRow>
      </SettingGroupCard>
    </div>
  )
}
