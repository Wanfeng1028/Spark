/**
 * 内置终端 shell 探测判据（工单 19.32 批 1；GeneralPage「集成终端 Shell」行的
 * 事实源）。纯函数零 Electron 依赖——pty 管理器（批 2：node-pty + preload/IPC 白名单
 * 通道 + xterm 面板一体落地）消费这里的 profile，renderer 永远不传 shell 路径
 * （安全清单 S1：spawn 参数由 main 进程从本判定产生，IPC 面上没有 shell 字段）。
 *
 * 探测口径 = GeneralPage 占位行文案「Git Bash 优先，回退 cmd.exe」：
 * ① Git Bash：Common Files 与 ProgramFiles 两处惯例路径 + PATH 兜底，逐处 existsSync；
 * ② 回退 cmd.exe（系统盘卷标探测失败也回这里——Windows 一定有）；
 * ③ 返回 null 语义预留给非 Windows 档（批 2 决定 $SHELL 直通还是先锁 Windows——
 * 19.1/19.2 的 computer-use 就是 Windows 先行，终端同理不猜 mac/linux）。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface ShellProfile {
  /** 可执行文件绝对路径（spawn file；不进 IPC 面） */
  file: string
  /** spawn 参数（bash 用登录态 --login -i 保住 PATH/别名；cmd 免参数） */
  args: readonly string[]
  /** 设置行展示名 */
  label: 'Git Bash' | 'cmd.exe'
}

/** bash.exe 常规安装位（优先级即顺序；批 2 的 pty spawn 只吃本函数产物） */
export function gitBashCandidates(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const out: string[] = []
  const roots = [
    env.ProgramFiles,
    env['ProgramFiles(x86)'],
    env['CommonProgramFiles(x86)'],
    env.LocalAppData,
  ]
  for (const root of roots) {
    if (root === undefined || root === '') continue
    out.push(join(root, 'Git', 'bin', 'bash.exe'))
    out.push(join(root, 'Git', 'usr', 'bin', 'bash.exe'))
  }
  // scoop/choco 等走 PATH 兜底（值为分号分隔清单）
  const path = env.Path ?? env.PATH
  if (path !== undefined) {
    for (const dir of path.split(';')) {
      if (dir.trim() !== '') out.push(join(dir.trim(), 'bash.exe'))
    }
  }
  return out
}

/** Windows 首个存在的候选；找不到回退 cmd.exe（系统卷探测失败也不让终端无 shell） */
export function shellProfileOf(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  exists: (p: string) => boolean = existsSync,
): ShellProfile | null {
  if (platform !== 'win32') return null
  for (const candidate of gitBashCandidates(env)) {
    if (exists(candidate)) {
      return { file: candidate, args: ['--login', '-i'], label: 'Git Bash' }
    }
  }
  const windir = env.windir ?? 'C:\\Windows'
  return { file: join(windir, 'System32', 'cmd.exe'), args: [], label: 'cmd.exe' }
}
