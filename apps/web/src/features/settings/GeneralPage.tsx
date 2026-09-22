/**
 * 常规页（DESIGN §13.D① 按 Spark 落点裁剪）：
 * 交互行为=提交三模式默认档（落地，Composer 初始段位）；
 * 会话域显示开关（显示思考过程/工具分组）接 settings-store 即存即生效（工单 10.20 A③）；
 * 引擎行为卡（压缩阈值/最大步数/工具超时/输出上限/沙箱档）走 GET|PUT /api/settings
 * （工单 10.20 B / D28：热档下一 turn 生效，重启档标注"下次启动生效"）；
 * 阶段十九 19.13：代理/证书/归档/通知四组占位行转真控件——全局出网代理 + NO_PROXY
 * （spark.json network 段，翻案 12.9"仅 LLM 面"）、自动归档策略（archive 段）、
 * 任务通知与提示音（web 本地偏好 + Notification API 降级面）；自定义证书只读回显
 * （NODE_EXTRA_CA_CERTS 启动前注入，运行期不生效——不设假控件；桌面半边由壳读
 * desktop.json 的 certificates 段注入 sidecar env，工单 19.31）。
 * 界面语言一行明示阶段十九 19.17 已立项；终端/更新仍为 desktop 特化占位；托盘与保持运行
 * 已由桌面壳落地（阶段十九 19.30，配置面在 ~/.spark/desktop.json 由壳读，服务端与 web
 * 都无从读写——故这两行只给入口与生效时机，不做点了没反应的假开关）。
 * 「显示待办」不设开关：引擎无 Todo 工具，不留无效开关（工单 10.20 拍板）。
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Delivery, SettingsDto } from '@spark/protocol'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { SettingRow, SettingGroupCard } from './SettingRow'
import { Input } from '@/components/ui/input'
import { useTransport } from '@/transports/context'
import { useTransportQuery } from '@/hooks/useTransportQuery'
import { useAsyncOp } from '@/hooks/useAsyncOp'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useNotifyPrefs } from '@/hooks/useNotifyPrefs'
import { useI18n } from '@/i18n/context'

const DELIVERY_OPTIONS: { value: Delivery; label: string }[] = [
  { value: 'now', label: '立即' },
  { value: 'steer', label: '插话' },
  { value: 'queue', label: '排队' },
]

const SANDBOX_OPTIONS: { value: 'off' | 'on'; label: string }[] = [
  { value: 'off', label: '关闭' },
  // WO-082：选项文案收短防下拉截断——隔离细节由行 description 承载（ADR D15）
  { value: 'on', label: '开启（隔离）' },
]

/**
 * 重启档徽标（D28：构造期注入字段，写盘成功、下次启动生效）。
 * 阶段十九 19.14：**字段清单读 GET /api/settings 的 restartRequired 数组**（单一来源），
 * 去硬编码——新增重启档字段只改 protocol 一处，前端自动跟上。
 */
function RestartBadge({ field }: { field: string }) {
  const { data } = useTransportQuery((t) => t.getSettings())
  const hit = data?.restartRequired.includes(field) ?? false
  if (!hit) return null
  return (
    <span
      className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground"
      title="该字段构造期注入引擎子系统，保存写盘后下次启动生效"
    >
      下次启动生效
    </span>
  )
}


/** 服务端监听（阶段十九 19.14）：spark.json server 段读写——**重启档**（listen 绑定级，D28） */
function ServerBindSection() {
  const { transport } = useTransport()
  const { data, refresh } = useTransportQuery((t) => t.getSettings())
  const { busy, opError, run } = useAsyncOp()
  const [port, setPort] = useState('')
  const [host, setHost] = useState('')

  useEffect(() => {
    if (data === null) return
    setPort(String(data.server.port))
    setHost(data.server.host)
  }, [data])

  async function save(): Promise<void> {
    const n = Number(port.trim())
    if (!Number.isInteger(n) || n < 1 || n > 65535) return
    if (host.trim() === '') return
    await run(async () => {
      await transport.updateSettings({
        server: { port: n, host: host.trim() },
      })
      await refresh()
    })
  }

  return (
    <SettingGroupCard>
      <SettingRow title="监听端口" description="HTTP + SSE 端口（缺省 4318）；改端口需重启引擎后生效">
        <div className="flex items-center gap-1.5">
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            aria-label="监听端口"
            placeholder="4318"
            className="h-7 w-24 font-mono text-xs"
            inputMode="numeric"
          />
          <RestartBadge field="server.port" />
        </div>
      </SettingRow>
      <SettingRow title="监听地址" description="缺省 127.0.0.1（本地专用，刻意不对网卡暴露——§2.9 红线：不上公网）">
        <div className="flex items-center gap-1.5">
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            aria-label="监听地址"
            placeholder="127.0.0.1"
            className="h-7 w-32 font-mono text-xs"
          />
          <RestartBadge field="server.host" />
        </div>
      </SettingRow>
      <div className="flex items-center gap-2 px-4 py-3">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
          保存
        </Button>
        {opError !== null && <span className="font-mono text-xs text-destructive">{opError}</span>}
        <span className="text-xs text-muted-foreground">重启档：写盘后下次启动生效（当前进程监听不变）</span>
      </div>
    </SettingGroupCard>
  )
}

/** 全局出网代理（阶段十九 19.13，翻案 12.9"仅 LLM 面"）：spark.json network 段读写（热档） */
function NetworkProxySection() {
  const { transport } = useTransport()
  const { data, refresh } = useTransportQuery((t) => t.getSettings())
  const { busy, opError, run } = useAsyncOp()
  const [proxy, setProxy] = useState('')
  const [noProxy, setNoProxy] = useState('')

  useEffect(() => {
    if (data === null) return
    setProxy(data.network?.proxy ?? '')
    setNoProxy(data.network?.noProxy ?? '')
  }, [data])

  async function save(): Promise<void> {
    await run(async () => {
      await transport.updateSettings({
        network: { proxy: proxy.trim(), noProxy: noProxy.trim() },
      })
      await refresh()
    })
  }

  return (
    <SettingGroupCard>
      <SettingRow
        title="HTTP 代理"
        description="全局出网代理（http/https URL）——覆盖 LLM/embedding/MCP 子进程 env/连通测试全部引擎出口；留空 = 不设（回落 per-provider 与 HTTPS_PROXY 环境变量）"
      >
        <Input
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          aria-label="HTTP 代理"
          placeholder="http://127.0.0.1:7890"
          className="h-7 w-56 font-mono text-xs"
        />
      </SettingRow>
      <SettingRow title="不使用代理的地址" description="逗号分隔主机规则（如 localhost,127.0.0.1,*.internal）——匹配主机直连">
        <Input
          value={noProxy}
          onChange={(e) => setNoProxy(e.target.value)}
          aria-label="不使用代理的地址"
          placeholder="localhost,127.0.0.1"
          className="h-7 w-56 font-mono text-xs"
        />
      </SettingRow>
      <div className="flex items-center gap-2 px-4 py-3">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
          保存
        </Button>
        {opError !== null && <span className="font-mono text-xs text-destructive">{opError}</span>}
        <span className="text-xs text-muted-foreground">
          热档即时生效。边界：只引导尊重代理设置的客户端；streamable-http MCP 走 Node fetch
          （不读代理 env），stdio MCP 经注入 env 生效。
        </span>
      </div>
    </SettingGroupCard>
  )
}

/** 自动归档策略（阶段十九 19.13）：spark.json archive 段读写（热档，6 小时巡检一轮） */
function ArchivePolicySection() {
  const { transport } = useTransport()
  const { data, refresh } = useTransportQuery((t) => t.getSettings())
  const { busy, opError, run } = useAsyncOp()
  const [autoArchive, setAutoArchive] = useState(false)
  const [afterDays, setAfterDays] = useState('30')

  useEffect(() => {
    if (data === null) return
    setAutoArchive(data.archive?.autoArchive ?? false)
    setAfterDays(String(data.archive?.afterDays ?? 30))
  }, [data])

  async function save(): Promise<void> {
    const n = Number(afterDays.trim())
    if (!Number.isInteger(n) || n < 1 || n > 3650) {
      return
    }
    await run(async () => {
      await transport.updateSettings({ archive: { autoArchive, afterDays: n } })
      await refresh()
    })
  }

  return (
    <SettingGroupCard>
      <SettingRow
        title="自动归档旧会话"
        description="开启后，空闲（idle）且超过 N 天无活动的会话自动归档（与手动归档同一 .archived 标记，可随时取消）"
      >
        <Switch aria-label="自动归档旧会话" checked={autoArchive} onChange={setAutoArchive} />
      </SettingRow>
      <SettingRow title="超期天数" description="1~3650 天；进行中（running）与等待审批的会话永不自动归档">
        <Input
          value={afterDays}
          onChange={(e) => setAfterDays(e.target.value)}
          aria-label="超期天数"
          placeholder="30"
          className="h-7 w-20 font-mono text-xs"
          inputMode="numeric"
        />
      </SettingRow>
      <div className="flex items-center gap-2 px-4 py-3">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
          保存
        </Button>
        {opError !== null && <span className="font-mono text-xs text-destructive">{opError}</span>}
        <span className="text-xs text-muted-foreground">热档即时生效；引擎每 6 小时巡检一轮（重启也巡）</span>
      </div>
    </SettingGroupCard>
  )
}

/** 任务通知与提示音（阶段十九 19.13）：web 本地偏好（localStorage）+ Notification API 降级面。
 *  desktop 端的通知开关在 desktop.json（工单 19.30：notifications 段的
 *  turnCompleted/approvalWaiting/sound/events/debounceMs），web 不跨管。 */
function NotificationSection() {
  const prefs = useNotifyPrefs()
  const unsupported = typeof Notification === 'undefined'
  return (
    <SettingGroupCard>
      <SettingRow
        title="任务通知"
        description="回合完成/失败时发系统通知（浏览器 Notification API；页面在前台时不发）"
      >
        <Switch
          aria-label="任务通知"
          checked={prefs.enabled}
          disabled={unsupported}
          onChange={(v) => prefs.set({ enabled: v })}
        />
      </SettingRow>
      <SettingRow title="通知声音" description="通知时播放提示音（WebAudio 合成，无音频文件依赖）">
        <Switch
          aria-label="通知声音"
          checked={prefs.sound}
          disabled={!prefs.enabled}
          onChange={(v) => prefs.set({ sound: v })}
        />
      </SettingRow>
      <div className="px-4 pb-3">
        {unsupported && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            当前环境不支持 Notification API（非安全上下文或浏览器限制）——开关已禁用，
            提示音仍可用。通知权限在首次触发时由浏览器询问。
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          偏好存本机浏览器（localStorage），不写 spark.json；desktop 端有独立开关（desktop.json）。
        </p>
      </div>
    </SettingGroupCard>
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
  const [bashPersistent, setBashPersistent] = useState(false)
  // 阶段十九 19.14：四个"后端可读写、前端无控件"的反向占位字段
  const [maxToolParallel, setMaxToolParallel] = useState('')
  const [progressThrottleMs, setProgressThrottleMs] = useState('')
  const [permissionTimeoutMs, setPermissionTimeoutMs] = useState('')
  const [checkpoints, setCheckpoints] = useState(false)

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
    setBashPersistent(data.engine.bashPersistent)
    setMaxToolParallel(String(data.engine.maxToolParallel))
    setProgressThrottleMs(String(data.engine.progressThrottleMs))
    setPermissionTimeoutMs(String(data.engine.permissionTimeoutMs))
    setCheckpoints(data.engine.checkpoints)
  }, [data])

  const { busy, opError, setOpError, run } = useAsyncOp()

  async function save(): Promise<void> {
    const steps = Number(maxSteps)
    const th = Number(threshold)
    const timeout = Number(toolTimeout)
    const limit = Number(outputLimit)
    const parallel = Number(maxToolParallel)
    const throttle = Number(progressThrottleMs)
    const permTimeout = Number(permissionTimeoutMs)
    if (
      !Number.isInteger(steps) || steps < 1 ||
      Number.isNaN(th) || th <= 0 || th >= 1 ||
      !Number.isInteger(timeout) || timeout <= 0 ||
      !Number.isInteger(limit) || limit <= 0 ||
      !Number.isInteger(parallel) || parallel < 1 ||
      !Number.isInteger(throttle) || throttle <= 0 ||
      !Number.isInteger(permTimeout) || permTimeout <= 0
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
          bashPersistent,
          maxToolParallel: parallel,
          progressThrottleMs: throttle,
          permissionTimeoutMs: permTimeout,
          checkpoints,
        },
      })
      await refresh()
      setSettings(next)
    })
  }

  const inputCls = 'w-28 font-mono text-xs'
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
            <Input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              aria-label="压缩阈值"
              disabled={busy}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="每轮最大步数" description="单轮工具/模型往返上限；下一轮生效">
            <Input
              value={maxSteps}
              onChange={(e) => setMaxSteps(e.target.value)}
              aria-label="每轮最大步数"
              disabled={busy}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="工具超时（毫秒）" description="单工具执行上限">
            <div className="flex items-center gap-1.5">
              <Input
                value={toolTimeout}
                onChange={(e) => setToolTimeout(e.target.value)}
                aria-label="工具超时毫秒"
                disabled={busy}
                className={inputCls}
              />
              <RestartBadge field="engine.toolTimeoutMs" />
            </div>
          </SettingRow>
          <SettingRow title="工具输出上限（KB）" description="超限截断（防输出打爆上下文）">
            <div className="flex items-center gap-1.5">
              <Input
                value={outputLimit}
                onChange={(e) => setOutputLimit(e.target.value)}
                aria-label="工具输出上限 KB"
                disabled={busy}
                className={inputCls}
              />
              <RestartBadge field="engine.toolOutputLimitKB" />
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
              <RestartBadge field="engine.bashSandbox" />
            </div>
          </SettingRow>
          <SettingRow
            title="bash 常驻会话"
            description="同一会话的 shell 保持 cwd/环境变量（阶段十九 19.3 / ADR D45）；改完下一条命令生效，超时/中断会重置该会话 shell"
          >
            <Switch
              aria-label="bash 常驻会话"
              checked={bashPersistent}
              disabled={busy}
              onChange={setBashPersistent}
            />
          </SettingRow>
          <SettingRow title="工具并行上限" description="同一步内并行执行的工具数上限（parallelizable=true 的 read/grep/lsp 等）">
            <Input
              value={maxToolParallel}
              onChange={(e) => setMaxToolParallel(e.target.value)}
              aria-label="工具并行上限"
              disabled={busy}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="进度节流（毫秒）" description="tool.progress 直播节流窗（200ms 量级；过小刷屏，过大手感迟滞）">
            <Input
              value={progressThrottleMs}
              onChange={(e) => setProgressThrottleMs(e.target.value)}
              aria-label="进度节流毫秒"
              disabled={busy}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow title="审批超时（毫秒）" description="审批请求挂起上限；超时按拒绝处理（fail-closed，§5.7）">
            <div className="flex items-center gap-1.5">
              <Input
                value={permissionTimeoutMs}
                onChange={(e) => setPermissionTimeoutMs(e.target.value)}
                aria-label="审批超时毫秒"
                disabled={busy}
                className={inputCls}
              />
              <RestartBadge field="engine.permissionTimeoutMs" />
            </div>
          </SettingRow>
          <SettingRow title="回合边界检查点" description="每回合结束打 git 快照（回滚/fork 的数据源；测试夹具常关掉提速）">
            <Switch
              aria-label="回合边界检查点"
              checked={checkpoints}
              disabled={busy}
              onChange={setCheckpoints}
            />
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

/** 语言选项（阶段十九 19.17 第一批；值 = protocol LanguageSchema 封闭集） */
const LANGUAGE_OPTIONS: { value: 'zh-CN' | 'en'; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
]

export function GeneralSettingsPage() {
  const navigate = useNavigate()
  const { lang, setLang } = useI18n()
  const defaultDelivery = useSettingsStore((s) => s.defaultDelivery)
  const setDefaultDelivery = useSettingsStore((s) => s.setDefaultDelivery)
  const showReasoning = useSettingsStore((s) => s.showReasoning)
  const setShowReasoning = useSettingsStore((s) => s.setShowReasoning)
  const showToolGroups = useSettingsStore((s) => s.showToolGroups)
  const setShowToolGroups = useSettingsStore((s) => s.setShowToolGroups)
  const deliveryOptions = useMemo(() => DELIVERY_OPTIONS, [])
  // 自定义证书只读回显 + 数据目录（阶段十九 19.13 / 19.16）
  const { data: settingsInfo } = useTransportQuery((t) => t.getSettings())
  const certs = settingsInfo?.certificates
  const dataHome = settingsInfo?.home ?? null

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
        <SettingRow title="界面语言" description="界面语言（切换即时生效；长尾页面文案随批次迁移）">
          <Select
            aria-label="界面语言"
            value={lang}
            options={LANGUAGE_OPTIONS}
            onChange={setLang}
            className="w-28"
          />
        </SettingRow>
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

      {/* 服务端监听（阶段十九 19.14）：server.port/host 重启档控件 */}
      <ServerBindSection />

      {/* 全局出网代理（阶段十九 19.13，翻案 12.9"仅 LLM 面"） */}
      <NetworkProxySection />

      <SettingGroupCard>
        <SettingRow
          title="自定义证书"
          description="NODE_EXTRA_CA_CERTS 由 Node 在进程启动时读取——运行期注入对已建立的 TLS 不生效，故只读回显"
        >
          <span className="max-w-[280px] truncate font-mono text-xs text-muted-foreground" title={certs?.nodeExtraCaCerts ?? ''}>
            {certs?.nodeExtraCaCerts ?? '未设置（用系统默认 CA）'}
          </span>
        </SettingRow>
        <div className="px-4 pb-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            自签 CA 场景（公司网根证书）两条入口，都只在进程启动时生效：独立 server 在启动前设{' '}
            <span className="font-mono">NODE_EXTRA_CA_CERTS=/path/ca.pem</span>；桌面应用写{' '}
            <span className="font-mono">~/.spark/desktop.json</span> 的{' '}
            <span className="font-mono">{'certificates.nodeExtraCaCerts'}</span> 后重启应用
            （sidecar 由壳拉起，随壳重启才读该值——工单 19.31）。此处如实回显当前进程读到的值，
            不提供"保存后生效"的假控件。
          </p>
        </div>
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow
          title="数据存储路径"
          description="启动期定（SPARK_HOME 环境变量优先，缺省 ~/.spark）；改路径用 spark migrate <dir> 整体搬迁（复制+字节校验+源改名备份，不删源）"
        >
          <span className="max-w-[280px] truncate font-mono text-xs text-muted-foreground" title={dataHome ?? ''}>
            {dataHome === null ? '读取中…' : dataHome}
          </span>
        </SettingRow>
        <div className="px-4 pb-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            运行期改路径会坏在途句柄（SQLite/水位都在旧路径上）——故不提供网页搬迁控件；
            终端执行 <span className="font-mono">spark migrate /new/path</span>，按提示确认，
            完成后把 SPARK_HOME 指向新目录再启动。
          </p>
        </div>
      </SettingGroupCard>

      {/* 自动归档策略（阶段十九 19.13） */}
      <ArchivePolicySection />

      {/* 任务通知与提示音（阶段十九 19.13）：web 本地偏好 + Notification API 降级面 */}
      <NotificationSection />

      <SettingGroupCard>
        <SettingRow
          title="首启引导"
          description="重新运行三步引导（欢迎 / 配模型 / 建会话）——入口与状态查看已收编至「引导」设置页（阶段十九 19.15）"
        >
          <Button variant="outline" onClick={() => {
              void navigate('/settings/onboarding')
            }}>
            前往引导设置
          </Button>
        </SettingRow>
        <SettingRow title="集成终端 Shell" description="Git Bash 优先，回退 cmd.exe" placeholderBadge="desktop 特化" />
        <SettingRow title="终端字体" description="留空自动探测" placeholderBadge="desktop 特化" />
        {/* 阶段十九 19.30 两行摘徽标：桌面壳已落地，但配置面是壳读的 desktop.json——
            服务端与 web 都没有读写的口子，故只给入口与生效时机，不设假开关（真值回显需新端点，挂尾） */}
        <SettingRow
          title="关闭窗口时隐藏到托盘"
          description="仅桌面应用可改：写 ~/.spark/desktop.json 的 hideOnClose 后重启桌面应用；托盘不可用时按退出处理"
        />
        <SettingRow
          title="保持电脑运行"
          description="仅桌面应用可改：写 ~/.spark/desktop.json 的 keepAwake 后重启桌面应用；开启期间阻止系统空闲休眠（隐藏到托盘时仍生效）"
        />
        <SettingRow title="自动下载并安装更新" description="任务运行时重启前确认" placeholderBadge="desktop 特化" />
      </SettingGroupCard>
    </div>
  )
}
