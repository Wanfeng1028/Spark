import type { Metadata } from "next";
import Link from "next/link";
import { BlurFade } from "@/components/magicui/blur-fade";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "快速上手 — Spark",
  description: "三步安装，本地启动 Agent 工作台",
};

export const dynamic = "force-static";

export default function QuickStartPage() {
  return (
    <>
      <div className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-[32px] font-semibold tracking-tight text-foreground">
            快速上手
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            从安装到第一次对话，只需要几分钟。
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
                全局安装 CLI，它会同时拉取引擎和服务端依赖：
              </p>
              <div className="mt-4">
                <CodeBlock code="npm i -g @spark/cli" language="bash" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground/80">
                如果使用 pnpm：<code className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">pnpm add -g @spark/cli</code>
              </p>
            </section>
          </BlurFade>

          {/* 启动 */}
          <BlurFade delay={0.12}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">启动</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                进入你的项目目录，运行
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">spark up</code>
                启动本地 Agent 工作台：
              </p>
              <div className="mt-4">
                <CodeBlock
                  code={`cd your-project\nspark up`}
                  language="bash"
                />
              </div>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                服务器默认绑定 127.0.0.1:3100，仅本机可访问。启动后浏览器会自动打开
                Web UI。如果需要 CLI 模式，直接在同一终端操作即可。
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
                Spark 支持 OpenAI、Anthropic 和本地模型（通过兼容
                OpenAI 格式的端点）。设置 provider 和 API Key：
              </p>
              <div className="mt-4">
                <CodeBlock
                  code={`spark config set provider openai\nspark config set api-key sk-...`}
                  language="bash"
                />
              </div>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                切换 provider 只需修改 provider 字段，api-key
                会按 provider 隔离存储。配置持久化在
                <code className="mx-1.5 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-xs">~/.spark/config.json</code>
                中。
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
                配置完成后，在 Web UI
                的输入框中直接输入自然语言即可与 Agent
                对话。Agent 会读取当前项目上下文，调用工具完成任务。每次工具调用都会实时展示在界面上——你可以看到它正在做什么、为什么这么做。
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                高危操作（如文件删除、shell
                命令执行）会弹出审批卡片，需要你明确确认后才会执行。超时未响应一律拒绝。
              </p>
            </section>
          </BlurFade>

          {/* 下一步 */}
          <BlurFade delay={0.3}>
            <section className="border-t border-border pt-12">
              <h2 className="text-xl font-semibold text-foreground">下一步</h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                深入了解更多细节：
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
                  href="https://github.com/nicepkg/spark"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline" })}
                >
                  GitHub
                </a>
              </div>
            </section>
          </BlurFade>
        </div>
      </div>
    </>
  );
}
