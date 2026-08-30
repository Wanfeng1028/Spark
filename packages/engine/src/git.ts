/**
 * git 只读探测（工单 10.6）：会话创建时取 cwd 的当前分支。
 * 纪律：只读、失败静默（非仓库/无 git/超时 → null，前端不渲染——禁假状态）。
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** 探测超时与输出上限（分支名不会超过几十字节；防挂死） */
const TIMEOUT_MS = 3000
const MAX_BUFFER = 4096

export async function gitBranchOf(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    })
    const branch = stdout.trim()
    // detached HEAD 时输出 "HEAD"——不是分支名，如实不携带
    return branch === '' || branch === 'HEAD' ? null : branch
  } catch {
    return null
  }
}
