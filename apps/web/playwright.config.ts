/**
 * Playwright 配置（doc/06 §1 L3/L3.5，工单 6.8 首批）：
 * - 单浏览器 chromium（禁多浏览器矩阵）；沙箱内 PLAYWRIGHT 官方 CDN 被网关拦截时，
 *   以 SPARK_E2E_BROWSER 指向系统 Chrome（Chrome for Testing）executablePath 兜底；
 * - webServer 起 Vite dev（VITE_SPARK_MOCK=1），全部用例跑 mock 四场景与断线态；
 * - 单 worker 串行：mock transport 是页面内单例，多页并行会互相干扰脚本回放。
 */
import { defineConfig } from '@playwright/test'

const PORT = 5173
const executablePath = process.env.SPARK_E2E_BROWSER

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './e2e/.artifacts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    ...(executablePath !== undefined
      ? { launchOptions: { executablePath, args: ['--no-sandbox'] } }
      : {}),
  },
  expect: {
    // 视觉基线（doc/06 §1 L3.5）：阈值 0.1% 未启用 diff——首批先落基线截图本身
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 5173 --strictPort',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { VITE_SPARK_MOCK: '1' },
  },
})
