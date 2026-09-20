/**
 * 沙箱与网络隔离页（阶段十九 19.7 / ADR D50，翻案 D15"网络隔离 v1 不做"）：
 * ① 模式开关：off = 不拦截（缺省，行为不变）/ allowlist = bash 出口经本地代理过滤
 *    （spark.json sandbox.network.mode——热档，保存即生效，无需重启）；
 * ② 域名清单编辑器：一行一条，精确主机名或 `*.example.com`（匹配任意层子域，不含本域）；
 * ③ 代理端口：重启档（SETTINGS_RESTART_REQUIRED 登记）；
 * ④ 运行状态：GET /api/sandbox/network（ready/reason/活跃隧道）——未就绪时 bash
 *    fail-closed 拒跑，页面如实呈现，不假称"已隔离"。
 * 诚实边界（页面文案必须维持）：代理引导尊重 HTTP_PROXY/ALL_PROXY 的客户端；忽略
 * 代理环境变量的命令仍可直连——出口过滤，不是内核隔离（OS 级强制见 19.6 spike）。
 */
import { useEffect, useState } from 'react'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { SANDBOX_NETWORK_DEFAULTS } from '@spark/protocol'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { SettingGroupCard, SettingRow } from './SettingRow'

const inputCls = 'h-7 w-28 font-mono text-xs'

/** 清单条目形态校验（与 protocol schema 同口径：非空、≤253 字符）——保存前拦一道，文案与后端一致 */
function normalizeAllowlist(text: string): { entries: string[]; bad: string[] } {
  const entries: string[] = []
  const bad: string[] = []
  for (const line of text.split('\n')) {
    const v = line.trim()
    if (v === '') continue
    if (v.length > 253) {
      bad.push(v)
      continue
    }
    entries.push(v)
  }
  return { entries, bad }
}

export function SandboxSettingsPage() {
  const { transport } = useTransport()
  const { data: settings, refresh: refreshSettings } = useTransportQuery((t) => t.getSettings())
  const { data: status, refresh: refreshStatus } = useTransportQuery((t) => t.sandboxNetworkStatus())
  const { busy, opError, setOpError, run } = useAsyncOp()
  const [allowlist, setAllowlist] = useState('')
  const [port, setPort] = useState('')

  const net = settings?.sandbox?.network
  const enabled = net?.mode === 'allowlist'

  useEffect(() => {
    if (settings === null) return
    setAllowlist((net?.allowlist ?? []).join('\n'))
    setPort(net?.port !== undefined ? String(net.port) : String(SANDBOX_NETWORK_DEFAULTS.port))
  }, [settings, net?.allowlist, net?.port])

  async function save(): Promise<void> {
    const { entries, bad } = normalizeAllowlist(allowlist)
    if (bad.length > 0) {
      setOpError(`清单条目超长（>253 字符）：${bad[0] ?? ''}`)
      return
    }
    if (entries.length > 200) {
      setOpError('清单条目上限 200 条')
      return
    }
    let portValue: number | undefined
    const rawPort = port.trim()
    if (rawPort !== '') {
      const n = Number(rawPort)
      if (!Number.isInteger(n) || n < 1024 || n > 65535) {
        setOpError('端口须为 1024~65535 的整数')
        return
      }
      portValue = n
    }
    await run(async () => {
      await transport.updateSettings({
        sandbox: {
          network: {
            mode: enabled ? 'allowlist' : 'off',
            allowlist: entries,
            ...(portValue !== undefined ? { port: portValue } : {}),
          },
        },
      })
      await refreshSettings()
      await refreshStatus()
    })
  }

  async function toggle(next: boolean): Promise<void> {
    await run(async () => {
      // 模式切换单独保存（不依赖清单编辑态）——allowlist 开时若清单为空，先带空清单开，
      // 由用户继续补条目；空清单 = 全部拒绝（fail-closed，与"全放行"恰好相反）
      await transport.updateSettings({
        sandbox: { network: { mode: next ? 'allowlist' : 'off' } },
      })
      await refreshSettings()
      await refreshStatus()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {opError !== null && <p className="px-3 py-2 font-mono text-xs text-destructive">{opError}</p>}

      <SettingGroupCard>
        <SettingRow
          title="网络隔离（allowlist）"
          description="开启后 bash 命令出口经本地代理过滤，仅清单域名放行；保存即生效（热档）。空清单 = 全部拒绝"
        >
          <Switch aria-label="网络隔离" checked={enabled} disabled={busy} onChange={(v) => void toggle(v)} />
        </SettingRow>
        <div className="px-4 pb-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {status === null
              ? '状态读取中…'
              : status.ready
                ? `代理运行中（127.0.0.1:${String(status.port)}，活跃隧道 ${String(status.activeConnections)}）`
                : `代理未运行${status.reason !== null ? `：${status.reason}` : ''}——allowlist 档下 bash 将 fail-closed 拒跑，不降级直连`}
          </p>
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="px-4 pt-3">
          <p className="font-mono text-[11px] text-muted-foreground">域名清单（一行一条）</p>
        </div>
        <div className="px-4 py-3">
          <textarea
            value={allowlist}
            onChange={(e) => setAllowlist(e.target.value)}
            aria-label="域名清单"
            placeholder={'github.com\n*.npmjs.org'}
            rows={8}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="pt-2 text-xs text-muted-foreground">
            精确主机名（如 <span className="font-mono">github.com</span>）或
            <span className="font-mono"> *.example.com</span>（匹配任意层子域，不含 example.com 自身）。
            大小写不敏感；最多 200 条。
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 pb-3">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
            保存清单
          </Button>
          <span className="text-xs text-muted-foreground">清单热生效——已在跑的隧道不受影响，新连接按新清单判定</span>
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow title="代理端口" description="本地代理监听 127.0.0.1 的端口（改端口需重启引擎）">
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            aria-label="代理端口"
            placeholder={String(SANDBOX_NETWORK_DEFAULTS.port)}
            className={inputCls}
            inputMode="numeric"
          />
        </SettingRow>
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground">
            命令环境注入 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY=socks5h://127.0.0.1:端口（NO_PROXY
            放行 localhost/127.0.0.1/::1）。socks5h 让代理解析主机名——域名清单才能按域名判定。
          </p>
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">
            边界说明：代理引导**尊重代理环境变量**的客户端（curl/wget/npm 等）；裸 socket
            或显式绕过代理的命令仍可直连。本设置是出口域名过滤，不是内核级断网——OS
            级强制沙箱的可行性评估见 doc/spike-win-sandbox.md（19.6）。
          </p>
        </div>
      </SettingGroupCard>
    </div>
  )
}
