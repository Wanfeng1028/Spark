/**
 * 微信基础库能力探测（工单 9.4——SSE 分块主路径的可用性门槛）。
 * `Taro.request({ enableChunked: true })` + onChunkReceived 需基础库 2.20.2+；
 * 低于该版本直接走轮询降级路径（不在低版本上赌分块回调）。
 * 纯函数——单测覆盖。
 */

/** 基础库版本比较：a >= b（逐段数字比较；段不足视为 0；非数字段截断） */
export function sdkVersionAtLeast(version: string, min: string): boolean {
  const parse = (v: string): number[] =>
    v
      .trim()
      .split('.')
      .map((seg) => {
        const n = Number.parseInt(seg, 10)
        return Number.isFinite(n) ? n : 0
      })
  const a = parse(version)
  const b = parse(min)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av !== bv) return av > bv
  }
  return true
}

/** enableChunked 分块门槛（官方文档：2.20.2 起支持请求分块接收） */
export function sdkSupportsChunked(version: string): boolean {
  return sdkVersionAtLeast(version, '2.20.2')
}
