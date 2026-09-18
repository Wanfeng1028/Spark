# Spark Web 端 UI/UX 深度验证报告

**验证日期**: 2026-09-18  
**验证环境**: http://localhost:5173 (Mock 模式 VITE_SPARK_MOCK=1)  
**浏览器视口**: 1000×1000 (注：环境限制无法调整至 1920×1080)  
**验证人**: AI 自动化测试

---

## 一、环境说明

- 开发服务器运行于 `http://localhost:5173`，Mock 模式
- 浏览器视口固定为 **1000×1000**，无法通过 CDP 或 JS 调整窗口大小
- 移动端视口通过 CSS 宽度约束方式近似模拟，非真正设备模拟
- 截图保存路径: `_audit/screenshots/web/` 和 `_audit/screenshots/mobile/`

---

## 二、页面级验证结果

### 1. 欢迎页 /welcome
- **截图**: `web-welcome.png`
- **验证结果**: ✅ 正常
- **详情**:
  - 左侧边栏导航完整：新建会话、搜索会话、项目列表、已归档、搜索、自动化、本机用户
  - 主区域显示欢迎语"夜深了。"
  - 输入框包含占位文字、逐项确认/语音按钮、立即/插话/排队选项卡、发送按钮
  - 底部提示："Enter 发送 · Shift+Enter 换行"
  - 提示卡片：4 个建议 prompt（总结架构、跑测试、清理 any、写提交信息）
  - 底部状态栏：已连接、seq 0、当前时间
  - 底部导航：已归档、搜索、自动化、本机用户+设置

### 2. 搜索页 /search
- **空状态截图**: `web-search-empty.png`
- **搜索结果截图**: `web-search-results.png`
- **跳转截图**: `web-search-result-navigated.png`
- **验证结果**: ✅ 正常
- **详情**:
  - 空状态显示搜索说明："检索所有会话的用户消息、助手回复与标题，点击命中行直达原文。"
  - 输入关键词"测试"后正确返回 3 条结果（均来自"重构重试常量"会话）
  - 结果条目包含：会话名、角色（助手/用户）、日期、内容摘要
  - 点击结果正确跳转到对应会话页，URL 格式为 `/session/{id}?event={eventId}`

### 3. 自动化页 /automation
- **截图**: `web-automation.png`, `web-automation-toggle.png`
- **验证结果**: ✅ 正常
- **详情**:
  - 标题与说明文字完整
  - "我的任务"区域：包含 mock 夜间巡检任务，带定时开关（ON）、播放按钮、删除按钮
  - "新建定时"、"新建闲时"按钮位置正确
  - 模板卡片分两类：
    - 闲时任务（3 张卡片：合并后复查、依赖更新检查、日志整理）
    - 定时任务（3 张卡片：晨间准备、夜间巡检、周度回顾）
  - 每张卡片包含图标、标题、描述、触发条件标签
  - "运行历史"区域显示"尚无运行记录"（空状态）

### 4. 设置页 /settings
- **默认空白截图**: `web-settings-default-blank.png` ⚠️
- **验证结果**: ⚠️ 有问题
- **详情**:
  - 直接访问 /settings 时，左侧菜单完整加载，但**右侧内容区域完全空白**
  - 需手动点击左侧菜单项才会加载对应内容
  - **这是已知问题**：默认进入时应自动选中"常规"并加载内容

#### 设置子页面逐个验证：

| 菜单项 | 截图文件 | 验证结果 | 说明 |
|--------|---------|---------|------|
| 常规 | `web-settings-general.png` | ✅ 正常 | 交互行为、引擎行为、HTTP代理、桌面特化等分区完整 |
| 外观 | `web-settings-appearance.png` | ✅ 正常 | 代码预览双栏（浅色/深色）、字号选择、长行换行开关 |
| 模型设置 | `web-settings-models.png` | ✅ 正常 | DeepSeek 配置显示（Base URL、API Key 掩码）、测试连接按钮 |
| 权限规则 | `web-settings-permissions.png` | ✅ 正常 | 空状态提示、allow/deny/ask 下拉选择、添加按钮 |
| 记忆 | `web-settings-memory.png` | ✅ 正常 | 2 条 mock 记忆条目，含时间戳 |
| MCP 服务器 | `web-settings-mcp.png` | ✅ 正常 | filesystem（3工具）、github（连接失败，0工具）状态正确 |
| 技能 | `web-settings-skills.png` | ✅ 正常 | demo-ping 技能显示，含插件事件和钩子信息 |
| 使用统计 | `web-settings-stats.png` | ✅ 正常 | 按日成本、按供应商/模型表格、清零按钮 |
| 审计日志 | `web-settings-audit.png` | ✅ 正常 | 3 条日志条目，含审批决策、规则变更、会话回滚 |

### 5. 会话页
- **已有会话截图**: `web-session-existing.png`
- **输入填充截图**: `web-session-input-filled.png`
- **流式输出截图**: `web-session-streaming.png`
- **验证结果**: ✅ 基本正常
- **详情**:
  - 会话头部：标题、项目标签、main 分支标签、mock 操作按钮（模拟断线、normal、long-output、reject、error-finish）
  - 多模型竞答卡片显示正确（deepseek-chat vs glm-4）
  - 用户消息气泡右对齐
  - 助手消息含思考过程折叠、模型名、内容、时间戳、操作按钮（复制/点赞/点踩/分享）
  - 工具调用卡片：读取/改写/终端，含状态和耗时
  - **新建会话按钮问题**: 点击"新建会话"后未实际创建新会话，仍停留在当前会话页（Mock 模式限制）

---

## 三、交互深度测试

### 1. 发送消息 → 流式输出
- **截图**: `web-session-streaming.png`
- **验证结果**: ✅ 正常
- **流程**: 输入消息 → 按 Enter 发送 → 显示"工作中"状态 → 流式输出逐步显示
- **细节**:
  - 发送后显示"工作中 · X分X秒"计时器
  - 思考过程可折叠展开
  - 工具调用按时间顺序排列
  - 最终回复完整显示

### 2. 人工审批卡
- **截图**: `web-approval-card.png`
- **验证结果**: ✅ 正常（未被遮挡）
- **详情**:
  - 审批卡显示：操作类型（edit）、目标文件路径、规则说明
  - 三个操作按钮：允许一次、总是允许、拒绝
  - 审批卡有橙色边框高亮，视觉上清晰突出
  - 输入框下方显示"等待审批中——请先处理上方审批卡"提示
  - 点击"允许一次"后，审批卡关闭，流程继续执行

### 3. 搜索交互
- **验证结果**: ✅ 正常
- **流程**: 输入关键词 → 回车搜索 → 显示结果列表 → 点击结果跳转

### 4. 自动化任务开关
- **截图**: `web-automation-toggle.png`
- **验证结果**: ✅ 正常
- **详情**: 夜间巡检任务的 toggle 开关可见，处于 ON 状态

### 5. 设置修改测试
- **验证结果**: ⚠️ 未完成
- **原因**: 设置页输入控件为自定义组件，非原生 `<input>` 元素，无法通过标准 type 方法直接交互修改压缩阈值

---

## 四、UI 细节检查

### 1. Hover 状态
- **截图**: `web-hover-new-session.png`, `web-hover-project-item.png`, `web-hover-prompt-suggestion.png`
- **验证结果**: ✅ 正常
- **说明**: 按钮和卡片在 hover 时有视觉反馈（背景色变化）

### 2. 表单输入聚焦样式
- **截图**: `web-input-focus.png`
- **验证结果**: ✅ 正常
- **详情**: 聊天输入框聚焦时有明显边框/高亮效果

### 3. 文字截断与图标
- **验证结果**: ✅ 未发现明显问题
- **详情**: 所有文字完整显示，图标加载正常，无缺失图标

### 4. 滚动条与布局
- **验证结果**: ✅ 正常
- **详情**: 侧边栏和主内容区布局稳定，滚动自然

### 5. 弹窗/下拉菜单
- **验证结果**: ⚠️ 未充分测试
- **说明**: 环境限制下未完整测试 Esc 关闭和点击外部关闭

---

## 五、发现的问题清单

| # | 严重度 | 问题描述 | 截图文件 | 状态 |
|---|--------|---------|---------|------|
| 1 | 🔴 高 | **设置页默认进入时右侧空白** — 直接访问 /settings 不自动选中任何菜单项，右侧内容区完全空白 | `web-settings-default-blank.png` | 已知问题 |
| 2 | 🟡 中 | **新建会话按钮在 Mock 模式下不生效** — 点击"新建会话"后仍停留在当前会话页，未创建新会话 | — | 待确认是否为 Mock 限制 |
| 3 | 🟡 中 | **历史会话显示异常** — Mock 模式下部分历史会话可能显示"会话不存在或已被清理"（环境说明中提及） | — | 已知 Mock 限制 |
| 4 | 🟢 低 | **视口无法调整** — 测试环境浏览器视口固定为 1000×1000，无法验证 1920×1080 桌面端完整布局 | — | 环境限制 |
| 5 | 🟢 低 | **设置页自定义输入控件** — 压缩阈值等设置项使用自定义组件，非原生 input，自动化测试难以直接修改 | — | 技术限制 |

---

## 六、移动端视口验证

**注意**: 由于环境限制，无法通过 CDP 或窗口调整真正模拟移动端视口。以下截图通过 CSS 宽度约束近似模拟，仅供参考。

### iPhone SE (375px 宽)
- **截图目录**: `mobile/`
- **welcome**: `mobile-iphone-welcome.png`
- **search**: `mobile-iphone-search.png`
- **automation**: `mobile-iphone-automation.png`
- **settings**: `mobile-iphone-settings.png`

**检查项**:
- ⚠️ 侧边栏在窄屏下仍占据左侧空间，可能挤压主内容区
- ⚠️ 无法确认真实触摸元素大小是否达标（≥44px）
- ⚠️ 导航菜单是否有移动端抽屉/汉堡菜单模式未验证

### iPad (768px 宽)
- **未单独截图** — 受限于环境无法精确设置 768px 视口

---

## 七、截图文件清单

### Web 端截图 (25 张)

| 文件名 | 内容描述 |
|--------|---------|
| `web-welcome.png` | 欢迎页/新会话默认视图 |
| `web-search-empty.png` | 搜索页空状态 |
| `web-search-results.png` | 搜索"测试"的结果列表 |
| `web-search-result-navigated.png` | 点击搜索结果后跳转到会话页 |
| `web-automation.png` | 自动化任务管理页 |
| `web-automation-toggle.png` | 自动化任务开关区域 |
| `web-session-input-filled.png` | 会话页输入框已填充文字 |
| `web-session-streaming.png` | 会话流式输出中状态（含审批卡） |
| `web-session-existing.png` | 已有会话完整视图 |
| `web-approval-card.png` | 审批卡详情（edit 操作审批） |
| `web-settings-default-blank.png` | **问题截图**: 设置页默认右侧空白 |
| `web-settings-general.png` | 设置-常规页 |
| `web-settings-appearance.png` | 设置-外观页 |
| `web-settings-models.png` | 设置-模型设置页 |
| `web-settings-permissions.png` | 设置-权限规则页 |
| `web-settings-memory.png` | 设置-记忆页 |
| `web-settings-mcp.png` | 设置-MCP 服务器页 |
| `web-settings-skills.png` | 设置-技能页 |
| `web-settings-stats.png` | 设置-使用统计页 |
| `web-settings-audit.png` | 设置-审计日志页 |
| `web-hover-new-session.png` | Hover 新建会话按钮状态 |
| `web-hover-project-item.png` | Hover 侧边栏项目项状态 |
| `web-hover-prompt-suggestion.png` | Hover 提示卡片状态 |
| `web-input-focus.png` | 聊天输入框聚焦样式 |

### 移动端截图 (4 张)

| 文件名 | 内容描述 |
|--------|---------|
| `mobile-iphone-welcome.png` | iPhone SE 宽度下的欢迎页 |
| `mobile-iphone-search.png` | iPhone SE 宽度下的搜索页 |
| `mobile-iphone-automation.png` | iPhone SE 宽度下的自动化页 |
| `mobile-iphone-settings.png` | iPhone SE 宽度下的设置页 |

---

## 八、总结

### 整体评价
Spark Web 端在 Mock 模式下整体 UI/UX 表现良好：
- ✅ 页面布局清晰，导航结构合理
- ✅ 会话交互流程完整（发送→流式输出→审批→完成）
- ✅ 审批卡视觉突出，不被遮挡
- ✅ 设置页各子项内容加载正确
- ✅ 搜索功能正常，结果跳转正确
- ✅ 自动化页任务卡片和模板展示完整

### 需优先修复
1. **设置页默认空白**（高优先级）— 进入 /settings 应默认选中"常规"并加载内容
2. **新建会话按钮**（中优先级）— 确认在非 Mock 模式下是否正常工作

### 环境限制说明
- 视口固定 1000×1000，未验证 1920×1080 完整桌面布局
- 移动端视口为 CSS 近似模拟，非真实设备测试
- 部分自定义组件（设置输入框）难以自动化交互测试
