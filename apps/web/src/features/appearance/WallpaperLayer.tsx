/**
 * 壁纸背景层（19.43 批 1；DESIGN §12.9 豁免层）：
 * fixed 铺满视口、-z-10 垫在全部内容之下、pointer-events-none 不挡交互；
 * AppShell 根在开启时以 data-wallpaper 属性让出根底色（theme.css）。
 * 'none' → 不渲染（关闭态与未装该功能逐像素一致）；未知 id → 不渲染（禁假状态）；
 * 静帧主题（批 2）落地前仅有流体一种 kind。
 */
import { FluidCanvas } from './FluidCanvas'
import { wallpaperOf } from './wallpapers'
import { useSettingsStore } from '@/stores/settings'

export function WallpaperLayer() {
  const wallpaper = useSettingsStore((s) => s.wallpaper)
  if (wallpaper === 'none') return null
  const wp = wallpaperOf(wallpaper)
  if (wp === null) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <FluidCanvas wallpaper={wp} className="size-full" />
    </div>
  )
}
