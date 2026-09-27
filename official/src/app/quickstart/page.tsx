import type { Metadata } from "next";
import Link from "next/link";
import { BlurFade } from "@/components/magicui/blur-fade";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import type { Lang } from "@/lib/i18n";

/**
 * 本页每条命令、端口、文件路径都可回源码核对（DESIGN §5 禁假状态）：
 * - 安装命令 / 缺省端口：apps/cli/src/main.tsx USAGE、apps/cli/src/up.ts
 * - server 绑定与静态托管：packages/engine/src/config.ts SPARK_DEFAULTS、apps/server/src/{index,static}.ts
 * - 三配置文件：packages/engine/src/config.ts loadConfig（~/.spark/{spark.json,models.json,permissions.json}）
 * - 供应商目录：packages/engine/src/model-catalog.ts PROVIDER_CATALOG（内置 8 家）
 */

export const metadata: Metadata = {
  title: "快速上手",
  description: "安装 CLI、启动 server 与 TUI、配置模型、开始对话四步。",
};

export const dynamic = "force-static";

/** quickstart 文案对（19.47 批 2b）：段落按 code 夹层拆键，en 缺键编译红 */
const QS_COPY = {
  zh: {
    heading: "快速上手",
    sub: "全局装一个 CLI 包，一条命令拉起本机 server 并进入终端 TUI，再声明一次模型供应商。以下命令、端口与文件路径逐条对应仓库源码。",
    prereqH: "前提条件",
    prereqP: "Spark 运行在 Node.js 之上。确保本机已安装 Node.js 24 或更高版本，以及 npm 或 pnpm 包管理器。可通过以下命令确认：",
    prereqCode: "node --version   # 需要 >= 24",
    installH: "安装",
    installP1a: "的 npm 发布尚未落地（v1.0.0 已打 tag，发布步卡在 CI 凭证），当前只能从源码跑。装一次依赖、出一条 server bundle，之后的",
    installP1b: "与全局安装后的",
    installP1c: "走的是同一条代码路径：",
    installCode1: "git clone https://github.com/Wanfeng1028/Spark && cd Spark\npnpm install                    # Node ≥ 24 · pnpm 9\npnpm --filter @spark/cli build  # 出 server 的 esbuild 单文件 bundle",
    installP2a: "发布落地后这一段回到",
    installP2b: "（pnpm 为",
    installP2c: "）。",
    startH: "启动",
    startP1a: "进入目标项目目录，运行",
    startP1b: "启动本地 Agent 工作台：",
    startCode1: "cd your-project\nnode <Spark 仓库路径>/apps/cli/dist/main.js up   # 源码态；npm 发布后即 spark up",
    startP2a: "server 缺省绑定",
    startP2b: "（端口取",
    startP2c: "，否则落",
    startP2d: "的",
    startP2e: "），仅本机可访问。",
    startP3a: "轮询",
    startP3b: "就绪后把终端交给 Ink TUI，不会替你打开浏览器。想用 Web 工作台自行访问同一地址即可——server 静态托管",
    startP3c: "，未知路由回 index.html。TUI 退出连带回收本命令拉起的 server 子进程，不留残留。",
    startP4a: "已有 server 在跑时，",
    startP4b: "探测命中直接复用，不重复拉起；自定义基址用",
    startP4c: "或环境变量",
    modelH: "配置模型",
    modelP1a: "引擎内置 8 家供应商目录（openai / anthropic / deepseek / openrouter / groq / together / xai / mistral），也可用 baseUrl 指向任何 OpenAI 兼容端点。首回合前在",
    modelP1b: "声明一次即可，defaultModel 必填：",
    modelP2: "API key 只从环境变量读取，不落盘、不入日志：",
    modelP3a: "共三个配置文件，均在",
    modelP3b: "下：",
    modelP3c: "（server 绑定与引擎行为，可缺省）、",
    modelP3d: "（供应商与模型路由，必填）、",
    modelP3e: "（审批规则表，缺省为空 = 全部落默认 ask）。加载即 zod 校验，失败报",
    modelP3f: "启动即败，不带病运行。",
    chatH: "开始对话",
    chatP1a: "在 TUI 直接输入自然语言即可开聊；Web 工作台访问",
    chatP1b: "。每次工具调用的输入、输出、耗时都以事件形式实时投影到界面，写类工具与 bash 会弹审批卡（1 允许一次 / 2 总是允许 / 4 本项目总是允许 / 3 拒绝并给建议），超时未响应一律拒绝。",
    nextH: "下一步",
    nextSub: "相关文档：",
    btnArch: "架构详情",
    btnFeat: "核心能力",
    btnDocs: "仓库文档",
  },
  en: {
    heading: "Quickstart",
    sub: "Install one CLI package globally, start the local server and enter the terminal TUI with a single command, then declare a model provider once. Every command, port and file path below maps to the repository source.",
    prereqH: "Prerequisites",
    prereqP: "Spark runs on Node.js. Make sure Node.js 24 or newer is installed, plus npm or pnpm. Verify with:",
    prereqCode: "node --version   # needs >= 24",
    installH: "Install",
    installP1a: "'s npm release has not landed yet (v1.0.0 is tagged; the publish step waits on CI credentials), so run from source for now. Install dependencies once, build one server bundle — the",
    installP1b: "afterwards and the globally installed",
    installP1c: "share the same code path:",
    installCode1: "git clone https://github.com/Wanfeng1028/Spark && cd Spark\npnpm install                    # Node >= 24, pnpm 9\npnpm --filter @spark/cli build  # esbuild single-file bundle for the server",
    installP2a: "Once published, this section becomes",
    installP2b: " (with pnpm:",
    installP2c: ").",
    startH: "Start",
    startP1a: "Enter your target project directory and run",
    startP1b: "to start the local Agent workbench:",
    startCode1: "cd your-project\nnode <path-to-Spark>/apps/cli/dist/main.js up   # from source; becomes spark up after the npm release",
    startP2a: "The server binds to",
    startP2b: "(the port comes from",
    startP2c: ", otherwise from",
    startP2d: "in",
    startP2e: ") — reachable from this machine only.",
    startP3a: "polls",
    startP3b: "until ready, then hands the terminal to the Ink TUI — it never opens a browser for you. For the Web workbench, visit the same address yourself — the server statically serves",
    startP3c: "with unknown routes falling back to index.html. Exiting the TUI tears down the server child process it started — nothing left behind.",
    startP4a: "If a server is already running,",
    startP4b: "detects and reuses it instead of starting a second one; point at a custom base URL with",
    startP4c: "or the environment variable",
    modelH: "Configure a model",
    modelP1a: "The engine ships a catalog of 8 providers (openai / anthropic / deepseek / openrouter / groq / together / xai / mistral); baseUrl can point at any OpenAI-compatible endpoint. Declare it once in",
    modelP1b: "before the first turn — defaultModel is required:",
    modelP2: "API keys are read from environment variables only — never persisted, never logged:",
    modelP3a: "Three config files live under",
    modelP3b: ":",
    modelP3c: "(server binding and engine behavior, optional),",
    modelP3d: "(providers and model routing, required),",
    modelP3e: "(approval rules; empty by default = everything falls back to ask). Loading runs zod validation — a failure raises",
    modelP3f: "and startup aborts. No running in a broken state.",
    chatH: "Start chatting",
    chatP1a: "Type natural language in the TUI to begin; the Web workbench lives at",
    chatP1b: ". Every tool call's input, output and duration stream onto the screen as events; write-class tools and bash raise an approval card (1 allow once / 2 always allow / 4 always for this project / 3 reject with advice) — an unanswered ask settles to reject.",
    nextH: "Next steps",
    nextSub: "Related docs:",
    btnArch: "Architecture",
    btnFeat: "Capabilities",
    btnDocs: "In-repo docs",
  },
} as const;

/** 页面内容本体：en 壳（app/en/quickstart/page.tsx）复用本组件（19.47 批 2） */
export function QuickStartPageContent({ lang = "zh" }: { lang?: Lang }) {
  const copy = QS_COPY[lang];
  const codeCls =
    "mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs";
  return (
    <div className={lang === "en" ? "lang-en" : undefined}>
      <div className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-[36px] font-medium leading-[1.2] text-foreground en:font-normal en:tracking-[-0.025em] sm:text-[44px]">
            {copy.heading}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">{copy.sub}</p>
        </div>
      </div>

      <div className="px-6 pb-32">
        <div className="mx-auto max-w-4xl space-y-16">
          {/* 前提条件 */}
          <BlurFade delay={0}>
            <section>
              <h2 className="text-xl font-semibold text-foreground">{copy.prereqH}</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.prereqP}
              </p>
              <div className="mt-4">
                <CodeBlock code={copy.prereqCode} language="bash" />
              </div>
            </section>
          </BlurFade>

          {/* 安装 */}
          <BlurFade delay={0.06}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">{copy.installH}</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                <code className={codeCls}>@spark/cli</code>
                {copy.installP1a}
                <code className={codeCls}>up</code>
                {copy.installP1b}
                <code className={codeCls}>spark up</code>
                {copy.installP1c}
              </p>
              <div className="mt-4">
                <CodeBlock code={copy.installCode1} language="bash" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {copy.installP2a}
                <code className={codeCls}>npm i -g @spark/cli</code>
                {copy.installP2b}
                <code className={codeCls}>pnpm add -g @spark/cli</code>
                {copy.installP2c}
              </p>
            </section>
          </BlurFade>

          {/* 启动 */}
          <BlurFade delay={0.12}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">{copy.startH}</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.startP1a}
                <code className={codeCls}>spark up</code>
                {copy.startP1b}
              </p>
              <div className="mt-4">
                <CodeBlock code={copy.startCode1} language="bash" />
              </div>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.startP2a}
                <code className={codeCls}>127.0.0.1:4318</code>
                {copy.startP2b}
                <code className={codeCls}>SPARK_PORT</code>
                {copy.startP2c}
                <code className={codeCls}>~/.spark/spark.json</code>
                {copy.startP2d}
                <code className={codeCls}>server.port</code>
                {copy.startP2e}
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                <code className={`${codeCls} mr-1.5`}>spark up</code>
                {copy.startP3a}
                <code className={codeCls}>/api/healthz</code>
                {copy.startP3b}
                <code className={codeCls}>apps/web/dist</code>
                {copy.startP3c}
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.startP4a}
                <code className={codeCls}>spark up</code>
                {copy.startP4b}
                <code className={codeCls}>spark up --api &lt;url&gt;</code>
                {copy.startP4c}
                <code className={`${codeCls} ml-1.5`}>SPARK_API</code>。
              </p>
            </section>
          </BlurFade>

          {/* 配置模型 */}
          <BlurFade delay={0.18}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">{copy.modelH}</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.modelP1a}
                <code className={codeCls}>~/.spark/models.json</code>
                {copy.modelP1b}
              </p>
              <div className="mt-4">
                <CodeBlock
                  code={`{
  "providers": {
    "deepseek": {
      "apiKeyEnv": "DEEPSEEK_API_KEY",
      "baseUrl": "https://api.deepseek.com/v1"
    }
  },
  "defaultModel": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "contextWindow": 128000
  }
}`}
                  language="~/.spark/models.json"
                />
              </div>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.modelP2}
              </p>
              <div className="mt-4">
                <CodeBlock code={`export DEEPSEEK_API_KEY=sk-...`} language="bash" />
              </div>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.modelP3a}
                <code className={codeCls}>~/.spark/</code>
                {copy.modelP3b}
                <code className={codeCls}>spark.json</code>
                {copy.modelP3c}
                <code className={codeCls}>models.json</code>
                {copy.modelP3d}
                <code className={codeCls}>permissions.json</code>
                {copy.modelP3e}
                <code className={codeCls}>E_CONFIG</code>
                {copy.modelP3f}
              </p>
            </section>
          </BlurFade>

          {/* 开始对话 */}
          <BlurFade delay={0.24}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">{copy.chatH}</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.chatP1a}
                <code className={codeCls}>http://127.0.0.1:4318</code>
                {copy.chatP1b}
              </p>
            </section>
          </BlurFade>

          {/* 下一步 */}
          <BlurFade delay={0.3}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">{copy.nextH}</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.nextSub}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={lang === "en" ? "/en/architecture" : "/architecture"}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {copy.btnArch}
                </Link>
                <Link
                  href={lang === "en" ? "/en/features" : "/features"}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {copy.btnFeat}
                </Link>
                <a
                  href={LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline" })}
                >
                  GitHub
                </a>
                <a
                  href={LINKS.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline" })}
                >
                  {copy.btnDocs}
                </a>
              </div>
            </section>
          </BlurFade>
        </div>
      </div>
    </div>
  );
}

export default QuickStartPageContent;
