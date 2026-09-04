/**
 * ui-copy 文案表单测（工单 R-B 下沉）：连接态文案键集、工具状态词、审批决策回显、
 * 复制两态、状态点取色。两条判决钉成回归网——closed 态不入表（触发源语义分叉）、
 * 文案本体不含勾号记号（记号是 miniapp 渲染层的视觉补偿，非文案）。
 */
import { describe, expect, it } from 'vitest'
import {
  CONNECTION_TEXT,
  COPY_TEXT,
  approvalResolvedText,
  dotColor,
  toolStatusText,
  type StatusDotTokens,
} from '../src/ui-copy'

const TOKENS: StatusDotTokens = { sparkAccent: '#accent', sparkWarn: '#warn', sparkOk: '#ok' }

/** emoji 与装饰性图形记号区段（AGENTS §2.6 黑名单的机器可查面） */
const DECORATIVE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

describe('CONNECTION_TEXT（连接态文案）', () => {
  it('三态键集齐备（closed 刻意不入表——两个触发源语义分叉，见实现文件头）', () => {
    expect(Object.keys(CONNECTION_TEXT)).toEqual(['connecting', 'open', 'reconnecting'])
    expect(CONNECTION_TEXT.connecting).toBe('连接中…')
    expect(CONNECTION_TEXT.open).toBe('已连接')
    expect(CONNECTION_TEXT.reconnecting).toBe('已断线，重连中…')
  })

  it('无 emoji 与装饰记号；进行中态用单字符省略号收尾', () => {
    for (const text of Object.values(CONNECTION_TEXT)) {
      expect(text).not.toMatch(DECORATIVE)
    }
    expect(CONNECTION_TEXT.connecting.endsWith('…')).toBe(true)
    expect(CONNECTION_TEXT.reconnecting.endsWith('…')).toBe(true)
  })
})

describe('toolStatusText / approvalResolvedText', () => {
  it('工具三态词（卡面 meta 与无障碍标签同一口径）', () => {
    expect(toolStatusText('running')).toBe('运行中')
    expect(toolStatusText('completed')).toBe('完成')
    expect(toolStatusText('error')).toBe('失败')
  })

  it('审批回显四路：reply 缺省落已处理，不给假具体决策', () => {
    expect(approvalResolvedText('once')).toBe('已允许本次')
    expect(approvalResolvedText('always')).toBe('已始终允许')
    expect(approvalResolvedText('reject')).toBe('已拒绝')
    expect(approvalResolvedText(undefined)).toBe('已处理')
  })

  it('两表均无 emoji 与装饰记号', () => {
    for (const s of ['running', 'completed', 'error'] as const) {
      expect(toolStatusText(s)).not.toMatch(DECORATIVE)
    }
    for (const r of ['once', 'always', 'reject', undefined] as const) {
      expect(approvalResolvedText(r)).not.toMatch(DECORATIVE)
    }
  })
})

describe('COPY_TEXT（复制按钮两态）', () => {
  it('文案本体统一且不含勾号记号（记号由无图标组件的平台在渲染层附加）', () => {
    expect(COPY_TEXT.copy).toBe('复制')
    expect(COPY_TEXT.copied).toBe('已复制')
    expect(COPY_TEXT.copied).not.toMatch(DECORATIVE)
  })
})

describe('dotColor（会话列表状态点取色，DESIGN §13.J.2.2）', () => {
  it('SessionStatus 三态穷尽映射 accent/warn/ok', () => {
    expect(dotColor('running', TOKENS)).toBe('#accent')
    expect(dotColor('waiting-approval', TOKENS)).toBe('#warn')
    expect(dotColor('idle', TOKENS)).toBe('#ok')
  })

  it('只依赖三字段的结构化子集：各端完整 ThemeTokens 可直传', () => {
    const full = { ...TOKENS, foreground: '#fg', mutedForeground: '#muted', sparkErr: '#err' }
    expect(dotColor('idle', full)).toBe('#ok')
    expect(dotColor('running', full)).toBe('#accent')
  })
})
