/**
 * 电脑控制页（阶段十九 19.2 / ADR D44）：占位页转真控件——
 * ① 主开关：engine.computerUseEnabled（PUT /api/settings 既有链路；工具执行期读内存
 *    配置，热档——改完下一操作生效，无重启标注）；
 * ② 操作审批档位：实为 permission rules 的 computer:// 前缀规则（数据源
 *    listPermissionRules 过滤，本页只读摘要——增删改归权限规则页单一来源）；
 * ③ 平台执行体说明（Windows 全量 / macOS 需辅助功能授权 / Linux X11 需 xdotool 家族，
 *    Wayland 不支持——如实明示，非假控件）。
 */
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { useTransport } from '@/transports/context'
import { Switch } from '@/components/ui/switch'
import { SettingGroupCard, SettingRow } from './SettingRow'

const COMPUTER_ACTIONS = [
  { op: 'screenshot', desc: '截取整个屏幕为 PNG（图片不进对话上下文，经 /api/artifacts 供图）' },
  { op: 'click', desc: '屏幕坐标点击（左/右/中键、双击）' },
  { op: 'type', desc: '向前台窗口键入文本（UNICODE，中文可用）' },
  { op: 'key', desc: '按键或组合键（Enter/F5/Ctrl+s 等）' },
  { op: 'scroll', desc: '滚轮滚动（可指定坐标）' },
  { op: 'window', desc: '列出有主窗口的进程 / 按标题或 pid 聚焦窗口' },
  { op: 'app', desc: '列出运行中进程 / 启动程序本体（缺省逐次审批）' },
  { op: 'clipboard', desc: '读写系统剪贴板（纯文本）' },
] as const

export function ComputerSettingsPage() {
  const { transport } = useTransport()
  const { data: settings, refresh } = useTransportQuery((t) => t.getSettings())
  const { data: rules } = useTransportQuery((t) => t.listPermissionRules())
  const { busy, opError, run } = useAsyncOp()

  const enabled = settings?.engine.computerUseEnabled === true
  const computerRules = (rules ?? []).filter((r) => r.resource.startsWith('computer://'))

  async function toggleComputerUse(v: boolean): Promise<void> {
    await run(async () => {
      await transport.updateSettings({ engine: { computerUseEnabled: v } })
      await refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {opError !== null && <p className="text-xs text-destructive">{opError}</p>}

      <SettingGroupCard>
        <SettingRow
          title="启用电脑控制"
          description="允许模型使用 computer.* 工具族操作本机（屏幕/鼠标/键盘/窗口/剪贴板）。缺省关闭；开启后每个操作仍按审批档位执行——改完下一操作即生效。"
        >
          <Switch
            aria-label="启用电脑控制"
            checked={enabled}
            disabled={busy}
            onChange={(v) => void toggleComputerUse(v)}
          />
        </SettingRow>
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="px-4 pt-3">
          <p className="font-mono text-[11px] text-muted-foreground">computer:// 操作与审批档位</p>
        </div>
        <div className="divide-y divide-border">
          {COMPUTER_ACTIONS.map((a) => {
            const fixed = computerRules.filter((r) => r.resource === `computer://${a.op}`)
            const effect = fixed.find((r) => r.effect === 'deny') !== undefined
              ? '已固定拒绝'
              : fixed.find((r) => r.effect === 'allow') !== undefined
                ? '已固定放行'
                : '缺省逐次询问'
            return (
              <SettingRow
                key={a.op}
                title={a.op}
                description={`${a.desc} · ${effect}`}
              />
            )
          })}
        </div>
        <div className="px-4 pb-3 pt-2">
          <p className="text-xs text-muted-foreground">
            档位在权限规则页维护（规则资源形如 computer://click，支持通配固化）；未设规则的
            操作一律逐次询问，deny 胜出。
          </p>
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <div className="px-4 pt-3">
          <p className="font-mono text-[11px] text-muted-foreground">平台执行体</p>
        </div>
        <div className="divide-y divide-border">
          <SettingRow title="Windows" description="全量支持——PowerShell 脚本桥（无需额外安装）" />
          <SettingRow
            title="macOS"
            description="需在 系统设置 → 隐私与安全性 → 辅助功能 放行宿主终端；右/中键点击与滚轮暂不支持（如实报错）"
          />
          <SettingRow
            title="Linux（X11）"
            description="需安装 xdotool / wmctrl / xclip / scrot；Wayland 会话不支持（如实报错）"
          />
        </div>
      </SettingGroupCard>
    </div>
  )
}
