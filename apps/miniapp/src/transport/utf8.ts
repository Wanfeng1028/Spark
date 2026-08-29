/**
 * UTF-8 流式解码（工单 9.4——小程序逻辑层无 TextDecoder 保证，自写纯函数）。
 * ArrayBuffer 分块（onChunkReceived）可能在多字节序列中间切断——
 * 解码器持残留字节状态，跨块拼接后再解；坏序列替为 U+FFFD（不静默吞、不崩）。
 * 纯实现（不依赖小程序运行时）——vitest 直接单测。
 */

/** 完整字节段 → 字符串（坏序列逐位替为 U+FFFD） */
export function decodeUtf8(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b0 = bytes[i] ?? 0
    if (b0 < 0x80) {
      out += String.fromCharCode(b0)
      i += 1
      continue
    }
    if ((b0 & 0xe0) === 0xc0) {
      // 2 字节
      const b1 = bytes[i + 1]
      if (b1 === undefined || (b1 & 0xc0) !== 0x80) {
        out += '\uFFFD'
        i += 1
        continue
      }
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f))
      i += 2
      continue
    }
    if ((b0 & 0xf0) === 0xe0) {
      // 3 字节（中文主战场）
      const b1 = bytes[i + 1]
      const b2 = bytes[i + 2]
      if (b1 === undefined || b2 === undefined || (b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80) {
        out += '\uFFFD'
        i += 1
        continue
      }
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f))
      i += 3
      continue
    }
    if ((b0 & 0xf8) === 0xf0) {
      // 4 字节（emoji 等增补面——拆代理对）
      const b1 = bytes[i + 1]
      const b2 = bytes[i + 2]
      const b3 = bytes[i + 3]
      if (
        b1 === undefined ||
        b2 === undefined ||
        b3 === undefined ||
        (b1 & 0xc0) !== 0x80 ||
        (b2 & 0xc0) !== 0x80 ||
        (b3 & 0xc0) !== 0x80
      ) {
        out += '\uFFFD'
        i += 1
        continue
      }
      const cp = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)
      const off = cp - 0x10000
      out += String.fromCharCode(0xd800 + (off >> 10), 0xdc00 + (off & 0x3ff))
      i += 4
      continue
    }
    // 孤立续字节/非法首字节
    out += '\uFFFD'
    i += 1
  }
  return out
}

/**
 * 安全切分点：尾部若为未收齐的多字节序列，返回其起点（之前为可安全解码段）。
 * 从末尾回溯最多 4 字节找多字节首字节；全 ASCII / 序列完整 → 返回 n。
 */
export function safeUtf8Boundary(bytes: Uint8Array): number {
  const n = bytes.length
  if (n === 0) return 0
  const scan = Math.min(4, n)
  for (let back = 1; back <= scan; back++) {
    const b = bytes[n - back] ?? 0
    if ((b & 0x80) === 0) return n // ASCII：无跨块问题
    if ((b & 0xc0) !== 0x80) {
      // 首字节：判该序列是否收齐
      const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2
      return back >= need ? n : n - back
    }
  }
  // 回溯 4 字节仍是续字节 = 坏数据：整段交解码器替字符处理
  return n
}

/** 跨块有状态解码器：残留字节留存至下一块拼齐 */
export class Utf8StreamDecoder {
  private pending: number[] = []

  /** 喂一块字节，返回本块可安全解出的文本（可能为空串） */
  decode(chunk: Uint8Array): string {
    const bytes =
      this.pending.length > 0
        ? Uint8Array.from([...this.pending, ...chunk])
        : chunk
    this.pending = []
    const boundary = safeUtf8Boundary(bytes)
    if (boundary < bytes.length) {
      this.pending = Array.from(bytes.subarray(boundary))
    }
    return decodeUtf8(bytes.subarray(0, boundary))
  }

  /** 流终止：残留的不完整序列替为 U+FFFD（不拿半截字符冒充完整数据） */
  flush(): string {
    if (this.pending.length === 0) return ''
    const rest = Uint8Array.from(this.pending)
    this.pending = []
    return decodeUtf8(rest)
  }
}
