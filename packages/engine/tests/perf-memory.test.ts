/**
 * 性能基线第一批②（工单 11.4 / doc/06 §3）：10 万 durable 事件会话回放后常驻 RSS <512MB。
 * 计时口径：SessionStore.resume 全量读（磁盘 → 严校验 → EventTree 重建）后驻留内存的树；
 * 单文件直写预置（append 逐行 10 万次会拖垮测试而不改变被测语义——resume 才是回放热路径）。
 * 运行面：SPARK_PERF=1 门控——默认 vitest/主 CI 跳过（CI 规格下内存抖动大，doc/02 11.4 允许），
 * 仅 nightly performance job 与本地显式跑。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { EventId, SessionId } from '@spark/protocol'
import { SessionStore, mungeDir, sessionFileName } from '../src/session/store.js'

const PERF = process.env.SPARK_PERF === '1'
const EVENTS = 100_000
const RSS_LIMIT_MB = 512

describe.skipIf(!PERF)(`性能基线：十万事件回放内存（工单 11.4；SPARK_PERF=1 才跑）`, () => {
  test(`${EVENTS} 条 durable 事件 resume 后 RSS <${RSS_LIMIT_MB}MB`, async () => {
    const sid = `ses_perf00000000000000000000` as SessionId
    const cwd = process.cwd()
    const dir = join(tmpdir(), '.spark-perf', 'sessions', mungeDir(cwd))
    const path = join(dir, sessionFileName(Date.now(), sid))
    mkdirSync(dir, { recursive: true })
    const lines: string[] = [
      JSON.stringify({ sparkVersion: '0.1.0', cwd, createdAt: Date.now(), model: 'fake/fake-chat' }),
    ]
    let parent: EventId | null = null
    for (let i = 1; i <= EVENTS; i++) {
      const id = `evt_${String(i).padStart(20, '0')}` as EventId
      lines.push(
        JSON.stringify({
          id,
          sessionId: sid,
          seq: i,
          ...(parent !== null ? { parentId: parent } : {}),
          time: Date.now(),
          type: 'user.message',
          surface: true,
          data: { text: `内存基线填充事件 ${i}` },
        }),
      )
      parent = id
    }
    writeFileSync(path, `${lines.join('\n')}\n`)

    const store = await SessionStore.resume(path)
    try {
      // 线性链重建成功（10 万节点全在树内）；根事件无 parent，leafId = 最后一条
      expect(store.tree.leafId).not.toBeNull()
      const rssMb = process.memoryUsage().rss / (1024 * 1024)
      expect(
        rssMb,
        `回放后 RSS ${rssMb.toFixed(1)}MB（上限 ${RSS_LIMIT_MB}MB，doc/06 §3）`,
      ).toBeLessThan(RSS_LIMIT_MB)
    } finally {
      await store.close()
    }
  })
})
