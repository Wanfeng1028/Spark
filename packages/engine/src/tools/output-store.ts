/**
 * 输出限界（doc/02 §5.6.4）：序列化后 ≤32KB 原样返回；超限 → 截断 + 尾注，
 * 全文溢写 ~/.spark/tool-outputs/<callId>（异步写；会话关闭前 flush 由 store 负责）。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CallId } from '@spark/protocol'

export class ToolOutputStore {
  constructor(
    private readonly limitBytes: number = 32 * 1024,
    private readonly dir: string = join(homedir(), '.spark', 'tool-outputs'),
  ) {}

  async bound(output: unknown, callId: CallId): Promise<unknown> {
    const text = this.serialize(output)
    if (Buffer.byteLength(text, 'utf8') <= this.limitBytes) return output
    await mkdir(this.dir, { recursive: true })
    await writeFile(join(this.dir, callId), text, 'utf8')
    // 字节边界截断（多字节字符可能被切断，接受——截断输出本就是降级形态）
    const sliced = Buffer.from(text, 'utf8').subarray(0, this.limitBytes).toString('utf8')
    return `${sliced}…truncated, full output: ~/.spark/tool-outputs/${callId}`
  }

  private serialize(output: unknown): string {
    if (typeof output === 'string') return output
    return JSON.stringify(output) ?? 'null'
  }
}
