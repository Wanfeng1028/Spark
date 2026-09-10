/**
 * useVoiceInput（工单 16.6 / ADR D34）：web 端语音采集与转写。
 * - 采集：getUserMedia + MediaRecorder（浏览器原生；mime 按支持度降选 webm→mp4）；
 * - 转写：transport.transcribe（引擎侧 OpenAI 兼容端点 + SSRF 防护）——音频不落盘，
 *   只有转写文本经 onText 回调入 Composer 输入框（用户发送后才进模型历史）；
 * - 模式：hold=按住说话（pointerdown/up）/ tap=点击开始停止；off 由调用处隐藏按钮不进本钩子；
 * - 失败闭合：权限拒绝/录制失败/转写错误都以人话 error 上抛（error-copy 已登记码优先），
 *   不静默、不假成功；错误出现即回 idle（可重试）。
 */
import { useCallback, useRef, useState } from 'react'
import type { Transport } from '@spark/protocol'

type VoicePhase = 'idle' | 'recording' | 'transcribing'

/** MediaRecorder 采格降选（Safari 无 webm → mp4；再无则交由浏览器缺省） */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  return undefined
}

/** Uint8Array → base64（8KB 分块 fromCharCode——整段 spread 大录音会栈溢出） */
function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

export interface VoiceInputDeps {
  transport: Transport
  /** 转写文本回填（调用处在 setDraft 侧自取最新草稿——本钩子不持有 draft 避免闭包过期） */
  onText: (text: string) => void
}

export function useVoiceInput({ transport, onText }: VoiceInputDeps) {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  /** onText 的最新引用（onstop 闭包跨渲染存活——直接捕获 props 会拿旧 draft 上下文） */
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const cleanup = useCallback((): void => {
    streamRef.current?.getTracks().forEach((t) => {
      t.stop()
    })
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const start = useCallback(async (): Promise<void> => {
    if (phase !== 'idle' || recorderRef.current !== null) return
    setError(null)
    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
      setError('当前环境不支持麦克风采集（需浏览器 getUserMedia）')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? '麦克风权限被拒绝：请在浏览器地址栏允许麦克风后重试'
          : name === 'NotFoundError'
            ? '未检测到麦克风设备'
            : `录音启动失败：${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
    streamRef.current = stream
    const mime = pickMime()
    const recorder = new MediaRecorder(stream, mime !== undefined ? { mimeType: mime } : undefined)
    const mimeType = recorder.mimeType === '' ? (mime ?? 'audio/webm') : recorder.mimeType
    recorder.ondataavailable = (ev: BlobEvent) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data)
    }
    recorder.onstop = () => {
      void (async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        cleanup()
        setPhase('transcribing')
        try {
          const base64 = bytesToBase64(await blob.arrayBuffer())
          const result = await transport.transcribe({
            audio: { mime: mimeType, dataBase64: base64 },
          })
          setPhase('idle')
          if (result.text.trim() !== '') onTextRef.current(result.text)
        } catch (err) {
          setPhase('idle')
          setError(err instanceof Error ? err.message : String(err))
        }
      })()
    }
    recorderRef.current = recorder
    recorder.start()
    setPhase('recording')
  }, [cleanup, phase, transport])

  const stop = useCallback((): void => {
    // onstop 回调负责后续转写；重复 stop / 未在录时幂等（HTMLMedia 规范：stop 多次 no-op）
    if (recorderRef.current === null || recorderRef.current.state !== 'recording') return
    recorderRef.current.stop()
  }, [])

  const dismissError = useCallback((): void => {
    setError(null)
  }, [])

  return { phase, error, start, stop, dismissError }
}
