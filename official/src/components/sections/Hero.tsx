"use client";

import * as React from "react";
import Link from "next/link";
import { BlurText } from "@/components/animations/blur-text";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Hero — x.ai 居中骨架 + Stripe 式品牌色（DESIGN v2.28 官网色彩豁免）。
 * 标题两行：第一行 CJK 逐字浮现（zinc-900），第二行「Agent 工作台」是全站唯一的
 * 渐变文字（indigo→sky 冷色系，非蓝紫 AI 渐变，§12.1 官网豁免处）。
 * 底纹用 .hero-dot-grid（点阵 + 椭圆渐隐，globals.css）——无光晕无毛玻璃。
 * 内容全部是可核实事实（禁假状态，DESIGN §5）；按钮文案不焊箭头（§12.7 P1）。
 */
export function Hero(): React.JSX.Element {
  return (
    <section
      id="hero"
      className="relative flex min-h-[88vh] scroll-mt-16 flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-36 text-center"
      aria-labelledby="hero-title"
    >
      {/* 点阵底纹（纯装饰，对辅助技术隐藏） */}
      <div
        aria-hidden="true"
        className="hero-dot-grid pointer-events-none absolute inset-x-0 top-0 h-[560px]"
      />

      {/* eyebrow pill（x.ai "New — …" 同位；内容为可核实事实，非营销口号） */}
      <p className="relative rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 font-mono text-xs text-indigo-700">
        开源 · MIT — Web / Desktop / CLI / Mobile 四端同一协议
      </p>

      <h1
        id="hero-title"
        className="relative mt-10 max-w-4xl text-[44px] font-bold leading-[1.12] tracking-tight text-zinc-900 sm:text-[60px] lg:text-[72px]"
      >
        <BlurText
          text="跑在你自己机器上的"
          staggerDelay={0.045}
          duration={0.55}
          className="block"
        />
        <span className="mt-1 block bg-[linear-gradient(92deg,#4f46e5_0%,#0ea5e9_100%)] bg-clip-text text-transparent">
          Agent 工作台
        </span>
      </h1>

      <p className="relative mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
        流式对话、工具调用可视化、fail-closed 人工审批——27
        种事件实时驱动四端界面。引擎 headless，数据全程落在本机。
      </p>

      <div className="relative mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
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

      <p className="relative mt-10 font-mono text-sm text-muted-foreground">
        MIT License · Node.js ≥ 24 · 数据落盘 ~/.spark · 无云端依赖
      </p>
    </section>
  );
}

Hero.displayName = "Hero";
