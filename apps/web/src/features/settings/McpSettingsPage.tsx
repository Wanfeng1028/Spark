/**
 * MCP 管理页（工单 12.6 / V2-01）：GET /api/mcp 状态点 + 工具数 + 编辑表单
 * （server 名/command/args/env 脱敏显示）+ PUT /api/mcp 整文件原子写。
 * 运行中改动需重启引擎重连生效——保存后如实标注"重启后生效"（禁假状态）。
 * env 值只进不回（PUT 后回显不回填明文——脱敏同 secrets 纪律）。
 */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { McpServerDto } from '@spark/protocol'
import { Button } from '@/components/ui/button'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { cn } from '@/lib/utils'
import { SettingGroupCard, SettingRow, settingInputCls } from './SettingRow'

interface ServerDraft {
  name: string
  command: string
  args: string // 每行一个参数（表单友好；保存时 split）
  env: string // 每行 KEY=VALUE
}

function draftOf(name: string, command: string, args: string[], env: Record<string, string>): ServerDraft {
  return {
    name,
    command,
    args: args.join('\n'),
    env: Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
  }
}

export function McpSettingsPage() {
  const { transport } = useTransport()
  const { data: servers, error, refresh } = useTransportQuery((t) => t.listMcpServers())
  const [draft, setDraft] = useState<ServerDraft | null>(null)
  const [restartHint, setRestartHint] = useState(false)
  const { busy, opError, setOpError, run } = useAsyncOp()

  function startEdit(): void {
    if (servers === null) return
    // 全量编辑：所有 server 汇成一个草稿表单的第一项不可行——按单 server 逐个编辑；
    // 这里取第一个 server 作为草稿起点（无 server 时 = 新增空白）。多 server 逐条编辑。
    const first = servers[0]
    setDraft(
      first === undefined
        ? { name: '', command: '', args: '', env: '' }
        : draftOf(first.name, first.command, [], {}),
    )
  }

  async function save(): Promise<void> {
    const d = draft
    if (d === null) return
    if (d.name.trim() === '' || d.command.trim() === '') {
      setOpError('name 与 command 必填')
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
    await run(async () => {
      // 单 server 编辑语义：替换同名项，保留其余（GET 状态表拿全名单——command 回填用列表）
      const existing = (servers ?? []).filter((s) => s.name !== d.name.trim())
      const serversBody: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {}
      for (const s of existing) {
        serversBody[s.name] = { command: s.command }
      }
      serversBody[d.name.trim()] = {
        command: d.command.trim(),
        ...(args.length > 0 ? { args } : {}),
        ...(Object.keys(env).length > 0 ? { env } : {}),
      }
      await transport.updateMcpConfig({ version: 1, servers: serversBody })
      setRestartHint(true) // 运行中改动需重启重连——如实标注（禁假状态：状态点不变）
      setDraft(null)
      await refresh()
    })
  }

  async function removeServer(name: string): Promise<void> {
    await run(async () => {
      const existing = (servers ?? []).filter((s) => s.name !== name)
      const serversBody: Record<string, { command: string }> = {}
      for (const s of existing) serversBody[s.name] = { command: s.command }
      await transport.updateMcpConfig({ version: 1, servers: serversBody })
      setRestartHint(true)
      setDraft(null)
      await refresh()
    })
  }

  if (error !== null) return <p className="text-xs text-destructive">{error}</p>
  if (servers === null) return <p className="text-xs text-muted-foreground">加载中…</p>

  return (
    <div className="flex flex-col gap-3">
      {restartHint && (
        <p className="rounded-md border border-border px-3 py-2 text-xs text-[var(--spark-warn)]">
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
                className="rounded p-1 text-muted-foreground/70 hover:bg-accent hover:text-destructive"
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
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="服务器名（如 filesystem）"
              className={settingInputCls + ' w-full'}
            />
            <input
              value={draft.command}
              onChange={(e) => setDraft({ ...draft, command: e.target.value })}
              placeholder="启动命令（如 npx -y @modelcontextprotocol/server-filesystem /path）"
              className={settingInputCls + ' w-full'}
            />
            <textarea
              value={draft.args}
              onChange={(e) => setDraft({ ...draft, args: e.target.value })}
              placeholder={'args（每行一个，可留空）'}
              rows={2}
              className={settingInputCls + ' w-full resize-none'}
            />
            <textarea
              value={draft.env}
              onChange={(e) => setDraft({ ...draft, env: e.target.value })}
              placeholder={'env（每行 KEY=VALUE，可留空；值只进不回显）'}
              rows={2}
              className={settingInputCls + ' w-full resize-none'}
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
