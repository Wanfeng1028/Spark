/**
 * 日志读取面单测（阶段十九工单 19.38 / V2-14）：尾部窗口、半行丢弃、级别"及以上"语义、
 * 子串过滤、非 JSON 行如实标 unparsed、文件缺失回空而非报错。
 * 夹具是**真写一个 engine.log**（读侧的全部难点都在字节窗口与行边界，桩数据测不出来）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { readLogs } from '../src/logs.js'

let root = ''

function writeLog(lines: readonly string[]): void {
  mkdirSync(join(root, 'logs'), { recursive: true })
  writeFileSync(join(root, 'logs', 'engine.log'), lines.join('\n') + '\n', 'utf8')
}

const line = (level: number, msg: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ level, time: 1700000000000, pid: 1, hostname: 'h', msg, ...extra })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spark-logs-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readLogs', () => {
  test('日志文件不存在 → 空结果而非抛错（首次运行前确实没有日志）', () => {
    const r = readLogs(root)
    expect(r.entries).toEqual([])
    expect(r.truncated).toBe(false)
    expect(r.path).toContain(join('logs', 'engine.log'))
  })

  test('pino 数值级别映射为名称，其余字段原样保留', () => {
    writeLog([line(30, 'engine.start', { sid: 'ses_a' }), line(50, 'tool.completed', { code: 'E_TOOL_TIMEOUT' })])
    const r = readLogs(root)
    expect(r.entries.map((e) => e.level)).toEqual(['info', 'error'])
    expect(r.entries[0]?.fields['sid']).toBe('ses_a')
    expect(r.entries[1]?.fields['code']).toBe('E_TOOL_TIMEOUT')
    // pid/hostname/time/msg 是信封字段，不混进 fields
    expect(r.entries[0]?.fields['pid']).toBeUndefined()
  })

  test('level 是"该级别及以上"：只要 error 时 fatal 也在，warn 被滤掉', () => {
    writeLog([line(30, 'a'), line(40, 'b'), line(50, 'c'), line(60, 'd')])
    const r = readLogs(root, { level: 'error' })
    expect(r.entries.map((e) => e.msg)).toEqual(['c', 'd'])
  })

  test('match 大小写不敏感且比字段（sid 片段能命中）', () => {
    writeLog([line(30, 'turn.start', { sid: 'ses_DEADBEEF' }), line(30, 'turn.completed', { sid: 'ses_other' })])
    expect(readLogs(root, { match: 'deadbeef' }).entries.map((e) => e.msg)).toEqual(['turn.start'])
  })

  test('尾部字节窗口起于文件中段时丢掉首个半行（不猜半行的内容）', () => {
    const first = line(30, 'first', { blob: 'x'.repeat(400) })
    const second = line(40, 'second')
    writeLog([first, second])
    // 窗口只够最后一条 + 前一条的尾巴：首行必为半行 → 丢弃，只剩 second
    const r = readLogs(root, { tailBytes: second.length + 20 })
    expect(r.truncated).toBe(true)
    expect(r.entries.map((e) => e.msg)).toEqual(['second'])
  })

  test('非 JSON 行不吞、并入他条，而是单独一条标 unparsed（"读不懂"≠"没有内容"）', () => {
    writeLog(['!!! 崩溃前的裸文本片段', line(30, 'engine.start')])
    const r = readLogs(root)
    expect(r.entries).toHaveLength(2)
    expect(r.entries[0]?.fields['unparsed']).toBe(true)
    expect(r.entries[0]?.msg).toContain('崩溃前')
  })

  test('limit 从尾部截且 truncated 如实为真', () => {
    writeLog([line(30, 'a'), line(30, 'b'), line(30, 'c')])
    const r = readLogs(root, { limit: 2 })
    expect(r.entries.map((e) => e.msg)).toEqual(['b', 'c'])
    expect(r.truncated).toBe(true)
  })

  test('字符串级别（pino 配成 prettified 输出时）也可识别', () => {
    writeLog([JSON.stringify({ level: 'warn', time: 1, msg: 'pretty.warn' })])
    const r = readLogs(root)
    expect(r.entries[0]?.level).toBe('warn')
  })
})
