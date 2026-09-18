# 对话框改造工单（对齐 DSH 设计）

> 生成日期：2026-09-18
> 基准：DSH (DeepSeek Harness) `packages/client/ui-chat/` + `ui-conversation/` + `ui-attachment/`
> 目标：将 Spark Web 对话框从当前 Tailwind 手写样式，逐项对齐 DSH 的视觉与交互规格
> 编号范围：WO-052 起
>
> **状态（2026-09-19，晚风拍板采纳）**：本工单已解禁，规格唯一来源=DESIGN.md §13.L（v2.19 / ADR D43），冲突处以 §13.L 为准。执行过滤：在册 WO-052/053/054/055/056/058/059/060/061/062/064/066/068/069/073/075/076/077/078；WO-057 记 Phase 3 可选；**不做** WO-063（英文 shimmer）/WO-065（审批接管）/WO-067（Lexical）/WO-070（TurnRail）/WO-071/072（StatsPills）。设计依据详读：DESIGN.md §12.1/§12.4/§12.8/§6 的豁免判注。

---

## 总览对比表

| 维度 | Spark 现状 | DSH 设计 | 改造目标 | 优先级 |
|------|-----------|----------|----------|--------|
| 输入框编辑器 | `<textarea>` 原生 | Lexical contenteditable | P2 |
| 输入框自动增长/最大行 | 1→6 行(144px)，JS 自适应 | 14 行 cap，.scroll 内滚 | P1 |
| 输入框圆角/阴影 | rounded-xl(12px) + border | 22px 圆角 + soft elevation shadow | P0 |
| 输入框内边距 | p-3(12px)，无 gap 分层 | pt-8px，text↔toolbar gap 12px | P1 |
| 附件预览(编辑器内) | 文本路径 chips + 隐藏 file input | 64×64px 缩略图 + 16px 圆角 + hover 关闭钮 | P1 |
| 文件卡片(编辑器内) | 文本路径 chip | 240px 宽卡片 + 图标 + 文件名/大小 + 上传进度 | P1 |
| 工具栏布局 | 左=[+][FolderTree][权限][Mic][Model][Effort] 右=[Segmented][发送] | 左=[+][权限][Plan] 右=[Model][发送] | P1 |
| 发送/停止按钮 | 32px 圆，bg-primary | 34px 圆，info-fill 蓝(#3964FE/#679EFE)，白图标 | P1 |
| 模型选择器位置 | 工具栏中部(左半区) | 工具栏右侧(发送钮左边) | P2 |
| 上下文用量显示 | UsageBar 横条(输入框上方) | ContextMeter 环形进度(输入框下方 dock) | P1 |
| 占位符动态变化 | 三态切换文本 | 多级优先级(steer>plan>default)，绝对定位 ellipsis | P2 |
| 用户消息样式 | rounded-[18px] rounded-br-[4px]，bg-accent，YOU 标签 | 22px 全圆角，无 YOU 标签，max-width 70.2% | P1 |
| 助手消息样式 | 全宽无背景，模型名标签 | 全宽无背景，无角色标签 | P2 |
| 消息间距 | Virtuoso 默认行间距 | 16px flow gap（闭合流程降为 8px） | P2 |
| 代码块样式 | streamdown/shiki 内建 | 自定义 CodeBlock + banner + sticky header | P2 |
| 工具调用卡片 | rounded-xl border，h-7 摘要行 | DisclosureRow，运行时 sweep 扫光动画 | P1 |
| 工具展开/折叠 | ChevronRight rotate-90 | ChevronDown rotate(-90deg→0) | P2 |
| diff 展示 | 行级绿/红底色 | 行级绿/红底色（已对齐） | — |
| 终端输出 | max-h-64 pre + 复制钮 | max-h-260 pre + 12px 圆角 + 0.5px 边框 | P2 |
| 审批卡位置/样式 | 流程内嵌，左 3px warn 边条 | 接管输入框（非流程卡片） | P1 |
| 审批按钮布局 | [允许一次][总是允许][拒绝] | 同（已对齐） | — |
| 审批超时处理 | 无 | 无（DSH 也无超时倒计时） | — |
| 回到底部按钮 | 28px 居中，border 样式 | 34px 右对齐，floating fill + shadow | P1 |
| Turn 导航 | 无 | 右侧 rail，10px 间距 tick mark，hover 预览 | P2 |
| 加载更早消息 | 无（virtuoso 虚拟滚动自动加载） | 顶部居中按钮，4px 12px padding | P2 |
| 滚动跟随策略 | followOutput='smooth' | 24px 阈值 + ResizeObserver + anchor 保持 | P2 |
| 运行中状态指示 | TurnHeader "工作中 · Ns" + TurnStatusBar | "Deep diving" 渐变 shimmer 文字 + 15s 后显计时器 | P1 |
| 错误状态/重试倒计时 | ErrorBanner + ErrorToast | TurnErrorItem + ModelRetryItem(倒计时) | P2 |
| max tokens 警告 | 无 | TurnMaxTokensItem(warning dot + 标题) | P2 |
| 图片预览(消息内) | h-20 rounded-lg | compact grid + 独立 MessageImage 组件 | P2 |
| 消息操作(复制/重生成/编辑) | AssistantActions 始终可见 | hover 渐显，28px 命中区 | P1 |
| 思考过程展示 | ReasoningCollapsible 纯文本 | ReasoningRow MarkdownText compact + sweep 动画 | P1 |
| 回合级用量面板 | "in X · out Y" 文本 | TurnUsagePanel 胶囊 + 点击展开详情弹窗 | P2 |
| 会话级统计 | 无 | StatsPills 双胶囊(gauge+database) + 弹窗 | P2 |
| 移动端适配 | 无断点(WO-043) | max-width:480px 胶囊折叠为纯图标 | P2 |

---

## 工单详情

---

### WO-052　输入框卡片圆角与阴影对齐 DSH 22px 规格

- **优先级**：P0
- **问题描述**：
  - Spark 现状：Composer 容器用 `rounded-xl`（12px 圆角）+ `border border-input`，见 `apps/web/src/features/chat/Composer.tsx:469`（`'rounded-xl border border-input bg-card p-3'`）。
  - DSH 设计：卡片 `border-radius: 22px`，无边框（`border: 0`），使用 `box-shadow: var(--dsw-elevation-soft)` 做柔和投影，背景 `var(--dsw-specific-input-major)`。见 DSH `packages/client/ui-conversation/src/client/skeleton/InputBar.module.css:61-63`。
  - 为什么要改：12px 圆角偏方正，DSH 的 22px 全圆角胶囊更现代；边框线改为投影更柔和，视觉层次更干净。
- **具体改造点**：
  1. 将 Composer 外层 `rounded-xl border border-input bg-card` 改为 `rounded-[22px] border-0 bg-[var(--dsw-specific-input-major)] shadow-[var(--dsw-elevation-soft)]`
  2. 聚焦态从 `focus-within:border-ring` 改为投影加深（`focus-within:shadow-[var(--dsw-elevation-prominent)]`），不再依赖边框变色
  3. 移除 `border border-input`，用 elevation shadow 替代
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/Composer.tsx`（第 468-471 行）
- **参考的 DSH 文件路径**：`packages/client/ui-conversation/src/client/skeleton/InputBar.module.css:45-77`
- **预估工作量**：0.5 人天

---

### WO-053　输入框内边距与文本↔工具栏间距分层

- **优先级**：P1
- **问题描述**：
  - Spark 现状：Composer 容器 `p-3`（12px 全方向 padding），textarea 与工具栏之间用 `mt-2`（8px）分隔。见 `Composer.tsx:469` 和 `Composer.tsx:550`（`'mt-2 flex h-8 items-center gap-1.5'`）。
  - DSH 设计：卡片 `padding-top: 8px`，文本区与工具栏行之间 `gap: 12px`（flex column），工具栏行自身 `padding: 2px 8px 6px`。见 DSH `InputBar.module.css:52`（`gap: 12px`）和 `:263`（`padding: 2px 8px 6px`）。
  - 为什么要改：DSH 的分层间距（8px 顶 padding → 12px gap → 工具栏底部 6px）让文本和工具栏的呼吸感更精确；Spark 的 12px 全方向 padding 让顶部和两侧太挤。
- **具体改造点**：
  1. Composer 容器从 `p-3` 改为 `pt-2 px-0`（8px 顶 padding，水平 padding 移到内部子元素）
  2. textarea 区域加 `px-3.5`（14px 左 padding，对齐 DSH `.input { padding: 4px 8px 0 14px }`）
  3. 工具栏行从 `mt-2`（8px）改为 `mt-3`（12px），对齐 DSH 的 gap:12px
  4. 工具栏行 padding 改为 `pt-0.5 pb-1.5 px-2`（2px 顶 6px 底）
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/Composer.tsx`（第 469、517-547、550 行）
- **参考的 DSH 文件路径**：`packages/client/ui-conversation/src/client/skeleton/InputBar.module.css:45-77,172-188,254-270`
- **预估工作量**：0.5 人天

---

### WO-054　输入框最大行数从 6 行扩展到 14 行

- **优先级**：P1
- **问题描述**：
  - Spark 现状：`MAX_HEIGHT = 144`（约 6 行 × 24px），textarea 用 `el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT)` 自适应。见 `Composer.tsx:102` 和 `:151-156`。
  - DSH 设计：最大高度通过 CSS 变量 `--dsh-composer-text-max-height` 控制（约 14 行），`.scroll` 容器 `max-height: var(--dsh-composer-text-max-height); overflow-y: auto`。见 DSH `InputBar.module.css:131-137`。
  - 为什么要改：6 行上限太短，长代码粘贴或多段指令很快就触发内滚；14 行给用户更充裕的编辑空间。
- **具体改造点**：
  1. `MAX_HEIGHT` 从 144 改为 336（14 行 × 24px）
  2. textarea 的 `max-h-36`（144px）改为 `max-h-[336px]`
  3. 保持现有 JS 自适应逻辑不变
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/Composer.tsx`（第 102、155、546 行）
- **参考的 DSH 文件路径**：`packages/client/ui-conversation/src/client/skeleton/InputBar.module.css:128-137`
- **预估工作量**：0.2 人天

---

### WO-055　发送/停止按钮颜色与尺寸对齐 DSH info-fill 蓝

- **优先级**：P1
- **问题描述**：
  - Spark 现状：发送按钮 `size-8`（32px），`bg-primary text-primary-foreground`，ArrowUp 图标。停止按钮同样 32px，Square 图标。见 `Composer.tsx:737-758`。
  - DSH 设计：发送按钮 `width: 34px; height: 34px; border-radius: 999px; background: var(--dsw-alias-button-info-fill)`（#3964FE 亮色 / #679EFE 暗色），白色图标，disabled 时 `opacity: 0.4`。见 DSH `InputBar.module.css:361-389`。
  - 为什么要改：DSH 用 info-fill 蓝（亮蓝）而非品牌主色，视觉上更克制；34px 比 32px 略大，命中区域更好。
- **具体改造点**：
  1. 发送/停止按钮从 `size-8`（32px）改为 `size-[34px]`
  2. 背景从 `bg-primary` 改为 `bg-[var(--dsw-alias-button-info-fill)]`（或映射到现有 primary 蓝色）
  3. 图标颜色保持白色
  4. disabled 从 `disabled:opacity-40` 保持不变（已对齐）
  5. 添加 `transform: translateY(-2px)` 微调位置（DSH 的 primary 按钮比工具栏行高偏上 2px）
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/Composer.tsx`（第 737-758 行）
- **参考的 DSH 文件路径**：`packages/client/ui-conversation/src/client/skeleton/InputBar.module.css:358-389`
- **预估工作量**：0.3 人天

---

### WO-056　工具栏布局：模型选择器移到右侧发送钮旁

- **优先级**：P1
- **问题描述**：
  - Spark 现状：工具栏左侧依次排列 [+][FolderTree][权限档位][Mic][ModelPicker][EffortPicker]，右侧为 [Segmented][发送钮]。模型选择器在左半区中间。见 `Composer.tsx:690-709`。
  - DSH 设计：左侧为 [+按钮][权限档位][Plan]，右侧为 [right slot][Model slot][发送钮]。模型选择器紧贴发送按钮左侧。见 DSH `InputBar.tsx:408-481`（`.row` flex space-between，`.trailing` 含 model + primary）。
  - 为什么要改：DSH 的布局将模型选择器与发送钮归为一组（都是"本轮输出控制"），左侧全是"输入辅助"，语义分组更清晰。
- **具体改造点**：
  1. 将 `ModelPicker` 和 `EffortPicker` 从左侧工具栏移到右侧 `ml-auto` 区域，放在 Segmented 左边
  2. 左侧保留 [+][FolderTree][权限档位][Mic]
  3. 右侧排列为：[EffortPicker][ModelPicker][Segmented][发送钮]
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/Composer.tsx`（第 690-734 行）
- **参考的 DSH 文件路径**：`packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:408-481`、`InputBar.module.css:254-300`
- **预估工作量**：0.3 人天

---

### WO-057　ContextMeter：将 UsageBar 横条改为环形进度指示器

- **优先级**：P1
- **问题描述**：
  - Spark 现状：UsageBar 是输入框上方的横条（h-3），左侧 h-1 进度条 + 右侧百分比文本。见 `apps/web/src/features/chat/UsageBar.tsx`。
  - DSH 设计：ContextMeter 是输入框下方 dock 中的环形进度指示器——SVG 14px viewBox 圆环（RADIUS=5.5, stroke-width=2）+ 百分比文本，点击弹出详情面板（system/tools/messages 三段彩色条）。见 DSH `packages/client/ui-conversation/src/client/skeleton/ContextMeter.tsx` 和 `.module.css`。
  - 为什么要改：横条占垂直空间且不直观；环形指示器更紧凑，点击可展开详情，信息密度更高。
- **具体改造点**：
  1. 将 UsageBar 从输入框上方移到输入框下方（dock 区域）
  2. 将横条改为 SVG 环形进度：14×14 viewBox, cx=7, cy=7, r=5.5, stroke-width=2
  3. 圆环下方（或旁边）显示百分比文本，13px，tertiary 色
  4. 点击圆环弹出浮层面板：标题"上下文已用 X%" + ~used / total 数字 + 三段彩色条（system=蓝灰, tools=紫, messages=蓝）+ 图例
  5. 面板宽度 264px，12px 圆角，12px padding
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/UsageBar.tsx`（重写为 ContextMeter）
  - `apps/web/src/routes/SessionPage.tsx`（调整 UsageBar 挂载位置）
- **参考的 DSH 文件路径**：
  - `packages/client/ui-conversation/src/client/skeleton/ContextMeter.tsx:1-180`
  - `packages/client/ui-conversation/src/client/skeleton/ContextMeter.module.css:1-154`
- **预估工作量**：1.5 人天

---

### WO-058　用户消息气泡：移除 YOU 标签，圆角从 18px 改为 22px 全圆角

- **优先级**：P1
- **问题描述**：
  - Spark 现状：用户消息有 `RoleLabel` 组件渲染 "YOU"（font-mono text-xs text-muted-foreground），气泡 `rounded-[18px] rounded-br-[4px]`，bg-accent，max-w-[80%]。见 `MessageItem.tsx:33-55`。
  - DSH 设计：用户消息无角色标签，气泡 `border-radius: 22px`（全圆角，无右下角收角），`max-width: min(calc(var(--dsh-chat-content-width) * 0.702), 82%)`，padding `10px 16px`，font-size 14px，line-height 22px。见 DSH `MessageItem.module.css:4-41`。
  - 为什么要改：DSH 不显示 "YOU" 标签（对话本身就是用户发的，标签冗余）；22px 全圆角与输入框卡片圆角一致，视觉统一。
- **具体改造点**：
  1. 移除用户消息前的 `<RoleLabel>YOU</RoleLabel>`
  2. 气泡从 `rounded-[18px] rounded-br-[4px]` 改为 `rounded-[22px]`
  3. 气泡 max-width 从 `max-w-[80%]` 改为 `max-w-[70.2%]`（对齐 DSH 的 525/748 比例）
  4. 气泡 padding 从 `px-3 py-2`（12px/8px）改为 `px-4 py-2.5`（16px/10px）
  5. 气泡 font-size 从 `text-[13px]` 改为 `text-[14px]`，line-height 从 relaxed 改为 `leading-[22px]`
  6. 气泡背景从 `bg-accent` 保持不变（语义等价）
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/MessageItem.tsx`（第 33-55 行）
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/MessageItem.module.css:4-41`、`MessageItem.tsx:157-229`
- **预估工作量**：0.5 人天

---

### WO-059　助手消息：移除模型名 RoleLabel，对齐 DSH 无标签风格

- **优先级**：P2
- **问题描述**：
  - Spark 现状：助手消息前有 `<RoleLabel>{model}</RoleLabel>`（font-mono text-xs），显示模型名。见 `MessageItem.tsx:64-66`。
  - DSH 设计：助手消息无角色标签，直接渲染 AssistantMarkdown 内容。见 DSH `AssistantNodeView.tsx`。
  - 为什么要改：DSH 不在每条消息前重复模型名（会话级已在头部/选择器处展示），减少视觉噪音。
- **具体改造点**：
  1. 移除助手消息前的 `<RoleLabel>{model}</RoleLabel>`
  2. 助手内容块从 `mt-1` 改为无 margin（直接跟在 flow gap 后面）
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/MessageItem.tsx`（第 63-68 行）
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/AssistantNodeView.tsx:29-41`
- **预估工作量**：0.2 人天

---

### WO-060　消息操作行：hover 渐显 + 28px 命中区

- **优先级**：P1
- **问题描述**：
  - Spark 现状：AssistantActions 始终可见，按钮 `size-5`（20px），`text-muted-foreground/70`，始终显示。见 `AssistantActions.tsx:55-103`。
  - DSH 设计：MessageIconActions 行高 28px，每个图标按钮 `width: 28px; height: 28px; border-radius: 28px`，15px 图标，tertiary 色 hover 变 secondary。非尾部消息在 hover/focus-within 时才显示（opacity 0→1）。见 DSH `MessageIconActions.module.css:5-92`。
  - 为什么要改：始终显示的操作图标行在每条消息下方增加视觉噪音；hover 渐显让对话流更干净。28px 命中区比 20px 更易点击。
- **具体改造点**：
  1. 助手消息非尾部行的操作图标默认 `opacity: 0`，hover/focus-within 时 `opacity: 1`，过渡 80ms
  2. 按钮从 `size-5`（20px）改为 `size-7`（28px）
  3. 图标从 `size-3` 改为 `size-[15px]`
  4. hover 背景用 `bg-accent`（对齐 DSH `--dsw-alias-interactive-bg-hover`）
  5. 用户消息下方的操作行同样应用 hover 渐显
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/AssistantActions.tsx`（第 27-103 行）
  - `apps/web/src/features/chat/MessageItem.tsx`（用户消息 actions 区域）
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/MessageIconActions.module.css:36-92`
- **预估工作量**：0.5 人天

---

### WO-061　工具卡片：运行时 sweep 扫光动画 + DisclosureRow 样式

- **优先级**：P1
- **问题描述**：
  - Spark 现状：ToolCard 运行中显示 `Loader2 animate-spin`（旋转加载图标），无扫光动画。见 `ToolCard.tsx:84-86`。
  - DSH 设计：GenericCommandCard 运行时在 `.row::after` 上做 300px 宽渐变扫光，从左到右 2.6s 循环。见 DSH `GenericCommandCard.module.css:11-30`。
  - 为什么要改：旋转 spinner 在工具卡片中显得通用且突兀；DSH 的扫光动画更微妙、更高级，与整体设计语言一致。
- **具体改造点**：
  1. 移除 ToolCard 运行时的 `Loader2 animate-spin`，改为在摘要行添加 `relative overflow-hidden` 容器
  2. 添加 CSS 伪元素扫光动画：
     ```css
     .toolRunning::after {
       content: '';
       position: absolute;
       inset-block: 0;
       left: 0;
       width: 300px;
       background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--background) 60%, transparent) 55%, transparent 100%);
       animation: tool-sweep 2.6s ease-out infinite;
       pointer-events: none;
     }
     @keyframes tool-sweep {
       0% { left: -300px; }
       90%, 100% { left: 100%; }
     }
     ```
  3. 保留错误态的 StateDot 红色指示
  4. 添加 `@media (prefers-reduced-motion: reduce)` 禁用动画
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/ToolCard.tsx`（第 71-86 行）
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/GenericCommandCard.module.css:11-30,82-86`
- **预估工作量**：0.5 人天

---

### WO-062　思考过程：sweep 动画 + Markdown 渲染 + 样式对齐

- **优先级**：P1
- **问题描述**：
  - Spark 现状：ReasoningCollapsible 用纯文本渲染思考内容（`whitespace-pre-wrap text-muted-foreground`），无 sweep 动画。见 `ReasoningCollapsible.tsx:80-84`。
  - DSH 设计：ReasoningRow 使用 `MarkdownText` 组件渲染（compact variant），运行时有 sweep 扫光动画，展开内容缩进 22px。见 DSH `ReasoningRow.tsx:42-65` 和 `ReasoningRow.module.css:25-39`。
  - 为什么要改：纯文本不支持 markdown 格式化；sweep 动画与工具卡片统一设计语言。
- **具体改造点**：
  1. 将展开内容从纯文本 `<p>` 改为 Streamdown markdown 渲染（compact 模式）
  2. 添加运行时 sweep 扫光动画（与 WO-061 相同的 CSS）
  3. 展开内容缩进从 `px-3` 改为 `pl-[22px]`
  4. 折叠态摘要从 `text-muted-foreground/70` 改为 `text-muted-foreground`（tertiary 色）
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/ReasoningCollapsible.tsx`（第 52-86 行）
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/ReasoningRow.tsx:29-68`、`ReasoningRow.module.css:25-39,70-104`
- **预估工作量**：0.5 人天

---

### WO-063　运行中状态："Deep diving" 渐变 shimmer 文字替代 TurnHeader

- **优先级**：P1
- **问题描述**：
  - Spark 现状：TurnHeader 显示 "工作中 · Ns"（font-mono text-xs text-muted-foreground/70），无动画。TurnStatusBar 显示在顶部悬浮。见 `TurnHeader.tsx:26-31`。
  - DSH 设计：运行中在消息流底部显示 "Deep diving" 渐变 shimmer 文字（deepseek-500→200→500 渐变背景，background-clip: text，1.8s 循环动画），15 秒后追加计时器。见 DSH `ChatView.tsx:169-202` 和 `ChatView.module.css:82-137`。
  - 为什么要改：DSH 的 "Deep diving" 渐变文字比 Spark 的 "工作中" 更有沉浸感和设计感；shimmer 动画让用户感知到系统在"思考"。
- **具体改造点**：
  1. 在 ChatView 底部（消息列表末尾）添加运行状态行，显示 "Deep diving"（或中文"深度思考中"）
  2. 使用 CSS 渐变 shimmer：
     ```css
     .deepDiving {
       background: linear-gradient(90deg, var(--primary) 0%, var(--primary) 40%, var(--primary/30) 50%, var(--primary) 60%, var(--primary) 100%);
       background-size: 250% 100%;
       background-clip: text;
       -webkit-background-clip: text;
       color: transparent;
       animation: deep-diving-shimmer 1.8s linear infinite;
     }
     @keyframes deep-diving-shimmer {
       to { background-position: 0 0; }
     }
     ```
  3. 15 秒后在右侧追加计时器（格式 "Xm Ys" 或 "Ys"），13px tertiary 色
  4. 保留 TurnHeader 作为回合级摘要（但样式可简化）
  5. 添加 `@media (prefers-reduced-motion: reduce)` 禁用动画
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/ChatView.tsx`（添加运行状态行）
  - `apps/web/src/features/chat/TurnHeader.tsx`（调整样式）
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/ChatView.tsx:169-202`、`ChatView.module.css:82-137`
- **预估工作量**：1.0 人天

---

### WO-064　回到底部按钮：右对齐 + 34px floating 样式

- **优先级**：P1
- **问题描述**：
  - Spark 现状：BackBottom 按钮 `size-7`（28px），`left-1/2 -translate-x-1/2`（居中），`border border-border bg-background`。见 `BackBottom.tsx:15-22`。
  - DSH 设计：toBottom 按钮 `width: 34px; height: 34px; border-radius: 100px; background: var(--dsw-alias-button-floating-fill); box-shadow: var(--dsw-elevation-panel)`，右对齐（`justify-content: flex-end`），sticky bottom 16px，z-index 8。见 DSH `ChatView.module.css:171-218`。
  - 为什么要改：居中按钮可能遮挡消息内容；右对齐不遮挡阅读区，34px 更大且带浮动投影更突出。
- **具体改造点**：
  1. 按钮从 `size-7`（28px）改为 `size-[34px]`
  2. 位置从 `left-1/2 -translate-x-1/2` 改为 `right-4`（右对齐）
  3. 样式从 `border border-border bg-background` 改为无 border + `bg-[var(--dsw-alias-button-floating-fill)] shadow-[var(--dsw-elevation-panel)]`
  4. 使用 sticky 定位（bottom 16px）而非 absolute
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/BackBottom.tsx`
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/ChatView.module.css:171-218`
- **预估工作量**：0.3 人天

---

### WO-065　审批卡：接管输入框而非流程内嵌

- **优先级**：P1
- **问题描述**：
  - Spark 现状：ApprovalCard 作为流程中的一行消息渲染，左侧 3px warn 边条 + warn/6 背景。见 `ApprovalCard.tsx:66-70` 和 `MessageItem.tsx:105-109`。
  - DSH 设计：审批（ApprovalPanel）接管输入框——输入框被替换为审批面板，而非在消息流中插入卡片。见 DSH `ChatView.tsx:806-808` 注释："No pending placeholders: questions and approvals both take over the composer"。
  - 为什么要改：DSH 的设计让审批出现在用户预期的输入位置，不需要用户在消息流中滚动找审批卡。
- **具体改造点**：
  1. 当有 pending 审批时，Composer 输入框区域替换为审批面板（而非在消息流中插入卡片）
  2. 审批面板包含：action + resource + reason + [允许一次][总是允许][拒绝] 按钮
  3. 消息流中不再渲染 ApprovalRow（或渲染为已解决的摘要行）
  4. 审批解决后恢复输入框
  5. 保留 resolved 后的摘要行（"审批已允许/拒绝"）
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/ApprovalCard.tsx`（改造为 composer 接管面板）
  - `apps/web/src/features/chat/MessageItem.tsx`（移除 approval 行渲染）
  - `apps/web/src/routes/SessionPage.tsx`（调整审批状态管理）
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/ChatView.tsx:806-808`（注释说明）
- **预估工作量**：1.5 人天

---

### WO-066　输入框内附件预览：64×64px 缩略图 + 关闭钮

- **优先级**：P1
- **问题描述**：
  - Spark 现状：附件以文本路径 chip 形式展示（`AttachmentChips.tsx`），h-6 rounded-full border mono 文本。图片上传后仅显示文件名 chip，无缩略图。见 `AttachmentChips.tsx:28-47`。
  - DSH 设计：附件轨道（rail）中图片以 64×64px 缩略图展示，16px 圆角，hover 时右上角显示 18px 圆形关闭钮。见 DSH `ComposerAttachments.tsx:74-96` 和 `ComposerAttachments.module.css:9-62`。
  - 为什么要改：文本 chip 无法直观预览图片内容；64×64px 缩略图让用户一眼确认附件是否正确。
- **具体改造点**：
  1. 图片附件从文本 chip 改为 64×64px 缩略图方块
  2. 缩略图圆角 16px，object-fit: cover
  3. hover 时右上角显示 18px 圆形关闭钮（深色背景 + 白色 X 图标）
  4. 文件附件保持文本 chip 但改为文件卡片样式（240px 宽，图标 + 文件名 + 大小）
  5. 缩略图上方留 padding `2px 10px 0`
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/AttachmentChips.tsx`（重写为 rail 布局）
  - `apps/web/src/features/chat/Composer.tsx`（附件数据传递调整）
- **参考的 DSH 文件路径**：
  - `packages/client/ui-attachment/src/client/ComposerAttachments.tsx:49-97`
  - `packages/client/ui-attachment/src/client/ComposerAttachments.module.css:1-69`
- **预估工作量**：1.0 人天

---

### WO-067　输入框编辑器：从 textarea 迁移到 contenteditable（P2 评估项）

- **优先级**：P2
- **问题描述**：
  - Spark 现状：使用原生 `<textarea>` 实现输入编辑。见 `Composer.tsx:517-547`。
  - DSH 设计：使用 Lexical contenteditable 实现，支持 @引用芯片（ReferenceChip 作为 DecoratorNode）、自动增长、光标管理。见 DSH `ComposerContentEditable.tsx` 和 `DraftEditor.tsx`。
  - 为什么要改：Lexical 支持富文本芯片内嵌（@文件引用作为 inline chip 而非纯文本 token），但迁移成本高。
- **具体改造点**：
  1. 评估引入 Lexical 或轻量 contenteditable 方案的成本
  2. 优先实现 @引用芯片内嵌（当前 @ 仅插入纯文本 token `@path`，DSH 渲染为带图标的 chip）
  3. 如需完整迁移，分步进行：先 contenteditable 外壳 → 再 chip 节点 → 再 keymap
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/Composer.tsx`
- **参考的 DSH 文件路径**：
  - `packages/client/ui-conversation/src/client/input/editor/ComposerContentEditable.tsx`
  - `packages/client/ui-conversation/src/client/input/editor/DraftEditor.tsx`
  - `packages/client/ui-conversation/src/client/input/editor/ReferenceChip.tsx` + `.module.css`
- **预估工作量**：3.0 人天（如仅做 chip 内嵌则 1.0 人天）

---

### WO-068　消息流间距：16px flow gap + 闭合流程降为 8px

- **优先级**：P2
- **问题描述**：
  - Spark 现状：使用 react-virtuoso 虚拟滚动，行间距由 Virtuoso 默认 + 各组件自身 margin 控制。ToolCard 有 `my-1`（4px margin），ReasoningCollapsible 有 `my-1`。
  - DSH 设计：消息列使用 CSS 兄弟选择器统一间距 `margin-top: var(--dsh-chat-flow-gap, 16px)`，闭合流程（turn-process-answer）降为 8px。见 DSH `ChatView.module.css:49-64`。
  - 为什么要改：统一的 16px 行间距让对话流更有节奏；Spark 的 my-1（4px）太紧凑。
- **具体改造点**：
  1. 在 ChatView 的 Virtuoso itemContent 外层添加统一的 row gap（16px）
  2. 移除 ToolCard 和 ReasoningCollapsible 的 `my-1` margin
  3. 闭合流程行（tool call → answer）间距降为 8px
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/ChatView.tsx`
  - `apps/web/src/features/chat/ToolCard.tsx`（移除 my-1）
  - `apps/web/src/features/chat/ReasoningCollapsible.tsx`（移除 my-1）
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/ChatView.module.css:49-64`
- **预估工作量**：0.3 人天

---

### WO-069　回到底部按钮定位：sticky 而非 absolute

- **优先级**：P2
- **问题描述**：
  - Spark 现状：BackBottom 使用 `absolute bottom-3 left-1/2` 定位。见 `BackBottom.tsx:19`。
  - DSH 设计：toBottom 使用 sticky 定位（`position: sticky; bottom: 16px; height: 0`），零高度槽位不扩展 scrollHeight。见 DSH `ChatView.module.css:171-195`。
  - 为什么要改：absolute 定位的按钮可能遮挡内容；sticky 零高度槽位更优雅。
- **具体改造点**：
  1. 将 BackBottom 从 absolute 改为 sticky 定位
  2. 外层容器 height: 0，按钮 translate up 进入视口
  3. z-index 设为 8（在 Composer 之上）
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/BackBottom.tsx`
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/ChatView.module.css:171-195`
- **预估工作量**：0.2 人天

---

### WO-070　Turn 导航 rail：右侧 tick mark 导航条

- **优先级**：P2
- **问题描述**：
  - Spark 现状：无 Turn 导航。用户只能滚动浏览消息历史。
  - DSH 设计：TurnNavigator 是右侧固定 rail，每个 Turn 一个 tick mark（12px 宽 2px 高的横线），active 变 20px 宽 + 主色，hover 显示 prompt 预览 tooltip。见 DSH `TurnNavigator.tsx` 和 `.module.css`。
  - 为什么要改：长对话中 Turn 导航让用户快速跳转到历史轮次，无需大量滚动。
- **具体改造点**：
  1. 在 ChatView 右侧添加 sticky rail 组件
  2. 每个 Turn 渲染一个 10px 间距的 tick mark
  3. active turn 的 mark 变宽（20px）+ 主色
  4. hover 显示 tooltip（Turn 编号 + prompt 预览 1 行 + response 预览 3 行）
  5. 窄屏（<900px）隐藏 rail
  6. 点击 mark 滚动到对应 Turn
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/ChatView.tsx`（集成 rail）
  - 新增 `apps/web/src/features/chat/TurnRail.tsx`
- **参考的 DSH 文件路径**：
  - `packages/client/ui-chat/src/client/chat/TurnNavigator.tsx:1-222`
  - `packages/client/ui-chat/src/client/chat/TurnNavigator.module.css:1-235`
- **预估工作量**：2.0 人天

---

### WO-071　回合级 token 用量胶囊：TurnUsagePanel 样式

- **优先级**：P2
- **问题描述**：
  - Spark 现状：AssistantBlock 底部显示纯文本 "in X · out Y"（font-mono text-xs text-muted-foreground/70）。见 `AssistantBlock.tsx:77-81`。
  - DSH 设计：TurnUsagePanel 是一个胶囊按钮（database 图标 + "已用 X tokens" 文本），28px 高，圆角 28px，点击弹出详情弹窗（input/cacheRead/cacheWrite/output/reasoning 分项）。见 DSH `TurnUsagePanel.tsx:46-125` 和 `.module.css`。
  - 为什么要改：纯文本无交互；胶囊按钮更美观且可展开详情。
- **具体改造点**：
  1. 将 AssistantBlock 底部的 "in X · out Y" 文本改为胶囊按钮
  2. 胶囊样式：inline-flex, gap 4px, padding 6px 8px, 28px 圆角, tertiary 色 hover 变 secondary
  3. 包含 database 图标（15px）+ 紧凑 token 数字
  4. 点击弹出详情弹窗：input / cacheRead / cacheWrite / output / reasoning 分项数字
  5. 窄屏（<480px）胶囊折叠为纯图标
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/AssistantBlock.tsx`（第 77-81 行）
  - `apps/web/src/features/chat/AssistantActions.tsx`（用量胶囊放在 actions 行）
- **参考的 DSH 文件路径**：
  - `packages/client/ui-chat/src/client/chat/TurnUsagePanel.tsx:46-182`
  - `packages/client/ui-chat/src/client/chat/TurnUsagePanel.module.css:1-75`
- **预估工作量**：1.0 人天

---

### WO-072　会话级统计胶囊：StatsPills

- **优先级**：P2
- **问题描述**：
  - Spark 现状：无会话级统计展示。
  - DSH 设计：StatsPills 在输入框下方 dock 中显示两个胶囊：gauge（turns/steps/speed）+ database（total tokens/cache hit），点击弹出详情。见 DSH `StatsPills.tsx:317-357`。
  - 为什么要改：让用户在对话过程中直观了解会话耗时和 token 消耗。
- **具体改造点**：
  1. 在输入框下方 dock 区域添加两个统计胶囊
  2. TimePill：gauge 图标 + "N turns · N steps · X.X t/s"
  3. UsagePill：database 图标 + "~X tokens · Y% cache hit"
  4. 点击各自弹出详情面板
  5. 面板共享 stat-dialog 样式（标题 + rule + dl 列表）
- **涉及的 Spark 文件路径**：
  - 新增 `apps/web/src/features/chat/StatsPills.tsx`
  - `apps/web/src/routes/SessionPage.tsx`（集成到 dock）
- **参考的 DSH 文件路径**：
  - `packages/client/ui-chat/src/client/chat/StatsPills.tsx:1-357`
  - `packages/client/ui-chat/src/client/chat/StatsPills.module.css:1-67`
- **预估工作量**：1.5 人天

---

### WO-073　加载更早消息：顶部居中按钮

- **优先级**：P2
- **问题描述**：
  - Spark 现状：使用 react-virtuoso 虚拟滚动，无显式"加载更早"按钮。
  - DSH 设计：当 hasMore 时在消息列表顶部渲染居中按钮，`border-radius: 14px; padding: 4px 12px; font-size: 12px`。见 DSH `ChatView.tsx:778-784` 和 `ChatView.module.css:151-169`。
  - 为什么要改：虽然 virtuoso 自动处理，但显式按钮让用户知道还有历史可加载。
- **具体改造点**：
  1. 在 Virtuoso 顶部添加"加载更早"按钮
  2. 按钮样式：居中，14px 圆角，4px 12px padding，12px 字体
  3. loading 状态显示加载中文本 + disabled
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/ChatView.tsx`
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/ChatView.tsx:778-784`、`ChatView.module.css:151-169`
- **预估工作量**：0.3 人天

---

### WO-074　错误状态：TurnErrorItem + 重试倒计时

- **优先级**：P2
- **问题描述**：
  - Spark 现状：有 ErrorBanner 和 ErrorToast，但无重试倒计时展示。
  - DSH 设计：TurnErrorItem 显示红色 StateDot + 标题 "Turn error" + 错误消息 + 错误代码。ModelRetryItem 显示重试倒计时（"Retrying in N seconds"），活跃时 shimmer 动画。见 DSH `MessageItem.tsx:125-154`。
  - 为什么要改：统一的错误行样式 + 重试倒计时让用户知道系统在自动恢复。
- **具体改造点**：
  1. 添加 TurnErrorItem 组件：10px dot + 标题 + 消息 + code
  2. 添加 ModelRetryItem 组件：可展开 details 显示 delay + failure reason，活跃时 shimmer
  3. 添加 TurnMaxTokensItem：warning dot + "Max tokens reached" 标题 + 提示
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/MessageItem.tsx`（添加 error/retry/maxTokens 行）
  - 新增对应 CSS
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/MessageItem.tsx:58-154`、`MessageItem.module.css:195-333`
- **预估工作量**：1.0 人天

---

### WO-075　占位符动态变化：多级优先级

- **优先级**：P2
- **问题描述**：
  - Spark 现状：占位符三态切换（等待审批/运行中/空闲），文本硬编码。见 `Composer.tsx:539-545`。
  - DSH 设计：占位符有优先级链：steerQueue > plan > default，还有 parentOffline/unavailable 状态。见 DSH `InputBar.tsx:333-342`。
  - 为什么要改：DSH 的多级占位符让用户在不同模式下得到精确的输入引导。
- **具体改造点**：
  1. 保持现有三态占位符
  2. 可选添加：steer 模式占位符（"继续输入以插话..."）
  3. 占位符样式对齐 DSH：绝对定位，caption 色，ellipsis 单行
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/Composer.tsx`
- **参考的 DSH 文件路径**：`packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:333-342`、`InputBar.module.css:216-225`
- **预估工作量**：0.2 人天

---

### WO-076　移动端适配：窄屏胶囊折叠为纯图标

- **优先级**：P2
- **问题描述**：
  - Spark 现状：无移动端断点（WO-043 已记录）。
  - DSH 设计：TurnUsagePanel 等胶囊在 `max-width: 480px` 时折叠为纯图标（隐藏 label 文本）。TurnNavigator rail 在 `max-width: 900px` 时隐藏。
  - 为什么要改：窄屏下文字胶囊挤占空间。
- **具体改造点**：
  1. 所有统计胶囊（UsageBar/TurnUsagePanel/StatsPills）在 <480px 时折叠为纯图标
  2. 工具栏在窄屏下允许 trailing 组换行
  3. 用户消息气泡 max-width 在窄屏下调整
- **涉及的 Spark 文件路径**：多个组件
- **参考的 DSH 文件路径**：
  - `packages/client/ui-chat/src/client/chat/TurnUsagePanel.module.css:61-75`
  - `packages/client/ui-chat/src/client/chat/TurnNavigator.module.css:217-221`
- **预估工作量**：0.5 人天

---

### WO-077　文件卡片样式：消息内附件展示

- **优先级**：P2
- **问题描述**：
  - Spark 现状：用户消息中的附件仅显示图片缩略图（h-20 rounded-lg border），无文件卡片。见 `MessageItem.tsx:37-51`。
  - DSH 设计：消息内文件附件以 240px 宽卡片展示：28px 文件图标 + 文件名（14px medium）+ 扩展名/大小（12px tertiary），16px 圆角，0.5px border。见 DSH `MessageItem.module.css:343-387`。
  - 为什么要改：文本附件需要更友好的卡片展示，而非纯文件名。
- **具体改造点**：
  1. 消息内文件附件从纯文件名改为文件卡片
  2. 卡片：240px 宽，16px 圆角，0.5px border
  3. 左侧 28px 文件类型图标
  4. 右侧：文件名（14px medium）+ 元信息（12px tertiary）
- **涉及的 Spark 文件路径**：`apps/web/src/features/chat/MessageItem.tsx`（用户消息附件区域）
- **参考的 DSH 文件路径**：`packages/client/ui-chat/src/client/chat/MessageItem.module.css:335-387`
- **预估工作量**：0.5 人天

---

### WO-078　输入框字体大小：从 13px 调整为 14px

- **优先级**：P2
- **问题描述**：
  - Spark 现状：textarea 字体 `text-[13px]`。见 `Composer.tsx:546`。
  - DSH 设计：输入框字体 `var(--dsh-content-font-size, 14px)`，line-height 24px。见 DSH `InputBar.module.css:68-69`。
  - 为什么要改：14px 是更标准的输入字体大小，13px 偏小影响可读性。
- **具体改造点**：
  1. textarea 的 `text-[13px]` 改为 `text-[14px]`
  2. line-height 从 `leading-relaxed` 改为 `leading-[24px]`
  3. 助手消息正文也从 `text-[13px]` 统一为 `text-[14px]`
- **涉及的 Spark 文件路径**：
  - `apps/web/src/features/chat/Composer.tsx`（第 546 行）
  - `apps/web/src/features/chat/AssistantBlock.tsx`（第 40、59 行）
- **参考的 DSH 文件路径**：`packages/client/ui-conversation/src/client/skeleton/InputBar.module.css:68-69`
- **预估工作量**：0.2 人天

---

## 已对齐项（无需改造）

| 维度 | 说明 |
|------|------|
| diff 展示 | Spark 的 DiffViewer 行级绿/红底色已与 DSH 概念一致 |
| 审批按钮布局 | [允许一次][总是允许][拒绝] 三按钮已对齐 |
| 审批超时处理 | DSH 也无超时倒计时，双方一致 |
| 终端输出基本结构 | Spark 的 TerminalView（pre + 自动滚底 + 复制钮）概念已对齐 |
| 发送/停止图标切换 | Spark 的 ArrowUp↔Square 切换已对齐 DSH 的 arrow↔square |
| @ / / 菜单触发 | Spark 的 detectMenu + ComposerMenu 已对齐 DSH 的 slash/at 菜单逻辑 |
| 语音输入 | Spark 有 Mic 按钮（DSH 无此功能，属 Spark 增量） |
| 提交模式分段 | Spark 的 Segmented（立即/插话/排队）是 DSH 没有的增量功能 |
| 工具分组折叠 | Spark 的 ToolGroupRow 是 DSH 没有的增量功能 |

---

## 预估总工作量汇总

| 优先级 | 工单数 | 预估总人天 |
|--------|--------|-----------|
| P0 | 1 | 0.5 |
| P1 | 12 | 9.6 |
| P2 | 14 | 12.9 |
| **合计** | **27** | **~23.0 人天** |

> 注：WO-077（编辑器迁移到 Lexical）如仅做 @chip 内嵌则为 1.0 人天，完整迁移为 3.0 人天，上表按完整迁移计入。
