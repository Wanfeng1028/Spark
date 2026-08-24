/**
 * 单调 ULID 生成器与品牌化 ID 构造（doc/02 §4.1）。
 * evt/trn/cal/req/ckp 用 ULID（48-bit 时间 + 80-bit 随机，Crockford base32 共 26 字符）；
 * ses 用 UUID（去连字符）。同毫秒内随机部分 +1——事件 ID 字典序即创建序。
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { ids } from '@spark/protocol'
import type {
  CallId,
  CheckpointId,
  EventId,
  RequestId,
  SessionId,
  TurnId,
} from '@spark/protocol'

const ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

let lastTime = -1
let lastRandom: number[] = []

function encodeTime(time: number): string {
  let out = ''
  for (let i = 0; i < 10; i++) {
    out = ENC[time % 32] + out
    time = Math.floor(time / 32)
  }
  return out
}

function encodeRandom(bytes: readonly number[]): string {
  let out = ''
  let buffer = 0
  let bits = 0
  for (const b of bytes) {
    buffer = (buffer << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += ENC[(buffer >> bits) & 31]
    }
  }
  return out
}

/** 随机部分最低位 +1（同毫秒单调递增；全溢出为天文数字，忽略） */
function increment(bytes: number[]): void {
  for (let i = bytes.length - 1; i >= 0; i--) {
    const v = bytes[i]
    if (v !== undefined && v < 255) {
      bytes[i] = v + 1
      return
    }
    bytes[i] = 0 // 进位
  }
}

export function ulid(): string {
  const time = Date.now()
  if (time === lastTime) {
    increment(lastRandom)
  } else {
    lastTime = time
    lastRandom = Array.from(randomBytes(10))
  }
  return encodeTime(time) + encodeRandom(lastRandom)
}

/** 引擎侧 ID 构造器：业务代码不得用裸字符串拼 ID（§4.1） */
export const newIds = {
  session: (): SessionId => ids.session(`ses_${randomUUID().replace(/-/g, '')}`),
  turn: (): TurnId => ids.turn(`trn_${ulid()}`),
  event: (): EventId => ids.event(`evt_${ulid()}`),
  call: (): CallId => ids.call(`cal_${ulid()}`),
  request: (): RequestId => ids.request(`req_${ulid()}`),
  checkpoint: (): CheckpointId => ids.checkpoint(`ckp_${ulid()}`),
}
