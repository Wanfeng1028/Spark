"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BlurText } from "@/components/animations/blur-text";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Hero — x.ai 居中骨架的实拍校正版（DESIGN v2.31，依据用户提供的 x.ai 截图）：
 * eyebrow pill（内嵌 mini 标签）→ 居中巨字（第二行为旋转词 + 粗下划线，对标
 * "everything you imagine." 的 imagine.）→ 副标 → 双 CTA（主按钮带箭头，x.ai
 * "Get API Access →" 同构——按钮箭头豁免仅此一处，v2.31 登记）→ mono 元信息行。
 * 旋转词在 reduced-motion 下静态取首项。
 * 内容全部是可核实事实（禁假状态，DESIGN §5）；渐变字已移除（x.ai 实拍为纯黑+下划线）。
 */

const ROTATE_WORDS = ["Agent 工作台", "AI 编码搭档", "自动化队友"] as const;

function RotatingWord(): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % ROTATE_WORDS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [reducedMotion]);

  if (reducedMotion) {
    return <span className="border-b-4 border-zinc-900/90 pb-1">{ROTATE_WORDS[0]}</span>;
  }

  return (
    <span className="inline-block border-b-4 border-zinc-900/90 pb-1">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={ROTATE_WORDS[index]}
          className="inline-block"
          initial={{ y: "55%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-55%", opacity: 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
        >
          {ROTATE_WORDS[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

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

      {/* eyebrow pill：内嵌 mini 标签（x.ai "New" 同位） */}
      <p className="relative flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1.5 pr-4 text-xs text-muted-foreground shadow-sm">
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-medium text-indigo-700">
          开源
        </span>
        MIT · 本地优先 · 四端同一协议
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
        <span className="mt-1 block">
          <RotatingWord />
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
        MIT License · Node.js ≥ 24 · 数据落盘 ~/.spark · 无云端依赖
      </p>
    </section>
  );
}

Hero.displayName = "Hero";
