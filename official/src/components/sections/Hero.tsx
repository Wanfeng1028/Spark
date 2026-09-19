"use client";

import * as React from "react";
import Link from "next/link";
import { BlurText } from "@/components/animations/blur-text";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Hero — x.ai 式居中骨架（DESIGN §12.5 官网豁免，v2.27）：eyebrow pill → 居中巨字
 * （§12.3 官网档 44/60/72）→ 副标 → 双 CTA → mono 元信息行。
 * 终端 mock 与产品演示由 SessionDemo 承接（下一个 Section，对标 x.ai 的内联 agent 演示）。
 * 内容全部是可核实事实（禁假状态，DESIGN §5）：四端名单见根 README，27 种事件为
 * EventSchemas 键数（CI 校同步），Node >=24 见根 package.json engines。
 * 按钮文案末尾不焊箭头符号（§12.7 P1），外链语义靠 target="_blank" 表达。
 */
export function Hero(): React.JSX.Element {
  return (
    <section
      id="hero"
      className="flex min-h-[88vh] scroll-mt-16 flex-col items-center justify-center px-6 pb-24 pt-36 text-center"
      aria-labelledby="hero-title"
    >
      {/* eyebrow pill（x.ai "New — …" 同位；内容为可核实事实，非营销口号） */}
      <p className="rounded-full border border-border px-4 py-1.5 font-mono text-xs text-muted-foreground">
        开源 · MIT — Web / Desktop / CLI / Mobile 四端同一协议
      </p>

      <h1
        id="hero-title"
        className="mt-10 max-w-4xl text-[44px] font-semibold leading-[1.08] tracking-tight text-foreground sm:text-[60px] lg:text-[72px]"
      >
        <BlurText
          text="跑在你自己机器上的 Agent 工作台"
          staggerDelay={0.045}
          duration={0.55}
        />
      </h1>

      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
        流式对话、工具调用可视化、fail-closed 人工审批——27
        种事件实时驱动四端界面。引擎 headless，数据全程落在本机。
      </p>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Link
          href="/quickstart"
          className={cn(buttonVariants({ size: "lg" }), "rounded-full px-8")}
        >
          快速上手
        </Link>
        <a
          href={LINKS.github}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          查看源码
        </a>
      </div>

      <p className="mt-10 font-mono text-sm text-muted-foreground">
        MIT License · Node.js ≥ 24 · 数据落盘 ~/.spark · 无云端依赖
      </p>
    </section>
  );
}

Hero.displayName = "Hero";
