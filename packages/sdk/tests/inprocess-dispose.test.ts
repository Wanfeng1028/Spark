/**
 * InProcessTransport dispose 对等单测（AUD-14 / ADR D31 parity 缺口收口）：
 * listExtensions / setExtensionEnabled / getArena / applyArenaWinner / cancelArena /
 * listLspServers / transcribe 原先直透引擎、绕过收口闸门——补闸后 dispose 一律拒绝
 * 且错误与 HTTP 通道同形（E_DISPOSED）。
 * engine 用桩对象：闸门在引擎调用前拒绝，桩方法一旦被触达即抛 E_STUB——证明拒绝
 * 来自闸门而非引擎。全程不启动真引擎（@spark/engine 仅类型引用，运行时零依赖）。
 */
import { describe, expect, test } from 'vitest'
import type { Engine } from '@spark/engine'
import { ids } from '@spark/protocol'
import { InProcessTransport } from '../src/inprocess.js'

const SID = ids.session('ses_sdkdispose000001')

function makeTransport(): InProcessTransport {
  const boom = (): never => {
    throw new Error('E_STUB: 收口闸门应先拒绝——不应触达引擎')
  }
  const engine = {
    listExtensions: boom,
    setExtensionEnabled: boom,
    arenaSnapshot: boom,
    arenaApplyWinner: boom,
    arenaCancel: boom,
    listLspServers: boom,
    transcribe: boom,
  } as unknown as Engine
  return new InProcessTransport(engine)
}

describe('InProcessTransport dispose 对等（AUD-14 / D31 parity）', () => {
  const cases: Array<[string, (t: InProcessTransport) => Promise<unknown>]> = [
    ['listExtensions', (t) => t.listExtensions()],
    ['setExtensionEnabled', (t) => t.setExtensionEnabled('ext_1', true)],
    ['getArena', (t) => t.getArena(SID)],
    ['applyArenaWinner', (t) => t.applyArenaWinner(SID, SID)],
    ['cancelArena', (t) => t.cancelArena(SID)],
    ['listLspServers', (t) => t.listLspServers()],
    [
      'transcribe',
      (t) => t.transcribe({ provider: 'fake', audio: { mime: 'audio/webm', dataBase64: 'aGk=' } }),
    ],
  ]

  for (const [name, run] of cases) {
    test(`dispose 后 ${name} 拒绝且错误与 HTTP 通道一致（E_DISPOSED）`, async () => {
      const t = makeTransport()
      t.dispose()
      await expect(run(t)).rejects.toThrow(/^E_DISPOSED:/)
    })
  }

  test('对照：dispose 前调用会触达引擎（桩生效，非闸门误吞）', async () => {
    const t = makeTransport()
    await expect(t.listExtensions()).rejects.toThrow(/E_STUB/)
  })

  test('onEvent 同步闸门回归对照（既有语义不变）', () => {
    const t = makeTransport()
    t.dispose()
    expect(() => t.onEvent(() => undefined)).toThrow(/^E_DISPOSED:/)
  })
})
