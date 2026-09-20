# 工单落地核查与代码质量审计报告

> 本报告核查"工单声称完成"与"代码实际落地"是否相符，并评估已落地代码的逻辑、健壮性、鲁棒性与可长期迭代性。

## 版本记录

| 版本 | 日期 | 作者 | 变更内容 |
| --- | --- | --- | --- |
| v1.0 | 2026-09-21 | AI 编写：Qoder；发起与授权：晚风（Wanfeng1028，"检查工单和实际代码的落地情况……给我写一个报告，把相关的问题总结工单"指令） | 初稿：审查范围/方法与可信度声明（§1）、判定总表（§2）、三个系统性问题（§3）、分单发现（§4：阶段十九 9 单 + 引擎核心 + 服务端与四端 + 官网）、归属台账与局限（§5）、整改工单 LA-01~LA-62（§6）。§1.4 如实登记**本次审查自身的质量事故**：并行子代理产出的指控中有 7 条经主会话复核不成立，已剔除并入证伪表 |

## 1. 范围、方法与可信度声明

### 1.1 范围

- **阶段十九已落地 9 单**：19.1、19.2（computer-use 三平台执行体）、19.3（bash 常驻 shell）、19.4（MCP streamable-http）、19.5（LSP 下载器）、19.9（审批作用域）、19.10（arena 落盘）、19.11（索引库管理）、19.12（浏览器设置面）。事实源：`doc/02-development-plan.md` §8 阶段十九表（✅ 标记）。
- **官网 `official/`**（v1.54 落地 + 批次 B~H 改版）。
- 19.6 为纯 spike 报告（无代码）；19.13~19.42 仍为 ⬜，不在核查范围。
- 引擎核心（阶段一~七主干 + AUD-01~14 整改批）、服务端与四端外壳（server/cli/desktop/mobile/miniapp/sdk/examples/skill-kit）见 §4.7、§4.8。协议+Web 组与全阶段（一~十八）跨期对账组的结论续补，见 §7。

### 1.2 方法

全程只读（`Read` / `Grep` / `git show` / `git log`）。按 AGENTS.md §2.2、§2.3a，**未运行任何 test / typecheck / lint / build / install，未下载任何依赖或工具**。

### 1.3 结论标注口径

每条发现标注依据类型，不把推演写成实测：

- **[读码]** —— 直接读到该代码/文案，可复现为文件与行号。
- **[推断]** —— 由代码结构 + 平台/语言语义推出，未执行验证。
- **[不可判]** —— 静态无法确定，需真机或运行时（本报告一律不为其下结论，只登记为待验证项）。

凡涉及"渲染出来什么样""真机上会不会发生"的结论，本会话**均未验证**。

### 1.4 本次审查自身的质量事故（必须先读这一节）

审计由并行子代理分工执行。主会话对子代理的每条 P0/P1 指控做了独立复核，结果如下——**这部分与代码结论同等重要**，因为它直接关系到"这套 AI 写、AI 审、AI 自己回填勾选的流程能不能长期迭代"：

子代理产出的 7 条高危指控经复核**不成立**，已全部剔除：

| 被剔除的指控 | 反证 |
| --- | --- |
| 「macOS 把输入文本拼进 AppleScript 源码可注入」 | `computer/macos.ts:127-131` 文本走 spawn **argv**（`item 1 of argv`），`:180` 剪贴板走 **stdin**；全文件无 `do shell script` |
| 「`runRaw` 把用户程序放 argv[0] 构成任意执行旁路」 | `grep -rn runRaw packages/engine/src/computer/` 零命中——**该函数不存在** |
| 「`7bda994` 夹具扫尾把 `process.cwd()` 误插进 `executor.ts:123` / `bash-pool.ts:135`」（两个代理各自"独立取证确认属实"） | `7bda994` 只改了 3 个测试文件；`executor.ts:123` 实为 `scroll()`，`bash-pool.ts:135` 实为 `const seq = (live.seq += 1)`，两处均无 `process.cwd()` |
| 「MCP http transport 永不被构造，远程 http 连不通」 | `mcp/manager.ts:143-151` `connect()` 对所有条目无条件走 `defaultTransport`，`:52-64` 对 `streamable-http` 构造 `StreamableHTTPClientTransport` |
| 「MCP headers 掩码 rejecter 不可达，掩码占位会漏写进盘」 | `mcp/config.ts:112-131` `resolveMaskedMap` 对 env 与 headers 同一实现，无真值即 `throw new ConfigError(describe(k))` |
| 「`ArenaStore.save` 是 async 而调用方未 await → 未捕获异常」 | `arena/store.ts:54` `save(record): void` 为**同步**（`mkdirSync` + `atomicWriteJson`） |

此外，子代理给出的**行号普遍偏移**，本报告所有 `file:line` 均由主会话重新定位后才写入。

结论性判断：**在"本机零验证"的仓库里，AI 生成的审计报告同样不可直接采信**。§6 的整改工单只收主会话亲自复核过的条目。

## 2. 判定总表

| 工单 | 判定 | 一句话依据 | 归属（自报，见 §5） |
| --- | --- | --- | --- |
| 19.1 computer-use 底座（Windows） | **部分完成，勾选偏高** | Windows 执行体与主开关真实接通；但"超时/中断 fail-closed"缺 aborted 预检，点击/聚焦的 Win32 返回值被丢弃 → 失败仍报 `ok:true`；且实现与工单卡"截图进模型上下文"正相反 | GLM-5.3-Flash / Qoder（两方经手） |
| 19.2 computer-use mac/Linux + 设置页 | **虚高** | web 页真落地（有入库走查截图）；但 macOS 截图命令名拼错 `screapture` → 该操作必然失败；"Wayland 如实拒绝"零实现 | GLM-5.3-Flash / Qoder / GLM-5.3（三方经手） |
| 19.3 bash 常驻 shell | **部分完成** | 池是真长驻、cwd/env 保持是真语义；但无显式 cwd 起在引擎目录、哨兵缺前导换行、输出无上限（把 AUD-02 修过的 OOM 面复现回来） | GLM-5.3-Flash |
| 19.4 MCP streamable-http | **部分完成，主体真实** | transport 真接、headers 真送达、零新依赖属实；但 `openapi.json` 请求体未同步（仍 `required:['command']`），唯一触达 connect 的测试是非判别性的 | GLM-5.3-Flash |
| 19.5 LSP server 下载器 | **部分完成** | 三通道全通；但真实 npm 分支零执行覆盖 + 测试头注指向不存在的用例；caret 区间被称"pin"（措辞在 D47 内已披露，属判断偏松非虚报） | GLM-5.3-Flash |
| 19.6 Windows OS 沙箱 | **符合工单** | 工单预设"不可行则出报告回拍板"，报告已出且判决挂起待人类——本单无虚报 | GLM-5.3-Flash |
| 19.9 审批作用域扩展 | **危险方向虚高** | scope 三通道/写盘/四端入口真实；但三条安全表述中两条与代码不符、一条不可达；并触发 §4.1 的 P0 | GLM-5.3-Flash |
| 19.10 arena 落盘 | **真完成（有边界缺口）** | 四时机写盘/原子写/mtime 序/重启可查均成立，是真原子；缺口在故障面形状（一个畸形文件可毒死整张列表） | GLM-5.3-Flash |
| 19.11 索引库管理 | **部分完成（局部虚高）** | 三端点三通道真 SQLite 实现贯通；但唯一破坏性写路径 `rebuild()` 不满足其自身安全论证（清表无事务/无互斥/扫描静默返空 ⇒ "索引清空 + HTTP 200 成功"），且"禁假数据"只做到了 `stats()` | GLM-5.3-Flash |
| 19.12 浏览器设置面 | **部分完成** | 设置面真落地（driver 选项真接线、`url:` 视图数据源真为 permission rules）；但保存后 `GET /api/settings` 回旧值致控件回弹、清理越界删电脑控制截图并附虚假承诺文案。其 **11 连红链**是"零验证代价"的完整样本（§4.6） | GLM-5.3-Flash |
| 官网 official | **虚高** | hero 示例调用不存在的 `client.events.onEvent`、代码窗复制丢全部代码行（两条在册 P0 属实）、**审批键位映射写反**（按"4 拒绝"实际授予项目级常允许）；对外契约计数漂移（写 67，实数 74） | `quickstart` 键位段自报 **Qoder**（`415dc08`）；批次 D/E 自报 GLM-5.3-Flash |
| 引擎核心（阶段一~七 + AUD 批） | **主干扎实，八张 AUD 单六张有残留** | 未发现"声称修了实际没修"的虚报，但残留集中在同一结构成因：**横切不变量（`resolveInRoot`/脱敏/错误码）实现在调用点而非闸口**，故必然随新增路径复发 | AUD 批自报 **ZCode · Union Alpha**；主干多为 **Trae · GLM-5.3**；多数条目**多人经手不确定** |
| 服务端 + sdk/examples | **真完成** | 薄壳纪律、`errors.ts` 单源、9.1 鉴权面（对抗用例齐备）、sdk 双通道 parity、examples API 面全部真实存在——本组唯一无 P0 的两块 | 9.1 自报 Qoder；AUD-11 自报 Union Alpha |
| CLI / 桌面 / 移动 / 小程序 | **部分实现，有虚高** | 协议共享核纪律 mobile/miniapp 守得最好（零另写一份）；但 CLI 每键重跑 boot、桌面首启续启竞态、进程生命周期三项在册缺陷一条未修 | 桌面骨架自报 **Trae · GLM-5.3**；RT3-01/AUD-12 自报 GLM-5.3-Flash / Union Alpha（后者自陈系子代理执行、主会话复核） |
| 协议共享核 + Web | **reducer 最结实；单源纪律对 web 有系统性破口** | 事件流唯一状态源守住、51 例 reducer 覆盖 27 种词表无一遗漏且是深测；但 `ui-copy` 四端单源对 web 不成立（已实漂移一处）、`$` 技能菜单是死入口而工单 10.5 已勾、L.6 环影 10 处字面量复制 | `ui-copy` 下沉自报 GLM-5.3-Flash；web 三份平行实现与 10.5 勾选自报 **Qoder**；DSH 三批自报 GLM-5.3-Flash |

## 3. 三个系统性问题（这才回答"能不能长期迭代"）

### S1 这些代码从未被执行过，而且有一条完整的证据链

单条 bug 不说明问题；四条独立同类证据说明的是**流程**问题：

1. `computer/macos.ts:105` 命令名拼成 `screapture`（正字 `screencapture`），**错字被 `doc/02`、`doc/08`、`ARCHITECTURE.md` 一字不动复读 5 处**。只有"从代码往文档抄、且任何一端都没跑过"才会这样传播。
2. `lsp-installer.test.ts:5` 头注声称"CI 真跑需 `SPARK_TEST_REAL_LSP=1`，见文末 skipIf 用例"——**该文件 120 行，唯一的 `skipIf` 字样就在注释自己这一行**，文末是清单形状用例；`SPARK_TEST_REAL_LSP` 全仓命中 1 次（就是那行注释）。注释制造了"有真跑通道"的假象。
3. `5935505`（19.3 主提交）把 `bashPersistent: false,` **同键写进 `config.ts` 两行**，`c7969ae` 的提交标题自陈原因："符号链接扫尾误插"。即：脚本化批量编辑在无关文件里误插，且提交者未察觉——这正是 `check_doc_links.py` 那类"逐处断言命中"教训（doc/10 v1.4 已写过"脚本化批量编辑必须逐处断言命中"）在代码面的重演。
4. `mcp.test.ts:470-483` 是 19.4 唯一触达 `connect()` 的断言，三条断言（`registry.size===0` / `connected:false` / `command===url`）**在 http 分支被整个删掉时同样全部通过**——绿灯不代表能力存在。

**修法方向**：把"执行面"从可选变必填。具体见 LA-01、LA-02、LA-20。CI 已经是 ubuntu runner 且**已经装了** `typescript-language-server`（`ci.yml:43-47`）、`lsp.test.ts:301` 已经在真实执行它——仓库里既有同款 `skipIf` 判例，零成本即可补真跑通道。

### S2 "AI 实现 + AI 自己回填勾选 + 无第三方对账"= 虚报没有对手

- `doc/08:2734` 的 19.1 产出条款写「截图/屏幕内容一律走既有工具输出管线**进模型上下文**」；实现 `tools/builtin/computer.ts:9-11` 写「截图图片本体**不进对话上下文**，输出只带文件名与字节数」。两条**正相反**，而工单已勾 ✅。后果不是文档瑕疵而是功能缺口：模型拿不到像素，`computer.ts:104` 又要求"坐标应来自 computer.screenshot 的画面"，于是 click/type/key 实际无法自主使用——**computer-use 没有感知闭环**，而拍板①是"按完整 computer-use 立项，不做残缺档位"。
- `doc/02:2831`（v4.76）与 `doc/08:31`（v1.62）均写「设置中心占位页余 0」；实际 `settings-pages.ts` 的 `onboarding` 条目仍是 `status:'placeholder'`，消解它的工单 **19.15 至今 ⬜**。
- 计数漂移无闸：`Transport` 接口实数 **74** 个方法（两组独立计数 74/75，差在是否计入 `dispose`），`official/src/app/features/page.tsx:99` 与 `doc/08:2776` 都写 **67**。`check_doc_links.py` 只锚定"事件词表种数"与"参考速查表条数"两个计数（AGENTS §4.1），方法数这类**不在锚定范围内的数字必然漂**。
- 反过来也要如实说：**证真的部分不少**。事件词表实数 27 = 声称 27；命令描述符实数 24 = `commands.test.ts:49` 基线 = 声称 23→24；19.10 的原子写与"多 contender 并发不撕裂"经复核设计成立；19.3 的设置项热生效链路（`engine.ts` config 整体替换 + 未误入 `SETTINGS_RESTART_REQUIRED`）逐环节接通。虚报不是普遍现象，集中在**"消解/真落地/清零"这类无法用编译器和 linter 证明的措辞**上。

### S3 能力升级了，安全边界没有跟着升级

本轮新增的三类能力都跨过了原有边界的适用范围：

| 新能力 | 原有边界 | 缺口 |
| --- | --- | --- |
| 项目级审批规则可被一键写入 `<cwd>/.spark/permissions.json`（19.9） | 信任模型按 cwd 祖先链判定（trust.ts），收紧集只有 `shell.exec`/`mcp.call` | 见 §4.1（P0） |
| 引擎按清单 `npm install -g` 装并执行第三方代码（19.5） | 引擎铁律"改动文件系统/执行外部命令走审批链" | 该写接口零审批零确认，见 §4.5（P0） |
| 电脑控制八操作（19.1/19.2） | 同上 | `computer.use` 不在收紧集；`computer://app` 一个 resource 同时覆盖"列进程"与"启动任意程序"，见 §4.1 |
| MCP http 承载 Authorization 头（19.4） | 密钥纪律 = secrets 仓 0o600 + 统一脱敏 | `mcp/config.ts:79` 写盘**无 mode**（缺省 0644），且 url/userinfo 走明文回显通道 |

## 4. 分单发现

> 严重度：P0 = 安全/数据破坏/能力根本没实现却声称已实现；P1 = 正常使用即触发的真实缺陷；P2 = 健壮性与边界缺口；P3 = 可维护性与可迭代性。

### 4.1 19.9 + 权限子系统：**项目级规则可覆盖用户 deny，且写入点与被审批的仓库是同一个**（本报告最高优先级）

链条闭合，每一步都有直接证据：

1. `[读码]` **这是规格明文而非实现意外**：`doc/02:1271`「优先级合并：会话临时（always 写入）**> 项目级 > 用户级** > 默认 ask」。
2. `[读码]` `permission/rules.ts:45-52` 的 `evaluate` 把所有 ruleset 扁平化、**后匹配者覆盖** `verdict`；`permission/service.ts:91-98` 的层序实参是 `ruleStore.list()`（用户）→ `projectRules`（项目）→ 会话 → 档位。故项目级压过用户级。
3. `[读码]` `config.ts:372-376` `loadProjectRules(cwd)` 直读 `<cwd>/.spark/permissions.json`，**装载前无任何 trust / 是否 git 仓 / 用户确认门**；`engine.ts:517` 无条件调用。
4. `[读码]` 形状闸门无效：`permissionsSchema` 对 action/resource 只要求 `z.string().min(1)`，`{"action":"*","resource":"**","effect":"allow"}` 合法通过。
5. `[读码]` 唯一的收紧门 `service.ts:101-102` → `trust.ts:93-95` + `trust.ts:29` `TIGHTENED_ACTIONS = new Set(['shell.exec','mcp.call'])`，且**只把 allow 降为 ask**。`fs.write`、`agent.task`、`computer.use` 均不在集内。

**后果**：一个不可信仓库自带 `.spark/permissions.json`，用户首次打开即得到全工作区 `fs.write` 零审批、子代理 `agent.task` 零审批，并能**覆盖用户自己 `~/.spark/permissions.json` 里的 deny**。写边界 `resolveInRoot` 只挡"不越 cwd"，而 `.git/hooks/pre-commit` 就在 cwd 内——下一次 git 操作即代码执行。`[推断]`（审批归零与路径边界两点为读码所得，hook 被触发的完整链条未实跑）。

**责任划分（如实）**：读取侧来自阶段三（`6e430d2` 引入 `loadProjectRules`，优先级规则同期入 spec），**这条 P0 不是 19.9 新造的洞**。19.9 的过错是：把该文件升级为"UI 一键可写、随仓库提交传播"的产品入口，而 D48（`ARCHITECTURE.md:482-486`）只登记了"落到项目文件"，**没有登记"项目文件进评估链的安全前提"**。

**同族缺陷（19.9 本单自有）**：

- `[读码]` **落盘绑 `defaultCwd` 而非会话 cwd，规则却进全局评估数组**。`engine.ts:537` 路径用 `this.defaultCwd`，`service.ts:209` 往共享 `projectRules` 就地 push，allow 级联 `service.ts:227-240` 遍历**全部会话**的挂起审批（对照 reject 级联 `:249` 明确按 `sessionId` 过滤）。而会话可以有不同 cwd（`engine.ts:654` `opts.cwd ?? this.defaultCwd`），web 也已开放选目录建会话。**在 cwd=项目B 的会话里点第四按钮，会把规则写进项目 A，并当场自动放行所有其他会话的挂起写请求**。而 `ApprovalCard.tsx:136` 的按钮 title 写的是「**仅当前工作区生效**」。
- `[读码]` **家目录当 cwd 时项目仓与用户仓是同一个文件**：`engine.ts:270` `root = deps.root ?? join(homedir(),'.spark')` → 用户仓 `~/.spark/permissions.json`（`:530-531`）；项目仓 `<defaultCwd>/.spark/permissions.json`（`:536-538`）。`defaultCwd === $HOME` 时**两路径逐字相同**，两个独立内存数组各自全量重写同一文件 → 静默丢规则；且"本项目总是允许"在此刻等价于"全局总是允许"。全仓无同路径守卫。
- `[读码]` **授权可给不可收**：`engine.ts:1051-1053` `listPermissionRules()` 只回用户层，`protocol` 的 `PermissionRuleDto` 无 `source` 字段 → 四端看不到也删不掉项目级规则；用户手删该 JSON 也无效（内存数组已 push 且无热重载），规则活到进程结束。对照自家正例：16.2 给 `AgentPresetDto` 补了 `source:'project'|'user'` 合成值。
- `[读码]` **声称的"无仓 fail-closed"在生产接线下是死支**：`service.ts:195-198` 仅当 `projectRuleStore === undefined` 才抛 `E_PERMISSION_SCOPE`，而 `engine.ts:536-538` 无条件 new 并注入；引擎侧根本没有"是否在 git 仓内"的判定（对照 arena 才做了 `checkIsRepo`）。`permission.test.ts:317` 那条用例的真实条件是"测试夹具没注入 store"（该文件 `:65` 注记自己写了）。且 `E_PERMISSION_SCOPE` **未进** `errors.ts` / `error-copy.ts`（grep 零命中）→ 对外落 500 `E_INTERNAL`，违反 AGENTS §1.1"错误码→HTTP 映射进 errors.ts 单源"。

### 4.2 19.2 / 19.1 computer-use

| 级别 | 发现 | 证据 |
| --- | --- | --- |
| P0 | macOS 截图命令名拼错，该操作必然失败；错字被三处文档复读 | `[读码]` `macos.ts:105` `run('screapture', ...)`（正字 `screencapture`）；`:4` 文件头同错；`grep -rn screapture doc/ ARCHITECTURE.md` = 5 处。且 `macos.ts` 的 `run()` 无 ENOENT→UNAVAILABLE 映射（`linux.ts:69-75` 有） |
| P0 | 「Wayland 不支持如实拒绝」零实现，纯文案 | `[读码]` `grep -rn "WAYLAND_DISPLAY\|XDG_SESSION_TYPE" packages/engine/src/` **零命中**；能力陈述见 `ComputerSettingsPage.tsx:102`、`CommandPanels.tsx:247`、`ARCHITECTURE.md:462` |
| P1 | 已 abort 的 signal 不拦执行：用户按停止后点击/键入仍会发生 | `[读码]` 三执行体 `grep -c aborted` = **0**（只注册 abort 监听器，无入口预检）；对照仓库既有惯例 `tools/builtin/browser.ts:34`。`[推断]` AbortSignal 对已 aborted 的信号不再触发后注册的监听器；interrupt 落在 `tool.started`→权限门→parse→execute 的 await 窗口内即触发 |
| P1 | 失败返回"看起来成功"（违反 §2.11 假状态与失败闭合） | `[读码]` `windows.ts:89` `[void][Cu.Native]::SetCursorPos(...)`、`:125` `[void][Cu.W]::SetForegroundWindow(...)` 丢弃 Win32 BOOL，脚本 exit 0，工具无条件 `return { ok: true }`。`SetForegroundWindow` 有众知的焦点权限限制、坐标越界与 UIPI 阻挡均返回 false |
| P1 | 无感知闭环 + 与工单卡条款相反 | 见 §3 S2 首条 |
| P1 | `computer://app` 单一 resource 同时覆盖"列进程"与"启动任意程序" | `[读码]` `tools/builtin/computer.ts:199-210` `resourceOf` 不随 `input.action` 分叉，同文件 `:204` 自己写着"启动任意程序是高敏感操作，缺省逐次审批"；`service.ts:191-224` 会把"总是允许"固化成 `computer://app` 持久规则。`computer.use` 亦不在 `trust.ts:29` 收紧集 |
| P1 | macOS 的"零注入面"声称放错层（当前不可利用） | `[读码]` `macos.ts:116` `click at {x, y}`、`:141` `keystroke ${JSON.stringify(input.key)}${mods}`、`:162` `whose name contains ${JSON.stringify(...)}` 三处把值拼进 **AppleScript 源码**，与文件头 `:5`"参数一律走 argv，注入面为零"自相矛盾。`mods` 来自 `:92-96` 的原样插入，今天只靠 `computer.ts:39` 的 `z.enum` 兜住；`EngineDeps.computerExecutor` 是对外注入点。`JSON.stringify` 的转义恰好被 AppleScript 接受 → **侥幸不炸，非零面**。另：`\n` 转义 AppleScript 不认 → 键入内容错（非注入） |
| P2 | 无 stdout/stderr 上限；`kill()` 不 await 不升级 | `[读码]` `windows.ts:177-182` / `macos.ts:64-69` / `linux.ts:63-68` 无界累加（`Get-Clipboard -Raw`/`pbpaste`/`xclip -o` 可返回任意大内容）；三处 kill 后直接 reject |
| P2 | 三份近乎重复的进程运行器已出现修复漂移 | `[读码]` `windows.ts:145-195` / `macos.ts:32-82` / `linux.ts:31-85`：ENOENT 映射只 linux 有、`stdinData` 只 mac/linux 有、超时常量与 shot 命名各写三遍 |
| P2 | 键入内容明文进 durable 事件流（IoGuard 只覆盖输出面） | `[读码]` `pipeline.ts:240` `tool.started{input}` 原样落盘、`permission/service.ts:120` `detail = check.input`；`IoGuard.apply` 只作用输出（`pipeline.ts:323-325`） |
| P3 | ADR 指错、陈旧文案、八操作清单四处硬编码、CLI 档位是死值、公共面未导出 | `[读码]` `windows.ts:2`/`computer.ts:2`/`engine.ts:442,473`/`tools-computer.test.ts:2` 写 "ADR D43"，实为 D44（D43 是 DSH 对话框）；`commands.ts` 声称"八操作审批档位"但 `ComputerPanel` 只调 `getSettings()` 从不读规则；`EngineDeps.computerExecutor` 可注入但 `ComputerExecutor` 未从 `@spark/engine` 导出（对照 `index.ts:70-74` 为 browserDriver 专门导出过） |

**测试评价**：`tools-computer.test.ts` 7 例是真断言（走真实 pipeline、断 action/resource/错误对/开关关闭时执行体零调用），但**约 730 行三平台真实实现零覆盖**，包括完全不需要 GUI 就能测的纯函数 `parseKv`/`parseProcessList`/`parseAppleList`/`parsePairs`；工单自写的验收项"resource 规则命中单测"未做（测试用 StubPerm 绕开 `evaluate`）。`screapture` 这类错误在任何一条命令名常量断言里都会被抓住。

### 4.3 19.3 bash 常驻 shell

| 级别 | 发现 | 证据 |
| --- | --- | --- |
| P0 | 新条目 spawn **不给显式 cwd** → 起在引擎进程目录 | `[读码]` `bash-pool.ts:119-123` `...(workDir !== null ? { cwd: workDir } : {})`；`builtin/bash.ts:162-166` 无 cwd 输入时传 `null`；对照独立 shell 路径恒传 `cwd: workDir`。911bd48 把 `null` 的含义从"回会话根"改成"保持当前"，但**首条目建立时** `null` 落到"不传 cwd"，子进程继承 Node 的 `process.cwd()`（从仓库根起 server 时 = Spark 自身源码根）。bash 命令不经 `resolveInRoot`，审批的 `cmd:` resource 也不体现目录差异 |
| P1 | 哨兵 `printf` **缺前导换行** → 输出无尾换行的命令一律挂到超时并杀掉整只 shell | `[读码]` `bash-pool.ts:136` 格式串只有尾随 `\n`；`:174-184` 按 `\n` 断行 + `:177` 锚定 `^__SPARK_DONE__${seq}_(\d+)$`。`[推断]` `printf 'x'`、`cat` 无末换行文件、`date +%s`、`basename`、Windows 原生程序 `\r` 进度条 → 哨兵粘在同一行匹配不上 → 全部输出滞留 `stdoutBuf` → 等满 120s → drop + 树杀 → 状态蒸发。7 个用例全用带换行的 `echo`，恰好绕开 |
| P1 | 哨兵可被命令自身输出命中（无 nonce、无独立通道） | `[读码]` `:136` 令牌是固定字面量 + `:135` 小整数自增 seq；命中即 `finish()` 并 `off('data')`。`[推断]` `echo __SPARK_DONE__1_0` / `cat` 含该行 / 构建日志回放即可让调用提前"完成"拿假 rc=0，残余输出在下一次挂 listener 时投递给下一命令 |
| P1 | AUD-02 已修的"执行期无界收集 + UTF-8 断字"在常驻路径**原样复现** | `[读码]` `bash-pool.ts:139` `chunks: string[]` 无上限、`:172` `b.toString('utf8')` 逐块解码；对照 `builtin/bash.ts:231-260` 既有修复（`bound()` 前移 + `StringDecoder`）与其原文注释"此前 chunks 无上限，`cat 1GB.log` 全量驻留内存" |
| P2 | `drain()` 是死代码：主开关关闭、会话关闭、引擎 shutdown 都不排水 | `[读码]` `bash-pool.ts:92` 定义，全仓无调用方；`engine.ts` shutdown 序列收了 automation/permission/MCP/index/memory/search/lsp/browser/hooks，**无 bash 池**；池实例只被 `makeBashTool` 闭包持有 |
| P2 | 池按 key 而非按代次操作 → 过期定时器会杀同 key 的现役 shell | `[读码]` `:193`/`:202`/`:208` 均 `this.drop(key)`；`:166` 对已从表移除的旧对象仍挂 `setTimeout(() => this.drop(key), idleMs)` |
| P2 | LRU 逐出会打断别的会话**正在运行**的命令 | `[读码]` `:231-245` `evictIfNeeded` 只保护本次 key、`drop` 不看 `busy` |
| P2 | `proc.on('error')` 每次 run 累加；stdin 写入无错误通道 | `[读码]` `:214-218` 在每次 run 的 Promise 内加 listener，`finish()`（`:159-161`）只 off stdout/stderr/close；`:220` `stdin?.write(line)` 无 callback |
| P2 | 「命令 POSIX 单引号安全编码整行写入，零注入面」与代码不符 | `[读码]` 编码函数 `:45-47`（`'\''` 惯用法正确、且用 `replaceAll` 避开 `$&` 陷阱）**唯一调用处是 `:128` 的 cd 目标**；`:136` `${command}` 原样裸写。命令必须裸写才能被解释（既有语义），所以这句话本身不可能为真；真正新增的写入面（命令末尾 `\` 吞掉换行把哨兵并进自己的命令行、未闭合引号/heredoc 吞后续调用写入的行）反而没登记。见 `bash-pool.ts:5`、`ARCHITECTURE.md:468` |

**测试评价**：7 例是**真断言**（用真 `/bin/bash`、断具体字符串、断池内 `has()`、覆盖"缺省关=旧行为"回归基线），质量在仓库平均线以上。但覆盖面恰好绕开全部高危面：无尾换行、哨兵碰撞、超时、abort、逐出撞 busy、沙箱+常驻、heredoc/未闭合引号、输出上限与多字节跨块。`busy` 兜底分支 `:112-116` **从未被任何用例走到**（无证据代码）。另：用例 1 把 OS 原生路径喂给 `pwd` 输出比对，Windows/Git Bash 下必红，而 CI 只有 `ubuntu-latest` —— 该用例的平台假设永远不会被暴露。

### 4.4 19.10 arena 落盘（判定：真完成，缺口在故障面）

| 级别 | 发现 | 证据 |
| --- | --- | --- |
| P1 | 形状校验浅于消费面：**一个畸形文件能让整个历史端点 500**，"损坏跳过 fail-soft"名不副实 | `[读码]` `arena/store.ts:22-32` `isRecord` 只校 `run.arenaId`/`sessionId`/`status`；`manager.ts:261-262` 无条件 `run.prompt.length` 与 `run.contenders.map(...)`，而 `:252` 的 try 只包 `JSON.parse`+`isRecord`，map 在 try 之外，`engine.ts` 门面亦无 try |
| P2 | 三处空 catch、全类零 logger —— 命中 `ARCHITECTURE §9` 吞异常黑名单 | `[读码]` `store.ts:84-86`（解析失败跳过）、`:36-39`（stat 失败当最旧）、`:63-67`（remove 吞错）；构造只收 `root` 无告警出口。对照同仓纪律 `trust.ts:69` `loadTrustDoc(root, onError?)` —— 登记语写"fail-soft 同索引纪律"，但**该纪律带 warn 的那一半没抄** |
| P2 | `running` 记录重启后无人认领、永不愈合，且无删除/清理口 | `[读码]` `manager.ts:150` 发起即写 `running`；重启后 `runs` 表为空（`:101`），全仓无 boot 扫描改判；`dbe7959` 只加了 GET。web `UsageSettingsPage.tsx:480` 按 status 直渲 → 每次崩溃都留一条永久"进行中" |
| P2 | `prompt` 截断按 UTF-16 码元劈半；且**全文明文仍在盘上** | `[读码]` `manager.ts:261` `slice(0,100)`（落代理对中间留孤立半对 → U+FFFD）；写侧 `:150/:240` 落完整快照。"截 100 字"易被后人当"隐私已收敛"引用 |
| P3 | tmp 名固定 `${filePath}.tmp` → 跨进程双引擎互踩 | `[读码]` `fsutil.ts:9-24`。同进程内串行同步写、不撕裂（此点设计成立）；`store.ts:74` 的 `endsWith('.json')` 不收 `.tmp` 故残留也不清理 |

### 4.5 19.4 + 19.5（MCP http / LSP 下载器）

| 级别 | 发现 | 证据 |
| --- | --- | --- |
| P0 | **清单"版本 pin"名实不符 + 无脚本隔离 + 无确认的全局安装** | `[读码]` `lsp-servers.ts:28` `typescript-language-server@^4.3.0`、`:36` `pyright@^1.1.0`（pyright 周更）；`installer.ts:63` `spawn(npm, ['install','-g',...packages])` 无 `--ignore-scripts`/无 `--prefix` 隔离。`[推断]` npm 的 sha512 只保证"字节与 registry 元数据一致"，不保证版本可预期；`postinstall` 以用户身份执行任意代码。注：D47 与文件头**已写明是 caret**，故这属**设计判断偏松**而非虚报；要紧的是后续维护者会按"已 pin"的心智模型放松审查 |
| P0 | **无审批、无确认的"装代码+执行代码"写接口** | `[读码]` `readonly.ts:84` `POST /api/lsp/install` 无 trust/permission/确认环节；同类 `PUT /api/mcp`（`:44`）19.4 后仍可写 `command`（stdio 子进程）。项目对"执行外部命令"的一贯纪律是走审批链（`mcp.call` 缺省 ask、arena 的 `fs.write` 整批审批），这两个管理面完全在审批体系外。`[读码]` 边界要说清：非环回绑定下配对 device token 即可访问全 `/api` 数据面（`auth.ts:1-16`）；但浏览器 drive-by **实际打不通**（`errors.ts:116-135` 只留 `application/json` 与 `image/*` 解析器，简单请求拿到字符串会被 `z.strictObject` 400）。所以这条不是漏洞，是**缺少与能力等级相称的闸门** |
| P1 | 安装器真实分支零执行覆盖 + 头注指向不存在的用例 | 见 §3 S1 第 2 条 |
| P1 | **Windows 上安装链疑似结构性不可用** | `[读码]` `installer.ts:33` win32 用 `npm.cmd`、`:63` `shell:false` spawn；`:43` `spawn(command,['--version'])` 同理。`[推断]` Node 在 CVE-2024-27980 修复后拒直 spawn `.cmd`（本仓 `engines.node>=24` 必含），且 CreateProcess 不解析 PATHEXT → `probeCommand` 恒 false → 幂等跳过永不命中、装后校验恒失败 → `E_LSP_INSTALL_VERIFY` 且配置永不写入。AGENTS §4 明示开发机是 Windows，而 CI 是 `ubuntu-latest` 单矩阵，这条路 CI 永远照不到。**需 Windows 实测才能定论，列 [不可判]** |
| P1 | 失败指向不存在的诊断源，且在唯一拿到信息的地方把信息丢了 | `[读码]` `installer.ts:138` 文案"检查安装日志"，但 `onProgress` 在生产链上接的是空函数（`engine.ts:1498-1503` 缺省 `() => {}`，`readonly.ts:86`、`sdk/inprocess.ts:449` 都不传）；npm stderr 只保留**最后一行**（`:101-102`），且 502 走 `reply.code(502).send()` 不经 `sendError`，服务端零日志 |
| P1 | 超时收口不足 + 无并发去重，而清单里三个 id 共用同一 npm 包 | `[读码]` `installer.ts:68-74` 只 `child.kill()` 单次 SIGTERM、无 detached/进程组、无 SIGKILL 兜底；`install()` 无 in-flight 去重；`lsp-servers.ts:44/53/61` html/css/json 三包同名。`[推断]` 两个并发 `npm -g` 写同一前缀是 npm 已知冲突面；后写的 lsp.json 会静默吃掉先写的语言条目 |
| P2 | mcp.json 现承载 Authorization 头但写盘无 mode | `[读码]` `mcp/config.ts:79` `atomicWriteJson(join(dir,'mcp.json'), {...})` vs `secrets/store.ts:73` `{ mode: 0o600 }` → 缺省 0644 全局可读 |
| P2 | **对外契约未同步**：`openapi.json` 的 `PUT /api/mcp` 仍 `required:['command']` | `[读码]` 解析 `packages/protocol/openapi.json` 命中 `"required":["command"]`；`openapi-routes.ts:476-490` 的 properties 只有 command/args/env，无 `transport`/`url`/`headers`，`GET /api/mcp/config` 完全不在文档里。`doc/02:967` §5.1 配置形状规范行亦未更新。**CI 的 gen+diff 门禁会绿着通过**——因为生成物与源同步，只是源本身漏了字段，没有第二处真相可比对 |
| P2 | `superRefine` 混写拒载是单向的 | `[读码]` `mcp/config.ts:44-60` http 分支拒 command/args/env，**stdio 分支不拒 url/headers** → 半坏配置能落盘能载入，但 `StdioClientTransport` 不读它们；而 web 表单 stdio 模式隐藏这三字段、保存时按分支重建（`McpSettingsPage.tsx:152-162`）→ 任何一次编辑保存**静默删字段** |
| P2 | 写盘写"校验输入"而非"校验输出"，未知键被载入剥离、被保存删除 | `[读码]` `mcp/config.ts:77-80` `parseOrThrow` 返回值被丢弃后写 `config.servers` 原对象；内层是非 strict `z.object`。用户手写在 mcp.json 里的 `disabled`/`description` 等常见键会在第一次 web 保存时蒸发 |
| P2 | 唯一触达 connect 的测试是非判别性的 | `[读码]` `mcp.test.ts:470-483` 三条断言在 http 分支被删时同样通过（`manager.ts:66-68` 抛错被 `:167-172` 吞成同一个 `connected:false` + 同一个 `command=cfg.url`）。修法现成：SDK 自带 `StreamableHTTPServerTransport`，起环回 echo server 即可正向断言工具真注册、header 真送达 |
| P2 | `url` 无协议/主机校验，而同一仓库已为同一威胁模型写过守卫 | `[读码]` `voice/ssrf.ts:73-101` `assertPublicUrl`（其头注理由是"端点来自用户可写的 models.json"）；`mcp/config.ts:38` 只有 `z.string().url()`，`zod` 不排斥 `https://user:token@host` 这种 userinfo → 经 `manager.ts:161` 明文回显在管理页。要紧的是纪律一致性 |
| P3 | 红线在写路径上破了；`as` 断言把新字段从类型里抹掉；mock 对等只做一半 | `[读码]` `McpSettingsPage.tsx:153` 无条件写 `transport` → 编辑老 stdio 条目会在用户文件里补出 `"transport":"stdio"`；`readonly.ts:55-58` 断言体无 transport/url/headers（运行时不坏，但"类型在撒谎"）；`mock.ts:1150` `installLspServer` 恒 `written:true`（幂等路径在 mock 不存在），`listMcpServers`/`getMcpConfig` 无 http 示例条目，e2e 目录 grep mcp/lsp 零命中 |

### 4.6 19.11 索引库管理 / 19.12 浏览器设置面

**19.11 = 部分完成（局部虚高）**；**19.12 = 部分完成**。两单都不是"没做"，但都不能算"完成"。三端点/三通道/真 SQLite 实现、`url:` 规则视图数据源真为 permission rules（非写死）、清理白名单不误删，均经复核成立。

| 级别 | 发现 | 证据 |
| --- | --- | --- |
| P1 | **`rebuild()` 的破坏性清表不满足它自己宣称的安全论证**：三条独立可达路径 | `[读码]` `search/store.ts:115-118` `clearAll()` 两条 `db.exec('DELETE ...')` 各成一个隐式事务、无 `BEGIN IMMEDIATE`；`session/scan.ts:62-67` 的 `catch` 把**任何** readdir 失败与"目录不存在=首次运行"混为一谈且无日志 → 清表已提交而扫描降级返空 ⇒ `rebuild` 返回 `{entries:0}`、HTTP 200、页面回显"重建完成：索引条目 0 条"。`[推断]` 两条 DELETE 之间被杀 ⇒ 条目全空但**水位表完整保留** ⇒ 装载点 `sync()` 判 `wm === lastSeq` 直接 return，该会话**永不再入索引**——即"JSONL 恒为权威故可自愈"的前提（水位同被清）在此路径不成立 |
| P1 | **browser 设置保存后回弹**：`getSettings` 读构造期冻结字段 | `[读码]` `engine.ts` 的 `browserSettings` 为 `readonly` 类字段、构造期归一化一次，而 `updateSettings` 只重载 `this.config` ⇒ `BrowserSettingsPage.tsx:30-35` 在 settings 变化时回播种 ⇒ 用户刚关掉的开关自己弹回去。同文件 agents/extensions 段读的是 live `this.config.spark.*`（写盘即反映新值 + `restartRequired` 标注），**browser 是唯一偏离者**；`McpSettingsPage` 对同族问题专门写了 `setRestartHint(true)` 且刻意不改状态（"禁假状态"），说明仓库已认定该形态是缺陷 |
| P2 | 降级态 `rebuild()/vacuum()` 返回零值 + 200 —— "禁假数据"只做到了 `stats()` | `[读码]` `indexer.ts:93,110` `if (store === null \|\| closed) return {entries:0}`；`store` 只在构造期 new，故页面黄条"重建动作可尝试恢复"（`IndexSettingsPage.tsx:96-97`）是空头承诺 |
| P2 | **清理文案对破坏性动作作虚假承诺**，且越界删电脑控制截图 | `[读码]` `BrowserSettingsPage.tsx:128`「当前会话已展示的截图不受影响——**产物按需重取**」——文件删了即 404（`readScreenshot` 返 null），无法重取；且 `shotsDir` 与 computer 截图同目录同命名（`engine.ts:425` + `computer/executor.ts:90`），名为"浏览器"的按钮连 `computer.screenshot` 产物一起删，而 `ComputerSettingsPage` 无清理入口。（同时确认：**路径逃逸面为零**成立——`SHOT_FILE_RE` 在拼接前校验，`readdirSync` 名不含分隔符） |
| P2 | `vacuum()` 前后度量口径与 `stats()` 不一致，WAL 下大概率"回收 X → X" | `[读码]` `store.ts:123-127` VACUUM **之后**未再做 `wal_checkpoint` 即 `statSync` 主库；`[推断]` 重写落在 `-wal` ⇒ 两次读数相同。且 before/after 只算主库、`stats.sizeBytes` 算三文件，页面两个数字互相矛盾。测试 `expect(after).toBeLessThanOrEqual(before)` 在**恒等**时也通过 ⇒ 即使跑过也测不出 |
| P2 | 清表/VACUUM/COUNT 全同步 SQLite，阻塞引擎主线程（所有会话 SSE 与审批计时一起停） | `[读码]` `store.ts:110,116,126`；`rebuild()` 只在 `await SessionStore.read()` 让出；`vacuumIndex()` 从 HTTP handler 同步调用 |
| P2 | **19.12 根因是配置形状建模不完整，不是零验证的必然产物**：同一形状重复 5 处（protocol strictObject / `.partial()` / `SparkConfig.browser` 手写内联带 `\| undefined` / engine 构造期归一化 / mock 再写一遍缺省），缺省值 `30_000` 散落 4 处 | `[读码]` 而**同批协议里已有正解先例**：`protocol/src/api.ts` 的 `SANDBOX_NETWORK_DEFAULTS` 注释直写"引擎归一化 / web mock 对等共用的单一来源"。照现形状加第 4 个字段 = 改 5 处，任漏即红；且沙箱段已在复制同一坏形状，**模式正在扩散** |
| P2 | D49 记"未知键剥离落默认（spark.json 全族口径）"，但 browser 用的是 strictObject 基座 | `[读码]` `api.ts` `BrowserSettingsSchema = z.strictObject({...})` → `.partial()`（partial 不改 catchall）；对照 engine 段有专用宽松基形故真"剥离"。`[推断]` 若成立，`spark.json` 把 `headless` 拼成 `headles` 会**拒引擎启动**，与 D49 相反且与同文件 engine 段行为分叉。`config.test.ts` 只测合法解析，此分歧零覆盖。**列 [不可判]**（需一条真跑用例判死） |
| P3 | UA/超时"清空即不生效"；两段式确认定时器无 ref（文件头自称"照 19.11 判例"实际没照）；mock 的 rebuild 让条目系统性变少且 `indexStats` 永不 `available:false`；两个新设置页零 web 测试（同阶段前例 `ComputerSettingsPage.test.tsx` 有） | `[读码]` `BrowserSettingsPage.tsx:40-56`（空串不提交）、`:150-153`（裸 setTimeout 不存句柄，对照 `IndexSettingsPage.tsx:31,36-50` 的 ref 写法）、`mock.ts:1143-1180` |

**测试质量**：`search.test.ts` 的 vacuum 用例是**真写且有效**的（200 行→删 50→体积非增 + 检索精确单命中；`c716b41` 把带空格查询词换成无空格唯一子串是**修对了**——原写法被 FTS 拆词静默放宽会让断言假通过）；`index-routes.test.ts` 走真 turn→JSONL→rebuild→复验；`browser-cleanup-routes.test.ts` 断言白名单外不误删。缺口与本节 P1/P2 一一对应：**无一条 rebuild 失败路径测试**、无 put→get 往返用例（所以"GET 回旧值"没被任何一层拦住）、无并发 rebuild、组件层零测试。

#### 19.12 修红链统计（"本机零验证"代价的完整样本）

| 提交 | 内容（自述） | 本 run 首个红 | 修的是谁的 |
| --- | --- | --- | --- |
| `b190f65` | 19.12 全量实现 | typecheck | — |
| `dc223a3` | 19.6 spike + 19.12 登记勾选（D49） | typecheck（纯文档提交，红照旧） | b190f65 |
| `a13c178` | browserCfg 改类字段 | typecheck | b190f65 |
| `fffbe44` | 测试导入补 `.js` | typecheck | a13c178 |
| `ab328e1` | mock 合并改逐字段 | typecheck | fffbe44 |
| `5a20899` | `prev.browser` 可选链兜底 | lint | ab328e1 |
| `7d368a1` | 删未用导入 | test | 5a20899 |
| `a68be5a` | `loadConfig` 透传 browser 段（**归位漏项**） | typecheck | 7d368a1 |
| `f8b7baa` | 宽松形 Partial + engine 归一化 | typecheck | a68be5a |
| `2a42726` | `SparkConfig.browser` 改显式宽松形状 | lint | f8b7baa |
| `90a7ae9` | 删未用类型导入 | test | 2a42726 |
| `171eeb2` | cleanup 夹具自建 shotsDir | ✅ green | 90a7ae9 |

**10 个后续提交 / 11 连红 / 约 3h50m**，红型分布 typecheck 7 / lint 2 / test 2，全链**同一会话自修自己 11 次**（提交信息里的"X 顺延"均指前一条同链提交）。19.11 链同构：`7e08b6b`→`a2c37fd`→`fa7a6b6`(**无独立 CI run**，与 `c40f3a3` 同 push 只触发 tip，故该修复从未被单独验证)→`c40f3a3`→`c716b41`→`748fc05`→`dc90b30`，5 连红。

要点：闸口是**串行**的（doc-links → typecheck → lint → knip → 生成物 → test → build），typecheck 会掩盖其后各闸，故"一次改动付 11 次红"是结构而非疏忽。这与 LA-11、LA-07、LA-10 是同一个问题的三个面。

### 4.7 引擎核心（阶段一~七主干 + AUD-01/02/04/05/06/07/10/11 整改批）

先说可信的部分：**未发现"文档声称修了实际没修"的虚报**，八张 AUD 单的核心机制经复核确为真修（AUD-01 的落盘闸、AUD-04 的 realpath + 目标不存在时解析最深现存祖先、AUD-05 的 LRU 含负缓存、AUD-07 三条各有单测、AUD-10 两种被测形态、AUD-11 的分级淘汰与 `onDurableOverflow` 断链通知）。`packages/engine/src` 内 `any` 0 处、`ts-ignore` 0 处、55 处裸 `catch {` **逐条带语义注释**（无吞异常空壳）。**但八张单里六张有同类残留**，且残留集中在同一个结构成因上：

> **横切不变量被实现在调用点而不是闸口。** `resolveInRoot` 被绕过 3 次、`redactSecretText` 修在 4 个调用点而非 `bus.emit`、错误码靠 `/^E_[A-Z_]+/` 从消息文本正则抽取——这三件事是同一个设计选择的结果，因此**必然随新增路径复发**。

| 级别 | 发现 | 证据 |
| --- | --- | --- |
| P1 | **`edit` 工具的字符串替换走 `String.replace`，`newString` 里的 `$` 序列被展开** —— 写入内容与模型请求不一致 | `[读码]` `tools/builtin/edit.ts:89-92`：`replaceAll` 分支用 `split/join`（字面量语义，正确），非 replaceAll 分支用 `before.replace(old, new)` → `$$`→`$`、`$&`→命中文本、`` $` ``/`$'`→匹配前后文本。写 Makefile（`$$var`）、shell 片段（`echo $$`）、正则替换串时**静默落错内容**，且 diff 由已损坏的 `after` 生成（`:95`），审批与回放都看不出来源。两分支口径分叉本身就是证据。测试无 `$` 用例。归属：**不确定**（初版 `57fd7c9` 阶段一，后经 AUD-03 批 `453cf03` 改动） |
| P1 | **成本熔断在真实 provider 路径上不可能触发**：`toPiModel` 把计价率全置 0 | `[读码]` `pi-gateway.ts:145` `cost: {input:0,output:0,cacheRead:0,cacheWrite:0}` → `toSparkUsage` 仅在 `cost.total !== 0` 时带 `costUsd` → `cost-tracker` 取 `?? 0` → `exceeded()` 恒 false。全仓 `Usage.costUsd` 唯一生产者就是这条链，而单测**从外部注入 usage**，所以测试永远看不到这个 0。同处硬编码 `maxTokens: 8192`（全仓仅此一处、无 ADR 登记）与 `input: ['text']`（与 12.2b 图像输入通道矛盾）。→ 7.7/H07 宣称的 P0 护栏在生产面**惰性**，属"假实现相邻"。归属：`toPiModel` 与 7.7 接线均自报 **Trae · GLM-5.3** |
| P1 | maxSteps 强制收尾与 abort 留下**悬空 toolCall**（无 completed 对、无 toolResult），失败闭合跨 turn 破裂 | `[读码]` `run-loop.ts:341-345` 已落盘含 toolCall 的 `assistant.message` → `:401-404` `finish='length'; break` 直接跳过 `runAll`；`:327-337` abort 路径同型。对照 `:356-393` 的 length 分支**显式补了** `tool.started` + `tool.completed{E_TRUNCATED}` + toolResult 回喂——即正确做法在同文件已有实现，只是两个分支没复用。`[推断]` 下一次请求上下文里有悬空 tool_use，Anthropic 系严格配对时后续整条会话不可用。属 AUD-07 同一缺陷类的未覆盖分支 |
| P1 | `forkSession` 的 OPEN_TURN 判定把"边界事件自身即 `turn.completed`"也判为未闭合 ⇒ **前端 fork 钮必失败** | `[读码]` `engine.ts`：`if (e.id === fromEventId && openTurns.size > 0) throw E_OPEN_TURN` **先于**对该事件自身的 add/delete 处理；而 `AssistantActions.tsx:19-20,42` 传的正是 `assistant.message` 的信封 id。唯一合法的 turn 末边界恰是被拒的那一类。`engine.test.ts:632-720` 三例只测了 `user.message`/`assistant.message` 边界，**从未测 `turn.completed`**。归属：引擎判定侧自报 **Trae · GLM-5.3**（阶段四 4.5）、前端边界侧自报 **Qoder**（10.4①）→ 跨两条线，**不完全确定** |
| P1→P2 | AUD-04 残留：**两条非工具路径绕过 `resolveInRoot`**，其中一处是词法前缀判定 | `[读码]` `engine.ts:1185` `if (!abs.startsWith(resolve(handle.meta.cwd)))` —— 纯词法，`cwd=/h/u/spark` 时 `/h/u/spark-notes/x` 判为"根内"，且完全不做 realpath，`writeFile` 跟随工作区内既有 symlink ⇒ 越界写（`relPath` 来自 contender worktree 的 git diff 清单）。另一处 `readFileSync(join(dataRoot,'attachments',file))` 只靠扩展名白名单，而 `file` 来自 durable `user.message.attachments`，**可含 `../`** ⇒ 任意 `*.png` 被读成 base64 注入模型上下文。归属：arena 写回自报 **GLM-5.3-Flash**（16.8）、附件读盘自报 **GLM-5.3-Flash**（12.2b） |
| P1 | AUD-01 的后遗症：`settle` 现在会抛，但四类调用方未接 | `[读码]` `permission/service.ts:144-149` timer/abort 用 `void this.settle(...)`；`dispose()`/`invalidatePending()` 的循环 await 抛出 ⇒ `doShutdown` 单个 try 内后半程（store flush/close、index、LSP、browser、hooks）**全部不执行**。全仓 grep `unhandledRejection` **0 处**，Node 24 缺省策略下 `void` 的拒绝即进程死亡。`[推断]` 一次磁盘 I/O 抖动的作用域从"这一笔审批"放大为"整个 server 进程 / 全部会话"，与 fail-closed 初衷相反。归属：**多人经手**（AUD-01 自报 Union Alpha；settle 骨架与 shutdown 自报 Trae · GLM-5.3） |
| P2 | AUD-06 残留：脱敏修在调用点而非单点闸口，且**事件面缺 secrets-store 值** | `[读码]` `run-loop.ts:162-164` 只用 `buildEnvPatterns()`（env 值），而 `resolveApiKey` 优先级是 **store > env**（`secrets/store.ts:81-95`）——真正随 Authorization 出网的那把钥匙最常来自 store；另有 `compaction.ts:164-169`、`checkpoint.ts:125-128` 两处 error 发射点根本不过闸口，且 `fallback-gateway` 会把链上**每个**模型的 provider 原文拼进一条消息。`SECRET_RE=/sk-[A-Za-z0-9]{20,}/` 也匹配不到 `sk-ant-…` 形状 |
| P2 | AUD-10 残留：**完整 JSON 但缺尾换行**的半写不被识别 ⇒ 续写粘连 ⇒ 下次 resume 静默丢掉两条已广播确认的事件 | `[读码]` `store.ts:192,242` `validBytes += byteLength(line) + 1` 假定每行以 `\n` 结尾；解析成功则 `tailTorn` 不置位 → `open(path,'a')` 拼在同一行 → 下次读时该行成"最后行且解析失败"按坏尾丢弃。`restoreSeq` 以截断后水位续号故无 seq 报错，只有一条 `store.tail.torn` warn |
| P2 | `/trust` 收紧作用在**终判之后**，把 `full-access`/`auto-edit` 档的 `shell.exec`/`mcp.call` 也静默压回逐次询问 | `[读码]` `service.ts:101-102` 的改写发生在 `evaluateAll` 之后，而档位规则排在层序最后（findLast 最高优先）⇒ full-access 的 `shell.exec/**` allow 也被改写为 ask；审计行记的是 `rule:preset`，与终判 ask 不一致 ⇒ 归因看不出是 trust 压的。DESIGN §13.E 的"完全信任"语义是明示放行。归属：16.4/ADR D37 自报 **GLM-5.3-Flash** |
| P2 | 单个坏会话文件使**会话列表静默截断**（异常被整圈 try 吞成"目录缺失=空列表"） | `[读码]` `session/scan.ts:76-105` 与 `:139-171`：`SessionStore.read` 在双层循环内，坏文件抛的 `E_SESSION_BAD_LINE`/`E_SESSION_SEQ_GAP` 落进外层 catch 当作"目录不存在"。fail-closed 的"拒载"在列表通道退化为"拒载即少报"，不告警不占位，而 boot 索引由该函数驱动 |
| P2 | 压缩失败无退避也无本 turn 短路 ⇒ 每 step 一次全量摘要调用，且该通道对成本熔断完全不可见 | `[读码]` `run-loop.ts:286-289` 阈值判定无"本 turn 已试过"位；`compaction.ts:164-170` 失败 emit error 后正常返回、投影不变 ⇒ 下一 step 同样成立；`cost-tracker.ts:6-7` 头注声明"压缩/标题 usage 不计"。`[推断]` compactionModel 被限流/无 key 时，一个 turn 可产生 `maxSteps` 次全文摘要而 D33 的 token 预算看不见 |
| P3 | 卫生束：`tool-outputs/` 溢写文件零回收（19.12 只清了截图）；`atomicWriteFile` 无 `fsync(tmp)` 即 rename、不继承目标 mode（可执行脚本 edit 后变 644）、`.tmp` 落在用户工作区并会被 checkpoint 的 `git add -A` 吸入快照；`settledRequests` 无界增长 ⇒ 超时结案的审批再答复被报成 `unknown`；reject feedback 记两次且与 `tool.completed` 间有微任务竞态 | `[读码]` 各对应文件 |

**可长期迭代性（引擎侧）**：`engine.ts` 实测 **2257 行**（本会话复核），而 `AGENTS.md` §1.1（v1.29 所写）仍记"1.6k 行级"——口径已失真约 40%；构造函数约 330 行、公共方法约 70 个、横跨 11 个语义域，且 19.x 仍在往里加透传方法（19.10 一个、19.11 三个、19.12 两个）。R-D"不再拆"的判决对**管理面透传**成立，但**装配面（constructor）与订阅器面**没有对外 API、纯内部时序，是可以无痛外拆的两块。模块分层（`session/`、`permission/`、`tools/`）与端口注入是可测性真的做得好的部分。

### 4.8 服务端与四端外壳 + 官网

**判定**：`apps/server` **真完成（偏扎实）**；`packages/sdk` + examples + skill-kit **真完成**；`apps/cli` **部分实现、有虚高**；`apps/desktop` **部分实现**；mobile/miniapp **部分实现（共享核最好、端侧最落后）**；`official/` **虚高**。

正面结论必须先记下，因为它决定报告的可用性：**9.1 鉴权面是全仓质量最高的部分之一**（`auth.ts:62-71` 基于 `req.routeOptions.url` 判定故免疫 `/%61pi/…` 编码绕过、token 只存 sha256 摘要、撤销即断 SSE、`redactTokenQuery` 防 `?token=` 进日志、非环回且无 devices.json 时 `ConfigError` 拒启动、`pairing.test.ts:276-382` 有百分号编码绕过等 6 类对抗用例）；**127.0.0.1 + 无鉴权缺省行为不变的红线守住**；**协议共享核纪律在 mobile/miniapp 守得最好**（两端真用 `createSessionPageController`/`applyEvent`/`SessionStreamCore`/`splitSseFrames`，零另写一份）；`routes/` 内无任何吞异常空 catch，`errors.ts` 是真单源。Electron 三窗全 `{contextIsolation:true, nodeIntegration:false, sandbox:true}` 且**无 preload 文件 ⇒ IPC 暴露面为零**。

| 级别 | 发现 | 证据 |
| --- | --- | --- |
| P0 | **官网把审批键位写反：教用户"按 4 拒绝"，实际授予项目级常允许** | `[读码]` 本会话直接核对：`official/src/app/quickstart/page.tsx:188-189` 写「1 允许一次 / 2 本项目总是 / 3 该用户总是 / 4 拒绝」；权威面 `apps/cli/src/hooks/use-cli-keys.ts:239-254` 实为 `1/y`=once、`2/a`=always(**用户级**)、**`4`=always(project)**、**`3/n`=reject**。2↔4、3↔4 互换。**这是全仓唯一一处把"收紧"操作变成"放宽"的用户可见面**，且 `check_doc_links.py` 不扫 `official/`，此类错误无硬门能拦。doc/10 WO-113② 只记作"四键 vs 三值"，**定性偏轻**。归属（自报）：该文案由 `415dc08`「官网收口」引入，自带版本行署 **`AI 编写：Qoder`**；被倒置的四键形态出自 19.9（`4f0764a`，自报 GLM-5.3-Flash） |
| P0 | 桌面壳"配置文件出现即自动续启"路径会把应用自己退出，或把 sidecar 变成孤儿 | `[读码+推断]` `desktop/src/main.ts`：`waitForFirstRunConfig` 内 `firstRunWin.destroy()` 后 `return true`，而 `destroy()` 必派 `closed` ⇒ 窗口计数归零触发 `window-all-closed → app.quit()`；此刻 `sidecar` 仍 `null`，`will-quit` 早退分支**不置 `quitting`** ⇒ 要么首启引导直接退出（承诺不成立），要么 `main()` await 续体先跑完 `startSidecar()` ⇒ **sidecar 成为无人回收的子进程，占端口与 `~/.spark` 单写者**。这是全新用户桌面首启的**唯一**引导路径；doc/10 v1.14 第四轮验收只确认了"引导页出现、不再 E_CONFIG 崩溃"，**未验证续启分支**。归属（自报）：RT3-01 登记行署 **GLM-5.3-Flash**；其前置 AUD-12 的登记行自陈"**AUD-08/09/12/13/14 由并行子会话执行、本会话复核**"——即壳侧方案是子代理产物经复核，风险权重应更高。竞态交错 **列 [不可判]** |
| P1 | CLI 每次按键重跑 boot：请求风暴 + 停留会话被强制跳走 | `[读码]` `use-resume-panel.ts:20-27`（`filtered` 以 `draft` 为 dep）→ `use-cli-actions.ts:293-308`（memo deps 含 `resumeFiltered`）→ `app.tsx:171` `useEffect(() => actions.boot(), [actions])` ⇒ 每按一个字符 3 个 REST 请求；且 boot 的失败重试链每次重跑**再挂一条独立定时器**（失败态下单调累积）。`use-cli-actions.ts:53-55` 无条件 `setActiveSession(最新会话)` ⇒ 用户切到旧会话后打一个字就被抢回并触发 since=0 全量重放刷屏。归属：memo deps 面在 16.2/16.4/16.5/16.8/19.5/19.9 **六次提交里被逐次追加**，**多会话累积、不完全确定** |
| P1 | 桌面进程生命周期三项在册缺陷一条未修（WO-107/108/109） | `[读码]` `main.ts` 全文 295 行无 `requestSingleInstanceLock`；`will-quit` 只 `child.kill()`（Windows=TerminateProcess，MCP/LSP/bash 孙进程全存活，且 server 侧优雅退出挂在 SIGINT/SIGTERM 上必不被触发）；`app.exit(1)` 旁路 will-quit。`[推断]` 双实例 = 两个引擎写同一批会话文件，是**数据正确性**问题不是体验问题。归属：三项均为骨架期遗漏（`fb00904` 阶段五 5.1，自报 **Trae · GLM-5.3**） |
| P1 | 服务端优雅退出第一步未兜异常，**单个坏 SSE 连接可让 shutdown 崩在半路** | `[读码]` `apps/server/src/index.ts:97` `app.sseCloseAll()` 裸调用，`sse.ts:47-52` 的 `res.write/end` 未包 try/catch——而**同文件** `:113-119` `onDurableOverflow` 对完全相同的 `res.end()` 包了 try/catch 并注「连接已毁：close 回调统一收尾」。即作者知道会抛，只在背压路径上兜了。信号回调抛出未捕获异常 ⇒ `app.close()` 与 `engine.shutdown()`（interrupt 收尾 + 全量 fsync）永不执行 |
| P1 | 官网代码窗复制出的文本**缺全部代码行**，示例又调不存在的方法 | `[读码+本会话复核]` `ProtocolSection.tsx:77-92` 只下钻两层，`l0/l2/l4` 是 `React.Fragment` ⇒ 对 span 元素 `typeof child === 'string'` 恒 false，复制结果只剩注释行；`:45-46` 渲染 `client.events.onEvent(...)` 而真实面是 `sdk/src/client.ts:61-72` 的 `subscribe`/`replay` ⇒ 复制即 TypeError。**这是"开发者区"唯一可复制代码样例，复制本身就是该模块卖点**。归属（自报）：批次 D/E（`72e47bf`/`ced3b77`）署 **GLM-5.3-Flash** |
| P2 | 会话图片附件既不归属会话也永不清理，**删除会话后图片仍可取** | `[读码]` `routes/sessions.ts:273-278` 平铺写 `~/.spark/attachments/<uuid>.<ext>` 无 sessionId 关联；`deleteSession`（`engine.ts:831-856`）只把 JSONL 移进 `trash/`，全仓无 attachments 清理站点。12.4 两段式删除以"可找回"为隐私承诺，附件是这条承诺的漏洞面 |
| P2 | mobile/miniapp 端侧装配**落后于自己的头注**，并有一处免责声明方向反了 | `[读码]` `SessionsScreen.tsx:7` 头注称"刷新/**聚焦时刻** REST 快照"，但全 `apps/mobile/src` grep `useFocusEffect\|isFocused` **零命中**；miniapp 同样挂载一次、无 `useDidShow`。更糟的是 `:35/225/259` 把「已归档」标为"无后端支撑（V2-23）→ 置灰禁用 + v2 可用"，而 `PUT /api/archive` 与 `listSessions?archived=` 在工单 **12.4 早已落地**、`Transport.archiveSession` 在接口面上。**这不是占位诚实，是告诉用户"不存在"的能力其实存在** |
| P2 | 桌面通知自写一份 SSE 解帧，绕开 protocol 的 `splitSseFrames`（§1.1 漂移） | `[读码]` `notify-wiring.ts:10-21,74-110` 本地切帧，而单源件在 `transport-node.ts:122`、miniapp 已在用；`apps/desktop/package.json` dependencies **无 `@spark/protocol`**。桌面壳跑在 Node 环境、workspace 内零外部依赖 ⇒ 不构成"平台被迫"。`stop()` 亦全仓无调用方（`main.ts:260` 丢弃返回句柄） |
| P3 | `PUT /api/mcp` 用 try/catch 把**写盘失败一律降级成 400 校验错**（全 server 唯一一处 catch 后改码）；`apps/cli/package.json` description 仍写 **"Ink v6"** 而 dependencies 是 `ink: ^7.1.1`（AGENTS v1.29 已把文档措辞改成 7）；`replyPermission` 节选缺 19.9 新增的 `scope` 第 4 参 | `[读码]` `readonly.ts:44-66`（ENOSPC/EACCES 与 zod 失败落同一分支，用户看到"参数校验失败"却怎么改都不对）、`apps/cli/package.json:6`（本会话核实）与 `:40` |

#### `doc/10 §15` 前端五端工单库（WO-099~114）真伪逐条复核

用户怀疑"AI 可能编了工单"。本组实际读到代码后复核：**16 条无一条编造**——13 条完全属实、2 条部分属实、0 条不属实。其中 WO-103 描述的多数触发路径不可达（`InputBox` 提交时已先清空 draft，`?` 又被 `draftPreview === ''` 闸门挡住），WO-113② 定性偏轻（实际是键位值全错位，见本节 P0）。

这是一条应当如实记录的正面结论：**这份工单库质量高于本仓平均水平，可信赖**（立单者：`doc/10` v1.18，自报 GLM-5.3-Flash）。

### 4.9 协议共享核 + Web 前端

**判定**：`applyEvent` reducer 是**全仓最结实的一块**；`ui-copy` 单源纪律**对 web 不成立**；DSH 三批"照抄规格"是**数值真、工程化假**。

先立两件可信的事：① **web 的"事件流唯一状态源"守住了**——`apps/web/src` 除 `transports/` 外零 `fetch`/`XMLHttpRequest`/`axios`，会话流状态只经 `stores/session.ts:46` 的 `applyEvent` 写入，回滚走 `resetSlice` + 全量重放、无局部乐观修补；② **reducer 测试不是走过场**——`applyEvent.test.ts` 51 例覆盖 27 种词表无一遗漏，且测的是交错发射序、迟到 delta 拦截、aborted 失败闭合清扫（注释里带着成因）、回放同 seq 吸附，以及 WeakMap 索引缓存的三个难点（miss 全量重建 / copy-on-write 分叉安全 / 跨 turn 不串扰）。这一层确实撑得住改 UI 的信心。

| 级别 | 发现 | 证据 |
| --- | --- | --- |
| P1 | **审批回复失败被 `void` 吞掉，且 resolved 回显把 wire 枚举印进中文文案（与两端已实漂移）** | `[读码]` `MessageItem.tsx:158-160` `function onReply(...){ void transport.replyPermission(...) }` 无 `.catch`、无 busy 态、无错误呈现；`ApprovalCard.tsx:122-148` 四按钮点击后不禁用 ⇒ `E_ALREADY_RESOLVED`（双击）或 REST 失败时卡片**原地停在 pending、零反馈**。同时 `:61` `审批已{...}（{reply ?? ''}）` 把 `'once'`/`'always'` 原样打给用户，`:157` 硬编码 `已拒绝（reject）`；而单源函数 `ui-copy.ts:43-48 approvalResolvedText` 返回「已允许本次/已始终允许/已拒绝」，`mobile/miniapp` 的 `session-items.tsx:338` **都在用它**。`[读码]` 归属：**多人经手不确定**（`replyPermission` 形态源自阶段二 `a1acf99`，第 4 枚按钮 19.9 加入自报 GLM-5.3-Flash，ui-copy 未采用应记 R-B 下沉批） |
| P1 | **审批是该产品唯一能改用户磁盘的闸门，其回执静默失败** | 上一条的定性：这是本次审查里唯一可能构成**安全语义**问题的前端条目——最坏后果是用户以为已拒绝而引擎仍在挂起（或反之）。违反 ARCHITECTURE §9 吞异常黑名单、引擎铁律"失败闭合"、DESIGN §5 异步动作必须有反馈 |
| P1 | **「使用 $ 选择技能」是死入口按钮，而工单 10.5 已勾 ✅ 且勾文点名了它** | `[读码]` 本会话复核：`Composer.tsx:744` `{ icon: DollarSign, label: '使用 $ 选择技能', run: () => insertTrigger('$') }`，而 `composer-menus.ts:20` 的 `kind` 闭合为 `'at' \| 'slash'`、`detectMenu` 无 `$` 分支、`ComposerMenu` 只有两个渲染分支、`features/chat/` 下 `listSkills` 零调用 ⇒ **看得见、点得动、有图标有说明，按下去只插一个 `$` 字符**。`doc/02` v3.33 勾选行明写「⑤ Composer + 菜单四项（附件/@///$）」，署名 **`AI 编写：Qoder`**。同类：`ComposerMenu.tsx:91-92` 底注承诺"搜索文件**或技能**""命令、**技能或子智能体**"（均无该分组）、`:85` 指向 DSH 三批已撤除的"工具条「文件树」"。**比置灰更坏——置灰至少诚实** |
| P1 | **`ui-copy.ts:8` 头注称"四端一律从 @spark/protocol 导入"，对 web 不成立** | `[读码]` 实际消费者只有 mobile/miniapp（13 处 import）；web 仅用 `CONNECTION_TEXT`、`COPY_TEXT` 两项，`toolStatusText`/`turnDurationText`/`approvalResolvedText`/`severityOf` 在 web **各有一份平行实现**（`ToolCard.tsx:108-115`、`lib/time.ts:17-20 formatTurnDuration`、`MessageItem.tsx:177-181`、`ApprovalCard`）。其中 `formatTurnDuration` 与 `turnDurationText` **函数体当前逐字相同**（尚未漂），`approvalResolvedText` **已经漂了**（web「已允许（once）」vs 远端「已允许本次」）。这正是 AGENTS §1.1「某个端里另写一份 = 制造漂移」的教科书样本；DESIGN v2.18 早写过"web 侧迁移记后续对账"，这笔债至今未还且**不在阶段十九 42 单里** |
| P1 | **L.6「去格子线」做成了 10 处字面量复制而非 token** | `[读码]` 同一段 `0_0_0_0.5px_rgba(0,0,0,0.12),0_3px_8px_…` 逐字出现在 `ComposerMenu`/`Composer`×2/`DeliveryPicker`/`EffortPicker`/`FileTreePopover`/`FolderPicker`/`ModelPicker`/`PermissionTierMenu`。对照：L.6 对**滚动条**明确写了"单点维护在 `styles/theme.css`、组件禁写局部滚动条样式"**并真落实了**（`theme.css:136-149` 组件侧零命中）；对环影没有同等裁决。归属（自报）：DESIGN v2.20/v2.21/v2.29 三行均署 **GLM-5.3-Flash** |
| P1 | **MockTransport 的静默成功使最新两批用户可见功能在 mock/e2e 通道完全不可验** | `[读码]` `mock.ts` 的 `updateSettings` 合并清单缺 `agents`/`extensions` 却 Promise 成功 resolve ⇒ `SubagentsSettingsPage` 拨开关"成功"→重取→弹回、零报错；`createSession()` 无参 ⇒ DSH 三批的文件夹 chip 选了等于没选；`sendMessage(_sessionId)` 单参 ⇒ L.8 提交模式 steer/queue 语义永不体现；`replyPermission` 第 4 参 `_scope` 显式忽略 ⇒ **19.9 的项目级固化在 mock 下是空操作**。四实现的方法名齐备性经本组逐个核对为 **74/74 三方全在**（HttpTransport / Mock / sdk inprocess），**但"名齐而行为不等"才是对等纪律的真意**。注：`replyPermission._scope` **不在 19.22 十项清单内**（19.9 晚于清单编制），属未登记缺口 |
| P2 | **`HttpTransport.openSessions` 只增不减** ⇒ 每次断线重连把用户本次生命周期里翻过的**每个**会话全量重放（N 个并发 REST + N 次 `resetSlice`），已删会话重放必 `E_NOT_FOUND` | `[读码]` `transport-node.ts:224-225` 只 `add`、全文件无 `delete`、`deleteSession` 不回收。`session-stream-core` 退避 1/2/5/10s 封顶 ⇒ 网络抖动期间反复触发；sidecar 常开挂机是典型场景。归属 **不确定** |
| P2 | **REST 无超时 + 回放无看门狗 ⇒ 一次卡住的 `getSession` 可永久冻结该会话 UI** | `[读码]` `transport-node.ts:230-252 req()` 的 fetch 无 `signal` 无 deadline（SSE 侧有）；`replay.ts:41-43` 进 `buffering` 后 `context.tsx:97-99` 把直播事件塞 `pending` 不写 store，`pending` 无上限，`load` 也不翻 error ⇒ **画面静止但没有失败提示**，最难排查的失效形态。归属 **不确定** |
| P2 | `SettingsPage` 用 `as keyof typeof READY_COMPONENTS` 拆掉了本该存在的编译期闸 | `[读码]` `SettingsPage.tsx:59-69`：`id` 是自由 `string`、`READY_COMPONENTS` 是 `as const`，二者无类型约束 ⇒ 改 `ready` 却忘挂组件时 **typecheck/lint/单测都不报**，运行时页头说这是功能页、内容区显示"尚未落地"（正落在"假状态"上） |
| P2 | Composer 内 4 处硬编码 hex 违反本仓自订规则 | `[读码]` `Composer.tsx:633/653/555`，而 `tokens.css:5` 头注第 5 条正是「禁止组件内硬编码 hex」，`:555` 抄的是 `tokens.css:77` 已定义的 `--user-bubble: #2c2c2e`。`[推断]` `#ADB2B8` 压白底约 2.1:1，远低于 §13.C 的 4.5:1；`theme-contrast.test.ts` 按 **token 对**生成断言，raw hex 不在枚举面 ⇒ 不达标不会让任何测试变红。注：DESIGN v2.21 的裁决是"placeholder 色值照抄 IB.css"，即**刻意所为**——要紧的是它该登记为豁免而非以组件里一个 `#hex` 存在 |
| P2 | 外观页「界面字号」对界面几乎无效 | `[读码]` 该变量只映射给 Tailwind `--text-base`，而 web 字号类实测 `text-xs`×270、`text-[13px]`×70、`text-base`×**2**——两者均不吃它。用户改这个下拉看不到变化，但值会持久化、会写 CSS 变量、会有"已生效"错觉 |
| P2 | L.8 新增两枚 chip 未接 L.6「弹层互斥」，六个浮层无 Esc 关闭 | `[读码]` `Composer.tsx:650` 只在 +菜单↔文件树间互斥；`FolderPicker`/`DeliveryPicker` 各自独立 `setOpen` 可与其它弹层叠三层；`useDismissOnOutsideClick.ts:16-25` 只订阅 `mousedown`。**同批内部自我不一致**（同批已给 @ 菜单接了互斥） |
| P3 | `startedAt`（为"运行中时长"专设的协议字段）在 web 断链；两处死分支；已翻案裁决仍以注释留在代码 | `[读码]` `apply-event.ts:65` 注为"运行中时长实时显示数据源"、CLI `rows/tool.tsx:23-29` 消费，而 `MessageItem.tsx:121-129` 只传 6 个 prop、`ToolCardProps` 无该字段 ⇒ web 运行态恒只有"运行中…"三字；`AssistantBlock.tsx:80-84` 的 `in N · out N` 不可达（`UiItem` 无 usage 字段）；`ArenaCard.tsx:5` 仍写"记录仅内存"而 19.10 已落盘翻案 D42；`composer-menus.ts:5-7` 仍写"技能清单接口未接入"而 12.5 已接；`error` 是 durable ⇒ 每次回放重弹历史错误 toast；`fatal: true` 一侧引擎**无任何写点**（只 `trace.ts:231` 读），ErrorToast 的整屏遮罩在生产路径不可达 |

**测试结构性缺口**：组件层 26 个测试文件 / 89 个源文件，`features/chat` 27 个组件只有 5 个有测试，DSH 三批新增的 `FolderPicker`/`DeliveryPicker` **零测试**，设置中心 19 个 ready 页只有 2 页有测试，e2e 只 3 个 spec 不含设置页写入路径。三处能便宜补上的结构缺口：① `ui-copy` 无"各端必须从 protocol 导入"的守护断言（P1 那条漂移能长期存在的原因就在这）；② L.6 环影无源码级一致断言（token 化后自然消失）；③ `SettingsPage` ready↔组件映射完整性无编译期约束。

要点（与 §3 S1/S2 呼应）：**上述缺口没有一条在 CI 里**——CI 跑的是既有测试的绿灯，而"既有测试覆盖面"这件事本身无人守。这是"本机零验证 + 薄组件测试"叠加后的净效果：**改 `features/chat` 的视觉与交互确实不会红**。

## 5. 归属台账与局限

### 5.1 数据从哪来

- **git author 对区分 AI 无信息量**：695 个非合并提交里 609 个 author 是 `Wanfeng1028|dingyu_1028@163.com`，其余为同一人的其他邮箱；仅 5 个 bot/assistant 身份提交（qwen.ai[bot]、openhands、jules、copilot-swe-agent、arena-ai-coding-agent、Doubao）。`Co-authored-by` trailer 只有 6 条 `traeagent`。
- 唯一可用来源是各文档顶部版本表的 `AI 编写：<工具> · <模型>` 行。台账脚本按"同一提交内新增版本行的署名"提取。

### 5.2 覆盖率与分布

- 版本表行约 **748** 条，其中带 AI 署名 **492** 条；可解析出工单/ADR 标识的条目 **284** 个。
- 按提交聚合：415 个提交（新增代码 **48,521** 行 = 全仓代码行的 **62%**）在同一提交内**取不到任何署名**。
- 可归属部分（同提交唯一署名）：`ZCode CLI · GLM-5.3-Flash` 9,341 行 / `Trae · GLM-5.3` 8,287 行 / `Qoder` 8,054 行 / `ZCode CLI · GLM-5.3` 1,125 行 / 多署名提交 2,948 行。
- 阶段十九：19.3~19.12 为单一署名 `ZCode CLI · GLM-5.3-Flash`；**19.1 两方、19.2 三方经手**（GLM-5.3-Flash / Qoder / GLM-5.3）。
- doc/10 系列：AUD-01/07/14、WO-015/052/063/065/067/070/071 → `ZCode · Union Alpha`；WO-087/089/095/097/098 → `ZCode CLI · GLM-5.3-Flash`。
- 阶段十二~十六多为 2~4 方经手（12.4、12.8 各四方）。

### 5.2b 本次点名到的具体归属（均为自报元数据）

| 发现 | 归属（自报） | 出处 |
| --- | --- | --- |
| 官网审批键位倒置（LA-42，P0） | **Qoder** | `415dc08`「官网收口」自带版本行 `AI 编写：Qoder` |
| 设置中心"占位页余 0"虚报（LA-27） | **ZCode CLI · GLM-5.3-Flash** | `doc/02:2831`(v4.76) / `doc/08:31`(v1.62) / `doc/08:2748` 三处同一署名 |
| `screapture` 拼错 + 三处文档复读（LA-06） | GLM-5.3-Flash（19.2 主提交 `e141f3f` 同批） | 提交信息与 doc/02 v4.65 行 |
| 幽灵测试通道 `SPARK_TEST_REAL_LSP`（LA-07） | GLM-5.3-Flash（19.5 `944fa84`） | `doc/08` v1.58 登记行 |
| 19.12 十一连红（形状建模，LA-22/23 邻） | **同一会话自修 11 次**：GLM-5.3-Flash | §4.6 统计表，链内提交信息互指 |
| 项目级规则进评估链的原始设计 | **归属不明**（阶段三 `6e430d2` 无署名提交，占 62% 不可归属部分）；把它产品化为可写入口的是 19.9 → GLM-5.3-Flash | LA-01/02 与 LA-03 的责任划分见 §4.1 |
| 引擎核心 P1（`edit` $ 展开 / 成本熔断惰性 / fork 边界 / shutdown 残留） | `edit` **不确定**（阶段一 + AUD-03 两改）；`toPiModel` 与 7.7 自报 **Trae · GLM-5.3**；fork 两侧 **Trae · GLM-5.3 + Qoder** 跨线；AUD 批自报 **ZCode · Union Alpha** | `doc/02` v2.11/v2.13/v2.20/v3.32、`doc/10` v1.3 |
| 桌面骨架三项（单实例/树杀/exit 旁路） | **Trae · GLM-5.3** | `fb00904` 阶段五 5.1，AGENTS v1.16 同批 |
| AUD-12 壳侧方案（子代理执行、主会话复核） | **ZCode · Union Alpha**（该行自陈"AUD-08/09/12/13/14 由并行子会话执行"） | `doc/10` v1.3（`2573fad`） |

**必须一起读的一句**：上表能定位到工具的，都是"该提交里有人这么署了名"。其中 `doc/10` v1.3 那一行同时说明**部分代码由子代理产出、由另一会话复核采纳**——这类出处的缺陷风险权重应更高（本报告的 19.4 与 AUD-12 两例均属此类，且都是主会话复核时才补完/才暴露问题）。

### 5.3 三条必须一起读的局限

1. **自报，非取证**。署名由执行会话自己填写，本审计只能证明"该提交里有人这么写了"，不能证明代码确由该模型产出。历史上已出过一次署名勘误（AGENTS v1.15：v1.14 误照抄历史行署名，此后规定"只署当前会话可确证标识"）。
2. **284 个标识里有大量"多方经手"**，这些票的缺陷**不可归给单一模型**。本报告凡遇多署名一律写"多方经手"。
3. **62% 的代码行落在无署名提交**。因此"谁写得不好的"这个问题，能回答的范围是**阶段十一之后的工单级归属**，阶段一~十基本只能到"归属不明"。

## 6. 整改工单

> 编号 LA-01 起（Landing Audit）。只收 §1.4 复核后仍成立的条目。执行纪律照 AGENTS §2 与 `.agents/skills/*/SKILL.md`；本表不含工时估算。

### 6.1 安全（先做这五张）

| # | 内容 | 落点 | 验收 |
| --- | --- | --- | --- |
| LA-01 | **项目级权限规则加信任门**：`loadProjectRules` 装载改为 trust 判定参与——未 trusted 的 cwd 下项目层整层不进评估（或整层降 ask），装载时发一条 warning + 审计行"读到 N 条项目规则" | `engine/src/config.ts:372`、`engine.ts:517`、`permission/service.ts:91-98` | 单测：不可信 cwd + 仓内 `allow **/**` → 仍 ask；trusted 后生效；装载条数进审计流 |
| LA-02 | **收紧集扩容并消除 deny 覆盖**：`TIGHTENED_ACTIONS` 纳入 `fs.write`/`agent.task`/`computer.use`；同时重做 `evaluate` 层序，使**用户 deny 不可被项目 allow 覆盖**（deny 优先级高于 last-match-wins），并同步 `doc/02:1271` 规格与 D48 | `permission/rules.ts:45-52`、`service.ts:101-102`、`trust.ts:29`、`doc/02:1271` | 正反用例各一条（项目 allow 覆盖用户 deny 必须判 deny）；规格行与代码一致 |
| LA-03 | **审批作用域三处纠错**：① 落盘与级联按**会话 cwd** 而非 `defaultCwd`（`Map<cwdKey,{store,rules}>`，级联按会话 cwd 过滤）；② `defaultCwd === home` 时同路径守卫（不注入 project store）；③ `E_PERMISSION_SCOPE` 进 `errors.ts`+`error-copy` 或删守卫并改文案 | `engine.ts:536-538`、`service.ts:195-240`、`errors.ts` | 跨会话用例：B 会话点第四按钮不得影响 A/C 的挂起审批；$HOME 场景用例；HTTP 形状断言（不得 500 E_INTERNAL）；ApprovalCard title 文案与实际语义一致 |
| LA-04 | **项目级规则可查看/可撤销**：`PermissionRuleDto` 增 `source`，`listPermissionRules` 合并两层并打来源，删除口接受 scope，项目文件变更后热重载或标 `restartRequired`（照 16.2 判例） | `engine.ts:1051`、`protocol/api.ts`、`routes/permissions.ts`、web 规则页 | 四端能看见并删掉项目规则；DTO 契约用例重跑 |
| LA-05 | **装/换可执行代码纳入审批链**：`POST /api/lsp/install` 与 `PUT /api/mcp`（stdio command 变更）在非环回来源时要求一次引擎内审批（复用 PermissionService，fail-closed 超时拒），或至少 DTO 要 `confirm:true` 且响应回显将执行的完整命令 | `routes/readonly.ts:84,44`、`permission/service.ts` | 非环回来源无审批即 403；环回缺省行为不变（红线）；`computer.use` 亦补 trust 收紧 |

### 6.2 补"从未执行过"的账（成本最低、收益最高）

| # | 内容 | 落点 | 验收 |
| --- | --- | --- | --- |
| LA-06 | 修 `screapture` → `screencapture`，并**清掉三处文档复读的错字**；三平台 `run()` 的 ENOENT 归类抽公共实现 | `computer/macos.ts:105,4`、`doc/02`、`doc/08`、`ARCHITECTURE.md:462` | 一条常量断言测试：每个平台执行体用到的可执行文件名集合封闭且拼写正确 |
| LA-07 | 兑现或删掉 `SPARK_TEST_REAL_LSP` 通道：CI ubuntu 已 `npm install -g typescript-language-server typescript`（`ci.yml:43-47`）且 `lsp.test.ts:301` 已真实执行该命令，照 `lsp.test.ts:314` 判例补一条 `skipIf` 真跑用例（不注入 probe，断言"已装→跳过 npm→lsp.json 形状"）。头注不得指向不存在的用例 | `engine/tests/lsp-installer.test.ts` | 用例存在且 CI 真跑；`ARCHITECTURE §9` 幻觉防御自查 |
| LA-08 | computer 三执行体的**纯函数补测**（零 GUI 依赖）：`parseKv`/`parseProcessList`/`parseAppleList`/`parsePairs`/`clickButton`/`keyArgs`/工厂三平台路由/`UnsupportedComputerExecutor` | `computer/*.ts` 对应 tests | 括号污染（`macos.ts:189-202`）一测即现；工厂路由覆盖 |
| LA-09 | 常驻 shell 补测四场景：输出无尾换行、哨兵碰撞、超时 kill、逐出撞 busy；删掉 `busy` 兜底分支或补可达用例（现为无证据代码） | `engine/tests/tools-bash-persistent.test.ts` | 四场景各有断言；平台假设不锁死（现用例 1 在 Windows 必红但 CI 只有 ubuntu，故永不暴露） |
| LA-10 | MCP 补一条**正向环回 http 用例**（SDK 自带 `StreamableHTTPServerTransport`，零新依赖），断言工具真注册 + 服务端收到自定义 header；现 `mcp.test.ts:470-483` 三条断言非判别性 | `engine/tests/mcp.test.ts` | 把 `defaultTransport` 的 http 分支删掉必须让该用例红 |
| LA-11 | 禁止脚本化批量编辑跨文件误插：改 `AGENTS.md` §2 或在 `scripts/` 加自检——批量替换必须逐处断言命中且断言目标文件属于本次变更集（doc/10 v1.4 已有同款教训，现只覆盖文档不覆盖代码） | `AGENTS.md` §2 或 `scripts/` | 有一条可执行闸；`5935505` 类重复属性事故能在提交前被抓 |

### 6.3 bash 常驻 shell 功能面

| # | 内容 | 落点 | 验收 |
| --- | --- | --- | --- |
| LA-12 | 新条目 spawn 显式用会话 cwd（`null` 只表示"不切换"，绝不表示"不设起始目录"）；条目存 `homeCwd` 供诊断 | `bash-pool.ts:119-123`、`builtin/bash.ts:162-166` | 无 cwd 输入的 `pwd` 断言等于会话根 |
| LA-13 | 哨兵改带前导换行 + 每 shell 随机 nonce（或改走独立 fd `>&3`）；检测到疑似碰撞按 desync 弃 shell；无哨兵退出时冲刷 `stdoutBuf` 残段 | `bash-pool.ts:136,177` | 碰撞用例；`printf 'x'` 用例 |
| LA-14 | 常驻路径复用 AUD-02 收集器（执行期上限 + `StringDecoder` + close 冲刷）；`stdoutBuf` 加行长上限 | `bash-pool.ts:139-151,172` | 与独立 shell 路径同源一份实现 |
| LA-15 | `drop(entry)` 收对象 + `entries.get(key)===entry` 比对；已出池条目不挂 idle 定时器；`evictIfNeeded` 优先选非 busy；`proc.on('error')` 移到条目构造期；stdin `write(line, cb)` 加错误通道 | `bash-pool.ts:166-220,231-245` | 定时器杀错 shell 的时序用例 |
| LA-16 | 池接入引擎 shutdown 与开关关闭排水（`drain()` 现为死代码）；ADR D45 把"命令体裸写、未闭合引号/heredoc 后果"如实登记（删除"零注入面"表述） | `engine.ts` shutdown、`bash-pool.ts:5`、`ARCHITECTURE.md:467-468` | 排水有调用方；ADR 措辞与代码一致 |

### 6.4 computer-use 面

| # | 内容 | 落点 | 验收 |
| --- | --- | --- | --- |
| LA-17 | 三执行体入口加 `signal.aborted` 预检（照 `browser.ts:34` 惯例）；`kill()` 后 await `'exit'`，必要时升 SIGKILL | `windows.ts:172-176`、`macos.ts:48-59`、`linux.ts:47-58` | 已 abort 输入下执行体零调用断言 |
| LA-18 | 去掉 `[void]`，Win32 返回值进脚本判定并 throw → 显式错误码；`{ok:true}` 只在自报成功时返回 | `windows.ts:89,97,125,226-239` | 失败注入用例（SetForegroundWindow 返回 false） |
| LA-19 | `resourceOf` 按 action 分叉（`computer://app/launch` vs `/list`、`clipboard/read` vs `/write`）；macOS 统一 `on run argv` 传值（`type` 已是正解），修饰键改白名单查表 | `tools/builtin/computer.ts:199-210`、`macos.ts:116,141,162,92-96` | 档位差异化断言；"值不得进脚本文本"字符串断言锁住声称 |
| LA-20 | **感知闭环立项或如实登记限制**：要么补 `toolResult → image 内容块` 的投影通道（涉 protocol `ContentItem` + projector + pi-gateway，四端改动，须单独立项），要么在端口加无障碍树文本快照；同时把 `doc/02` 19.1/19.2 行的勾选改回并登记缺口 | `projector.ts:151-158`、`pi-gateway.ts:168,201-205`、`doc/08:2734` | 二选一判决由人类拍板；文档声称与代码一致 |
| LA-21 | Linux `app launch` 走 `detached`+`unref`+立即 resolve（现 10s 后把刚启动的程序杀掉）；`scrot`→`import` 回退只在 ENOENT 触发；输出上限与 shot 命名下沉共享 `runProcess` | `linux.ts:115-120,177`、三份 run() | 三平台 launch 生命周期语义一致 |

### 6.5 契约与工程纪律

| # | 内容 | 落点 | 验收 |
| --- | --- | --- | --- |
| LA-22 | **同步 19.4 漏掉的对外契约**：`openapi-routes.ts` PUT /api/mcp 补 transport/url/headers 且去掉 `required:['command']`，补 `GET /api/mcp/config` 路径；同步 `doc/02 §5.1/§4.5` 两行。补 `E_LSP_*` 四枚进 `errors.ts` + `ERROR_COPY`（现路由内联硬编码 404/502，绕开单源） | `protocol/openapi-routes.ts`、`openapi.json`、`doc/02:967,575`、`server/errors.ts`、`protocol/error-copy.ts` | gen+diff 重跑；`transport` 在契约可见；`readonly.ts` 不再内联状态码 |
| LA-23 | **mcp 配置数据完整性**：写盘传 `{mode:0o600}`；`writeMcpConfig` 写 `parseOrThrow` 的返回值（校验即规范化）；stdio 分支对称拒 url/headers；`superRefine` 限协议 http/https；headers/env 值经 `logger.registerSecrets` + IoGuard/audit 注入；`url` 含 userinfo 时掩掉或拒载；`servers["__proto__"]` 用 `Object.create(null)`（`lsp/config.ts:52` 已有正解）；`readonly.ts` 的 `as` 断言改指 `McpConfigInput['servers']`；transport 为缺省 stdio 时不写该键 | `mcp/config.ts`、`manager.ts`、`routes/readonly.ts` | round-trip 不丢未知键、不改写老配置形状；凭据不落全局可读文件、不进日志/审计明文 |
| LA-24 | **未被检查器锚定的计数纳入闸**：`Transport` 方法数（实数 75）在官网 `features/page.tsx:99` 与 `doc/08:2776` 均写 67；"27 种事件"在官网硬编码 11 处。修法 = 由 protocol 生成或加 `check_doc_links.py` 锚点，禁止手写 | `scripts/check_doc_links.py` 或生成器、`official/src`、`doc/08:2776` | 计数有单一事实源；改接口不会留下陈旧数字 |

### 6.6 arena 与文档口径

| # | 内容 | 落点 | 验收 |
| --- | --- | --- | --- |
| LA-25 | `isRecord` 补齐 `prompt:string` + `contenders:Array` + 每项最小形状；或 `history()` 逐条 try 跳过并计数（`skipped` 进 DTO）；三处空 catch 接 `onWarn`（照 `loadTrustDoc` 形状） | `arena/store.ts:22-32,84-86`、`manager.ts:252-266` | 一条"三字段齐但缺 prompt"的畸形文件用例不得让端点 500 |
| LA-26 | boot 把无主 `running` 改判 `interrupted`（或 DTO 加 `stale`）；加删除/保留策略；排序键与展示键统一为 `startedAt`；`prompt` 截断用 `Array.from`；门面文案"全量历史"收窄（实际缺省 20 条无分页） | `arena/manager.ts:101-103,261`、`store.ts:74-78`、`UsageSettingsPage.tsx:10,480` | 重启愈合用例 + 保留策略用例 |
| LA-27 | **修文档声称**：`doc/02:2831` 与 `doc/08:31,2748` 的"设置中心占位页余 0"改为"余 1（引导，19.15 未开工）"；D48 补登记"项目文件进评估链的安全前提"（与 LA-01/02 同批）；19.9 的三条安全表述按代码实况改写 | `doc/02`、`doc/08`、`ARCHITECTURE.md:482-486` | 措辞可由 grep 复现；版本表各追加一行 |

### 6.7 引擎核心残留（AUD 批的"修了但有残留"）

| # | 内容 | 落点 | 验收 |
| --- | --- | --- | --- |
| LA-28 | **`edit` 替换改字面量语义**：非 `replaceAll` 分支的 `String.replace(old, new)` 会展开 `$$`/`$&`/`` $` ``/`$'`，与 `replaceAll` 分支的 `split/join` 口径分叉。统一走 `split/join`（或 `replace` 传函数） | `tools/builtin/edit.ts:89-92` | 加 `$&`/`$$`/`` $` `` 三例；断言写入内容逐字节等于 `newString` |
| LA-29 | **把成本熔断接活**：`toPiModel` 的 `cost` 四率与 `maxTokens`/`input` 从 models.json/目录表进 `ResolvedModel`（现全为 `0` / 硬编码 `8192` / `['text']`）；`exceeded()` 加 token 维度兜底；给 `toPiModel` 字段来源加断言型单测（现单测从外部注入 usage，看不见这个 0） | `pi-gateway.ts:136-149`、`cost-tracker.ts` | 一条"真网关装配下 costUsd 非 0 且 exceeded 可触发"的用例；`maxTokens`/`input` 不再硬编码 |
| LA-30 | **补悬空 toolCall 的闭合**：把 length 分支已有的"补 `tool.started`+`tool.completed`+回喂 toolResult"抽成 helper，在 maxSteps break 与 aborted break 前同样调用（`E_STEP_LIMIT`/`E_ABORTED`） | `run-loop.ts:327-337,401-404` | 两用例断言任一 break 后 `tool.started`/`completed` 成对且 toolResult 已回喂（AUD-07 同类分支收口） |
| LA-31 | **修 `forkSession` 边界判定**：`openTurns` 应先结算边界事件自身类型再判空；或对复制路径尾部悬挂 turn 补 `turn.completed{aborted}`（复用 `danglingTurnIds`） | `engine.ts:934-946` | 加"以 `turn.completed` 为边界"用例（现三例从未覆盖这一唯一合法末边界）；web fork 钮可用 |
| LA-32 | **AUD-04 残留收口**：arena 胜者写回与附件读盘统一改调 `resolveInRoot`（arena 现用词法 `abs.startsWith(resolve(cwd))`，`/h/u/spark-notes` 判为根内且不做 realpath；附件 `file` 来自 durable 事件、可含 `../` 且只靠扩展名白名单） | `engine.ts:1181-1189,1906-1915` | 两用例：兄弟目录名前缀碰撞不得放行；附件 `../` 不得读盘 |
| LA-33 | **AUD-01 后遗症收口**：timer/abort 的 `void this.settle(...)` 改 `.catch(err => logger.error)`；`dispose`/`invalidatePending` 逐条 try 隔离；`doShutdown` 每步独立 try 或 `allSettled`（现 dispose 抛错会跳过后半程资源收口） | `permission/service.ts:144-149,258-279`、`engine.ts` doShutdown | 结算失败注入下：进程不死、后续 shutdown 步骤仍执行 |
| LA-34 | **AUD-06 残留收口**：脱敏移到 `EventBus.emit('error')` 单点，模式集统一为 env + `secrets.values()` 活取 + 静态形状（现只覆盖 env，而 `resolveApiKey` 优先级 store > env）；`compaction`/`checkpoint` 两处 error 发射点纳入；`SECRET_RE` 支持 `sk-ant-` 类形状 | `run-loop.ts:162-164`、`compaction.ts:164-169`、`checkpoint.ts:125-128`、`redaction.ts` | store 来源密钥在任意 error 事件上均被脱敏 |
| LA-35 | **AUD-10 残留收口**：`read` 末尾补 `if (!content.endsWith('\n'))` 的 tailTorn 分支（reason='缺尾换行'），由 resume 补写换行而非截断 | `session/store.ts:192,205-212,242` | 一条"完整 JSON 缺尾换行"用例，断言不粘连、不丢已广播事件 |
| LA-36 | **AUD-11 残留收口**：全 durable 溢出由"丢弃"改标订阅者 degraded + 恢复后要求重放（或回退水位）；bus 级兜底 `opts.onDurableOverflow` 补接线；`dispatch` 的 `gate.close()` 抛错加本地 try 以保 `emitCompleted`（现 catch 内再抛致悬空 `tool.started`） | `bus.ts:328-332`、`engine.ts` bus 构造、`pipeline.ts:351-352` | 溢出与 close 抛错两例；completed 事件对不悬空 |
| LA-37 | **trust 收紧只作用于 `rule:` 层**，不得改写 preset/full-access 终判；确需改写则审计行与 UI 标 `tightened-by:trust`（现记 `rule:preset` 与终判 ask 不一致，用户看不出是谁压的） | `permission/service.ts:101-102,434-436` | 未信任 cwd + full-access 档交叉用例；归因一致 |
| LA-38 | **坏会话文件不得静默截断列表**：`scanDiskSessions`/`scanForkChildren` 循环内 per-file try，坏文件产出 `{id, corrupted:true}` 或结构化 warn 后 continue | `session/scan.ts:76-105,139-171` | 一个坏文件不影响其余会话可见性 |
| LA-39 | 压缩失败加本 turn cooldown 并让 `compact()` 返回是否产生 completed；`OnceRequest` 回传 usage 计入预算 | `run-loop.ts:286-289`、`compaction.ts:164-170`、`cost-tracker.ts:6-7` | 限流注入下断言摘要调用次数有上界 |
| LA-40 | 卫生四小项：`tool-outputs/` 加回收（19.12 只清了截图）；`atomicWriteFile` 补 `fsync(tmp)` 与目标 mode 继承、`.tmp` 移出用户工作区（现会被 checkpoint `git add -A` 吸入）；`settledRequests` 加上界；reject feedback 双记与 `tool.completed` 的微任务竞态收敛 | `tools/output-store.ts`、`fsutil.ts:14-23`、`engine.ts:257`、`permission/service.ts:244-247` | 逐项有对应断言或登记为已知限制 |
| LA-41 | 刷新 `AGENTS.md` §1.1 的 `engine.ts` 行数口径（现写"1.6k 行级"，实测 **2257** 行），并把"装配面（constructor 约 330 行）与订阅器面可无痛外拆"登记进 R-D 判决注记 | `AGENTS.md` §1.1、`ARCHITECTURE.md` R-D | 口径可由 `wc -l` 复现 |

### 6.8 服务端、四端外壳与官网

| # | 内容 | 落点 | 验收 |
| --- | --- | --- | --- |
| LA-42 | **官网审批键位改正**并与实现逐字一致；中期把这段文案挪进 `protocol/ui-copy.ts` 做单源（四端 + 官网同一份），断掉这类倒置 | `official/src/app/quickstart/page.tsx:188-189`、`SessionDemoZone.tsx:119-121` | 与 `ApprovalPrompt.tsx:22` + `use-cli-keys.ts:239-254` 字符串相等断言（可放 protocol 或 official 的测试里） |
| LA-43 | **桌面首启续启竞态收口**：引导窗留到主窗 `loadURL` 成功后再关，或引入 `resuming` 标志让 `window-all-closed` 在 `!resuming && !ready && sidecar === null` 时才 quit；`will-quit` 早退分支也置 `quitting` | `apps/desktop/src/main.ts:182-235,268-284` | 首启"配置出现→自动续启"真机走查（此前第四轮只验了引导页出现，未验续启分支） |
| LA-44 | 桌面三项在册补齐：`requestSingleInstanceLock`；win32 `will-quit` 改 `taskkill /T /F` 树杀；"杀 sidecar 再退"抽公共函数供 `app.exit` 前同步调用 | `apps/desktop/src/main.ts` | 双实例被拒；Windows 退出无孤儿；`app.exit` 路径也收 sidecar |
| LA-45 | **CLI boot 幂等**：memo deps 去掉 `resumeFiltered`/`resumeSelected`（`confirmResume` 改在调用时 `getState()` 读，与文件头注声明的"状态读写一律走 getState()"归一）；`boot` 加 `bootedRef`；`setActiveSession` 仅在 `activeSessionId === null` 时执行；重试定时器不得随重跑累积 | `use-cli-actions.ts:48-90,293-308`、`app.tsx:171`、`use-resume-panel.ts:20-27` | 一条"连续按键请求数不随键数增长"的用例；切旧会话后打字符不跳走 |
| LA-46 | **shutdown 首步兜异常**：`sseCloseAll`/`sseRevokeToken` 的 write/end 逐个包 try/catch（与同文件 `:113` 同口径），或 `index.ts:97` 整体 try 后继续 close/shutdown；`clients` Map 注册与 `close` 监听注册之间的抛错路径补清理 | `apps/server/src/index.ts:97`、`sse.ts:47-52,89,134` | 坏连接存在时 `engine.shutdown()` 仍执行 |
| LA-47 | 附件生命周期：落盘改 `attachments/<sid>/<uuid>.<ext>`，`deleteSession` 随会话一并移入 trash（不删，守 §2.10 删除保护）；`GET /api/attachments/:file` 按会话取；`cleanupBrowserArtifacts` 文案改"将删除浏览器与电脑控制的全部历史截图，会话中已展示的图将不可查看" | `routes/sessions.ts:273-294`、`engine.ts:831-856`、`BrowserSettingsPage.tsx:128` | 删会话后附件不可取；页面文案与破坏性后果一致 |
| LA-48 | 端侧装配对齐头注：mobile 补 `useFocusEffect(refresh)`、miniapp 补 `useDidShow(refresh)`；「已归档」解除置灰真启用（`listSessions(true)`），或至少把注释与 note 改成"本端未接"（后端 12.4 已支持） | `apps/mobile/src/screens/SessionsScreen.tsx:7,35,225,259`、`apps/miniapp/src/pages/sessions/index.tsx:52-55` | 头注与实现一致；过期免责声明清零 |
| LA-49 | 桌面通知改用 `protocol` 的 `splitSseFrames`/`envelopeFromSseFrame`（加 `@spark/protocol` workspace 依赖）；`titles` 缓存订阅 `session.title` 刷新；`main.ts` 持有 wiring 句柄并在退出路径 `stop()` | `apps/desktop/src/notify-wiring.ts:10-21,37-53,74-110`、`package.json` | 解帧零另写；`stop()` 有调用方；AGENTS §1.1 漂移项清零 |
| LA-50 | `PUT /api/mcp` 移除"catch 后一律改 400"（I/O 错交全局 handler），body 改 zod schema 替掉两处 `as`；`apps/cli/package.json` description 的 "Ink v6" 改 7；官网 `Transport` 方法数与命令数改为由源码生成或注"以源码为准"并删掉假的"CI 校同步"声明 | `routes/readonly.ts:44-66`、`apps/cli/package.json:6`、`official/src/lib/constants.ts:11`、`features/page.tsx:99` | 写盘失败与校验失败可区分；陈旧计数清零 |
| LA-51 | 把 `official/` 纳入 `check_doc_links.py` 扫描面（或让官网示例从 `packages/sdk` 类型投影生成）——官网多处"真实 API 面"自律无人校验，P0-2 类错误无硬门 | `scripts/check_doc_links.py` 或生成器 | 官网文案里的 API 名/键位/计数有闸 |

### 6.9 协议共享核与 Web

| # | 内容 | 落点 | 验收 |
| --- | --- | --- | --- |
| LA-52 | **审批回执不得静默失败**：`onReply` 改 async + 局部 pending/error 态（`useAsyncOp` 现成），失败走 hint 或卡内红字；点击后 `disabled` 到 `permission.resolved` 回来为止（真源仍是事件流，**不是乐观更新**） | `MessageItem.tsx:158-160`、`ApprovalCard.tsx:122-148` | 失败注入用例：卡片不得原地停在 pending 且零反馈 |
| LA-53 | **web 接入 `ui-copy` 单源**：`approvalResolvedText`/`toolStatusText`/`turnDurationText`/`severityOf` 改 import，删三份平行实现；加一条守护断言（各端不得自写这些文案，grep 式或 snapshot） | `ApprovalCard.tsx:61,154,157`、`ToolCard.tsx:108-115`、`lib/time.ts:17-20`、`MessageItem.tsx:177-181` | 已漂移的「已允许（once）」消失；`ui-copy.ts:8` 头注对四端都成立；守护测试存在且能红 |
| LA-54 | **`$` 技能菜单：二选一**——短期把该项从 + 菜单摘除、底注改"搜索文件或命令"、`ComposerMenu.tsx:85` 的"工具条「文件树」"改指 + 菜单；正规把 `$` 接成技能/子代理菜单（`listSkills`+`listAgentPresets` 数据源已就绪）并**单独立单**（勿塞进 19.21） | `Composer.tsx:744`、`composer-menus.ts:20,31-42`、`ComposerMenu.tsx:85,91-92` | 无"可点但无功能"的按钮；底注不承诺不存在的检索 |
| LA-55 | **环影 token 化**：`--dsh-ring-shadow` 进 `tokens.css`（10 处改引），六个弹层容器收进一个 `popover-surface` copy-in 件；DESIGN L.6 补裁决句（对偶于滚动条那条"单点维护、组件禁写局部样式"） | `ComposerMenu.tsx:25` 等 8 处 + `Composer.tsx:554-555` | 改环宽/透明度只需一处；源码级一致断言 |
| LA-56 | **19.22 Mock 对等清单补 `replyPermission._scope`**，并把 `agents`/`extensions`/`createSession(opts)`/`sendMessage(opts)` 四项**提到批次 A**（它们是 19.9/19.12/DSH 三批的回归前提，不是收尾卫生项）；mock 不得对未实现的 patch 静默 resolve | `apps/web/src/transports/mock.ts`（`updateSettings`/`createSession`/`sendMessage`/`replyPermission`） | 每项一条 mock↔HttpTransport 行为对齐单测；静默成功改显式失败 |
| LA-57 | `openSessions` 加删除口（`deleteSession` 与"关闭会话"时摘除），resync 只重放 active 会话或由调用方维护窗口 | `protocol/src/transport-node.ts:180,224-225,311` | 翻过 N 个会话后断线，REST 请求数不随 N 扇出；已删会话不重放 |
| LA-58 | `req()` 加缺省超时（`AbortSignal.timeout`，可配），或 `replay()` 外套 watchdog（超时即作废本代、清 buffering、如实报错）；`pending` 缓冲加上限 | `transport-node.ts:230-252`、`replay.ts:41-43`、`context.tsx:97-99` | 悬挂 `getSession` 不再导致"静止但无错误" |
| LA-59 | 拆掉 `as keyof typeof READY_COMPONENTS`，改类型约束（`status:'ready'` 必须在类型上带组件引用，或映射移进 `settings-pages.ts` 并 `satisfies Record<ReadyId, ComponentType>`） | `SettingsPage.tsx:59-69`、`settings-pages.ts` | 漏挂组件时编译期即失败，而非运行时显示占位页 |
| LA-60 | 硬编码 hex 归 token（`#2c2c2e` 改引既有 `--user-bubble`，三个中性灰进 `tokens.css`）；placeholder 的 AA 偏差按 DESIGN v2.15 格式登记为**已知豁免**，而不是留作组件里的游离常量 | `Composer.tsx:555,633,653`、`tokens.css`、DESIGN §12.8/§13.C | 组件内零硬编码 hex（`tokens.css:5` 第 5 条自订规则恢复成立） |
| LA-61 | 弹层开合收成一个 `useState<PopoverKind \| null>`（互斥由类型保证）；`useDismissOnOutsideClick` 加 `escape` 选项（默认开），六个浮层复用 | `Composer.tsx:507-512,650`、`FolderPicker.tsx:54-56`、`DeliveryPicker.tsx:60`、`useDismissOnOutsideClick.ts:16-25` | L.6「开一关一」对全部浮层成立；Esc 可达 |
| LA-62 | 三处已翻案裁决的陈旧注释清理（`ArenaCard.tsx:5`"记录仅内存"、`composer-menus.ts:5-7`"技能未接入"、`settings-pages.ts:86`"管理面板归 16.2"）；`ToolCard` 补 `startedAt` 复用 `ReasoningCollapsible` 的 interval 写法；`AssistantBlock` 的 `usage` 死分支与 `MessageItem` 的 `model` prop 删或补齐；回放期跳过 `error` toast；`fatal` 要么给引擎发射点要么删 24 行 | `ArenaCard.tsx:5`、`composer-menus.ts:5-7`、`settings-pages.ts:86`、`ToolCard.tsx`/`MessageItem.tsx:121-129`、`AssistantBlock.tsx:80-84`、`ErrorToast.tsx:22-31,38-62`、`apply-event.ts:931-933` | 无"注释比文档更权威地误导下一个人"；web 工具卡有运行时长（与 CLI 对齐） |

## 7. 续补范围

全阶段（一~十八）"声称-vs-代码"抽样对账组与本报告的虚报率量级估计仍在回收；结论回来后并入 §2 与 §5，并按需追加 LA 编号（不复用已发号）。§4.9 与 §6.9 已含协议+Web 组的全部结论。

## 8. 静态无法判定项（汇总，需真机/运行时）

1. computer-use 三平台真机行为：DPI 缩放下"截图画面坐标 → 点击坐标"是否偏移（`computer.ts:28,104` 把它当契约）；`Add-Type -TypeDefinition` 在 WDAC/AppLocker（ConstrainedLanguage）机器上是否被拒；PowerShell `[uint32]"-240"` 是否环绕；`xdotool` 是否接受 `--` 终止符与 `search --pid N --windowactivate` 的正确写法；`osascript keystroke` 对中文的实际效果。
2. LSP 安装器在 Windows 的 `npm.cmd` spawn 与 `--version` 探测是否真不可用（LA 组里 P1 的确证）。
3. 向已销毁 `child.stdin` 写入在 Node ≥24 下是否升级为未捕获异常。
4. 非交互 bash 从管道读入时语法错误是否整输入致命退出。
5. 官网/移动端/小程序/桌面的全部视觉与交互表现（本审计未打开任何浏览器）。
6. 审批链/权限规则真实生效需引擎实跑；§4.1 的 P0 只证明了"审批归零"与"路径边界只挡 cwd 外"，未实跑证明 hook 被触发的完整链条。
7. **横切不变量的真实爆炸半径**：pi-ai 是否按 `Model.cost` 计价、是否按 `Model.input` 过滤 image（决定 LA-29 是"护栏惰性"还是"图像输入也静默失效"）；真实 provider 对"tool_use 无配对 tool_result"是拒绝请求还是仅上下文不优（决定 LA-30 严重度）。
8. `appendFile` 短写停在 `}` 与 `\n` 之间的真实概率（LA-35 可达性）；SSE 慢客户端 + 全 durable 流下 `pushRing` 溢出是否真可达（LA-36）；SIGKILL 后无 `fsync` 的实际丢尾程度（LA-40）。
9. `z.strictObject(...).partial()` 在 zod 运行时是否仍拒未知键（决定 §4.6 那条 D49 口径分叉是否成立——一条 `loadConfig` 塞未知 browser 键的用例即可判死）。
10. Windows 桌面首启续启竞态的实际交错（`window-all-closed` 与 `main()` await 续体的先后）；`child.kill()` 后孙进程是否真残留；CLI raw-mode 下每键重跑的体感卡顿程度。
11. Playwright e2e 是否真能盖住 WO-099/101 一类交互缺陷（本审计未跑，也无法从静态判断 e2e 断言覆盖面）；`settings-nav.test.ts` 是否逐页断言组件身份（LA-59 的相关判据）。
12. **工作区与时间线（含本报告自身的归属事故）**：本稿核查期间并行会话推进了多次提交——报告所据 HEAD 从 `171eeb2` 经 `42a5030` 前进到 **`cd04be7`（阶段十九 19.7 沙箱网络隔离，ADR D50）**。**19.7 不在本稿范围内**（立稿时它是 ⬜，落地发生在审查过程中），其代码需另行核查；且 §4.6/§4.7/§4.9 中落在 `packages/engine/src/config.ts`、`engine.ts`、`protocol/src/api.ts`、`sandbox/`、`tools/builtin/bash.ts`、`apps/web/src/transports/mock.ts` 的行号在 19.7 合入后可能位移，执行 LA 前须二次定位。
    另须登记一条与 §1.4 同类的事实：本报告的正文初稿（464 行）与 `AGENTS.md` 的 v1.57 索引行，在主会话完成 `git add` 之后、`git commit` 之前，被并行会话的一次宽范围暂存扫进了 **`c986a28`（一条"修 19.7 CI typecheck 红"的提交）**并已推送——即**本报告的归属被记在了别人的提交信息下**。未做历史重写（AGENTS §7 不 revert 不 force push），只在此留证。这也是"多会话并行 + 宽 `git add`"下的常规风险，与本报告 §3 S2 的结论同源：**自报链路本身就不可靠**。
