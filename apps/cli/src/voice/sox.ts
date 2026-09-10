/**
 * CLI 端语音采集（工单 16.6）：SoX（rec）子进程录音，静音自动停止参数直抄
 * qwen-code sox-recorder（['silence','1','0.1','3%','1','2.0','3%']——0.1s 内 3% 振幅
 * 视为静音开头 1s、持续 2s 即停）。
 * fail-closed 纪律：Windows/未装 SoX 环境**明确提示不裸降**——soxAvailable 探测失败
 * 一律拒绝进入录音（不静默、不假录）；spawn 选项剥离本进程敏感环境变量（qwen lsp
 * 同款防护，防子进程继承 LD_PRELOAD/NODE_OPTIONS 等被注入）。
 * 音频纪律：临时 wav 落 os.tmpdir()（非仓库、非会话目录），转写完成即 unlink——
 * 音频 live 不落盘（不进 JSONL/日志）。
 */
import { spawn } from 'node:child_process'
import { readFile, unlink, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** qwen sox-recorder 同款静音自动停止参数（直抄项） */
export const SOX_SILENCE_ARGS = ['silence', '1', '0.1', '3%', '1', '2.0', '3%']

/** spawn 前剥离的敏感环境变量（qwen lsp 同款清单——防注入继承） */
const STRIPPED_ENV = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'NODE_OPTIONS']

export interface SoxDeps {
  spawnFn?: typeof spawn
  readFileFn?: typeof readFile
  unlinkFn?: typeof unlink
  tmpDirFn?: () => string
  mkdtempFn?: typeof mkdtemp
}

function sanitizedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const k of STRIPPED_ENV) delete env[k]
  return env
}

/** SoX（rec 命令）可用性探测：--version 退出 0 即可用；ENOENT/非零 = 不可用（明确提示） */
export async function soxAvailable(deps?: SoxDeps): Promise<boolean> {
  const spawnFn = deps?.spawnFn ?? spawn
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawnFn('rec', ['--version'], { stdio: 'ignore', env: sanitizedEnv() })
    } catch {
      resolve(false)
      return
    }
    child.once('error', () => {
      resolve(false)
    })
    child.once('exit', (code) => {
      resolve(code === 0)
    })
  })
}

export interface SoxRecording {
  /** 录音结束（用户 stop() 或 SoX 静音自动停）后的 wav 字节；失败 reject（fail-closed） */
  done: Promise<Buffer>
  /** 用户手动停止（SIGTERM；SoX 正常收尾写盘后读文件） */
  stop: () => void
}

/** 启动录音：rec 默认设备 → 临时 wav；自动停/手动停两条路都汇入 done（单次 settle） */
export async function startSoxRecording(deps?: SoxDeps): Promise<SoxRecording> {
  const spawnFn = deps?.spawnFn ?? spawn
  const readFileFn = deps?.readFileFn ?? readFile
  const unlinkFn = deps?.unlinkFn ?? unlink
  const mkdtempFn = deps?.mkdtempFn ?? mkdtemp
  const tmpDirFn = deps?.tmpDirFn ?? tmpdir

  const dir = await mkdtempFn(join(tmpDirFn(), 'spark-voice-'))
  const file = join(dir, 'voice.wav')

  let child: ReturnType<typeof spawn>
  try {
    child = spawnFn('rec', ['-q', file, ...SOX_SILENCE_ARGS], {
      stdio: 'ignore',
      env: sanitizedEnv(),
    })
  } catch (err) {
    throw new Error(`E_TRANSCRIBE_UNCONFIGURED: SoX 录音启动失败：${err instanceof Error ? err.message : String(err)}`)
  }

  const finish = async (): Promise<Buffer> => {
    const bytes = await readFileFn(file)
    await unlinkFn(file).catch(() => {})
    return bytes
  }

  const done = new Promise<Buffer>((resolve, reject) => {
    child.once('error', (err) => {
      reject(new Error(`E_TRANSCRIBE_UNCONFIGURED: SoX 录音不可用：${err.message}`))
    })
    child.once('close', (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`E_TRANSCRIBE_UPSTREAM: SoX 录音异常退出（${code}）——检查默认麦克风设备`))
        return
      }
      finish().then(resolve, reject)
    })
  })

  return {
    done,
    stop: () => {
      // 已退出/已请求停止时幂等（SIGTERM 二次发送无意义）
      if (child.exitCode !== null || child.signalCode !== null) return
      child.kill('SIGTERM')
    },
  }
}

/** 语音模式（CLI 无按住语义：tap=点击开始停止 / off=关闭） */
export type CliVoiceMode = 'tap' | 'off'
