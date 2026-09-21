/**
 * 工作台 /session/:id 路由适配器（工单 19.36 起：形态实现拆到 features/chat/SessionSurface.tsx，
 * 本文件只做「路由参数 → 会话页形态」的翻译；规格与状态矩阵见该文件与 doc/02 §6.2.2 / DESIGN §13.A）。
 * 拆出的理由：辅助会话抽屉（V2-09）要在同一屏再挂一个会话页实例，复制一份 SessionPage 等于
 * 造两个会各自漂移的投影壳——参数化后两实例共用同一实现，只按 variant 分形态。
 */
import { useLocation, useParams, useSearchParams } from 'react-router'
import { ids } from '@spark/protocol'
import { SessionSurface } from '@/features/chat/SessionSurface'

export function SessionPage() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const sid = ids.session(sessionId ?? '')
  // 搜索跳转定位（工单 7.13）：/search 命中行带 ?event=<eventId> 直达
  const focusEventId = searchParams.get('event') ?? undefined
  // 欢迎页 chip 发送失败的回填草稿（§6.2.1：不丢用户输入）
  const initialDraft = (location.state as { draft?: string } | null)?.draft ?? ''
  return (
    <SessionSurface
      sessionId={sid}
      {...(focusEventId !== undefined ? { focusEventId } : {})}
      initialDraft={initialDraft}
    />
  )
}
