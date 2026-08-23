---
name: frontend-component
description: 前端组件引入与改造流程。copy-in AI Elements/shadcn 组件到 components/ui 并做桌面化改造时使用：删 use client、换数据源、密度改造、黑名单自查、DoD 九项。
---

# 前端组件引入与改造流程

**触发**：从 AI Elements / shadcn copy-in 新组件，或对现有组件做视觉改造。
**前置阅读**：DESIGN.md 全文（尤其 §3 密度 / §4 颜色 / §7 黑名单 / §8 改造规范 / §10 DoD / §12 AI 生成风清单）。

## 步骤

1. **取源**：`npx shadcn add <component>` 或从 AI Elements registry 拷入 `components/ui/`（源码进仓库，不引黑盒运行时依赖）。
2. **适配三件事**：
   - 删除 `"use client"` 指令（Vite 非 Next.js）；
   - 数据源替换：原 `useChat`/props 注入 → `useSessionItems()` 等 store selector（**禁止组件内直接 fetch**）；
   - 回调改派发 store 动作（唯一写入口 applyEvent 之外的交互走 store action）。
3. **密度改造**：对齐 DESIGN.md §3——13px 字号 / 28-32px 按钮高 / 8px 内边距 / 6px 圆角 / mono 场景。
4. **黑名单自查**（DESIGN.md §7 + §12 AI 生成风清单）：无蓝紫渐变 / 无玻璃拟态与内衬模糊 / 无暖调配色 / 无超大字号 / 无 emoji 装饰 / 无 bento·三卡模板布局 / 无外部 CDN 资源 / 无整页滚动。
5. **四态**：空 / 加载 / 错误 / 禁用。
6. **DoD 九项自查**（DESIGN.md §10）：键盘可达、双主题对比度、双窗口档位、reduced-motion、新事件单测（若消费新事件）。
7. **验证与提交**：`pnpm --filter web build`（或 typecheck）+ 相关组件测试；`feat(web): 引入/改造 <组件>`；推送。

## 现成映射参考

组件→用途映射表：doc/02 §6.7（AI Elements 改造清单）；交互规格：doc/02 §6.2/§6.3。
