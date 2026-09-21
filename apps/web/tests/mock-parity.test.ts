/**
 * MockTransport 对等修复批（阶段十九 19.22 / §1.1 纪律）：mock 与 HttpTransport 的
 * 行为对齐单测——此前 mock 丢 patch/opts/不校验 id，导致"mock 走查绿、真实通道红"。
 * 覆盖：updateSettings 的 agents/extensions 段不再丢弃、createSession 接 opts、
 * updateMcpConfig 内存持久（读回一致）、deleteSession/sendMessage 未知 id 拒执、
 * getMcpConfig 凭据掩码回显（19.22 第二批）。
 */
import { describe, expect, test } from 'vitest'
import { MCP_ENV_MASK } from '@spark/protocol'
import { MockTransport } from '@/transports/mock'

function fresh(): MockTransport {
  return new MockTransport('normal')
}

describe('MockTransport 对等修复（阶段十九 19.22 / §1.1）', () => {
  test('updateSettings：agents 停用名单不再丢弃（16.2 mock 下曾失效）', async () => {
    const t = fresh()
    await t.updateSettings({ agents: { disabledAgents: ['reviewer'] } })
    const s = await t.getSettings()
    expect(s.agents?.disabledAgents).toEqual(['reviewer'])
  })

  test('updateSettings：extensions 停用名单不再丢弃（16.5 同）', async () => {
    const t = fresh()
    await t.updateSettings({ extensions: { disabledExtensions: ['demo-pack'] } })
    const s = await t.getSettings()
    expect(s.extensions?.disabledExtensions).toEqual(['demo-pack'])
  })

  test('createSession：opts 不再丢弃（显式 title/model 覆盖演示脚本值）', async () => {
    const t = fresh()
    const dto = await t.createSession({ title: '我的会话', model: 'fake/fake-chat' })
    expect(dto.title).toBe('我的会话')
    expect(dto.model).toBe('fake/fake-chat')
  })

  test('updateMcpConfig：内存持久——保存后读回一致（此前恒初始值）', async () => {
    const t = fresh()
    const before = await t.getMcpConfig()
    expect(before.servers['github']).toEqual({ command: 'npx' })
    await t.updateMcpConfig({
      version: 1,
      servers: { solo: { command: 'node', args: ['server.js'] } },
    })
    const after = await t.getMcpConfig()
    expect(after.servers['solo']).toEqual({ command: 'node', args: ['server.js'] })
  })

  test('deleteSession：未知 id → E_NOT_FOUND（真实通道 404 对等）', async () => {
    const t = fresh()
    await expect(t.deleteSession('ses_nope0000000000000001')).rejects.toThrow(/E_NOT_FOUND/)
  })

  test('sendMessage：未知会话 → E_NOT_FOUND；已知会话照常受理', async () => {
    const t = fresh()
    await expect(t.sendMessage('ses_nope0000000000000001' as never, 'hi')).rejects.toThrow(/E_NOT_FOUND/)
    // 已知会话（脚本 sid）不抛
    const known = await t.listSessions()
    await expect(t.sendMessage(known[0]?.id as never, 'hi')).resolves.toBeTruthy()
  })

  test('sendMessage：delivery 与 expectedTurnId 校验对等（19.22 第二批）', async () => {
    const t = fresh()
    const sid = (await t.listSessions())[0]?.id as never
    const first = await t.sendMessage(sid, '第一条', { delivery: 'now' })
    expect(first.result).toBe('started')
    // 不变量断言（不依赖脚本此刻停在哪个锚点）：本 turn 未结束前不再起第二个 turn，
    // 且 queue 档永不被判成插话——原实现吞 opts，运行中一律返回 steered，两条都会红。
    const queued = await t.sendMessage(sid, '排队', { delivery: 'queue' })
    expect(queued.result).not.toBe('steered')
    expect(queued.result).not.toBe('started')
    const steered = await t.sendMessage(sid, '插话', { delivery: 'steer' })
    expect(steered.result).not.toBe('started')
    // steer 目标 turn 校验：与当前活动 turn 不符 → E_TURN_MISMATCH（§5.4 真实通道同码）
    await expect(
      t.sendMessage(sid, '错目标', { delivery: 'steer', expectedTurnId: 'trn_stale000000000000000000' as never }),
    ).rejects.toThrow(/E_TURN_MISMATCH/)
  })

  test('arena：按会话归属，非发起会话不得看到竞答（19.22 对等）', async () => {
    const t = fresh()
    const other = 'ses_other0000000000000001' as never
    // 原实现忽略 sessionId：任意会话都返回同一场演示竞答（幽灵竞答）、cancel 也无归属校验。
    // 只断确定性的反面——不依赖 listSessions()[0] 是否恰为脚本会话（fork 子会话也在表里）
    expect(await t.getArena(other)).toBeNull()
    await expect(t.cancelArena(other)).rejects.toThrow(/E_NOT_FOUND/)
    await expect(t.applyArenaWinner(other, other)).rejects.toThrow(/E_NOT_FOUND/)
  })

  test('listArenaHistory：limit 生效（与 server 缺省 20 / 上限 100 同口径）', async () => {
    const t = fresh()
    expect((await t.listArenaHistory()).runs.length).toBeGreaterThan(0)
    expect((await t.listArenaHistory(1)).runs).toHaveLength(1)
  })

  test('getMcpConfig：读回按掩码回显（凭据不出引擎——真实通道同语义）', async () => {
    const t = fresh()
    await t.updateMcpConfig({
      version: 1,
      servers: {
        remote: {
          transport: 'streamable-http',
          url: 'https://example.test/mcp',
          headers: { Authorization: 'Bearer real-token' },
          env: { MCP_TOKEN: 'plain-value' },
        },
      },
    })
    const back = await t.getMcpConfig()
    // 敏感面掩码：表单据此保存时走掩码合并，不会把占位写进盘、也不会拿到明文
    expect(back.servers['remote']?.headers?.['Authorization']).toBe(MCP_ENV_MASK)
    expect(back.servers['remote']?.env?.['MCP_TOKEN']).toBe(MCP_ENV_MASK)
    // 非敏感字段原样回读（掩码只覆盖凭据面）
    expect(back.servers['remote']?.url).toBe('https://example.test/mcp')
    expect(back.servers['remote']?.transport).toBe('streamable-http')
  })
})
