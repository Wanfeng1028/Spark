/**
 * 配对入口的小程序端兜底（DESIGN §13.J.2.9）。
 * 深链解析本体（parsePairLink / baseUrlOf / PairLink）已下沉 @spark/protocol pair-link 单源
 * （工单 R-B：原与 apps/mobile/src/transport/pair-link.ts 两份逐字同）；本文件只留小程序独有路径——
 * Taro.scanCode 扫不到/解析失败时落回手输 6 位码（mobile 以深链为主路径，无手输归一）。
 * 单端消费的纯函数不下沉 protocol（下沉即对其他三端造死导出，AGENTS §2.11 boring code）。
 */

/**
 * 手输 6 位码归一：去空白后须恰为 6 位数字（含中文输入法常见空格/全角不姑息——
 * 全角数字不做隐式转换，避免歧义输入冒充合法码）；不合法返回 null。
 */
export function parsePairCode(raw: string): string | null {
  const digits = raw.replace(/\s+/g, '')
  return /^\d{6}$/.test(digits) ? digits : null
}
