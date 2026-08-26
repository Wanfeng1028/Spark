/**
 * SessionRuntime/InputQueue 单测（doc/02 §5.4，§8.6 engine/input-queue 行）：
 * now/steer/queue × idle/running(活动 turn/间隙/收尾) 全矩阵三态返回；
 * steer 残留转主队列；唤醒合并不空转；interrupt 级联与幂等。
 */
import { describe, expect, it } from 'vitest'
import { ids } from '@spark/protocol'
import { InputQueue } from '../src/session/input-queue.js'
import type { InputItem } from '../src/session/input-queue.js'
import { SessionRuntime } from '../src/session/runtime.js'

const SID = ids.session('ses_rt0000000000000000000000')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function item(text: string): InputItem {
  return {
    id: ids.event(`evt_rt${text.padStart(23, '0')}`),
    turnId: ids.turn(`trn_rt${text.padStart(23, '0')}`),
    text,
    delivery: 'now',
    admittedAt: Date.now(),
  }
}

describe('InputQueue（FIFO + 阻塞取）', () => {
  it('无积压时 take 挂起，push 后立即兑现', async () => {
    const q = new InputQueue()
    let resolved = false
    const p = q.take().then((got) => {
      resolved = true
      return got
    })
    await sleep(5)
    expect(resolved).toBe(false)

    const a = item('a')
    q.push(a)
    await expect(p).resolves.toBe(a)
  })

  it('FIFO：多次 push 后依序取出', async () => {
    const q = new InputQueue()
    const a = item('a')
    const b = item('b')
    q.push(a)
    q.push(b)
    expect(q.length).toBe(2)
    await expect(q.take()).resolves.toBe(a)
    await expect(q.take()).resolves.toBe(b)
    expect(q.isEmpty()).toBe(true)
  })
})

describe('提交路由全矩阵（§5.4 状态机）', () => {
  it('idle：now/steer → started（带 turnId）；queue → queued（状态保持 idle）', () => {
    const rt1 = new SessionRuntime(SID)
    const r1 = rt1.submit('a', 'now')
    expect(r1.result).toBe('started')
    expect(r1.turnId).toBeDefined()
    expect(rt1.state).toBe('running')

    const rt2 = new SessionRuntime(SID)
    const r2 = rt2.submit('b', 'steer')
    expect(r2.result).toBe('started')
    expect(r2.turnId).toBeDefined()
    expect(rt2.state).toBe('running')

    const rt3 = new SessionRuntime(SID)
    const r3 = rt3.submit('c', 'queue')
    expect(r3.result).toBe('queued')
    expect(r3.turnId).toBeUndefined()
    expect(rt3.state).toBe('idle') // queue 提交不触发状态迁移
  })

  it('running（活动 turn）：now → steered；steer → steered；queue → queued', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('first', 'now')
    await rt.takeInput() // runner 取走开启项
    const abort = rt.beginTurn()

    expect(rt.submit('x', 'now')).toEqual({ result: 'steered' })
    expect(rt.submit('y', 'steer')).toEqual({ result: 'steered' })
    expect(rt.submit('z', 'queue')).toEqual({ result: 'queued' })
    expect(rt.steerQueue.map((i) => i.text)).toEqual(['x', 'y'])
    expect(rt.queue.length).toBe(1) // 仅 z
    expect(abort.signal.aborted).toBe(false)
  })

  it('running 但无活动 turn（turn 间隙）：now 降级 queued（无可注入的 turn）', () => {
    const rt = new SessionRuntime(SID)
    rt.submit('first', 'now') // running，但 runner 尚未 beginTurn
    expect(rt.submit('second', 'now')).toEqual({ result: 'queued' })
  })

  it('收尾中（interrupt 后）：now → queued；显式 steer 仍进 steerQueue（收尾残留转队列）', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('first', 'now')
    await rt.takeInput()
    rt.beginTurn()
    rt.interrupt()

    expect(rt.submit('x', 'now')).toEqual({ result: 'queued' })
    expect(rt.submit('y', 'steer')).toEqual({ result: 'steered' })
    expect(rt.submit('z', 'queue')).toEqual({ result: 'queued' })
  })

  it('空文本拒绝（fail-fast，与 user.message zod min(1) 同源）', () => {
    const rt = new SessionRuntime(SID)
    expect(() => rt.submit('')).toThrow(/E_INPUT_EMPTY/)
  })

  it('attachments 随 InputItem 保留；未传时缺省', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('with files', 'now', ['/a.txt', '/b.txt'])
    rt.submit('plain', 'now')
    const withFiles = await rt.takeInput()
    const plain = await rt.takeInput()
    expect(withFiles.attachments).toEqual(['/a.txt', '/b.txt'])
    expect(plain.attachments).toBeUndefined()
    expect(withFiles.delivery).toBe('now')
  })
})

describe('steer 注入与残留（§5.4 Codex 对照补漏）', () => {
  it('drainSteer 按到达序返回并清空', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('first', 'now')
    await rt.takeInput()
    rt.beginTurn()
    rt.submit('s1', 'now')
    rt.submit('s2', 'steer')

    expect(rt.drainSteer().map((i) => i.text)).toEqual(['s1', 's2'])
    expect(rt.steerQueue).toHaveLength(0)
    expect(rt.drainSteer()).toEqual([])
  })

  it('endTurn：未消费的 steer 残留转入主队列（不丢失，保留原 delivery）', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('first', 'queue')
    const first = await rt.takeInput()
    expect(first.text).toBe('first')

    rt.beginTurn()
    rt.submit('residue', 'steer') // turn 在注入前结束
    expect(rt.endTurn()).toBe(true) // 残留构成积压 → 续跑

    const moved = await rt.takeInput()
    expect(moved.text).toBe('residue')
    expect(moved.delivery).toBe('steer')
  })
})

describe('唤醒合并（pendingWake 不空转）', () => {
  it('turn 结束有积压：保持 running，takeInput 立即兑现（无空转一轮）', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('a', 'now')
    expect((await rt.takeInput()).text).toBe('a')

    rt.beginTurn()
    rt.submit('b', 'queue') // 积压
    expect(rt.endTurn()).toBe(true)
    expect(rt.state).toBe('running')

    const next = await Promise.race([
      rt.takeInput(),
      sleep(50).then(() => 'TIMEOUT' as const),
    ])
    expect(next).not.toBe('TIMEOUT')
    expect((next as InputItem).text).toBe('b')
  })

  it('turn 结束无积压：回 idle，takeInput 挂起直到新提交唤醒', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('a', 'now')
    await rt.takeInput()
    rt.beginTurn()

    expect(rt.endTurn()).toBe(false)
    expect(rt.state).toBe('idle')

    let resolved = false
    void rt.takeInput().then(() => {
      resolved = true
    })
    await sleep(10)
    expect(resolved).toBe(false)

    rt.submit('next', 'now')
    await sleep(10)
    expect(resolved).toBe(true)
    expect(rt.state).toBe('running')
  })

  it('hasBacklog 反映 queue/steer 双队列', async () => {
    const rt = new SessionRuntime(SID)
    expect(rt.hasBacklog()).toBe(false)
    rt.submit('a', 'queue')
    expect(rt.hasBacklog()).toBe(true)

    await rt.takeInput() // 清空 queue
    expect(rt.hasBacklog()).toBe(false)

    rt.beginTurn()
    rt.submit('s', 'steer')
    expect(rt.hasBacklog()).toBe(true)
    rt.drainSteer()
    expect(rt.hasBacklog()).toBe(false)
  })
})

describe('steer expected_turn_id 校验（§5.4，工单 5.4）', () => {
  it('匹配活动 turn → steered；不匹配 → E_TURN_MISMATCH', async () => {
    const rt = new SessionRuntime(SID)
    const started = rt.submit('first', 'now')
    await rt.takeInput()
    rt.beginTurn(started.turnId)

    expect(rt.submit('ok', 'steer', undefined, started.turnId)).toEqual({ result: 'steered' })
    expect(() =>
      rt.submit('bad', 'steer', undefined, ids.turn('trn_other_turn_00000000')),
    ).toThrow(/E_TURN_MISMATCH/)
  })

  it('无活动 turn（idle）时带 expectedTurnId → E_TURN_MISMATCH', () => {
    const rt = new SessionRuntime(SID)
    expect(() => rt.submit('x', 'steer', undefined, ids.turn('trn_no_active_turn_0000'))).toThrow(
      /E_TURN_MISMATCH/,
    )
  })

  it('不传 expectedTurnId 保持原宽容路由（向后兼容）', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('first', 'now')
    await rt.takeInput()
    rt.beginTurn()
    expect(rt.submit('free steer', 'steer')).toEqual({ result: 'steered' })
  })

  it('endTurn 后活动 turn 清空：旧 expectedTurnId 再提交即拒', async () => {
    const rt = new SessionRuntime(SID)
    const started = rt.submit('first', 'now')
    await rt.takeInput()
    rt.beginTurn(started.turnId)
    rt.endTurn()
    expect(() => rt.submit('late', 'steer', undefined, started.turnId)).toThrow(/E_TURN_MISMATCH/)
  })
})

describe('interrupt（级联入口）', () => {
  it('活动 turn：abort 生效并进入收尾（now 降级 queued）', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('first', 'now')
    await rt.takeInput()
    const abort = rt.beginTurn()

    rt.interrupt()
    expect(abort.signal.aborted).toBe(true)
    expect(rt.submit('late', 'now')).toEqual({ result: 'queued' })
  })

  it('无活动 turn（idle）：幂等 no-op，不抛错', () => {
    const rt = new SessionRuntime(SID)
    expect(() => rt.interrupt()).not.toThrow()
    expect(rt.state).toBe('idle')
  })

  it('重复 interrupt 幂等；endTurn 后可开新 turn', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('first', 'now')
    await rt.takeInput()
    const abort = rt.beginTurn()
    rt.interrupt()
    rt.interrupt()
    expect(abort.signal.aborted).toBe(true)

    expect(rt.endTurn()).toBe(false)
    expect(rt.state).toBe('idle')

    rt.submit('next', 'now')
    await rt.takeInput()
    const abort2 = rt.beginTurn()
    expect(abort2.signal.aborted).toBe(false)
  })

  it('beginTurn 重入拒绝（fail-fast）', async () => {
    const rt = new SessionRuntime(SID)
    rt.submit('first', 'now')
    await rt.takeInput()
    rt.beginTurn()
    expect(() => rt.beginTurn()).toThrow(/E_RUNTIME_TURN_ACTIVE/)
  })
})
