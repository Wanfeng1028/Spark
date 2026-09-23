/**
 * MockTransport 对等修复批（阶段十九 19.22 / §1.1 纪律）：mock 与 HttpTransport 的
 * 行为对齐单测——此前 mock 丢 patch/opts/不校验 id，导致"mock 走查绿、真实通道红"。
 * 覆盖：updateSettings 的 agents/extensions 段不再丢弃、createSession 接 opts、
 * updateMcpConfig 内存持久（读回一致）、deleteSession/sendMessage 未知 id 拒执、
 * getMcpConfig 凭据掩码回显（第二批）、listFs/listFsTree 统一虚拟树与前缀过滤与越界口径、
 * transcribe 三条护栏分支、testModelProvider 文案对齐引擎（第三批）。
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

  test('pinSession：仅已置顶携带 pinned、列表置顶优先、未知 id 拒执（工单 19.41 对等）', async () => {
    const t = fresh()
    const list = await t.listSessions()
    const target = list[list.length - 1]
    expect(target).toBeDefined()
    if (target === undefined) return
    // 未置顶不写 false（与真实通道同口径——禁假状态）
    expect(target.pinned).toBeUndefined()
    expect((await t.pinSession(target.id, true)).pinned).toBe(true)
    expect((await t.listSessions())[0]?.id).toBe(target.id)
    expect((await t.pinSession(target.id, false)).pinned).toBeUndefined()
    await expect(t.pinSession('ses_0000000000000000000000000000ff', true)).rejects.toThrow(/E_NOT_FOUND/)
  })

  // ---- 第三批：listFs / listFsTree / transcribe / testModelProvider ----

  test('listFs 与 listFsTree 共用一份虚拟树（此前各持一棵、对同一目录给出矛盾子项）', async () => {
    const t = fresh()
    const sid = (await t.listSessions())[0]!.id
    const flat = await t.listFs(sid, 'src/')
    const tree = await t.listFsTree(sid, 'src')
    expect(flat.path).toBe('src')
    expect(tree.path).toBe('src')
    // 目录优先再字典序，两端同一排序口径（mockFsSort）。**两者语义本就不同、别断言相等**：
    // listFs 只列一层，listFsTree 递归（服务端 depth ≤4）——所以树里多一个 src/components/InputBox.tsx
    expect(flat.entries.map((e) => e.name)).toEqual(['components', 'app.tsx', 'main.tsx'])
    expect(tree.entries.map((e) => e.name)).toEqual([
      'components',
      'app.tsx',
      'InputBox.tsx',
      'main.tsx',
    ])
    // 一致性的真含义：一层列出的恰是递归结果中直接挂在 src 下的那批，路径逐字相同
    const treePaths = tree.entries.map((e) => e.path)
    expect(flat.entries.map((e) => e.path).sort()).toEqual(
      treePaths.filter((p) => p.split('/').length === 2).sort(),
    )
  })

  test('listFs：末段作前缀过滤（此前注释声称镜像服务端、实际根本不过滤）+ 反斜杠归一', async () => {
    const t = fresh()
    const sid = (await t.listSessions())[0]!.id
    expect((await t.listFs(sid, 'src/a')).entries.map((e) => e.name)).toEqual(['app.tsx'])
    expect((await t.listFs(sid, 'src\\a')).entries.map((e) => e.name)).toEqual(['app.tsx'])
    // 无斜杠 = 末段整体当前缀、列举根目录（server sessions.ts:121-123 同口径）
    expect((await t.listFs(sid, 'src')).entries.map((e) => e.name)).toEqual(['src'])
  })

  test('越界路径：listFs 回空清单不报错，listFsTree 抛 E_PATH_OUTSIDE（服务端两处口径本就不同）', async () => {
    const t = fresh()
    const sid = (await t.listSessions())[0]!.id
    expect(await t.listFs(sid, '../etc')).toEqual({ path: '..', entries: [] })
    await expect(t.listFsTree(sid, '../etc')).rejects.toThrow(/E_PATH_OUTSIDE/)
  })

  test('fs 两端：未知会话拒执；dispose 后拒执（listFsTree 此前连 assertNotDisposed 都没有）', async () => {
    const t = fresh()
    const nope = 'ses_0000000000000000000000000000ff' as never
    await expect(t.listFs(nope, '')).rejects.toThrow(/E_NOT_FOUND/)
    await expect(t.listFsTree(nope, '')).rejects.toThrow(/E_NOT_FOUND/)
    const t2 = fresh()
    t2.dispose()
    // assertNotDisposed 是同步 throw（非 async 方法），故用 toThrow 而非 rejects
    expect(() => t2.listFsTree(nope, '')).toThrow(/E_MOCK_DISPOSED/)
  })

  test('transcribe：三条护栏分支可达（此前恒成功，E_TRANSCRIBE_* 文案在 web 侧无从触发）', async () => {
    const t = fresh()
    const wav = { mime: 'audio/wav', dataBase64: 'AAAA' }
    // 供应商缺省 = defaultModel.provider；此前回字面量 'mock'，不是任何真实 provider id
    expect(await t.transcribe({ audio: wav })).toMatchObject({ provider: 'deepseek', model: 'mock-transcribe' })
    await expect(t.transcribe({ provider: 'no-such', audio: wav })).rejects.toThrow(/E_TRANSCRIBE_UNCONFIGURED/)
    await expect(t.transcribe({ audio: { mime: 'audio/flac', dataBase64: 'AAAA' } })).rejects.toThrow(
      /E_TRANSCRIBE_MIME/,
    )
    // 上限是 base64 前的 10MB ⇒ 需约 14M 字符。这条开销刻意：要证的正是"体积分支可达"，
    // 而判据与引擎共用 protocol 同一份常量（TRANSCRIBE_MAX_AUDIO_BYTES），不是 mock 另写一个数。
    await expect(
      t.transcribe({ audio: { mime: 'audio/wav', dataBase64: 'A'.repeat(14_000_000) } }),
    ).rejects.toThrow(/E_TRANSCRIBE_TOO_LARGE/)
  })

  test('testModelProvider：三条失败文案与 engine model-catalog 逐字一致', async () => {
    const t = fresh()
    // ollama-local = configured:true + hasKey:false + apiKeyEnv:null，是唯一能走到 !hasKey 的夹具
    expect(await t.testModelProvider('ollama-local')).toEqual({
      provider: 'ollama-local',
      ok: false,
      message: '缺少 API Key：models.json 未设置 apiKeyEnv，密钥仓亦无条目',
    })
    expect((await t.testModelProvider('openai')).message).toBe('未配置：该供应商未写入 models.json providers')
    expect((await t.testModelProvider('no-such')).message).toBe(
      '未知供应商：不在 models.json providers，也不在内置目录',
    )
  })

  test('updateSettings：ui.keymap 整段替换不再丢弃（19.39 尾巴）', async () => {
    const t = fresh()
    const first = [{ action: '发送消息', keys: 'Ctrl+Enter' }]
    await t.updateSettings({ ui: { keymap: { overrides: first } } })
    expect((await t.getSettings()).ui?.keymap?.overrides).toEqual(first)
    // 整段替换而非逐条合并——再写一份不同的，旧绑定不得残留（api.ts：半路合并会留孤儿绑定）
    const second = [{ action: '中断当前 turn', keys: 'Ctrl+C' }]
    await t.updateSettings({ ui: { keymap: { overrides: second } } })
    expect((await t.getSettings()).ui?.keymap?.overrides).toEqual(second)
    // 只改 language 不得把已存 keymap 冲掉（ui 段两键各自独立）
    await t.updateSettings({ ui: { language: 'en' } })
    const s = await t.getSettings()
    expect(s.ui?.keymap?.overrides).toEqual(second)
    expect(s.ui?.language).toBe('en')
  })
})
