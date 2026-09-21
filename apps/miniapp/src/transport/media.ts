/**
 * 附件的平台被迫部分（工单 19.29）：微信选图 + 本地临时文件读字节。
 * 只做 Taro API 适配，零业务判断——链路的可测部分在 session/attachments.ts
 * （那边不收 Taro 依赖，vitest node 环境可整条跑）。
 */
import Taro from '@tarojs/taro'
import type { PickedImage } from '../session/attachments'

/** 平台回调错误收口：Taro/微信抛的是 CallbackResult（非 Error 实例），统一成 Error 上抛 */
function asError(err: unknown): Error {
  if (err instanceof Error) return err
  return new Error(typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err))
}

/** 用户主动取消（微信 errMsg 形如 `chooseImage:fail cancel`）——不是错误 */
function isUserCancel(err: unknown): boolean {
  return /cancel/i.test(asError(err).message)
}

/**
 * 选图（`Taro.chooseImage`，与 2.20.2 分块门槛同档可用）。
 * **取消返回空选集**（正常结局，调用方据此静默）；其余失败原样上抛交调用方
 * 经 errorMessageOf 上屏——吞掉失败会让"点了没反应"变成不可诊断的状态。
 */
export async function pickImages(count = 1): Promise<PickedImage[]> {
  let res: Taro.chooseImage.SuccessCallbackResult
  try {
    res = await Taro.chooseImage({
      count,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
    })
  } catch (err: unknown) {
    if (isUserCancel(err)) return []
    throw asError(err)
  }
  return res.tempFilePaths.map((path, i) => {
    const file = res.tempFiles[i]
    const base = path.split('/').pop() ?? `image-${i + 1}.png`
    return {
      path,
      name: file?.path.split('/').pop() ?? base,
      ...(file?.type !== undefined ? { mime: file.type } : {}),
    }
  })
}

/** base64 → Uint8Array（Taro 只提供到 ArrayBuffer，此处收口一次拷贝） */
function bytesFromBase64(base64: string): Uint8Array {
  const buf = Taro.base64ToArrayBuffer(base64)
  return new Uint8Array(buf)
}

/**
 * 读本地临时文件为字节。小程序侧只有 FileSystemManager（同步版免回调嵌套）；
 * **H5 形态无此 API**——如实抛人话错误而不是假装能读（dev:h5 只用于界面联调）。
 */
export function readFileBytes(filePath: string): Promise<Uint8Array> {
  if (typeof Taro.getFileSystemManager !== 'function') {
    return Promise.reject(new Error('当前运行形态不支持读取本地图片：附件入口仅小程序形态可用'))
  }
  try {
    const fsm = Taro.getFileSystemManager()
    const data = fsm.readFileSync(filePath, 'base64')
    if (typeof data !== 'string') {
      return Promise.reject(new Error('读取图片失败：文件系统未返回 base64 内容'))
    }
    return Promise.resolve(bytesFromBase64(data))
  } catch (err: unknown) {
    // 平台 API 抛 CallbackResult——asError 收口后交调用方上屏，不吞
    return Promise.reject(asError(err))
  }
}
