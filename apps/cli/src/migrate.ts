/**
 * spark migrate <target>（阶段十九 19.16）：数据目录搬迁 CLI。
 * 流程：planMigration 只读校验（源可读/目标空/目标非当前目录）→ 终端两段式确认 →
 * runMigration（复制 → 字节校验 → 源改名 .bak-<ts>，**不删源**）。
 * 校验不过/确认拒绝 → 退出码 1，源原样保留（fail-closed）。
 */
import { createInterface } from 'node:readline'
import { planMigration, runMigration, MigrationError } from '@spark/engine'
import { sparkHome } from '@spark/engine'

const MIGRATE_USAGE = `用法：spark migrate <target-dir>

把当前数据目录（SPARK_HOME 或 ~/.spark）整体搬迁到 target-dir：
  1. 校验源可读、目标为空、目标不是当前目录
  2. 终端确认后复制 + 字节校验
  3. 源改名 <src>.bak-<时间戳>（不删除——人工确认后可自行处置）

搬迁后把 SPARK_HOME 指向新目录再启动（或改回缺省路径后移入 ~/.spark）。
`

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(/^y(es)?$/i.test(answer.trim()))
    })
  })
}

/** 返回退出码（0 = 成功，1 = 失败/拒绝） */
export async function runMigrate(target: string | undefined): Promise<number> {
  if (target === undefined || target.trim() === '') {
    process.stderr.write(MIGRATE_USAGE)
    return 1
  }
  const from = sparkHome()
  try {
    const plan = await planMigration(from, target)
    process.stdout.write(
      `迁移规划：\n  源：${plan.from}（${String(plan.entries)} 项，${String(plan.bytes)} 字节）\n  目标：${plan.to}\n` +
        `源目录将改名 ${plan.from}.bak-<ts>（不删除）。\n`,
    )
    const ok = await confirm('确认搬迁？输入 yes 继续：')
    if (!ok) {
      process.stdout.write('已取消（源目录未改动）\n')
      return 1
    }
    const { backup } = await runMigration(plan)
    process.stdout.write(`完成。备份：${backup}\n请将 SPARK_HOME 指向 ${plan.to} 后启动。\n`)
    return 0
  } catch (err) {
    const msg = err instanceof MigrationError ? err.message : err instanceof Error ? err.message : String(err)
    process.stderr.write(`spark migrate: ${msg}\n`)
    return 1
  }
}
