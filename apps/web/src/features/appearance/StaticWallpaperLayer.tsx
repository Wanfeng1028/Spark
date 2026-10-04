/**
 * 静帧壁纸层（19.43 批 2）：gallery 静帧 + crossfade（§12.9 豁免层——彩色只进
 * 该 img 像素，承载 UI 黑白中性不变）。全保真渲染不模糊（上游 .wash blur(34px)
 * 的路子不抄——小图拉伸发虚，取证报告 §4 ③ 不得照抄清单）。
 * crossfade：双 img 叠加淡入淡出（prefers-reduced-motion → 瞬时切换）。
 */
import { useEffect, useRef, useState } from 'react'

export interface StaticWallpaperLayerProps {
  src: string
}

export function StaticWallpaperLayer({ src }: StaticWallpaperLayerProps): React.JSX.Element {
  const [current, setCurrent] = useState(src)
  const [previous, setPrevious] = useState<string | null>(null)
  const [fading, setFading] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (fadeTimer.current !== null) clearTimeout(fadeTimer.current)
    }
  }, [])

  // src 变化 → 旧图垫底、新图淡入（crossfade）；reduced-motion → 瞬时切换
  useEffect(() => {
    if (src === current) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setCurrent(src)
      setPrevious(null)
      return
    }
    setPrevious(current)
    setCurrent(src)
    setFading(true)
    if (fadeTimer.current !== null) clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => {
      fadeTimer.current = null
      setPrevious(null)
      setFading(false)
    }, 600)
  }, [src, current])

  return (
    <div className="relative size-full overflow-hidden">
      {previous !== null && (
        <img
          aria-hidden
          src={previous}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <img
        aria-hidden
        src={current}
        alt=""
        className={
          'absolute inset-0 size-full object-cover transition-opacity duration-500' +
          (previous !== null && fading ? ' opacity-0' : ' opacity-100')
        }
      />
    </div>
  )
}
