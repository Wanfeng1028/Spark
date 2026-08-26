/**
 * 空态页 /welcome（DESIGN.md §13.A，取代 §7.1「紧凑引导块」形态）：
 * 垂直居中——问候语（15px semibold）+ 居中 Composer 560px + 4 枚建议 chips（§13.B chip 规格）。
 * 发送即新建会话并直发首条消息（chip 点击同路径）；失败闭合——错误进 Composer 提示并回填草稿（§6.2.1 不丢用户输入）。
 */
import { useNavigate } from 'react-router'
import type { SubmitOutcome } from '@spark/protocol'
import { useTransport } from '@/transports/context'
import { Composer } from '@/features/chat/Composer'

const PROMPTS = [
  '总结这个项目的架构',
  '跑一遍测试并修复失败项',
  '把 src 里的 any 清理掉',
  '为当前改动写一条提交信息',
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

  /** 新建会话并直发首条消息（新会话无活动轮，delivery 恒为 now 语义） */
  async function start(text: string, attachments?: string[]): Promise<SubmitOutcome> {
    const dto = await transport.createSession()
    const outcome = await transport.sendMessage(dto.id, text, attachments ? { attachments } : {})
    void navigate(`/session/${dto.id}`)
    return outcome
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
      <h1 className="text-[15px] font-semibold tracking-tight">{greeting()}</h1>
      <div className="w-full max-w-[560px]">
        <Composer
          busy={false}
          waiting={false}
          onSend={(text, _delivery, attachments) => start(text, attachments)}
          onInterrupt={() => undefined}
          onCompact={() => Promise.reject(new Error('会话尚未创建——/compact 需在会话中使用'))}
        />
      </div>
      <ul className="flex max-w-[560px] flex-wrap justify-center gap-2" aria-label="快捷提示词">
        {PROMPTS.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => void start(p)}
              title={`以此开始新会话：${p}`}
              className="flex h-6 items-center rounded-full border border-border px-2.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
