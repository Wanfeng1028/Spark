/**
 * @spark/skill-kit 单测（工单 15.3）：核心是"init 产出过 lint"闭环——骨架必须被
 * 自家 lint 接受；另覆盖词表/声明/JSON Schema 三类拒绝路径与 demo-ping 实例对齐。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { lintManifest, skeletonFiles, skeletonManifest, SKILL_NAME_RE } from '../src/lib.js'

describe('init → lint 闭环（工单 15.3 验收）', () => {
  test('init 骨架产出过自家 lint', () => {
    const files = skeletonFiles('demo-foo')
    expect(Object.keys(files).sort()).toEqual(['README.md', 'skill.json'])
    const raw: unknown = JSON.parse(files['skill.json'] ?? '')
    const r = lintManifest(raw)
    expect(r.ok).toBe(true)
    expect(r.manifest?.name).toBe('demo-foo')
  })

  test('骨架与既有样例 demo-ping 同族（事件命名 + 钩子形状）', () => {
    // examples/skills/demo-ping 是引擎 5.5 落地时的权威样例——套件骨架必须与它同构
    const demo: unknown = JSON.parse(
      readFileSync(new URL('../../../examples/skills/demo-ping/skill.json', import.meta.url), 'utf8'),
    )
    expect(lintManifest(demo).ok).toBe(true)
    const skeleton = skeletonManifest('demo-ping')
    expect(Object.keys(skeleton.events)).toEqual(['plugin.demo-ping.ping'])
    expect(skeleton.hooks?.[0]?.on).toBe('session.created')
  })
})

describe('lint 拒绝路径（人话错误码）', () => {
  test('钩子 on 非内置词表 → E_SKILL_HOOK_TARGET', () => {
    const r = lintManifest({
      version: 1,
      name: 'demo-x',
      events: { 'plugin.demo-x.a': { data: { type: 'object' } } },
      hooks: [{ on: 'plugin.demo-x.a', emit: 'plugin.demo-x.a' }],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('E_SKILL_HOOK_TARGET'))).toBe(true)
  })

  test('钩子 emit 未声明 → E_SKILL_HOOK_EMIT', () => {
    const r = lintManifest({
      version: 1,
      name: 'demo-x',
      events: { 'plugin.demo-x.a': { data: { type: 'object' } } },
      hooks: [{ on: 'user.message', emit: 'plugin.demo-x.missing' }],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('E_SKILL_HOOK_EMIT'))).toBe(true)
  })

  test('data 不是可转换 JSON Schema → E_SKILL_DATA_SCHEMA', () => {
    const r = lintManifest({
      version: 1,
      name: 'demo-x',
      events: { 'plugin.demo-x.a': { data: { type: 'not-a-json-schema-type' } } },
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('E_SKILL_DATA_SCHEMA'))).toBe(true)
  })

  test('清单字段非法（名字大写 / 事件缺 plugin 前缀 / 多余字段）→ E_SKILL_MANIFEST', () => {
    for (const bad of [
      { version: 1, name: 'Demo', events: {} },
      { version: 1, name: 'demo-x', events: { 'notprefixed.a': { data: { type: 'object' } } } },
      { version: 1, name: 'demo-x', events: {}, extra: true },
    ]) {
      const r = lintManifest(bad)
      expect(r.ok).toBe(false)
      expect(r.errors.some((e) => e.includes('E_SKILL_MANIFEST'))).toBe(true)
    }
  })

  test('SKILL_NAME_RE：init 目录名推导的合法性口径与 schema 一致', () => {
    expect(SKILL_NAME_RE.test('demo-ping')).toBe(true)
    expect(SKILL_NAME_RE.test('Demo')).toBe(false)
    expect(SKILL_NAME_RE.test('-x')).toBe(false)
  })
})
