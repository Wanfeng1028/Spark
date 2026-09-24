/**
 * CLI 错误文案语言收口单测（工单 19.17 第三批）：`cliErrorMessageOf` 读 store 当前语言。
 * 端内 18 处调用点都在失败那刻就把人话串写进 notice/bootError，渲染时已拿不到原始错误，
 * 故收口在取词处；把 lang 穿到每个调用点就是本工单明令禁止的"拆散"。
 * 唯一例外是 app.tsx 的 lastError 栏——那里有真实的响应式上下文（已订阅 language），
 * 直接用 `humanizeError(msg, language)`，绕收口反而要额外把语言塞进 deps 才不漏更新。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { errorMessageOf } from '@spark/protocol'
import { cliErrorMessageOf } from '../src/i18n.js'
import { useCliStore } from '../src/store.js'

afterEach(() => {
  useCliStore.getState().setLanguage('zh-CN')
})

describe('cliErrorMessageOf（store 语言 → 错误码人话文案）', () => {
  it('同一错误码随 store 语言给出两套文案，切回即恢复', () => {
    const err = new Error('E_ALREADY_RESOLVED: request r1')
    expect(cliErrorMessageOf(err)).toBe('该审批已答复过，无需重复操作')
    useCliStore.getState().setLanguage('en')
    expect(cliErrorMessageOf(err)).toBe(
      'This approval was already answered — no need to reply again',
    )
    useCliStore.getState().setLanguage('zh-CN')
    expect(cliErrorMessageOf(err)).toBe('该审批已答复过，无需重复操作')
  })

  it('缺省语言与 protocol 直调逐字同（收口不改语义，只补语言）', () => {
    const err = new Error('E_NOT_FOUND: session s1')
    expect(cliErrorMessageOf(err)).toBe(errorMessageOf(err))
  })

  it('无码消息与非 Error 原样成串——两语都不翻译（没有码就没有文案可查）', () => {
    useCliStore.getState().setLanguage('en')
    expect(cliErrorMessageOf(new Error('模型未配置'))).toBe('模型未配置')
    expect(cliErrorMessageOf('boom')).toBe('boom')
  })

  it('未知码回落原始消息而非把键名当文案（err.E_* 不得上屏）', () => {
    useCliStore.getState().setLanguage('en')
    const err = new Error('E_NO_SUCH_CODE: 上游给的生僻码')
    expect(cliErrorMessageOf(err)).toBe('上游给的生僻码')
    expect(cliErrorMessageOf(err)).not.toContain('err.')
  })
})
