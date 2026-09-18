# Spark 项目工单列表

> 生成日期：2026-09-18
> 来源：全面代码审查与功能验证
> 格式：可直接用于 GitHub Issues / 飞书项目 / Jira

---

## P0 — 阻断级（3 项）

### WO-001　官网 metadataBase 缺失导致 OG/canonical 失效
- **优先级**：P0
- **模块**：official/
- **文件**：`official/src/app/layout.tsx:7-29`
- **问题描述**：根 metadata 未设置 metadataBase，OG image/canonical/alternates 全部输出相对路径，社交平台爬虫无法拉取
- **修复方式**：加 `metadataBase: new URL("https://你的实际域名")`
- **验收标准**：页面源码中 og:url 为绝对 URL；canonical 为绝对 URL
- **预估工时**：0.2 天
- **关联**：WO-002

### WO-002　官网 OG/Twitter 卡片无实际图片
- **优先级**：P0
- **模块**：official/
- **文件**：`official/src/app/layout.tsx:17-28`
- **问题描述**：twitter.card 设为 summary_large_image 但 openGraph/twitter 均无 images 字段；public/og-image.svg 存在但社交平台不解析 SVG
- **修复方式**：SVG 转 1200×630 PNG；在 openGraph.images 和 twitter.images 中补上
- **验收标准**：Twitter/微信/Discord 分享预览显示图片
- **预估工时**：0.3 天

### WO-003　官网页面标题双重 "— Spark"
- **优先级**：P0
- **模块**：official/
- **文件**：`features/page.tsx:6`、`architecture/page.tsx:7`、`quickstart/page.tsx:17`
- **问题描述**：layout 的 title.template "%s — Spark" 与子页面自带 "— Spark" 后缀叠加，输出 "核心能力 — Spark — Spark"（已浏览器验证）
- **修复方式**：三个子页面的 metadata.title 去掉 " — Spark" 后缀
- **验收标准**：浏览器标签显示 "核心能力 — Spark"（无重复）
- **预估工时**：0.1 天

---

## P1 — 高优先级（15 项）

### WO-004　bash 工具全量输出驻留内存 → OOM 风险
- **优先级**：P1
- **模块**：packages/engine
- **文件**：`packages/engine/src/tools/builtin/bash.ts:172-217`、`output-store.ts`
- **问题描述**：child stdout/stderr 全部 push 进 chunks，close 时 join 成完整 string 后才截断。`cat 1GB.log` 会让整段输出常驻内存
- **修复方式**：chunks 累计到 toolOutputLimitKB×4 后改写临时文件，close 时回传"截断头 + 指针"
- **验收标准**：大输出命令不触发 OOM；截断行为与当前一致
- **预估工时**：1 天

### WO-005　resolveInRoot 不跟随符号链接 → 路径越界读
- **优先级**：P1
- **模块**：packages/engine
- **文件**：`packages/engine/src/tools/definition.ts:77-85`
- **问题描述**：词法边界判定不调 fs.realpath，工作区内 symlink 可绕过硬边界，read/grep/lsp 能读到 cwd 外文件
- **修复方式**：对解析目标先 fs.realpath 再做 relative 判定；或遍历起点 lstat 跳过 symlink
- **验收标准**：`ln -s /etc ./etc` 后 read/grep 无法越界
- **预估工时**：0.5 天

### WO-006　Projector 每步重读附件图片 → IO 线性放大
- **优先级**：P1
- **模块**：packages/engine
- **文件**：`packages/engine/src/projector.ts:151-156`
- **问题描述**：每个 step 都重新读盘+base64 编码附件图片，40 步 turn 中单张图被重复处理 40 次
- **修复方式**：ProjectorImpl 内按 attachment file 名做 Map 缓存
- **验收标准**：长 turn 多图场景 IO 不随步数线性增长
- **预估工时**：0.5 天

### WO-007　ProgressGate.close() 失败路径二次抛错
- **优先级**：P1
- **模块**：packages/engine
- **文件**：`packages/engine/src/tools/pipeline.ts:313/328`
- **问题描述**：live emit 失败时 catch 里再次 await drain 会再 reject，工具调用以"未闭合"形态失败
- **修复方式**：close() 内 `await this.drain.catch(() => undefined)`
- **验收标准**：live 广播瞬时失败时工具走 mapError 人话错误
- **预估工时**：0.3 天

### WO-008　Web 端无 React ErrorBoundary → 渲染异常白屏
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/App.tsx`、`main.tsx`
- **问题描述**：全端 grep 0 个 ErrorBoundary，streamdown/畸形投影任一渲染期抛错 → React 19 整树卸载白屏
- **修复方式**：App.tsx 外包 ErrorBoundary（崩溃兜底+重载按钮）；ChatView itemContent 加行级边界
- **验收标准**：单条坏消息不拖垮整页；整树崩溃有重载入口
- **预估工时**：0.5 天

### WO-009　语音输入麦克风流卸载时未释放
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/useVoiceInput.ts`
- **问题描述**：cleanup() 仅在 recorder.onstop 内调用，无 useEffect 卸载清理；录音中切走路由 → 麦克风灯常亮
- **修复方式**：增加 `useEffect(() => () => { recorder.stop(); cleanup() }, [])`
- **验收标准**：录音中切走路由后浏览器麦克风指示灯熄灭
- **预估工时**：0.3 天

### WO-010　Mock 会话审批卡被错误信息遮挡
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/routes/SessionPage.tsx`
- **问题描述**：Mock 模式下历史会话显示"不存在"，发送消息触发审批后审批卡不可见，用户卡在"等待审批中"
- **修复方式**：会话加载失败时新消息应先重建会话或明确提示；审批卡层级需在错误信息之上
- **验收标准**：Mock 模式下发送消息后审批卡可见可操作
- **预估工时**：0.5 天

### WO-011　设置页默认右侧内容区空白
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/routes/SettingsPage.tsx`
- **问题描述**：直接访问 /settings 时左侧导航完整但右侧空白，用户可能误以为加载失败
- **修复方式**：默认选中"常规"项或显示设置概览
- **验收标准**：进入 /settings 时右侧有内容
- **预估工时**：0.2 天

### WO-012　官网缺少 sitemap
- **优先级**：P1
- **模块**：official/
- **文件**：新增 `official/src/app/sitemap.ts`
- **问题描述**：5 条路由但无 sitemap.xml，SEO 基础设施缺失
- **修复方式**：新建 sitemap.ts，列出所有路由
- **验收标准**：/sitemap.xml 可访问且包含所有路由
- **预估工时**：0.2 天

### WO-013　官网缺少 robots.txt
- **优先级**：P1
- **模块**：official/
- **文件**：新增 `official/public/robots.txt`；`layout.tsx` 加 metadata.robots
- **问题描述**：无 robots 声明，未指向 sitemap
- **修复方式**：新建 robots.txt + metadata.robots
- **验收标准**：/robots.txt 可访问，包含 Sitemap 指向
- **预估工时**：0.1 天

### WO-014　官网移动端菜单缺少焦点陷阱
- **优先级**：P1
- **模块**：official/
- **文件**：`official/src/components/layout/Header.tsx:135-175`
- **问题描述**：移动菜单展开时键盘用户可 Tab 到菜单背后的页面元素，违反 WCAG 2.4.3
- **修复方式**：菜单展开期间拦截 Tab 键，焦点循环限制在菜单项内
- **验收标准**：移动菜单展开时 Tab 不逃出菜单
- **预估工时**：0.3 天

### WO-015　官网死代码组件清理
- **优先级**：P1
- **模块**：official/
- **文件**：`terminal.tsx`、`split-text.tsx`、`marquee.tsx`、`badge.tsx`、`card.tsx`
- **问题描述**：5+ 个文件 200+ 行死代码，Terminal/SplitText 是 "use client" 会打进 bundle
- **修复方式**：删除未使用文件
- **验收标准**：knip 零未引用文件
- **预估工时**：0.2 天

### WO-016　官网 package.json 补齐 packageManager + engines
- **优先级**：P1
- **模块**：official/
- **文件**：`official/package.json`
- **问题描述**：缺 packageManager（版本不可控）和 engines（旧版 Node 不阻止）
- **修复方式**：加 `"packageManager": "pnpm@9.15.9"` 和 `"engines": {"node": ">=24"}`
- **验收标准**：CI 安装版本可复现
- **预估工时**：0.1 天

### WO-017　官网 QuickStartCTA 对比度不达标
- **优先级**：P1
- **模块**：official/
- **文件**：`official/src/components/sections/QuickStartCTA.tsx:70`
- **问题描述**：text-muted-foreground/70 亮色主题对比度仅 ~2.7:1，不满足 WCAG AA（项目其他地方已修过同类 Bug）
- **修复方式**：改为 text-muted-foreground（亮色 4.9:1）
- **验收标准**：WCAG AA 对比度通过
- **预估工时**：0.1 天

### WO-018　官网缺少 skip-to-content 链接
- **优先级**：P1
- **模块**：official/
- **文件**：`official/src/app/layout.tsx:36-46`
- **问题描述**：固定 Header + 导航，键盘用户每次需 Tab 穿过全部导航才能到主内容，违反 WCAG 2.4.1
- **修复方式**：body 开头加 sr-only focus 可见的"跳到主内容"链接，main 加 id
- **验收标准**：Tab 第一个焦点是 skip 链接
- **预估工时**：0.2 天

---

## P2 — 改进级（15 项，精选）

### WO-019　测试环境隔离：proxy-fetch 用 vi.stubEnv
- **文件**：`packages/engine/tests/proxy-fetch.test.ts`
- **问题**：沙箱 HTTPS_PROXY 变量导致用例失败
- **工时**：0.2 天

### WO-020　server decodeURIComponent 畸形头返回 400
- **文件**：`apps/server/src/routes/sessions.ts:258`
- **问题**：恶意 x-file-name 头抛 URIError → 500 而非 400
- **工时**：0.2 天

### WO-021　pi-gateway 错误文案密钥脱敏
- **文件**：`packages/engine/src/pi-gateway.ts:386`
- **问题**：provider 错误体可能回显 Authorization 头，密钥进 JSONL
- **工时**：0.2 天

### WO-022　edit/write 工具原子写对齐
- **文件**：`packages/engine/src/tools/builtin/edit.ts:92`、`write.ts:33`
- **问题**：直接 writeFile，进程崩溃留半写文件；仓内已有 atomicWriteFile
- **工时**：0.5 天

### WO-023　run-loop takeInput catch 静默吞错
- **文件**：`packages/engine/src/run-loop.ts:173`
- **问题**：非 E_QUEUE_CLOSED 错误也无声 break
- **工时**：0.2 天

### WO-024　useCopy setTimeout 三端未清理
- **文件**：`apps/web/src/hooks/useCopy.ts:13`（+ mobile/miniapp 同型）
- **问题**：1.5s 定时器无卸载清理
- **工时**：0.2 天

### WO-025　Electron BrowserWindow 显式硬化
- **文件**：`apps/desktop/src/main.ts:107-114`
- **问题**：未显式声明 webPreferences，缺 will-navigate 拦截
- **工时**：0.3 天

### WO-026　非环回模式数据面加速率限制
- **文件**：`apps/server/src/`
- **问题**：非环回+鉴权模式下写/重端点无速率/并发节流
- **工时**：0.5 天

### WO-027　SSE drain 监听关闭时移除
- **文件**：`apps/server/src/sse.ts:110`
- **问题**：close 回调里未 removeListener('drain')
- **工时**：0.1 天

### WO-028　会话切换权限档位短暂串台
- **文件**：`apps/web/src/routes/SessionPage.tsx:83-89`
- **问题**：useTransportQuery deps 变化时不清空旧 data
- **工时**：0.2 天

### WO-029　@补全 listFs 在途竞态
- **文件**：`apps/web/src/features/chat/Composer.tsx:248`
- **问题**：慢请求后 resolve 覆盖新结果
- **工时**：0.2 天

### WO-030　官网字体 next/font 优化
- **文件**：`official/src/app/globals.css:2-3`
- **问题**：CSS @import 阻塞渲染，改用 next/font/local
- **工时**：0.3 天

### WO-031　官网引入 ESLint
- **文件**：official/ 根目录
- **问题**：有 eslint-disable 注释但无 ESLint 配置和依赖
- **工时**：0.3 天

### WO-032　官网 npm 漏洞修复
- **文件**：official/package-lock.json
- **问题**：npm audit 报告 2 个漏洞（1 moderate, 1 high）
- **工时**：0.3 天

### WO-033　web 端 chunk 体积优化
- **文件**：apps/web/vite.config.ts
- **问题**：index.js 1.37MB（gzip 398KB），建议 manualChunks 代码分割
- **工时**：0.5 天

### WO-034　设置页默认右侧空白
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/routes/SettingsPage.tsx`
- **问题描述**：直接访问 /settings 时左侧菜单完整但右侧内容区完全空白，需手动点击左侧菜单项才加载
- **修复方式**：默认选中"常规"项并加载内容，或显示设置概览
- **截图证据**：`screenshots/web/web-settings-default-blank.png`
- **工时**：0.2 天

### WO-035　Electron 首启无 models.json 崩溃无引导
- **优先级**：P1
- **模块**：apps/desktop
- **文件**：`apps/desktop/src/main.ts`、`packages/engine/src/config.ts`
- **问题描述**：全新机器首次启动，sidecar 直接 E_CONFIG 崩溃（defaultModel 必填），主进程跟随退出，用户看到应用秒退无任何提示
- **修复方式**：sidecar 早退时给出"先配模型"引导对话框；或内置可写入的默认 models.json 模板
- **工时**：0.5 天

### WO-036　小程序 token 明文存储
- **优先级**：P1
- **模块**：apps/miniapp
- **文件**：`apps/miniapp/src/store/config-store.ts:52`
- **问题描述**：鉴权 token 明文存入 Taro.setStorageSync，设备 root/调试时可读取
- **修复方式**：评估加密存储或微信安全存储方案
- **工时**：0.3 天

### WO-037　小程序生产构建配置未优化
- **优先级**：P1
- **模块**：apps/miniapp
- **文件**：`apps/miniapp/project.config.json:6-11`
- **问题描述**：es6/enhance/postcss 均为 false，生产构建兼容性不足
- **修复方式**：生产构建前将三项设为 true
- **工时**：0.1 天

### WO-038　小程序 getSystemInfoSync 已废弃
- **优先级**：P1
- **模块**：apps/miniapp
- **文件**：`apps/miniapp/src/app.tsx:20`、`src/transport/mini-event-source.ts:91`
- **问题描述**：微信基础库 3.x+ 中 getSystemInfoSync 已标记 deprecated
- **修复方式**：改用 Taro.getDeviceInfo()/getWindowInfo()
- **工时**：0.2 天

### WO-039　小程序无 React Error Boundary
- **优先级**：P1
- **模块**：apps/miniapp
- **文件**：`apps/miniapp/src/app.tsx`
- **问题描述**：应用入口无 Error Boundary，页面渲染异常时白屏无 fallback
- **修复方式**：添加 componentDidCatch 或 react-error-boundary
- **工时**：0.2 天

### WO-040　CLI --project 参数被静默忽略
- **优先级**：P2
- **模块**：apps/cli
- **文件**：`apps/cli/src/print.ts`
- **问题描述**：一次性模式 --project 参数不存在却不报错（正确参数是 --cwd），用户误传无提示
- **修复方式**：parsePrintArgs 遇到未知 flag 报 E_USAGE
- **工时**：0.2 天

### WO-041　CLI TUI logo banner 重绘残影
- **优先级**：P2
- **模块**：apps/cli
- **文件**：`apps/cli/src/`
- **问题描述**：会话信息加载后欢迎 ASCII logo 被重绘但旧帧未清，出现双 logo 叠影
- **修复方式**：Ink overlay 切换前先清屏或用绝对重绘
- **截图证据**：`screenshots/cli/tui-01-initial.png`
- **工时**：0.3 天

### WO-042　小程序 SSE token 走 URL 查询参数
- **优先级**：P2
- **模块**：apps/miniapp
- **文件**：`apps/miniapp/src/transport/mini-event-source.ts`
- **问题描述**：SSE 鉴权通过 ?token= 传递，会被服务端访问日志记录
- **修复方式**：服务端限制 SSE 端点日志级别，或评估自定义 header 方案
- **工时**：0.3 天

### WO-043　Web 端无移动端响应式设计【P0】
- **优先级**：P0
- **模块**：apps/web
- **文件**：`apps/web/src/`（全局 CSS/布局）
- **问题描述**：整个 Web 应用仅 `prefers-reduced-motion` 一个媒体查询，无任何宽度断点。375px 下侧边栏固定 264px 占 70% 宽度，主内容区仅约 111px，无法正常使用。侧边栏折叠为手动操作而非自动适配。
- **影响范围**：所有手机浏览器访问 Web 端的用户
- **修复方式**：添加 md/lg 断点，≤768px 自动折叠侧边栏为抽屉式，主内容占满宽度；输入框和设置页适配窄屏
- **截图证据**：`screenshots/mobile/iphone-welcome.png`
- **工时**：2.0 天

### WO-044　CLI server 崩溃后 git index.lock 残留
- **优先级**：P1
- **模块**：packages/engine
- **文件**：`packages/engine/src/checkpoint/`（git 操作封装）
- **问题描述**：server 异常退出后 checkpoint 仓库的 `.git/index.lock` 未清理，TUI 恢复旧会话时 `E_CHECKPOINT_SNAPSHOT` 持续刷屏，需手动 `rm` 锁文件才能恢复
- **影响范围**：所有使用 CLI TUI 且经历过 server 崩溃的用户
- **修复方式**：checkpoint 操作加 try/finally 确保锁释放；启动时检测 stale lock（mtime > 30s）自动清理
- **工时**：0.5 天

### WO-045　CLI 流式输出期间 SlashMenu 失效
- **优先级**：P1
- **模块**：apps/cli
- **文件**：`apps/cli/src/tui/`（输入框组件）
- **问题描述**：模型正在流式输出时按 `/` 不弹 SlashMenu，输入的 `/stats` 等命令被当普通消息发给模型，导致模型困惑
- **影响范围**：CLI TUI 用户在模型输出期间想执行命令时
- **修复方式**：输入框 onKey 处理 `/` 时不依赖 turn 状态，或在流式期间拦截以 `/` 开头的输入并提示"等待输出完成"
- **工时**：0.3 天

### WO-046　官网主题切换初始状态不同步
- **优先级**：P1
- **模块**：official
- **文件**：`official/src/components/ThemeToggle.tsx`
- **问题描述**：首次加载时按钮 aria-label 与实际 html class 矛盾（按钮说"切换到浅色"但实际是浅色模式），导致首次点击可能切换到非预期主题
- **影响范围**：所有官网首次访问用户
- **修复方式**：useEffect 中根据 document.documentElement.classList 同步按钮状态，或从 localStorage 初始化时同步设置按钮
- **工时**：0.2 天

### WO-047　官网代码复制按钮反馈过短无 toast
- **优先级**：P1
- **模块**：official
- **文件**：`official/src/components/CodeBlock.tsx`
- **问题描述**：点击复制后图标变对勾+aria-label="Copied"，但反馈仅持续约 1 秒，无 toast 通知，用户可能不确定是否复制成功
- **影响范围**：所有复制官网代码的用户
- **修复方式**：反馈延长至 2-3 秒，或添加 toast 通知"已复制到剪贴板"
- **截图证据**：`screenshots/official/code-copy-feedback.png`
- **工时**：0.2 天

### WO-048　官网三态主题循环可能困惑用户
- **优先级**：P2
- **模块**：official
- **文件**：`official/src/components/ThemeToggle.tsx`
- **问题描述**：主题切换为三态循环（浅色→深色→跟随系统），用户点击两次才回到浅色，可能困惑
- **修复方式**：改为二态切换（浅/深）+ 单独的"跟随系统"复选框，或在按钮上显示当前状态
- **工时**：0.3 天

### WO-049　Web 侧边栏菜单项触摸目标不足
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/components/Sidebar.tsx`
- **问题描述**：侧边栏菜单项高度 32px，低于 WCAG 2.5.5 的 44px 触摸目标标准，移动端误触率高
- **修复方式**：移动端将菜单项高度提升至 44px，或增加 padding
- **工时**：0.2 天

### WO-050　CLI TUI 版本号显示"v未知版本"
- **优先级**：P2
- **模块**：apps/cli
- **文件**：`apps/cli/src/tui/components/LogoBanner.tsx`
- **问题描述**：TUI 启动 banner 版本号未正确注入 package.json 版本，显示"v未知版本"
- **修复方式**：构建时通过 define 注入 `__VERSION__`，或运行时读取 package.json
- **工时**：0.1 天

### WO-051　CLI TUI 审批卡焦点提示不足
- **优先级**：P2
- **模块**：apps/cli
- **文件**：`apps/cli/src/tui/components/ApprovalCard.tsx`
- **问题描述**：审批卡出现时无明确焦点指示或高亮，新用户不知按 1/2/3 操作，可能误以为卡死
- **修复方式**：审批卡出现时自动聚焦，添加闪烁边框或"按 1 允许一次 / 2 总是允许 / 3 拒绝"的醒目提示
- **截图证据**：`screenshots/cli/tui-approval.png`
- **工时**：0.2 天

---

## 对话框改造（对齐 DSH 设计，27 项）

> 来源：DSH (DeepSeek Harness) 对话框设计深度阅读与对比分析
> 详见：`_audit/dialog-redesign-workorder.md`（路径勘误：实为 `docs/audit/`）
> **状态（2026-09-19，晚风拍板采纳）**：已解禁——规格唯一来源=DESIGN.md §13.L（v2.19 / ADR D43），按 §13.L 过滤执行：WO-057 记 Phase 3 可选；不做 WO-063/065/067/070/071/072。

### WO-052　输入框卡片圆角与阴影对齐 DSH 22px 规格
- **优先级**：P0
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/Composer.tsx:469`
- **问题描述**：圆角仅 12px + border 线；DSH 为 22px 全圆角 + soft elevation shadow 无 border
- **修复方式**：rounded-xl→rounded-[22px]，border→elevation shadow，聚焦态改投影加深
- **工时**：0.5 天

### WO-053　输入框内边距与文本↔工具栏间距分层
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/Composer.tsx:469,550`
- **问题描述**：p-3 全方向 padding + mt-2 间距；DSH 为 pt-8px + gap-12px + 工具栏 padding 2px/8px/6px
- **修复方式**：分层 padding，text↔toolbar gap 改 12px
- **工时**：0.5 天

### WO-054　输入框最大行数从 6 行扩展到 14 行
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/Composer.tsx:102,155`
- **问题描述**：MAX_HEIGHT=144（6 行），DSH 为 14 行（约 336px）
- **修复方式**：MAX_HEIGHT 改 336，max-h-36 改 max-h-[336px]
- **工时**：0.2 天

### WO-055　发送/停止按钮颜色与尺寸对齐 DSH info-fill 蓝
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/Composer.tsx:737-758`
- **问题描述**：32px + bg-primary；DSH 为 34px + info-fill 蓝(#3964FE/#679EFE) + 白图标
- **修复方式**：size-8→size-[34px]，bg-primary→info-fill 蓝
- **工时**：0.3 天

### WO-056　工具栏布局：模型选择器移到右侧发送钮旁
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/Composer.tsx:690-709`
- **问题描述**：ModelPicker 在左侧中间；DSH 将 model 紧贴发送钮左侧
- **修复方式**：ModelPicker/EffortPicker 移到右侧 trailing 区
- **工时**：0.3 天

### WO-057　ContextMeter：UsageBar 横条改为环形进度指示器
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/UsageBar.tsx`
- **问题描述**：横条进度在输入框上方；DSH 为 SVG 环形圆环 + 百分比在输入框下方 dock，点击展开三段彩色详情
- **修复方式**：横条→14px 圆环 SVG，移到下方 dock，加点击展开详情面板
- **工时**：1.5 天

### WO-058　用户消息气泡：移除 YOU 标签，圆角改 22px 全圆角
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/MessageItem.tsx:33-55`
- **问题描述**：有 YOU 标签 + rounded-[18px] rounded-br-[4px] + max-w-[80%]；DSH 无标签 + 22px 全圆角 + max-width 70.2%
- **修复方式**：移除 RoleLabel，圆角改 22px，max-w 改 70.2%，padding 改 10px 16px
- **工时**：0.5 天

### WO-059　助手消息：移除模型名 RoleLabel
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/MessageItem.tsx:63-66`
- **问题描述**：每条助手消息前显示模型名标签；DSH 无角色标签
- **修复方式**：移除助手消息前的 RoleLabel
- **工时**：0.2 天

### WO-060　消息操作行：hover 渐显 + 28px 命中区
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/AssistantActions.tsx`
- **问题描述**：操作图标始终可见 + 20px 命中区；DSH hover 渐显 + 28px 命中区 + 15px 图标
- **修复方式**：非尾部行 opacity 0→1 hover，按钮 size-5→size-7
- **工时**：0.5 天

### WO-061　工具卡片：运行时 sweep 扫光动画
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/ToolCard.tsx:84-86`
- **问题描述**：运行时 Loader2 spinner；DSH 为 300px 渐变扫光动画（2.6s 循环）
- **修复方式**：移除 spinner，添加 sweep 伪元素动画
- **工时**：0.5 天

### WO-062　思考过程：sweep 动画 + Markdown 渲染
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/ReasoningCollapsible.tsx:80-84`
- **问题描述**：纯文本渲染无动画；DSH 为 MarkdownText compact + sweep 动画 + 22px 缩进
- **修复方式**：展开内容改 Streamdown markdown，加 sweep 动画
- **工时**：0.5 天

### WO-063　运行中状态："Deep diving" 渐变 shimmer 文字
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/TurnHeader.tsx`、`ChatView.tsx`
- **问题描述**：TurnHeader "工作中 · Ns" 无动画；DSH 为渐变 shimmer "Deep diving" + 15s 后显计时器
- **修复方式**：消息流底部添加渐变 shimmer 状态行 + 计时器
- **工时**：1.0 天

### WO-064　回到底部按钮：右对齐 + 34px floating 样式
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/BackBottom.tsx`
- **问题描述**：28px 居中 + border 样式；DSH 为 34px 右对齐 + floating fill + shadow
- **修复方式**：size-7→size-[34px]，居中→右对齐，border→floating shadow
- **工时**：0.3 天

### WO-065　审批卡：接管输入框而非流程内嵌
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/ApprovalCard.tsx`、`MessageItem.tsx:105-109`
- **问题描述**：审批卡在消息流中插入卡片；DSH 审批接管输入框位置
- **修复方式**：pending 审批时 Composer 替换为审批面板，消息流中仅渲染已解决摘要
- **工时**：1.5 天

### WO-066　输入框内附件预览：64×64px 缩略图 + 关闭钮
- **优先级**：P1
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/AttachmentChips.tsx`
- **问题描述**：附件为文本路径 chip；DSH 为 64×64px 缩略图 16px 圆角 + hover 关闭钮
- **修复方式**：图片附件改缩略图方块，文件附件改卡片式
- **工时**：1.0 天

### WO-067　输入框编辑器：从 textarea 迁移到 contenteditable
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/Composer.tsx:517`
- **问题描述**：原生 textarea；DSH 用 Lexical contenteditable 支持 @芯片内嵌
- **修复方式**：评估 Lexical 引入成本，优先实现 @chip 内嵌
- **工时**：3.0 天

### WO-068　消息流间距：16px flow gap 统一
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/ChatView.tsx`、`ToolCard.tsx`、`ReasoningCollapsible.tsx`
- **问题描述**：行间距分散控制（my-1=4px）；DSH 统一 16px flow gap
- **修复方式**：统一 row gap 16px，移除各组件自 margin
- **工时**：0.3 天

### WO-069　回到底部按钮：sticky 定位
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/BackBottom.tsx`
- **问题描述**：absolute 定位可能遮挡内容；DSH 为 sticky 零高度槽位
- **修复方式**：absolute→sticky，height 0，z-index 8
- **工时**：0.2 天

### WO-070　Turn 导航 rail：右侧 tick mark 导航条
- **优先级**：P2
- **模块**：apps/web
- **文件**：新增 `apps/web/src/features/chat/TurnRail.tsx`
- **问题描述**：无 Turn 导航；DSH 右侧 rail tick mark + hover 预览
- **修复方式**：添加 sticky 右侧导航条，tick mark + hover tooltip
- **工时**：2.0 天

### WO-071　回合级 token 用量胶囊：TurnUsagePanel 样式
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/AssistantBlock.tsx:77-81`
- **问题描述**：纯文本 "in X · out Y"；DSH 为胶囊按钮 + 点击展开详情弹窗
- **修复方式**：文本→胶囊按钮，点击展开 input/cache/output 分项
- **工时**：1.0 天

### WO-072　会话级统计胶囊：StatsPills
- **优先级**：P2
- **模块**：apps/web
- **文件**：新增 `apps/web/src/features/chat/StatsPills.tsx`
- **问题描述**：无会话级统计；DSH 输入框下方 dock 双胶囊（gauge + database）
- **修复方式**：添加 TimePill + UsagePill 双胶囊 + 详情弹窗
- **工时**：1.5 天

### WO-073　加载更早消息：顶部居中按钮
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/ChatView.tsx`
- **问题描述**：virtuoso 自动加载无显式按钮；DSH 顶部居中"加载更早"按钮
- **修复方式**：Virtuoso 顶部添加加载更早按钮
- **工时**：0.3 天

### WO-074　错误状态：TurnErrorItem + 重试倒计时
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/MessageItem.tsx`
- **问题描述**：无重试倒计时展示；DSH 有 TurnErrorItem + ModelRetryItem（倒计时 + shimmer）
- **修复方式**：添加错误行 + 重试倒计时 + max tokens 警告行
- **工时**：1.0 天

### WO-075　占位符动态变化：多级优先级
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/Composer.tsx:539-545`
- **问题描述**：三态占位符；DSH 有 steerQueue>plan>default 多级优先级
- **修复方式**：添加 steer 模式占位符
- **工时**：0.2 天

### WO-076　移动端适配：窄屏胶囊折叠为纯图标
- **优先级**：P2
- **模块**：apps/web
- **文件**：多个组件
- **问题描述**：无窄屏适配；DSH 在 <480px 时胶囊折叠为纯图标
- **修复方式**：窄屏下统计胶囊折叠为图标，工具栏 trailing 组换行
- **工时**：0.5 天

### WO-077　文件卡片样式：消息内附件展示
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/MessageItem.tsx:37-51`
- **问题描述**：消息内附件仅图片缩略图；DSH 文件附件以 240px 宽卡片展示（图标+文件名+大小）
- **修复方式**：文件附件改卡片式（240px 宽 + 图标 + 文件名 + 元信息）
- **工时**：0.5 天

### WO-078　输入框字体大小：从 13px 调整为 14px
- **优先级**：P2
- **模块**：apps/web
- **文件**：`apps/web/src/features/chat/Composer.tsx:546`、`AssistantBlock.tsx:40`
- **问题描述**：输入框和正文 13px；DSH 为 14px line-height 24px
- **修复方式**：text-[13px]→text-[14px]，line-height→24px
- **工时**：0.2 天

---

## 统计

| 优先级 | 数量 | 预估总工时 |
|--------|------|-----------|
| P0 | 5 | 3.1 天 |
| P1 | 36 | 18.8 天 |
| P2 | 37 | 20.0 天 |
| **合计** | **78** | **~41.9 天** |
