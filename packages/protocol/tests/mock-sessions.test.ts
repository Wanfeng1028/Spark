/**
 * mock 场景夹具校验（doc/02 §4.7 / §4.8；工单 1.3 验收）：
 * examples/mock-sessions/ 四文件逐行解析——事件行全部过 parseEnvelope（信封+词表双步校验），
 * 锚点行按 §4.7 语义解析；并断言 durable seq/parentId 链与各场景覆盖的 UI 状态要点。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseEnvelope } from '../src/index.js'
import type { SparkEventEnvelope, SparkEventType } from '../src/index.js'

const SCENES = ['normal', 'long-output', 'reject', 'error-finish'] as const
type Scene = (typeof SCENES)[number]

const LIVE_TYPES = new Set(['assistant.delta', 'reasoning.delta', 'tool.progress'])
const SURFACE_TYPES = new Set(['user.message', 'assistant.message'])

interface Header {
  sparkVersion: string
  cwd: string
  createdAt: number
  model: string
}

/** §4.7 锚点行语义：@wait 挂起 / @delay 固定间隔 / @speed 全局倍率 */
type Anchor = { '@wait': 'approval' | 'message' } | { '@delay': number } | { '@speed': number }

type Line =
  | { kind: 'header'; header: Header }
  | { kind: 'anchor'; anchor: Anchor }
  | { kind: 'event'; envelope: SparkEventEnvelope; raw: Record<string, unknown> }

/** 单行三分：首行 header（含 sparkVersion）、@ 键控制行、其余事件行（parseEnvelope 严校验） */
function parseLine(rawLine: string): Line {
  const raw: unknown = JSON.parse(rawLine)
  if (typeof raw === 'object' && raw !== null && 'sparkVersion' in raw) {
    return { kind: 'header', header: raw as Header }
  }
  if (typeof raw === 'object' && raw !== null) {
    const keys = Object.keys(raw)
    if (keys.length > 0 && keys.every((k) => k.startsWith('@'))) {
      return { kind: 'anchor', anchor: parseAnchor(raw) }
    }
  }
  return { kind: 'event', envelope: parseEnvelope(raw), raw: raw as Record<string, unknown> }
}

function parseAnchor(raw: object): Anchor {
  const record = raw as Record<string, unknown>
  const keys = Object.keys(record)
  expect(keys).toHaveLength(1)
  const key = keys[0] ?? ''
  const value = record[key]
  if (key === '@wait') {
    expect(value).toBeOneOf(['approval', 'message'])
    return { '@wait': value as 'approval' | 'message' }
  }
  if (key === '@delay' || key === '@speed') {
    expect(typeof value, `锚点 ${key} 应为正数`).toBe('number')
    expect(value as number).toBeGreaterThan(0)
    return { [key]: value as number } as Anchor
  }
  throw new Error(`未知锚点键 "${key}"（§4.7 表外锚点）`)
}

function loadScene(scene: Scene): Line[] {
  const url = new URL(`../../../examples/mock-sessions/${scene}.jsonl`, import.meta.url)
  const lines = readFileSync(url, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
  return lines.map((l) => parseLine(l))
}

/** 按 type 窄化取出事件（parseEnvelope 返回全联合，data 访问需先窄化） */
function ofType<K extends SparkEventType>(
  events: SparkEventEnvelope[],
  type: K,
): SparkEventEnvelope<K>[] {
  return events.filter((e) => e.type === type) as SparkEventEnvelope<K>[]
}

/** durable/live/surface/parentId 链不变式（doc/02 §4.4）；信封级字段检查基于原始行对象 */
function assertStructure(lines: Line[]): void {
  const eventLines = lines.filter((l): l is Extract<Line, { kind: 'event' }> => l.kind === 'event')
  let expectedSeq = 0
  let leaf: string | null = null
  for (const { envelope: e, raw } of eventLines) {
    if (LIVE_TYPES.has(e.type)) {
      expect(raw.seq, `live 事件 ${e.type} 不应有 seq`).toBeUndefined()
      expect(raw.parentId, `live 事件 ${e.type} 不应有 parentId`).toBeUndefined()
    } else {
      expectedSeq += 1
      expect(raw.seq).toBe(expectedSeq)
      expect(raw.parentId).toBe(leaf)
      leaf = e.id
    }
    if (SURFACE_TYPES.has(e.type)) {
      expect(raw.surface, `surface 事件 ${e.type} 必须带 surface:true`).toBe(true)
    } else {
      expect(raw.surface).toBeUndefined()
    }
  }
}

describe.each(SCENES)('mock 场景 %s.jsonl', (scene) => {
  const lines = loadScene(scene)
  const events = lines.flatMap((l) => (l.kind === 'event' ? [l.envelope] : []))
  const anchors = lines.flatMap((l) => (l.kind === 'anchor' ? [l.anchor] : []))
  const headers = lines.flatMap((l) => (l.kind === 'header' ? [l.header] : []))
  const types = events.map((e) => e.type)

  it('首行为会话 header（sparkVersion/cwd/createdAt/model）', () => {
    expect(headers).toHaveLength(1)
    const h = headers[0]
    expect(h?.sparkVersion).toBe('0.1.0')
    expect(h?.cwd.length ?? 0).toBeGreaterThan(0)
    expect(h?.createdAt ?? 0).toBeGreaterThan(0)
    expect(h?.model).toMatch(/^.+\/.+$/)
  })

  it('事件行全部通过 parseEnvelope 且 durable seq/parentId/surface 链成立', () => {
    expect(events.length).toBeGreaterThan(0)
    assertStructure(lines)
  })

  it('锚点行全部符合 §4.7 语义', () => {
    for (const a of anchors) {
      if ('@wait' in a) expect(['approval', 'message']).toContain(a['@wait'])
      if ('@delay' in a) expect(a['@delay']).toBeGreaterThan(0)
      if ('@speed' in a) expect(a['@speed']).toBeGreaterThan(0)
    }
  })

  it('事件 time 单调不减且 sessionId 一致', () => {
    let prev = 0
    const sid = events[0]?.sessionId
    for (const e of events) {
      expect(e.time).toBeGreaterThanOrEqual(prev)
      prev = e.time
      expect(e.sessionId).toBe(sid)
    }
  })

  const check = scenarioChecks[scene]
  if (check) it('场景覆盖 §4.7 表要点', () => check({ events, anchors, types }))
})

interface CheckCtx {
  events: SparkEventEnvelope[]
  anchors: Anchor[]
  types: string[]
}

const scenarioChecks: Record<Scene, ((ctx: CheckCtx) => void) | undefined> = {
  // 读→edit(diff)→bash→总结；reasoning 流 + 审批 once 放行
  normal: ({ events, anchors, types }) => {
    const asked = ofType(events, 'permission.asked')[0]
    const resolved = ofType(events, 'permission.resolved')[0]
    expect(asked).toBeDefined()
    expect(resolved?.data.requestId).toBe(asked?.data.requestId)
    expect(resolved?.data.reply).toBe('once')
    for (const name of ['read', 'edit', 'bash']) {
      const started = ofType(events, 'tool.started').find((e) => e.data.name === name)
      const completed = ofType(events, 'tool.completed').find(
        (e) => e.data.callId === started?.data.callId,
      )
      expect(started, `normal 应含 ${name} 工具调用`).toBeDefined()
      expect(completed?.data.isError).toBe(false)
    }
    const editOut = ofType(events, 'tool.completed').find(
      (e) => typeof e.data.output === 'object' && e.data.output !== null && 'diff' in e.data.output,
    )
    expect(editOut, 'edit 的 output 应含 diff').toBeDefined()
    expect(types).toContain('reasoning.delta')
    expect(types).toContain('assistant.delta')
    expect(types).toContain('tool.progress')
    expect(anchors).toContainEqual({ '@wait': 'approval' })
    expect(anchors).toContainEqual({ '@wait': 'message' })
    expect(anchors.some((a) => '@delay' in a)).toBe(true)
    const finishes = ofType(events, 'turn.completed').map((e) => e.data.finish)
    expect(finishes).toEqual(['stop', 'stop'])
  },
  // bash 输出 3000+ 行（progressBuf 截头与 Terminal 缓冲上限）
  'long-output': ({ events, types }) => {
    const progressLines = ofType(events, 'tool.progress').reduce(
      (sum, e) => sum + (e.data.chunk.match(/\n/g) ?? []).length,
      0,
    )
    expect(progressLines).toBeGreaterThanOrEqual(3000)
    const completed = ofType(events, 'tool.completed')[0]
    expect(completed?.data.isError).toBe(false)
    const output = completed?.data.output as { truncated?: boolean } | undefined
    expect(output?.truncated).toBe(true)
    expect(types).toContain('turn.completed')
  },
  // write 审批被拒 + feedback 注入（下一条 assistant 响应 feedback 内容）
  reject: ({ events, anchors, types }) => {
    const asked = ofType(events, 'permission.asked')[0]
    const resolved = ofType(events, 'permission.resolved')[0]
    expect(asked?.data.action).toBe('write')
    expect(resolved?.data.reply).toBe('reject')
    const feedback = resolved?.data.feedback ?? ''
    expect(feedback.length).toBeGreaterThan(0)
    // 工具未执行：无对应 tool.started
    expect(types).not.toContain('tool.started')
    // 拒绝结果回喂：isError toolResult 携带 E_PERMISSION
    const fed = ofType(events, 'assistant.message').find((e) =>
      e.data.content.some(
        (c) =>
          c.type === 'toolResult' && c.isError && JSON.stringify(c.output).includes('E_PERMISSION'),
      ),
    )
    expect(fed).toBeDefined()
    // feedback 以 user.message 注入回喂，其后紧跟 assistant 响应
    const injectedIdx = ofType(events, 'user.message').findIndex((e) => e.data.text === feedback)
    expect(injectedIdx).toBeGreaterThan(-1)
    const after = events.slice(injectedIdx + 1).find((e) => e.type === 'assistant.message')
    expect(after).toBeDefined()
    expect(anchors).toContainEqual({ '@wait': 'approval' })
  },
  // 第 2 step LLM 错误：error 事件 + turn.completed{error}（失败闭合）
  'error-finish': ({ events, types }) => {
    const errorIdx = types.indexOf('error')
    const finishIdx = types.indexOf('turn.completed')
    expect(errorIdx).toBeGreaterThan(-1)
    expect(ofType(events, 'error')[0]?.data.scope).toBe('llm')
    expect(finishIdx).toBeGreaterThan(errorIdx)
    expect(ofType(events, 'turn.completed')[0]?.data.finish).toBe('error')
  },
}
