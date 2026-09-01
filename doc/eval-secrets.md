# Nightly 真实模型评分接入 secrets（工单 11.5）

> 目标：nightly 的 `pnpm eval --real` 从"无凭据恒 skip"变为可积累真实模型评分信号。
> fail-soft 纪律不变（doc/07 v1.12）：凭据缺失/配置错 → **skip 不红**；仅应答内容错 → fail。

## 版本记录

| 版本 | 日期       | 作者                                                                                                                                                                | 变更内容                                                    |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| v1.0 | 2026-09-02 | AI 编写：ZCode CLI · GLM-5.3-Flash（`builtin:zai-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十一 11.5 指令） | 初稿：secrets/variables 清单、三步配置、验证方法与轮换纪律 |

## 一、仓库配置项清单

| 名称                 | 类型     | 必填 | 说明                                                                     |
| -------------------- | -------- | ---- | ------------------------------------------------------------------------ |
| `SPARK_EVAL_API_KEY` | Secret   | 是   | 真实模型 API key（写入 `~/.spark/models.json` 的 `apiKeyEnv` 引用）       |
| `SPARK_EVAL_BASE_URL`| Variable | 否   | OpenAI 兼容 baseUrl；缺省 `https://api.deepseek.com/v1`                  |
| `SPARK_EVAL_MODEL`   | Variable | 否   | 模型名；缺省 `deepseek-chat`                                             |

## 二、三步配置（仓库管理员操作）

1. GitHub 仓库 → **Settings → Secrets and variables → Actions → Secrets 标签 → New repository secret**：
   Name = `SPARK_EVAL_API_KEY`，Value = 你的 API key（如 DeepSeek 后台签发的 `sk-...`）。
2. （可选）同页 **Variables 标签 → New repository variable**：`SPARK_EVAL_BASE_URL` / `SPARK_EVAL_MODEL`——
   换供应商时才需要；不配则走 DeepSeek 缺省值。
3. 验证：**Actions → Nightly → Run workflow** 手动触发 → 看"可选真实模型评分"步骤——
   key 已配置时应出现 real 场景的 pass/fail 实评结果（不再是 `真实模型环境不可用` 的 skip 文案）。

## 三、机制与轮换纪律

- workflow 在该步骤内动态生成 `$HOME/.spark/models.json`（provider 名固定 `eval`，
  `apiKeyEnv: "SPARK_EVAL_API_KEY"`）→ `pnpm eval --real` 经 `loadConfig()` 走真实引擎链路。
- **key 只经 GitHub secrets 注入环境变量，绝不写进日志或仓库文件**（AGENTS §6.3 同源纪律）；
  models.json 每次运行临时生成，随 runner 生命周期销毁。
- key 泄露或轮换：在供应商后台吊销 → 更新 secret 值 → 手动触发 Nightly 复验。
- 无 secrets 的 fork：步骤打印 notice 后照常 skip，nightly 不红（fail-soft 保持）。
