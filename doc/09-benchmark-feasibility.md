# doc/09 — 外部任务基准可行性评估（工单 13.2 / Q-4 后半）

## 版本记录

| 版本 | 日期       | 作者                                                    | 变更内容                                                                                                                     |
| ---- | ---------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| v1.0 | 2026-09-07 | AI 编写：Qoder；发起：晚风（Wanfeng1028，"工单要全部做完"指令） | 初稿：Terminal-Bench（经 Harbor）/ SWE-bench Lite / 自托管容器三候选 × 四维度（环境依赖、判分契约、运行成本、接线点）对比；判决 **不接**（照 doc/07 §4.1 格式：结论/理由/未来路径 + 触发条件）；附"若接"的最小接线草图（不改代码）。调研全部在线访问（AGENTS §2.12），来源见 §6 |

> **本文职责**：只调研出报告，不实现（doc/08 §13.2 工单口径）。结论供人类拍板 Q-4；拍板后由 doc/08 §0.2 关闭 Q-4 行、doc/02 §8 勾选 13.2。
> **事实来源纪律**：外部项目一律在线读取（官方文档站 / api.github.com / arXiv），未克隆任何仓库；引用处标来源与访问日期（§6）。

---

## 0. 一句话判决

❌ **不接**——现阶段不把任何外部任务基准接进 CI 或 nightly；只把"Harbor installed-agent 接线口"登记为**未来路径**并写明触发条件（§4）。

三条主因（详见 §3/§4）：

1. **环境依赖与产品形态冲突**：两个候选都以 Docker 容器为运行前提，SWE-bench 还要求 120GB 级存储与 x86_64；Spark 是"本地 127.0.0.1 + 进程内 Engine"，仓库零容器依赖，CI 跑在 GH-hosted runner（磁盘十几 GB 量级）。
2. **判分主权外移**：外部基准的判分是"容器内 test.sh 写 reward.txt"或"仓库测试套件是否转绿"，与我们"确定性判分 + 事件流可审计"的口径不同源，趋势不可比也无法归因。
3. **数据集易变**：Terminal-Bench 1.0 的部分任务因外部站点反爬漂移而失效（官方公告自陈），随后 2.0 → 2.1 → 3.0 → 4.0 快速换版；跨版本数字不可比，作为回归门会制造噪声红灯。

---

## 1. 评估范围与方法

| 项 | 内容 |
| -- | ---- |
| 候选 | ① Terminal-Bench（经 Harbor 框架跑；TB 1.0 harness 已让位 Harbor）② SWE-bench Lite 子集 ③ 自托管容器方案（自建 Docker 化任务集，即"把 13.1 的 fixture 仓升级为容器"） |
| 维度 | 环境依赖（容器 / 网络 / 磁盘）· 判分契约（谁判、判什么、产物形状）· 运行成本（时长 / 存储 / API 花费）· 与 `examples/evals` 的接线点（在哪注入 Engine、判分放哪、CI 怎么排） |
| 方法 | 官方文档与仓库元数据在线读取（§6）；对照本仓现状事实：`examples/evals/src/harness.ts`（临时 root + ScriptedLlm/真实网关 + Engine 直装）、`examples/evals/src/tasks/defs.ts`（seed/prompt/judge/scripted 四段）、`apps/cli` 的 headless 一次性模式（工单 12.3） |
| 不做 | 不实测跑任何外部基准（需 Docker 与百 GB 磁盘，本机与 CI 都不具备）——因此本文的成本数字是**文档标称值与推算**，逐处标注 |

---

## 2. 候选对比表

| 维度 | Terminal-Bench（经 Harbor） | SWE-bench Lite 子集 | 自托管容器方案（自建） |
| ---- | --------------------------- | ------------------- | ---------------------- |
| 规模 | TB 2.0 = **89 任务**（三人人工验证；arXiv 2601.11868）；官网已列到 4.0 与 TB-Science | Lite = 300 实例（官方 FAQ 口径）；Verified = 500 | 由我们定：可从 13.1 的 17 场景起步扩到 30–50 |
| 环境依赖 | 每任务一个 `environment/Dockerfile`；`task.toml` 声明 `cpus`/`memory_mb`/`storage_mb`（文档示例值 1 核 / 2048MB / **10240MB**）与三段超时（agent 1800s / verifier 120s / build 600s）；本地 Docker 或云（Modal） | Docker 三层镜像（base / environment / instance）；**存储 ≥120GB**（instance 缓存档约 2000GB）、内存 ≥16GB、8+ 核、推荐 x86_64（arm64 实验性） | 只需一个基础镜像 + 我们的 fixture 生成器；磁盘量级由我们定（可 <5GB） |
| 网络 | 任务容器内需出网装依赖（pip/npm 等）；模型 API 出网 | 需拉取数据集与仓库镜像；模型 API 出网 | 可全离线（fixture 内置依赖）——唯一能做到"无网也能跑"的候选 |
| 判分契约 | `tests/test.sh` 把 **0..1 的数值 reward 写进 `/logs/verifier/reward.txt`**，退出码 0/非 0；Harbor 挂载 `/logs/verifier/`；判分脚本由任务作者提供（pytest / LLM-as-a-Judge 皆有） | 输入是 **predictions.jsonl（模型产出的 patch）**，harness 应用 patch → 跑该仓库测试套件 → 判 resolved；判分是离线批处理，不是交互式 agent 回路 | 我们自己写：延续 13.1 的"文件存在 / 内容匹配 / 子进程独立重跑"确定性判分 + 双向自检（未修→fail、修好→pass） |
| agent 接入形状 | **installed agent**（主流做法）：在容器内安装 agent，headless 执行；接口 = `install()` + `run(instruction, environment, context)` + `populate_context_post_run()`（解析 trajectory）。另有 external agent（宿主侧经 `exec` 打命令） | 无 agent 接口——只吃 patch 文件；要评 agent 得自己把 agent 产物转成 diff | 直接进程内调 Engine（现状），或容器内调 `spark -p` |
| 运行成本 | 推算：89 任务 × agent 上限 1800s，即使 4–8 路并行也是**小时级**，加每任务镜像构建（上限 600s）与模型 API 花费；官方定位是"前沿能力评测"，不是每次提交跑 | 文档标称：Lite 判分在 16 核 / 12 workers 约 30 分钟、8 核约 50 分钟（cache=env）；**这只算判分**，产出 300 份 patch 的 agent 运行另计（数十小时级） | 13.1 现状：17 场景 ScriptedLlm 冒烟约 10s（CI 恒跑）；真实模型 tasks 套件按场景 1–3 分钟估 |
| 许可 | Harbor = **Apache-2.0**（Python，4991 star，2026-09-05 仍在推）；与 Spark MIT 单向兼容（复用须留版权声明） | SWE-bench 仓 = **MIT**（Python，5784 star）；数据集托管在 HF（princeton-nlp/*） | 全部自有代码，无外部许可负担 |
| 已知坑 | TB 1.0 任务因外部站点反爬漂移失效（官方自陈 download-youtube 例）→ 数据集需随版本换；819 个 open issue 说明框架仍在剧烈演进 | 结果缓存按 `run_id + instance_id`，**不看 prediction 内容**——同 run_id 换 diff 会返回旧结果（官方文档明示），趋势对比易踩 | 需要自己维护容器与判分，但都在我们已有的纪律内（fixture 生成器 + 双向自检已就位） |
| 与本地形态匹配度 | 中——`spark -p` 天然贴合 installed-agent 形状，但 Docker + 小时级 + 数据集易变三点与"本地、可审计、回归绿"冲突 | 低——patch 批处理形状与交互式 agent 工作台不同源，且资源门槛（120GB / x86_64）在 GH-hosted runner 与本机都不可达 | **高**——延续 13.1 的机制，只把 fixture 仓换成容器；判分主权与事件流可审计都保住 |

---

## 3. 与 Spark 现状的匹配度分析

**我们已有的资产（对照接线点维度）**：

- `examples/evals`：进程内直装 Engine（`new Engine({ root, gateway, config })`），ScriptedLlm 与真实模型两套驱动共用同一份场景定义；判分双向自检已进主 CI（工单 13.1 第三批，17 场景约 10s）。
- `spark -p "<prompt>"` + `--output-format json`（工单 12.3）：headless 一次性模式，输出全 durable 事件数组——**这正好是 Harbor installed-agent 要的三件事**（容器内安装 CLI、headless 执行一条指令、事后解析 trajectory）。也就是说"接线口"我们其实已经有了，缺的只是容器与外部数据集。
- 审批纪律的无人值守解法已实证：13.1 第二批用 fixture 作用域 allow 规则（`fs.read`/`fs.write` 走 `file:**`、`shell.exec` 走 `cmd:**`）让写类工具不挂起，硬边界仍由工具侧 `resolveInRoot` 兜住。容器内跑外部基准同样需要这一步（或走会话级 permission-preset）。

**冲突点（逐条）**：

1. **容器依赖**：仓库现在零 Docker（`apps/desktop` 打包用 Actions，也不涉容器运行时）；开发机是 Windows + Docker Desktop，CI 是 GH-hosted ubuntu。引入容器 = 给"本地跑得起"这条产品承诺加一道重门槛，与 README 的 Quick Start（`npm i -g @spark/cli` → `spark up`）方向相反。
2. **存储与架构**：SWE-bench 的 120GB 门槛与 x86_64 推荐，在 GH-hosted runner（磁盘十几 GB 量级，**此为估算，接入前须现场核实**）与常见笔记本上都不可达；要跑就得 self-hosted runner 或云（Modal / sb-cli），两者都是新增成本与新增密钥面。
3. **判分主权与可审计性**：外部 reward 是一个 0..1 的数字，出错时我们无法归因（判分脚本在别人的容器里）；而 13.1 的判分是自己的代码，失败即定位。这与"每一步可审计"的差异化牌（doc/08 §0.3）方向不一致。
4. **趋势可比性**：数据集换版（TB 2.0 → 4.0）会让历史数字失去意义；nightly 曲线要么断层要么误导。
5. **成本与收益错配**：产品尚未打 tag / 未发 npm（v1.0.0 段落已在 CHANGELOG，tag 与 publish 待人类执行），当前没有"对外宣称能力、需要横向可比数字"的诉求；而外部基准的唯一不可替代价值恰恰是横向可比。

---

## 4. 判决（照 doc/07 §4.1 格式）

- **结论**：❌ → 评估后**不接**。13.2 以本报告收口；不新增依赖、不改 CI、不引容器。Q-4 的建议拍板为"自建场景集（13.1）为唯一回归门，外部基准不进 CI/nightly"。
- **理由**：见 §3 五条冲突——容器与存储门槛（含 GH-hosted runner 不可达）、判分主权外移且不可归因、数据集换版致趋势不可比、成本与当前收益错配（无对外可比诉求）、与"本地跑得起 + 每一步可审计"两张差异化牌方向相反。三候选里唯一匹配度高的"自托管容器方案"，其价值（隔离 + 可复现依赖）在 13.1 的临时 fixture 仓 + 独立重跑判分下已大部分拿到，剩余增量不足以支付容器化成本。
- **未来路径（触发即重评，不预置代码）**：
  1. **触发条件 A**：出现外部使用者或对外发布需要"横向可比"的能力数字（例如 README 要写 TB 分数）→ 接 **Harbor installed-agent**，只跑 TB 的**子集**（10 任务级冒烟），排在 weekly 而非 nightly，运行在 self-hosted runner 或 Modal。
  2. **触发条件 B**：要用 RL / SFT rollout（Harbor 的另一半定位）→ 届时接线口同 A，另需 trajectory 格式对齐（我们的 durable 事件数组已是结构化 trajectory，转换是薄适配）。
  3. **触发条件 C**：需要"跨语言/跨依赖"的真实仓库任务（fixture 仓表达不了）→ 优先做**自托管容器方案**（自建任务集），仍不接外部数据集，判分主权保留。
  4. 任何时候都**不接 SWE-bench**，除非有 self-hosted x86_64 + 120GB 的常备机器且诉求变成"patch 生成质量"而非"agent 任务完成度"。

### 4.1 若接（触发条件 A）的最小接线草图——不改代码，仅记录形状

- **agent 侧（Harbor installed agent，Python 薄适配，放外部仓或 `examples/` 之外的独立目录）**：
  - `install()`：容器内装 Node ≥24 + `npm i -g @spark/cli`（或 `pnpm pack` 产物），写 `~/.spark/models.json`（provider 指向 env 注入的 key 与 baseUrl），写 `~/.spark/permissions.json` 预置 allow 规则（无人值守；口径同 13.1 fixture 规则）。
  - `run(instruction, environment, context)`：`spark -p "<instruction>" --output-format json --cwd <任务工作目录>`，stdout 落 `/logs/agent/trajectory.json`；超时由 `task.toml` 的 `[agent] timeout_sec` 管。
  - `populate_context_post_run()`：解析 durable 事件数组取最终 assistant 文本与工具调用统计（我们的 JSON 输出已是全事件数组，无需额外埋点）。
- **判分侧**：完全用任务自带的 `tests/test.sh` → `/logs/verifier/reward.txt`（我们不写判分，也不改它——这正是"判分主权外移"的代价，须在报告与 README 中如实标注为外部数字）。
- **CI 排法**：新增 weekly workflow（self-hosted runner label 或 Modal secret），跑 `harbor run -d "<tb 子集>@<版本>" --agent path.to.spark:SparkInstalledAgent`；**数据集版本钉死**在 workflow 里（换版即断层，须在 CHANGELOG 记一行）；红灯不阻塞 main（只出报告），因为外部任务失效不是我们的回归。
- **不接进 `pnpm eval`**：外部基准与 13.1 的确定性回归是两个层次，混在一个命令里会让"绿"的含义变模糊。

---

## 5. 与 13.1 自建场景集的分工（写清边界，防重复立项）

| | 13.1 自建（已落地） | 外部基准（本判决：不接） |
| - | ------------------- | ------------------------ |
| 目的 | 回归门：改动是否让 agent 变笨 | 横向可比：对外宣称能力 |
| 判分 | 自己的确定性判分 + 双向自检 | 任务作者的 test.sh / 仓库测试套件 |
| 环境 | 临时 fixture 仓，进程内 Engine，无容器无网络 | Docker 容器，出网装依赖 |
| 频率 | 每次 push（约 10s）+ nightly 真评 | weekly 或按需（小时级） |
| 失败含义 | 我们的回归，必须修 | 可能是数据集漂移，需人工甄别 |

---

## 6. 来源清单（全部在线访问，2026-09-07；AGENTS §2.12：禁克隆）

| 事实 | 来源 |
| ---- | ---- |
| Harbor 任务格式（`task.toml` / `instruction.md` / `environment/Dockerfile` / `solution/solve.sh` / `tests/test.sh`）、三段超时与资源声明、reward.txt 判分契约 | harborframework.com/docs/adapters |
| installed / external agent 接口（`install` / `run` / `populate_context_post_run`、`harbor run --agent path:Class`）、既有 agent 清单 | harborframework.com/docs/agents |
| TB 2.0 与 Harbor 的关系、TB 1.0 任务因外部反爬漂移失效的自陈 | tbench.ai/news/announcement-2-0 |
| TB 2.0 = 89 任务、三人人工验证 | arXiv 2601.11868（HTML 版）与 openreview 同名 PDF |
| 基准版本已演进到 4.0 / TB-Science | tbench.ai/benchmarks |
| Harbor 许可 Apache-2.0、Python、4991 star、819 open issues、2026-09-05 仍推 | api.github.com/repos/harbor-framework/harbor |
| TB 1.0 harness 已让位 Harbor | github.com/harbor-framework/terminal-bench-1（README 公告行） |
| SWE-bench 判分流程（predictions.jsonl → 应用 patch → 跑仓库测试 → resolved）、三层镜像、资源门槛（≥120GB / ≥16GB / 8+ 核 / x86_64）、Lite 判分时长（16 核约 30 分钟、8 核约 50 分钟）、结果缓存忽略 diff 内容的坑、Modal / sb-cli 云路径 | swebench.com/SWE-bench/reference/harness/ |
| SWE-bench 数据集规模口径（Lite / Verified 500 / Multilingual 300） | swebench.com/SWE-bench/faq/ |
| SWE-bench 许可 MIT、Python、5784 star | api.github.com/repos/SWE-bench/SWE-bench |

> 未核实项（接入前须现场确认，本文不作为判决依据）：GH-hosted runner 的实际可用磁盘；Harbor 在 Windows/Docker Desktop 下的可用性；TB 各版本任务对我们工具面（read/write/edit/grep/bash）的覆盖率。

---

_本文完（v1.0）。互引：doc/08 §13.2（工单规格）与 §0.2 Q-4（待拍板行）、doc/07 §4.1（判决格式来源）、doc/06 §2（CI 分层，本判决不改动它）。_
