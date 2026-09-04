/**
 * settings schema 单测（工单 R-B.4）：engine 段「宽松基形 / strict 版」的分档关系钉死——
 * 两者共用同一份九项字段定义（EngineSettingsSchema = EngineSettingsShape.strict()），
 * 差别只在未知键：spark.json 侧剥离（拼错字段名 → 该字段落默认值），API 边界拒收。
 * 收紧 spark.json 口径属行为变更，须另立工单——本文件用例翻红即为该变更的信号。
 * 另钉 hooks 段 `.readonly()` 的冻结语义：engine config.ts 复用本 schema，
 * UserHookRunner 只读遍历，冻结让运行时值兑现 `readonly UserHookDef[]` 的类型契约。
 */
import { describe, expect, it } from 'vitest'
import {
  EngineSettingsSchema,
  EngineSettingsShape,
  SETTINGS_RESTART_REQUIRED,
  SettingsHooksSchema,
} from '../src/api'

/** 九项（doc/02 §5.1 / D28；新增字段须同步 engine SPARK_DEFAULTS 与 doc） */
const NINE = [
  'maxStepsPerTurn',
  'maxToolParallel',
  'toolTimeoutMs',
  'permissionTimeoutMs',
  'progressThrottleMs',
  'toolOutputLimitKB',
  'compactionThreshold',
  'checkpoints',
  'bashSandbox',
]

const VALID = {
  maxStepsPerTurn: 40,
  maxToolParallel: 8,
  toolTimeoutMs: 120_000,
  permissionTimeoutMs: 300_000,
  progressThrottleMs: 200,
  toolOutputLimitKB: 32,
  compactionThreshold: 0.8,
  checkpoints: true,
  bashSandbox: 'on',
}

describe('EngineSettingsShape / EngineSettingsSchema 分档', () => {
  it('九项键集一致：两档共用同一份字段定义（防分家）', () => {
    expect(Object.keys(EngineSettingsShape.shape).sort()).toEqual([...NINE].sort())
    expect(Object.keys(EngineSettingsSchema.shape).sort()).toEqual([...NINE].sort())
  })

  it('合法九项：两档同判通过且原样产出', () => {
    expect(EngineSettingsShape.parse(VALID)).toEqual(VALID)
    expect(EngineSettingsSchema.parse(VALID)).toEqual(VALID)
  })

  it('宽松基形剥离未知键（spark.json 口径）', () => {
    expect(EngineSettingsShape.parse({ ...VALID, maxStepPerTurn: 99 })).toEqual(VALID)
  })

  it('strict 版拒未知键（API 边界口径）', () => {
    const r = EngineSettingsSchema.safeParse({ ...VALID, maxStepPerTurn: 99 })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.code).toBe('unrecognized_keys')
  })

  it('边界值两档同判（同一份定义的必然结果，抽样钉住）', () => {
    const bad = [
      { ...VALID, maxStepsPerTurn: 0 },
      { ...VALID, maxToolParallel: -1 },
      { ...VALID, toolTimeoutMs: 0 },
      { ...VALID, permissionTimeoutMs: -5 },
      { ...VALID, progressThrottleMs: 0 },
      { ...VALID, toolOutputLimitKB: 0 },
      { ...VALID, compactionThreshold: 0 },
      { ...VALID, compactionThreshold: 1 },
      { ...VALID, checkpoints: 'yes' },
      { ...VALID, bashSandbox: 'enabled' },
    ]
    for (const b of bad) {
      expect(EngineSettingsShape.safeParse(b).success).toBe(false)
      expect(EngineSettingsSchema.safeParse(b).success).toBe(false)
    }
  })

  it('partial() 后逐字段可选（SettingsUpdateSchema 的 engine 段口径）', () => {
    expect(EngineSettingsSchema.partial().parse({ checkpoints: false })).toEqual({ checkpoints: false })
    expect(EngineSettingsSchema.partial().parse({})).toEqual({})
  })
})

describe('SETTINGS_RESTART_REQUIRED 与字段名单源对齐', () => {
  it('engine.* 条目都在九项内（字段改名即翻红）', () => {
    for (const path of SETTINGS_RESTART_REQUIRED) {
      if (!path.startsWith('engine.')) continue
      expect(NINE).toContain(path.slice('engine.'.length))
    }
  })

  it('server.* 条目限于 port/host', () => {
    const serverPaths = SETTINGS_RESTART_REQUIRED.filter((p) => p.startsWith('server.'))
    expect(serverPaths.sort()).toEqual(['server.host', 'server.port'])
  })

  it('热档五项不在表内（D28 分档：turn 边界注入）', () => {
    const hot = ['maxStepsPerTurn', 'maxToolParallel', 'compactionThreshold', 'progressThrottleMs', 'checkpoints']
    for (const f of hot) expect(SETTINGS_RESTART_REQUIRED).not.toContain(`engine.${f}`)
  })
})

describe('SettingsHooksSchema（engine config.ts 复用）', () => {
  it('两种触发各自 strict：混写拒收', () => {
    expect(SettingsHooksSchema.safeParse({ 'turn.before': [{ command: 'echo hi' }] }).success).toBe(true)
    expect(SettingsHooksSchema.safeParse({ 'turn.after': [{ skill: 'demo', emit: 'demo.done' }] }).success).toBe(true)
    expect(
      SettingsHooksSchema.safeParse({ 'turn.after': [{ command: 'x', skill: 'demo', emit: 'demo.done' }] }).success,
    ).toBe(false)
  })

  it('未知挂点名拒收（strictObject）', () => {
    const r = SettingsHooksSchema.safeParse({ 'turn.mid': [{ command: 'x' }] })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.code).toBe('unrecognized_keys')
  })

  it('.readonly() 冻结解析产物的数组（zod v4 语义）', () => {
    const parsed = SettingsHooksSchema.parse({ 'tool.completed': [{ command: 'x', timeoutMs: 1_000 }] })
    expect(Object.isFrozen(parsed['tool.completed'])).toBe(true)
    expect(Object.isFrozen(parsed)).toBe(false) // 对象本体不冻结：写侧仍可整体替换 hooks 段
  })

  it('四挂点全部可选：空对象合法（引擎侧 `?? {}` 的缺省形态）', () => {
    expect(SettingsHooksSchema.parse({})).toEqual({})
  })
})
