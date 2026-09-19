/**
 * renderFatalHtml 单测（AUD-12）：首启失败引导页 HTML——含标题/原因/配置路径/
 * 日志提示；reason 含 <script> 时被转义（配置内容不可注入 HTML）；纯字符串
 * 函数（无 IO、无脚本、无外部资源）。
 */
import { describe, expect, test } from 'vitest'
import { renderFatalHtml, renderFirstRunHtml } from '../src/fatal.js'

const INPUT = {
  title: 'Spark 启动失败',
  reason: 'E_CONFIG: models.json 缺失或损坏',
  sparkDir: 'C:\\Users\\me\\.spark',
  logHint: 'C:\\Users\\me\\.spark\\logs',
}

describe('renderFatalHtml（AUD-12 首启失败引导窗）', () => {
  test('含标题、原因、配置文件路径与日志位置指引、重启说明', () => {
    const html = renderFatalHtml(INPUT)
    expect(html).toContain('Spark 启动失败')
    expect(html).toContain('E_CONFIG: models.json 缺失或损坏')
    expect(html).toContain('首次使用需要配置模型')
    expect(html).toContain('C:\\Users\\me\\.spark/models.json')
    expect(html).toContain('C:\\Users\\me\\.spark\\logs')
    expect(html).toContain('请重启应用重试')
  })

  test('reason 含 HTML 时被转义（<script> 不落地，配置内容不可注入）', () => {
    const html = renderFatalHtml({
      ...INPUT,
      reason: '坏配置 <script>alert(1)</script> & "quotes"',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
  })

  test('纯字符串函数：自包含 HTML、无脚本标签、无外部资源引用', () => {
    const html = renderFatalHtml(INPUT)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toContain('<script')
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
    expect(html).not.toContain('src=')
  })
})

describe('renderFirstRunHtml（RT3-01 首启引导窗）', () => {
  const FR_INPUT = {
    sparkDir: 'C:\\Users\\me\\.spark',
    modelsPath: 'C:\\Users\\me\\.spark\\models.json',
  }

  test('含欢迎语、配置文件路径、最小模板、密钥纪律与自动续启说明', () => {
    const html = renderFirstRunHtml(FR_INPUT)
    expect(html).toContain('欢迎使用 Spark')
    expect(html).toContain('C:\\Users\\me\\.spark\\models.json')
    // 模板文本经 escapeHtml（" → &quot;），断言不带引号字面量
    expect(html).toContain('providers')
    expect(html).toContain('apiKeyEnv')
    expect(html).toContain('defaultModel')
    expect(html).toContain('环境变量')
    expect(html).toContain('自动检测并继续启动')
  })

  test('路径含 HTML 时被转义（<script> 不落地）；无脚本标签（模板里的 https 除外，不属外部资源）', () => {
    const html = renderFirstRunHtml({ sparkDir: '<x> & "y"', modelsPath: 'C:\\m.json' })
    expect(html).not.toContain('<x>')
    expect(html).toContain('&lt;x&gt;')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('src=')
  })
})
