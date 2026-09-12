/**
 * 命令描述符（工单 10.18 描述符架构）：四端命令面的单一词表（D22 共享资产纪律，
 * 词表模式照抄本仓 keymap.ts 先例——一条命令一个来源，四端删平行表）。
 * - kind=action：引擎动作（经 POST /api/sessions/:id/commands/:name）；
 * - kind=client：客户端动作（各端按 clientAction 分派；某端未实现即不渲染——禁假状态）；
 * - kind=prompt：自定义 .md 命令（引擎 ~/.spark/commands 扫描，不在本表）。
 * v1 基线以 doc/02 阶段十·10.18a 判决表为准（14 条；/title 判决表称"setTitle 已有"，
 * 经源码核实引擎仅有自动标题与 index.setTitle 内部方法，无对外改名端点——
 * "零新后端"约束下不入基线，挂 v2 与 /rename 同族）。
 */
import { z } from 'zod'

export const CommandSurfaceSchema = z.enum(['web', 'cli', 'mobile', 'miniapp'])

/** client 命令动作封闭枚举（各端分派 map 的键；未声明者不渲染） */
export const ClientActionSchema = z.enum([
  'new',
  'resume',
  'stats',
  'help',
  'model',
  'mcp',
  'skills',
  'usage',
  'fork',
  'checkpoint',
  'rollback',
  'effort',
  'tree',
  'voice',
  'lsp',
  'agents',
  'trust',
  'extensions',
])
export type ClientAction = z.infer<typeof ClientActionSchema>

export const CommandArgsSchema = z.strictObject({
  placeholder: z.string(),
  hint: z.string(),
})

export const CommandDescriptorSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string(),
  kind: z.enum(['action', 'prompt', 'client']),
  /** slash 菜单分组（会话/模型/信息/帮助，工单 10.18⑦） */
  group: z.enum(['session', 'model', 'info', 'help']),
  /** 适用端（至少一端；某端未实现该 clientAction 时该端不渲染） */
  surface: z.array(CommandSurfaceSchema).min(1),
  /** 是否需激活会话（无会话时不可用） */
  sessionRequired: z.boolean(),
  args: CommandArgsSchema.optional(),
  clientAction: ClientActionSchema.optional(),
})
export type CommandDescriptor = z.infer<typeof CommandDescriptorSchema>

/** v1 基线命令（10.18a 判决表"v1 落地"列；全部走既有端点，零新后端） */
export const BUILTIN_COMMANDS: readonly CommandDescriptor[] = [
  {
    name: 'init',
    description: '分析当前目录生成 AGENTS.md 初稿（工单 16.1；生成走 write 审批链）',
    kind: 'action',
    group: 'session',
    surface: ['web', 'cli'],
    sessionRequired: true,
  },
  {
    name: 'compact',
    description: '压缩上下文（保留摘要，释放窗口）',
    kind: 'action',
    group: 'session',
    surface: ['web', 'cli'],
    sessionRequired: true,
  },
  {
    // 工单 16.3：引擎侧 action（不是 client 命令）——四端一处实现，前端只读投影的 slice.mode
    name: 'plan',
    description: '计划模式：写类工具全拒，模型只读地出计划；/plan exit 退出并恢复原档位',
    kind: 'action',
    group: 'session',
    surface: ['web', 'cli'],
    sessionRequired: true,
  },
  {
    // 工单 16.7：引擎侧 action——/goal set <条件> / clear / status；续跑循环与护栏在引擎（goals.ts）
    name: 'goal',
    description: '持续目标：/goal set <条件> 让引擎循环工作直至满足或护栏触发；/goal clear / /goal status',
    kind: 'action',
    group: 'session',
    surface: ['web', 'cli'],
    sessionRequired: true,
  },
  {
    // 工单 16.6：client 命令——/voice 循环切换语音模式 hold→tap→off（录音与转写全在端侧/Transport）
    name: 'voice',
    description: '语音听写模式：hold（按住说话）/ tap（点击开始停止）/ off（隐藏麦克风）',
    kind: 'client',
    group: 'session',
    surface: ['web', 'cli'],
    sessionRequired: true,
    clientAction: 'voice',
  },
  {
    name: 'new',
    description: '新建会话',
    kind: 'client',
    group: 'session',
    surface: ['cli'],
    sessionRequired: false,
    clientAction: 'new',
  },
  {
    name: 'resume',
    description: '恢复历史会话',
    kind: 'client',
    group: 'session',
    surface: ['web', 'cli'],
    sessionRequired: false,
    clientAction: 'resume',
  },
  {
    name: 'stats',
    description: '查看 seq 水位与 token 明细',
    kind: 'client',
    group: 'info',
    surface: ['cli'],
    sessionRequired: false,
    clientAction: 'stats',
  },
  {
    name: 'help',
    description: '帮助（概览/命令/键位三 tab）',
    kind: 'client',
    group: 'help',
    surface: ['cli'],
    sessionRequired: false,
    clientAction: 'help',
  },
  {
    name: 'model',
    description: '查看或切换会话模型',
    kind: 'client',
    group: 'model',
    surface: ['web', 'cli'],
    sessionRequired: true,
    clientAction: 'model',
  },
  {
    name: 'mcp',
    description: '查看 MCP 服务器与工具',
    kind: 'client',
    group: 'info',
    surface: ['web', 'cli'],
    sessionRequired: false,
    clientAction: 'mcp',
  },
  {
    name: 'skills',
    description: '查看已加载技能',
    kind: 'client',
    group: 'info',
    surface: ['web', 'cli'],
    sessionRequired: false,
    clientAction: 'skills',
  },
  {
    name: 'usage',
    description: '查看路由档与成本累计',
    kind: 'client',
    group: 'info',
    surface: ['web', 'cli'],
    sessionRequired: false,
    clientAction: 'usage',
  },
  {
    name: 'fork',
    description: '从最近事件分叉新会话',
    kind: 'client',
    group: 'session',
    surface: ['cli'],
    sessionRequired: true,
    clientAction: 'fork',
  },
  {
    name: 'checkpoint',
    description: '查看 turn 边界快照列表',
    kind: 'client',
    group: 'session',
    surface: ['cli'],
    sessionRequired: true,
    clientAction: 'checkpoint',
  },
  {
    name: 'rollback',
    description: '回滚到指定快照',
    kind: 'client',
    group: 'session',
    surface: ['cli'],
    sessionRequired: true,
    args: { placeholder: '<checkpoint-id>', hint: '/checkpoint 查看列表；id 取前缀即可' },
    clientAction: 'rollback',
  },
  {
    name: 'effort',
    description: '设置推理档位（low/medium/high）',
    kind: 'client',
    group: 'model',
    surface: ['cli'],
    sessionRequired: true,
    args: { placeholder: '<low|medium|high>', hint: '缺省档位见 models.json defaultEffort' },
    clientAction: 'effort',
  },
  {
    name: 'tree',
    description: '查看会话树（分叉与子代理）',
    kind: 'client',
    group: 'session',
    surface: ['cli'],
    sessionRequired: true,
    clientAction: 'tree',
  },
  {
    // 工单 16.9：client 命令——/lsp 面板（连接状态 + 诊断摘要）；连接管理在引擎（lsp/）
    name: 'lsp',
    description: '语言服务器面板：连接状态与诊断摘要（配置 ~/.spark/lsp.json）',
    kind: 'client',
    group: 'info',
    surface: ['web', 'cli'],
    sessionRequired: false,
    clientAction: 'lsp',
  },
  {
    // 工单 16.2：client 命令——/agents 子代理管理（两层定义清单 + settings 启停）；loader 在引擎（agents/）
    name: 'agents',
    description: '子代理面板：两层预设档清单与启停（配置 ~/.spark/agents 与 .spark/agents）',
    kind: 'client',
    group: 'info',
    surface: ['web', 'cli'],
    sessionRequired: false,
    clientAction: 'agents',
  },
  {
    // 工单 16.4：client 命令——/trust 文件夹信任面板（trusted.json 查看/修改；收紧语义在引擎）
    name: 'trust',
    description: '文件夹信任面板：信任档查看与修改（未信任目录 bash/MCP 自动放行收紧为询问）',
    kind: 'client',
    group: 'info',
    surface: ['web', 'cli'],
    sessionRequired: false,
    clientAction: 'trust',
  },
  {
    // 工单 16.5：client 命令——/extensions 扩展面板（声明式内容包清单 + 启停）
    name: 'extensions',
    description: '扩展面板：声明式内容包清单与启停（配置 ~/.spark/extensions）',
    kind: 'client',
    group: 'info',
    surface: ['web', 'cli'],
    sessionRequired: false,
    clientAction: 'extensions',
  },
  {
    // 工单 16.8：action 命令——/arena 多模型竞答发起（model-a|model-b[,c] <prompt>）；面板/胜者应用走 web
    name: 'arena',
    description: '多模型竞答：/arena model-a|model-b[,model-c] <任务提示词>——并行执行后对比选优',
    kind: 'action',
    group: 'session',
    surface: ['web', 'cli'],
    sessionRequired: true,
  },
]
