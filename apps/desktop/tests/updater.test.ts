/**
 * 自更新判据单测（19.34 dry-run 验收）：shouldAutoUpdate 三门槛（打包态/配置开关/
 * 逃生口）、missingUpdateAssets 的 feed 三件套自检（exe+blockmap+latest.yml——
 * 缺件即差分退化全量，发布前在 CI 报红）、状态行映射、事件接线不抛。
 * electron-updater 本体不测（网络/安装器交互），判据面全覆盖。
 */
import { describe, expect, it } from 'vitest'
import {
  UPDATE_FEED,
  missingUpdateAssets,
  shouldAutoUpdate,
  updaterStateText,
  wireUpdaterEvents,
} from '../src/updater'

describe('shouldAutoUpdate', () => {
  const base = { isPackaged: true, autoUpdate: true }

  it('打包态 + 缺省开 → 跑；开发态永不跑', () => {
    expect(shouldAutoUpdate({ ...base, env: {} })).toBe(true)
    expect(shouldAutoUpdate({ ...base, isPackaged: false, env: {} })).toBe(false)
  })

  it('desktop.json autoUpdate=false 显式关；SPARK_SKIP_AUTO_UPDATE=1 逃生口', () => {
    expect(shouldAutoUpdate({ ...base, autoUpdate: false, env: {} })).toBe(false)
    expect(shouldAutoUpdate({ ...base, env: { SPARK_SKIP_AUTO_UPDATE: '1' } })).toBe(false)
    // 逃生口只认 '1'（别的值不算——防环境变量脏值静默关掉更新）
    expect(shouldAutoUpdate({ ...base, env: { SPARK_SKIP_AUTO_UPDATE: 'true' } })).toBe(true)
  })
})

describe('missingUpdateAssets（发布链自检）', () => {
  it('三件齐 → 空；缺任一件报出精确缺项', () => {
    const full = [
      'Spark-Setup-1.2.0.exe',
      'Spark-Setup-1.2.0.exe.blockmap',
      'latest.yml',
    ]
    expect(missingUpdateAssets(full)).toEqual([])
    expect(missingUpdateAssets(['Spark-Setup-1.2.0.exe'])).toEqual([
      '*.exe.blockmap',
      'latest.yml',
    ])
    expect(missingUpdateAssets([])).toEqual(['*.exe', '*.exe.blockmap', 'latest.yml'])
  })

  it('feed 元组与 electron-builder.yml 的 publish 段对账（owner/repo 单源）', () => {
    expect(UPDATE_FEED).toEqual({ owner: 'Wanfeng1028', repo: 'Spark' })
  })
})

describe('updaterStateText / wireUpdaterEvents', () => {
  it('六态人话行；error 无 detail 回退"未知错误"，不吐 undefined', () => {
    expect(updaterStateText('checking')).toBe('正在检查更新…')
    expect(updaterStateText('available', '1.3.0')).toContain('1.3.0')
    expect(updaterStateText('downloading', '42%')).toContain('42%')
    expect(updaterStateText('downloaded')).toContain('重启')
    expect(updaterStateText('error')).toContain('未知错误')
  })

  it('事件接线：各事件打一行人话日志（假 updater 触发即验证）', () => {
    const lines: string[] = []
    const handlers = new Map<string, (...args: unknown[]) => void>()
    const fake = {
      on: (ev: string, fn: (...args: unknown[]) => void) => handlers.set(ev, fn),
    } as unknown as Parameters<typeof wireUpdaterEvents>[0]
    wireUpdaterEvents(fake, (line) => lines.push(line))
    ;(handlers.get('update-available') as (i: { version: string }) => void)({ version: '9.9.9' })
    ;(handlers.get('error') as (e: Error) => void)(new Error('net down'))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('9.9.9')
    expect(lines[1]).toContain('net down')
  })
})
