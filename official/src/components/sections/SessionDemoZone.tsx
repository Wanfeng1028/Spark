"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "motion/react";
import type { Lang } from "@/lib/i18n";

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
 * 离屏暂停（DESIGN v2.48）：打字循环每 55ms 一次 setState，用户滚到页面下方时不该继续跑主线程。
 */

type ToolState = "hidden" | "running" | "done";
type ApprovalState = "hidden" | "pending" | "approved" | "collapsed";

/** 三卡演示文案对（19.47 批 2）：转录行、审批键、气泡对话全部显式列键 */
const SDZ_COPY = {
  zh: {
    streamText: "改动集中在三处：worker 生命周期、池化调度、超时回收。",
    running: "运行中…",
    approvalTag: "审批 · bash",
    approvalCmd: 'git add -A && git commit -m "feat: bash 持久进程池"',
    keys: {
      y: "允许一次",
      a: "总是允许",
      p: "本项目总是",
      n: "拒绝并给建议",
    },
    approvedOnce: "已批准（一次）",
    failClosedNote: "超时未答复将自动拒绝（fail-closed）",
    editPrefix: "编辑 ",
    prompt: "把 bash 工具改成持久进程池，别每次冷启动",
    think: "思考 4.1s — 读实现、列改动点",
    subagentLabel: "子代理",
    subagentArg: "检索 bash 沙箱与审批语义",
    approvedLine: "已批准（一次）",
    chat: {
      q1: "会话文件为什么只追加不改写？",
      a1: "append-only JSONL：第 0 行是 header，其后每行一个事件信封，seq 等于文件行号。只追加不改写，因此可回放、可分叉、可回滚。",
      q2: "断线重连之后界面怎么恢复？",
      a2: "回放：按 since=seq 拉取 durable 事件重算；live-only 的 delta 不落盘，由 assistant.message 重建终态。",
      title: "会话",
    },
    approvalCard: {
      lead: "引擎申请改写工作区文件，等待人工确认：",
      title: "bash 执行命令请求",
      cmd: 'git commit -m "feat: bash 池"',
      once: "批准一次",
      always: "总是允许",
      reject: "拒绝",
      approved: "已批准（一次）",
      note: "超时未答复将自动拒绝（fail-closed）",
      title2: "审批",
    },
    sectionAria: "Spark 产品演示：会话投影、终端转录与人工审批",
    chatAria: "会话投影功能介绍",
    buildAria: "终端 Build 演示",
    approvalAria: "人工审批功能介绍",
    view: "查看 →",
  },
  en: {
    streamText: "Changes focus on three spots: worker lifecycle, pool scheduling, and idle reclamation.",
    running: "running…",
    approvalTag: "Approval · bash",
    approvalCmd: 'git add -A && git commit -m "feat: bash persistent pool"',
    keys: {
      y: "Allow once",
      a: "Always allow",
      p: "Always for this project",
      n: "Reject with advice",
    },
    approvedOnce: "Approved (once)",
    failClosedNote: "An unanswered ask settles to reject (fail-closed)",
    editPrefix: "Edit ",
    prompt: "Make the bash tool a persistent process pool, no cold start per command",
    think: "Thinking 4.1s — reading the implementation, listing change points",
    subagentLabel: "subagent",
    subagentArg: "bash sandbox and approval semantics",
    approvedLine: "Approved (once)",
    chat: {
      q1: "Why is the session file append-only?",
      a1: "append-only JSONL: line 0 is the header, each following line is one event envelope, and seq equals the file line number. Append-only means replayable, forkable and rollback-safe.",
      q2: "How does the UI recover after a disconnect?",
      a2: "Replay: durable events are refetched by since=seq and recomputed; live-only deltas are never persisted — assistant.message rebuilds the final state.",
      title: "Chat",
    },
    approvalCard: {
      lead: "The engine wants to modify workspace files and waits for human confirmation:",
      title: "bash command request",
      cmd: 'git commit -m "feat: bash pool"',
      once: "Allow once",
      always: "Always allow",
      reject: "Reject",
      approved: "Approved (once)",
      note: "An unanswered ask settles to reject (fail-closed)",
      title2: "Approvals",
    },
    sectionAria: "Spark product demo: session projection, terminal transcript and human approval",
    chatAria: "Session projection feature intro",
    buildAria: "Terminal Build demo",
    approvalAria: "Human approval feature intro",
    view: "View →",
  },
} as const;

type SDZCopy = (typeof SDZ_COPY)[Lang];

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

/** 终态字符数随语言文本长度变化（打字循环以当前语言文本长度为准） */
function finalState(streamText: string): DemoState {
  return {
    prompt: true,
    think: true,
    toolRead: "done",
    subagent: "done",
    toolBash: "done",
    approval: "collapsed",
    edit: true,
    streamChars: streamText.length,
  };
}

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
  runningText,
}: {
  label: string;
  arg: string;
  state: ToolState;
  duration: string;
  runningText: string;
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
        <span className="shrink-0 text-zinc-500">{runningText}</span>
      ) : (
        <span className="shrink-0 text-emerald-400">✓ {duration}</span>
      )}
    </motion.p>
  );
}

function ApprovalBox({
  stage,
  copy,
}: {
  stage: "pending" | "approved";
  copy: SDZCopy;
}): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="my-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
    >
      <p className="text-xs text-amber-400">{copy.approvalTag}</p>
      <p className="mt-1 truncate text-zinc-400">{copy.approvalCmd}</p>
      {stage === "pending" ? (
        <p className="mt-2 text-xs text-zinc-400">
          <span className="text-zinc-100">[y]</span> {copy.keys.y}{"　"}
          <span className="text-zinc-100">[a]</span> {copy.keys.a}{"　"}
          <span className="text-zinc-100">[4]</span> {copy.keys.p}{"　"}
          <span className="text-zinc-100">[n]</span> {copy.keys.n}
        </p>
      ) : (
        <p className="mt-2 text-xs">
          <span className="rounded border border-emerald-400/40 px-1 py-0.5 text-emerald-400">
            y
          </span>
          <span className="ml-2 text-zinc-300">{copy.approvedOnce}</span>
          <span className="ml-2 text-zinc-500">{copy.failClosedNote}</span>
        </p>
      )}
    </motion.div>
  );
}

/** 编辑块——对标 x.ai 演示的 Edit 面板：行号 + 代码（暗色嵌块） */
function EditBlock({ copy }: { copy: SDZCopy }): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="my-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
    >
      <div className="border-b border-zinc-800 px-4 py-2 text-xs text-zinc-400">
        <span className="mr-2 text-zinc-500">◆</span>
        {copy.editPrefix}packages/engine/src/tools/bash-pool.ts
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

function useDemoScript(
  reducedMotion: boolean | null,
  streamText: string,
  onScreen: boolean,
): DemoState {
  const [state, setState] = React.useState<DemoState>(() =>
    reducedMotion ? finalState(streamText) : IDLE_STATE,
  );

  React.useEffect(() => {
    if (reducedMotion) {
      setState(finalState(streamText));
      return;
    }
    // 离屏即停：重新进入视口时从 IDLE 重跑一遍（演示区回到开场，不留半截转录）
    if (!onScreen) return;
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
        for (let i = 1; i <= streamText.length; i++) {
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
  }, [reducedMotion, streamText, onScreen]);

  return state;
}

/** 卡底行：端名 + 查看链接（x.ai "Chat — Explore →" 同位） */
function CardFooter({ title, view }: { title: string; view: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between px-5 pb-4">
      <span className="text-lg font-semibold">{title}</span>
      <span className="font-mono text-sm text-zinc-400 transition-colors group-hover:text-zinc-200">
        {view}
      </span>
    </div>
  );
}

function TerminalCard({ state, copy }: { state: DemoState; copy: SDZCopy }): React.JSX.Element {
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
            <span className="text-zinc-100">{copy.prompt}</span>
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
            <span className="mr-2">◆</span>
            {copy.think}
          </motion.p>
        ) : null}

        <ToolRow
          label="read"
          arg="packages/engine/src/tools/builtin/bash.ts"
          state={state.toolRead}
          duration="0.3s"
          runningText={copy.running}
        />
        <ToolRow
          label={copy.subagentLabel}
          arg={copy.subagentArg}
          state={state.subagent}
          duration="8.2s"
          runningText={copy.running}
        />
        <ToolRow
          label="bash"
          arg="pnpm --filter @spark/engine test"
          state={state.toolBash}
          duration="12.4s"
          runningText={copy.running}
        />

        {state.approval === "pending" ? <ApprovalBox stage="pending" copy={copy} /> : null}
        {state.approval === "approved" ? <ApprovalBox stage="approved" copy={copy} /> : null}
        {state.approval === "collapsed" ? (
          <motion.p
            variants={lineVariants}
            initial="hidden"
            animate="visible"
            className="text-zinc-500"
          >
            <span className="text-emerald-400">✓ {copy.approvedLine}</span> · permission.resolved
          </motion.p>
        ) : null}

        {state.edit ? <EditBlock copy={copy} /> : null}

        {state.streamChars > 0 ? (
          <motion.p
            variants={lineVariants}
            initial="hidden"
            animate="visible"
            className="whitespace-pre-wrap break-words text-zinc-300"
          >
            <span className="mr-2 text-zinc-500">◆</span>
            {copy.streamText.slice(0, state.streamChars)}
            {state.streamChars < copy.streamText.length ? <Caret /> : null}
          </motion.p>
        ) : null}
      </div>

      <div className="mt-auto border-t border-zinc-800/60 pt-2 text-zinc-50">
        <CardFooter title="Build" view={copy.view} />
      </div>
    </div>
  );
}

/** 左卡：会话投影（浅色静态 mock，顶部裁切——x.ai Chat 卡同构） */
function ChatCard({ copy }: { copy: SDZCopy }): React.JSX.Element {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-zinc-100 text-left">
      <div className="flex flex-1 flex-col gap-3 px-5 pt-0 text-[13px]">
        {/* 首条气泡被卡顶裁切（-mt-6），营造"正在滚动"的现场感 */}
        <p className="-mt-6 ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-zinc-700 shadow-sm">
          {copy.chat.q1}
        </p>
        <p className="max-w-[90%] leading-relaxed text-zinc-600">{copy.chat.a1}</p>
        <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-3.5 py-2 text-white">
          {copy.chat.q2}
        </p>
        <p className="max-w-[90%] leading-relaxed text-zinc-600">{copy.chat.a2}</p>
      </div>
      <div className="mt-auto pt-4 text-zinc-900">
        <CardFooter title={copy.chat.title} view={copy.view} />
      </div>
    </div>
  );
}

/** 右卡：审批卡（浅色静态 mock，x.ai Bot 卡同位） */
function ApprovalCard({ copy }: { copy: SDZCopy }): React.JSX.Element {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-zinc-100 text-left">
      <div className="flex flex-1 flex-col justify-center gap-3 px-5 pt-2 text-[13px]">
        <p className="text-zinc-600">{copy.approvalCard.lead}</p>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            <span aria-hidden="true" className="w-1 shrink-0 rounded-full bg-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">{copy.approvalCard.title}</p>
              <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                {copy.approvalCard.cmd}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-white">
              {copy.approvalCard.once}
            </span>
            <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600">
              {copy.approvalCard.always}
            </span>
            <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600">
              {copy.approvalCard.reject}
            </span>
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          <span className="text-emerald-600">✓ {copy.approvalCard.approved}</span> ·{" "}
          {copy.approvalCard.note}
        </p>
      </div>
      <div className="mt-auto pt-4 text-zinc-900">
        <CardFooter title={copy.approvalCard.title2} view={copy.view} />
      </div>
    </div>
  );
}

export function SessionDemoZone({ lang = "zh" }: { lang?: Lang }): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const copy = SDZ_COPY[lang];
  const sectionRef = React.useRef<HTMLElement>(null);
  const onScreen = useInView(sectionRef);
  const state = useDemoScript(reducedMotion, copy.streamText, onScreen);

  return (
    <section
      ref={sectionRef}
      id="demo"
      className="scroll-mt-16 px-6 py-20"
      aria-label={copy.sectionAria}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <Link
          href={lang === "en" ? "/en/features" : "/features"}
          aria-label={copy.chatAria}
          className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spark-accent"
        >
          <ChatCard copy={copy} />
        </Link>
        <Link
          href={lang === "en" ? "/en/features" : "/features"}
          aria-label={copy.buildAria}
          className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spark-accent"
        >
          <TerminalCard state={state} copy={copy} />
        </Link>
        <Link
          href={lang === "en" ? "/en/features" : "/features"}
          aria-label={copy.approvalAria}
          className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spark-accent"
        >
          <ApprovalCard copy={copy} />
        </Link>
      </div>
    </section>
  );
}

SessionDemoZone.displayName = "SessionDemoZone";
