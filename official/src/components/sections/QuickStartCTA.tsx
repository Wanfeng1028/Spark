import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { BlurFade } from "@/components/magicui/blur-fade";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * QuickStartCTA — 页尾双栏起跑区（x.ai "Choose how to get started" 实拍同构，v2.31）：
 * 巨字居中 + 两张浅灰大卡（bg-zinc-100），卡内=标题 + 描述 + 分隔线 + ✓ 清单 +
 * 全宽 CTA（左=黑底胶囊，右=描边）——v2.30 的暗带版依实拍翻亮。
 * 每条 bullet 都是可核实事实（禁假状态 §5）：Node >=24=根 engines；4318=SPARK_DEFAULTS；
 * Mock 同构=AGENTS §1.1；生成物入库=工单 14.2/14.6。
 */

interface StartPath {
  title: string;
  desc: string;
  bullets: readonly string[];
  ctaLabel: string;
  ctaHref: string;
  ctaExternal: boolean;
  primary: boolean;
}

const PATHS: readonly StartPath[] = [
  {
    title: "在终端里跑",
    desc: "npm 发布落地前先 clone 源码：装一次依赖、出一条 server bundle，一条命令进 TUI。",
    bullets: [
      "Node.js ≥ 24 · pnpm 9（源码跑）",
      "node apps/cli/dist/main.js up → TUI，server 缺省 127.0.0.1:4318",
      "首回合前配一次模型：~/.spark/models.json",
      "退出连带回收 server，会话落盘 ~/.spark/sessions/",
    ],
    ctaLabel: "阅读快速上手",
    ctaHref: "/quickstart",
    ctaExternal: false,
    primary: true,
  },
  {
    title: "先读源码与文档",
    desc: "从协议包读起：事件词表与 Transport 是四端共享的运行时核。",
    bullets: [
      "27 种事件 · applyEvent reducer 逐一单测",
      "MockTransport 与 HttpTransport 同构，前端可脱离后端开发",
      "契约用例与词表页生成物入库，CI 校同步",
      "MIT · 复用代码保留版权声明",
    ],
    ctaLabel: "浏览源码",
    ctaHref: LINKS.github,
    ctaExternal: true,
    primary: false,
  },
];

export function QuickStartCTA(): React.JSX.Element {
  return (
    <section
      id="quickstart"
      className="scroll-mt-16 px-6 py-32"
      aria-labelledby="quickstart-heading"
    >
      <div className="mx-auto max-w-6xl">
        <BlurFade delay={0}>
          <h2
            id="quickstart-heading"
            className="text-center text-[36px] font-medium tracking-[-0.02em] text-zinc-900 sm:text-[52px]"
          >
            两条起步路径
          </h2>
        </BlurFade>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2">
          {PATHS.map((path, index) => (
            <BlurFade key={path.title} delay={0.05 + index * 0.08} yOffset={16}>
              <div className="flex h-full flex-col rounded-2xl bg-zinc-100 p-8 sm:p-10">
                <h3 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  {path.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-zinc-600">{path.desc}</p>

                {/* 分隔线（x.ai 起跑卡同构：标题区与清单间一条 hairline） */}
                <div aria-hidden="true" className="my-7 border-t border-zinc-200" />

                <ul className="flex flex-1 flex-col gap-4">
                  {path.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-base text-zinc-700">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400"
                        aria-hidden="true"
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>

                <div className="mt-10">
                  {path.ctaExternal ? (
                    <a
                      href={path.ctaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "lg" }),
                        "w-full rounded-full border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
                      )}
                    >
                      {path.ctaLabel}
                    </a>
                  ) : (
                    <Link
                      href={path.ctaHref}
                      className={cn(
                        buttonVariants({ variant: "default", size: "lg" }),
                        "w-full rounded-full bg-zinc-900 text-white hover:bg-zinc-800",
                      )}
                    >
                      {path.ctaLabel}
                    </Link>
                  )}
                </div>
              </div>
            </BlurFade>
          ))}
        </div>

        <p className="mt-14 text-center font-mono text-xs text-muted-foreground">
          MIT 许可 · 默认只监听 127.0.0.1 · 无账号体系
        </p>
      </div>
    </section>
  );
}

QuickStartCTA.displayName = "QuickStartCTA";
