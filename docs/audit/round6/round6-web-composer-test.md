# Spark Web 端输入框/消息发送流程测试报告（Round 6）

- **测试时间**：2026-09-27 20:00-20:30（UTC+8）
- **测试环境**：Linux Cloud VM / Node 22 + pnpm 9 / Chrome 浏览器（viewport 1280x960 / 1000x1000）
- **测试基线**：main 分支最新提交 `7f12e93`（docs(audit): LA-57/58 收口登记）
- **测试方式**：模拟真实用户操作（点击输入框 → 输入文字 → 回车发送 → 点击各工具栏按钮 → hover 测试），全程截图取证
- **测试目标**：验证用户反馈的输入框/发送流程问题，并继续发现其他 bug

---

## 一、测试覆盖清单

| # | 测试项 | 结果 | 截图证据 |
|---|--------|------|----------|
| 1 | 欢迎页（未发消息）输入框工具栏布局 | ❌ **有问题** | `round6-screenshots/bu-shot-5p2g9oo7.png` |
| 2 | 会话页输入框工具栏布局 | ❌ **有问题** | `round6-screenshots/bu-shot-a9xly937.png` |
| 3 | 输入文字 → 回车发送（空闲状态） | ✅ 正常 | `round6-screenshots/bu-shot-rv1lve0t.png` |
| 4 | 输入多行文本 → 回车发送 | ✅ 正常（三行完整发送） | `round6-screenshots/bu-shot-emhk6vgo.png` |
| 5 | 发送后输入框清空 + 高度复位 | ✅ 正常 | `round6-screenshots/bu-shot-rv1lve0t.png` |
| 6 | busy 状态（AI 回复中）输入 → 回车 | ✅ 正常（排队/插话发送） | `round6-screenshots/bu-shot-fr0csk4z.png` |
| 7 | 权限模式选择器（逐项确认）下拉 | ✅ 正常（4 选项） | `round6-screenshots/bu-shot-sa670fmb.png` |
| 8 | 模型选择器（step-plan）下拉 | ✅ 正常（模型+128K+提示） | `round6-screenshots/bu-shot-rt3cqxz0.png` |
| 9 | 思考强度（自动）下拉 | ✅ 正常（低/中/高） | `round6-screenshots/bu-shot-g30esy3e.png` |
| 10 | 语音按钮点击 | ✅ 正常（提示无麦克风） | `round6-screenshots/bu-shot-mwbyvupm.png` |
| 11 | ＋添加内容菜单 | ✅ 正常（4 选项） | `round6-screenshots/bu-shot-8ihjvl_y.png` |
| 12 | 发送按钮 hover | ⚠️ 无异常（图标高亮需人工确认） | `round6-screenshots/bu-shot-beaf69jc.png` |
| 13 | 语音按钮 hover | ⚠️ 无异常 | `round6-screenshots/bu-shot-z9zl408k.png` |
| 14 | 模型选择 hover | ⚠️ 无异常 | `round6-screenshots/bu-shot-kcw9354s.png` |
| 15 | 思考强度 hover | ⚠️ 无异常 | `round6-screenshots/bu-shot-kstnma3_.png` |
| 16 | 发送后发送按钮变停止按钮 | ✅ 正常（busy 状态） | `round6-screenshots/bu-shot-rv1lve0t.png` |
| 17 | 发送后 placeholder 切换 | ✅ 正常（排队提示） | `round6-screenshots/bu-shot-rv1lve0t.png` |

---

## 二、发现的问题

### P0 — 布局/功能缺陷（用户反馈 + 复现确认）

#### W6-01：欢迎页（未发消息）输入框缺少「模型选择」和「思考强度」按钮
- **现象**：欢迎页（`/welcome`）输入框工具栏只有 `＋ 添加内容 | 逐项确认 | 🎤 语音 | 发送` 四个控件，**没有模型选择（step-plan/step-3.7-flash）和思考强度（自动）按钮**。只有发送一条消息进入会话页后，这两个按钮才出现。
- **用户原话**："在没有发消息之前输入框发送按钮的左侧无法显示模型选择和思考强度（是否开启思考）"
- **复现步骤**：
  1. 打开 `http://localhost:5173/`（未发消息状态）
  2. 观察输入框底部工具栏 → 无模型选择、无思考强度
- **证据**：`round6-screenshots/bu-shot-5p2g9oo7.png`（欢迎页工具栏）
- **期望**：模型选择（step-plan/step-3.7-flash）和思考强度（自动）应在未发消息时也显示在输入框工具栏，与发送后一致
- **源码线索**：`apps/web/src/features/chat/Composer.tsx` — 欢迎页（welcome route）与会话页（session route）可能渲染不同的 Composer 配置或按钮按状态条件渲染

#### W6-02：语音按钮（麦克风）位置错误——在工具栏中间，不在发送按钮左侧
- **现象**：会话页输入框工具栏布局为 `＋ | 逐项确认 | [🎤麦克风] | step-plan/step-3.7-flash | 自动 | 发送`，麦克风图标在工具栏**中间**（x≈430-640），而不是用户期望的「输入框右侧、发送按钮左侧」。
- **用户原话**："语音按钮应该在输入框右侧发送按钮的左侧"
- **复现步骤**：
  1. 打开任意会话页
  2. 观察输入框底部工具栏 → 麦克风在中间位置，远离发送按钮
- **证据**：`round6-screenshots/bu-shot-a9xly937.png`（工具栏放大：+ / 逐项确认 / [麦克风] / step-plan / 自动 / 发送）
- **期望**：语音按钮应在发送按钮左侧（x≈880-940 区域），即从右到左：`发送 | 🎤语音 | 思考强度 | 模型选择`
- **源码线索**：`Composer.tsx` L676-678 工具条布局：左组 `flex items-center gap-3`（含＋/权限/语音），右组（模型/推理/发送）。语音在左组，用户期望它移到右组发送按钮旁。

### P1 — 疑似 bug（需真机/输入法环境验证）

#### W6-03：回车发送逻辑未处理 IME 组合态（isComposing）——中文输入法下可能误发送/换行
- **现象**：黑盒测试（无输入法）回车发送正常；但源码 `Composer.tsx` `onKeyDown`（L406-424）**没有检查 `e.nativeEvent.isComposing`**。中文输入法（搜狗/微软拼音等）下按 Enter 确认候选词时，`keydown` 事件（`isComposing=true`）会直接命中 `if (e.key !== 'Enter' || e.shiftKey) return` 之后的发送逻辑，导致**用户确认拼音候选词时消息被误发送**，且 IME 组合态可能残留换行。
- **用户原话**："我按下回车发送消息之后，输入框会自动换行"
- **可能根因**：IME 组合态 Enter 未被拦截（缺少 `if (e.nativeEvent.isComposing) return`）
- **修复建议**：在 `Composer.tsx` L412 后、L413 前增加 `if (e.nativeEvent.isComposing) return`（组合态不发送、不换行）
- **验证状态**：⚠️ 沙箱无中文输入法，需用户在真实环境验证

---

## 三、与用户报告对照

| 用户报告的问题 | 验证结果 | 状态 |
|---------------|----------|------|
| 回车发送后输入框自动换行 | 黑盒未复现（Enter 发送正常）；源码发现 isComposing 未处理，疑似 IME 相关 | ⚠️ 待真机验证 |
| 未发消息前发送按钮左侧无模型选择/思考强度 | ✅ 复现：欢迎页确实没有这两个按钮 | ❌ 确认 bug |
| 语音按钮应在输入框右侧发送按钮左侧 | ✅ 复现：麦克风在工具栏中间 | ❌ 确认 bug |

---

## 四、功能正常项（回归确认）

1. **Enter 发送**：空闲状态 + busy 状态均正常发送 ✓
2. **Shift+Enter 换行**：源码确认走 textarea 默认行为（换行不发送）✓
3. **多行输入**：textarea 自动增高（min-h-9 → max-h-[336px]），三行文本显示正常 ✓
4. **发送后清理**：输入框清空、高度复位、placeholder 切换正常 ✓
5. **权限模式选择器**：逐项确认/自动编辑/计划模式/完全访问 4 档，下拉正常 ✓
6. **模型选择器**：step-plan/step-3.7-flash + 128K 上下文 + 切换提示 ✓
7. **思考强度**：低/中/高三档，下拉正常 ✓
8. **语音按钮**：无麦克风时提示「未检测到麦克风设备」，错误处理正常 ✓
9. **＋菜单**：添加图片附件 / @ 添加上下文 / / 选择命令 / 浏览文件树 ✓
10. **hover**：工具栏按钮 hover 无错位、无闪烁（图标高亮需人工确认）✓

---

## 五、结论

**核心问题 2 个（P0）**：欢迎页缺少模型选择/思考强度按钮（W6-01）、语音按钮位置错误（W6-02）。均与用户报告一致，属于明确的 UI 布局缺陷。

**疑似问题 1 个（P1）**：回车发送未处理 IME 组合态（W6-03），可能是用户遇到「回车自动换行」的根因，需在中文输入法环境验证。

其余 14 项交互功能正常，无回归。

---
*报告生成：2026-09-27 · Spark 项目代码审查与功能验证（Round 6）*
