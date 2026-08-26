/**
 * 组件测试共享的 jsdom 缺失 API stub（doc/06 §1 L2）：
 * - matchMedia：settings-store 模块加载即调用（theme=system 档）；
 * - requestAnimationFrame：Composer fill/菜单确认回调依赖。
 * 仅补齐最小行为，不做真实现。
 */

interface MediaQueryListLike {
  matches: boolean
  media: string
  onchange: null
  addEventListener(): void
  removeEventListener(): void
  addListener(): void
  removeListener(): void
  dispatchEvent(): boolean
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (media: string): MediaQueryListLike => ({
    matches: false,
    media,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false
    },
  })
}

if (typeof window !== 'undefined' && typeof window.requestAnimationFrame !== 'function') {
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    return setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
  window.cancelAnimationFrame = (id: number) => {
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
  }
}
