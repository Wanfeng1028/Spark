import { useParams } from 'react-router'

/**
 * 工作台 /session/:id（doc/02 §6.2.2）：ChatView/Composer/审批流全部是阶段二；
 * 阶段一仅占位（工单 1.4 后此页接入 MockTransport 驱动的最小会话流）。
 */
export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return (
    <div className="flex h-full items-center justify-center">
      <p className="font-mono text-xs text-muted-foreground">
        会话 {sessionId ?? ''} · 视图阶段二实现
      </p>
    </div>
  )
}
