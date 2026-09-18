/**
 * 应用级错误边界（WO-039）：任一页面子树渲染异常时兜底呈现——
 * React 组件级边界在小程序运行时同样生效（Taro 编译到小程序仍是 React 渲染层）；
 * 小程序无 window 对象，兜底只有静态提示（不造"重载"假交互）。
 */
import { Component } from 'react'
import type { PropsWithChildren, ReactNode } from 'react'

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // 如实进控制台（vConsole 可见），不吞不上抛——边界即显式失败呈现
    console.error('[AppErrorBoundary] 页面渲染出错', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return '页面渲染出错，请重启小程序重试'
    }
    return this.props.children
  }
}
