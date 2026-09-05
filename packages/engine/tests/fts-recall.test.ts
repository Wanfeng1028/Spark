/**
 * FTS/LIKE 召回链共享助手单测（工单 R-C：memory/search 两 store 同源收敛）。
 * store 级召回行为在 memory.test.ts / search.test.ts 端到端覆盖，此处只钉纯函数契约。
 */
import { describe, expect, test } from 'vitest'
import { escapeLike, longestToken, TRIGRAM_MIN } from '../src/db/fts-recall.js'

describe('fts-recall 共享助手', () => {
  test('longestToken：空白拆词取最长（≥2 字符；全不达标 → null）', () => {
    expect(longestToken('which package manager do we use')).toBe('package')
    expect(longestToken('ab cd')).toBe('ab') // 等长取首个
    expect(longestToken('a b c')).toBe(null) // 全部单字符
    expect(longestToken('')).toBe(null)
    expect(longestToken('  spaced\tout ')).toBe('spaced')
  })

  test('escapeLike：反斜杠先行、%/_ 逐字转义（配合 SQL ESCAPE 使用）', () => {
    expect(escapeLike('50%')).toBe('50' + String.fromCharCode(92) + '%')
    expect(escapeLike('a_b')).toBe('a' + String.fromCharCode(92) + '_b')
    expect(escapeLike('a' + String.fromCharCode(92) + 'b')).toBe(
      'a' + String.fromCharCode(92) + String.fromCharCode(92) + 'b',
    )
    expect(escapeLike('plain text')).toBe('plain text')
  })

  test('TRIGRAM_MIN = 3（FTS5 trigram 最短查询长度契约）', () => {
    expect(TRIGRAM_MIN).toBe(3)
  })
})
