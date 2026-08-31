/**
 * 空态页 /welcome（DESIGN.md §13.A v2.5，取代 §7.1「紧凑引导块」形态）：
 * 垂直居中——问候语（≈28px semibold 大字，工单 10.1 修订）+ 居中 Composer 560px + 4 枚建议
 * chips（§13.B chip 规格）。chip「点击即填入输入框」（§13.E）——经 ComposerHandle.fill
 * 聚焦填词，用户确认后再发送；发送（Enter/发送钮）即新建会话并直发首条消息；
 * 失败闭合——错误进 Composer 提示并回填草稿（§6.2.1 不丢用户输入）。
 * 权限档钮（工单 10.5⑥）：欢迎页选档为真实状态——建会话后即落档（setPermissionPreset）。
 */
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Blocks, Eraser, GitCommitHorizontal, PlayCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PermissionPreset, SubmitOutcome } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { Composer, type ComposerHandle } from '@/features/chat/Composer'
import { clientActionOf } from '@/features/chat/client-commands'
import { useCommands } from '@/hooks/useCommands'
import { useUiStore } from '@/stores/ui'

interface PromptChip {
  icon: LucideIcon
  text: string
}

const PROMPTS: readonly PromptChip[] = [
  { icon: Blocks, text: '总结这个项目的架构' },
  { icon: PlayCircle, text: '跑一遍测试并修复失败项' },
  { icon: Eraser, text: '把 src 里的 any 清理掉' },
  { icon: GitCommitHorizontal, text: '为当前改动写一条提交信息' },
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了。'
  if (h < 12) return '早上好。'
  if (h < 18) return '下午好。'
  return '晚上好。'
}

export function WelcomePage() {
  const navigate = useNavigate()
  const { transport } = useTransport()
  const { commands } = useCommands()
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const composerRef = useRef<ComposerHandle>(null)
  // 权限档位（工单 10.5⑥）：欢迎页可选档，建会话后落档——真实状态非展示摆设
  const [preset, setPreset] = useState<PermissionPreset>('confirm-each')

  /** 新建会话并直发首条消息（新会话无活动轮，delivery 恒为 now 语义）；选档先落档再发送 */
  async function start(text: string, attachments?: string[]): Promise<SubmitOutcome> {
    const dto = await transport.createSession()
    await transport.setPermissionPreset(dto.id, preset)
    const outcome = await transport.sendMessage(dto.id, text, attachments ? { attachments } : {})
    void navigate(`/session/${dto.id}`)
    return outcome
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
      <h1 className="text-[28px] font-semibold tracking-tight">{greeting()}</h1>
      <div className="w-full max-w-[560px]">
        <Composer
          ref={composerRef}
          busy={false}
          waiting={false}
          permission={{
            preset,
            onChange: (p) => {
              setPreset(p)
              return Promise.resolve()
            },
          }}
          onSend={(text, _delivery, attachments) => start(text, attachments)}
          onInterrupt={() => undefined}
          {...(commands !== null ? { commands } : {})}
          onCommand={(name) => {
            // 欢迎页无会话上下文：client 命令本地执行（导航/面板）；
            // action/prompt（compact/自定义）需会话——如实拒绝
            const client = clientActionOf(name)
            if (client === undefined) {
              return Promise.reject(new Error(`会话尚未创建——/${name} 需在会话中使用`))
            }
            if (client.kind === 'palette') setPaletteOpen(true)
            else void navigate(client.path)
            return undefined
          }}
        />
      </div>
      <ul className="flex max-w-[560px] flex-wrap justify-center gap-2" aria-label="快捷提示词">
        {PROMPTS.map((p) => (
          <li key={p.text}>
            <button
              type="button"
              onClick={() => composerRef.current?.fill(p.text)}
              title={`填入输入框：${p.text}`}
              className="flex h-6 items-center gap-1 rounded-full border border-border px-2.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <p.icon className="size-3" />
              {p.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
