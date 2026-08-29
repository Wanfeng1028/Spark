/**
 * useCommands（工单 7.4 / H04）：命令注册表加载 hook。
 * GET /api/commands 一次性拉取（内置基线 + ~/.spark/commands/*.md 自定义）；
 * / 菜单与 CommandPalette 共用。null = 加载中（菜单先显示静态基线）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { CommandDto } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { errorMessageOf } from '@/lib/error-copy'

export interface CommandsState {
  commands: CommandDto[] | null
  error: string | null
  refresh: () => Promise<void>
}

export function useCommands(): CommandsState {
  const { transport } = useTransport()
  const [commands, setCommands] = useState<CommandDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setCommands(await transport.listCommands())
    } catch (err) {
      // 失败闭合：清单不可用时 / 菜单回退静态基线（client 命令仍可用）
      setError(errorMessageOf(err))
    }
  }, [transport])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { commands, error, refresh }
}
