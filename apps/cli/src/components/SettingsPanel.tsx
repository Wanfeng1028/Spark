/**
 * 设置面板（阶段十九 19.23）：终端形态的可改设置子集——与 web 设置中心同一批端点
 * （GET/PUT /api/settings、GET/PUT /api/routing），零新端点、零新协议面。
 * 键位：↑↓ 选字段 · Enter 改值（布尔取反 / 枚举循环 / 数值与文本进入行内编辑）·
 * Esc 先取消编辑再关面板（编辑态经 store.panelEditing 向 App 层键位让位）。
 * 纪律：写成功后重读服务端回显（禁乐观更新）；热/重启分档标注取服务端 restartRequired
 * 单源（D28），端侧不复制字段清单。
 */
import { Text, useInput } from 'ink'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { errorMessageOf } from '@spark/protocol'
import type {
  Language,
  PromptsDto,
  ReasoningEffort,
  RoutingDto,
  SettingsDto,
  Transport,
} from '@spark/protocol'
import { PanelShell } from './CommandPanels.js'
import { useCliStore } from '../store.js'

type Value = string | number | boolean | null

interface Ctx {
  settings: SettingsDto
  routing: RoutingDto
  /** GET /api/prompts 可选装载（失败只影响模板三项的展示，不阻塞整面板） */
  prompts: PromptsDto | null
}

interface Field {
  /** 与服务端 restartRequired 同源的路径标识（如 engine.maxStepsPerTurn） */
  id: string
  label: string
  kind: 'toggle' | 'enum' | 'int' | 'float' | 'text' | 'readonly'
  /** 枚举候选（含 null = "未设置"档）；循环顺序即本数组顺序 */
  values?: readonly Value[]
  /** 数值下界（含）；缺省 = 只交服务端校验（如 0<x<1 的压缩阈值，端侧不臆造边界） */
  min?: number
  max?: number
  /** 文本字段允许清空（空串是合法值：不覆盖 UA / 不设代理） */
  allowEmpty?: true
  /** restartRequired 未登记而语义为重启档的字段（提示词模板在引擎构造期装载） */
  restart?: true
  read: (ctx: Ctx) => Value
  write?: (ctx: Ctx, v: Value) => Promise<unknown>
}

interface Group {
  title: string
  fields: readonly Field[]
}

type Line = { kind: 'header'; title: string } | { kind: 'field'; field: Field; index: number }

const VISIBLE = 12

function show(v: Value): string {
  if (v === null) return '未配置'
  if (typeof v === 'boolean') return v ? 'on' : 'off'
  return String(v)
}

/** 文本 → 字段值解析与端侧预校验（服务端仍是权威：这里只挡明显非法输入） */
function parse(f: Field, buf: string): { ok: true; value: Value } | { ok: false; error: string } {
  if (f.kind === 'int' || f.kind === 'float') {
    const pattern = f.kind === 'int' ? /^-?\d+$/ : /^-?\d+(\.\d+)?$/
    if (!pattern.test(buf)) return { ok: false, error: `需要${f.kind === 'int' ? '整数' : '数字'}` }
    const n = Number(buf)
    if (f.min !== undefined && n < f.min) return { ok: false, error: `不得小于 ${f.min}` }
    if (f.max !== undefined && n > f.max) return { ok: false, error: `不得大于 ${f.max}` }
    return { ok: true, value: n }
  }
  if (buf === '' && f.allowEmpty === undefined) return { ok: false, error: '不能为空' }
  return { ok: true, value: buf }
}

/** 字段清单：一份描述符驱动渲染与写入（新增一项只加一条，键位与校验不散落） */
function groupsOf(transport: Transport): readonly Group[] {
  return [
    {
      title: '模型缺省（PUT /api/routing，热生效下一新建会话）',
      fields: [
        {
          id: 'routing.defaultModel',
          label: '默认模型',
          kind: 'text',
          read: (c) => c.routing.defaultModel,
          write: (_c, v) => transport.updateRouting({ defaultModel: String(v) }),
        },
        {
          id: 'routing.defaultEffort',
          label: '默认推理档',
          kind: 'enum',
          values: ['low', 'medium', 'high', null],
          read: (c) => c.routing.defaultEffort,
          write: (_c, v) => {
            const effort: ReasoningEffort | null =
              v === 'low' || v === 'medium' || v === 'high' ? v : null
            return transport.updateRouting({ defaultEffort: effort })
          },
        },
      ],
    },
    {
      title: '引擎行为（PUT /api/settings.engine）',
      fields: [
        {
          id: 'engine.maxStepsPerTurn',
          label: '每回合最大步数',
          kind: 'int',
          min: 1,
          read: (c) => c.settings.engine.maxStepsPerTurn,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, maxStepsPerTurn: Number(v) },
            }),
        },
        {
          id: 'engine.maxToolParallel',
          label: '工具并发上限',
          kind: 'int',
          min: 1,
          read: (c) => c.settings.engine.maxToolParallel,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, maxToolParallel: Number(v) },
            }),
        },
        {
          id: 'engine.compactionThreshold',
          label: '压缩阈值（0–1 小数）',
          kind: 'float',
          read: (c) => c.settings.engine.compactionThreshold,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, compactionThreshold: Number(v) },
            }),
        },
        {
          id: 'engine.progressThrottleMs',
          label: '进度节流(ms)',
          kind: 'int',
          min: 1,
          read: (c) => c.settings.engine.progressThrottleMs,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, progressThrottleMs: Number(v) },
            }),
        },
        {
          id: 'engine.toolTimeoutMs',
          label: '工具超时(ms)',
          kind: 'int',
          min: 1,
          read: (c) => c.settings.engine.toolTimeoutMs,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, toolTimeoutMs: Number(v) },
            }),
        },
        {
          id: 'engine.permissionTimeoutMs',
          label: '审批超时(ms)',
          kind: 'int',
          min: 1,
          read: (c) => c.settings.engine.permissionTimeoutMs,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, permissionTimeoutMs: Number(v) },
            }),
        },
        {
          id: 'engine.toolOutputLimitKB',
          label: '工具输出上限(KB)',
          kind: 'int',
          min: 1,
          read: (c) => c.settings.engine.toolOutputLimitKB,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, toolOutputLimitKB: Number(v) },
            }),
        },
        {
          id: 'engine.checkpoints',
          label: 'turn 边界检查点',
          kind: 'toggle',
          read: (c) => c.settings.engine.checkpoints,
          write: (c, v) =>
            transport.updateSettings({ engine: { ...c.settings.engine, checkpoints: Boolean(v) } }),
        },
        {
          id: 'engine.computerUseEnabled',
          label: '电脑控制主开关',
          kind: 'toggle',
          read: (c) => c.settings.engine.computerUseEnabled,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, computerUseEnabled: Boolean(v) },
            }),
        },
        {
          id: 'engine.bashPersistent',
          label: 'bash 常驻会话',
          kind: 'toggle',
          read: (c) => c.settings.engine.bashPersistent,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, bashPersistent: Boolean(v) },
            }),
        },
        {
          id: 'engine.bashSandbox',
          label: 'bash 沙箱 wrapper',
          kind: 'enum',
          values: ['off', 'on'],
          read: (c) => c.settings.engine.bashSandbox,
          write: (c, v) =>
            transport.updateSettings({
              engine: { ...c.settings.engine, bashSandbox: v === 'on' ? 'on' : 'off' },
            }),
        },
      ],
    },
    {
      title: '沙箱与出网（sandbox.network / network 段）',
      fields: [
        {
          id: 'sandbox.network.mode',
          label: '出口过滤模式',
          kind: 'enum',
          values: ['off', 'allowlist'],
          read: (c) => c.settings.sandbox?.network.mode ?? null,
          write: (c, v) =>
            transport.updateSettings({
              sandbox: { network: { mode: v === 'allowlist' ? 'allowlist' : 'off' } },
            }),
        },
        {
          id: 'sandbox.network.port',
          label: '代理端口',
          kind: 'int',
          min: 1024,
          max: 65535,
          read: (c) => c.settings.sandbox?.network.port ?? null,
          write: (_c, v) => transport.updateSettings({ sandbox: { network: { port: Number(v) } } }),
        },
        {
          id: 'network.proxy',
          label: '全局代理（空=不设）',
          kind: 'text',
          allowEmpty: true,
          read: (c) => c.settings.network?.proxy ?? null,
          write: (_c, v) => transport.updateSettings({ network: { proxy: String(v) } }),
        },
        {
          id: 'network.noProxy',
          label: '代理绕过名单（逗号分隔）',
          kind: 'text',
          allowEmpty: true,
          read: (c) => c.settings.network?.noProxy ?? null,
          write: (_c, v) => transport.updateSettings({ network: { noProxy: String(v) } }),
        },
        {
          id: 'certificates.nodeExtraCaCerts',
          label: '自定义 CA 证书（NODE_EXTRA_CA_CERTS）',
          kind: 'readonly',
          read: (c) => c.settings.certificates.nodeExtraCaCerts,
        },
      ],
    },
    {
      title: '归档与检索（archive / embedding 段）',
      fields: [
        {
          id: 'archive.autoArchive',
          label: '自动归档',
          kind: 'toggle',
          read: (c) => c.settings.archive?.autoArchive ?? null,
          write: (_c, v) => transport.updateSettings({ archive: { autoArchive: Boolean(v) } }),
        },
        {
          id: 'archive.afterDays',
          label: '归档空闲天数',
          kind: 'int',
          min: 1,
          max: 3650,
          read: (c) => c.settings.archive?.afterDays ?? null,
          write: (_c, v) => transport.updateSettings({ archive: { afterDays: Number(v) } }),
        },
        {
          id: 'embedding.enabled',
          label: '语义检索总开关',
          kind: 'toggle',
          read: (c) => c.settings.embedding?.enabled ?? null,
          write: (_c, v) => transport.updateSettings({ embedding: { enabled: Boolean(v) } }),
        },
      ],
    },
    {
      title: '浏览器工具（browser 段，全部重启档）',
      fields: [
        {
          id: 'browser.headless',
          label: '无头模式',
          kind: 'toggle',
          read: (c) => c.settings.browser?.headless ?? null,
          write: (_c, v) => transport.updateSettings({ browser: { headless: Boolean(v) } }),
        },
        {
          id: 'browser.defaultTimeoutMs',
          label: '默认超时(ms)',
          kind: 'int',
          min: 1,
          max: 300000,
          read: (c) => c.settings.browser?.defaultTimeoutMs ?? null,
          write: (_c, v) =>
            transport.updateSettings({ browser: { defaultTimeoutMs: Number(v) } }),
        },
        {
          id: 'browser.userAgent',
          label: 'UA（空=不覆盖）',
          kind: 'text',
          allowEmpty: true,
          read: (c) => c.settings.browser?.userAgent ?? null,
          write: (_c, v) => transport.updateSettings({ browser: { userAgent: String(v) } }),
        },
      ],
    },
    {
      title: '界面与启停名单',
      fields: [
        {
          id: 'ui.language',
          label: '界面语言（热档）',
          kind: 'enum',
          values: ['zh-CN', 'en'],
          read: (c) => c.settings.ui?.language ?? null,
          write: (_c, v) => {
            const language: Language = v === 'en' ? 'en' : 'zh-CN'
            return transport.updateSettings({ ui: { language } })
          },
        },
        {
          id: 'agents.disabledAgents',
          label: '子代理停用数',
          kind: 'readonly',
          read: (c) => c.settings.agents?.disabledAgents.length ?? 0,
        },
        {
          id: 'extensions.disabledExtensions',
          label: '扩展停用数',
          kind: 'readonly',
          read: (c) => c.settings.extensions?.disabledExtensions.length ?? 0,
        },
      ],
    },
    {
      title: '提示词模板（编辑走 web 设置中心·提示词页，工单 19.18）',
      fields: [
        {
          id: 'prompts.base',
          label: 'base 模板路径',
          kind: 'readonly',
          restart: true,
          read: (c) => c.prompts?.slots.find((s) => s.slot === 'base')?.path ?? null,
        },
        {
          id: 'prompts.compaction',
          label: 'compaction 模板路径',
          kind: 'readonly',
          restart: true,
          read: (c) => c.prompts?.slots.find((s) => s.slot === 'compaction')?.path ?? null,
        },
        {
          id: 'prompts.title',
          label: 'title 模板路径',
          kind: 'readonly',
          restart: true,
          read: (c) => c.prompts?.slots.find((s) => s.slot === 'title')?.path ?? null,
        },
      ],
    },
  ]
}

export function SettingsPanel({ transport }: { transport: Transport }) {
  const [data, setData] = useState<{ settings: SettingsDto; routing: RoutingDto } | null>(null)
  const [prompts, setPrompts] = useState<PromptsDto | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [top, setTop] = useState(0)
  const [editing, setEditing] = useState<{ id: string; buf: string } | null>(null)
  const [busy, setBusy] = useState(false)
  /** 最近一次写入结果（成功与失败都占一行——失败不得静默，禁假状态） */
  const [msg, setMsg] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  const groups = useMemo(() => groupsOf(transport), [transport])
  const lines = useMemo<readonly Line[]>(() => {
    const out: Line[] = []
    let index = 0
    for (const g of groups) {
      out.push({ kind: 'header', title: g.title })
      for (const f of g.fields) out.push({ kind: 'field', field: f, index: index++ })
    }
    return out
  }, [groups])
  const fields = useMemo(
    () => lines.flatMap((l) => (l.kind === 'field' ? [l.field] : [])),
    [lines],
  )

  useEffect(() => {
    let disposed = false
    Promise.all([transport.getSettings(), transport.getRouting()])
      .then(([settings, routing]) => {
        if (!disposed) {
          setData({ settings, routing })
          setLoadError(null)
        }
      })
      .catch((err: unknown) => {
        if (!disposed) {
          setData(null)
          setLoadError(errorMessageOf(err))
        }
      })
    // 模板三项是可选展示信息：失败回退为"未装载"，不连带拖垮整面板
    transport
      .promptsInfo()
      .then((p) => {
        if (!disposed) setPrompts(p)
      })
      .catch(() => {
        if (!disposed) setPrompts(null)
      })
    return () => {
      disposed = true
    }
  }, [transport, revision])

  // 编辑态向 App 层让位 Esc（键位两处消费同一键会互相吞——19.23）
  useEffect(() => {
    useCliStore.getState().setPanelEditing(editing !== null)
    return () => {
      useCliStore.getState().setPanelEditing(false)
    }
  }, [editing])

  useEffect(() => {
    if (cursor < top) setTop(cursor)
    else if (cursor >= top + VISIBLE) setTop(cursor - VISIBLE + 1)
  }, [cursor, top])

  const ctx: Ctx | null = data === null ? null : { ...data, prompts }

  async function commit(field: Field, value: Value): Promise<void> {
    if (ctx === null || field.write === undefined) return
    setBusy(true)
    try {
      await field.write(ctx, value)
      // 重读服务端回显（禁乐观更新）：revision 递增触发装载
      setRevision((r) => r + 1)
      setMsg(`已保存 ${field.label}`)
    } catch (err: unknown) {
      setMsg(`保存失败：${errorMessageOf(err)}`)
    } finally {
      setBusy(false)
    }
  }

  function activate(field: Field): void {
    if (ctx === null) return
    if (busy) return
    setMsg(null)
    if (field.kind === 'readonly' || field.write === undefined) {
      setMsg(`${field.label} 只读（编辑面在 web 设置中心）`)
      return
    }
    if (field.kind === 'toggle') {
      void commit(field, !field.read(ctx))
      return
    }
    if (field.kind === 'enum') {
      const values = field.values ?? []
      const cur = field.read(ctx)
      const at = values.findIndex((v) => v === cur)
      const next = values.length === 0 ? cur : values[(at + 1 + values.length) % values.length]
      void commit(field, next ?? null)
      return
    }
    const cur = field.read(ctx)
    setEditing({ id: field.id, buf: cur === null ? '' : String(cur) })
  }

  useInput((input, key) => {
    if (ctx === null || fields.length === 0) return
    if (editing !== null) {
      const field = fields.find((f) => f.id === editing.id)
      if (field === undefined) {
        setEditing(null)
        return
      }
      if (key.escape) {
        setEditing(null)
        setMsg(null)
        return
      }
      if (key.return) {
        const parsed = parse(field, editing.buf)
        setEditing(null)
        if (!parsed.ok) {
          setMsg(`${field.label}：${parsed.error}`)
          return
        }
        void commit(field, parsed.value)
        return
      }
      if (key.backspace || key.delete) {
        setEditing((e) => (e === null ? e : { ...e, buf: e.buf.slice(0, -1) }))
        return
      }
      if (key.upArrow || key.downArrow || key.ctrl || key.meta) return
      if (input !== '') setEditing((e) => (e === null ? e : { ...e, buf: e.buf + input }))
      return
    }
    if (key.upArrow || key.downArrow) {
      const dir = key.upArrow ? -1 : 1
      setCursor((c) => (c + dir + fields.length) % fields.length)
      return
    }
    if (key.return) {
      const field = fields[cursor]
      if (field !== undefined) activate(field)
    }
  })

  const body = (() => {
    if (loadError !== null) return <Text color="red">{loadError}</Text>
    if (ctx === null) return <Text color="gray">装载中…</Text>
    const first = lines.findIndex((l) => l.kind === 'field' && l.index === top)
    const visible = first === -1 ? [] : lines.slice(first)
    const rows: ReactNode[] = []
    let count = 0
    for (const line of visible) {
      if (line.kind === 'header') {
        rows.push(
          <Text key={`h-${line.title}`} color="gray" wrap="truncate-end">
            {line.title}
          </Text>,
        )
        continue
      }
      if (count >= VISIBLE) break
      count += 1
      const f = line.field
      const isRestart = f.restart === true || ctx.settings.restartRequired.includes(f.id)
      const selected = line.index === cursor
      const editingThis = editing?.id === f.id
      const value = editingThis ? `[${editing.buf}]` : show(f.read(ctx))
      rows.push(
        <Text key={f.id} inverse={selected} wrap="truncate-end">
          {selected ? '> ' : '  '}
          {f.label}
          {'  '}
          <Text color={f.kind === 'readonly' ? 'gray' : 'green'}>{value}</Text>
          {isRestart ? <Text color="yellow">  下次启动生效</Text> : null}
        </Text>,
      )
    }
    return rows
  })()

  return (
    <PanelShell
      title="设置"
      hint={
        editing !== null
          ? '输入后 Enter 保存 · Esc 取消'
          : busy
            ? '写入中…'
            : '↑↓ 选择 · Enter 改值 · Esc 关闭'
      }
    >
      {body}
      <Text color="gray">{fields.length} 项（只读项与其余设置见 web 设置中心）</Text>
      {msg !== null ? <Text color="yellow">{msg}</Text> : null}
    </PanelShell>
  )
}
