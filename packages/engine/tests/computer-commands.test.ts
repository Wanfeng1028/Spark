/**
 * 电脑控制可执行名封闭集断言（doc/11 LA-06 验收）：三平台执行体 spawn 的可执行文件名
 * 集合封闭且拼写正确——`screapture` 事故（macos.ts 拼错必然失败且被文档一字不动复读）
 * 的直接防复发闸：源码里所有 `run('<cmd>'` / `spawn('<cmd>'` 首参都必须落在各平台的
 * 允许名表内，拼错的命令名不在表内即红；macOS 允许表同时逐字钉住 `screencapture` 正字。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/computer')

/** 各平台允许的可执行名（封闭集；新增命令 = 先改这里再改执行体） */
const ALLOWED: Record<string, readonly string[]> = {
  'windows.ts': ['powershell.exe'],
  'macos.ts': ['osascript', 'screencapture', 'open', 'pbcopy', 'pbpaste'],
  'linux.ts': ['scrot', 'import', 'xdotool', 'wmctrl', 'xclip', 'ps'],
}

/** 提取源码里 run('cmd' / spawn('cmd' 的首参字面量 */
function extractedCommands(file: string): string[] {
  const src = readFileSync(join(DIR, file), 'utf8')
  const out: string[] = []
  // \s* 吸收 windows.ts 的多行 spawn（spawn(\n 'powershell.exe', ...)
  for (const m of src.matchAll(/\b(?:run|spawn)\(\s*'([^']+)'/g)) {
    const cmd = m[1]
    if (cmd !== undefined) out.push(cmd)
  }
  return out
}

describe('电脑控制可执行名封闭集（LA-06）', () => {
  for (const [file, allowed] of Object.entries(ALLOWED)) {
    test(`${file}：全部命令名落在允许表内（拼错即不在表内而红）`, () => {
      const used = extractedCommands(file)
      expect(used.length).toBeGreaterThan(0)
      const unknown = [...new Set(used)].filter((c) => !allowed.includes(c))
      expect(unknown).toEqual([])
    })
    test(`${file}：允许表每个名字都被真实用到（防表空转）`, () => {
      const used = new Set(extractedCommands(file))
      const unused = allowed.filter((c) => !used.has(c))
      expect(unused).toEqual([])
    })
  }

  test('macOS 截图正字在位、错字全仓源码零命中', () => {
    const macos = readFileSync(join(DIR, 'macos.ts'), 'utf8')
    expect(macos).toContain("run('screencapture'")
    expect(macos).not.toContain('screapture')
  })
})
