/**
 * 侧栏分组数据源单测：项目分组（工单 6.2 / DESIGN §13.A）——
 * cwd → 项目名（目录名）——Windows/POSIX 分隔符、尾分隔符、空串兜底；
 * 时间分组段（工单 10.5②）——自然日边界四段。
 */
import { describe, expect, it } from 'vitest'
import { projectOf, timeGroupOf } from '../src/components/layout/Sidebar'

describe('projectOf（cwd → 项目名）', () => {
  it('POSIX 绝对路径取末段目录名', () => {
    expect(projectOf('/home/wanfeng/Spark')).toBe('Spark')
  })

  it('Windows 路径取末段目录名（含盘符）', () => {
    expect(projectOf('E:/code/javascript/project/Spark')).toBe('Spark')
    expect(projectOf('E:\\code\\demo')).toBe('demo')
  })

  it('mungeDir 形态（`-` 连接 + hash8 尾）原样取整段', () => {
    expect(projectOf('E-code-javascript-project-Spark-1a2b3c4d')).toBe(
      'E-code-javascript-project-Spark-1a2b3c4d',
    )
  })

  it('尾分隔符不产生空段', () => {
    expect(projectOf('/home/wanfeng/Spark/')).toBe('Spark')
  })

  it('空 cwd 兜底「未分组」', () => {
    expect(projectOf('')).toBe('未分组')
    expect(projectOf('/')).toBe('未分组')
  })
})

describe('timeGroupOf（更新时间 → 时间段，工单 10.5②）', () => {
  const now = Date.now()
  const startOfToday = (() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  })()
  const DAY = 86400000

  it('今天（零点起）', () => {
    expect(timeGroupOf(startOfToday)).toBe('今天')
    expect(timeGroupOf(now)).toBe('今天')
  })

  it('昨天与 7 天内边界', () => {
    expect(timeGroupOf(startOfToday - 1)).toBe('昨天')
    expect(timeGroupOf(startOfToday - DAY + 1)).toBe('昨天')
    expect(timeGroupOf(startOfToday - DAY)).toBe('7 天内')
    expect(timeGroupOf(startOfToday - 6 * DAY + 1)).toBe('7 天内')
  })

  it('更早', () => {
    expect(timeGroupOf(startOfToday - 6 * DAY)).toBe('更早')
  })
})
