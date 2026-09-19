"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { BlurText } from "@/components/animations/blur-text";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonVariants } from "@/components/ui/button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Hero — 左对齐非对称布局（60/40），不用居中 hero + 徽章 pill + CTA 三件套（DESIGN §12.5）。
 * 右侧是纯 div 构建的终端窗口 mock，逐行 reveal。
 * 标题走官网 display 档位（DESIGN §12.3 官网登记：40/52/60px 三断点），CJK 由
 * BlurText 逐字 stagger（blur-text.tsx tokenize），中文大标题才有逐字浮现的节奏。
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
  // Bug 10 修复：prefers-reduced-motion 为真时 initial={false}，直接呈现终态不播动画。
  const reducedMotion = useReducedMotion();

  return (
    <section
      id="hero"
      // Bug 6 修复：sticky header 高 56px，锚点跳转留 64px 余量避免遮挡。
      className="flex min-h-[85vh] items-center px-6 py-32 scroll-mt-16"
      aria-labelledby="hero-title"
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-5">
        {/* 左侧 60% — 标题 / 副标题 / CTA */}
        <div className="lg:col-span-3">
          <h1
            id="hero-title"
            className="text-[40px] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-[52px] lg:text-[60px]"
          >
            <BlurText
              text="跑在你自己机器上的 Agent 工作台"
              staggerDelay={0.04}
              duration={0.55}
            />
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            引擎 headless，UI 是事件流的投影：27 种事件实时驱动
            Web、桌面、CLI、移动端同一套界面逻辑。审批 fail-closed，会话全程可回放。
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

          {/* 元信息行：全部事实（MIT 见 LICENSE；Node >=24 见根 package.json engines；
              ~/.spark 数据落点见 §1.1 数据落点表）。mono 小字，不做徽章 pill（§12.5）。 */}
          <p className="mt-8 font-mono text-sm text-muted-foreground">
            MIT License · Node.js ≥ 24 · 数据落盘 ~/.spark · 无云端依赖
          </p>
        </div>

        {/* 右侧 40% — 终端窗口 mock */}
        <div className="lg:col-span-2">
          <motion.div
            initial={reducedMotion ? false : "hidden"}
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

            {/* 内容区
                Bug 4 修复：终端行原 whitespace-pre + 外层 overflow-hidden 会在窄屏（≤375px）
                静默裁切最长行「TUI       纯单栏会话流 · Ctrl+C 两下退出」（≈286px）。
                改 whitespace-pre-wrap 保留对齐空格的同时允许换行；break-words（overflow-wrap:break-word）兜底防单个超长 token。 */}
            <div className="px-5 py-5 font-mono text-[13px] leading-6">
              {TERMINAL_LINES.map((item) => (
                <motion.div
                  key={item.text}
                  variants={lineVariants}
                  // Bug 9 修复：no-JS 场景下由 globals.css 的 [data-reveal] 兜底还原可见态。
                  data-reveal=""
                  className="whitespace-pre-wrap break-words"
                  aria-hidden="true"
                >
                  <span className={toneClass[item.tone]}>{item.text}</span>
                </motion.div>
              ))}
              <motion.span
                variants={cursorVariants}
                data-reveal=""
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
