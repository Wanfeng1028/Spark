/**
 * SSE 帧泵（工单 9.4——SSE 主路径与轮询降级共用的解析口径核心）。
 * 字节块 → UTF-8 解码 → splitSseFrames 切帧（@spark/protocol，已归一化 CRLF）
 * → envelopeFromSseFrame 出信封。坏帧抛错由调用方冒泡断开走重连（失败闭合，
 * 与 web/cli/RN 四端同纪律——不静默跳过）。纯逻辑，不触小程序 API。
 */
import type { SparkEventEnvelope } from '@spark/protocol'
import { envelopeFromSseFrame, splitSseFrames } from '@spark/protocol'
import { Utf8StreamDecoder } from './utf8'

export class SseFramePump {
  private buffer = ''
  private readonly decoder = new Utf8StreamDecoder()

  constructor(private readonly onEnvelope: (e: SparkEventEnvelope) => void) {}

  /** 喂字节块（onChunkReceived 的 ArrayBuffer 视图）；坏帧抛错 */
  feedBytes(bytes: Uint8Array): void {
    this.feedText(this.decoder.decode(bytes))
  }

  /** 喂文本段（跨块残余由内部缓冲留存——帧可被任意切点分割） */
  feedText(text: string): void {
    if (text === '') return
    const { frames, rest } = splitSseFrames(text, this.buffer)
    this.buffer = rest
    for (const frame of frames) {
      // 注释帧（心跳 ":"）/无 data 帧 → null 跳过；坏帧抛错 → 调用方断开重连
      const envelope = envelopeFromSseFrame(frame)
      if (envelope !== null) this.onEnvelope(envelope)
    }
  }

  /** 流终止：解码器残留字节收尾（不完整序列替字符，不留半帧假象） */
  end(): void {
    this.feedText(this.decoder.flush())
  }
}
