/**
 * bash 沙箱（阶段五工单 5.2，ADR D15）：平台 wrapper 前缀——Linux bwrap /
 * macOS Seatbelt（sandbox-exec）；Windows 本期不做 OS 级（AppContainer 无法
 * 任意路径只读，否决记录见 ARCHITECTURE D15），防线维持审批 + 路径硬边界。
 * 语义 = workspace-write：全盘只读，仅工作区与系统临时目录可写（Claude Code 同款姿态）。
 * 网络隔离 v1 不做（Claude Code 走沙箱外 SOCKS5 代理，复杂度后置，ADR D15 记录）。
 * fail-closed：mode 'on' 且 wrapper 不可用 → E_SANDBOX_UNAVAILABLE，不降级裸跑。
 */
import { spawnSync } from 'node:child_process'

export type BashSandboxMode = 'off' | 'on'

export interface SandboxWrapper {
  file: string
  /** 前缀参数；其后接原 shell 与命令 */
  args: string[]
}

/** bwrap 参数（Linux）：根只读挂载 + cwd 可写 + /dev /proc + 私有 /tmp */
export function bwrapArgs(cwd: string): string[] {
  return [
    '--ro-bind', '/', '/',
    '--bind', cwd, cwd,
    '--dev', '/dev',
    '--proc', '/proc',
    '--tmpfs', '/tmp',
    '--',
  ]
}

/** Seatbelt profile（macOS）：默认全放行，仅写操作限 cwd 与系统临时目录 */
export function seatbeltProfile(cwd: string, tmpdir: string): string {
  return (
    '(version 1)(allow default)(deny file-write*)' +
    `(allow file-write* (subpath "${cwd}")(subpath "${tmpdir}"))`
  )
}

const probeCache = new Map<string, boolean>()

/** wrapper 可用性探测（command -v；进程内缓存）。win32 恒 false（无 wrapper 路线） */
export function wrapperAvailable(platform: NodeJS.Platform, cmd: string): boolean {
  if (platform === 'win32') return false
  const hit = probeCache.get(cmd)
  if (hit !== undefined) return hit
  const ok = spawnSync('/bin/sh', ['-c', `command -v ${cmd}`]).status === 0
  probeCache.set(cmd, ok)
  return ok
}

/** 平台对应的 wrapper 前缀；win32 返回 null（ADR D15：本期无 OS 级沙箱） */
export function resolveSandboxWrapper(
  platform: NodeJS.Platform,
  opts: { cwd: string; tmpdir: string },
): SandboxWrapper | null {
  if (platform === 'linux') {
    return { file: 'bwrap', args: bwrapArgs(opts.cwd) }
  }
  if (platform === 'darwin') {
    return { file: 'sandbox-exec', args: ['-p', seatbeltProfile(opts.cwd, opts.tmpdir)] }
  }
  return null
}
