/**
 * 终端 shell 探测判据单测（19.32 批 1）：Git Bash 四惯例位 + PATH 兜底的优先级、
 * 找到即用（exists 注入）、全 miss 回退 cmd.exe（windir 可注入）、非 Windows 返回
 * null（不猜 mac/linux——Windows 先行与 computer-use 同口径）。
 */
import { describe, expect, it } from 'vitest'
import { gitBashCandidates, shellProfileOf } from '../src/terminal-shell'

const WIN_ENV = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  windir: 'C:\\Windows',
}

describe('gitBashCandidates', () => {
  it('四个根目录各出 bin/usr/bin 两形态，顺序即优先级；PATH 兜底按分号拆', () => {
    const list = gitBashCandidates({
      ProgramFiles: 'C:\\PF',
      Path: 'C:\\Git\\cmd;C:\\tools',
    })
    expect(list[0]).toBe('C:\\PF\\Git\\bin\\bash.exe')
    expect(list).toContain('C:\\Git\\cmd\\bash.exe')
    // 空段与未设根不产出坏条目
    expect(list.every((p) => !p.startsWith('\\'))).toBe(true)
  })
})

describe('shellProfileOf', () => {
  it('Git Bash 命中：bin 位优先、登录态参数、label 正确', () => {
    const found: string[] = []
    const profile = shellProfileOf(
      'win32',
      WIN_ENV,
      (p) => {
        found.push(p)
        return p === 'C:\\Program Files\\Git\\bin\\bash.exe'
      },
    )
    expect(profile).not.toBeNull()
    expect(profile?.file).toBe('C:\\Program Files\\Git\\bin\\bash.exe')
    expect(profile?.args).toEqual(['--login', '-i'])
    expect(profile?.label).toBe('Git Bash')
    // 命中即停：不再探测后续候选（usr/bin 位与 PATH 都没被问）
    expect(found).toHaveLength(1)
  })

  it('全 miss 回退 cmd.exe（windir 注入；args 空）', () => {
    const profile = shellProfileOf('win32', WIN_ENV, () => false)
    expect(profile?.file).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(profile?.args).toEqual([])
    expect(profile?.label).toBe('cmd.exe')
  })

  it('非 Windows 返回 null（不猜平台——终端 Windows 先行）', () => {
    expect(shellProfileOf('darwin', {}, () => true)).toBeNull()
    expect(shellProfileOf('linux', {}, () => true)).toBeNull()
  })
})
