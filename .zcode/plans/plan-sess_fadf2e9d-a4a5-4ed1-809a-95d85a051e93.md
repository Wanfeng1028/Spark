# 官网文案全站重写 + Cloudflare 双部署（spark.gemmae.dev）

## 一、目标
1. 官网 `official/`（单页 + features/architecture/quickstart 三子页 + Header/Footer/404 + meta）全部对外可见文案重写，清除"AI 味"（DESIGN §12.7 禁项 + §12.8 grep 禁词），并换掉 Hero 主句（站魂句）。
2. 部署到 Cloudflare，且**与 GitHub Pages 保持每次 push 同步更新**（用户拍板："cf和git page的版本要每次都一样"）。域名 = **spark.gemmae.dev**（gemmae.dev 的子域）。

## 二、文案重写（约 16 个文件）
**改写规则**（对照 DESIGN §12.7 禁项逐一执行）：
- 只留事实陈述；删第二人称喊话（"你"不回改）、感叹号、对仗式短句（"一份协议。四块界面。"）、空泛词（告别/把…还给你/无需…即可）、三连排比、破折号口号。
- 数字全部可回源码核对（27 事件 / 28 内置命令 / 4 端 / MIT / 8 家供应商 / 4318 端口 / Node ≥24）——不得凭记忆写。
- 不触碰 `check_doc_links.py` 检查 5 禁词（本地优先/数据不出本机/无云端依赖/local-first/跑在你自己）。

**站魂句（Hero 主句）候选**：主推「一个引擎，四个界面。」（可核事实：headless 单一引擎 + 四端 UI），备选：「同一事件流，四端界面。」「引擎一个，界面四端。」——最终取主推，落进 Hero H1 与 metadata title/description/OG。

**逐文件改写点**：
- `src/app/layout.tsx`：metadata title/description/OG/Twitter 文案重写（"引擎 headless，UI 是事件流的投影"改为事实句"一个引擎，四个界面。27 种事件驱动 Web / 桌面 / CLI / 移动端。"）。
- `src/app/page.tsx` 及 `components/sections/` 下 Hero / SessionDemoZone / FourTiles / JobPicker / ProtocolSection / FeatureFacts / ArchitectureDiagram / SecurityModel / QuickStartCTA / FactBar：Hero 换站魂句 + 副标重写；JobPicker 六个场景卡（"挂着自己跑，边喝咖啡边看，全部允许"等）改写为事实描述；SecurityModel"缺省即安全"口号句改为 fail-closed 事实（超时/异常/中断一律拒绝）；ProtocolSection"一份协议。四块界面。"对仗句拆为单句；SessionDemo 右侧对话卡里的第二人称口吻改第三人称事实。
- 三个子页 `features/architecture/quickstart/page.tsx`：H1 副标与 metadata description 微调（正文本身事实密度高，只清残留 AI 味）。
- `src/app/not-found.tsx`、`Header.tsx` / `Footer.tsx`：aria 标签汉英混用统一为中文；404 文案中性化。
- `robots.ts` / `sitemap.ts`：SITE_URL 环境变量化（见下）。

**official/README.md 事实修正**（同时完成）：第 39 条"23 条内置命令"→**28 条**；安装段 `npm i -g @spark/cli` 与 quickstart 页"发布未落地、仅源码可跑"口径冲突——统一为加注"npm 发布待 CI 凭证，当前从源码跑"。

## 三、部署（GitHub Pages 保留 + Cloudflare 并行）
**一致性保证**：GitHub Pages 继续走现有 `official.yml` deploy workflow；Cloudflare 走 **Pages Git 集成**——两者都由同一 commit push 触发、同一源码、同一构建命令各自构建发布。内容同源同 commit，只是 URL 结构不同（GH = 子路径 `/Spark/`，CF = 根路径 spark.gemmae.dev），这是两个站的本质差异，代码/文案/构建完全同源。

**代码侧改动（双站共享）**：
1. `official/next.config.ts` 已经支持 `NEXT_PUBLIC_BASE_PATH` 环境变量（未给默认 /Spark）——CF 构建时置空即可，无需改文件。
2. `layout.tsx` / `robots.ts` / `sitemap.ts` 三处硬编码 `SITE_URL = "https://wanfeng1028.github.io/Spark"` 改为读 `process.env.NEXT_PUBLIC_SITE_URL ?? "https://wanfeng1028.github.io/Spark"`（缺省保持 GH Pages，CI 不动；CF 构建注入新值）。

**workflow 侧**：`official.yml` **不动**（GitHub Pages 保持现状）。
Cloudflare 部署走 Pages Git 集成（连同一个 repo，CF 自己构建），无 CI 改动、无 secrets。构建配置（用户一次性在 CF 控制台填写）：
- Root directory：`official`；安装命令：`npm i -g pnpm && pnpm install --ignore-workspace --no-frozen-lockfile`；构建命令：`pnpm build`；输出目录：`out`。
- 环境变量：`NEXT_PUBLIC_BASE_PATH=""`、`NEXT_PUBLIC_SITE_URL="https://spark.gemmae.dev"`（生产分支 main）。

**用户一次性操作清单（我无法代做，写进 README 部署小节＋执行时 Email 告知）**：
1. Cloudflare 控制台 → Workers & Pages → 创建 → Pages → 连接 GitHub（Wanfeng1028/Spark），按上述配置建项目。
2. 项目 → Custom domains → 添加 `spark.gemmae.dev`（若 gemmae.dev DNS 由 Cloudflare 托管则自动建 CNAME；若在阿里云等外部托管，去注册商处加 CNAME `spark` → `<project>.pages.dev`）。
3. 完成后每次 push main：GitHub Pages（wanfeng1028.github.io/Spark/）与 spark.gemmae.dev 同步更新。

## 四、文档登记（版本记录表纪律）
- `AGENTS.md` 版本表追加 v1.66 行（本次官网文案重写 + CF 双部署 + SITE_URL 环境变量化）。
- 根 `README.md`（或 `.github/`）相关"官网"行补 CF 入口链接。
- `official/README.md` 同步加"部署"小节（GH Pages + Cloudflare 双站点、域名、一键操作步骤）。
- `doc/08` 追加新工单一张（按现最大 19.4x +1 编号）或于 doc/02 §8.7 登记决策；`DESIGN.md` §12.7 若有新增禁例不涉及——本次纯整改不新增规则（若无，则不动 DESIGN）。

## 五、遵守仓库纪律
- 本机零验证（§2.2）：改完直接 commit + push，验证交远端 CI（官方 CI + Playwright 不走本机）。
- 本机禁止一切下载（§2.3a）：不 pnpm install / 不拉依赖——改动只涉及文案与 env 读取，无新增依赖；如需校验本地起站则以 `pnpm --filter` 已有 node_modules 运行，不下载。
- 文件删除保护（§2.10）：本次无任何删除；`not-found.tsx` 为改写非删除。
- 文案禁用词（检查 5）在重写中逐句自查，保证 CI 第一关绿。
- 提交信息 conventional + 中文描述。

## 六、验证与交付
1. 代码文案全部改完 → 本机零验证直接 commit + push（若 CI 红在下一提交修）。
2. 完成后向用户交付：① 双站 URL（GH 现有 + spark.gemmae.dev 待用户绑定）；② 上文"用户一次性清单"的逐步操作说明；③ 文案动了哪些文件的清单。

## 待用户执行的唯一一席
- 创建 Cloudflare Pages 项目 + 绑定子域（上文清单）——这是账号权限，我无法代做；代码侧不依赖它，可先行落地。另：若用户愿意提供 CF API Token + Account ID 也可在 workflow 里加 wrangler-action 自动部署（备选，按"每 push 两站同步"效果相同），此项供你选偏好，默认走 Git 集成零凭证方案。