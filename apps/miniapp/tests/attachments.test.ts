/**
 * 附件通道单测（工单 19.29）：mime 白名单、取图 URL（?token= 双口径）、
 * 待发集合运算、以及"选图→读字节→上传"编排的部分成功语义。
 * 零 Taro 依赖（平台部分在 transport/media.ts，注入进来）——本文件跑得动 node 环境。
 */
import { describe, expect, it } from 'vitest'
import type { AttachmentDto, SessionId } from '@spark/protocol'
import { ids } from '@spark/protocol'
import type { AttachmentUploadChannel, PickedImage } from '../src/session/attachments'
import {
  attachmentUrlOf,
  effectiveMimeOf,
  filesOf,
  mergeUploaded,
  mimeOfPath,
  removePending,
  uploadPickedImages,
} from '../src/session/attachments'

const SID: SessionId = ids.session('ses_mini_attach_1')

function dto(file: string, name = file): AttachmentDto {
  return { id: file.split('.')[0] ?? file, file, mime: 'image/png', size: 10, name }
}

describe('mimeOfPath / effectiveMimeOf（服务端白名单前置判定）', () => {
  it('白名单扩展名 → mime，大小写与查询串容忍', () => {
    expect(mimeOfPath('wxfile://tmp_1.PNG')).toBe('image/png')
    expect(mimeOfPath('http://tmp/a.jpeg?x=1')).toBe('image/jpeg')
    expect(mimeOfPath('/tmp/photo.jpg')).toBe('image/jpeg')
    expect(mimeOfPath('/tmp/p.gif')).toBe('image/gif')
    expect(mimeOfPath('/tmp/p.webp')).toBe('image/webp')
  })

  it('白名单外（heic/无扩展名）返回 null——拒在上传前，不撞服务端 400', () => {
    expect(mimeOfPath('/tmp/IMG_001.heic')).toBeNull()
    expect(mimeOfPath('wxfile://tmp_nodot')).toBeNull()
  })

  it('平台自带 type 只在白名单内才采信，否则回落扩展名', () => {
    expect(effectiveMimeOf({ path: '/tmp/a.bin', name: 'a.bin', mime: 'image/png' })).toBe('image/png')
    expect(effectiveMimeOf({ path: '/tmp/a.png', name: 'a.png', mime: 'audio/mpeg' })).toBe('image/png')
    expect(effectiveMimeOf({ path: '/tmp/a.mov', name: 'a.mov', mime: 'video/quicktime' })).toBeNull()
  })
})

describe('attachmentUrlOf（缩略取图：<Image> 带不上 Authorization 头）', () => {
  it('无 token 不带查询串；有 token 走 ?token=（9.1 双口径，服务端日志脱敏）', () => {
    expect(attachmentUrlOf('http://127.0.0.1:4318', 'abc.png', '')).toBe(
      'http://127.0.0.1:4318/api/attachments/abc.png',
    )
    expect(attachmentUrlOf('http://192.168.1.5:4318/', 'a b.png', 'tk/1')).toBe(
      'http://192.168.1.5:4318/api/attachments/a%20b.png?token=tk%2F1',
    )
  })
})

describe('待发集合运算（同图不重复占位、可逐张撤）', () => {
  it('mergeUploaded 按 file 去重', () => {
    const once = mergeUploaded([], dto('a.png'))
    const twice = mergeUploaded(once, dto('a.png'))
    expect(twice).toHaveLength(1)
    expect(mergeUploaded(twice, dto('b.png')).map((a) => a.file)).toEqual(['a.png', 'b.png'])
  })

  it('removePending / filesOf（发送体承载的是 file 名）', () => {
    const list = [dto('a.png'), dto('b.png')]
    expect(removePending(list, 'a.png').map((a) => a.file)).toEqual(['b.png'])
    expect(filesOf(list)).toEqual(['a.png', 'b.png'])
  })
})

describe('uploadPickedImages（编排：部分成功不连坐）', () => {
  const picked = (path: string, name = path.split('/').pop() ?? path): PickedImage => ({ path, name })

  /** 上传替身：记录调用并按脚本返回 DTO / 抛错（断言靠 records，不靠 vi.fn 泛型） */
  function fakeChannel(
    impl: (file: { name: string; mime: string; bytes: Uint8Array }) => Promise<AttachmentDto>,
  ): { channel: { uploadAttachment: AttachmentUploadChannel['uploadAttachment'] }; calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      channel: {
        uploadAttachment: async (_sid, file) => {
          calls.push(file.name)
          return impl(file)
        },
      },
    }
  }

  it('成功项带 name/mime/bytes 进上传口，回传 DTO 收进 uploaded', async () => {
    let lastBytes: Uint8Array | undefined
    const { channel, calls } = fakeChannel(async (file) => {
      lastBytes = file.bytes
      return dto(file.name)
    })
    const out = await uploadPickedImages({
      sessionId: SID,
      picked: [picked('/tmp/a.png')],
      read: async () => new Uint8Array([1, 2, 3]),
      channel,
    })
    expect(out.errors).toEqual([])
    expect(out.uploaded.map((d) => d.file)).toEqual(['a.png'])
    expect(calls).toEqual(['a.png'])
    expect(lastBytes).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('白名单外拒传：不读文件、不上传，给人话原因', async () => {
    let readCalls = 0
    const { channel, calls } = fakeChannel(async (file) => dto(file.name))
    const out = await uploadPickedImages({
      sessionId: SID,
      picked: [picked('/tmp/x.heic')],
      read: async () => {
        readCalls += 1
        return new Uint8Array()
      },
      channel,
    })
    expect(out.uploaded).toEqual([])
    expect(out.errors[0]).toContain('不支持的图片格式')
    expect(readCalls).toBe(0)
    expect(calls).toEqual([])
  })

  it('单张失败不连坐：坏的那张出人话、其余照常上传（不整批抛、不假成功）', async () => {
    const { channel, calls } = fakeChannel(async (file) => {
      if (file.name === 'bad.png') throw new Error('E_ATTACHMENT_TOO_LARGE: 图片超过 10MB 上限')
      return dto(file.name)
    })
    const out = await uploadPickedImages({
      sessionId: SID,
      picked: [picked('/tmp/bad.png'), picked('/tmp/good.png')],
      read: async () => new Uint8Array([9]),
      channel,
    })
    expect(out.uploaded.map((d) => d.file)).toEqual(['good.png'])
    expect(out.errors).toHaveLength(1)
    expect(out.errors[0]).toContain('10MB')
    expect(calls).toEqual(['bad.png', 'good.png'])
  })
})
