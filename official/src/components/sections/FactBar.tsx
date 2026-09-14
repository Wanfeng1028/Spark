import * as React from "react";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { FACTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * FactBar — 事实数字横条（27 / 23 / 4 / MIT）。
 * 无卡片、无渐变，裸排 + divide-x 分隔，让数字自己说话（DESIGN §12：禁止装饰性统计卡）。
 * MIT 是文字不是数字，直接排版。
 *
 * Bug 8 修复：本组件自身不引用 hooks / 事件处理 / motion——NumberTicker 已是 client boundary，
 * 传入的 value/delay 是可序列化数值。移除 "use client" 让 FACTS_LIST 静态数据留在服务端 bundle。
 */

type FactKind = "number" | "text";

interface Fact {
  kind: FactKind;
  value: number | string;
  label: string;
}

const FACTS_LIST: readonly Fact[] = [
  { kind: "number", value: FACTS.eventTypes, label: "事件词表" },
  { kind: "number", value: FACTS.builtinCommands, label: "内置命令" },
  { kind: "number", value: FACTS.endpoints, label: "端形态" },
  { kind: "text", value: FACTS.license, label: "开源许可" },
];

export function FactBar(): React.JSX.Element {
  return (
    <section
      id="facts"
      // Bug 6 修复：sticky header 高 56px，锚点跳转留 64px 余量避免遮挡。
      className="border-y border-border bg-background px-6 py-20 scroll-mt-16"
      aria-label="项目关键事实数字"
    >
      <div className="mx-auto max-w-7xl">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:divide-x md:divide-border">
          {FACTS_LIST.map((fact, index) => (
            <div
              key={fact.label}
              className={cn(
                "flex flex-col-reverse items-start gap-2 md:items-center md:text-center",
                index > 0 && "md:pl-8",
                index < FACTS_LIST.length - 1 && "md:pr-8",
              )}
            >
              <dt className="text-sm text-muted-foreground">{fact.label}</dt>
              <dd className="font-mono text-3xl font-semibold tabular-nums text-foreground">
                {fact.kind === "number" ? (
                  <NumberTicker
                    value={typeof fact.value === "number" ? fact.value : 0}
                    delay={index * 0.08}
                  />
                ) : (
                  <span>{fact.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

FactBar.displayName = "FactBar";
