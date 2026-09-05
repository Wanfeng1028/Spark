/**
 * FTS/LIKE 召回链共享助手（memory 与 search 两 store 同源——此前复制分叉，
 * memory 侧 LIKE 未转义 %/_ 会误配，本模块为唯一实现）。
 * 纯函数零依赖；MATCH/LIKE 的 SQL 留在各 store（表名与列不同）。
 */

/** 按空白拆词取最长词（≥2 字符；自然语句兜底召回——整串不命中时句中主词 LIKE） */
export function longestToken(q: string): string | null {
  let best: string | null = null
  for (const t of q.split(/\s+/)) {
    if (t.length >= 2 && (best === null || t.length > best.length)) best = t
  }
  return best
}

/** FTS trigram 可用的最短查询长度（<3 字符走 LIKE——trigram 语义要求） */
export const TRIGRAM_MIN = 3

/** LIKE 通配符转义（必须配合 SQL `ESCAPE '\'` 使用——%/_ 按字面量匹配，防误配） */
export function escapeLike(q: string): string {
  return q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}
