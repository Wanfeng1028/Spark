/**
 * 数据目录解析（阶段十九 19.16）：**单一来源**——SPARK_HOME 环境变量优先，
 * 缺省 ~/.spark。引擎 root / loadConfig 缺省 / CLI / server 全部经此函数，
 * 不再各自 join(homedir(), '.spark')（那正是"改一处漏三处"漂移的源头）。
 */
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'

/** 数据目录名（缺省，相对 homedir） */
export const SPARK_HOME_DIR = '.spark'

/** 解析数据目录（SPARK_HOME 优先；空串视为未设——不把"显式设成空"当合法路径） */
export function sparkHome(env: Record<string, string | undefined> = process.env): string {
  const raw = env.SPARK_HOME
  if (raw !== undefined && raw.trim() !== '') {
    const p = raw.trim()
    // 相对路径按 cwd 解析并明确化（环境变量里的 './x' 不该依赖调用方 cwd 语义）
    return isAbsolute(p) ? resolve(p) : resolve(process.cwd(), p)
  }
  return resolve(homedir(), SPARK_HOME_DIR)
}

/** 是否显式设置了 SPARK_HOME（设置页如实回显用） */
export function hasExplicitSparkHome(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.SPARK_HOME
  return raw !== undefined && raw.trim() !== ''
}
