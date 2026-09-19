"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * SessionDemo — 官网主演示（对标 x.ai 内联 coding-agent 演示，DESIGN v2.27）。
 * CLI 转录窗（§13.K 字形：`>` user / `◆` assistant / `▸` 工具行）脚本化循环：
 * 提问 → 思考 → read 工具 → bash 工具触发审批框（[a]/[A]/[r]）→ 批准 → 完成 → 流式输出。
 *
 * 脚本内容是真实事件序列的形态（禁假状态，DESIGN §5）：
 * - 事件名与答复三值：packages/protocol/src/events.ts、primitives.ts
 *   （permission.asked → permission.resolved{once|always|reject} → tool.completed{durationMs}）
 * - 审批三键与 fail-closed 提示：packages/engine/src/permission/service.ts
 * - 缺省端口 4318：packages/engine/src/config.ts SPARK_DEFAULTS
 * - 流式文本是演示常量（live-only assistant.delta 的形态，不落盘故无"原文"可引）
 *
 * reduced-motion：不跑循环动画，静态呈现完整终态。
 */

type ToolState = "hidden" | "running" | "done";
type ApprovalState = "hidden" | "pending" | "approved" | "collapsed";

const STREAM_TEXT = "改动集中在三处：worker 生命周期、池化调度、超时回收。";

interface DemoState {
  prompt: boolean;
  think: boolean;
  toolRead: ToolState;
  toolBash: ToolState;
  approval: ApprovalState;
  streamChars: number;
}

const IDLE_STATE: DemoState = {
  prompt: false,
  think: false,
  toolRead: "hidden",
  toolBash: "hidden",
  approval: "hidden",
  streamChars: 0,
};

const FINAL_STATE: DemoState = {
  prompt: true,
  think: true,
  toolRead: "done",
  toolBash: "done",
  approval: "collapsed",
  streamChars: STREAM_TEXT.length,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const lineVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

function ToolRow({
  label,
  arg,
  state,
  duration,
}: {
  label: string;
  arg: string;
  state: ToolState;
  duration: string;
}): React.JSX.Element | null {
  if (state === "hidden") return null;
  return (
    <motion.p
      variants={lineVariants}
      initial="hidden"
      animate="visible"
      className="flex items-baseline gap-2 whitespace-pre-wrap break-words"
    >
      <span className="shrink-0 text-zinc-500">▸</span>
      <span className="shrink-0 font-semibold text-zinc-100">{label}</span>
      <span className="min-w-0 flex-1 truncate text-zinc-400">{arg}</span>
      {state === "running" ? (
        <span className="shrink-0 text-zinc-500">运行中…</span>
      ) : (
        <span className="shrink-0 text-spark-ok">✓ {duration}</span>
      )}
    </motion.p>
  );
}

function ApprovalBox({ stage }: { stage: "pending" | "approved" }): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="my-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
    >
      <p className="text-xs text-spark-warn">审批 · bash</p>
      <p className="mt-1 truncate text-zinc-400">
        git add -A &amp;&amp; git commit -m &quot;feat: bash 持久进程池&quot;
      </p>
      {stage === "pending" ? (
        <p className="mt-2 text-xs text-zinc-400">
          <span className="text-zinc-100">[a]</span> 批准一次{"　"}
          <span className="text-zinc-100">[A]</span> 总是允许{"　"}
          <span className="text-zinc-100">[r]</span> 拒绝
        </p>
      ) : (
        <p className="mt-2 text-xs">
          <span className="rounded border border-spark-ok/40 px-1 py-0.5 text-spark-ok">a</span>
          <span className="ml-2 text-zinc-300">已批准（一次）</span>
          <span className="ml-2 text-zinc-500">超时未答复将自动拒绝（fail-closed）</span>
        </p>
      )}
    </motion.div>
  );
}

/** 打字光标——功能性闪烁（输入指示），reduced-motion 下不出现（终态无未完成输入） */
function Caret(): React.JSX.Element {
  return (
    <motion.span
      aria-hidden="true"
      className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-zinc-300"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
    />
  );
}

export function SessionDemo(): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const [state, setState] = React.useState<DemoState>(() =>
    reducedMotion ? FINAL_STATE : IDLE_STATE,
  );

  React.useEffect(() => {
    if (reducedMotion) {
      setState(FINAL_STATE);
      return;
    }
    let alive = true;
    (async () => {
      while (alive) {
        setState(IDLE_STATE);
        await sleep(900);
        if (!alive) return;
        setState((s) => ({ ...s, prompt: true }));
        await sleep(1100);
        setState((s) => ({ ...s, think: true }));
        await sleep(1600);
        setState((s) => ({ ...s, toolRead: "running" }));
        await sleep(1000);
        if (!alive) return;
        setState((s) => ({ ...s, toolRead: "done" }));
        await sleep(700);
        setState((s) => ({ ...s, toolBash: "running" }));
        await sleep(1200);
        if (!alive) return;
        setState((s) => ({ ...s, approval: "pending" }));
        await sleep(2000);
        if (!alive) return;
        setState((s) => ({ ...s, approval: "approved" }));
        await sleep(1000);
        if (!alive) return;
        setState((s) => ({ ...s, approval: "collapsed", toolBash: "done" }));
        await sleep(900);
        for (let i = 1; i <= STREAM_TEXT.length; i++) {
          if (!alive) return;
          setState((s) => ({ ...s, streamChars: i }));
          await sleep(55);
        }
        await sleep(3800);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reducedMotion]);

  return (
    <section
      id="demo"
      className="scroll-mt-16 border-y border-zinc-800 bg-zinc-950 px-6 py-28"
      aria-label="Spark 会话流演示"
    >
      <div className="mx-auto max-w-3xl">
        <div
          className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
          role="img"
          aria-label="Spark CLI 会话流演示：提问、思考、工具调用、fail-closed 审批与流式输出"
        >
          {/* 标题栏 */}
          <div className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
            <span className="ml-3 font-mono text-xs text-zinc-500">
              spark — ~/projects/Spark
            </span>
          </div>

          {/* 转录区（§13.K 字形） */}
          <div className="flex min-h-[320px] flex-col gap-2 px-5 py-6 font-mono text-[13px] leading-7 sm:px-6">
            {state.prompt ? (
              <motion.p
                variants={lineVariants}
                initial="hidden"
                animate="visible"
                className="whitespace-pre-wrap break-words"
              >
                <span className="text-spark-accent">{"> "}</span>
                <span className="text-zinc-100">把 bash 工具改成持久进程池，别每次冷启动</span>
              </motion.p>
            ) : (
              <motion.p
                variants={lineVariants}
                initial="hidden"
                animate="visible"
                className="text-zinc-500"
              >
                <span className="text-spark-accent">{"> "}</span>
                <Caret />
              </motion.p>
            )}

            {state.think ? (
              <motion.p
                variants={lineVariants}
                initial="hidden"
                animate="visible"
                className="text-zinc-500"
              >
                <span className="mr-2">◆</span>思考 4.1s — 读实现、列改动点
              </motion.p>
            ) : null}

            <ToolRow
              label="read"
              arg="packages/engine/src/tools/builtin/bash.ts"
              state={state.toolRead}
              duration="0.3s"
            />
            <ToolRow
              label="bash"
              arg="pnpm --filter @spark/engine test"
              state={state.toolBash}
              duration="12.4s"
            />

            {state.approval === "pending" ? <ApprovalBox stage="pending" /> : null}
            {state.approval === "approved" ? <ApprovalBox stage="approved" /> : null}
            {state.approval === "collapsed" ? (
              <motion.p
                variants={lineVariants}
                initial="hidden"
                animate="visible"
                className="text-zinc-500"
              >
                <span className="text-spark-ok">✓ 已批准（一次）</span> · permission.resolved
              </motion.p>
            ) : null}

            {state.streamChars > 0 ? (
              <motion.p
                variants={lineVariants}
                initial="hidden"
                animate="visible"
                className="whitespace-pre-wrap break-words text-zinc-300"
              >
                <span className="mr-2 text-zinc-500">◆</span>
                {STREAM_TEXT.slice(0, state.streamChars)}
                {state.streamChars < STREAM_TEXT.length ? <Caret /> : null}
              </motion.p>
            ) : null}
          </div>

          {/* 状态栏 */}
          <div className="flex items-center justify-between gap-4 border-t border-zinc-800 px-5 py-2 font-mono text-[11px] text-zinc-500 sm:px-6">
            <span>
              <span className="text-zinc-100">» steer</span> · glm-5.3 · 127.0.0.1:4318
            </span>
            <span className="hidden sm:inline">permission.asked → resolved（回放可重建）</span>
          </div>
        </div>

        <p className="mt-4 text-center font-mono text-xs text-zinc-500">
          真实事件流形态 · 27 种事件 · 断线重连按 seq 续播
        </p>
      </div>
    </section>
  );
}

SessionDemo.displayName = "SessionDemo";
