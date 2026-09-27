/**
 * LA-45：CLI boot 幂等——请求数不随键数增长。
 * 旧病灶：useCliActions 的 useMemo 依赖含 resumeFiltered/resumeSelected（/resume
 * 面板每键改 draft → filtered 变 → actions 每键重建 → useEffect([actions]) 每键
 * 重跑 boot → listSessions/listModels/listCommands/getSettings 四请求随键数涨）。
 * 修复后 resume 态出依赖 + boot 幂等守卫，重渲染与显式重复调用都不再放大请求量。
 */
import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { useEffect, type ReactElement } from 'react'
import { Text } from 'ink'
import type { HttpTransport, ModelsDto } from '@spark/protocol'
import { useCliActions } from '../src/hooks/use-cli-actions.js'

function countingTransport() {
  const counts = { listSessions: 0, listModels: 0, listCommands: 0, getSettings: 0 }
  const dto: never = {} as never
  const t = {
    listSessions: () => {
      counts.listSessions += 1
      return Promise.resolve([])
    },
    listModels: () => {
      counts.listModels += 1
      return Promise.resolve({ providers: [], models: [], defaultModel: dto } as unknown as ModelsDto)
    },
    listCommands: () => {
      counts.listCommands += 1
      return Promise.resolve([])
    },
    getSettings: () => {
      counts.getSettings += 1
      return Promise.resolve({} as never)
    },
  } as unknown as HttpTransport
  return { t, counts }
}

/** 复刻 app.tsx 的接线契约：useEffect(() => actions.boot(), [actions])；prop 变化驱动重渲染（模拟键入） */
function Harness({
  transport,
  draft,
  onBoot,
}: {
  transport: HttpTransport
  draft: string
  onBoot?: (boot: () => void) => void
}): ReactElement {
  const actions = useCliActions({
    transport,
    clearScreen: () => {},
    voice: () => {},
    agents: () => {},
    trust: () => {},
    extensions: () => {},
  })
  useEffect(() => {
    actions.boot()
    onBoot?.(actions.boot)
  }, [actions, onBoot])
  return <Text>{draft}</Text>
}

describe('LA-45：boot 幂等', () => {
  it('连续重渲染（模拟键入）：listSessions 等请求数不随重渲染次数增长', async () => {
    const { t, counts } = countingTransport()
    const instance = render(<Harness transport={t} draft="" />)
    // 逐键重渲染：draft 变化 5 次（旧实现此处 listSessions 会涨到 6）
    for (const d of ['a', 'ap', 'app', 'appl', 'apple']) {
      instance.rerender(<Harness transport={t} draft={d} />)
    }
    await new Promise((r) => setTimeout(r, 30)) // 放行微任务里的 boot 链
    expect(counts.listSessions).toBe(1)
    expect(counts.listModels).toBe(1)
    expect(counts.listCommands).toBe(1)
    expect(counts.getSettings).toBe(1)
    instance.unmount()
  })

  it('显式重复调用 boot（错误屏重试路径）：同实例守卫生效，不重复发请求', async () => {
    const { t, counts } = countingTransport()
    let capturedBoot: (() => void) | undefined
    const instance = render(
      <Harness transport={t} draft="" onBoot={(b) => (capturedBoot = b)} />,
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(capturedBoot).toBeDefined()
    capturedBoot?.()
    capturedBoot?.()
    await new Promise((r) => setTimeout(r, 20))
    expect(counts.listSessions).toBe(1)
    expect(counts.listModels).toBe(1)
    instance.unmount()
  })
})
