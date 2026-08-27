/**
 * 侧栏项目分组数据源单测（工单 6.2 / DESIGN §13.A）：
 * cwd → 项目名（目录名）——Windows/POSIX 分隔符、尾分隔符、空串兜底。
 */
import { describe, expect, it } from 'vitest'
import { projectOf } from '../src/components/layout/Sidebar'

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
