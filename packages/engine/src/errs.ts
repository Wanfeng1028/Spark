/**
 * 错误消息助手（叶子 util，零依赖——任何模块都可安全 import，不引入环）。
 * 单源统一 `err instanceof Error ? err.message : String(err)` 家族样板。
 */

/** Error → message；非 Error（字符串/对象/undefined）→ String() */
export function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** reject 理由必须恒为 Error（prefer-promise-reject-errors）：Error 原样透传，其余包装 */
export function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}
