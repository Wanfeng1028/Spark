/**
 * 附件缩略地址单测（工单 19.27）：拼装口径与脏值闸门。
 * token 走 ?token= ——`<Image>` 发不了自定义头，这与 SSE 同口径（server auth.ts 两路都收）。
 */
import { attachmentUrlOf } from '../src/session/attachments'

describe('attachmentUrlOf', () => {
  it('环回无 token：不带查询参数', () => {
    expect(attachmentUrlOf('http://127.0.0.1:4318', 'a1b2.png', '')).toBe(
      'http://127.0.0.1:4318/api/attachments/a1b2.png',
    )
  })

  it('非环回带 token：与 SSE 同口径经查询参数鉴权', () => {
    expect(attachmentUrlOf('http://192.168.1.10:4318/', 'f3.webp', 'tk/+=')).toBe(
      'http://192.168.1.10:4318/api/attachments/f3.webp?token=tk%2F%2B%3D',
    )
  })

  it('未配置服务器 / 脏文件名一律不出地址（不拼坏 URL，渲染侧退成文字行）', () => {
    expect(attachmentUrlOf('  ', 'a.png', '')).toBeNull()
    expect(attachmentUrlOf('http://h:1', '../etc/passwd', '')).toBeNull()
    expect(attachmentUrlOf('http://h:1', '', '')).toBeNull()
    expect(attachmentUrlOf('http://h:1', 'a b.png', '')).toBeNull()
  })
})
