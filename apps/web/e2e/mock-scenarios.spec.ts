/**
 * E2E 首批（doc/06 §1 标准用例集 1：mock 四场景回归）：
 * normal / long-output / reject / error-finish——流式渲染、工具三态、
 * 审批挂起→答复→续播、error finish 黄条+重试。跑在 VITE_SPARK_MOCK=1。
 * 注：mock 场景切换条只在会话页渲染（SessionPage 开发夹具），故先进任一会话再切场景。
 */
import { expect, test, type Page } from '@playwright/test'

/** Composer 输入框（侧栏「搜索会话」同为 textbox——按占位文案唯一定位） */
const composer = (page: Page) => page.getByPlaceholder(/向 Spark 提问/)

/** 进入任一会话（normal 场景）——暴露 mock 夹具条 */
async function enterSession(page: Page): Promise<void> {
  await page.goto('/')
  await composer(page).fill('开始')
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/session\//)
}

/** 会话页切换 mock 场景（夹具条按钮 → 新建脚本会话并跳转） */
async function switchScenario(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click()
  // 切场景即 replace 跳转到新脚本会话：以输入框重新可用为准
  await expect(composer(page)).toBeEnabled({ timeout: 10_000 })
}

/** 虚拟列表未跟随到底时把会话流滚到底（审批卡/工具卡可能在渲染窗口外） */
async function scrollToBottom(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: '回到底部' })
  if (await btn.isVisible()) await btn.click()
}

test.describe('mock 场景 normal：流式→审批挂起→允许→续播', () => {
  test('发送后流式回复，审批卡出现，允许一次后 turn 完成', async ({ page }) => {
    await page.goto('/')
    await composer(page).fill('读一下 src/index.ts，把 MAX_RETRY 改名为 RETRY_LIMIT，然后跑测试')
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/session\//)

    // 流式回复：assistant 文本渲染（脚本首段 reasoning+text）
    await expect(page.getByText('先读文件确认定义与引用位置').first()).toBeVisible({
      timeout: 15_000,
    })

    // 工具卡：read 完成 → edit 触发审批挂起（@wait approval）
    // 挂起信号先用 Composer 占位（waiting 态恒在 DOM），再滚到底让审批卡进渲染窗口
    await expect(page.getByPlaceholder(/等待审批中/)).toBeDisabled({ timeout: 15_000 })
    await scrollToBottom(page)
    const approval = page.getByRole('alert').filter({ hasText: '审批' })
    await expect(approval).toBeVisible({ timeout: 15_000 })

    // 审批挂起：Composer 输入禁用（§6.2.2 三态；占位文案随 waiting 切换）
    await expect(page.getByPlaceholder(/等待审批中/)).toBeDisabled()

    // 允许一次 → 续播 → 审批卡转结果态
    await approval.getByRole('button', { name: '允许一次' }).click()
    await expect(approval.getByText(/已允许/)).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('mock 场景 reject：审批拒绝→feedback 回喂', () => {
  test('拒绝并填写原因，审批卡转为已拒绝', async ({ page }) => {
    await enterSession(page)
    await switchScenario(page, 'reject')

    await composer(page).fill('把 config.ts 里的 timeout 从 3000 改成 5000，直接写进去')
    await page.keyboard.press('Enter')

    // 挂起信号（waiting 占位）→ 滚到底 → 审批卡进渲染窗口
    await expect(page.getByPlaceholder(/等待审批中/)).toBeDisabled({ timeout: 15_000 })
    await scrollToBottom(page)
    const approval = page.getByRole('alert').filter({ hasText: '审批' })
    await expect(approval).toBeVisible({ timeout: 15_000 })

    await approval.getByRole('button', { name: '拒绝' }).click()
    await approval.getByPlaceholder(/拒绝原因/).fill('不要改配置')
    await approval.getByRole('button', { name: '确认拒绝' }).click()
    await expect(approval.getByText('已拒绝（reject）')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('mock 场景 long-output：工具长输出', () => {
  test('bash 工具流式 progress 后完成，折叠摘要可展开', async ({ page }) => {
    await enterSession(page)
    await switchScenario(page, 'long-output')

    await composer(page).fill('跑一次 pnpm test --reporter=verbose，我要看全部输出')
    await page.keyboard.press('Enter')

    // 工具卡完成态（125 条 progress 回放完；@speed 4 加速）
    // 就绪信号用 TurnStatusBar（悬浮条恒在 DOM：bash 徽标=工具运行中）→ 滚到底让工具卡进渲染窗口
    // （展开区断言在 L2 组件测试覆盖——E2E 虚拟列表节点回收会重置卡片展开态，不在此断言）
    // 卡片头部自 10.4 起为人话类别词（bash→终端），raw name 只在 title——定位器按头部文本
    const toolCard = page.locator('button[aria-expanded]').filter({ hasText: '终端' })
    await expect(page.getByRole('status').filter({ hasText: 'bash' })).toBeVisible({
      timeout: 15_000,
    })
    await scrollToBottom(page)
    await expect(toolCard).toContainText('完成', { timeout: 30_000 })
  })
})

test.describe('mock 场景 error-finish：错误闭合', () => {
  test('turn 以 error 结束→黄条+重试可见', async ({ page }) => {
    await enterSession(page)
    await switchScenario(page, 'error-finish')

    await composer(page).fill('读一下 package.json，然后把 description 改成中文')
    await page.keyboard.press('Enter')

    // error finish 黄条（§6.2.2 状态矩阵）+ 重试按钮（exact：侧栏会话名「重构重试常量」含"重试"）
    await expect(page.getByText('本轮以 error 结束')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
  })
})
