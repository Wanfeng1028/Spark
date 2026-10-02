/**
 * 附件渲染侧的 URL 装配（工单 19.27 的 attachments 渲染半边）。
 *
 * 附件在协议里只存文件名（`<id>.<ext>`，GET /api/attachments/:file 直读），
 * 移动端 `<Image>` 无法自定义请求头，所以 token 走 `?token=` 查询参数——
 * 与 SSE 同口径（server auth.ts 的 tokenOf 两路都收，日志侧固定脱敏）。
 *
 * 上传半边已随 19.27 收口接通（composer"+"钮 → expo-image-picker →
 * uploadAttachment → sendMessage wire 的 attachments 字段；取字节用 picker 的
 * base64 产物，零 expo-file-system 依赖）——上传流程在 SessionScreen，本文件
 * 仍只管渲染侧装配。
 */

/** 服务端白名单文件名形状：<32 位 hex>.<ext>——不合形的不拼 URL（防投影里混进脏值） */
const FILENAME_OK = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** 服务端附件护栏同源上限（12.2a：≤10MB image/*）——超限客户端先拒，不打无效请求 */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

/** base64（expo-image-picker 产物）→ 字节。atob 在 Hermes/web 均可用；只接受合法 base64 */
export function base64ToBytes(b64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) return null
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** 附件缩略图地址；serverUrl 未配置或文件名不合白名单时返回 null（不拼坏 URL） */
export function attachmentUrlOf(serverUrl: string, file: string, token: string): string | null {
  const base = serverUrl.trim().replace(/\/+$/, '')
  if (base === '' || !FILENAME_OK.test(file)) return null
  const t = token.trim()
  return `${base}/api/attachments/${file}${t === '' ? '' : `?token=${encodeURIComponent(t)}`}`
}
