---
name: new-event-type
description: 新增协议事件类型的完整流程。在 packages/protocol 增加事件词表条目时使用：类型定义、zod schema、durable/live/surface 归类、前端 applyEvent 与单测、引擎 emit 点、文档六处同步。
---

# 新增协议事件类型

**触发**：需要往 `SparkEventMap` 加新事件（如 todo/write、mcp/* 等扩展）。
**前置阅读**：AGENTS.md 硬性约定 5（协议从 protocol 开始）与 8（单测强制）；doc/02 §4。

## 步骤（顺序执行，缺一即 PR 不完整）

1. **类型**：`packages/protocol/src/events.ts` 的 `SparkEventMap` 加条目（数据结构先于代码设计好）。
2. **归类**：确定三属性——durable（是否落盘）/ live-only（是否仅内存）/ surface（是否进模型历史），更新 `SurfaceEventType` / `LiveOnlyEventType` 联合类型与 doc/02 §4.4 规则表。
3. **schema**：`packages/protocol/src/schema.ts` 加对应 zod schema；jsonSchema 导出自查。
4. **前端**：doc/02 §6.4 applyEvent 处理表加行 + `session-store.ts` 实现对应状态变更。
5. **单测（强制）**：applyEvent reducer 对新事件的单测（状态变更断言 + 边界情况）；这是硬门槛，AGENTS 约定 8。
6. **引擎**：找到正确的 emit 点（run-loop / tool pipeline / permission service），确认失败闭合（异常路径也发闭合事件）。
7. **文档同步（六处）**：doc/02 §4.3 词表、§4.4 规则表、§6.4 处理表；若涉及模型历史再查 §5.8 投影算法；AGENTS §3 任务指引表（如流程有变）。
8. **验证**：双侧 typecheck（protocol 消费方 web + engine 都要过）+ 单测。
9. **提交**：`feat(protocol): 新增 <事件名> 事件`，走 docs-update skill 的提交/推送步骤。

## 判例参考

- durable/live 二分依据：opencode（01 §1.6 B.3）；
- surface 判定依据：dsh "Model-visible means logged"（01 §1.4 B.2）；
- 未知事件 fail-closed：读端遇表外类型且无 ignorable 拒绝加载。
