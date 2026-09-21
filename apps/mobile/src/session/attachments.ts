/**
 * 附件渲染侧的 URL 装配（工单 19.27 的 attachments 渲染半边）。
 *
 * 附件在协议里只存文件名（`<id>.<ext>`，GET /api/attachments/:file 直读），
 * 移动端 `<Image>` 无法自定义请求头，所以 token 走 `?token=` 查询参数——
 * 与 SSE 同口径（server auth.ts 的 tokenOf 两路都收，日志侧固定脱敏）。
 *
 * 上传半边（uploadAttachment）本单没做，原因写在 composer.tsx 的注释里：
 * 需要相机/相册选图依赖（未装，本机禁止下载依赖）且 sendMessage 的 wire 目前
 * 不带 attachments 字段（protocol HttpTransport + server SendMessageBody 两处待补）。
 */

/** 服务端白名单文件名形状：<32 位 hex>.<ext>——不合形的不拼 URL（防投影里混进脏值） */
const FILENAME_OK = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** 附件缩略图地址；serverUrl 未配置或文件名不合白名单时返回 null（不拼坏 URL） */
export function attachmentUrlOf(serverUrl: string, file: string, token: string): string | null {
  const base = serverUrl.trim().replace(/\/+$/, '')
  if (base === '' || !FILENAME_OK.test(file)) return null
  const t = token.trim()
  return `${base}/api/attachments/${file}${t === '' ? '' : `?token=${encodeURIComponent(t)}`}`
}
