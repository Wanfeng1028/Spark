"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { BlurFade } from "@/components/magicui/blur-fade";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { buttonVariants } from "@/components/ui/button";
import { LINKS, FACTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * ProtocolSection — 开发者区（x.ai "For developers" 实拍同构，DESIGN v2.31）：
 * 左=eyebrow + display 巨字 + 描述 + 双按钮 + 三统计（大号 display 数字 + 竖分隔，
 * 不用 mono——对齐 x.ai 统计行排版）；右=橙色插画块上浮白色代码窗（macOS 三色点 +
 * Copy 按钮 + 手工语法高亮），四角选中手柄是 x.ai 的签名视觉；语言 tab 在插画块下方。
 *
 * 代码为真实 API 面（禁假状态 §5）：createClient（ADR D30，@spark/sdk 根入口）、
 * 便利分组 sessions/events/approvals、Transport.onEvent（packages/protocol/src/transport.ts，
 * features 页引用同源）。高亮色 span 为手写标注，不改 CodeBlock 组件。
 */

const TS_LINES: readonly React.ReactNode[] = [
  <React.Fragment key="l0">
    <span className="text-sky-600">import</span>
    <span className="text-zinc-800"> {"{ createClient } "} </span>
    <span className="text-sky-600">from</span>
    <span className="text-rose-600"> &quot;@spark/sdk&quot;</span>
    <span className="text-zinc-800">;</span>
  </React.Fragment>,
  <span key="l1" className="text-zinc-400">
    {"// HTTP 客户端：装配 HttpTransport + 便利分组（ADR D30）"}
  </span>,
  <React.Fragment key="l2">
    <span className="text-sky-600">const</span>
    <span className="text-zinc-800"> client = </span>
    <span className="text-indigo-600">createClient</span>
    <span className="text-zinc-800">(</span>
    <span className="text-rose-600">&quot;http://127.0.0.1:4318&quot;</span>
    <span className="text-zinc-800">);</span>
  </React.Fragment>,
  <span key="l3" className="text-zinc-400">
    {"// 事件流是 UI 的唯一状态源：SSE 按 seq 续播"}
  </span>,
  <React.Fragment key="l4">
    <span className="text-zinc-800">client.events.</span>
    <span className="text-indigo-600">onEvent</span>
    <span className="text-zinc-800">((envelope) =&gt; {"{"}</span>
  </React.Fragment>,
  <span key="l5" className="text-zinc-400">
    {"  // 27 种事件经 applyEvent 折叠成 UI 状态"}
  </span>,
  <span key="l6" className="text-zinc-800">
    {"});"}
  </span>,
];

const SH_LINES: readonly string[] = ["npm i -g @spark/cli", "spark up", "# → 127.0.0.1:4318 · TUI 就绪"];

const STATS = [
  { value: FACTS.eventTypes, label: "事件词表" },
  { value: FACTS.builtinCommands, label: "内置命令" },
  { value: FACTS.endpoints, label: "端形态" },
] as const;

function CodeWindow(): React.JSX.Element {
  const [tab, setTab] = React.useState<"ts" | "sh">("ts");
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const plainText =
    tab === "ts"
      ? TS_LINES.map((node) => {
          // 提取纯文本仅用于复制：ReactChildren 摊平取字符串
          return React.Children.toArray(node).map((child) => {
            if (typeof child === "string") return child;
            if (React.isValidElement(child)) {
              const inner = child.props as { children?: React.ReactNode };
              return React.Children.toArray(inner.children ?? [])
                .map((c) => (typeof c === "string" ? c : ""))
                .join("");
            }
            return "";
          }).join("");
        }).join("\n")
      : SH_LINES.join("\n");

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用（非安全上下文）时静默结束，按钮态不复位 */
    }
  }, [plainText]);

  return (
    <div>
      {/* 橙色插画块 + 四角选中手柄（x.ai 签名视觉，v2.31 官网色彩豁免项） */}
      <div className="relative rounded-3xl bg-[radial-gradient(115%_95%_at_20%_10%,#fdba74_0%,#f97316_52%,#dc2626_115%)] p-5 sm:p-8">
        <span
          aria-hidden="true"
          className="absolute -left-1 -top-1 h-2.5 w-2.5 border border-zinc-500 bg-white"
        />
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 h-2.5 w-2.5 border border-zinc-500 bg-white"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -left-1 h-2.5 w-2.5 border border-zinc-500 bg-white"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 h-2.5 w-2.5 border border-zinc-500 bg-white"
        />

        {/* 白色代码窗：macOS 三色点 + Copy */}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" aria-hidden="true" />
            </div>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? "已复制" : "复制代码"}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copied ? "已复制" : "Copy"}
            </button>
          </div>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6">
            <code>
              {tab === "ts"
                ? TS_LINES.map((node, i) => (
                    <span key={i} className="block whitespace-pre">
                      {node}
                    </span>
                  ))
                : SH_LINES.map((line, i) => (
                    <span key={i} className="block whitespace-pre text-zinc-800">
                      {line}
                    </span>
                  ))}
            </code>
          </pre>
        </div>
      </div>

      {/* 语言 tab（插画块下方，x.ai Python/TypeScript/cURL 同位） */}
      <div className="mt-5 flex flex-wrap items-center gap-1" role="tablist" aria-label="代码示例语言">
        {(
          [
            { key: "ts", label: "TypeScript" },
            { key: "sh", label: "安装脚本" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              tab === item.key
                ? "bg-zinc-100 font-medium text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProtocolSection(): React.JSX.Element {
  return (
    <section id="protocol" className="scroll-mt-16 px-6 py-28" aria-labelledby="protocol-heading">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-2">
        <BlurFade delay={0}>
          <div>
            <p className="text-sm text-zinc-500">开发者</p>
            <h2
              id="protocol-heading"
              className="mt-4 text-[40px] font-semibold leading-[1.1] tracking-tight text-zinc-900 sm:text-[56px]"
            >
              一份协议。
              <br />
              四端界面。
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              事件词表、zod schema、applyEvent reducer、Transport 全在
              <span className="font-mono text-base text-zinc-800"> @spark/protocol</span>
              ——是运行时代码，不是类型包。断线按 seq 续播，回放重建完整界面。
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href={LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ size: "lg" }), "rounded-full px-7")}
              >
                查看源码
              </a>
              <a
                href={LINKS.docs}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "border-transparent bg-zinc-100 hover:bg-zinc-200",
                )}
              >
                阅读文档
              </a>
            </div>

            {/* 统计行：display 数字 + 竖分隔（x.ai 400M+/200K/122 同构，非 mono） */}
            <dl className="mt-14 grid grid-cols-3 gap-y-8 divide-x divide-zinc-200">
              {STATS.map((stat, index) => (
                <div key={stat.label} className={cn("flex flex-col gap-1", index > 0 && "pl-8")}>
                  <dd className="text-4xl font-semibold tabular-nums tracking-tight text-zinc-900 sm:text-5xl">
                    <NumberTicker value={stat.value} delay={index * 0.08} />
                  </dd>
                  <dt className="order-2 text-sm text-muted-foreground">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </BlurFade>

        <BlurFade delay={0.08} yOffset={20}>
          <CodeWindow />
        </BlurFade>
      </div>
    </section>
  );
}

ProtocolSection.displayName = "ProtocolSection";
