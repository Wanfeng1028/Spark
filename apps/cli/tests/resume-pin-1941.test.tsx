/**
 * CLI /resume 置顶展示单测（工单 19.41「CLI 列表侧展示」）：
 * ① 列表序置顶优先——此前只按 updatedAt 排，等于把服务端 `ORDER BY pinned DESC` 当场抹掉，
 *    置顶会话在 CLI 里跟没置顶一样（web 侧同批已修，CLI 漏了）；
 * ② 行 1 ★ 角标（终端无图标组件，与既有 ✓/… 同属排版记号，非 emoji 装饰）；
 * ③ Space 预览把 pinned 当快照字段如实列出，未置顶不出现该段（禁假状态）。
 */
import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import type { ReactElement } from 'react'
import { ids } from '@spark/protocol'
import type { SessionDto } from '@spark/protocol'
import { ResumePanel } from '../src/components/ResumePanel.js'
import { sortResumeSessions } from '../src/hooks/use-resume-panel.js'

function dto(id: string, title: string, updatedAt: number, pinned?: true): SessionDto {
  return {
    id: ids.session(id),
    title,
    model: 'deepseek/chat',
    cwd: '/tmp/proj',
    createdAt: 1,
    updatedAt,
    lastSeq: 3,
    status: 'idle',
    // 仅已置顶携带 pinned（api.ts 口径）——未置顶不写 false
    ...(pinned === true ? { pinned: true as const } : {}),
  }
}

function frame(node: ReactElement): string {
  return render(node).lastFrame() ?? ''
}

describe('sortResumeSessions（置顶优先 + 更新时间新→旧）', () => {
  it('更旧的置顶会话排在更新的普通会话之前', () => {
    const oldPinned = dto('s1', '旧置顶', 1_000, true)
    const newPlain = dto('s2', '新普通', 2_000)
    expect(sortResumeSessions([newPlain, oldPinned]).map((s) => s.title)).toEqual([
      '旧置顶',
      '新普通',
    ])
  })

  it('置顶段内与非置顶段内各自按更新时间新→旧', () => {
    const list = [
      dto('s1', '普通旧', 1_000),
      dto('s2', '置顶旧', 1_500, true),
      dto('s3', '普通新', 3_000),
      dto('s4', '置顶新', 2_500, true),
    ]
    expect(sortResumeSessions(list).map((s) => s.title)).toEqual([
      '置顶新',
      '置顶旧',
      '普通新',
      '普通旧',
    ])
  })

  it('返回副本不改入参（面板每帧重算，改入参会让 store 快照被就地重排）', () => {
    const list = [dto('s1', '普通', 2_000), dto('s2', '置顶', 1_000, true)]
    sortResumeSessions(list)
    expect(list.map((s) => s.title)).toEqual(['普通', '置顶'])
  })
})

describe('ResumePanel 置顶角标与预览', () => {
  it('置顶行标题带 ★，普通行不带', () => {
    const pinned = dto('s1', '甲会话', 1_000, true)
    const plain = dto('s2', '乙会话', 2_000)
    const f = frame(
      <ResumePanel sessions={[pinned, plain]} selected={0} filter="" activeId={null} />,
    )
    const lineOf = (t: string): string => f.split('\n').find((l) => l.includes(t)) ?? ''
    expect(lineOf('甲会话')).toContain('★')
    expect(lineOf('乙会话')).not.toContain('★')
  })

  it('Space 预览列出「置顶」段；未置顶会话不出现该段（禁假状态）', () => {
    const pinned = dto('s1', '甲会话', 1_000, true)
    const plain = dto('s2', '乙会话', 2_000)
    expect(
      frame(
        <ResumePanel
          sessions={[pinned]}
          selected={0}
          filter=""
          activeId={null}
          preview={pinned}
        />,
      ),
    ).toContain('置顶')
    expect(
      frame(
        <ResumePanel sessions={[plain]} selected={0} filter="" activeId={null} preview={plain} />,
      ),
    ).not.toContain('置顶')
  })
})
