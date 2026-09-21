/**
 * 托盘图标的位图生成（阶段十九工单 19.30）：仓库里没有位图资产，也不在本机下载/生成图片
 * （AGENTS §2.3a），故按几何画一枚最简标记交给 `nativeImage.createFromBitmap`——
 * 1px 黑色外环 + 白心，深色与浅色托盘底都能看见。macOS 侧另置 templateImage，
 * 由系统按菜单栏配色单色渲染。品牌图标替换是真机走查项（留用户）。
 */

/** 托盘图标边长（Windows 托盘 16px；macOS 菜单栏会自行缩放） */
export const TRAY_ICON_PX = 16

/**
 * BGRA 位图（长度 size*size*4）：圆外透明、外环不透明黑、其余不透明白。
 * 逐像素算距离而不是预置常量表——尺寸可变（走查要换 32px 时只改 TRAY_ICON_PX）。
 */
export function buildTrayBitmap(size: number = TRAY_ICON_PX): Buffer {
  const px = Buffer.alloc(size * size * 4)
  const center = (size - 1) / 2
  const rOuter = size / 2 - 0.5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - center, y - center)
      if (d > rOuter) continue // 圆外保持透明（Buffer.alloc 已置零）
      const ring = d > rOuter - 1.5
      const i = (y * size + x) * 4
      px[i] = ring ? 0 : 255 // B
      px[i + 1] = ring ? 0 : 255 // G
      px[i + 2] = ring ? 0 : 255 // R
      px[i + 3] = 255 // A
    }
  }
  return px
}
