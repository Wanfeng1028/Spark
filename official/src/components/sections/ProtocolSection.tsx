import * as React from "react";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Marquee } from "@/components/magicui/marquee";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { FACTS } from "@/lib/constants";

/**
 * ProtocolSection — 协议区（对标 x.ai "For developers" 区：标题 + 描述 + 词表跑马灯 +
 * 统计行，DESIGN v2.29；吸收原 FactBar 的统计数字）。
 * 跑马灯内容是 packages/protocol/src/events.ts EventSchemas 的**真实键名**（2026-09-20
 * 逐条 grep 取自源码，禁假状态 §5）——live-only 三枚照实混排，与产品词表一致。
 * 统计数字与 FactBar 同源（FACTS 常量，CI 校同步）。
 */

const EVENT_NAMES = [
  "user.message",
  "assistant.delta",
  "assistant.message",
  "reasoning.delta",
  "tool.started",
  "tool.progress",
  "tool.completed",
  "permission.asked",
  "permission.resolved",
  "session.created",
  "session.mode.changed",
  "session.resumed",
  "memory.injected",
  "goal.set",
  "goal.updated",
  "checkpoint.created",
  "io.warning",
  "lsp.diagnostics",
] as const;

interface Fact {
  value: number | string;
  label: string;
}

const FACTS_LIST: readonly Fact[] = [
  { value: FACTS.eventTypes, label: "事件词表" },
  { value: FACTS.builtinCommands, label: "内置命令" },
  { value: FACTS.endpoints, label: "端形态" },
  { value: FACTS.license, label: "开源许可" },
];

export function ProtocolSection(): React.JSX.Element {
  return (
    <section id="protocol" className="scroll-mt-16 px-6 py-28" aria-labelledby="protocol-heading">
      <div className="mx-auto max-w-7xl">
        <BlurFade delay={0}>
          <header className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs text-muted-foreground">协议</p>
            <h2
              id="protocol-heading"
              className="mt-2 text-[30px] font-semibold tracking-tight text-foreground sm:text-[38px]"
            >
              一份协议。四端界面。
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              事件词表、zod schema、applyEvent reducer、Transport
              全在 <span className="font-mono text-sm text-foreground">@spark/protocol</span>
              ——是运行时代码，不是类型包。断线按 seq 续播，回放重建完整界面。
            </p>
          </header>
        </BlurFade>

        {/* 事件词表跑马灯：真实事件名滚动，hover 暂停（§6 微动效；marquee 为既有组件） */}
        <BlurFade delay={0.05} yOffset={16}>
          <div className="mt-12 overflow-hidden rounded-xl border border-border bg-zinc-50 py-4">
            <Marquee pauseOnHover speed={46}>
              {EVENT_NAMES.map((name) => (
                <span
                  key={name}
                  className="font-mono text-[13px] text-zinc-500"
                >
                  {name}
                </span>
              ))}
            </Marquee>
          </div>
        </BlurFade>

        {/* 统计行：裸排 + divide-x，数字自己说话（禁装饰性统计卡，§12.5） */}
        <BlurFade delay={0.1} yOffset={16}>
          <dl className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:divide-x md:divide-border">
            {FACTS_LIST.map((fact, index) => (
              <div
                key={fact.label}
                className={
                  index > 0 ? "flex flex-col items-center gap-2 md:px-8" : "flex flex-col items-center gap-2"
                }
              >
                <dt className="order-2 text-sm text-muted-foreground">{fact.label}</dt>
                <dd className="order-1 font-mono text-4xl font-semibold tabular-nums text-foreground sm:text-5xl">
                  {typeof fact.value === "number" ? (
                    <NumberTicker value={fact.value} delay={index * 0.08} />
                  ) : (
                    fact.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </BlurFade>
      </div>
    </section>
  );
}

ProtocolSection.displayName = "ProtocolSection";
