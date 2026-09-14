import * as React from "react";

/**
 * ArchitectureDiagram — 五层架构分层图，纯 div + CSS 构建（无外部 SVG，方便 hover 交互）。
 * Server Component：只用 CSS hover，不引入 Motion。
 * 层与层之间用竖线连接（`w-px h-8 bg-border mx-auto`）。
 */

interface Layer {
  name: string;
  description: string;
}

const LAYERS: readonly Layer[] = [
  {
    name: "apps/*",
    description: "四端 UI（Web · Desktop · CLI · Mobile）",
  },
  {
    name: "@spark/protocol",
    description: "27 种事件词表 · zod schema · Transport",
  },
  {
    name: "apps/server",
    description: "Fastify · SSE · 仅绑定 127.0.0.1",
  },
  {
    name: "@spark/engine",
    description: "InputQueue \u2192 RunLoop \u2192 ToolPipeline",
  },
  {
    name: "sessions/*.jsonl",
    description: "durable append-only · 完整可回放",
  },
];

export function ArchitectureDiagram(): React.JSX.Element {
  return (
    <section
      id="architecture"
      className="px-6 py-32"
      aria-labelledby="architecture-heading"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-16 max-w-2xl">
          <h2
            id="architecture-heading"
            className="text-[28px] font-semibold tracking-tight text-foreground"
          >
            架构一览
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            五层分离，协议驱动。
          </p>
        </header>

        <div
          className="mx-auto max-w-2xl"
          role="list"
          aria-label="Spark 架构分层：从四端 UI 到持久化日志"
        >
          {LAYERS.map((layer, index) => (
            <React.Fragment key={layer.name}>
              <div
                role="listitem"
                className="group flex flex-col gap-2 rounded-lg border border-border bg-background px-6 py-4 transition-colors hover:border-spark-accent/50 hover:bg-card sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <span className="font-mono text-sm font-medium text-foreground">
                  {layer.name}
                </span>
                <span className="text-sm text-muted-foreground sm:text-right">
                  {layer.description}
                </span>
              </div>

              {/* 连接线：最后一层之后不再画 */}
              {index < LAYERS.length - 1 ? (
                <div
                  aria-hidden="true"
                  className="mx-auto h-8 w-px bg-border"
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center font-mono text-xs text-muted-foreground/70">
          {"\u2193 data flow: user input \u2192 engine \u2192 events \u2192 UI"}
        </p>
      </div>
    </section>
  );
}

ArchitectureDiagram.displayName = "ArchitectureDiagram";
