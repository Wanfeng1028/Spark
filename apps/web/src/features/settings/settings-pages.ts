/**
 * 设置中心信息架构（DESIGN §13.D 三组 15 页 + 用户指令"Agent 能力组先迁入权限规则页"）：
 * 每页声明 group/id/title/description 与落地状态——ready 页在 SettingsPage 路由
 * 组件内映射真组件，其余统一渲染占位页（标注 desktop 特化/后续工单）。
 * 权限规则页为 §13.D 15 页之外的本阶段迁入项（原 SettingsDialog RulesSection）。
 */

export type SettingsPageStatus = 'ready' | 'placeholder'

export interface SettingsPageDef {
  /** 路由段（/settings/:page） */
  id: string
  title: string
  description: string
  status: SettingsPageStatus
  /** 占位原因（badge 文案；ready 页为空） */
  placeholderReason?: 'desktop 特化' | '后续工单'
}

export interface SettingsGroupDef {
  label: string
  pages: SettingsPageDef[]
}

export const SETTINGS_GROUPS: readonly SettingsGroupDef[] = [
  {
    label: '基础设置',
    pages: [
      {
        id: 'general',
        title: '常规',
        description: '交互行为、语言、网络与通知',
        status: 'ready',
      },
      {
        id: 'appearance',
        title: '外观',
        description: '主题、字号与代码显示',
        status: 'ready',
      },
      {
        id: 'models',
        title: '模型设置',
        description: '供应商与模型管理（完整管理为工单 6.5）',
        status: 'ready',
      },
      {
        id: 'browser',
        title: '浏览器',
        description: '浏览器工具的数据与引擎设置',
        status: 'placeholder',
        placeholderReason: '后续工单',
      },
      {
        id: 'computer',
        title: '电脑控制',
        description: '系统级控制开关与审批档位',
        status: 'placeholder',
        placeholderReason: '后续工单',
      },
    ],
  },
  {
    label: 'Agent 能力',
    pages: [
      {
        id: 'permission-rules',
        title: '权限规则',
        description: '用户级审批规则（跨会话生效）',
        status: 'ready',
      },
      {
        id: 'memory',
        title: '记忆',
        description: '长期记忆列表与删除（保存走会话内 memory.save 工具）',
        status: 'ready',
      },
      {
        id: 'subagents',
        title: '子智能体',
        description: '自定义与内置子智能体',
        status: 'placeholder',
        placeholderReason: '后续工单',
      },
      {
        id: 'plugins',
        title: '插件',
        description: '已安装插件与市场',
        status: 'placeholder',
        placeholderReason: '后续工单',
      },
      {
        id: 'mcp',
        title: 'MCP 服务器',
        description: 'MCP 连接状态与工具数（只读；启停编辑归 v2）',
        status: 'ready',
      },
      {
        id: 'skills',
        title: '技能',
        description: '已加载技能清单（只读；管理归 v2）',
        status: 'ready',
      },
      {
        id: 'commands',
        title: '命令',
        description: '自定义命令管理',
        status: 'placeholder',
        placeholderReason: '后续工单',
      },
      {
        id: 'hooks',
        title: '钩子',
        description: '生命周期事件钩子',
        status: 'placeholder',
        placeholderReason: '后续工单',
      },
    ],
  },
  {
    label: '数据与统计',
    pages: [
      {
        id: 'index',
        title: '索引库',
        description: '会话索引数据库',
        status: 'placeholder',
        placeholderReason: '后续工单',
      },
      {
        id: 'usage',
        title: '使用统计',
        description: '成本累计与上限（趋势看板归 v2）',
        status: 'ready',
      },
      {
        id: 'onboarding',
        title: '引导',
        description: '重新打开新手引导',
        status: 'placeholder',
        placeholderReason: '后续工单',
      },
    ],
  },
]

const ALL_PAGES = SETTINGS_GROUPS.flatMap((g) => g.pages)

export function findSettingsPage(id: string | undefined): SettingsPageDef | undefined {
  return ALL_PAGES.find((p) => p.id === id)
}
