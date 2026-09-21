/**
 * MockTransport 对等修复批（阶段十九 19.22 / §1.1 纪律）：mock 与 HttpTransport 的
 * 行为对齐单测——此前 mock 丢 patch/opts/不校验 id，导致"mock 走查绿、真实通道红"。
 * 覆盖：updateSettings 的 agents/extensions 段不再丢弃、createSession 接 opts、
 * updateMcpConfig 内存持久（读回一致）、deleteSession/sendMessage 未知 id 拒执。
 */
import { describe, expect, test } from 'vitest'
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
    await expect(t.sendMessage('ses_nope0000000000000001' as never)).rejects.toThrow(/E_NOT_FOUND/)
    // 已知会话（脚本 sid）不抛
    const known = await t.listSessions()
    await expect(t.sendMessage(known[0]?.id as never)).resolves.toBeTruthy()
  })
})
