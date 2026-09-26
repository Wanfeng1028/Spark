/**
 * 电脑控制纯函数单测（doc/11 LA-08）：三平台执行体的解析/参数构造零 GUI 覆盖——
 * parseKv/parseProcessList（Windows PowerShell 桥输出）、parseAppleList/parsePairs
 * （macOS 行式输出，0x1F 分列——旧 ", " 分列被标题逗号污染的红修）、clickButton/keyArgs
 * （xdotool 参数）、工厂三平台路由 + Unsupported 降级。
 */
import { describe, expect, test, vi } from 'vitest'
import { parseKv, parseProcessList } from '../src/computer/windows.js'
import { APPLE_FIELD_SEP, parseAppleList, parsePairs } from '../src/computer/macos.js'
import { clickButton, keyArgs } from '../src/computer/linux.js'
import { createComputerExecutor } from '../src/computer/executor.js'

describe('parseKv（Windows 单条 k=v 行）', () => {
  test('命中键取值；缺键 undefined', () => {
    expect(parseKv('launched=1234\nexit=0', 'launched')).toBe('1234')
    expect(parseKv('launched=1234\nexit=0', 'exit')).toBe('0')
    expect(parseKv('launched=1234', 'missing')).toBeUndefined()
  })

  test('值内含等号不截断（slice 按键长 + 1）', () => {
    expect(parseKv('query=a=b=c', 'query')).toBe('a=b=c')
  })

  test('前后空白宽容（trim 后匹配）', () => {
    expect(parseKv('\n  pid=42  \n', 'pid')).toBe('42')
  })
})

describe('parseProcessList（PowerShell ConvertTo-Json 归一）', () => {
  test('数组形态逐条保留', () => {
    const rows = parseProcessList('[{"pid":1,"name":"a"},{"pid":2,"name":"b"}]')
    expect(rows).toEqual([
      { pid: 1, name: 'a' },
      { pid: 2, name: 'b' },
    ])
  })

  test('单对象形态归一成数组（ConvertTo-Json 单元素出对象）', () => {
    expect(parseProcessList('{"pid":7,"name":"solo"}')).toEqual([{ pid: 7, name: 'solo' }])
  })

  test('非 conforming 条目过滤（缺 pid / name 类型不对 / null 项）', () => {
    const rows = parseProcessList('[{"pid":1,"name":"ok"},{"name":"novid"},{"pid":"3","name":"x"},null]')
    expect(rows).toEqual([{ pid: 1, name: 'ok' }])
  })

  test('空串/字面 null → 空数组', () => {
    expect(parseProcessList('')).toEqual([])
    expect(parseProcessList('null')).toEqual([])
  })
})

describe('parseAppleList / parsePairs（macOS 行式 0x1F 分列——LA-08 括号污染红修）', () => {
  test('逐行解析：名称/pid/标题三列', () => {
    const sep = APPLE_FIELD_SEP
    const out = parseAppleList(`Safari${sep}123${sep}GitHub · Pull 7\nFinder${sep}456${sep}`)
    expect(out).toEqual([
      { name: 'Safari', pid: 123, title: 'GitHub · Pull 7' },
      { name: 'Finder', pid: 456, title: '' },
    ])
  })

  test('标题/名称含逗号不再被分列污染（旧 ", " 分列的红修核心）', () => {
    const sep = APPLE_FIELD_SEP
    const out = parseAppleList(`微信, 企业版${sep}9${sep}hello, world${sep}extra`)
    expect(out).toEqual([{ name: '微信, 企业版', pid: 9, title: 'hello, world' }])
  })

  test('pid 非数字归 0；空行跳过', () => {
    const sep = APPLE_FIELD_SEP
    const out = parseAppleList(`${sep}notnum${sep}t\n\nA${sep}1${sep}t`)
    expect(out).toEqual([
      { name: '', pid: 0, title: 't' },
      { name: 'A', pid: 1, title: 't' },
    ])
  })

  test('parsePairs：名称/pid 两列', () => {
    const sep = APPLE_FIELD_SEP
    expect(parsePairs(`Code${sep}11\nTrash${sep}xx\n`)).toEqual([
      { name: 'Code', pid: 11 },
      { name: 'Trash', pid: 0 },
    ])
  })
})

describe('clickButton / keyArgs（xdotool 参数）', () => {
  test('按键映射 left=1 middle=2 right=3，缺省 left', () => {
    expect(clickButton('left')).toBe('1')
    expect(clickButton('middle')).toBe('2')
    expect(clickButton('right')).toBe('3')
    expect(clickButton(undefined)).toBe('1')
  })

  test('无修饰键 = 单键参数；多修饰键 join 加号，meta 映射 super', () => {
    expect(keyArgs(undefined, 'Return')).toEqual(['Return'])
    expect(keyArgs(['ctrl'], 'a')).toEqual(['ctrl+a'])
    expect(keyArgs(['ctrl', 'shift'], 'Tab')).toEqual(['ctrl+shift+Tab'])
    expect(keyArgs(['meta'], 'l')).toEqual(['super+l'])
  })
})

describe('工厂三平台路由（LA-08：mock platform 零 GUI）', () => {
  test('win32 → PowerShell 桥；linux → xdotool 家族（当前平台直取）', () => {
    const ex = createComputerExecutor('/tmp/shots')
    // 当前测试跑在 linux（CI ubuntu）/ win32（本机）——两类之一，均非 Unsupported
    expect(ex.constructor.name).toMatch(/Windows|Linux/)
  })

  test('其余平台 → Unsupported 如实拒绝（E_COMPUTER_UNSUPPORTED）', async () => {
    const spy = vi.spyOn(process, 'platform', 'get').mockReturnValue('freebsd')
    try {
      const ex = createComputerExecutor('/tmp/shots')
      await expect(ex.screenshot(new AbortController().signal)).rejects.toThrow('E_COMPUTER_UNSUPPORTED')
      await expect(ex.click({ x: 1, y: 1 }, new AbortController().signal)).rejects.toThrow(
        'E_COMPUTER_UNSUPPORTED',
      )
    } finally {
      spy.mockRestore()
    }
  })
})
