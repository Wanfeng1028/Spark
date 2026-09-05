/**
 * pnpm eval 入口（阶段七工单 7.11 / H10，doc/06 §2 nightly 层）：
 * 恒跑 ScriptedLlm 回归场景集（无网络、无真实模型）；--real 追加可选真实模型评分
 * （无配置/凭据 → skip 不红）。退出码：任一 fail → 1（nightly 红灯依据）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scenarios } from './scenarios/index.js'
import { realScenarios } from './real.js'
import { taskScenarios } from './tasks/scenarios.js'
import type { EvalOutcome, EvalScenario } from './harness.js'

interface Row {
  name: string
  outcome: EvalOutcome
}

const STATUS_LABEL: Record<EvalOutcome['status'], string> = {
  pass: 'PASS',
  fail: 'FAIL',
  skip: 'SKIP',
}

async function runAll(list: EvalScenario[]): Promise<Row[]> {
  const rows: Row[] = []
  for (const s of list) {
    let outcome: EvalOutcome
    try {
      outcome = await s.run()
    } catch (err) {
      outcome = { status: 'fail', notes: [`场景未捕获异常：${String(err)}`] }
    }
    rows.push({ name: s.name, outcome })
  }
  return rows
}

function printReport(rows: Row[]): void {
  console.log('')
  console.log('Spark eval 报告')
  console.log('-'.repeat(72))
  for (const { name, outcome } of rows) {
    console.log(`[${STATUS_LABEL[outcome.status]}] ${name}`)
    for (const note of outcome.notes) console.log(`       ${note}`)
  }
  const passed = rows.filter((r) => r.outcome.status === 'pass').length
  const failed = rows.filter((r) => r.outcome.status === 'fail').length
  const skipped = rows.filter((r) => r.outcome.status === 'skip').length
  console.log('-'.repeat(72))
  console.log(`共 ${rows.length} 场景：${passed} 通过 / ${failed} 失败 / ${skipped} 跳过`)
}

async function main(): Promise<void> {
  const real = process.argv.includes('--real')
  const suiteIndex = process.argv.indexOf('--suite')
  const suite = suiteIndex !== -1 ? (process.argv[suiteIndex + 1] ?? 'core') : 'core'

  const rows: Row[] = []
  if (suite === 'core' || suite === 'all') rows.push(...(await runAll(scenarios)))
  if (real && (suite === 'real' || suite === 'all')) rows.push(...(await runAll(realScenarios)))
  if (real && (suite === 'tasks' || suite === 'all')) rows.push(...(await runAll(taskScenarios)))

  printReport(rows)
  if (rows.some((r) => r.outcome.status === 'fail')) process.exitCode = 1
  // 真评报告落盘（工单 13.1）：examples/evals/reports/<date>-<suite>.json——基线与趋势素材
  if (real && rows.length > 0) {
    const dir = join(process.cwd(), 'examples', 'evals', 'reports')
    mkdirSync(dir, { recursive: true })
    const report = {
      date: new Date().toISOString(),
      suite,
      rows: rows.map((r) => ({ name: r.name, ...r.outcome })),
    }
    writeFileSync(join(dir, `${report.date.slice(0, 10)}-${suite}.json`), JSON.stringify(report, null, 2))
  }
}

await main()
