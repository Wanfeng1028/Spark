/**
 * CommandPalette（doc/02 §6.3）：cmdk 浮层，顶部 25% 下拉、宽 560px。
 * 分组"会话/操作/设置"；命令 = 新建会话 / 切换会话（内嵌列表）/ 打断当前轮 /
 * 切换主题 / 打开设置。↑↓ 选择、Enter 执行、Esc 关闭并归还焦点（Radix 默认）。
 * 命中段高亮：substring 前景色高亮（命令过滤交给 cmdk 内建 fuzzy）。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { SessionDto } from '@spark/protocol'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useSessionList } from '@/hooks/useSessionList'
import { useCommands } from '@/hooks/useCommands'
import { CLIENT_ACTIONS } from '@/features/chat/client-commands'
import { mergeSlashCommands } from '@/features/chat/composer-menus'
import { useSettingsStore } from '@/stores/settings'
import { useSessionStore } from '@/stores/session'
import { useTransport } from '@/transports/context'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (b: boolean) => void
}

/** 命中段高亮：query 非空且 substring 命中时，命中段提亮（未命中段淡显） */
function Mark({ label, query }: { label: string; query: string }) {
  if (query === '') return <span className="truncate">{label}</span>
  const i = label.toLowerCase().indexOf(query.toLowerCase())
  if (i === -1) return <span className="truncate">{label}</span>
  return (
    <span className="truncate">
      <span className="text-muted-foreground">{label.slice(0, i)}</span>
      <span className="text-foreground">{label.slice(i, i + query.length)}</span>
      <span className="text-muted-foreground">{label.slice(i + query.length)}</span>
    </span>
  )
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { transport } = useTransport()
  const { sessions } = useSessionList()
  const { commands } = useCommands()
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const [query, setQuery] = useState('')

  // 打开时重置过滤词——上次会话的残留不该带进来
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const close = (): void => onOpenChange(false)

  async function createSession(): Promise<void> {
    const dto = await transport.createSession({})
    close()
    void navigate(`/session/${dto.id}`)
  }

  function switchSession(dto: SessionDto): void {
    close()
    void navigate(`/session/${dto.id}`)
  }

  /**
   * / 命令执行（工单 7.4）：client 命令本地执行（resume 在面板语境 = 面板自身已
   * 内嵌会话切换，不重复列出；其余导航设置页）；action/prompt 需活动会话——
   * 在面板中仅当存在 activeId 时列出并可执行（compact/自定义命令）。
   */
  const activeId = useSessionStore((s) => s.activeId)
  const slashCommands = mergeSlashCommands(commands ?? []).filter(
    (c) => c.name !== 'resume' && (c.kind === 'client' || activeId !== null),
  )

  async function runSlashCommand(name: string): Promise<void> {
    close()
    const client = CLIENT_ACTIONS[name]
    if (client !== undefined) {
      if (client.kind === 'palette') return // resume 已在面板内过滤，防御性兜底
      void navigate(client.path)
      return
    }
    if (activeId !== null) await transport.executeCommand(activeId, name)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className="top-1/4 w-[560px] max-w-[calc(100vw-2rem)] -translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <Command>
          <CommandInput placeholder="输入命令或会话名…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>无匹配命令</CommandEmpty>

            <CommandGroup heading="会话">
              <CommandItem value="新建会话" onSelect={() => void createSession()}>
                <Mark label="新建会话" query={query} />
              </CommandItem>
              {sessions?.map((s) => (
                <CommandItem key={s.id} value={s.title === '' ? '新会话' : s.title} onSelect={() => switchSession(s)}>
                  <Mark label={s.title === '' ? '新会话' : s.title} query={query} />
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground/70">{s.id.slice(-6)}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="/ 命令">
              {slashCommands.map((c) => (
                <CommandItem
                  key={c.name}
                  value={`/${c.name} ${c.description}`}
                  onSelect={() => void runSlashCommand(c.name)}
                >
                  <span className="font-mono text-[12px]">/{c.name}</span>
                  <Mark label={c.description} query={query} />
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="操作">
              <CommandItem
                value="打断当前轮"
                onSelect={() => {
                  const active = useSessionStore.getState().activeId
                  if (active !== null) void transport.interrupt(active)
                  close()
                }}
              >
                <Mark label="打断当前轮" query={query} />
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="设置">
              <CommandItem
                value="切换主题"
                onSelect={() => {
                  toggleTheme()
                  close()
                }}
              >
                <Mark label="切换主题" query={query} />
              </CommandItem>
              <CommandItem
                value="打开设置"
                onSelect={() => {
                  close()
                  void navigate('/settings/appearance')
                }}
              >
                <Mark label="打开设置" query={query} />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
