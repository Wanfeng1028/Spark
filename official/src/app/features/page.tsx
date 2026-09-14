import type { Metadata } from "next";
import { BlurFade } from "@/components/magicui/blur-fade";
import { CodeBlock } from "@/components/ui/code-block";

export const metadata: Metadata = {
  title: "核心能力 — Spark",
  description: "流式对话、工具调用可视化、人工审批、四端同一协议",
};

export const dynamic = "force-static";

interface Feature {
  title: string;
  description: string;
  technicalDetail: string;
  code: string;
  language: string;
}

const FEATURES: readonly Feature[] = [
  {
    title: "流式对话",
    description:
      "token 级增量渲染，延迟低于人眼感知阈值。用户输入到首 token 出现的时间始终控制在模型本身响应延迟之内，UI 层零额外开销。",
    technicalDetail:
      "27 种事件类型通过 SSE 实时推送到客户端，Projector 将事件流投影为 UI 状态。事件按 durable / live / surface 三属性分类——durable 事件落盘可回放，live 事件仅存在于连接生命周期内，surface 事件直接映射为可见 UI 变更。",
    code: `// @spark/protocol — 事件词表片段
export const EVENT_TYPES = {
  "message.delta":      { durable: true,  surface: true  },
  "message.complete":   { durable: true,  surface: true  },
  "tool.start":         { durable: true,  surface: true  },
  "tool.end":           { durable: true,  surface: true  },
  "approval.requested": { durable: true,  surface: true  },
  "session.mode.changed": { durable: true, surface: false },
  // ...共 27 种
} as const;`,
    language: "typescript",
  },
  {
    title: "工具调用可视化",
    description:
      "每一次 tool invocation 的输入参数、输出结果、执行耗时全量展示。不存在黑箱——用户能完整看到 Agent 做了什么、为什么这么做。",
    technicalDetail:
      "ToolPipeline 记录完整调用链，前端通过 tool.start / tool.end 事件实时渲染。工具执行前的审批拦截与执行后的结果回传共享同一事件管道，保证时序一致。",
    code: `// 工具调用日志格式（append-only JSONL）
{"type":"tool.start","tool":"bash","input":{"command":"ls -la"},"ts":1725638400}
{"type":"tool.end","tool":"bash","output":"total 42\\n...","duration_ms":128,"ts":1725638400}
{"type":"tool.start","tool":"file_write","input":{"path":"src/index.ts"},"ts":1725638401}
{"type":"approval.requested","tool":"file_write","risk":"high","ts":1725638401}`,
    language: "jsonl",
  },
  {
    title: "人工审批 (fail-closed)",
    description:
      "高危操作必须人类确认，超时一律拒绝。默认拒绝比默认放行安全得多——这是 Spark 的核心安全立场。",
    technicalDetail:
      "approval 事件触发 UI 确认卡片，durable 存储审批决策，事后可完整回放审计链。审批超时时间可配置，超时后引擎自动执行 reject 路径并记录原因。",
    code: `// 审批流程
// 1. 引擎判定风险等级 → 发出 approval.requested
// 2. 前端渲染确认卡片（allow / deny）
// 3. 用户操作 → approval.resolved { decision: "allow" | "deny" }
// 4. 超时未响应 → approval.resolved { decision: "deny", reason: "timeout" }
//
// 所有决策 durable 落盘，可回放

type ApprovalDecision = "allow" | "deny";

interface ApprovalResolved {
  type: "approval.resolved";
  decision: ApprovalDecision;
  reason?: string;
  ts: number;
}`,
    language: "typescript",
  },
  {
    title: "四端同一协议",
    description:
      "Web / Desktop / CLI / Mobile 共享 @spark/protocol。协议层是运行时代码而非类型包——四端执行相同的 reducer 逻辑，保证行为一致性。",
    technicalDetail:
      "Transport 抽象层统一 SSE 和 InProcess 两种连接方式，MockTransport 保证四端对等测试。任何新端只需实现 Transport 接口即可获得完整功能，无需重写业务逻辑。",
    code: `// @spark/protocol — Transport 接口
interface Transport {
  connect(sessionId: string): void;
  send(event: ClientEvent): void;
  redeemPair(code: string): Promise<PairResult>;
  close(): void;

  readonly authToken: string | undefined;
  onEvent(handler: (event: ServerEvent) => void): Unsubscribe;
  onError(handler: (error: TransportError) => void): Unsubscribe;
  onStatusChange(handler: (status: ConnectionStatus) => void): Unsubscribe;
}

// 实现：HttpTransport (SSE) / InProcessTransport / MockTransport`,
    language: "typescript",
  },
];

export default function FeaturesPage() {
  return (
    <>
      <div className="px-6 pb-16 pt-32">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-[32px] font-semibold tracking-tight text-foreground">
            核心能力
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            四件事做到位：流式对话、工具调用可视化、人工审批、四端同一协议。
          </p>
        </div>
      </div>

      <div className="px-6 pb-32">
        <div className="mx-auto max-w-4xl">
          {FEATURES.map((feature, index) => (
            <BlurFade key={feature.title} delay={index * 0.08}>
              <section
                className={
                  index < FEATURES.length - 1
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

                <p className="mt-4 text-sm leading-relaxed text-muted-foreground/80">
                  {feature.technicalDetail}
                </p>

                <div className="mt-6">
                  <CodeBlock code={feature.code} language={feature.language} />
                </div>
              </section>
            </BlurFade>
          ))}
        </div>
      </div>
    </>
  );
}
