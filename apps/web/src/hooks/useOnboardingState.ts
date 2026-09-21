/**
 * 引导状态（阶段十九 19.15）：完成标记 / 当前步骤 / 首启自动弹偏好 + 动作。
 * 全部落 localStorage（引导是端侧状态，不进 spark.json——服务端无"用户是否看过引导"
 * 的概念，编一个出来反而是假状态）。供应商配置态来自 GET /api/models（真实数据源）。
 */
import { useCallback, useEffect, useState } from 'react'
import { ONBOARDING_DONE_KEY } from '@/routes/OnboardingPage'

const STEP_KEY = 'spark-onboarding-step'
const AUTOPOP_KEY = 'spark-onboarding-autopop'

export const ONBOARDING_STEPS = ['欢迎', '配置模型', '开始使用'] as const

export interface OnboardingState {
  /** 引导已完成（不再自动弹） */
  done: boolean
  /** 当前步骤（0 基；完成后仍保留供"继续引导"） */
  step: number
  /** 首启自动弹（缺省 true） */
  autoPop: boolean
}

function read(): OnboardingState {
  const rawStep = Number(localStorage.getItem(STEP_KEY) ?? '0')
  return {
    done: localStorage.getItem(ONBOARDING_DONE_KEY) === '1',
    step: Number.isInteger(rawStep) && rawStep >= 0 && rawStep < ONBOARDING_STEPS.length ? rawStep : 0,
    autoPop: localStorage.getItem(AUTOPOP_KEY) !== '0',
  }
}

/** 引导状态 hook（rerun 清标记与步骤——调用处负责跳转 /onboarding） */
export function useOnboardingState(): {
  state: OnboardingState
  rerun: () => void
  setAutoPop: (v: boolean) => void
} {
  const [state, setState] = useState<OnboardingState>(read)

  // 同标签页内其他写入（如引导页自身 skip）即时同步
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === ONBOARDING_DONE_KEY || e.key === STEP_KEY || e.key === AUTOPOP_KEY) {
        setState(read())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const rerun = useCallback(() => {
    localStorage.removeItem(ONBOARDING_DONE_KEY)
    localStorage.removeItem(STEP_KEY)
    setState(read())
  }, [])

  const setAutoPop = useCallback((v: boolean) => {
    localStorage.setItem(AUTOPOP_KEY, v ? '1' : '0')
    setState(read())
  }, [])

  return { state, rerun, setAutoPop }
}
