import type { Metadata } from "next";
import Link from "next/link";
import { BlurFade } from "@/components/magicui/blur-fade";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";

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

export default function QuickStartPage() {
  return (
    <>
      <div className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-[36px] font-semibold tracking-tight text-foreground sm:text-[44px]">
            快速上手
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            全局装一个 CLI 包，一条命令拉起本机 server 并进入终端
            TUI，再声明一次模型供应商。以下命令、端口与文件路径逐条对应仓库源码。
          </p>
        </div>
      </div>

      <div className="px-6 pb-32">
        <div className="mx-auto max-w-4xl space-y-16">
          {/* 前提条件 */}
          <BlurFade delay={0}>
            <section>
              <h2 className="text-xl font-semibold text-foreground">
                前提条件
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Spark 运行在 Node.js 之上。确保本机已安装 Node.js 24
                或更高版本，以及 npm 或 pnpm 包管理器。可通过以下命令确认：
              </p>
              <div className="mt-4">
                <CodeBlock code="node --version   # 需要 >= 24" language="bash" />
              </div>
            </section>
          </BlurFade>

          {/* 安装 */}
          <BlurFade delay={0.06}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">安装</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">@spark/cli</code>
                的 npm 发布尚未落地（v1.0.0 已打 tag，发布步卡在 CI 凭证），当前只能从源码跑。
                装一次依赖、出一条 server bundle，之后的
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">up</code>
                与全局安装后的
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">spark up</code>
                走的是同一条代码路径：
              </p>
              <div className="mt-4">
                <CodeBlock
                  code={`git clone https://github.com/Wanfeng1028/Spark && cd Spark
pnpm install                    # Node ≥ 24 · pnpm 9
pnpm --filter @spark/cli build  # 出 server 的 esbuild 单文件 bundle`}
                  language="bash"
                />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                发布落地后这一段回到
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">npm i -g @spark/cli</code>
                （pnpm 为
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">pnpm add -g @spark/cli</code>）。
              </p>
            </section>
          </BlurFade>

          {/* 启动 */}
          <BlurFade delay={0.12}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">启动</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                进入目标项目目录，运行
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">spark up</code>
                启动本地 Agent 工作台：
              </p>
              <div className="mt-4">
                <CodeBlock
                  code={`cd your-project\nnode <Spark 仓库路径>/apps/cli/dist/main.js up   # 源码态；npm 发布后即 spark up`}
                  language="bash"
                />
              </div>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                server 缺省绑定
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">127.0.0.1:4318</code>
                （端口取
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">SPARK_PORT</code>
                ，否则落
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">~/.spark/spark.json</code>
                的
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">server.port</code>
                ），仅本机可访问。
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                <code className="mr-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">spark up</code>
                轮询
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">/api/healthz</code>
                就绪后把终端交给 Ink TUI，不会替你打开浏览器。想用 Web
                工作台自行访问同一地址即可——server 静态托管
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">apps/web/dist</code>
                ，未知路由回 index.html。TUI 退出连带回收本命令拉起的 server
                子进程，不留残留。
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                已有 server 在跑时，
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">spark up</code>
                探测命中直接复用，不重复拉起；自定义基址用
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">spark up --api &lt;url&gt;</code>
                或环境变量
                <code className="ml-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">SPARK_API</code>
                。
              </p>
            </section>
          </BlurFade>

          {/* 配置模型 */}
          <BlurFade delay={0.18}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">
                配置模型
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                引擎内置 8 家供应商目录（openai / anthropic / deepseek /
                openrouter / groq / together / xai / mistral），也可用
                baseUrl 指向任何 OpenAI 兼容端点。首回合前在
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">~/.spark/models.json</code>
                声明一次即可，defaultModel 必填：
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
                API key 只从环境变量读取，不落盘、不入日志：
              </p>
              <div className="mt-4">
                <CodeBlock
                  code={`export DEEPSEEK_API_KEY=sk-...`}
                  language="bash"
                />
              </div>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                共三个配置文件，均在
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">~/.spark/</code>
                下：
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">spark.json</code>
                （server 绑定与引擎行为，可缺省）、
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">models.json</code>
                （供应商与模型路由，必填）、
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">permissions.json</code>
                （审批规则表，缺省为空 = 全部落默认 ask）。加载即 zod
                校验，失败报
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">E_CONFIG</code>
                启动即败，不带病运行。
              </p>
            </section>
          </BlurFade>

          {/* 开始对话 */}
          <BlurFade delay={0.24}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">
                开始对话
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                在 TUI 直接输入自然语言即可开聊；Web 工作台访问
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">http://127.0.0.1:4318</code>
                。每次工具调用的输入、输出、耗时都以事件形式实时投影到界面，写类工具与
                bash 会弹审批卡（1 允许一次 / 2 总是允许 / 4 本项目总是允许 / 3
                拒绝并给建议），超时未响应一律拒绝。
              </p>
            </section>
          </BlurFade>

          {/* 下一步 */}
          <BlurFade delay={0.3}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">下一步</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                相关文档：
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/architecture"
                  className={buttonVariants({ variant: "outline" })}
                >
                  架构详情
                </Link>
                <Link
                  href="/features"
                  className={buttonVariants({ variant: "outline" })}
                >
                  核心能力
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
                  仓库文档
                </a>
              </div>
            </section>
          </BlurFade>
        </div>
      </div>
    </>
  );
}
