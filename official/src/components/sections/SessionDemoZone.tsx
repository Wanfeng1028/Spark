"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

/**
 * SessionDemoZone — 首屏三卡演示区（x.ai 实拍同构：Chat 浅色 / Build 黑终端 / Bot 浅色，
 * DESIGN v2.31）。中卡=脚本化 CLI 转录循环；两侧=静态浅色 mock（会话投影 / 审批卡），
 * 顶部裁切营造"正在滚动"的现场感；每卡底部行=端名 + "查看 →"（mono 链接箭头，v2.30 豁免）。
 *
 * 脚本内容是真实事件序列的形态（禁假状态，DESIGN §5）：
 * - 事件名与答复三值：packages/protocol/src/events.ts、primitives.ts
 * - 审批三键与 fail-closed：packages/engine/src/permission/service.ts
 * - 端口 4318：packages/engine/src/config.ts SPARK_DEFAULTS；子代理行对应 task 工具
 * - 编辑块目标 bash-pool.ts=19.3 真实改造对象；代码行/耗时/流式文本为演示常量（头注声明）
 *
 * reduced-motion：不跑循环动画，静态呈现完整终态。
 */

type ToolState = "hidden" | "running" | "done";
type ApprovalState = "hidden" | "pending" | "approved" | "collapsed";

const STREAM_TEXT = "改动集中在三处：worker 生命周期、池化调度、超时回收。";

const EDIT_LINES = [
  { n: 38, c: "export function createBashPool(config: EngineConfig) {" },
  { n: 39, c: "  const pool = new BashPool({" },
  { n: 40, c: "    maxWorkers: config.engine.bashMaxWorkers," },
  { n: 41, c: "    idleTimeoutMs: 30_000," },
  { n: 42, c: "  });" },
] as const;

interface DemoState {
  prompt: boolean;
  think: boolean;
  toolRead: ToolState;
  subagent: ToolState;
  toolBash: ToolState;
  approval: ApprovalState;
  edit: boolean;
  streamChars: number;
}

const IDLE_STATE: DemoState = {
  prompt: false,
  think: false,
  toolRead: "hidden",
  subagent: "hidden",
  toolBash: "hidden",
  approval: "hidden",
  edit: false,
  streamChars: 0,
};

const FINAL_STATE: DemoState = {
  prompt: true,
  think: true,
  toolRead: "done",
  subagent: "done",
  toolBash: "done",
  approval: "collapsed",
  edit: true,
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
        <span className="shrink-0 text-emerald-400">✓ {duration}</span>
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
      <p className="text-xs text-amber-400">审批 · bash</p>
      <p className="mt-1 truncate text-zinc-400">
        git add -A &amp;&amp; git commit -m &quot;feat: bash 持久进程池&quot;
      </p>
      {stage === "pending" ? (
        <p className="mt-2 text-xs text-zinc-400">
          <span className="text-zinc-100">[y]</span> 允许一次{"　"}
          <span className="text-zinc-100">[a]</span> 总是允许{"　"}
          <span className="text-zinc-100">[4]</span> 本项目总是{"　"}
          <span className="text-zinc-100">[n]</span> 拒绝并给建议
        </p>
      ) : (
        <p className="mt-2 text-xs">
          <span className="rounded border border-emerald-400/40 px-1 py-0.5 text-emerald-400">
            y
          </span>
          <span className="ml-2 text-zinc-300">已批准（一次）</span>
          <span className="ml-2 text-zinc-500">超时未答复将自动拒绝（fail-closed）</span>
        </p>
      )}
    </motion.div>
  );
}

/** 编辑块——对标 x.ai 演示的 Edit 面板：行号 + 代码（暗色嵌块） */
function EditBlock(): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="my-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
    >
      <div className="border-b border-zinc-800 px-4 py-2 text-xs text-zinc-400">
        <span className="mr-2 text-zinc-500">◆</span>
        编辑 packages/engine/src/tools/bash-pool.ts
      </div>
      <div className="px-4 py-3 font-mono text-xs leading-6">
        {EDIT_LINES.map((line) => (
          <p key={line.n} className="flex gap-4 whitespace-pre">
            <span className="w-5 shrink-0 select-none text-right text-zinc-600">{line.n}</span>
            <code className="text-zinc-300">{line.c}</code>
          </p>
        ))}
      </div>
    </motion.div>
  );
}

/** 打字光标——功能性闪烁（输入指示），reduced-motion 下不出现 */
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

function useDemoScript(reducedMotion: boolean | null): DemoState {
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
        await sleep(1500);
        setState((s) => ({ ...s, toolRead: "running" }));
        await sleep(1000);
        if (!alive) return;
        setState((s) => ({ ...s, toolRead: "done" }));
        await sleep(600);
        setState((s) => ({ ...s, subagent: "running" }));
        await sleep(1500);
        if (!alive) return;
        setState((s) => ({ ...s, subagent: "done" }));
        await sleep(600);
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
        await sleep(700);
        setState((s) => ({ ...s, edit: true }));
        await sleep(1000);
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

  return state;
}

/** 卡底行：端名 + 查看链接（x.ai "Chat — Explore →" 同位） */
function CardFooter({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between px-5 pb-4">
      <span className="text-lg font-semibold">{title}</span>
      <span className="font-mono text-sm text-zinc-400 transition-colors group-hover:text-zinc-200">
        查看 →
      </span>
    </div>
  );
}

function TerminalCard({ state }: { state: DemoState }): React.JSX.Element {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-zinc-950 text-left">
      {/* 标题栏：dots + 项目路径 + 水位进度（x.ai projects/main 14.75% 同构） */}
      <div className="flex items-center gap-1.5 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="ml-2 font-mono text-xs text-zinc-500">spark — ~/projects/Spark</span>
        <span className="ml-auto flex items-center gap-2" aria-hidden="true">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
            <span className="block h-full w-[42%] rounded-full bg-zinc-400" />
          </span>
          <span className="font-mono text-[10px] text-zinc-600">42%</span>
        </span>
      </div>

      <div className="flex min-h-[380px] flex-1 flex-col gap-2 px-5 pb-2 font-mono text-[13px] leading-7">
        {state.prompt ? (
          <motion.p
            variants={lineVariants}
            initial="hidden"
            animate="visible"
            className="whitespace-pre-wrap break-words"
          >
            <span className="text-indigo-400">{"> "}</span>
            <span className="text-zinc-100">把 bash 工具改成持久进程池，别每次冷启动</span>
          </motion.p>
        ) : (
          <motion.p
            variants={lineVariants}
            initial="hidden"
            animate="visible"
            className="text-zinc-500"
          >
            <span className="text-indigo-400">{"> "}</span>
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
          label="子代理"
          arg="检索 bash 沙箱与审批语义"
          state={state.subagent}
          duration="8.2s"
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
            <span className="text-emerald-400">✓ 已批准（一次）</span> · permission.resolved
          </motion.p>
        ) : null}

        {state.edit ? <EditBlock /> : null}

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

      <div className="mt-auto border-t border-zinc-800/60 pt-2 text-zinc-50">
        <CardFooter title="Build" />
      </div>
    </div>
  );
}

/** 左卡：会话投影（浅色静态 mock，顶部裁切——x.ai Chat 卡同构） */
function ChatCard(): React.JSX.Element {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-zinc-100 text-left">
      <div className="flex flex-1 flex-col gap-3 px-5 pt-0 text-[13px]">
        {/* 首条气泡被卡顶裁切（-mt-6），营造"正在滚动"的现场感 */}
        <p className="-mt-6 ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-zinc-700 shadow-sm">
          会话文件为什么只追加不改写？
        </p>
        <p className="max-w-[90%] leading-relaxed text-zinc-600">
          append-only JSONL：第 0 行是 header，其后每行一个事件信封，seq
          等于文件行号。只追加不改写，因此可回放、可分叉、可回滚。
        </p>
        <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-3.5 py-2 text-white">
          断线重连之后界面怎么恢复？
        </p>
        <p className="max-w-[90%] leading-relaxed text-zinc-600">
          回放：按 since=seq 拉取 durable 事件重算；live-only 的 delta 不落盘，由
          assistant.message 重建终态。
        </p>
      </div>
      <div className="mt-auto pt-4 text-zinc-900">
        <CardFooter title="会话" />
      </div>
    </div>
  );
}

/** 右卡：审批卡（浅色静态 mock，x.ai Bot 卡同位） */
function ApprovalCard(): React.JSX.Element {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-zinc-100 text-left">
      <div className="flex flex-1 flex-col justify-center gap-3 px-5 pt-2 text-[13px]">
        <p className="text-zinc-600">引擎申请改写工作区文件，等待人工确认：</p>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            <span aria-hidden="true" className="w-1 shrink-0 rounded-full bg-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">bash 执行命令请求</p>
              <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                git commit -m &quot;feat: bash 池&quot;
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-white">批准一次</span>
            <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600">
              总是允许
            </span>
            <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600">
              拒绝
            </span>
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          <span className="text-emerald-600">✓ 已批准（一次）</span> ·
          超时未答复将自动拒绝（fail-closed）
        </p>
      </div>
      <div className="mt-auto pt-4 text-zinc-900">
        <CardFooter title="审批" />
      </div>
    </div>
  );
}

export function SessionDemoZone(): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const state = useDemoScript(reducedMotion);

  return (
    <section
      id="demo"
      className="scroll-mt-16 px-6 py-20"
      aria-label="Spark 产品演示：会话投影、终端转录与人工审批"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <Link
          href="/features"
          aria-label="会话投影功能介绍"
          className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spark-accent"
        >
          <ChatCard />
        </Link>
        <Link
          href="/features"
          aria-label="终端 Build 演示"
          className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spark-accent"
        >
          <TerminalCard state={state} />
        </Link>
        <Link
          href="/features"
          aria-label="人工审批功能介绍"
          className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spark-accent"
        >
          <ApprovalCard />
        </Link>
      </div>
    </section>
  );
}

SessionDemoZone.displayName = "SessionDemoZone";
