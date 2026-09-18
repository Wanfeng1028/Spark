# Spark 组件位置/重叠/遮挡专项 UI 测试报告

**测试日期**：2026-09-18
**测试环境**：Chrome 1000×1000 视口（CDP 固定），Web 端 Mock 模式 `VITE_SPARK_MOCK=1`
**测试范围**：Web 端（localhost:5173）+ 官网（localhost:3000）
**截图目录**：`_audit/screenshots/overlap/`

---

## 一、测试场景清单

### Web 端

| # | 场景 | 操作 | 截图 | 结果 |
|---|------|------|------|------|
| 1 | 欢迎页 | 加载 /welcome，观察建议卡片、输入框、侧边栏位置 | `01-welcome-page.png` | ✅ 无重叠 |
| 2 | 会话页-审批卡 | 新建会话发消息，审批卡弹出时截图 | `02-conversation-approval-card.png` | ✅ 审批卡内联显示，不遮挡输入框 |
| 3 | 会话页-Hover 操作按钮 | hover 消息项，观察操作按钮位置 | `03-conversation-hover-actions.png` | ✅ 按钮在消息下方独立行，不遮挡文字 |
| 4 | @ 补全面板 | 输入 @ 触发补全 | `04-at-autocomplete-panel.png` | ⚠️ 面板轻微遮挡上条消息操作区（预期浮层行为） |
| 5 | / 命令面板 | 输入 / 触发命令面板 | `05-slash-command-panel.png` | ✅ 浮层正常，有滚动条，不遮挡输入框 |
| 6 | + 附件菜单 | 点击输入框 + 按钮 | `06-plus-attachment-menu.png` | ✅ 菜单定位正确，不遮挡输入框 |
| 7 | Ctrl+K 命令面板 | Ctrl+K 打开全局命令面板 | `07-ctrlk-command-palette.png` | ⚠️ 水平居中正确，但底层 + 菜单未关闭 |
| 8 | 长消息换行 | 发送长文本观察溢出 | `08-conversation-bottom-no-overflow.png` | ✅ 文字正常换行，无容器溢出 |
| 9 | 设置页-常规 | 导航到 /settings → 点击"常规" | `09-settings-general.png` | ⚠️ 裸路径空白（已知 P1），点击导航后正常 |
| 10 | 设置页-下拉菜单 | 点击"交互行为"下拉 | `10-settings-dropdown.png` | ⚠️ bash 沙箱下拉文字截断 |
| 11 | 搜索页 | 导航到 /search，输入关键词 | `11-search-page.png` | ✅ 搜索框与筛选器无重叠 |
| 12 | 自动化页 | 导航到 /automation | `12-automation-page.png` | ✅ 三列卡片网格正常，无重叠 |
| 13 | 响应式窄屏 | CSS 模拟 375px 宽 | `13-responsive-narrow-input-overflow.png` | ❌ 输入框按钮溢出容器 |

### 官网

| # | 场景 | 操作 | 截图 | 结果 |
|---|------|------|------|------|
| 14 | 首页 | 加载 localhost:3000 | `14-official-home.png` | ✅ 导航、Hero、代码块无重叠 |
| 15 | 深色模式 | 切换深色模式 | `15-official-dark-mode.png` | ✅ 深色模式各组件位置正常 |

---

## 二、发现的问题列表

### P1 — 高优先级

#### WO-079：窄屏下输入框工具栏按钮溢出/截断

- **场景**：会话页输入框，窄屏（~375px）
- **操作**：CSS 强制根容器宽度 375px，观察输入框
- **现象**：输入框内"逐项确认"下拉、"立即/插话/排队"切换组、发送按钮在窄屏下溢出输入容器右边界；"插话"文字被截断不可见；textarea 占位符文字与下方按钮行重叠
- **截图**：`13-responsive-narrow-input-overflow.png`
- **影响**：移动端/窄屏用户无法完整操作输入工具栏
- **修复建议**：窄屏断点（<480px）下将"逐项确认"和模型选择器折叠为图标按钮，"立即/插话/排队"切换组换行或折叠

#### WO-080：+ 附件菜单按 Escape 不关闭

- **场景**：会话页输入框 + 附件菜单弹出后
- **操作**：按 Escape 键
- **现象**：+ 附件菜单仍然保持打开状态，不响应 Escape
- **截图**：`06-plus-attachment-menu.png`（菜单打开后按 Escape 仍可见）
- **影响**：用户无法用 Escape 关闭浮层菜单，体验不一致
- **修复建议**：为 + 附件菜单添加 Escape 键关闭事件监听，或使用通用 Popover 组件的 dismiss on Escape

### P2 — 中优先级

#### WO-081：Ctrl+K 命令面板打开时 + 附件菜单未自动关闭

- **场景**：+ 附件菜单已打开时按 Ctrl+K
- **操作**：先点 + 按钮打开菜单，再按 Ctrl+K
- **现象**：Ctrl+K 命令面板弹出后，底层 + 附件菜单仍然渲染在遮罩层下方（可见但被半透明遮罩覆盖）
- **截图**：`07-ctrlk-command-palette.png`（底部可见 + 菜单残留）
- **影响**：两个浮层同时存在，关闭 Ctrl+K 后 + 菜单仍然打开，状态不一致
- **修复建议**：打开全局命令面板时自动关闭所有其他浮层（+菜单、@补全、/命令面板）

#### WO-082：设置页 bash 沙箱下拉选项文字截断

- **场景**：设置 → 常规 → bash 沙箱下拉
- **操作**：查看 bash 沙箱下拉按钮显示
- **现象**：按钮文字显示为"开启（平台 wrapper 隔..."，右侧被截断，完整文本应为"开启（平台 wrapper 隔离）"
- **截图**：`09-settings-general.png`
- **影响**：用户无法完整阅读当前选项
- **修复建议**：增加下拉按钮最小宽度，或允许文字换行/省略号截断时加 tooltip

### 已知问题（本次复现确认，不新建工单）

| 编号 | 问题 | 状态 |
|------|------|------|
| 已知 P0 | Web 端无移动端响应式断点 | 已有工单 |
| 已知 P1 | /settings 裸路径空白，需点击导航项才加载内容 | 已有工单 |
| 已知 P1 | 官网标题重复 | 已有工单 |

---

## 三、截图索引

| 文件名 | 说明 |
|--------|------|
| `01-welcome-page.png` | 欢迎页全景：侧边栏 + 建议卡片 + 输入框，无重叠 |
| `02-conversation-approval-card.png` | 会话页审批卡：内联显示，输入框置灰"等待审批中" |
| `03-conversation-hover-actions.png` | hover 消息项：操作按钮在独立行，不遮挡文字 |
| `04-at-autocomplete-panel.png` | @ 补全面板：输入框上方浮层 |
| `05-slash-command-panel.png` | / 命令面板：命令列表浮层，带滚动条 |
| `06-plus-attachment-menu.png` | + 附件菜单：4 选项浮层 |
| `07-ctrlk-command-palette.png` | Ctrl+K 面板：水平居中，带暗色遮罩 |
| `08-conversation-bottom-no-overflow.png` | 会话底部：消息换行正常，无溢出 |
| `09-settings-general.png` | 设置页常规：左侧导航 + 右侧内容对齐正常 |
| `10-settings-dropdown.png` | 设置下拉：交互行为选项弹出正常 |
| `11-search-page.png` | 搜索页：搜索框全宽，无重叠 |
| `12-automation-page.png` | 自动化页：三列卡片网格正常 |
| `13-responsive-narrow-input-overflow.png` | **窄屏输入框溢出**：按钮截断/重叠 |
| `14-official-home.png` | 官网首页：导航 + Hero + 代码块 |
| `15-official-dark-mode.png` | 官网深色模式：各组件位置正常 |

---

## 四、修复建议优先级

1. **WO-079（P1）窄屏输入框溢出**：影响移动端可用性，建议优先处理。参考已有 WO-076（窄屏胶囊折叠），在同一断点逻辑中处理输入框工具栏折叠。
2. **WO-080（P1）Escape 不关闭 + 菜单**：交互一致性问题，修复成本低（添加 keydown 监听）。
3. **WO-081（P2）多浮层共存**：建议在打开新浮层时统一关闭旧浮层，避免状态混乱。
4. **WO-082（P2）下拉文字截断**：调整最小宽度或加 tooltip。
