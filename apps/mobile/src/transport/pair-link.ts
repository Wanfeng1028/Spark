/**
 * RN 配对深链接线（DESIGN §13.J.2.9 / ADR D24）。
 * 解析本体（parsePairLink / baseUrlOf / PairLink）已下沉 @spark/protocol pair-link 单源
 * （工单 R-B：原与 apps/miniapp/src/transport/pair.ts 两份逐字同）；本文件只留平台接线——
 * expo-linking 的冷启动 getInitialURL 与运行期 addEventListener 两条路径共用同一处理。
 * 解析失败 = 未识别，静默忽略（不做半截配置），失败闭合（AGENTS §2.7）。
 */
import * as Linking from 'expo-linking'
import type { PairLink } from '@spark/protocol'
import { parsePairLink } from '@spark/protocol'

/** 订阅配对深链；返回取消订阅（供 useEffect 清理） */
export function subscribePairLink(onPair: (link: PairLink) => void): () => void {
  const handle = (url: string | null): void => {
    if (url === null) return
    const pair = parsePairLink(url)
    if (pair !== null) onPair(pair)
  }
  void Linking.getInitialURL().then(handle)
  const sub = Linking.addEventListener('url', (e) => handle(e.url))
  return () => sub.remove()
}
