"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BlurFade } from "@/components/magicui/blur-fade";
import { buttonVariants } from "@/components/ui/button";
import type { Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * JobPicker — 任务选择器（x.ai "Give each Bot a job" 实拍同构，DESIGN v2.34）：
 * 点击胶囊切换下方的黑体导语 + 描述，联动动画 fade+y 微动效（reduced-motion 静态）。
 * 六个"活"全部对应 Spark 真实能力，出处逐条可核（禁假状态 §5）：
 * - 审批三值/fail-closed：packages/engine/src/permission/service.ts
 * - bash 沙箱 wrapper（bwrap/Seatbelt）不可用即拒：ADR D15
 * - /goal 三护栏（迭代 50 / token 200k / judge 25s）：ADR D33
 * - /arena 双模型竞答 + worktree 隔离 + 胜者一次审批：ADR D42
 * - task 子代理 + /agents 停用档：ADR D36
 * - append-only JSONL / seq=行号：SessionStore（AGENTS §1.1）
 */

interface Job {
  label: string;
  lead: string;
  body: string;
  fact: string;
}

const JOBS: Record<Lang, readonly Job[]> = {
  zh: [
    {
      label: "改代码",
      lead: "先读后改，改动走审批。",
      body: "写类工具与 bash 需人工确认——once / always / reject 三种答复，超时未答复自动拒绝（fail-closed）。",
      fact: "permission.resolved { reply } · fail-closed",
    },
    {
      label: "跑测试排查",
      lead: "命令全程可见、全程审批。",
      body: "bash 缺省全审批；可选沙箱走平台 wrapper（Linux bwrap / macOS Seatbelt），wrapper 不可用即拒跑，不降级裸跑。",
      fact: "sandbox wrapper · ADR D15",
    },
    {
      label: "长任务挂机",
      lead: "长跑护栏写死在代码里，到线即停。",
      body: "/goal 持续目标：迭代上限 50、token 预算 200k、judge 超时 25s，到线即停不悬空。",
      fact: "goal.set · ADR D33",
    },
    {
      label: "双模型竞答",
      lead: "同一个问题，两个模型同时答。",
      body: "/arena 在 git worktree 里隔离竞答，胜者的改动整体应用——一次审批，不做局部修补。",
      fact: "/arena · ADR D42",
    },
    {
      label: "子代理并行",
      lead: "并行执行，不阻塞主会话回合。",
      body: "task 工具派子代理并行干活，事件流同屏折叠；/agents 可按档停用，停用档解析即拒绝。",
      fact: "task · subagent · /agents",
    },
    {
      label: "回放审计",
      lead: "每一回合都能重放。",
      body: "append-only JSONL：seq 等于文件行号，断线按 seq 续播，回放重建完整界面——决策链全程可审计。",
      fact: "sessions/*.jsonl · durable",
    },
  ],
  en: [
    {
      label: "Edit code",
      lead: "Read first, then edit — every change goes through approval.",
      body: "Write-class tools and bash require human confirmation — once / always / reject; an unanswered ask settles to reject (fail-closed).",
      fact: "permission.resolved { reply } · fail-closed",
    },
    {
      label: "Run tests & debug",
      lead: "Commands fully visible, fully approved.",
      body: "bash is fully approved by default; the optional sandbox uses platform wrappers (Linux bwrap / macOS Seatbelt) — unavailable wrapper means the command is refused, never downgraded to a bare run.",
      fact: "sandbox wrapper · ADR D15",
    },
    {
      label: "Long-running jobs",
      lead: "Guardrails are written in code, stopping at the line.",
      body: "/goal persistent goals: 50-iteration cap, 200k token budget, 25s judge timeout — stop at the line, never dangle.",
      fact: "goal.set · ADR D33",
    },
    {
      label: "Two-model arena",
      lead: "One question, two models answering at once.",
      body: "/arena races models in isolated git worktrees; the winner's changes are applied as a whole — one approval, no piecemeal patching.",
      fact: "/arena · ADR D42",
    },
    {
      label: "Parallel subagents",
      lead: "Run in parallel without blocking the main turn.",
      body: "The task tool dispatches subagents in parallel with events folding into the same stream; /agents can disable presets, and a disabled preset is refused at parse time.",
      fact: "task · subagent · /agents",
    },
    {
      label: "Replay & audit",
      lead: "Every turn can be replayed.",
      body: "append-only JSONL: seq equals the file line number; reconnects resume by seq and a replay rebuilds the full UI — the whole decision chain stays auditable.",
      fact: "sessions/*.jsonl · durable",
    },
  ],
};

const JP_COPY = {
  zh: { heading: "给 Agent 派个活", tablist: "任务场景", viewAll: "查看功能清单" },
  en: { heading: "Give the agent a job", tablist: "Job scenarios", viewAll: "View the capability list" },
} as const;

export function JobPicker({ lang = "zh" }: { lang?: Lang }): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const [active, setActive] = React.useState(0);
  const jobs = JOBS[lang];
  const job = jobs[active];
  if (job === undefined) {
    throw new Error("JobPicker: JOBS 不应为空");
  }

  return (
    <section id="jobs" className="scroll-mt-16 px-6 py-28" aria-labelledby="jobs-heading">
      <div className="mx-auto max-w-3xl">
        <BlurFade delay={0}>
          <h2
            id="jobs-heading"
            className="text-[30px] font-normal tracking-[0.06em] text-zinc-900 en:tracking-[-0.025em] sm:text-[38px]"
          >
            {JP_COPY[lang].heading}
          </h2>
        </BlurFade>

        {/* 胶囊选择器：选中=黑底白字（对齐黑色胶囊按钮系统，v2.33） */}
        <BlurFade delay={0.05} yOffset={16}>
          <div className="mt-8 flex flex-wrap gap-2.5" role="tablist" aria-label={JP_COPY[lang].tablist}>
            {jobs.map((item, index) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={index === active}
                onClick={() => setActive(index)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  index === active
                    ? "border-zinc-900 bg-zinc-900 font-medium text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </BlurFade>

        {/* 描述联动：黑体导语 + 灰色正文（x.ai "Generate pipeline overnight." 同构） */}
        <div className="mt-10 min-h-[150px]" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={job.label}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <p className="max-w-2xl text-lg leading-relaxed">
                <span className="font-semibold text-zinc-900">{job.lead}</span>
                <span className="text-zinc-500"> {job.body}</span>
              </p>
              <p className="mt-5 border-t border-border pt-4 font-mono text-sm text-spark-accent">
                {job.fact}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-10">
          <Link
            href={lang === "en" ? "/en/features" : "/features"}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "border-transparent bg-zinc-100 hover:bg-zinc-200",
            )}
          >
            {JP_COPY[lang].viewAll}
          </Link>
        </div>
      </div>
    </section>
  );
}

JobPicker.displayName = "JobPicker";
