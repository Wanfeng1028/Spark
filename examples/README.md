# examples —— SDK 画廊

> 这里每个例子都是**可跑的最小实现**，不是演示展：零业务抽象（boring 红线），抄走就能改。
> 三例只用两样东西——`@spark/sdk`（客户端装配）与 `@spark/protocol`（类型 + 四端同款
> `applyEvent` reducer）。想明白这一点，"能在 Spark 上造什么"就清楚了：**造一个投影**。

## 三例（工单 14.5）

| 例子                        | 一句话                                                          | 跑法                                                                        |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`sdk-bot`](./sdk-bot)      | automation bot：建会话 → 发任务 → 等 `turn.completed` → 写日志   | `pnpm --filter @spark/example-bot start`（离线演示加 `SPARK_DEMO=1`）        |
| [`sdk-viewer`](./sdk-viewer) | 最小 web viewer：证明"第三方 UI 就是事件流的投影"                | `pnpm --filter @spark/example-viewer dev`                                   |
| [`sdk-tui`](./sdk-tui)      | 自定义终端前端骨架：Ink + `applyEvent` 驱动四区极简版            | `pnpm --filter @spark/example-tui start`                                    |

**前置**：viewer 与 tui 需要一个在跑的 server（`pnpm --filter server dev`，缺省
`127.0.0.1:4318`；`SPARK_API` 可覆盖基址）。bot 的 `SPARK_DEMO=1` 演示模式**不需要 server**：
它进程内起 Engine + ScriptedLlm（走 `@spark/sdk/inprocess`），不出网、不打真实模型——
因此它也是唯一被 CI 真跑的一例（`sdk-bot/tests/bot.test.ts`）。

**行数红线**（工单验收；数字为实测文件行数，`wc -l` 口径）：bot 129 + 31 行（拆"可复用核心 + 脚本壳"
是为了可测，合计 160 行超要求 2 的 120 行，已在 doc/08 §14.5 备案）；viewer 主文件 140 行
（要求 ≤150）；tui 192 行（要求 ≤300）。

## `@spark/sdk` 自带的两个示例

| 示例                                     | 一句话                                                            | 跑法                                  |
| ---------------------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `packages/sdk/examples/minimal.ts`       | HTTP 通道最小连接（≤10 行：装配 + 订阅 + 建会话 + 发送）            | `pnpm --filter @spark/sdk example`    |
| `packages/sdk/examples/embed.ts`         | 进程内嵌入（≤30 行：建引擎 → 订阅 → 审批应答 → 关闭）               | `pnpm --filter @spark/sdk embed`      |

嵌入的六段说明（生命周期属宿主 / 事件订阅是唯一状态源 / 会话与回合 / 审批接管 /
配置与密钥 fail-closed / 收口与错误码）见 `doc/02-development-plan.md` §4.8；
双通道（HTTP 与进程内）的逐方法映射见 §4.7。

## 其它目录

- [`evals`](./evals)：eval 回归套件（`pnpm eval`，`--real` 打真实模型）——它是测试装置，
  不是 SDK 示例，别照它抄客户端代码。

## 走查记录（工单验收要求）

三例在真实 server 下的走查由人类执行并记录在此（CI 不打真实模型，也没有 TTY 与浏览器）：

| 例子                       | 走查人 | 日期 | 结果                                            |
| -------------------------- | ------ | ---- | ----------------------------------------------- |
| sdk-bot（`SPARK_DEMO=1`）  | CI     | 每次 push | ✅ `tests/bot.test.ts` 两例（进程内 + ScriptedLlm） |
| sdk-bot（HTTP 模式）       | 待执行 | —    | —                                               |
| sdk-viewer                 | 待执行 | —    | —                                               |
| sdk-tui                    | 待执行 | —    | —                                               |

走查时请顺手核三条红线：① 事件流是 UI 的唯一状态源（不自己攒事件，只用 `applyEvent`）；
② 失败如实呈现（错误进界面/日志，不吞不装）；③ 无"AI 生成味"外观（DESIGN §12 六类黑名单）。
