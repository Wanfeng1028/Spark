/**
 * 轮询降级过滤（工单 9.4——分块不可用/异常时的保底路径数据面）。
 * 定时 `GET /api/sessions/:id?limit=200`（尾部切片）拿到的事件经此过滤：
 * 只留 seq > 水位的新事件，水位推进到所见最大 seq——与 SSE 路径同一去重口径
 * （applyEvent 亦按 seq 去重，双保险：两路切换重叠期不重复投影）。
 * 纯函数——单测覆盖。
 */
import type { SparkEventEnvelope } from '@spark/protocol'

export interface PollFilterResult {
  /** 新事件（保持到达序——服务端按 seq 升序返回，不得重排） */
  fresh: SparkEventEnvelope[]
  /** 推进后的水位 */
  watermark: number
}

/**
 * 过滤新事件并推进水位。
 * 无 seq 的事件（live——理论上 GET 只回 durable，防御性保留）不参与水位、原样放行。
 */
export function filterFreshEvents(
  events: readonly SparkEventEnvelope[],
  watermark: number,
): PollFilterResult {
  let wm = watermark
  const fresh: SparkEventEnvelope[] = []
  for (const e of events) {
    if (e.seq !== undefined) {
      if (e.seq <= wm) continue
      if (e.seq > wm) wm = e.seq
    }
    fresh.push(e)
  }
  return { fresh, watermark: wm }
}
