import * as React from "react";
import Link from "next/link";
import { BlurFade } from "@/components/magicui/blur-fade";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * QuickStartCTA — 页尾双栏起跑区（对标 x.ai "Choose how to get started" 两栏骨架，
 * DESIGN v2.29；zinc-950 暗带收尾，与 SessionDemo 暗带首尾呼应）。
 * 左栏=使用者路径，右栏=贡献者路径；每条 bullet 都是可核实事实（禁假状态 §5）：
 * - Node >=24：根 package.json engines；4318/回环：SPARK_DEFAULTS
 * - Mock 同构与 e2e：AGENTS §1.1 MockTransport 对等纪律、doc/06
 * - 契约用例/词表页生成物入库：工单 14.2/14.6（CI git diff 校同步）
 * 文案不焊箭头（§12.7 对按钮生效；此处 CTA 均为按钮故不带箭头）。
 */

interface StartPath {
  title: string;
  desc: string;
  bullets: readonly string[];
  ctaLabel: string;
  ctaHref: string;
  ctaExternal: boolean;
}

const PATHS: readonly StartPath[] = [
  {
    title: "在终端里跑",
    desc: "全局装一个 CLI 包，一条命令拉起本机 server 并进入 TUI。",
    bullets: [
      "Node.js ≥ 24 · npm i -g @spark/cli",
      "spark up → TUI，server 缺省 127.0.0.1:4318",
      "首回合前配一次模型：~/.spark/models.json",
      "退出连带回收 server，会话落盘 ~/.spark/sessions/",
    ],
    ctaLabel: "阅读快速上手",
    ctaHref: "/quickstart",
    ctaExternal: false,
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
  },
];

export function QuickStartCTA(): React.JSX.Element {
  return (
    <section
      id="quickstart"
      className="border-t border-zinc-800 bg-zinc-950 px-6 py-32"
      aria-labelledby="quickstart-heading"
    >
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0}>
          <header className="mx-auto max-w-2xl text-center">
            <h2
              id="quickstart-heading"
              className="text-[30px] font-semibold tracking-tight text-zinc-50 sm:text-[38px]"
            >
              两条路，都在你自己的机器上
            </h2>
            <p className="mt-3 text-base text-zinc-400">
              使用者一条命令进 TUI；贡献者从协议包读起。没有云端依赖，也没有绕过本机的路径。
            </p>
          </header>
        </BlurFade>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2">
          {PATHS.map((path, index) => (
            <BlurFade key={path.title} delay={0.05 + index * 0.08} yOffset={16}>
              <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-8">
                <h3 className="text-lg font-semibold text-zinc-50">{path.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{path.desc}</p>
                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {path.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 text-sm text-zinc-300">
                      <span aria-hidden="true" className="shrink-0 font-mono text-zinc-600">
                        —
                      </span>
                      {bullet}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  {path.ctaExternal ? (
                    <a
                      href={path.ctaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "lg" }),
                        "border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50",
                      )}
                    >
                      {path.ctaLabel}
                    </a>
                  ) : (
                    <Link
                      href={path.ctaHref}
                      className={cn(buttonVariants({ size: "lg" }))}
                    >
                      {path.ctaLabel}
                    </Link>
                  )}
                </div>
              </div>
            </BlurFade>
          ))}
        </div>

        <p className="mt-12 text-center font-mono text-xs text-zinc-500">
          MIT 许可 · 默认只监听 127.0.0.1 · 无云端依赖
        </p>
      </div>
    </section>
  );
}

QuickStartCTA.displayName = "QuickStartCTA";
