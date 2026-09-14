"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";
import { BlurText } from "@/components/animations/blur-text";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Hero — 左对齐非对称布局（60/40），不用居中 hero + 徽章 pill + CTA 三件套（DESIGN §12.5）。
 * 右侧是纯 div 构建的终端窗口 mock，逐行 reveal。
 * 内容全部是可核实事实（禁假状态，DESIGN §5）：命令来自 apps/cli/src/main.tsx 的 USAGE，
 * 缺省端口 4318 与回环绑定来自 packages/engine/src/config.ts SPARK_DEFAULTS，
 * 会话落点来自 SessionStore（~/.spark/sessions/）。
 * 按钮文案末尾不焊箭头符号（§12.7 P1），外链语义靠 target="_blank" 表达。
 * 终端窗口固定深色（bg-zinc-900），因此窗内色值直接写 zinc/emerald 而不跟主题翻转；
 * emerald-400 == --spark-ok 深色态值（#34d399），不引入新色相。
 */

type Tone = "prompt" | "ok" | "info";

interface TerminalLine {
  text: string;
  tone: Tone;
}

const TERMINAL_LINES: readonly TerminalLine[] = [
  { text: "$ npm i -g @spark/cli", tone: "prompt" },
  { text: "$ spark up", tone: "prompt" },
  { text: "server    http://127.0.0.1:4318", tone: "ok" },
  { text: "sessions  ~/.spark/sessions/", tone: "ok" },
  { text: "TUI       纯单栏会话流 · Ctrl+C 两下退出", tone: "info" },
];

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.32, delayChildren: 0.45 },
  },
};

const lineVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: "easeOut" },
  },
};

const cursorVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, delay: 1.8 },
  },
};

const toneClass: Record<Tone, string> = {
  prompt: "text-zinc-100",
  ok: "text-emerald-400",
  info: "text-zinc-400",
};

export function Hero(): React.JSX.Element {
  return (
    <section
      id="hero"
      className="flex min-h-[85vh] items-center px-6 py-32"
      aria-labelledby="hero-title"
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-5">
        {/* 左侧 60% — 标题 / 副标题 / CTA */}
        <div className="lg:col-span-3">
          <h1
            id="hero-title"
            className="text-[40px] font-semibold leading-[1.15] tracking-tight text-foreground"
          >
            <BlurText
              text="跑在你自己机器上的 Agent 工作台"
              staggerDelay={0.055}
              duration={0.55}
            />
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            引擎 headless，UI 是事件流的投影。27 种事件类型实时驱动
            Web、桌面、CLI、移动端四端界面。
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <CodeBlock
              code="npm i -g @spark/cli"
              className="sm:min-w-[300px] sm:flex-1 [&_pre]:px-4 [&_pre]:py-3"
            />
            <a
              href={LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "shrink-0",
              )}
            >
              查看源码
            </a>
          </div>
        </div>

        {/* 右侧 40% — 终端窗口 mock */}
        <div className="lg:col-span-2">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            role="img"
            aria-label="终端窗口预览：npm 全局安装 @spark/cli 后运行 spark up，server 绑定 127.0.0.1:4318，会话落盘 ~/.spark/sessions/"
            className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
          >
            {/* 标题栏 */}
            <div className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-2.5">
              <span
                className="h-2.5 w-2.5 rounded-full bg-zinc-600"
                aria-hidden="true"
              />
              <span
                className="h-2.5 w-2.5 rounded-full bg-zinc-600"
                aria-hidden="true"
              />
              <span
                className="h-2.5 w-2.5 rounded-full bg-zinc-600"
                aria-hidden="true"
              />
              <span className="ml-3 font-mono text-xs text-zinc-500">
                spark &mdash; zsh
              </span>
            </div>

            {/* 内容区 */}
            <div className="px-5 py-5 font-mono text-[13px] leading-6">
              {TERMINAL_LINES.map((item) => (
                <motion.div
                  key={item.text}
                  variants={lineVariants}
                  className="whitespace-pre"
                  aria-hidden="true"
                >
                  <span className={toneClass[item.tone]}>{item.text}</span>
                </motion.div>
              ))}
              <motion.span
                variants={cursorVariants}
                aria-hidden="true"
                className="mt-1 inline-block h-4 w-2 translate-y-0.5 bg-zinc-300"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

Hero.displayName = "Hero";
