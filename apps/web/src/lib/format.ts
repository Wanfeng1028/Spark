/**
 * 字节量展示（B/KB/MB 一位小数）——原 IndexSettingsPage 局部函数，19.37 数据管理页
 * 需要同款后上收至此（同仓两处消费即上收；protocol format.ts 只放四端共享面，本函数仅 web 用）。
 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
