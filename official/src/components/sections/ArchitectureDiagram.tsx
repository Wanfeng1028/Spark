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
      // Bug 6 修复：sticky header 高 56px，锚点跳转留 64px 余量避免遮挡。
      // 灰带节奏（v2.28）：白 → 暗（demo）→ 白 → 灰（本区）→ 白 → 暗（quickstart）
      className="scroll-mt-16 border-y border-border bg-zinc-50 px-6 py-32"
      aria-labelledby="architecture-heading"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-16 max-w-2xl">
          <h2
            id="architecture-heading"
            className="text-[30px] font-semibold tracking-tight text-foreground sm:text-[38px]"
          >
            架构一览
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            五层：四端 UI / 协议 / 服务端 / 引擎 / 会话文件。
          </p>
        </header>

        {/* Bug 7 修复：ARIA role="list" 容器的直接子元素必须全部是 role="listitem"，
            原实现把连接线 div 与 listitem 平级放（用 React.Fragment 包裹），违反 ARIA 规范。
            改成外层 listitem 包「层块 + 连接线」，连接线作为 listitem 内部最后一个子元素；
            listitem 用 flex-col 让两块纵向堆叠，连接线 mx-auto 保持水平居中——视觉与原来一致。 */}
        <div
          className="mx-auto max-w-2xl"
          role="list"
          aria-label="Spark 架构分层：从四端 UI 到持久化日志"
        >
          {LAYERS.map((layer, index) => (
            <div
              key={layer.name}
              role="listitem"
              className="flex flex-col"
            >
              <div className="group flex flex-col gap-2 rounded-lg border border-border bg-background px-6 py-4 transition-colors hover:border-spark-accent/50 hover:bg-card sm:flex-row sm:items-center sm:justify-between sm:gap-6">
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
            </div>
          ))}
        </div>

        {/* Bug 5 修复：小字号（text-xs）+ /70 透明度对比度不达标（亮色 ~2.7:1），
            直接用 text-muted-foreground（亮色 4.9:1）达 WCAG AA；层级弱化已由字号承担。 */}
        <p className="mx-auto mt-12 max-w-2xl text-center font-mono text-xs text-muted-foreground">
          {"\u2193 data flow: user input \u2192 engine \u2192 events \u2192 UI"}
        </p>
      </div>
    </section>
  );
}

ArchitectureDiagram.displayName = "ArchitectureDiagram";
