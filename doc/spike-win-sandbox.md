# Spike 报告：Windows OS 级沙箱可行性（阶段十九工单 19.6 / 翻案 D15）

> 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| ---- | ---------- | -------- | ------------------------------------------------ |
| v1.0 | 2026-09-19 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，阶段十九 19.6 指令） | 初稿：AppContainer/受限令牌/Job Object/重量级隔离四路线证据评估，结论 = 无低成本可行路径，推荐替代案待拍板 |
| v1.1 | 2026-09-26 | AI 编写：ZCode CLI·GLM-5.3-Flash（`builtin:bigmodel-start-plan/GLM-5.3-Flash`）；发起：晚风（Wanfeng1028，"沙箱这块你去看一下我们的参考的几个项目……参考项目加上 ZCode zai 刚开源的，你去翻阅一下他的整体源代码"指令） | **§10 参考项目实证补充（两路在线源码调研，全程 gh api/raw 直读未克隆）**：① **zai-org/ZCode**（Apache-2.0，2026-09-20 建仓）——三平台**均无 OS 级命令沙箱**，纯审批模型（五档模式 + 只读命令分类器降审批疲劳），Windows 仅用 **Job Object（koffi FFI 零原生依赖，KILL_ON_JOB_CLOSE）做 MCP server 进程清理**而非设防，强隔离走 Docker/SSH/WSL 远程工作区；② **openai/codex**——Windows **有真沙箱**：AppContainer + WFP 网络过滤 + 一次性提权 provisioning（windows-sandbox-rs 整 crate 群），档位 ReadOnly/WorkspaceWrite/DangerFullAccess + 新 PermissionProfile（FS kind + 逐路径 read/write/deny + 网络独立一维）；Linux 用 bubblewrap+seccomp（Landlock 降级 legacy）；③ **MiniMax/anthropic sandbox-runtime**——`srt-win.exe`：专用低权本地用户 + WFP 按 SID 过滤 + 显式 ACL，TS 编排 + 单原生 exe，一次性提权 provisioning；④ gemini-cli 沙箱 opt-in（Seatbelt 六档案/bwrap/Docker）；⑤ opencode 纯审批无沙箱（OS 隔离仍是 open issue）。**修订结论**：v1.0 的"无**低成本**可行路径"成立，但"不可行"需限定——Codex/anthropic 证明 Windows 真沙箱可做，代价是一个独立大工作流（原生 helper + ACL/WFP + provisioning）。替代案从 A/B/C 扩为 **A 维持不做（=ZCode/opencode 同款形态）/ C Job Object 进程管家（半日，ZCode 同款可抄）/ D srt-win 式轻量沙箱（独立大单，1-2 周量级）/ E Codex AppContainer 全家桶（不推荐）**。证据全文见 §10 |

## 0. Spike 任务与边界（工单 19.6 原文口径）

工单要求：「AppContainer / restricted token spike 报告 + 可行即落地（bash 工具沙箱档新增 `os` 级别）；不可行则出证据报告与替代案让晚风再拍板」。

**边界声明**：本仓执行环境纪律（AGENTS §2.2/§2.3a）下 spike 不在本机运行实验代码——本报告是**文献级证据评估**（D15 既有调研深化 + 机制级分析 + 参考项目实证），非运行时 PoC。若晚风选择继续推进 AppContainer 实验，需真机 PoC（见 §5 触发条件），届时再判「可行即落地」。

## 1. 问题重述

bash 工具沙箱档（`engine.bashSandbox`，ADR D15）现状：Linux 走 bwrap、macOS 走 Seatbelt，**Windows 无 OS 级路线**（`E_SANDBOX_UNAVAILABLE` fail-closed）。目标：评估给 Windows 补上 OS 级隔离（进程降权 + 文件系统/网络限制）是否有工程上可接受的路径。

威胁模型口径：沙箱防的是「模型被诱导执行破坏性命令」的**事故**面（误删、误写、外传），不是防 determined attacker 的**安全边界**（本地单用户产品，§6 红线不做多用户）。这个口径直接决定几条路线可以提前排除。

## 2. D15 既有判决的复核（2026-08-25 调研）

D15 当时给出四条否决证据，本次 spike 逐条复核仍成立：

| # | D15 证据 | 复核结论 |
| --- | --- | --- |
| 1 | AppContainer 是 deny-by-default ACL——任意路径只读不可行 | ✅ 成立。AppContainer 进程对文件系统全部对象默认无访问（无 GRANT 即拒绝），要「能读工作区」必须对工作区整棵树 re-ACL（追加 CAPABILITY SID 的 ACE）——re-ACL 是持久变更，破坏 git/杀毒/备份工具假设（见 §3.1） |
| 2 | dsh 设计笔记实证放弃 AppContainer | ✅ 成立。dsh（Windows 支持最好的参考 harness）在 Windows 明确不做 OS 级沙箱，走「审批兜底」路线 |
| 3 | FerroxLabs #321：Node 子进程在 AppContainer 下的缺陷 | ✅ 成立。node(child_process) 在 AppContainer 内 spawn 链路有已知问题（named pipe/stdio 句柄继承受限），Node 官方无 AppContainer 支持承诺 |
| 4 | Node/TS 无维护中的沙箱绑定 | ✅ 成立。npm 无维护中的 AppContainer/restricted-token 绑定（零下载约束下亦无法引入原生依赖——与 D44 PowerShell 桥选型同理） |
| 5 | Claude Code 先例：Windows 原生未支持沙箱 | ✅ 成立。行业最强 Windows coding agent 同样不提供 |

## 3. 四路线机制级评估

### 3.1 AppContainer（低完整性 + 能力 SID）

机制：进程令牌标低完整性级别（IL）+ 订阅 capability SID；对文件系统/注册表/named object 全部 deny-by-default，访问需对象 DACL 显式授予对应 SID。

- **可行面**：spawn 侧可实现（`CreateProcess` LOGON_NETBASICONLY / STARTUPINFOEX with attribute list——纯 Win32 调用，PowerShell 桥或 node-ffi 均可触达，前者已验证可行 D44）。
- **致命面**：deny-by-default 意味着**读也不行**。工作区要可读 → 对 `cwd` 整棵树 re-ACL（`icacls /grant` 追加 ACE）；node_modules 数万文件 re-ACL 耗时秒级到分钟级、且是**持久修改**（git 不跟踪 ACL，但杀毒/备份/同步盘对 ACL 变更敏感；仓库移动/克隆后沙箱外进程读取行为不一致）。
- **网络**：AppContainer 默认断网（Internet capability 需显式授予）——这一点反而是 19.7 需要的，但与 re-ACL 成本绑定在同一机制上。
- **判决**：技术上可做，工程上 re-ACL 的持久副作用与工具链破坏成本不可接受（与 D15 判决一致，证据更充分）。

### 3.2 Restricted Token（CreateRestrictedToken）

机制：剥离令牌特权（SeBackupPrivilege 等）+ 追加 restrict-only SID——进程仍是同一用户，访问检查要求「用户 SID 与 restricted SID 双重通过」。

- **可行面**：实现简单（一次性调用），无 re-ACL。
- **致命面**：restrict-only 语义 = 对**本来就允许 Everyone/Users 读的文件**仍可读、对用户自己创建的文件仍可写——隔离增益≈0。它防提权不防破坏，对本威胁模型（同用户事故面）无增益。
- **判决**：不解决任何本产品的实际风险，纯复杂度。否。

### 3.3 Job Object（CreateJobObject + 限制位）

机制：进程组级限制——内存/ CPU 时间/UI 限制/进程数上限；`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 收孤儿子进程树。

- **定位澄清**：Job Object 是**资源管理**不是**安全边界**（官方文档明示）——不能限制文件访问、不能过滤网络目标。
- **可取面**：`KILL_ON_JOB_CLOSE` 恰好是 bash.ts 树杀（taskkill /T /F 两次强杀）的更可靠替代（当前实现有派生竞态孤儿面，注释自认）；超时杀进程树用 Job Object 一次收口，零安全假设。
- **判决**：**作为沙箱否**；**作为进程组收口值得独立小改**（19.3 常驻 shell 的会话回收同样受益——常驻 shell 池 drop() 用 Job Object 绑定会话内全部子进程，比逐个 treeKill 可靠）。登记为 19.3 的后续增强候选（非本轮，不夹带）。

### 3.4 重量级隔离（Windows Sandbox / WSL2 / Hyper-V 容器）

- **Windows Sandbox**：系统组件但每次冷启动 10s+、镜像管理复杂、sidecar 无法假设用户开启（Home 版无）。
- **WSL2**：引擎 sidecar 在 Windows 宿主跑，bash 命令若进 WSL 则 cwd/路径/工具链全部异构（路径翻译 /mnt/、性能、发行版差异）——破坏「同一工作区同一工具链」核心假设。
- **判决**：均超出单文件 sidecar 产品形态（D44 同一取向）。否。

## 4. 结论与替代案

**结论：Windows OS 级沙箱无低成本可行路径——AppContainer 的 re-ACL 副作用、受限令牌的零增益、Job Object 的非安全语义、重量级方案的形态冲突，四路线均不满足「与 sidecar 单文件形态 + 零原生依赖 + 用户机零配置」的约束组合。** 按 19.6 工单预设分支，本 spike 归入「不可行 → 出证据报告与替代案让晚风再拍板」。

**替代案（维持并收紧现行为，待拍板）**：

1. **推荐 A（维持现判决并加证据注记）**：D15 的「Windows 无 OS 级路线」从「本期不做」升格为「spike 评估后维持不做」——依据本报告 §2/§3；Windows 上隔离由「审批兜底（bash 缺省全审批 ask）+ 路径硬边界（resolveInRoot）+ 审计归因」三层承担，这与 dsh/Claude Code 的 Windows 形态一致。bash.ts 头注与 D15 补记同步。
2. **推荐 B（网络面收口归 19.7）**：Windows 上网络隔离的诉求走 19.7 已立项的 SOCKS5 + 域名 allowlist 路线（用户态代理，非 OS 级）——对「防外传」的事故面有真实增益，且跨平台一致。19.6 的 OS 级网络能力（AppContainer 断网）不追。
3. **候选 C（进程组收口增强，独立小单）**：Job Object `KILL_ON_JOB_CLOSE` 用于 bash 树杀与常驻 shell 会话回收的可靠性增强——纯资源管理，不涉安全语义，可随 19.3 的后续增强立项。

**触发重评的条件**（登记后置池性质）：① AppContainer 在 Node 生态出现维护中的绑定且 re-ACL 出现无损方案；② 产品形态出现「跑不可信第三方代码」的真实场景（此时隔离需求升级，重量级方案重新进入评估）。

## 5. 待拍板清单（晚风）

| # | 问题 | 选项 |
| --- | --- | --- |
| 1 | Windows OS 级沙箱判决 | A. 维持不做并升格为 spike 证据判决（推荐）/ B. 追加预算做 AppContainer re-ACL 真机 PoC |
| 2 | Job Object 收口增强 | 随 19.3 后续立项 / 挂池 |
| 3 | 本报告处置 | spike 结论并入 D15 补记（推荐）/ 保留独立文档 |


## 10. 参考项目实证补充（2026-09-26，晚风指令：翻参考项目与 ZCode 开源源码）

> 方法：两路并行在线源码调研（gh api + raw 直读，全程未克隆未下载，§2.12 合规）。证据均为 file:line 级 [读码]。

### 10.1 zai-org/ZCode（Z.ai 开源，Apache-2.0，2026-09-20 建仓）

**结论：三平台均无 OS 级命令沙箱——纯审批模型 + 进程生命周期管理，强隔离走"换环境"（Docker/SSH/WSL 远程工作区）。** [读码]

- **Windows 命令执行 = 朴素 spawn**（`apps/zcode-cli/packages/adapters/src/exec/node-execution-adapter-process.ts:127` Windows 不 detached；`.cmd/.bat` 经 cmd.exe `/d /s /c`）。
- **Job Object 只用于 MCP server 清理**：`adapters/src/mcp/windows-job-object.ts` —— koffi FFI 直调 kernel32（`:109` CreateJobObjectW / `:126` AssignProcessToJobObject / `:130` TerminateJobObject），`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`（`:4`）：父进程任何死法（含崩溃）内核都收割整棵子树；原生不可用回退 taskkill（`:49`）。**这是"进程管家"的现成参考实现，且零原生模块依赖**。
- **审批模型**：五档模式（yolo/auto/plan/edit/build）+ allow/ask/deny 三态（`core/src/permission/service.ts`）；bash 默认高风险必问，但**只读命令分类器**（`bash-readonly-policy-*` 家族 + 复合命令全段解析 + 安全 flag 白名单 + 危险回调）把 cat/ls/git status 等降为免审批——降审批疲劳的主要手段。
- **工作区边界是软的**：`core/src/tool/path-policy.ts:36-38` 注释明说当前版本不硬阻断 workspace 外路径。
- **网络 = env 层代理钉死 + WebFetch SSRF 护栏**（阻断 localhost/私网字面量含 NAT64 还原），bash 命令本身无域名白名单的 OS 手段。
- **POSIX 进程清理**：detached 建进程组 → SIGTERM → 750ms SIGKILL → `ps` 表 PPID 后代补杀。

### 10.2 openai/codex（Rust）——Windows 真沙箱存在，但是一个 crate 群的工程量

- **Windows 三后端**：`windows-sandbox-rs`（主力：AppContainer 包 + 能力、deny-read ACL 预展开、令牌构造、**WFP 网络过滤**、一次性管理员 provisioning 建 offline sandbox identity 仅许 loopback 代理）、`mxc-sandbox`（Microsoft MXC PSEC，默认关）、选择器（`sandboxing/src/windows.rs`）。档位 `WindowsSandboxLevel { Disabled(默认), RestrictedToken, Elevated }`（`protocol/src/config_types.rs:297-301`）。
- **档位与审批组合**：旧 `SandboxMode{ReadOnly,WorkspaceWrite,DangerFullAccess}`；新 `PermissionProfile`（FS kind: Restricted/ExternalSandbox/Unrestricted + 逐路径 read/write/deny，deny>write>read；网络独立一维 Restricted/Enabled）——"策略即数据"的数据模型值得照抄（`protocol/src/permissions.rs:86-135`）。
- **审批×沙箱组合 fail-closed**："需要审批但审批被设为 Never → 直接拒绝而非放行"（`core/src/exec_policy.rs` PROMPT_CONFLICT_REASON）——与本仓审批铁律同构。
- **execpolicy 规则引擎**：`bash -c`/`node -e`/`powershell -Command` 等包装前缀黑名单，防前缀白名单被包装绕过。
- **Linux 教训**：Landlock 降级 legacy（隔离不了 Unix socket），主力 = bubblewrap + seccomp 网络过滤。

### 10.3 MiniMax/anthropic sandbox-runtime（Apache-2.0，vendor 进 minimax-code）

- **Windows 机制 = `srt-win.exe`（Rust helper）**：创建专用低权本地用户 `srt-sandbox` → 机器级 WFP 过滤按该用户 SID → 两跳启动（broker → CreateProcessWithLogonW → 受限 token 子进程）→ 文件系统显式 ACE（denyRead/denyWrite/allowRead/allowWrite）→ 专用用户 SID 结构性封死 surrogate-spawn 逃逸（`windows-sandbox-utils.ts:22-45` 头注）。
- **网络 = 代理中介型**：deny-first、放行流量全部过本地代理（域名模式过滤 + MITM CA + 凭据掩码）。
- **交付形态与 Spark 最兼容**：TS 编排 + 单个原生 exe helper + 一次性提权 provisioning。

### 10.4 其余

- **gemini-cli**：沙箱 opt-in（macOS Seatbelt 六档案 permissive/strict × open/proxied、Linux bwrap、Docker/Podman），已出现 Windows 沙箱编译脚本；不开沙箱即审批确认。
- **sst/opencode**：纯审批模型，宿主直接 spawn（`tool/shell.ts:484`）；OS 级 FS 沙箱仍是 open issue。

### 10.5 修订后的替代案（供 19.6 拍板）

| 案 | 内容 | 代价 | 参照 |
| --- | --- | --- | --- |
| **A** | 维持不做 OS 沙箱，升格为证据判决（现有防线：审批 fail-closed + 路径围栏 + 19.7 出网代理） | 0 | ZCode/opencode 同款形态 |
| **C** | A + Job Object 进程管家：会话结束时整树收割 AI 启动的子进程 | 半日 | ZCode windows-job-object.ts 可直接抄（koffi FFI 零依赖） |
| **D**（新增） | A + C + srt-win 式轻量沙箱：专用低权用户 + WFP SID 过滤 + 显式 ACL + 代理中介网络 | 独立大单，1-2 周量级，需一次性管理员 provisioning | MiniMax/anthropic sandbox-runtime |
| E（新增，不推荐） | Codex AppContainer 全家桶 | 整 crate 群工程量 | openai/codex |

**对 v1.0 结论的修订**："无低成本可行路径"成立；"Windows 真沙箱不可行"不成立——Codex 与 anthropic/MiniMax 都做出来了，代价是独立大工作流。A+C 是性价比拐点；D 是认真要沙箱时的最优形态。
