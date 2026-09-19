/**
 * dist 外置导入可解析性校验（发布链路修复，回归报告发现③）：
 * esbuild --external 的裸导入在运行时按 node_modules 解析——若 external 的包不是
 * 本包直接依赖（pnpm 严格隔离），发布形态 `node dist/index.js` 必失败。
 * 规则：dist 内不得出现 from "@earendil-works/pi-ai" / from "pino"（两者非本包
 * 直接依赖，须入 bundle；fastify/@fastify/static/zod/playwright-core 是直接依赖，
 * external 合法）。
 */
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
const unresolvable = ['@earendil-works/pi-ai', 'pino'].filter((p) =>
  new RegExp(`from ["'][^"']*${p}["']`).test(src),
)
if (unresolvable.length > 0) {
  console.error(`[check-dist] dist 含不可解析的外置导入（运行时必失败）：${unresolvable.join(', ')}`)
  process.exit(1)
}
console.log('[check-dist] 外置导入全部可解析（pi-ai/pino 已入 bundle）')
