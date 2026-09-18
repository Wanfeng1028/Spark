# Spark 对话框（Composer + 会话流）改造规格工单

> 目标：把 DSH（DeepSeek Harness）的输入栏与对话流视觉语言，原样移植到 Spark。
> 所有几何/颜色值均来自 DSH 源码 `.module.css`，并标注来源文件与行号；Spark 侧一律写成 Tailwind v4 class（必要时用 `[...]` arbitrary value）。
> 主题：Spark 现有 zinc 黑白极简（浅色 `:root` / 深色 `.dark`），下方每张表给出「浅色 / 深色」两套值。
> 参考截图：用户上传的 DSH 输入栏（GeoWork + 标准模式 / 22px 白卡 / 底部工具条 / 蓝色发送钮）。

---

## 0. 设计值译码对照表（DSH token → 真实 hex → Spark 落地）

DSH 的样式全靠 CSS 变量，真正的 hex 在 `ui-theme/src/styles/design-platform.css`。下表是本次改造会用到的全部译码。**所有 DSH 几何值都在 `.module.css` 里，本表只译颜色。**

| DSH token | 浅色值 | 深色值 | Spark 落地（Tailwind） |
|---|---|---|---|
| `--dsw-alias-bg-base` | `#FFFFFF` | `#151517`(rgb 21,21,23) | `bg-background`（Spark `#fff`/`#09090b`，近似） |
| `--dsw-specific-input-major`（卡片底） | `#FFFFFF` | `#2C2C2E`(rgb 44,44,46) | 浅色 `bg-card`；深色 `dark:bg-[#2C2C2E]` |
| `--dsw-specific-selector`（+ 钮底） | `#F9FAFB`(249,250,251) | `#353638`(53,54,56) | 浅色 `bg-secondary`(#f4f4f5)；深色 `dark:bg-secondary`(#27272a) 近似 |
| `--dsw-specific-bubble`（用户气泡） | `#EDF3FE`(237,243,254) | `#2C2C2E` | 浅色 `bg-[#EDF3FE]`；深色 `dark:bg-[#2C2C2E]` |
| `--dsw-alias-label-primary` | `#0F1115`(15,17,21) | `#F9FAFB` | `text-foreground`（Spark `#18181b`/`#fafafa`，近似） |
| `--dsw-alias-label-secondary` | `#61666B`(97,102,107) | `#CFD3D6`(207,211,214) | `text-muted-foreground`（Spark `#71717a`/`#a1a1aa`，近似） |
| `--dsw-alias-label-tertiary` | `#81858C`(129,133,140) | `#ADB2B8`(173,178,184) | 浅色 `text-[#81858C]`；深色 `dark:text-[#ADB2B8]` |
| `--dsw-alias-label-caption`（placeholder） | `#ADB2B8` | `#81858C` | 浅色 `placeholder:text-[#ADB2B8]`；深色 `dark:placeholder:text-[#81858C]` |
| `--dsw-alias-state-business-primary` / `button-info-fill` | `#4176E6`(65,118,230) | `#679EFE`(103,158,254) | **新增 `--send-accent`**（见 §1.0） |
| `--dsw-alias-button-info-hover` | `#679EFE` | `#4176E6` | **新增 `--send-accent-hover`** |
| `--dsw-alias-interactive-bg-hover-solid` | `#F1F3F5`(241,243,245) | `#353638` | 浅色 `bg-[#F1F3F5]`；深色 `dark:bg-[#353638]` |
| `--dsw-alias-interactive-bg-hover` | `rgba(38,49,72,0.06)` | `rgba(255,255,255,0.08)` | `hover:bg-accent`（Spark `#f4f4f5`/`#27272a`，近似） |
| `--dsw-alias-border-l2` | `rgba(0,0,0,0.10)` | `rgba(255,255,255,0.12)` | 卡片 0.5px 描边环（见 §1.1 阴影） |
| `--dsw-alias-border-l3` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.16)` | 回底按钮描边 |
| `--dsw-alias-border-l4` | `rgba(0,0,0,0.16)` | `rgba(255,255,255,0.20)` | Turn 刻度线 |
| `--dsw-alias-button-floating-fill`（回底钮） | `#FFFFFF` | `#2C2C2E` | 浅色 `bg-card`；深色 `dark:bg-[#2C2C2E]` |
| `--dsw-alias-markdown-code-block` | `#F9FAFB` | `#1B1B1C`(27,27,28) | 工具展开体底色 |
| `--dsw-alias-bg-layer-1`（浮层面板） | `#FFFFFF` | `#232324`(35,35,36) | `bg-popover`（Spark `#fff`/`#18181b`，近似） |

> 译码来源：`design-platform.css` L37–L77（静态色板）、L156–L251（浅色别名）、L253–L346（深色别名）。

### 1.0 新增 token（必须先加，否则蓝发送钮无处取色）

DSH 的发送钮是**信息蓝**（截图里那个浅蓝圆钮），而 Spark 现在的 `bg-primary` 是墨色（`#18181b`/`#fafafa`）。截图明确要求蓝钮，且 Spark 其余部分保持黑白极简——**只有发送钮/caret/链接这一个点睛色例外**。在 `apps/web/src/styles/tokens.css` 追加：

```css
:root {
  /* 发送/主操作蓝（移植 DSH info-fill；黑白主题唯一彩色点睛） */
  --send-accent: #4176e6;
  --send-accent-hover: #679efe;
  --user-bubble: #edf3fe; /* DSH 用户气泡浅蓝底（黑白主题下的弱染色） */
}
.dark {
  --send-accent: #679efe;
  --send-accent-hover: #4176e6;
  --user-bubble: #2c2c2e;
}
@theme inline {
  --color-send-accent: var(--send-accent);
  --color-send-accent-hover: var(--send-accent-hover);
  --color-user-bubble: var(--user-bubble);
}
```

> 替代方案（若坚持纯黑白、不要蓝）：把下面所有 `bg-send-accent` 改成 `bg-primary`、`caret-send-accent` 改成 `caret-foreground`，气泡用 `bg-secondary`。其余几何改动不受影响。

---

## 1. 整体设计规格

### 1.1 输入栏（Composer 卡片）完整规格表

> 来源：`ui-conversation/.../skeleton/InputBar.module.css`（下文简称 `IB.css`）；布局变量来自 `ui-conversation/.../skeleton/ConversationRoot.module.css`（简称 `CR.css`）。

| 项 | DSH 真实值 | 来源 | Spark Tailwind（浅色 / 深色） |
|---|---|---|---|
| 卡片圆角 | `22px` | `IB.css` L61 `border-radius:22px` | `rounded-[22px]` |
| 卡片描边 | **无 border**，靠阴影里 0.5px 环 | `IB.css` L59 `border:0` + L60 | 不用 `border`；改阴影（下行） |
| 卡片阴影 | `0 0 0 0.5px <l2>, 0 4px 16px 0 rgba(0,0,0,.03), 0 0 24px 0 rgba(0,0,0,.03)` | `IB.css` L63 + `gradient-shadow-text.css` L28–34 | 浅色 `shadow-[0_0_0_0.5px_rgba(0,0,0,0.10),0_4px_16px_rgba(0,0,0,0.03),0_0_24px_rgba(0,0,0,0.03)]`；深色把环改 `rgba(255,255,255,0.12)` |
| 卡片背景 | input-major | `IB.css` L62 | `bg-card dark:bg-[#2C2C2E]` |
| 卡片最大宽 | `chat+32`（Spark 列宽 768 → 同 768） | `CR.css` L362 | 保持外层 `max-w-[768px]`（见 §2.1） |
| 顶部内边距 | `8px` | `IB.css` L55 `padding-top:8px` | `pt-2`（8px） |
| 文本区↔工具条间距 | `12px`（flex column gap） | `IB.css` L52 `gap:12px` | 容器 `gap-3` |
| 工具条区内边距 | `2px 8px 6px` | `IB.css` L263 `padding:2px 8px 6px` | `pt-0.5 px-2 pb-1.5`（≈2/8/6） |
| 工具条组间距 | 组间 `12px` | `IB.css` L285/L289/L299 | `gap-3` |

**文本编辑区**（来源 `IB.css` L172–225）：

| 项 | DSH 值 | 来源 | Spark |
|---|---|---|---|
| 最小高（单行） | `36px` | `IB.css` L176 `min-height:36px` | `min-h-9`（36px） |
| 最大高（内滚上限） | `336px`（14 行 ×24） | `CR.css` L331 | `max-h-[336px] overflow-y-auto`（替换现在的 `max-h-36`=144px） |
| 内边距 | `4px 8px 0 14px` | `IB.css` L177 | `pt-1 pr-2 pl-3.5`（4/8/0/14） |
| 字号/行高 | `14px / 24px` | `IB.css` L68–69 | `text-sm leading-6`（14/24） |
| 文本色 | label-primary | `IB.css` L185 | `text-foreground` |
| caret 色 | business-primary | `IB.css` L187 | `caret-send-accent` |
| placeholder 色 | caption | `IB.css` L216–219 | `placeholder:text-[#ADB2B8] dark:placeholder:text-[#81858C]` |
| placeholder 文案 | `描述你想要构建的内容，/ 调用指令，@ 文件或对话` | 截图 | 把现有 `'向 Spark 提问，使用 @ 添加上下文，使用 / 选择命令或能力'` 替换为截图文案（见 §4.6） |

**工具条控件**（来源 `IB.css`）：

| 控件 | DSH 值 | 来源 | Spark |
|---|---|---|---|
| + 钮 | `28×28`，圆，底 selector，图标 14px | `IB.css` L303–319 | `size-7 rounded-full bg-secondary text-foreground hover:bg-[#F1F3F5] dark:hover:bg-[#353638]`，图标 `size-3.5`（14px） |
| 模型/权限 选择器 | 高 `28px`，`padding:0 20px 0 8px`，圆角 `8px`，字 `13px/20px/500`，色 secondary，右侧 12px 灰 chevron | `IB.css` L328–347 | `h-7 rounded-lg px-2 pr-5 text-[13px] leading-5 font-medium text-muted-foreground`，chevron `size-3 opacity-60`，hover `hover:bg-accent` |
| 发送/停止钮 | `34×34`，圆，底 info-fill，白箭头 16px，禁用 opacity 0.4，`translateY(-2px)` | `IB.css` L361–389 | `size-[34px] rounded-full bg-send-accent text-white enabled:hover:bg-send-accent-hover disabled:opacity-40`，图标 `size-4`，外加 `-translate-y-0.5`（≈-2px） |

> 注：DSH 发送钮把整行上移 2px（`IB.css` L379），因为工具条整体下沉 2px；Spark 工具条不再下沉，此 `-translate-y-0.5` 可保留以对齐 DSH 视觉，也可省略——**验收时二选一，推荐省略**（Spark 工具条是自己的 `items-center`）。

### 1.2 消息气泡规格表

> 来源：`ui-chat/.../chat/MessageItem.module.css`（简称 `MI.css`）、`ChatView.module.css`（简称 `CV.css`）。

**用户气泡**（`MI.css` L4–41）：

| 项 | DSH 值 | 来源 | Spark |
|---|---|---|---|
| 对齐 | 右对齐，气泡+操作列整体 `gap:6px` | `MI.css` L4–9 | 现有 `items-end` 保留 |
| 最大宽 | `min(column*0.702, 82%)` | `MI.css` L21 | `max-w-[82%]`（Spark 列 768，近似 525px） |
| 背景 | bubble | `MI.css` L28 | `bg-user-bubble`（浅色 `#EDF3FE`/深色 `#2C2C2E`） |
| 圆角 | `22px`（**四角全圆，无右下收角**） | `MI.css` L29 | `rounded-[22px]`（**删掉现在的 `rounded-br-[4px]`**） |
| 内边距 | `10px 16px` | `MI.css` L33 | `px-4 py-2.5`（16/10） |
| 字号/行高 | `14px / 22px` | `MI.css` L34–35 | `text-sm leading-[22px]` |
| 文本色 | label-primary | `MI.css` L36 | `text-foreground` |

**助手消息**：DSH 助手无气泡、无标签行，左锚全宽正文（`MI.css` 仅 user 有气泡）。Spark 现在的 `RoleLabel`（`YOU`/模型名 mono 小字）**DSH 没有对应物**。
- 替代方案：保留助手侧模型名标签（Spark 已有的 `AssistantActions` 尾行承载模型/时间），**用户侧删掉 `YOU` 标签行**（DSH 用户气泡不显示 `YOU`）；助手侧模型标签可弱化或并入尾行——推荐「用户侧删 RoleLabel，助手侧保留但降到与尾行同层」。

**工具调用卡（折叠态）**（`TurnProcessNodeView.module.css` L1–48 + `GenericCommandCard.module.css`）：

| 项 | DSH 值 | 来源 | Spark |
|---|---|---|---|
| 折叠行高 | `33px` | `TurnProcessNodeView.module.css` L7 `height:33px` | `h-[33px]`（替换现在 `h-7`=28px） |
| 分隔线 | 底部 `0.5px solid border-l2` | 同 L10 | `border-b border-border`（Spark border 1px，视觉近似） |
| chevron | `16×16`，左距 `6px`，折叠 rotate(-90°)→展开 0° | L21–33 | `size-4 ml-1.5`，`-rotate-90` / 展开 `rotate-0`（替换现在 `size-3.5 rotate-90`） |
| 标题字号 | `14px/24px` secondary | L35–42 | `text-sm leading-6 text-muted-foreground`（替换现在 `text-xs`） |
| 运行中 sweep | 300px 横渐变扫光，`2.6s`，仅 `data-state=running` | `GenericCommandCard.module.css` L11–30 | 见 §3.2 新增 `running-sweep` |

**思考行（ReasoningRow）**：与工具卡同一套 sweep（`ReasoningRow.module.css` L25–44），折叠高 `24px`，摘要 `13px` tertiary。Spark 的 `ReasoningCollapsible` 改为与工具卡一致的 33px 行高 + sweep。

**审批卡**：DSH 无独立审批卡皮肤（用通用命令卡家族）。Spark 现有 `ApprovalCard`（左 3px warn 边）**保留**，仅对齐圆角到 `rounded-[16px]`（参 `MI.css` L352 文件卡圆角 16px）。

**回到底部钮**（`CV.css` L197–218）：

| 项 | DSH 值 | 来源 | Spark |
|---|---|---|---|
| 尺寸 | `34×34`，圆 `100px` | L201–207 | `size-[34px] rounded-full`（替换现在 `size-7`=28px） |
| 背景 | floating-fill | L210 | `bg-card dark:bg-[#2C2C2E]` |
| 描边/阴影 | 0.5px border-l3 + panel 阴影 | L206/L211 | `shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_3px_8px_rgba(0,0,0,0.03),0_0_16px_rgba(0,0,0,0.02)]` |
| 位置 | sticky 右侧悬浮（`justify:flex-end`），`bottom:16px` | L174–194 | 见 §2.7：改右下悬浮，`bottom-4 right-0`（**现在是底部居中**） |

**消息操作钮**（`MessageIconActions.module.css` L5–92）：

| 项 | DSH 值 | 来源 | Spark |
|---|---|---|---|
| 按钮尺寸 | `28×28`，padding 6，圆 28 | L57–65 | `size-7 rounded-full p-1.5`（替换现在 `size-5`=20px） |
| 图标 | `15px` | L73–76 | `size-[15px]`（替换现在 `size-3`=12px） |
| 常态/hover | tertiary；hover `bg-hover`+secondary | L67/L78–80 | `text-muted-foreground hover:bg-accent hover:text-foreground` |
| 渐显 | 行默认 `opacity:0`，hover/focus-within `opacity:1` | L36–55 | 新增 `group-hover:opacity-100 opacity-0 transition-opacity`（见 §3.4） |

### 1.3 对话视图规格

> 来源：`CV.css` L1–22（滚动）、L38–71（列与间距）、L156–169（加载更早）。

| 项 | DSH 值 | 来源 | Spark |
|---|---|---|---|
| 列宽 | `clamp(680px,…,920px)` 居中 | `CR.css` L358–361 | 保持 Spark `max-w-[768px]` 居中（**不改**，Spark 无用户拖宽） |
| 行间距 | 相邻 flow item `16px` | `CV.css` L51 `--dsh-chat-flow-gap:16px` | Virtuoso item 间加 `mb-4`（16px）——见 §2.6 |
| 滚动内边距 | `16px (clearance+16)` 即 `16px 32px` | `CV.css` L15 | Spark 外层已 `px-6 py-3`（24/12），可保留 |
| 回底阈值 | 用户上滚即显（`atBottomStateChange`） | Spark 已有 | Spark 已实现，仅改按钮皮肤/位置 |
| 加载更早 | 居中胶囊：圆角 `14px`、`padding:4px 12px`、`12px` secondary | `CV.css` L156–164 | 若 Spark 有「加载更早消息」入口，用 `rounded-[14px] px-3 py-1 text-xs text-muted-foreground bg-[#F1F3F5] dark:bg-[#353638]` |

> **DSH 有、Spark 没有的元素——替代方案**：
> - **工作区选择器「GeoWork」**（卡片上方左）：Spark 已有顶栏 `cwd` Badge（`SessionPage.tsx` L183），**不在输入卡上方再加**，保持顶栏方案。
> - **模式选择器「标准模式」**（卡片上方中）：Spark 的推理档位 `EffortPicker` 已在工具条，**不新增卡片上方一行**。
> - **卡片两侧蓝色 resize handle**：是 DSH 的列宽拖拽手柄（`CR.css` `.body` 注释）。Spark 列宽固定 768，**不实现**。
> - **TurnNavigator 右侧刻度导轨**：`TurnNavigator.module.css`，窄屏（<900px）自动隐藏。Spark 暂无 turn 导航数据通道，**列入 Phase 3 可选项，本期不做**。

---

## 2. 组件改造清单（逐项）

### 2.1 `SessionPage.tsx` —— 输入栏沉底容器

- **当前**：L325–327 `<div className="shrink-0 border-t border-border px-6 py-3"><div className="mx-auto max-w-[768px]">`。
- **改成**：去掉卡片上的 `border-t border-border`（DSH 输入卡靠自身阴影浮在底色上，**没有顶部分隔线**），改 `px-6 pt-2 pb-3`（顶部留白收小，让卡片贴近滚动区）。即：
  ```jsx
  <div className="shrink-0 px-6 pb-3 pt-2">
    <div className="mx-auto max-w-[768px]"> <Composer …/> </div>
  </div>
  ```
- **参考**：`IB.css` L10（root 无顶分隔、`padding:0 clearance 4px`）。

### 2.2 `Composer.tsx` —— 卡片外壳

- **当前**：L466–472
  ```jsx
  <div className="relative flex flex-col rounded-xl border border-input bg-card p-3 focus-within:border-ring">
  ```
- **改成**（圆角 22、去 border、改软阴影、内部间距改 gap-3 + pt-2）：
  ```jsx
  <div className="relative flex flex-col gap-3 rounded-[22px] bg-card pt-2 dark:bg-[#2C2C2E]
                 shadow-[0_0_0_0.5px_rgba(0,0,0,0.10),0_4px_16px_rgba(0,0,0,0.03),0_0_24px_rgba(0,0,0,0.03)]
                 dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.12),0_4px_16px_rgba(0,0,0,0.03),0_0_24px_rgba(0,0,0,0.03)]">
  ```
  - 删 `border border-input`、`focus-within:border-ring`、`p-3`。聚焦态**不加 ring**（DSH 聚焦仅 caret 变色，参 `IB.css` L187）。
- **参考**：`IB.css` L45–77。

### 2.3 `Composer.tsx` —— textarea

- **当前**：L517–547，`max-h-36 min-h-7 … px-0.5 text-[13px] leading-relaxed placeholder:text-muted-foreground/60`。
- **改成**：
  ```jsx
  className="max-h-[336px] min-h-9 w-full resize-none overflow-y-auto bg-transparent
             pt-1 pr-2 pl-3.5 text-sm leading-6 text-foreground outline-none
             caret-send-accent
             placeholder:text-[#ADB2B8] dark:placeholder:text-[#81858C]
             disabled:cursor-not-allowed disabled:opacity-60"
  ```
  - placeholder 文案改为截图值：`'描述你想要构建的内容，/ 调用指令，@ 文件或对话'`（busy/waiting 的分支文案保留）。
- **自动增高**：现有 `useEffect`（L151–156）把 `MAX_HEIGHT = 144`（L102）改成 `336`。
  ```js
  const MAX_HEIGHT = 336
  ```
- **参考**：`IB.css` L172–225、`CR.css` L331。

### 2.4 `Composer.tsx` —— 底部工具条

- **当前**：L550 `<div className="mt-2 flex h-8 items-center gap-1.5">`；左组 + 钮、文件树钮、权限钮；右组分段、发送钮。
- **改成**：
  ```jsx
  <div className="flex items-center justify-between gap-3 px-2 pb-1.5 pt-0.5">
    <div className="flex min-w-0 items-center gap-3"> …左组… </div>
    <div className="ml-auto flex shrink-0 items-center gap-3"> …右组… </div>
  </div>
  ```
  （组间距 6px→12px；去掉 `mt-2` 改靠卡片 `gap-3`；行高 32px 不变。）
- **+ 钮**（L552–563）：图标 `size-4`→`size-3.5`，底色从无→`bg-secondary hover:bg-[#F1F3F5] dark:hover:bg-[#353638]`。
- **文件树钮**（L564–573）：同 + 钮皮肤。
- **权限钮**（L615–632）：从 `rounded-full px-1.5 text-xs` 改成 DSH 选择器皮肤——`h-7 rounded-lg px-2 pr-5 text-[13px] leading-5 font-medium text-muted-foreground hover:bg-accent`；chevron 保留 `size-3 opacity-60`。
- **语音钮**（L647–688）：保持现有 hover 逻辑，仅把 `size-7` 皮肤对齐（已是 28px，无需改）。
- **ModelPicker**（见 2.5）。
- **分段 Segmented**（L712–734）：保留功能，皮肤对齐到与权限钮同高 `h-7`。
- **发送/停止钮**（L737–758）：
  ```jsx
  // 运行中（停止）
  className="flex size-[34px] shrink-0 items-center justify-center rounded-full
             bg-send-accent text-white enabled:hover:bg-send-accent-hover"
  // 空闲（发送）
  className="flex size-[34px] shrink-0 items-center justify-center rounded-full
             bg-send-accent text-white enabled:hover:bg-send-accent-hover
             disabled:cursor-not-allowed disabled:opacity-40"
  ```
  - 删原来的 `bg-primary text-primary-foreground`；图标 `size-4`（16px 箭头，已是）。
- **参考**：`IB.css` L254–389。

### 2.5 `ModelPicker.tsx` —— 模型选择器

- **当前**：L62 `flex h-7 max-w-56 items-center gap-1 rounded-full px-1.5 font-mono text-xs …`。
- **改成**（对齐 DSH `.select`：`rounded-lg` 而非 `rounded-full`，非 mono、13px）：
  ```jsx
  className="flex h-7 max-w-[220px] shrink-0 items-center gap-1 rounded-lg px-2 pr-5
             text-[13px] leading-5 font-medium text-muted-foreground
             hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
  ```
  - **去掉 `font-mono`**（DSH `.select` 是普通字体，L341–343；截图里 `step-3.7-flash` 也是无衬线）。
  - chevron `size-3 opacity-60` 保留。
  - 下拉浮层（L72）圆角 `rounded-xl` 保留，无需改。
- **参考**：`IB.css` L328–347。

### 2.6 `MessageItem.tsx` —— 用户气泡

- **当前**：L34–55
  ```jsx
  <article className="flex w-full flex-col items-end">
    <RoleLabel>YOU</RoleLabel>
    <div className="mt-1 max-w-[80%] rounded-[18px] rounded-br-[4px] bg-accent px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
  ```
- **改成**：
  ```jsx
  <article className="flex w-full flex-col items-end">
    {/* 删除 <RoleLabel>YOU</RoleLabel> —— DSH 用户气泡无角色标签 */}
    <div className="max-w-[82%] rounded-[22px] bg-user-bubble px-4 py-2.5
                    text-sm leading-[22px] whitespace-pre-wrap text-foreground">
  ```
  - 附件缩略图块（L37–51）的 `max-w-[80%]` 同步改 `max-w-[82%]`。
- **助手侧**：L63–78 保留 `<RoleLabel>{model}</RoleLabel>`（可留，弱化为 `text-[11px]`，或并入尾行——推荐保留现状）。
- **参考**：`MI.css` L4–41。

### 2.7 `BackBottom.tsx` —— 回到底部

- **当前**：L14–22，`absolute bottom-3 left-1/2 -translate-x-1/2 size-7 … border border-border bg-background`（底部居中、带边框）。
- **改成**（DSH：右侧悬浮、34px、浮层底、软阴影、无边框）：
  ```jsx
  <button
    className="absolute bottom-4 right-0 flex size-[34px] items-center justify-center rounded-full
               bg-card text-muted-foreground dark:bg-[#2C2C2E]
               shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_3px_8px_rgba(0,0,0,0.03),0_0_16px_rgba(0,0,0,0.02)]
               hover:bg-[#F1F3F5] dark:hover:bg-[#353638]"
  >
  ```
  - 调用处（`ChatView.tsx` L101–104）位置从居中改右下：父容器已是 `relative`，`right-0 bottom-4` 即贴内容列右缘。
- **参考**：`CV.css` L174–218。

### 2.8 `ToolCard.tsx` —— 工具调用卡

- **当前**：L71 `<div className="my-1 overflow-hidden rounded-xl border border-border">`；头行 L76 `h-7 … px-2`；chevron `size-3.5` 旋转。
- **改成**：
  - 外层：保留 `rounded-xl border border-border`（DSH 折叠态其实无外框、只一条下分隔线，但展开体需要边界——**保留 Spark 现有卡片框，视觉差最小**）。
  - 头行 L76：`h-7`→`h-[33px]`；chevron（L78–83）从 `size-3.5` + `rotate-90` 改成 DSH 方向：
    ```jsx
    <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform',
                                open ? 'rotate-0' : '-rotate-90')} />
    ```
    （折叠时箭头朝右 `-rotate-90`，展开朝右 `rotate-0`；与 DSH `TurnProcessNodeView.module.css` L27/L32 一致。）
  - 类别词 `text-xs`→`text-sm`；资源/状态 mono 保持 `text-xs`（DSH 摘要次要信息可小一档）。
  - 运行中 sweep：见 §3.2。
- **参考**：`TurnProcessNodeView.module.css` L1–48。

### 2.9 `ReasoningCollapsible.tsx` —— 思考行

- **当前**：L53 外层 `rounded-xl border border-border`，头行 `h-7`，chevron `size-3.5 rotate-90`。
- **改成**：头行 `h-[33px]`；chevron 同 2.8 的 DSH 方向（`open?rotate-0:-rotate-90`）；运行中加 §3.2 sweep。
- **参考**：`ReasoningRow.module.css` L1–44。

### 2.10 `AssistantActions.tsx` —— 消息操作钮

- **当前**：L27 `ICON_BTN` = `size-5 rounded-full …`，图标 `size-3`。
- **改成**：
  ```js
  const ICON_BTN =
    'flex size-7 items-center justify-center rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground'
  ```
  图标全部 `size-[15px]`（Copy/Check/Thumbs/ThumbsDown/GitFork 由 `size-3`→`size-[15px]`）。
- **hover 渐显**：见 §3.4（在 `MessageItem` 的 assistant/article 容器加 group）。
- **参考**：`MessageIconActions.module.css` L57–81。

---

## 3. 新增组件 / 新增样式清单

### 3.1 无全新组件（本期）

Spark 的 ComposerMenu / PermissionTierMenu / AttachmentChips / FileTreePopover 已存在，**本期只改皮肤不新建组件**。以下为「新增样式片段 / 小组件」。

### 3.2 工具/思考行运行中 sweep 动画（新增 CSS keyframes）

在 `apps/web/src/styles/theme.css` 追加（移植 `GenericCommandCard.module.css` L11–30）：

```css
@keyframes dsh-row-sweep {
  0% { left: -300px; }
  90%, 100% { left: 100%; }
}
.row-running-sweep { position: relative; overflow: hidden; }
.row-running-sweep::after {
  content: '';
  position: absolute;
  inset-block: 0; left: 0; width: 300px;
  background: linear-gradient(90deg, transparent 0%,
    color-mix(in srgb, var(--background) 60%, transparent) 55%, transparent 100%);
  animation: dsh-row-sweep 2.6s ease-out infinite;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .row-running-sweep::after { animation: none; }
}
```

- 在 `ToolCard` 与 `ReasoningCollapsible` 的头行 button 上：`status==='running'` / `streaming===true` 时给容器加 `row-running-sweep`。
- **注意**：这会与现有 `Loader2 animate-spin`（ToolCard L85）重叠——sweep 是背景扫光、spin 是前景小圈，二者可共存；若嫌喧宾夺主，**running 时去掉 Loader2 小圈、只留 sweep**（推荐，更贴近 DSH）。

### 3.3 附件预览行（已存在 `AttachmentChips.tsx`，仅对齐皮肤）

- DSH 文件卡（`MI.css` L343–387）：`240×64`、圆角 `16px`、0.5px border-l2、文件名 `14/22/500`、meta `12/15`。
- 若 `AttachmentChips` 当前是小 chip，保持即可（Spark 附件模型是路径 chip，不是大文件卡）——**本期不改**，记录为已知差异。

### 3.4 消息操作 hover 渐显（改 `MessageItem.tsx`）

- DSH：旧消息的操作行默认 `opacity:0`，hover/focus-within 才显（`MessageIconActions.module.css` L36–55）。
- 改法：`MessageItem` 的 assistant `<article>`（L65）加 `group`，`AssistantActions` 外层容器（`AssistantActions.tsx` L56）从 `mt-1.5 flex…` 改为：
  ```jsx
  <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-within:opacity-100">
  ```
  - 移动端/无 hover 设备保持常显（加 `@media (hover:none){ *{opacity:1} }` 或直接接受——Spark 是桌面端，省略）。

### 3.5 （可选 Phase 3）ContextMeter 上下文用量胶囊

- 来源 `ContextMeter.module.css`：trigger `padding:1px 8px`、圆角 `24px`、`13/20` tertiary、gap 6、右侧圆形进度（2px stroke）。
- Spark 已有 `UsageBar.tsx`（SessionPage 注释 L327 说已停用）。若恢复，样式：
  ```jsx
  <button className="inline-flex items-center gap-1.5 rounded-2xl px-2 py-0.5 text-[13px] leading-5
                     text-muted-foreground tabular-nums hover:bg-accent hover:text-foreground">
  ```
  放在 Composer 卡片**下方居中**的 `dock` 行（参 `IB.tsx` L484–489，DSH 的 ContextMeter 在卡外下方）。**本期列为可选，不强制。**

---

## 4. 交互逻辑

### 4.1 发送 / 停止切换（状态机）

Spark 已有完整逻辑（`Composer.tsx` L293–312 对应 DSH `InputBar.tsx` L293–312，二者几乎同源）。**不改逻辑，只改按钮皮肤**：
- `busy && empty` → 显示**停止钮**（白方块 `Square` 图标，`bg-send-accent`）。
- `busy && 有输入` → 仍显示**发送钮**（按分段档 steer/queue 发送）。
- `!busy` → 发送钮，`disabled = !hasText || waiting`。
- 按钮禁用 opacity 一律 `0.4`（DSH `IB.css` L388），不是 0.5。

### 4.2 输入框自动增长 + 上限滚动

- 单行 36px → 随内容增高，上限 `336px`（14 行），超出内部 `overflow-y-auto`。
- 现有 `useEffect`（L151–156）已实现，只需把 `MAX_HEIGHT` 144→336、textarea 加 `overflow-y-auto`。

### 4.3 附件上传预览流程

Spark 现有（`uploadImages` L401–421 + `AttachmentChips`）保留。DSH 差异仅在卡片视觉（大文件卡 vs Spark chip），**交互不变**。

### 4.4 命令菜单触发（+ 钮 / `/`）

- `+` 钮点击 → 现有四宫格菜单（图片/@///$）保留，菜单浮层皮肤不变。
- 输入 `/` → 现有 `ComposerMenu`（slash 补全）保留。
- 二者定位锚点不变。

### 4.5 模型选择器交互

`ModelPicker` 现有「供应商分组 + 勾选 + 上下文 badge」保留，仅改触发钮皮肤（§2.5）。

### 4.6 权限选择器交互

`PermissionTierMenu` 现有四档 + warn 图标 + 勾选保留，仅改触发钮皮肤（§2.4）。

### 4.7 滚动跟随 + 回到底部阈值

Spark 已用 Virtuoso `followOutput='smooth'` + `atBottomStateChange`（`ChatView.tsx` L97–98）。**逻辑不变**，仅 BackBottom 皮肤/位置改（§2.7）。阈值沿用现有（离开底部即显）。

---

## 5. 实现顺序（按依赖）

- **Phase 1｜token 与卡片壳**（地基，先做）
  1. `tokens.css` 加 `--send-accent` / `--send-accent-hover` / `--user-bubble`（§1.0）。
  2. `theme.css` 加 sweep keyframes（§3.2）。
  3. `Composer.tsx` 卡片壳 + textarea + MAX_HEIGHT（§2.2、§2.3）。
  4. `SessionPage.tsx` 去掉卡片顶部分隔线（§2.1）。
  - 验收：空会话打开，输入卡是 22px 白卡、无 border、有柔和投影；placeholder 是截图文案；单行 36px。

- **Phase 2｜工具条与选择器**
  5. `Composer.tsx` 工具条布局 + 发送钮 + 权限钮（§2.4）。
  6. `ModelPicker.tsx` 触发钮皮肤（§2.5）。
  - 验收：+ 钮/文件树钮有浅灰底；模型/权限钮是 8px 圆角非全圆；发送钮是 34px 蓝圆、白箭头；运行中变停止方块。

- **Phase 3｜消息流**
  7. `MessageItem.tsx` 用户气泡 22px 全圆角 + 去 YOU 标签（§2.6）。
  8. `ToolCard.tsx` / `ReasoningCollapsible.tsx` 行高 33 + chevron 方向 + sweep（§2.8、§2.9、§3.2）。
  9. `AssistantActions.tsx` 按钮 28px + 图标 15px + hover 渐显（§2.10、§3.4）。
  10. `BackBottom.tsx` 右下 34px 悬浮（§2.7）。
  - 验收：用户气泡 22px 圆角浅蓝底；工具卡运行中横扫光；回底钮在右下、无边框。

- **Phase 4｜收尾可选**
  11. （可选）`ContextMeter` 胶囊恢复（§3.5）。
  12. 深色模式全量截图走查。

---

## 6. 验收标准（可截图验证）

1. **输入卡**：浅色下白底、四角 22px 圆角、**没有可见 border**、只有一层很淡的灰投影；深色下深灰 `#2C2C2E` 卡 + 一圈淡白 0.5px 边。聚焦输入时**不出现 ring**。
2. **placeholder**：空输入时显示 `描述你想要构建的内容，/ 调用指令，@ 文件或对话`，颜色浅灰（`#ADB2B8`）。
3. **发送钮**：34px 正圆、信息蓝底、白上箭头；空输入时禁用（40% 透明）；运行中变成白方块停止钮。
4. **+ 钮 / 文件树钮**：28px 正圆、浅灰底（浅色 `#F4F4F5`）、hover 变 `#F1F3F5`。
5. **模型/权限钮**：8px 圆角（**不是全圆胶囊**）、13px 非 mono 字、右侧小 chevron。
6. **用户气泡**：右对齐、最大宽 82%、四角全 22px 圆角（**右下不再收 4px**）、浅蓝底 `#EDF3FE`、**上方无 YOU 标签**。
7. **工具/思考卡运行中**：一行标题下有一道从左到右的淡扫光（2.6s 循环）；折叠 chevron 朝右，展开朝下。
8. **回到底部钮**：34px 圆、贴**右下**（不是居中）、白底无边框带柔影。
9. **助手操作钮**：28px 圆、15px 图标；默认半透，hover 该条消息时才清晰显示。
10. **深色模式**：以上全部自动翻深色值（卡 `#2C2C2E`、发送钮 `#679EFE`、气泡 `#2C2C2E`、placeholder `#81858C`）。

---

### 附：本次未移植的 DSH 元素（明确排除）

| DSH 元素 | 排除原因 |
|---|---|
| 卡片上方「GeoWork」工作区选择器 | Spark 工作区已在顶栏 cwd Badge 承载（`SessionPage.tsx` L183） |
| 卡片上方「标准模式」模式选择器 | Spark 推理档位 `EffortPicker` 已在工具条 |
| 卡片左右蓝色 resize handle | Spark 列宽固定 768，无拖拽 |
| `TurnNavigator` 右侧 turn 刻度导轨 | Spark 无 turn 导航数据通道，列宽 <900px 本就自动隐藏；Phase 3 可选 |
| `StatsPills` / `TurnUsagePanel` / `TurnTailNodeView` | Spark 用量聚合走 TraceDialog，不重复 |
