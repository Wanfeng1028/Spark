/**
 * 进程内指标（doc/02 §5.10 metrics 段 / 工单 4.8）：标签化 counter + Prometheus
 * exposition 渲染。计数器名/标签集与 §5.10 固定清单一致——新增指标先改文档再改码。
 * 线程安全不适用（单进程单线程事件循环）；值只增不减，gauge 由 render 时外部传入。
 */

/** 单个时间序列点（snapshot 数据源；labels 已排序稳定） */
export interface MetricPoint {
  name: string
  labels: Record<string, string>
  value: number
}

export class Metrics {
  /** key = name + 排序后的 label 键值对（同一逻辑序列稳定聚合） */
  private readonly counters = new Map<string, number>()

  inc(name: string, labels: Record<string, string | undefined> = {}, value = 1): void {
    const key = this.keyOf(name, labels)
    this.counters.set(key, (this.counters.get(key) ?? 0) + value)
  }

  /** 全量序列（渲染与测试断言共用） */
  snapshot(): MetricPoint[] {
    return [...this.counters.entries()].map(([key, value]) => {
      const parsed = JSON.parse(key) as { n: string; l: Record<string, string> }
      return { name: parsed.n, labels: parsed.l, value }
    })
  }

  /**
   * Prometheus exposition 文本（text/plain; version=0.0.4）。
   * gauges：快照时点值（如 sessions_active），不参与 counter 聚合。
   */
  render(gauges: Record<string, number> = {}): string {
    const lines: string[] = []
    const byName = new Map<string, MetricPoint[]>()
    for (const point of this.snapshot()) {
      const list = byName.get(point.name) ?? []
      list.push(point)
      byName.set(point.name, list)
    }
    for (const [name, points] of [...byName.entries()].sort()) {
      lines.push(`# TYPE ${name} counter`)
      for (const p of points) {
        const labelStr = Object.entries(p.labels)
          .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
          .join(',')
        lines.push(labelStr === '' ? `${name} ${p.value}` : `${name}{${labelStr}} ${p.value}`)
      }
    }
    for (const [name, value] of Object.entries(gauges).sort()) {
      lines.push(`# TYPE ${name} gauge`)
      lines.push(`${name} ${value}`)
    }
    return `${lines.join('\n')}\n`
  }

  private keyOf(name: string, labels: Record<string, string | undefined>): string {
    const clean = Object.fromEntries(
      Object.entries(labels)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    )
    return JSON.stringify({ n: name, l: clean })
  }
}

function escapeLabel(v: string): string {
  return v.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"')
}
