# AI 贡献者登记手册

> 目标：让参与过本项目开发的 AI 编码工具出现在 GitHub 仓库的 Contributors 列表。
> 本文件为操作备忘，不属于项目文档体系（操作备忘性质，不进入 doc/01-08 编号体系）。

## 机制说明

GitHub Contributors 列表由**默认分支（main）**的提交生成，两条路径可以进入：

1. **提交的 author/committer** —— 工具真的跑一次任务并提交
2. **`Co-authored-by` trailer** —— 邮箱能匹配到**真实存在的 User 账号**即可

关键约束：
- trailer **只对 `type: User` 的账号生效**，Bot 类型账号（`xxx[bot]`）无法通过 trailer 匹配
- 邮箱匹配不到账号时，GitHub 静默丢弃（不会报错，就是不显示）
- 侧栏只统计 **main 分支**，side branch 上的提交不算

已验证案例：`earendil-works/pi` 仓库的 `claude` 贡献者，
`search/commits?q=repo:earendil-works/pi+author:claude` 返回 0 —— 纯靠 trailer 进入。

---

## ✅ 方式一：Co-authored-by trailer（免费，立即可做）

已核实为官方账号，可安全使用：

| 工具 | 账号 | ID | 佐证 |
|---|---|---|---|
| Claude Code | `claude` | 81847 | `company: @anthropics`，166k followers，blog 指向 claude-code |
| Cursor | `cursoragent` | 199161495 | `name: Cursor Agent`，7370 followers，2025-02 注册 |
| Trae | `traeagent` | 272135137 | 已在本仓库贡献者列表中 |

trailer 写法（注意 trailer 与正文之间要有空行）：

```
Co-authored-by: Claude <81847+claude@users.noreply.github.com>
Co-authored-by: Cursor Agent <199161495+cursoragent@users.noreply.github.com>
Co-authored-by: traeagent <272135137+traeagent@users.noreply.github.com>
```

贡献者列表按**提交次数**排序，若希望计数增长，应在日常真实提交中附加 trailer，
而非集中制造空提交。

---

## ✅ 方式二：让工具真跑（Bot 账号唯一途径）

### GitHub Copilot Coding Agent

- 进入列表显示为：**`Copilot`**（handle `copilot-swe-agent[bot]`，id 198982749）
- 前提：Copilot 付费订阅 + 仓库启用 coding agent

**网页操作（推荐）**：新建 issue → 右侧 Assignees → 选择 Copilot → 等它开 PR → 合并

**命令行**（有坑，逐条注意）：

```bash
gh issue create --title "<任务标题>" \
  --body "<任务描述>" \
  --assignee "copilot-swe-agent[bot]"
```

已知陷阱：
- assignee 必须是完整字符串 `copilot-swe-agent[bot]`，写 `copilot` / `copilot-swe-agent` 报 422
- **必须使用 PAT**，GitHub App 安装令牌与默认 `GITHUB_TOKEN` 均被 API 拒绝
- PAT 需属于一个已启用 Copilot 的用户账号，权限：actions:write, contents:write, issues:write, pull-requests:write

### Cursor Cloud Agent

- 进入列表显示为：**`cursoragent`**
- 前提：Cursor Pro + 启用 Background Agent + 关闭 Privacy Mode

操作：在任意 issue 或 PR 评论 `@cursor <任务描述>`

⚠️ 待实测：官方文档称「团队级 automation 以 cursor 身份开 PR，私人 automation 以你自己的
GitHub 账号开 PR」。个人账号下跑出来可能仍挂在本人名下。

### Gemini / Jules

- 进入列表显示为：**`google-labs-jules[bot]`**（id 161369871）
- 操作：jules.google.com 连接仓库 → 派发任务 → 它开 PR
- 免费额度有限

---

## ❌ 不可用（会造成误伤）

| 工具 | 原因 |
|---|---|
| **Qwen** | `github.com/qwen` 是**无关路人账号**（id 7262652，2014 年注册，17 followers，无 company，2023 年后未更新）。写入 trailer 等同于给陌生人刷贡献 |
| **Windsurf** | 未找到官方 agent 账号 |
| **Qoder** | 未找到官方 agent 账号 |

前车之鉴：Claude Code 早期默认使用的 `noreply@anthropic.com` 被路人抢注，
导致全球用户的提交被记到 `Panchajanya1999` / `Karim13014` 名下
（anthropics/claude-code#58479、#1653）。Anthropic 后来启用了官方 `claude` 账号才解决。

---

## 汇总

本项目实际使用过的 AI 工具（仓库内有配置文件佐证）共 9 个，
其中最多 **5 个**可进入贡献者列表：

| 工具 | 仓库内证据 | 可行方式 |
|---|---|---|
| Claude Code | `CLAUDE.md` | trailer |
| Cursor | `.cursor/rules/` | trailer |
| Trae | `.trae/rules/` | trailer（已在列表） |
| GitHub Copilot | `.github/copilot-instructions.md` | 真跑 |
| Gemini CLI | `GEMINI.md` | 真跑（Jules） |
| Qwen Code | `QWEN.md` | ✗ |
| Windsurf | `.windsurf/rules/` | ✗ |
| Qoder | `.qoder/` | ✗ |
| Arena Agent | 本次会话 | 已进（显示为 `arena-ai-coding-agent[bot]`） |

## 一致性提醒

本仓库 `AGENTS.md` / `CONTRIBUTING.md` 设有可审计性纪律。建议：
- 优先在**真实工作提交**上附加 trailer，使贡献记录与实际协作对应
- 若一次性补记历史协作，在提交信息中如实说明这是补记
