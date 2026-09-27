/**
 * LA-53 守护断言：各端不得自写 ui-copy 单源文案——web 聊天面四类文案
 * （审批回执 / 工具状态 / 回合时长 / 严重度取色）只许从 `@spark/protocol`
 * 的 ui-copy 引用，平行实现（字面量或本地函数）回潮即红。
 * 断言形式 = 源码扫描（grep 式），与 check_doc_links.py 的检查器同思路：
 * 软提醒挡不住漂移，测试才是强制层。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CHAT_DIR = join(__dirname, '../src/features/chat')
const LIB_TIME = join(__dirname, '../src/lib/time.ts')

function chatSources(): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = []
  for (const f of readdirSync(CHAT_DIR)) {
    if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue
    out.push({ file: f, text: readFileSync(join(CHAT_DIR, f), 'utf8') })
  }
  return out
}

describe('LA-53：ui-copy 单源守护', () => {
  it('聊天面不得出现审批回执平行字面量（已允许（/已拒绝（reject））', () => {
    for (const { file, text } of chatSources()) {
      expect(text, `${file} 回潮了审批回执字面量——请改引 approvalResolvedText`).not.toMatch(
        /已允许（/,
      )
      expect(text, `${file} 回潮了审批回执字面量——请改引 approvalResolvedText`).not.toContain(
        '已拒绝（reject）',
      )
    }
  })

  it('回合时长不得自持实现（lib/time.ts 只许 re-export 单源）', () => {
    const text = readFileSync(LIB_TIME, 'utf8')
    expect(text).not.toMatch(/function formatTurnDuration/)
    expect(text).toContain("export { turnDurationText as formatTurnDuration }")
  })

  it('严重度取色不得自持映射（映射必须走 protocol severityOf）', () => {
    for (const { file, text } of chatSources()) {
      if (text.includes('function severityText')) {
        expect(text, `${file} severityText 必须委托 protocol severityOf`).toContain(
          'severityOf(',
        )
      }
    }
  })
})
