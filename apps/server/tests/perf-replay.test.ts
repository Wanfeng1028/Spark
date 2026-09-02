/**
 * 性能基线第一批①（工单 11.4 / doc/06 §3）：1000 条 durable 事件会话的全量回放 <500ms。
 * 计时口径：GET /api/sessions/:id 全量 DTO——磁盘读 + EventTree 重建 + 投影装配。
 * 阈值政策（doc/06 §3）：本地基线留 2 倍抖动余量——CI runner 性能波动大，断言只拦"数量级劣化"。
 * 运行面：SPARK_PERF=1 门控——默认 vitest/主 CI 跳过，仅 nightly performance job 与本地显式跑。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { EventId, SessionDto, SessionId } from '@spark/protocol'
import { mungeDir, sessionFileName } from '@spark/engine'
import { makeServer } from './helpers.js'

const PERF = process.env.SPARK_PERF === '1'
const EVENTS = 1000
const THRESHOLD_MS = 500

describe.skipIf(!PERF)(`性能基线：千事件回放（工单 11.4；SPARK_PERF=1 才跑）`, () => {
  let f: Awaited<ReturnType<typeof makeServer>>

  afterEach(async () => {
    await f.app.close()
    await f.engine.shutdown()
  })

  test(`${EVENTS} 条 durable 事件全量回放 <${THRESHOLD_MS}ms`, async () => {
    f = await makeServer({})
    // 程序化预置：真实 header + 线性 parentId 链的 user.message（surface 纪律同构磁盘行）
    const sid = `ses_perf00000000000000000000` as SessionId
    const cwd = join(f.root, 'workspace')
    const dir = join(f.root, 'sessions', mungeDir(cwd))
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
          data: { text: `回放基线填充事件 ${i}——中文与 ASCII 混排 0123456789` },
        }),
      )
      parent = id
    }
    writeFileSync(path, `${lines.join('\n')}\n`)

    // warmup：一次不计时的预读——resume 路径含冷启动成本（fs 句柄/EventTree 首建/DTO
    // 首装配），CI 首跑曾因冷态计入 617ms 红灯（2026-09-01 nightly）；断言只测热态回放
    await f.app.inject({ method: 'GET', url: `/api/sessions/${sid}` })

    const t0 = Date.now()
    const res = await f.app.inject({ method: 'GET', url: `/api/sessions/${sid}` })
    const ms = Date.now() - t0
    expect(res.statusCode).toBe(200)
    // resume 路径会补发 session.resumed（durable）——种子 1000 条 + resumed = 1001
    const detail: SessionDto = res.json()
    expect(detail.events).toBeDefined()
    expect(detail.events?.filter((e) => e.type === 'user.message')).toHaveLength(EVENTS)
    expect(
      ms,
      `全量回放 ${ms}ms（阈值 ${THRESHOLD_MS}ms=本地基线 2 倍抖动余量，doc/06 §3）`,
    ).toBeLessThan(THRESHOLD_MS)
  })
})
