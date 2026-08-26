/**
 * E2E 首批（doc/06 §1 标准用例集 3：用户断线场景）：
 * - mock 夹具「模拟断线」→ StatusBar 断线文案与状态点；恢复连接续播；
 * - 未知会话 id → mock getSession 抛 E_MOCK_UNKNOWN_SESSION → 顶部细条人话文案
 *   （工单 6.7 验收载体：title 人话 + 原码折叠详情 + 重试）。
 * 注：「模拟断线」开关是 SessionPage 开发夹具，先进会话再操作。
 */
import { expect, test, type Page } from '@playwright/test'

const composer = (page: Page) => page.getByPlaceholder(/向 Spark 提问/)

test.describe('断线与错误态（H14 / 工单 6.7 验收）', () => {
  test('模拟断线：StatusBar 转「已断线，重连中…」，恢复后回「已连接」', async ({ page }) => {
    await page.goto('/')
    await composer(page).fill('开始')
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/session\//)

    // StatusBar 初始已连接（mock 即挂即用）
    await expect(page.getByText('已连接').first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: '模拟断线' }).click()
    // 断线文案出现两处（页面级 status 横条 + StatusBar）——任一可见即断线态成立
    await expect(page.getByText('已断线，重连中…').first()).toBeVisible()

    await page.getByRole('button', { name: '恢复连接' }).click()
    await expect(page.getByText('已连接').first()).toBeVisible()
  })

  test('E_MOCK_UNKNOWN_SESSION：人话文案「会话不存在或已被清理」+ 原码折叠 + 重试', async ({
    page,
  }) => {
    await page.goto('/session/ses_UNKNOWN999')
    const banner = page.getByRole('alert')
    // 工单 6.7 判例：title 出人话，原码折叠进详情
    await expect(banner).toContainText('会话不存在或已被清理', { timeout: 10_000 })
    await expect(banner.getByText('重新加载会话')).toBeVisible()

    // 折叠详情展开：原码 E_MOCK_UNKNOWN_SESSION: ses_UNKNOWN999 可见
    await banner.getByRole('button', { name: /E_MOCK_UNKNOWN_SESSION/ }).click()
    await expect(banner.getByText(/ses_UNKNOWN999/)).toBeVisible()
  })
})
