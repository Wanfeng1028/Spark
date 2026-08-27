/**
 * 常规页（DESIGN §13.D① 按 Spark 落点裁剪）：
 * 交互行为=提交三模式默认档（落地，Composer 初始段位）；
 * 其余字段分卡占位——语言/网络为平台缺口项（后续工单），
 * 终端/托盘/更新为 desktop 特化，会话域开关归 §13.H 后续工单。
 */
import { useMemo } from 'react'
import type { Delivery } from '@spark/protocol'
import { useSettingsStore } from '@/stores/settings'
import { Select } from '@/components/ui/select'
import { SettingRow, SettingGroupCard } from './SettingRow'

const DELIVERY_OPTIONS: { value: Delivery; label: string }[] = [
  { value: 'now', label: '立即' },
  { value: 'steer', label: '插话' },
  { value: 'queue', label: '排队' },
]

export function GeneralSettingsPage() {
  const defaultDelivery = useSettingsStore((s) => s.defaultDelivery)
  const setDefaultDelivery = useSettingsStore((s) => s.setDefaultDelivery)
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
        <SettingRow title="界面语言" description="多语言界面（i18n 框架未落地）" placeholderBadge="后续工单" />
        <SettingRow
          title="显示思考过程"
          description="关闭时每轮仅展示第一次思考（会话域 §13.H 开关）"
          placeholderBadge="后续工单"
        />
        <SettingRow title="显示待办" description="Todo 工具卡片显隐（会话域 §13.H）" placeholderBadge="后续工单" />
        <SettingRow
          title="分组探索工具 / 终端命令 / 文件更改"
          description="连续同类工具聚合为分组卡（会话域 §13.H）"
          placeholderBadge="后续工单"
        />
        <SettingRow
          title="完整保留模型 I/O"
          description="关闭自动压缩/限长/清理（与 Compaction 策略互斥）"
          placeholderBadge="后续工单"
        />
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow
          title="HTTP 代理"
          description="模型/MCP/命令工具出口流量经此代理（引擎缺口项）"
          placeholderBadge="后续工单"
        />
        <SettingRow title="不使用代理的地址" description="逗号分隔规则，匹配主机直连" placeholderBadge="后续工单" />
        <SettingRow
          title="自定义证书"
          description="PEM 路径注入模型/MCP/命令工具（NODE_EXTRA_CA_CERTS）"
          placeholderBadge="后续工单"
        />
      </SettingGroupCard>

      <SettingGroupCard>
        <SettingRow
          title="bash 沙箱"
          description="wrapper 前缀隔离（spark.json engine.bashSandbox）——读写配置需引擎 API（工单分歧待决策）"
          placeholderBadge="后续工单"
        />
        <SettingRow title="数据存储路径" description="会话与配置存储目录（~/.spark/）" placeholderBadge="后续工单" />
        <SettingRow
          title="自动归档旧任务"
          description="已完成且超期会话自动归档（需会话归档后端支持）"
          placeholderBadge="后续工单"
        />
        <SettingRow title="任务通知" description="完成/失败/需确认时系统通知" placeholderBadge="后续工单" />
        <SettingRow title="通知声音" description="通知提示音" placeholderBadge="后续工单" />
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
