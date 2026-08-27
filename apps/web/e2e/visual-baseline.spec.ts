/**
 * 视觉基线首批（doc/06 §1 L3.5 / 工单 6.8）：1280/1440/375 三视口截图入
 * apps/web/e2e/__screenshots__/（欢迎页空态 + 会话态有内容）。
 * 基线更新只允许随实现同一 PR 提交（doc/06 §2 纪律）。
 */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const OUT_DIR = fileURLToPath(new URL('./__screenshots__', import.meta.url))
const VIEWPORTS = [1280, 1440, 375] as const

test.beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true })
})

test('三视口截图：欢迎页（空态垂直居中）+ 会话页（normal 场景有内容）', async ({ page }) => {
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })

    // 欢迎页：问候语 + 居中 Composer + 4 chips
    await page.goto('/')
    await expect(page.getByLabel('快捷提示词')).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: `${OUT_DIR}/welcome-${width}.png` })

    // 会话页：normal 场景直发 → 内容回放进行中截图
    // （就绪信号用 TurnStatusBar——虚拟列表在窄视口会裁剪早期消息文本，断言 DOM 文本不可靠）
    const box = page.getByPlaceholder(/向 Spark 提问/)
    await box.fill('读一下 src/index.ts，把 MAX_RETRY 改名为 RETRY_LIMIT，然后跑测试')
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/session\//)
    await expect(page.getByRole('status').filter({ hasText: '等待审批' })).toBeVisible({
      timeout: 20_000,
    })
    await page.screenshot({ path: `${OUT_DIR}/session-${width}.png` })
  }
})
