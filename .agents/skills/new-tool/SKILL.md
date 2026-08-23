---
name: new-tool
description: 新增内置工具的完整流程。在 packages/engine/src/tools/builtin 添加工具时使用：ToolDefinition 六要素、注册、错误码表同步、审批映射、单测四路径。
---

# 新增内置工具

**触发**：往引擎加内置工具（如 grep、glob、web_fetch 等阶段三之后的扩展）。
**前置阅读**：doc/02 §5.6（工具系统全规格）；DESIGN.md §8（ToolCard 桌面化规则）。

## 步骤

1. **定义**：`packages/engine/src/tools/builtin/<name>.ts` 新建 ToolDefinition，六要素齐备：
   - `name` / `description`（给模型的使用纪律说明）
   - `inputSchema`：zod（自动转 JSON Schema 给模型）
   - `permission`：`{ action, resourceOf(input, ctx) }`（resource 是 wildcard 规则的匹配对象，如 `file:<abs>` / `cmd:<前缀>`）
   - `parallelizable`：与同类工具一致判定（只读=true，有副作用=false）
   - `execute(ctx, input)`：响应 `ctx.signal`（interrupt 级联）、用 `ctx.onProgress` 上报进度（引擎自动节流）
2. **注册**：registry 注册；确认 `materialize` 广告清单正确。
3. **路径安全**：涉文件操作先过允许根校验（越界 E_PATH_OUTSIDE，硬边界优先于审批）。
4. **输出限界**：大输出走 OutputStore（>32KB 截断+溢写），不直接塞消息。
5. **错误码**：新错误码加入 doc/02 §5.6.3 错误码表（格式 E_XXX）。
6. **审批适配**：新 permission action 若未被现有规则覆盖，确认默认 ask 生效；前端 ApprovalCard 无需改动（吃通用事件），但 detail 展示可优化。
7. **单测四路径**：成功 / 业务失败（isError）/ 中断（started+completed{E_ABORTED} 事件对，重放合法）/ 审批拒绝（E_PERMISSION）。
8. **前端**：ToolCard 分发若需专属渲染器（如新工具输出是 diff/树/图），按 DESIGN.md §8 加分支并过 DoD 清单。
9. **验证与提交**：typecheck + test；`feat(engine): 新增 <tool> 工具`；推送。

## 判例参考

- 工具状态机："many Progress then exactly one Terminal"（Grok，01 §1.3 B.4）；
- 中断补合成事件对：dsh（01 §1.4 B.3）；
- 输出溢写：opencode tool-output-store（01 §1.6）。
