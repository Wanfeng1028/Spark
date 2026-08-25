/**
 * SessionIndex 单测（doc/02 §5.10 / 工单 4.8）：node:sqlite 单表索引——
 * upsert 覆盖、touch 仅前进水位、LIKE 转义搜索、排序稳定性；JSONL 权威的
 * 降级与重建语义在 engine.test.ts 集成验证。
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ids } from '@spark/protocol'
import { SessionIndex } from '../src/session/index.js'
import type { SessionIndexRow } from '../src/session/index.js'

const SID = ids.session('ses_indextest000000000000000')
const SID2 = ids.session('ses_indextest200000000000000')

function row(over: Partial<SessionIndexRow> = {}): SessionIndexRow {
  return {
    id: SID,
    title: '重构重试常量',
    model: 'deepseek/deepseek-chat',
    cwd: '/tmp/proj',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    lastSeq: 5,
    ...over,
  }
}

let dirs: string[] = []

afterEach(() => {
  dirs = [] // 目录留给 OS 清理（与仓库既有测试一致）；仅断言引用释放
})

async function makeIndex(): Promise<{ index: SessionIndex; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'spark-idx-'))
  dirs.push(dir)
  const path = join(dir, 'index.db')
  return { index: new SessionIndex(path), path }
}

describe('SessionIndex（工单 4.8）', () => {
  test('upsert 插入与整行覆盖；updatedAt 倒序稳定（id 倒序破并列）', async () => {
    const { index } = await makeIndex()
    index.upsert(row())
    index.upsert(row({ id: SID2, title: '写周报', updatedAt: 1700000001000 }))
    // 同键再写 = 整行覆盖（rollback 截断后重载的路径）
    index.upsert(row({ lastSeq: 99 }))

    const list = index.list()
    expect(list.map((r) => r.id)).toEqual([SID2, SID])
    expect(list[1]?.lastSeq).toBe(99)
  })

  test('touch 仅前进水位（旧 seq 不回写）；setTitle 更新标题', async () => {
    const { index } = await makeIndex()
    index.upsert(row())
    index.touch(SID, 3, 1700000000500) // 旧事件迟到：不回退
    expect(index.list()[0]?.lastSeq).toBe(5)
    index.touch(SID, 7, 1700000002000)
    expect(index.list()[0]).toMatchObject({ lastSeq: 7, updatedAt: 1700000002000 })
    index.setTitle(SID, '新标题')
    expect(index.list()[0]?.title).toBe('新标题')
  })

  test('q 标题子串过滤：%/_ 通配符转义（字面匹配）', async () => {
    const { index } = await makeIndex()
    index.upsert(row({ title: '进度100%完成' }))
    index.upsert(row({ id: SID2, title: '重构_retry' }))
    expect(index.list('100%')).toHaveLength(1)
    expect(index.list('_retry')).toHaveLength(1)
    expect(index.list('_retry')[0]?.id).toBe(SID2)
    expect(index.list('不存在的标题')).toEqual([])
  })

  test('rebuild 全量对齐：清表后按磁盘扫描结果写入', async () => {
    const { index } = await makeIndex()
    index.upsert(row({ id: SID2, title: '将被清掉的行' }))
    index.rebuild([row()])
    expect(index.list().map((r) => r.id)).toEqual([SID])
  })

  test('close 后不可再用；同路径可重新打开读回数据', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'spark-idx-'))
    dirs.push(dir)
    const path = join(dir, 'index.db')
    const first = new SessionIndex(path)
    first.upsert(row())
    first.close()
    expect(() => first.list()).toThrow()

    const second = new SessionIndex(path) // 引擎重启场景：建表 IF NOT EXISTS 不破坏旧数据
    expect(second.list()).toHaveLength(1)
    second.close()
  })
})
