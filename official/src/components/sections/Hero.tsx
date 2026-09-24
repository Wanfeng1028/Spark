"use client";

import * as React from "react";
import Link from "next/link";
import { BlurText } from "@/components/animations/blur-text";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Hero — x.ai 居中骨架的实拍校正版（DESIGN v2.31，依据用户提供的 x.ai 截图）：
 * eyebrow pill（内嵌 mini 标签）→ 居中巨字（第二行带粗下划线，对标
 * "everything you imagine." 的 imagine.）→ 副标 → 双 CTA（主按钮带箭头，x.ai
 * "Get API Access →" 同构——按钮箭头豁免仅此一处，v2.31 登记）→ mono 元信息行。
 * 内容全部是可核实事实（禁假状态，DESIGN §5）；渐变字已移除（x.ai 实拍为纯黑+下划线）。
 *
 * 工单 19.44 文案整改：原主标题是第二人称喊话式定位句，第二行是三词同义轮换
 * （工作台 / 编码搭档 / 自动化队友）——无可核实指涉，属 DESIGN §12.7 两条新禁项，
 * 故主标题改陈述式、轮换词组件随之退场（一个名词无需轮换）。
 */

export function Hero(): React.JSX.Element {
  return (
    <section
      id="hero"
      className="relative flex min-h-[82vh] scroll-mt-16 flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-32 text-center"
      aria-labelledby="hero-title"
    >
      {/* 点阵底纹（纯装饰，对辅助技术隐藏） */}
      <div
        aria-hidden="true"
        className="hero-dot-grid pointer-events-none absolute inset-x-0 top-0 h-[520px]"
      />

      {/* eyebrow pill：内嵌 mini 标签（x.ai "New" 同位，橙色点睛 v2.33） */}
      <p className="relative flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1.5 pr-4 text-xs text-muted-foreground shadow-sm">
        <span className="rounded-full bg-orange-100 px-2.5 py-0.5 font-medium text-orange-700">
          开源
        </span>
        MIT · 四端同一协议 · 事件溯源
      </p>

      <h1
        id="hero-title"
        className="relative mt-10 max-w-4xl text-[44px] font-bold leading-[1.12] tracking-tight text-zinc-900 sm:text-[60px] lg:text-[72px]"
      >
        <BlurText
          text="引擎 headless 的"
          staggerDelay={0.045}
          duration={0.55}
          className="block"
        />
        <span className="mt-1 inline-flex flex-col items-center">
          <span className="pb-1">Agent 工作台</span>
          {/* 下划线渐变条（x.ai 移动端 "build." 同构：橙→粉→黄，v2.33） */}
          <span
            aria-hidden="true"
            className="mt-2 h-1 w-full rounded-full bg-[linear-gradient(90deg,#f97316_0%,#ec4899_55%,#f59e0b_100%)]"
          />
        </span>
      </h1>

      <p className="relative mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
        流式对话、工具调用可视化、fail-closed 人工审批——27
        种事件实时驱动四端界面。会话以
        append-only JSONL 落盘，可回放、可分叉、可回滚。
      </p>

      <div className="relative mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Link
          href="/quickstart"
          className={cn(buttonVariants({ size: "lg" }), "rounded-full px-8")}
        >
          快速上手&nbsp;&nbsp;→
        </Link>
        <a
          href={LINKS.github}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "border-transparent bg-zinc-100 hover:bg-zinc-200",
          )}
        >
          查看源码
        </a>
      </div>

      <p className="relative mt-10 font-mono text-sm text-muted-foreground">
        MIT License · Node.js ≥ 24 · 默认监听 127.0.0.1:4318 · 数据落盘 ~/.spark
      </p>
    </section>
  );
}

Hero.displayName = "Hero";
