/**
 * 常规页（DESIGN §13.D① 按 Spark 落点裁剪）：
 * 交互行为=提交三模式默认档（落地，Composer 初始段位）；
 * 会话域显示开关（显示思考过程/工具分组）接 settings-store 即存即生效（工单 10.20 A③）；
 * 引擎行为卡（压缩阈值/最大步数/工具超时/输出上限/沙箱档）走 GET|PUT /api/settings
 * （工单 10.20 B / D28：热档下一 turn 生效，重启档标注"下次启动生效"）；
 * 其余字段分卡明示去向（精确 v2 编号）——界面语言 V2-12 / 代理与证书 V2-06；
 * 终端/托盘/更新为 desktop 特化（徽标+占位页文案明示，web 端不提供）。
 * 「显示待办」不设开关：引擎无 Todo 工具，不留无效开关（工单 10.20 拍板）。
 */
import { useEffect, useMemo, useState } from 'react'
import type { Delivery, SettingsDto } from '@spark/protocol'
import { useSettingsStore } from '@/stores/settings'
import { settingInputCls } from './SettingRow'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SettingRow, SettingGroupCard } from './SettingRow'
import { Button } from '@/components/ui/button'

const DELIVERY_OPTIONS: { value: Delivery; label: string }[] = [
  { value: 'now', label: '立即' },
  { value: 'steer', label: '插话' },
  { value: 'queue', label: '排队' },
]

const SANDBOX_OPTIONS: { value: 'off' | 'on'; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: 'on', label: '开启（平台 wrapper 隔离）' },
]

/** 重启档徽标（D28：构造期注入字段，写盘成功、下次启动生效） */
function RestartBadge() {
  return (
    <span
      className="shrink-0 rounded border border-border px-1.5 text-[10px] text-muted-foreground"
      title="该字段构造期注入引擎子系统，保存写盘后下次启动生效"
    >
      下次启动生效
    </span>
  )
}

/** 引擎行为设置（工单 10.20 B / D28）：spark.json engine 段读写，全走 Transport */
function EngineBehaviorSection() {
  const { transport } = useTransport()
  const [settings, setSettings] = useState<SettingsDto | null>(null)
  const [maxSteps, setMaxSteps] = useState('')
  const [threshold, setThreshold] = useState('')
  const [toolTimeout, setToolTimeout] = useState('')
  const [outputLimit, setOutputLimit] = useState('')
  const [sandbox, setSandbox] = useState<'off' | 'on'>('off')

  // 加载走 useTransportQuery；五字段编辑态从数据播种（R-E① 二批）
  const { data, error, refresh } = useTransportQuery((t) => t.getSettings())
  useEffect(() => {
    if (data === null) return
    setSettings(data)
    setMaxSteps(String(data.engine.maxStepsPerTurn))
    setThreshold(String(data.engine.compactionThreshold))
    setToolTimeout(String(data.engine.toolTimeoutMs))
    setOutputLimit(String(data.engine.toolOutputLimitKB))
    setSandbox(data.engine.bashSandbox)
  }, [data])

  const { busy, opError, setOpError, run } = useAsyncOp()

  async function save(): Promise<void> {
    const steps = Number(maxSteps)
    const th = Number(threshold)
    const timeout = Number(toolTimeout)
    const limit = Number(outputLimit)
    if (
      !Number.isInteger(steps) || steps < 1 ||
      Number.isNaN(th) || th <= 0 || th >= 1 ||
      !Number.isInteger(timeout) || timeout <= 0 ||
      !Number.isInteger(limit) || limit <= 0
    ) {
      setOpError('数值不合法：步数/超时/上限为正整数，压缩阈值取 0–1 之间小数')
      return
    }
    await run(async () => {
      const next = await transport.updateSettings({
        engine: {
          maxStepsPerTurn: steps,
          compactionThreshold: th,
          toolTimeoutMs: timeout,
          toolOutputLimitKB: limit,
          bashSandbox: sandbox,
        },
      })
      await refresh()
      setSettings(next)
    })
  }

  const inputCls = settingInputCls + ' w-28 disabled:opacity-40'
  const sandboxOptions = useMemo(() => SANDBOX_OPTIONS, [])

  return (
    <SettingGroupCard>
      <SettingRow
        title="引擎行为"
        description="spark.json engine 段；压缩阈值/最大步数下一轮生效，超时/上限/沙箱下次启动生效（D28）"
      />
      {error !== null && (
        <p className="px-4 py-3 font-mono text-xs text-[var(--spark-err)]">{error}</p>
      )}
      {error === null && settings === null && (
        <p className="px-4 py-3 text-xs text-muted-foreground">加载引擎设置…</p>
      )}
      {error === null && settings !== null && (
        <>
          <SettingRow title="压缩阈值" description="上下文占比超阈值触发压缩（0–1，如 0.8）；下一轮生效">
            <input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              aria-label="压缩阈值"
              disabled={busy}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="每轮最大步数" description="单轮工具/模型往返上限；下一轮生效">
            <input
              value={maxSteps}
              onChange={(e) => setMaxSteps(e.target.value)}
              aria-label="每轮最大步数"
              disabled={busy}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="工具超时（毫秒）" description="单工具执行上限">
            <div className="flex items-center gap-1.5">
              <input
                value={toolTimeout}
                onChange={(e) => setToolTimeout(e.target.value)}
                aria-label="工具超时毫秒"
                disabled={busy}
                className={inputCls}
              />
              <RestartBadge />
            </div>
          </SettingRow>
          <SettingRow title="工具输出上限（KB）" description="超限截断（防输出打爆上下文）">
            <div className="flex items-center gap-1.5">
              <input
                value={outputLimit}
                onChange={(e) => setOutputLimit(e.target.value)}
                aria-label="工具输出上限 KB"
                disabled={busy}
                className={inputCls}
              />
              <RestartBadge />
            </div>
          </SettingRow>
          <SettingRow title="bash 沙箱" description="平台 wrapper 前缀隔离；不可用时拒跑（ADR D15）">
            <div className="flex items-center gap-1.5">
              <Select
                aria-label="bash 沙箱"
                value={sandbox}
                options={sandboxOptions}
                onChange={setSandbox}
                className="w-44"
              />
              <RestartBadge />
            </div>
          </SettingRow>
          <div className="flex items-center gap-2 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void save()}
              >
              保存
            </Button>
            {opError !== null && (
              <span className="min-w-0 truncate font-mono text-xs text-[var(--spark-err)]">
                {opError}
              </span>
            )}
          </div>
        </>
      )}
    </SettingGroupCard>
  )
}

export function GeneralSettingsPage() {
  const defaultDelivery = useSettingsStore((s) => s.defaultDelivery)
  const setDefaultDelivery = useSettingsStore((s) => s.setDefaultDelivery)
  const showReasoning = useSettingsStore((s) => s.showReasoning)
  const setShowReasoning = useSettingsStore((s) => s.setShowReasoning)
  const showToolGroups = useSettingsStore((s) => s.showToolGroups)
  const setShowToolGroups = useSettingsStore((s) => s.setShowToolGroups)
  const deliveryOptions = useMemo(() => DELIVERY_OPTIONS, [])

  return (
    <div className="flex flex-col gap-5">
      <SettingGroupCard>
        <SettingRow
          title="交互行为"
          description="新输入的默认提交档（now=立即开新轮 / steer=注入进行中轮 / queue=等本轮结束）"
        >
          <Select
            aria-label="交互行为"
            value={defaultDelivery}
            options={deliveryOptions}
            onChange={setDefaultDelivery}
            className="w-28"
          />
        </SettingRow>
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow
          title="界面语言"
          description="多语言界面——去向：v2 池 V2-12（i18n 框架）"
          placeholderBadge="v2 挂池"
        />
        <SettingRow
          title="显示思考过程"
          description="关闭时每轮仅展示第一次思考（会话域 §13.H 开关；即存即生效）"
        >
          <Switch
            aria-label="显示思考过程"
            checked={showReasoning}
            onChange={setShowReasoning}
          />
        </SettingRow>
        <SettingRow
          title="分组探索工具 / 终端命令 / 文件更改"
          description="连续同类工具聚合为分组卡（会话域 §13.H；即存即生效）"
        >
          <Switch
            aria-label="分组探索工具、终端命令与文件更改"
            checked={showToolGroups}
            onChange={setShowToolGroups}
          />
        </SettingRow>
        <SettingRow
          title="完整保留模型 I/O"
          description="与压缩阈值同源（下方「引擎行为」）：阈值调高即保留更多；schema 上限 <1，不设独立开关"
        />
      </SettingGroupCard>

      {/* 引擎行为（工单 10.20 B / D28）：GET|PUT /api/settings */}
      <EngineBehaviorSection />

      <SettingGroupCard>
        <SettingRow
          title="HTTP 代理"
          description="模型/MCP/命令工具出口流量代理——去向：v2 池 V2-06（代理/证书）"
          placeholderBadge="v2 挂池"
        />
        <SettingRow
          title="不使用代理的地址"
          description="逗号分隔规则，匹配主机直连——去向：v2 池 V2-06（随代理能力）"
          placeholderBadge="v2 挂池"
        />
        <SettingRow
          title="自定义证书"
          description="PEM 路径注入（NODE_EXTRA_CA_CERTS）——去向：v2 池 V2-06（代理/证书）"
          placeholderBadge="v2 挂池"
        />
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow
          title="数据存储路径"
          description="现固定 ~/.spark/（启动期定）；多数据目录迁移去向：v2"
          placeholderBadge="v2 挂池"
        />
        <SettingRow
          title="自动归档旧任务"
          description="已完成且超期会话自动归档——去向：v2（需会话归档后端）"
          placeholderBadge="v2 挂池"
        />
        <SettingRow
          title="任务通知"
          description="完成/失败/需确认时系统通知——去向：v2（通知体系）"
          placeholderBadge="v2 挂池"
        />
        <SettingRow
          title="通知声音"
          description="通知提示音——去向：v2（随任务通知）"
          placeholderBadge="v2 挂池"
        />
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow title="集成终端 Shell" description="Git Bash 优先，回退 cmd.exe" placeholderBadge="desktop 特化" />
        <SettingRow title="终端字体" description="留空自动探测" placeholderBadge="desktop 特化" />
        <SettingRow title="关闭窗口时隐藏到托盘" description="后台驻留" placeholderBadge="desktop 特化" />
        <SettingRow title="保持电脑运行" description="任务运行时阻止空闲休眠" placeholderBadge="desktop 特化" />
        <SettingRow title="自动下载并安装更新" description="任务运行时重启前确认" placeholderBadge="desktop 特化" />
      </SettingGroupCard>
    </div>
  )
}
