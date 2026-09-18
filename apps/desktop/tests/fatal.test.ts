/**
 * renderFatalHtml 单测（AUD-12）：首启失败引导页 HTML——含标题/原因/配置路径/
 * 日志提示；reason 含 <script> 时被转义（配置内容不可注入 HTML）；纯字符串
 * 函数（无 IO、无脚本、无外部资源）。
 */
import { describe, expect, test } from 'vitest'
import { renderFatalHtml } from '../src/fatal.js'

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
