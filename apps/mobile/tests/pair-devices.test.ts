/**
 * 配对设备控制器单测（工单 19.27）：列表/撤销/签发三动作的调用序列与状态迁移。
 * 关键纪律：撤销成功后一律重取列表（服务端是终态，本地摘行会与服务端记录分叉）。
 */
import type { PairCodeDto, PairStatusDto, Transport } from '@spark/protocol'
import {
  createPairDevicesController,
  type PairDevicesController,
  type PairDevicesRest,
  type PairDevicesSnapshot,
} from '../src/session/pair-devices'

function status(deviceCount: number): PairStatusDto {
  return {
    host: '192.168.1.10',
    port: 4318,
    loopback: false,
    authEnabled: true,
    devices: Array.from({ length: deviceCount }, (_, i) => ({
      id: `dev-${i}`,
      name: `设备 ${i}`,
      createdAt: 1000 + i,
      lastSeenAt: 2000 + i,
    })),
  }
}

const CODE: PairCodeDto = { code: '123456', expiresAt: 9999, qr: 'spark://pair?host=h&port=1&code=123456' }

function harness(over: Partial<{
  getPairStatus: jest.Mock
  revokePairDevice: jest.Mock
  createPairCode: jest.Mock
}> = {}) {
  const mocks = {
    getPairStatus: jest.fn(async (): Promise<PairStatusDto> => status(2)),
    revokePairDevice: jest.fn(async (): Promise<void> => undefined),
    createPairCode: jest.fn(async (): Promise<PairCodeDto> => CODE),
    ...over,
  }
  const transport: PairDevicesRest = mocks
  const snapshots: PairDevicesSnapshot[] = []
  const controller: PairDevicesController = createPairDevicesController({
    rest: () => transport,
    onUpdate: (s) => snapshots.push(s),
  })
  return { mocks, snapshots, controller, last: () => snapshots[snapshots.length - 1] }
}

describe('配对设备控制器', () => {
  it('refresh 走 getPairStatus 并落 status 快照', async () => {
    const h = harness()
    await h.controller.refresh()
    expect(h.mocks.getPairStatus).toHaveBeenCalledTimes(1)
    expect(h.last()?.status?.devices).toHaveLength(2)
    expect(h.last()?.busy).toBe(false)
    h.controller.dispose()
  })

  it('撤销成功：revokePairDevice(id) 后立即重取列表', async () => {
    const h = harness()
    await h.controller.refresh()
    h.mocks.getPairStatus.mockClear()
    expect(await h.controller.revoke('dev-0')).toBe(true)
    expect(h.mocks.revokePairDevice).toHaveBeenCalledWith('dev-0')
    expect(h.mocks.getPairStatus).toHaveBeenCalledTimes(1)
    expect(h.last()?.revoking).toBeNull()
    h.controller.dispose()
  })

  it('撤销失败：如实挂错误、不重取（服务端记录未变）', async () => {
    const h = harness({
      revokePairDevice: jest.fn(async () => {
        throw new Error('E_NOT_FOUND: 无此设备')
      }),
    })
    await h.controller.refresh()
    h.mocks.getPairStatus.mockClear()
    expect(await h.controller.revoke('gone')).toBe(false)
    expect(h.mocks.getPairStatus).not.toHaveBeenCalled()
    expect(h.last()?.notice).toContain('无此设备')
    h.controller.dispose()
  })

  it('签发配对码：createPairCode → code 快照（含 QR 出示内容）', async () => {
    const h = harness()
    await h.controller.issueCode()
    expect(h.mocks.createPairCode).toHaveBeenCalledTimes(1)
    expect(h.last()?.code?.code).toBe('123456')
    expect(h.last()?.code?.qr).toContain('spark://pair')
    h.controller.dispose()
  })

  it('未配置服务器：请求一个都不发，只给配对提示', async () => {
    const snapshots: PairDevicesSnapshot[] = []
    const controller = createPairDevicesController({
      rest: () => null,
      onUpdate: (s) => snapshots.push(s),
    })
    await controller.refresh()
    expect(snapshots[snapshots.length - 1]?.notice).toBe('未配置服务器：请先在设置页完成配对')
    expect(snapshots[snapshots.length - 1]?.status).toBeNull()
  })

  it('dispose 后在途请求不再回调（旧页面不得污染新页面）', async () => {
    const settled: { resolve: ((v: PairStatusDto) => void) | null } = { resolve: null }
    const snapshots: PairDevicesSnapshot[] = []
    const controller = createPairDevicesController({
      rest: () => ({
        getPairStatus: () =>
          new Promise<PairStatusDto>((res) => {
            settled.resolve = res
        }),
        revokePairDevice: (async () => undefined) as Transport['revokePairDevice'],
        createPairCode: (async () => CODE) as Transport['createPairCode'],
      }),
      onUpdate: (s) => snapshots.push(s),
    })
    const inflight = controller.refresh()
    controller.dispose()
    const count = snapshots.length
    settled.resolve?.(status(1))
    await inflight
    expect(snapshots.length).toBe(count)
  })
})
