/**
 * @-mention 展开单测（CK-15）：token 解析（邮箱不误吞/多 token）、文件全文注入、
 * 单文件与总量限额截断、二进制跳过、目录浅树摘要、cwd 外与不存在路径原样保留、
 * 原文保持不变 + 注入块追加在尾部。
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  MENTION_FILE_LIMIT,
  expandMentions,
  defaultMentionIo,
} from '../src/mention.js'

async function fixture(): Promise<{ root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'spark-mention-'))
  await writeFile(join(root, 'a.ts'), 'export const a = 1\n', 'utf8')
  await writeFile(join(root, 'big.txt'), 'x'.repeat(MENTION_FILE_LIMIT + 100), 'utf8')
  await writeFile(join(root, 'bin.dat'), Buffer.from([0x00, 0x01, 0x02]))
  await mkdir(join(root, 'pkg'), { recursive: true })
  await writeFile(join(root, 'pkg', 'index.js'), 'console.log(1)\n', 'utf8')
  return { root }
}

describe('@-mention 展开（CK-15）', () => {
  test('无 @token：原文透传', async () => {
    const { root } = await fixture()
    const r = await expandMentions('普通消息没有 mention', root, defaultMentionIo())
    expect(r.text).toBe('普通消息没有 mention')
    expect(r.injected).toEqual([])
  })

  test('邮箱不误吞（@ 前须行首或空白）；行首 @ 命中', async () => {
    const { root } = await fixture()
    const mail = await expandMentions('联系 a@b.com 即可', root, defaultMentionIo())
    expect(mail.injected).toEqual([])
    const hit = await expandMentions('看下 @a.ts 谢谢', root, defaultMentionIo())
    expect(hit.injected).toEqual(['a.ts'])
  })

  test('文件全文注入：原文保持 + 标注块追加在尾部', async () => {
    const { root } = await fixture()
    const r = await expandMentions('先看 @a.ts', root, defaultMentionIo())
    expect(r.text.startsWith('先看 @a.ts')).toBe(true)
    expect(r.text).toContain('[@a.ts]')
    expect(r.text).toContain('export const a = 1')
  })

  test('单文件超限：截断 + 标注（不静默剪）', async () => {
    const { root } = await fixture()
    const r = await expandMentions('看 @big.txt', root, defaultMentionIo())
    expect(r.injected).toEqual(['big.txt'])
    expect(r.text).toContain('[@mention 截断')
  })

  test('二进制文件跳过（token 原样保留）', async () => {
    const { root } = await fixture()
    const r = await expandMentions('看 @bin.dat', root, defaultMentionIo())
    expect(r.injected).toEqual([])
    expect(r.text).toBe('看 @bin.dat')
  })

  test('目录：浅树摘要（含子目录斜杠标记）', async () => {
    const { root } = await fixture()
    const r = await expandMentions('看 @pkg 结构', root, defaultMentionIo())
    expect(r.injected).toEqual(['pkg'])
    expect(r.text).toContain('目录树')
    expect(r.text).toContain('index.js')
  })

  test('cwd 外路径与不存在路径：原样保留（硬边界/禁假状态）', async () => {
    const { root } = await fixture()
    const r = await expandMentions('看 @../secrets.txt 和 @nope.ts', root, defaultMentionIo())
    expect(r.injected).toEqual([])
    expect(r.text).toBe('看 @../secrets.txt 和 @nope.ts')
  })

  test('多 token 依序展开', async () => {
    const { root } = await fixture()
    const r = await expandMentions('@a.ts 和 @pkg', root, defaultMentionIo())
    expect(r.injected).toEqual(['a.ts', 'pkg'])
  })
})
