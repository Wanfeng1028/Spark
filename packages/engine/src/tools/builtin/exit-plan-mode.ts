/**
 * exit_plan_mode 工具（工单 16.3 /plan 计划模式；doc/02 §5.6）。
 *
 * 语义（qwen-code `exitPlanMode.ts` 同款）：计划模式下模型产出计划 → 调本工具提交 →
 * **走审批链由用户批准** → 批准后才切回 default 模式恢复执行。模型不能自己宣布计划已批准。
 *
 * 三条纪律：
 * - 审批 action = `plan.exit`，plan 档预置为 **ask**（`PRESET_RULES.plan`，gemini plan.toml
 *   的"模式转换 70"翻译）；用户拒绝 → 留在计划模式（E_PERMISSION 走管线的通用拒绝路径）。
 * - 不在计划模式时调用 → **如实报错** `E_NOT_IN_PLAN`（不静默成功、不假装切了模式）。
 * - 未注入钩子（宿主未接线）→ `E_UNSUPPORTED`（禁假实现）。
 *
 * 广告面：非计划模式时本工具不进 `materialize()` 清单（engine 侧 hiddenTools getter 逐 step
 * 现读），模型不会看到它——与 qwen/gemini 的"只在 plan 模式暴露 exitPlanMode"一致。
 *
 * 执行边界（第三批）：成功退出后同批剩余调用一律跳过（`executionBoundary`）——
 * 它们是计划模式下拟定的，该由模型在新模式下重新发起。
 */
import { z } from 'zod'
import type { ToolDefinition } from '../definition.js'

/** input schema 不导出（只本文件用，knip 会报未用导出）；类型必须导出——
 * `exitPlanModeTool` 的声明发射要能命名它（否则 TS4033，同 14.1 的四个判例） */
const ExitPlanModeInput = z.strictObject({
  plan: z
    .string()
    .min(1)
    .describe('完整计划文本（Markdown）：步骤、涉及文件、验证方式。批准后会原样展示给用户'),
})
export type ExitPlanModeInputType = z.infer<typeof ExitPlanModeInput>

export const exitPlanModeTool: ToolDefinition<ExitPlanModeInputType> = {
  name: 'exit_plan_mode',
  description:
    '提交计划并请用户批准退出计划模式（仅在计划模式下可用——系统提示会声明当前模式）。' +
    'plan 必须是可执行的完整计划：分步骤、点明涉及文件、给出验证方式。' +
    '用户批准后恢复执行（写类工具解禁）；拒绝则留在计划模式，请按反馈修改计划后重试。' +
    '不要用本工具询问普通问题——它只为"计划已成型、请求放行"而生。',
  inputSchema: ExitPlanModeInput,
  permission: {
    // plan 档预置 ask（模式转换必走审批）；resource 用固定段（同 task 工具的 'task' 先例）
    action: 'plan.exit',
    resourceOf: () => 'plan',
  },
  // 有副作用（改会话模式）→ 不并行；与 write/edit/bash 同档
  parallelizable: false,
  // 模式切换是执行边界（qwen-code 同款）：批准后同批后续调用跳过，留待下一轮观察新模式
  executionBoundary: true,
  async execute(ctx, input) {
    if (ctx.exitPlanMode === undefined) {
      return {
        output: {
          code: 'E_UNSUPPORTED',
          message: 'exit_plan_mode 未接线：宿主未注入模式切换钩子',
        },
        isError: true,
      }
    }
    // 钩子内部校验"是否真在计划模式"并切档（不在则抛 E_NOT_IN_PLAN → 管线转 tool.completed isError）
    await ctx.exitPlanMode()
    return { output: { ok: true, plan: input.plan }, isError: false }
  },
}
