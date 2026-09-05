/**
 * useCommands（命令注册表数据源：transport.listCommands()——工单 7.4）：
 * / 菜单静态基线 + 引擎动态清单合并的加载 hook。R-E① 起改为 useTransportQuery 消费者。
 */
import type { CommandDto } from '@spark/protocol'
import { useTransportQuery } from './useTransportQuery'

export interface CommandsState {
  commands: CommandDto[] | null // null = 加载中
  error: string | null
  refresh: () => Promise<void>
}

export function useCommands(): CommandsState {
  const { data: commands, error, refresh } = useTransportQuery((t) => t.listCommands())
  return { commands, error, refresh }
}
