/**
 * CLI 语音听写状态机（工单 16.6 / ADR D34）：
 * /voice 命令（clientAction=voice，经 client-actions 分派到 deps.voice）：
 *   - tap 态无参数 = 开始录音（再次 /voice 或 Enter 停止并转写）；
 *   - `off` 参数 = 关闭语音（录音中则先停）；`on`/`tap` = 仅开启模式。
 * 采集走 SoX（rec）子进程（voice/sox.ts，静音 2s 自动停；环境不可用明确提示不裸降）；
 * 转写走 transport.transcribe（引擎侧 OpenAI 兼容端点 + SSRF 防护），音频不落盘——
 * 只有转写文本回填输入框（setValue 追加），用户 Enter 发送后才进 user.message。
 * 反馈面统一 setNotice（录音中/转写中/失败人话）——CLI 无浮层，notice 行即唯一解释面。
 */
import { useCallback, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { errorMessageOf } from '@spark/protocol'
import type { HttpTransport } from '@spark/protocol'
import { useCliStore } from '../store.js'
import type { InputBoxHandle } from '../components/InputBox.js'
import { soxAvailable, startSoxRecording } from '../voice/sox.js'
import type { SoxRecording } from '../voice/sox.js'

type CliVoicePhase = 'idle' | 'recording' | 'transcribing'

export interface VoiceCliDeps {
  transport: HttpTransport
  /** 主输入框句柄（转写文本回填；审批/面板态可能为 null——如实跳过并提示） */
  inputRef: RefObject<InputBoxHandle | null>
}

export function useVoiceCli({ transport, inputRef }: VoiceCliDeps) {
  const [phase, setPhase] = useState<CliVoicePhase>('idle')
  const recordingRef = useRef<SoxRecording | null>(null)

  /** 转写收尾链：done resolve（自动/手动停共同路径）→ transcribe → 回填输入框 */
  const settle = useCallback(
    (rec: SoxRecording): void => {
      setPhase('transcribing')
      useCliStore.getState().setNotice('语音转写中…')
      void rec.done
        .then(async (bytes) => {
          if (bytes.length === 0) {
            useCliStore.getState().setNotice('录音为空：未采集到声音，请检查麦克风设备')
            return
          }
          const result = await transport.transcribe({
            audio: { mime: 'audio/wav', dataBase64: bytes.toString('base64') },
          })
          const st = useCliStore.getState()
          const box = inputRef.current
          if (box === null) {
            st.setNotice('输入框不可用（面板/审批态）：转写文本已丢弃，请关闭浮层后重试')
            return
          }
          // 追加到现有草稿（draftPreview 是输入框逐键镜像；文本不入消息通道——用户 Enter 才发送）
          const current = st.draftPreview
          const sep = current === '' || current.endsWith(' ') || current.endsWith('\n') ? '' : ' '
          box.setValue(current + sep + result.text)
          st.setNotice('语音文本已填入输入框——Enter 发送（音频未留存）')
        })
        .catch((err: unknown) => {
          useCliStore.getState().setNotice(errorMessageOf(err))
        })
        .finally(() => {
          recordingRef.current = null
          setPhase('idle')
        })
    },
    [inputRef, transport],
  )

  const startRecording = useCallback(async (): Promise<void> => {
    const st = useCliStore.getState()
    const ok = await soxAvailable()
    if (!ok) {
      // fail-closed：明确提示不裸降（§13.I / 16.6 产出②）
      st.setNotice('未检测到 SoX（rec 命令）——CLI 语音听写不可用；请安装 SoX 后重试')
      return
    }
    try {
      const rec = await startSoxRecording()
      recordingRef.current = rec
      setPhase('recording')
      useCliStore.getState().setNotice('录音中…Enter 停止（静音 2 秒也会自动停止）')
      // SoX 静音自动停：done 提前 resolve 时若无在途 stop 也走同一收尾链
      void rec.done
        .then(() => {
          if (recordingRef.current === rec) settle(rec)
        })
        .catch(() => {})
    } catch (err) {
      useCliStore.getState().setNotice(errorMessageOf(err))
    }
  }, [settle])

  const stopRecording = useCallback((): void => {
    const rec = recordingRef.current
    if (rec === null) return
    recordingRef.current = null // 防自动停 then 链重复 settle
    rec.stop()
    settle(rec)
  }, [settle])

  /** /voice 命令入口（client-actions deps.voice） */
  const handleCommand = useCallback(
    (args: string | undefined): void => {
      const st = useCliStore.getState()
      const arg = args?.trim().toLowerCase() ?? ''
      if (arg === 'off') {
        if (recordingRef.current !== null) stopRecording()
        st.setVoiceMode('off')
        st.setNotice('语音听写已关闭（/voice on 重新开启）')
        return
      }
      if (st.voiceMode === 'off' && arg === '') {
        st.setVoiceMode('tap')
        st.setNotice('语音听写已开启（tap）——再输入 /voice 开始录音；/voice off 关闭')
        return
      }
      if (arg === 'on' || arg === 'tap') {
        st.setVoiceMode('tap')
        st.setNotice('语音听写模式 tap——输入 /voice 开始录音')
        return
      }
      if (phase === 'recording') {
        stopRecording()
        return
      }
      if (phase === 'transcribing') {
        st.setNotice('上一段仍在转写，请稍候')
        return
      }
      void startRecording()
    },
    [phase, settle, startRecording, stopRecording],
  )

  return { phase, handleCommand, stopRecording }
}
