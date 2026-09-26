import type { Metadata } from "next";
import { BlurFade } from "@/components/magicui/blur-fade";
import { CodeBlock } from "@/components/ui/code-block";
import type { Lang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "核心能力",
  description: "流式对话、工具调用可视化、人工审批、四端同一协议",
};

export const dynamic = "force-static";

/**
 * 代码块均为仓库真实源文件节选（禁假状态，DESIGN §5），文件路径写在首行注释里：
 * - packages/protocol/src/events.ts（词表与三分类）
 * - packages/protocol/src/primitives.ts + packages/engine/src/permission/service.ts（审批）
 * - packages/protocol/src/transport.ts（Transport 接口面）
 * 19.47 批 2b：源码节选不伪造英文版（注释是仓库源码本体，如实呈现），双语只覆盖叙述文案。
 */
const FEATURE_CODES: readonly { code: string; language: string }[] = [
  {
    code: `// packages/protocol/src/events.ts — 三分类是类型级事实，不是注释
export type LiveOnlyEventType =
  | 'assistant.delta'
  | 'reasoning.delta'
  | 'tool.progress'

/** surface 事件强制带 surface:true（编译期纪律） */
export type SurfaceEventType = 'user.message' | 'assistant.message'

export type DurableEventType = Exclude<SparkEventType, LiveOnlyEventType>

// 词表共 27 种（EventSchemas 键数）：durable 24 / live-only 3；surface 2
// 生成物 apps/docs/events.md 由 CI 重跑并 git diff --exit-code 校同步`,
    language: "typescript",
  },
  {
    code: `// packages/protocol/src/events.ts — 工具（状态机 started → [progress] → completed）
'tool.started': z.strictObject({
  turnId: TurnIdSchema,
  callId: CallIdSchema,
  name: z.string(),
  input: z.unknown(),
}),
'tool.progress': z.strictObject({
  turnId: TurnIdSchema,
  callId: CallIdSchema,
  chunk: z.string(),
}), // live-only
'tool.completed': z.strictObject({
  turnId: TurnIdSchema,
  callId: CallIdSchema,
  output: z.unknown(),
  isError: z.boolean(),
  durationMs: z.number().int().nonnegative(),
}),`,
    language: "typescript",
  },
  {
    code: `// packages/protocol/src/primitives.ts
export const PermissionReplySchema = z.enum(['once', 'always', 'reject'])

// packages/engine/src/permission/service.ts — 超时即拒绝（fail-closed）
timer: setTimeout(() => {
  void this.settle(entry, false, 'reject', 'timeout')
}, this.deps.timeoutMs),

// timeoutMs 来自 ~/.spark/spark.json 的 engine.permissionTimeoutMs，缺省 300_000（5min）
// origin: 'reply' | 'timeout' | 'abort' | 'shutdown' | 'cascade' | 'mode-change'`,
    language: "typescript",
  },
  {
    code: `// packages/protocol/src/transport.ts — 接口面节选（全量 84 个方法）
export interface Transport {
  /** 订阅事件流；返回退订函数 */
  onEvent(handler: (e: SparkEventEnvelope) => void): () => void
  sendMessage(sessionId: SessionId, text: string, opts?: SendMessageOptions): Promise<SubmitOutcome>
  interrupt(sessionId: SessionId): Promise<void>
  replyPermission(requestId: RequestId, reply: PermissionReply, feedback?: string): Promise<void>
  /** GET /api/sessions/:id：meta + durable 事件（seq 升序——冷启动回放数据源） */
  getSession(sessionId: SessionId, query?: SessionEventsQuery): Promise<SessionDto>
  /** POST /api/pair：短码兑长效 token（移动端鉴权自举，ADR D24） */
  redeemPair(body: PairRedeemBody): Promise<PairTokenDto>
  dispose(): void
}

// 实现：HttpTransport（protocol，SSE）/ MockTransport（apps/web 开发态）`,
    language: "typescript",
  },
];

const FEATURE_META: Record<
  Lang,
  readonly { title: string; description: string; technicalDetail: string }[]
> = {
  zh: [
    {
      title: "流式对话",
      description:
        "token 级增量渲染。assistant.delta / reasoning.delta / tool.progress 三类 live-only 事件不落盘、直推界面；回合结束由 assistant.message 落盘定稿。",
      technicalDetail:
        "27 种事件经 SSE 单端点（GET /api/event，since=seq 断线续播）推送。各端用同一份 applyEvent reducer 把事件流折叠成 UI 状态——协议层是运行时代码，不是类型包。注意两个「投影」不同义：UI 投影在各端的 reducer；引擎侧 Projector 投影的是模型上下文（surface 事件 → LlmMessage）。",
    },
    {
      title: "工具调用可视化",
      description:
        "每次工具调用是会话流里一个可折叠执行块：入参、输出、耗时、是否出错全量展示，失败时错误码同屏。",
      technicalDetail:
        "工具状态机 started → [progress] → completed。tool.completed 携带 isError 与 durationMs，两者都是 durable 事件——回放一遍就能重建当时看到的执行块，不靠额外埋点。",
    },
    {
      title: "人工审批 (fail-closed)",
      description:
        "写类工具触发审批卡，内联在调用位置。超时、异常、中断一律拒绝而不是放行。",
      technicalDetail:
        "permission.asked 携带 requestId / action / resource / reason，durable 落盘；用户回复写 permission.resolved，reply 只有 once / always / reject 三值。超时由引擎 settle 成 reject——默认拒绝是一条代码路径，不是一句提示语。审批事件 log-only，永不进模型历史。",
    },
    {
      title: "四端同一协议",
      description:
        "web / 桌面 / CLI / 移动端与小程序共用 @spark/protocol：事件词表、zod schema、applyEvent reducer、Transport 都在这个包里，是运行时代码而不是类型声明。",
      technicalDetail:
        "Transport 是前端唯一数据通道抽象；HttpTransport（SSE）与 MockTransport 同构实现，后端不存在时前端可全量开发。@spark/sdk 再分两个子入口：根入口走 HTTP（零 engine 依赖、浏览器可用），./inprocess 进程内直连引擎（engine 为 optional peer）。",
    },
  ],
  en: [
    {
      title: "Streaming chat",
      description:
        "Token-level incremental rendering. Three live-only event types (assistant.delta / reasoning.delta / tool.progress) go straight to the UI without persistence; the turn is finalized on disk by assistant.message when it ends.",
      technicalDetail:
        "All 27 events arrive over one SSE endpoint (GET /api/event, resuming from since=seq after a disconnect). Each surface folds the stream into UI state with the same applyEvent reducer — the protocol layer is runtime code, not a types package. Note the two \"projections\" differ: the UI projection is the per-surface reducer; the engine-side Projector projects model context (surface events → LlmMessage).",
    },
    {
      title: "Tool call visualization",
      description:
        "Every tool call is a collapsible execution block in the session flow: input, output, duration and error flag shown in full, with error codes on screen when things fail.",
      technicalDetail:
        "The tool state machine runs started → [progress] → completed. tool.completed carries isError and durationMs, both durable — replaying the file rebuilds exactly what was on screen, no extra instrumentation needed.",
    },
    {
      title: "Human approval (fail-closed)",
      description:
        "Write-class tools raise an approval card inline at the call site. Timeouts, errors and interrupts always settle to reject, never allow.",
      technicalDetail:
        "permission.asked carries requestId / action / resource / reason and persists durably; the user's reply lands as permission.resolved with exactly three values: once / always / reject. The engine settles timeouts to reject — deny-by-default is a code path, not a slogan. Approval events are log-only and never enter model history.",
    },
    {
      title: "One protocol, four surfaces",
      description:
        "Web, desktop, CLI, mobile and the mini app all share @spark/protocol: the event vocabulary, zod schemas, the applyEvent reducer and Transport live in one package — runtime code, not type declarations.",
      technicalDetail:
        "Transport is the only data-channel abstraction on the frontend; HttpTransport (SSE) and MockTransport are structurally mirrored, so development continues at full speed without a backend. @spark/sdk adds two sub-entries: the root entry speaks HTTP (zero engine dependency, browser-safe) and ./inprocess connects to the engine in-process (engine as an optional peer).",
    },
  ],
};

const FEAT_COPY = {
  zh: { heading: "核心能力", sub: "能力包含四项：流式对话、工具调用可视化、人工审批、四端同一协议。" },
  en: {
    heading: "Core capabilities",
    sub: "Four capabilities: streaming chat, tool-call visualization, human approval, and one protocol across all four surfaces.",
  },
} as const;

/** 页面内容本体：en 壳（app/en/features/page.tsx）复用本组件（19.47 批 2） */
export function FeaturesPageContent({ lang = "zh" }: { lang?: Lang }) {
  const copy = FEAT_COPY[lang];
  return (
    <div className={lang === "en" ? "lang-en" : undefined}>
      <div className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-[36px] font-medium tracking-[-0.015em] text-foreground en:font-normal en:tracking-[-0.025em] sm:text-[44px]">
            {copy.heading}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">{copy.sub}</p>
        </div>
      </div>

      <div className="px-6 pb-32">
        <div className="mx-auto max-w-4xl">
          {FEATURE_META[lang].map((feature, index) => (
            <BlurFade key={feature.title} delay={index * 0.08}>
              <section
                className={
                  index < FEATURE_META[lang].length - 1
                    ? "border-b border-border pb-16 pt-8"
                    : "pb-8 pt-8"
                }
              >
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {feature.title}
                </h2>

                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>

                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {feature.technicalDetail}
                </p>

                <div className="mt-6">
                  <CodeBlock code={FEATURE_CODES[index]?.code ?? ""} language={FEATURE_CODES[index]?.language ?? "typescript"} />
                </div>
              </section>
            </BlurFade>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FeaturesPageContent;
