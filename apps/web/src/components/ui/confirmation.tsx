/**
 * Confirmation（AI Elements copy-in：vercel/ai-elements registry `confirmation`，MIT；
 * 源码 https://elements.ai-sdk.dev/api/registry/confirmation.json）。
 * 改造（doc/02 §6.7 + frontend-component SKILL 三件事）：
 *  - 删 "use client"（Vite 非 Next.js）；
 *  - 删 `ai` 依赖：ToolUIPart 五态状态机 → Spark 审批二态（pending / resolved + reply），
 *    ConfirmationRequest=挂起等待、Accepted=once|always 结果、Rejected=reject 结果；
 *  - 结构保留：Context + 条件渲染子组件族（结构思想照搬，语义重映射）。
 */
import { createContext, useContext } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import type { PermissionReply } from '@spark/protocol'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ApprovalState {
  /** 当前审批状态：pending=等待用户回复；resolved=已回复（reply 见字段） */
  status: 'pending' | 'resolved'
  /** resolved 时的回复（once/always/reject）；pending 时为 undefined */
  reply?: PermissionReply | undefined
}

interface ConfirmationContextValue {
  approval: ApprovalState
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null)

const useConfirmation = () => {
  const context = useContext(ConfirmationContext)
  if (!context) {
    throw new Error('Confirmation 组件必须在 <Confirmation> 内使用')
  }
  return context
}

export type ConfirmationProps = ComponentProps<typeof Alert> & {
  approval?: ApprovalState
}

export const Confirmation = ({ className, approval, ...props }: ConfirmationProps) => {
  if (!approval) {
    return null
  }

  return (
    <ConfirmationContext.Provider value={{ approval }}>
      <Alert className={cn('flex flex-col gap-2', className)} {...props} />
    </ConfirmationContext.Provider>
  )
}

export type ConfirmationTitleProps = ComponentProps<'p'>

export const ConfirmationTitle = ({ className, ...props }: ConfirmationTitleProps) => (
  <p className={cn('font-mono text-xs', className)} {...props} />
)

export interface ConfirmationRequestProps {
  children?: ReactNode
}

export const ConfirmationRequest = ({ children }: ConfirmationRequestProps) => {
  const { approval } = useConfirmation()
  if (approval.status !== 'pending') return null
  return <>{children}</>
}

export interface ConfirmationAcceptedProps {
  children?: ReactNode
}

export const ConfirmationAccepted = ({ children }: ConfirmationAcceptedProps) => {
  const { approval } = useConfirmation()
  if (approval.status !== 'resolved' || approval.reply === 'reject') return null
  return <>{children}</>
}

export interface ConfirmationRejectedProps {
  children?: ReactNode
}

export const ConfirmationRejected = ({ children }: ConfirmationRejectedProps) => {
  const { approval } = useConfirmation()
  if (approval.status !== 'resolved' || approval.reply !== 'reject') return null
  return <>{children}</>
}

export type ConfirmationActionsProps = ComponentProps<'div'>

export const ConfirmationActions = ({ className, ...props }: ConfirmationActionsProps) => {
  const { approval } = useConfirmation()
  if (approval.status !== 'pending') return null
  return <div className={cn('flex items-center gap-2', className)} {...props} />
}

export type ConfirmationActionProps = ComponentProps<typeof Button>

export const ConfirmationAction = (props: ConfirmationActionProps) => (
  <Button type="button" {...props} />
)
