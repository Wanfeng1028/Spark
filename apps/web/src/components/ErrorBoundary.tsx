/**
 * ErrorBoundary（AUD-13）：渲染韧性地基——任何子树抛错不拖垮整壳。
 * class 组件是 React 唯一能捕获渲染期错误的形态（hooks 无此能力）；手写不引
 * react-error-boundary（copy-in 纪律：不引黑盒运行时依赖）。
 * - App 级：路由树外一层（label="应用"）——捕获态给紧凑兜底块 +「重新加载」整页刷新；
 * - 行级：ChatView 每个 item 一层（label="消息"，fallback 一行红字摘要）——
 *   单条消息渲染出错只降级该行，其余行与会话流照常。
 * componentDidCatch 如实进 console.error（中文说明 + error + componentStack），
 * 不吞不上抛——错误边界本身就是显式失败呈现（失败闭合）。
 */
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  label: string
  /** 捕获态替代渲染（缺省 = 紧凑兜底块） */
  fallback?: ReactNode
  /** React 19 类型要求显式声明 children（JSX 子节点走此属性） */
  children?: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.label}] 此区块渲染出错`, error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      if (this.props.fallback !== undefined) return this.props.fallback
      return (
        <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[13px] text-muted-foreground">
          <span>此区块渲染出错</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-border px-1.5 py-0.5 hover:bg-accent hover:text-accent-foreground"
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
