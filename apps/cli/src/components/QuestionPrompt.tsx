/**
 * 结构化提问作答框（CK-6 批 2，挂起态专属渲染——ApprovalPrompt 同构）：
 * 数字键 1-4 直达选项；单选问选中即推进下一问，多选问数字键 toggle、Enter 推进；
 * 末问完成即提交（全部经 transport.replyQuestion 回引擎挂起表）。
 * 选项 description 行内展示、已选项提亮——批 2 卡「preview 聚焦预览」按 description
 * 承担（ask_user schema 无独立 preview 字段，不扩 schema，登记差异）。
 * 键位逻辑导出纯函数 questionApplyKey 供单测（渲染与键位分离，同 flow-rows 判例）。
 */
import { Box, Text } from 'ink'
import type { UiItem } from '@spark/protocol'

export type QuestionItem = Extract<UiItem, { kind: 'question' }>

export interface QuestionFormState {
  /** 每问已选 label 集合（与 item.questions 等长对齐） */
  picked: string[][]
  /** 当前问索引——数字键/Enter 的作用域 */
  current: number
}

export function initialQuestionState(item: QuestionItem): QuestionFormState {
  return { picked: item.questions.map(() => []), current: 0 }
}

export interface QuestionKeyInput {
  /** 单码元数字 1-4；非数字为 null */
  digit: number | null
  enter: boolean
}

export interface QuestionKeyResult {
  state: QuestionFormState
  /** 非 null = 全部问已答，提交这些 answers（每问 selected ≥1，web 同守卫——
   * 引擎 QuestionBoard.reply 本身不校验非空，空选对模型是假状态） */
  submit: Array<{ selected: string[] }> | null
}

export function questionApplyKey(
  item: QuestionItem,
  state: QuestionFormState,
  key: QuestionKeyInput,
): QuestionKeyResult {
  const questions = item.questions
  const picked = state.picked.map((arr) => [...arr])
  let current = state.current

  const settle = (): QuestionKeyResult => {
    // 全部问都答了才提交；未答（多选中途 Enter 之外的路径到不了这里）保持现态
    const complete = picked.every((arr) => arr.length > 0)
    if (!complete) return { state: { picked, current }, submit: null }
    return { state: { picked, current }, submit: picked.map((arr) => ({ selected: arr })) }
  }

  const advance = (): QuestionKeyResult => {
    if (current < questions.length - 1) {
      current += 1
      return { state: { picked, current }, submit: null }
    }
    return settle()
  }

  const cur = questions[current]
  if (cur === undefined) return { state: { picked, current }, submit: null }

  if (key.digit !== null) {
    const option = cur.options[key.digit - 1]
    if (option === undefined) return { state: { picked, current }, submit: null }
    if (cur.multiSelect === true) {
      const arr = picked[current] ?? []
      picked[current] = arr.includes(option.label)
        ? arr.filter((l) => l !== option.label)
        : [...arr, option.label]
      return { state: { picked, current }, submit: null }
    }
    picked[current] = [option.label]
    return advance()
  }

  if (key.enter) {
    // 多选问完成本问推进；单选问 Enter 等价「重推进」（已选时有效，未选忽略）
    if ((picked[current] ?? []).length === 0) return { state: { picked, current }, submit: null }
    return advance()
  }

  return { state: { picked, current }, submit: null }
}

export function QuestionPrompt({
  item,
  state,
}: {
  item: QuestionItem
  state: QuestionFormState
}) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text color="yellow">[提问]</Text> 需要你的选择
      </Text>
      {item.questions.map((q, qi) => {
        const active = qi === state.current
        const pickedNow = state.picked[qi] ?? []
        return (
          <Box key={qi} flexDirection="column">
            <Text {...(active ? { bold: true } : { color: 'gray' as const })}>
              {qi + 1}. {q.question}
              {q.multiSelect === true ? '（可多选）' : ''}
            </Text>
            {q.options.map((o, oi) => {
              const on = pickedNow.includes(o.label)
              // 聚焦预览：已选项 description 提亮同行，未选项不显 description（灰字只留 label）
              const desc =
                on && o.description !== undefined && o.description !== ''
                  ? ` —— ${o.description}`
                  : ''
              return (
                <Text key={o.label} {...(on ? {} : { color: 'gray' as const })}>
                  {on ? '✓' : ' '} {oi + 1}. {o.label}
                  {desc}
                </Text>
              )
            })}
          </Box>
        )
      })}
      <Text color="gray">
        1-4 选择（单选即推进；多选可多选）· Enter 推进/提交 · 未答问不提交（超时 fail-closed）
      </Text>
    </Box>
  )
}
