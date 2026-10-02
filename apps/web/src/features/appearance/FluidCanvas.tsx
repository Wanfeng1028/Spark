/**
 * 流体壁纸画布（19.43 批 1）：createFluid 建/销毁 + 调色板跟随 props。
 * 渲染器内部自持 ResizeObserver / 指针监听 / RAF / visibilitychange——本组件只管
 * 生命周期与"WebGL2 不可用"的如实上报（failed → 渲染空，调用方按无壁纸处理，禁假状态；
 * 静帧兜底随批 2 素材落地）。
 */
import { useEffect, useRef, useState } from 'react'
import { createFluid } from './fluid-renderer'
import type { FluidHandle } from './fluid-renderer'
import type { FluidWallpaper } from './wallpapers'

export function FluidCanvas({
  wallpaper,
  className,
}: {
  wallpaper: FluidWallpaper
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<FluidHandle | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const renderer = createFluid(canvas)
    if (renderer === null) {
      setFailed(true)
      return
    }
    rendererRef.current = renderer
    return () => {
      renderer.stop()
      rendererRef.current = null
    }
    // 只随挂载建一次；初始与后续主题切换都走下方 setPalette effect（插值淡入），不重建 GL 资源
  }, [])

  useEffect(() => {
    if (failed) return
    rendererRef.current?.setPalette(wallpaper)
  }, [wallpaper, failed])

  if (failed) return null
  return <canvas ref={canvasRef} className={className} aria-hidden />
}
