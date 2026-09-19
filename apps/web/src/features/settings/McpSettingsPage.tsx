/**
 * MCP 管理页（工单 12.6 / V2-01）：GET /api/mcp 状态点 + 工具数 + 编辑表单
 * （server 名/command/args/env 脱敏显示）+ PUT /api/mcp 整文件原子写。
 * 运行中改动需重启引擎重连生效——保存后如实标注"重启后生效"（禁假状态）。
 * env 值只进不回（PUT 后回显不回填明文——脱敏同 secrets 纪律）。
 * RT3-07：保存/停用以 GET /api/mcp/config 读回（env 值掩码）为底——未编辑 server
 * 原样保留（不再从状态表重建而丢 args/env）；编辑项 env 掩码行由引擎合并盘上真值。
 */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { MCP_ENV_MASK, type McpServerDto, type McpTransportKind } from '@spark/protocol'
import { Button } from '@/components/ui/button'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { cn } from '@/lib/utils'
import { SettingGroupCard, SettingRow } from './SettingRow'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface ServerDraft {
  name: string
  transport: McpTransportKind
  command: string
  url: string
  headers: string // 每行 KEY=VALUE（streamable-http 专用；值掩码同 env）
  args: string // 每行一个参数（表单友好；保存时 split）
  env: string // 每行 KEY=VALUE
  connectTimeoutMs: string // 可选；空 = 引擎缺省 30000ms（RT3-04：npx 冷启动可按 server 调大）
}

function draftOf(
  name: string,
  entry: {
    command?: string | undefined
    args?: string[] | undefined
    env?: Record<string, string> | undefined
    transport?: McpTransportKind | undefined
    url?: string | undefined
    headers?: Record<string, string> | undefined
    connectTimeoutMs?: number | undefined
  },
): ServerDraft {
  return {
    name,
    transport: entry.transport ?? 'stdio',
    command: entry.command ?? '',
    url: entry.url ?? '',
    headers: Object.entries(entry.headers ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    args: (entry.args ?? []).join('\n'),
    env: Object.entries(entry.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    connectTimeoutMs: entry.connectTimeoutMs !== undefined ? String(entry.connectTimeoutMs) : '',
  }
}

export function McpSettingsPage() {
  const { transport } = useTransport()
  const { data: servers, error, refresh } = useTransportQuery((t) => t.listMcpServers())
  // RT3-07：mcp.json 读回（env 值掩码）——整文件保存/停用的底表
  const { data: mcpConfig, error: configError, refresh: refreshConfig } = useTransportQuery((t) =>
    t.getMcpConfig(),
  )
  const [draft, setDraft] = useState<ServerDraft | null>(null)
  const [restartHint, setRestartHint] = useState(false)
  const { busy, opError, setOpError, run } = useAsyncOp()

  function startEdit(): void {
    if (servers === null) return
    // 全量编辑：所有 server 汇成一个草稿表单的第一项不可行——按单 server 逐个编辑；
    // 这里取第一个 server 作为草稿起点（无 server 时 = 新增空白）。多 server 逐条编辑。
    // RT3-07：args/超时从配置读回预填；env 只回显 key，值以掩码占位（保存时引擎合并原值）
    const first = servers[0]
    if (first === undefined) {
      setDraft(draftOf('', {}))
      return
    }
    const entry = mcpConfig?.servers[first.name] ?? {}
    // headers 值掩码同 env：只回显 key，值以 MCP_ENV_MASK 占位（保存时引擎合并原值）
    const maskedHeaders = Object.fromEntries(
      Object.keys(entry.headers ?? {}).map((k) => [k, MCP_ENV_MASK]),
    )
    const maskedEnv = Object.fromEntries(Object.keys(entry?.env ?? {}).map((k) => [k, MCP_ENV_MASK]))
    setDraft({
      ...draftOf(first.name, { ...entry, headers: maskedHeaders, env: maskedEnv }),
      connectTimeoutMs: entry?.connectTimeoutMs !== undefined ? String(entry.connectTimeoutMs) : '',
    })
  }

  async function save(): Promise<void> {
    const d = draft
    if (d === null) return
    if (d.name.trim() === '') {
      setOpError('name 必填')
      return
    }
    const args = d.args
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
    const env: Record<string, string> = {}
    for (const line of d.env.split('\n')) {
      const t = line.trim()
      if (t === '') continue
      const eq = t.indexOf('=')
      if (eq === -1) {
        setOpError(`env 行格式须为 KEY=VALUE：${t}`)
        return
      }
      env[t.slice(0, eq)] = t.slice(eq + 1)
    }
    const headers: Record<string, string> = {}
    for (const line of d.headers.split('\n')) {
      const t = line.trim()
      if (t === '') continue
      const eq = t.indexOf('=')
      if (eq === -1) {
        setOpError(`headers 行格式须为 KEY=VALUE：${t}`)
        return
      }
      headers[t.slice(0, eq)] = t.slice(eq + 1)
    }
    const timeoutRaw = d.connectTimeoutMs.trim()
    let connectTimeoutMs: number | undefined
    if (timeoutRaw !== '') {
      const n = Number(timeoutRaw)
      if (!Number.isInteger(n) || n <= 0 || n > 600_000) {
        setOpError('连接超时须为 1~600000 的整数毫秒')
        return
      }
      connectTimeoutMs = n
    }
    // transport 分支校验（与引擎 zod superRefine 同口径，前端先挡一道）
    if (d.transport === 'streamable-http' && d.url.trim() === '') {
      setOpError('streamable-http 须提供 url（远程 server 地址）')
      return
    }
    if (d.transport === 'stdio' && d.command.trim() === '') {
      setOpError('stdio 须提供 command（启动命令）')
      return
    }
    await run(async () => {
      // RT3-07：以配置读回为底做整文件保存——未编辑 server 原样保留（含 args/env/超时），
      // 编辑项 env/headers 中的掩码行由引擎合并盘上真值（掩码不是值）
      const name = d.name.trim()
      const serversBody = { ...(mcpConfig?.servers ?? {}) }
      delete serversBody[name]
      serversBody[name] = {
        transport: d.transport,
        ...(d.transport === 'streamable-http'
          ? { url: d.url.trim(), ...(Object.keys(headers).length > 0 ? { headers } : {}) }
          : {
              command: d.command.trim(),
              ...(args.length > 0 ? { args } : {}),
              ...(Object.keys(env).length > 0 ? { env } : {}),
            }),
        ...(connectTimeoutMs !== undefined ? { connectTimeoutMs } : {}),
      }
      await transport.updateMcpConfig({ version: 1, servers: serversBody })
      setRestartHint(true) // 运行中改动需重启重连——如实标注（禁假状态：状态点不变）
      setDraft(null)
      await refresh()
      await refreshConfig()
    })
  }

  async function removeServer(name: string): Promise<void> {
    await run(async () => {
      // RT3-07：以配置读回为底删除——其余 server 原样保留（不再从状态表重建丢字段）
      const serversBody = { ...(mcpConfig?.servers ?? {}) }
      delete serversBody[name]
      await transport.updateMcpConfig({ version: 1, servers: serversBody })
      setRestartHint(true)
      setDraft(null)
      await refresh()
      await refreshConfig()
    })
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (configError !== null) return <p className="text-xs text-destructive">{configError}</p>
  if (servers === null || mcpConfig === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  return (
    <div className="flex flex-col gap-3">
      {restartHint && (
        <p className="rounded-xl border border-border px-3 py-2 text-xs text-[var(--spark-warn)]">
          mcp.json 已写入——重启 Spark 后重连生效（当前状态点为运行中快照，禁假状态不变）。
        </p>
      )}
      {opError !== null && (
        <p className="px-3 py-2 font-mono text-xs text-destructive">{opError}</p>
      )}

      <SettingGroupCard>
        {servers.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            未配置任何 MCP 服务器——下方表单添加（写入 ~/.spark/mcp.json）。
          </p>
        )}
        {servers.map((s: McpServerDto) => (
          <SettingRow
            key={s.name}
            title={s.name}
            description={`命令 ${s.command} · 工具 ${s.connected ? s.tools : 0} 个${
              s.connected ? '' : '（连接失败，工具未注册）'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  s.connected ? 'bg-[var(--spark-ok)]' : 'bg-[var(--spark-warn)]',
                )}
                title={s.connected ? '已连接' : '连接失败'}
                aria-label={s.connected ? '已连接' : '连接失败'}
              />
              <button
                type="button"
                aria-label={`停用 MCP 服务器 ${s.name}`}
                title="停用（从 mcp.json 移除，重启后生效）"
                onClick={() => void removeServer(s.name)}
                disabled={busy}
                className="rounded-full p-1 text-muted-foreground/70 hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </SettingRow>
        ))}
      </SettingGroupCard>

      <SettingGroupCard>
        {draft === null ? (
          <SettingRow title="添加 / 编辑服务器" description="编辑 mcp.json（写入前 zod 校验，坏配置不落盘）">
            <Button variant="outline" onClick={startEdit}>
              编辑
            </Button>
          </SettingRow>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="服务器名（如 filesystem）"
              className="font-mono text-xs"
            />
            <Select
              aria-label="transport 类型"
              value={draft.transport}
              options={[
                { value: 'stdio', label: 'stdio（本地命令）' },
                { value: 'streamable-http', label: 'streamable-http（远程）' },
              ]}
              onChange={(v) => setDraft({ ...draft, transport: v })}
              className="w-56"
            />
            {draft.transport === 'stdio' ? (
              <>
                <Input
                  value={draft.command}
                  onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                  placeholder="启动命令（如 npx -y @modelcontextprotocol/server-filesystem /path）"
                  className="font-mono text-xs"
                />
                <Textarea
                  value={draft.args}
                  onChange={(e) => setDraft({ ...draft, args: e.target.value })}
                  placeholder={'args（每行一个，可留空）'}
                  rows={2}
                  className="font-mono text-xs"
                />
                <Textarea
                  value={draft.env}
                  onChange={(e) => setDraft({ ...draft, env: e.target.value })}
                  placeholder={'env（每行 KEY=VALUE，可留空；值只进不回显——已有项回显为 KEY=__SPARK_KEEP__，保存时保留原值）'}
                  rows={2}
                  className="font-mono text-xs"
                />
              </>
            ) : (
              <>
                <Input
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="远程 server 地址（如 https://mcp.example.com/mcp）"
                  className="font-mono text-xs"
                />
                <Textarea
                  value={draft.headers}
                  onChange={(e) => setDraft({ ...draft, headers: e.target.value })}
                  placeholder={'headers（每行 KEY=VALUE，可留空；鉴权头值只进不回显——已有项回显为 KEY=__SPARK_KEEP__，保存时保留原值）'}
                  rows={2}
                  className="font-mono text-xs"
                />
              </>
            )}
            <Input
              value={draft.connectTimeoutMs}
              onChange={(e) => setDraft({ ...draft, connectTimeoutMs: e.target.value })}
              placeholder="连接超时毫秒（可留空 = 缺省 30000；npx 冷启动慢可调大）"
              className="font-mono text-xs"
              inputMode="numeric"
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void save()}>
                保存（重启后生效）
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
                取消
              </Button>
            </div>
          </div>
        )}
      </SettingGroupCard>
    </div>
  )
}
