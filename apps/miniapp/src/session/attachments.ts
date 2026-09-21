/**
 * 附件通道（工单 19.29 小程序补齐批）：选图 → mime 白名单 → 读字节 → 上传 →
 * 待发列表的**编排与判定**（零 Taro 依赖，平台 API 由 transport/media.ts 注入）。
 *
 * 与 web 端 Composer 的分工差异：web 有 File.arrayBuffer()，小程序只有
 * 临时文件路径 + FileSystemManager——故读字节被抽成注入点，本模块可整条链单测。
 * 上传走 `Transport.uploadAttachment`（工单 12.2a 既有方法，零新增协议面）。
 *
 * **发送通道的如实状态**：上传成功即落 `~/.spark/attachments/`，但
 * `POST /api/sessions/:id/messages` 的 body（server `SendMessageBody` strictObject）
 * 目前不收 attachments 字段，引擎 `SessionHandle.send` 亦无该形参（runtime.submit
 * 已支持、projector 已会读图转 base64）——端上把附件名塞进 body 只会换 400。
 * 因此本端与 HttpTransport 同口径：**不把 attachments 写进发送体**，待发附件
 * 保留在输入条上方并如实提示未随消息发出（整改清单见 apps/miniapp/README.md）。
 */
import type { AttachmentDto, SessionId } from '@spark/protocol'
import { errorMessageOf } from '@spark/protocol'

/** 选图结果（平台无关形态：路径 + 展示名 + 部分平台自带的 mime） */
export interface PickedImage {
  path: string
  name: string
  mime?: string
}

/** 上传通道最小面（Transport.uploadAttachment 同签名——页面传 MiniRestClient 即可） */
export interface AttachmentUploadChannel {
  uploadAttachment(
    sessionId: SessionId,
    file: { name: string; mime: string; bytes: Uint8Array },
  ): Promise<AttachmentDto>
}

/** 服务端 attachments 白名单（server MIME_EXT 同源）：扩展名 → mime；认不出的拒传 */
const EXT_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** 平台自带 type 的准入集（与 EXT_MIME 值同源——两处白名单不得各写一份） */
const MIME_ALLOWED: ReadonlySet<string> = new Set(Object.values(EXT_MIME))

/**
 * 路径扩展名 → mime。小程序 chooseImage 的临时文件名形如 `wxfile://tmp_xxx.png`
 * /`http://tmp/xxx.jpeg`，只有末段扩展名可靠；白名单外（heic/bmp）返回 null 拒传
 * ——服务端会 400，本地拒在上传前，省一次往返也给得出人话原因。
 */
export function mimeOfPath(path: string): string | null {
  const clean = path.split('?')[0] ?? path
  const base = clean.split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_MIME[base.slice(dot + 1).toLowerCase()] ?? null
}

/** 生效 mime：平台自带 type（H5 的 File.type）优先且须落在白名单内，落回扩展名判定 */
export function effectiveMimeOf(picked: PickedImage): string | null {
  const fromPick = picked.mime
  if (fromPick !== undefined && MIME_ALLOWED.has(fromPick)) return fromPick
  return mimeOfPath(picked.path)
}

/**
 * 附件取图 URL（GET /api/attachments/:file）：`<Image>` 组件带不上 Authorization 头，
 * 非环回鉴权走 ?token= 查询串（工单 9.1 双口径；服务端 redactTokenQuery 保证不进日志）。
 */
export function attachmentUrlOf(baseUrl: string, file: string, token: string): string {
  const base = `${baseUrl.replace(/\/+$/, '')}/api/attachments/${encodeURIComponent(file)}`
  return token === '' ? base : `${base}?token=${encodeURIComponent(token)}`
}

/** 待发集合去重（同图重复选不重复占位；与 web Composer 的 attachments 语义一致） */
export function mergeUploaded(
  current: readonly AttachmentDto[],
  dto: AttachmentDto,
): AttachmentDto[] {
  return current.some((a) => a.file === dto.file) ? [...current] : [...current, dto]
}

export function removePending(
  current: readonly AttachmentDto[],
  file: string,
): AttachmentDto[] {
  return current.filter((a) => a.file !== file)
}

/** 发送体携带的附件名列表（AttachmentDto.file = `<id>.<ext>`，事件里存的就是这个值） */
export function filesOf(current: readonly AttachmentDto[]): string[] {
  return current.map((a) => a.file)
}

export interface UploadOutcome {
  /** 上传成功的附件（调用方并入待发列表） */
  uploaded: AttachmentDto[]
  /** 逐张失败的人话文案（不吞异常也不中断后续张） */
  errors: string[]
}

/**
 * 一批选图 → 读字节 → 上传。单张失败记一条人话并继续（"选 3 张坏 1 张"不得
 * 连坐丢另外两张）；无一张成功时调用方仍能从 errors 得到出口——不抛整批异常，
 * 因为"部分成功"是这里的正常结果，不是错误。
 */
export async function uploadPickedImages(opts: {
  sessionId: SessionId
  picked: readonly PickedImage[]
  read: (path: string) => Promise<Uint8Array>
  channel: AttachmentUploadChannel
}): Promise<UploadOutcome> {
  const uploaded: AttachmentDto[] = []
  const errors: string[] = []
  for (const item of opts.picked) {
    const mime = effectiveMimeOf(item)
    if (mime === null) {
      errors.push(`不支持的图片格式：${item.name}（仅 png/jpeg/gif/webp）`)
      continue
    }
    try {
      const bytes = await opts.read(item.path)
      const dto = await opts.channel.uploadAttachment(opts.sessionId, {
        name: item.name,
        mime,
        bytes,
      })
      uploaded.push(dto)
    } catch (err: unknown) {
      errors.push(errorMessageOf(err))
    }
  }
  return { uploaded, errors }
}
