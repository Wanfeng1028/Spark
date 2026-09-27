"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BlurText } from "@/components/animations/blur-text";
import DarkVeil from "@/components/backgrounds/DarkVeil";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Hero — x.ai 居中骨架的实拍校正版（DESIGN v2.31，依据用户提供的 x.ai 截图）：
 * eyebrow pill（内嵌 mini 标签）→ 居中巨字（第二行为旋转词 + 粗下划线，对标
 * "everything you imagine." 的 imagine.）→ 副标 → 双 CTA（主按钮带箭头，x.ai
 * "Get API Access →" 同构——按钮箭头豁免仅此一处，v2.31 登记）→ mono 元信息行。
 * 旋转词在 reduced-motion 下静态取首项。
 * 内容全部是可核实事实（禁假状态，DESIGN §5）；渐变字已移除（x.ai 实拍为纯黑+下划线）。
 *
 * 工单 19.44 文案整改：主标题原为第二人称喊话式定位句，改陈述式；轮播机制保留（晚风指示），
 * 但词表由三句同义口号（工作台 / 编码搭档 / 自动化队友——指同一件事，轮无可指）换成四个
 * 各有实体的端名，轮换从此承担信息而非声势。判据见 DESIGN §12.7。
 * 工单 19.45：首行静态字换站魂句「一个引擎，四个界面。」，第二行轮换词保持四端名。
 */

/** Hero 文案对（19.47 批 2：显式键，en 缺一条即编译红） */
const HERO_COPY = {
  zh: {
    eyebrowBadge: "开源",
    eyebrow: "MIT · 四端同一协议 · 事件溯源",
    headline: "一个引擎，四个界面。",
    rotateWords: ["Web 工作台", "Electron 桌面壳", "CLI TUI", "移动端 App"],
    sub: "流式对话、工具调用可视化、fail-closed 人工审批。27 种事件实时驱动四端界面，会话以 append-only JSONL 落盘，可回放、可分叉、可回滚。",
    ctaPrimary: "快速上手",
    ctaSecondary: "查看源码",
    meta: "MIT License · Node.js ≥ 24 · 默认监听 127.0.0.1:4318 · 数据落盘 ~/.spark",
  },
  en: {
    eyebrowBadge: "Open source",
    eyebrow: "MIT · One protocol, four surfaces · Event-sourced",
    headline: "One engine, four interfaces.",
    rotateWords: ["Web Workbench", "Electron Shell", "CLI TUI", "Mobile App"],
    sub: "Streaming chat, tool-call visualization, fail-closed human approval. 27 event types drive four surfaces in real time; sessions persist as append-only JSONL — replayable, forkable, rollback-safe.",
    ctaPrimary: "Get Started",
    ctaSecondary: "View Source",
    meta: "MIT License · Node.js ≥ 24 · Binds to 127.0.0.1:4318 · Data in ~/.spark",
  },
} as const;

function RotatingWord({ lang }: { lang: Lang }): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const words = HERO_COPY[lang].rotateWords;
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [reducedMotion, words.length]);

  if (reducedMotion) {
    return <span className="pb-1">{words[0]}</span>;
  }

  return (
    <span className="inline-block pb-1">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={words[index]}
          className="inline-block"
          initial={{ y: "55%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-55%", opacity: 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function Hero({ lang = "zh" }: { lang?: Lang }): React.JSX.Element {
  const copy = HERO_COPY[lang];
  return (
    <section
      id="hero"
      className="relative flex min-h-[82vh] scroll-mt-16 flex-col items-center justify-center overflow-hidden bg-[#0a0a0a] px-6 pb-20 pt-32 text-center"
      aria-labelledby="hero-title"
    >
      {/* DarkVeil 雾幕背景（React Bits copy-in，DESIGN v2.46 豁免；替代 v2.28 点阵底纹） */}
      <div className="bg-darkveil pointer-events-none absolute inset-0" aria-hidden="true">
        <DarkVeil desaturation={1} speed={0.35} warpAmount={0.35} resolutionScale={0.75} />
      </div>

      {/* eyebrow pill：内嵌 mini 标签（x.ai "New" 同位，橙色点睛 v2.33） */}
      <p className="relative flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1.5 pr-4 text-xs text-zinc-400">
        <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 font-medium text-orange-300">
          {copy.eyebrowBadge}
        </span>
        {copy.eyebrow}
      </p>

      <h1
        id="hero-title"
        className="relative mt-10 max-w-4xl text-[30px] font-medium leading-[1.2] text-zinc-50 en:font-normal en:tracking-[-0.025em] sm:text-[44px] lg:text-[46px]"
      >
        <BlurText
          text={copy.headline}
          staggerDelay={0.045}
          duration={0.55}
          className="block"
        />
        <span className="mt-1 inline-flex flex-col items-center">
          <RotatingWord lang={lang} />
          {/* 旋转词下划线渐变条（x.ai 移动端 "build." 同构：橙→粉→黄，v2.33） */}
          <span
            aria-hidden="true"
            className="mt-2 h-1 w-full rounded-full bg-[linear-gradient(90deg,#f97316_0%,#ec4899_55%,#f59e0b_100%)]"
          />
        </span>
      </h1>

      <p className="relative mt-8 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
        {copy.sub}
      </p>

      <div className="relative mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Link
          href={lang === "en" ? "/en/quickstart" : "/quickstart"}
          className={cn(buttonVariants({ size: "lg" }), "rounded-full bg-white px-8 text-zinc-900 hover:bg-zinc-200")}
        >
          {copy.ctaPrimary}&nbsp;&nbsp;→
        </Link>
        <a
          href={LINKS.github}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "border-transparent bg-white/10 text-zinc-100 hover:bg-white/20",
          )}
        >
          {copy.ctaSecondary}
        </a>
      </div>

      <p className="relative mt-10 font-mono text-sm text-zinc-500">{copy.meta}</p>
    </section>
  );
}

Hero.displayName = "Hero";
