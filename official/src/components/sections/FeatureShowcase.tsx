import * as React from "react";
import { BlurFade } from "@/components/magicui/blur-fade";
import { cn } from "@/lib/utils";

/**
 * FeatureShowcase — 四项核心能力纵向堆叠，图文交替。
 * 严禁"三张特性卡一行 / bento 网格"（DESIGN §12），所以是 4 项，且每项占大空间。
 * 每项：文字侧（标题 + 描述 + 一行代码事实）+ 图片侧（截图 SVG）。
 *
 * code 行写的是真实事件名与字段，取自 packages/protocol/src/events.ts：
 * - assistant.delta / reasoning.delta / tool.progress 三枚标了 live-only（不落盘）
 * - tool.started { callId, name, input } → tool.completed { output, isError, durationMs }
 * - permission.asked / permission.resolved { reply: once|always|reject }
 *
 * Bug 8 修复：本组件自身不引用 hooks / 事件处理 / 直接 motion.*——BlurFade 已是 client boundary，
 * FEATURES 是纯静态数据。移除 "use client" 让数据数组留在服务端 bundle，客户端只拿到必要的 DOM。
 */

interface Feature {
  title: string;
  description: string;
  code: string;
  screenshot: string;
  alt: string;
  /** Bug 3 修复：SVG 固有尺寸，写进 <img width/height> 让浏览器在懒加载前预留宽高比，消除 CLS。 */
  width: number;
  height: number;
}

const FEATURES: readonly Feature[] = [
  {
    title: "流式对话",
    description:
      "模型输出按 token 切成 assistant.delta 事件推送，四端各自用同一份 applyEvent reducer 把事件流折叠成 UI 状态。delta 类事件是 live-only：不落盘，断线重连后由 durable 的 assistant.message 重建终态。",
    code: "assistant.delta · reasoning.delta · tool.progress = live-only",
    screenshot: "/screenshots/web-session.svg",
    alt: "Web 端会话截图：左侧会话列表，右侧流式对话面板",
    width: 1200,
    height: 800,
  },
  {
    title: "工具调用可视化",
    description:
      "工具状态机 started → progress → completed 全程上屏：输入、输出、耗时（durationMs）、是否错误（isError）都是事件字段。失败时错误码（E_PATH_OUTSIDE / E_SANDBOX_UNAVAILABLE 等）同屏呈现。",
    code: "tool.started { input } → tool.completed { output, isError, durationMs }",
    screenshot: "/screenshots/desktop-shell.svg",
    alt: "桌面端截图：Electron 壳内的工具调用详情面板",
    width: 1200,
    height: 800,
  },
  {
    title: "人工审批",
    description:
      "permission.asked 弹卡，答复只有 once / always / reject；超时、异常、中断一律结清为 reject（fail-closed）。审批事件是 log-only：永不进模型历史，但 durable 落盘，事后可回放每一次决策。",
    code: "permission.resolved { reply: 'once' | 'always' | 'reject' }",
    screenshot: "/screenshots/mobile-chat.svg",
    alt: "移动端截图：审批弹窗与对话流",
    // 竖幅 1:2，是 Bug 2 的元凶：无高度约束时 lg 断点下会渲染到 1216px，纵向节奏被破坏。
    width: 400,
    height: 800,
  },
  {
    title: "四端同一协议",
    description:
      "Web、Desktop、CLI、Mobile（含小程序）共享 @spark/protocol 的 27 种事件词表与 Transport 接口。词表扩展走 declaration merging，schema registry 是唯一来源，四端不会各自漂移出一套事件名。",
    code: "@spark/protocol · 27 种事件 · Web / Desktop / CLI / Mobile",
    screenshot: "/screenshots/cli-tui.svg",
    alt: "CLI 端截图：Ink 7 终端 TUI 纯单栏会话流",
    width: 800,
    height: 600,
  },
];

export function FeatureShowcase(): React.JSX.Element {
  return (
    <section
      id="features"
      // Bug 6 修复：sticky header 高 56px，锚点跳转留 64px 余量避免遮挡。
      className="px-6 py-32 scroll-mt-16"
      aria-labelledby="features-heading"
    >
      <div className="mx-auto max-w-7xl">
        <BlurFade delay={0}>
          <header className="mb-24 max-w-2xl">
            <h2
              id="features-heading"
              className="text-[28px] font-semibold tracking-tight text-foreground"
            >
              核心能力
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              四项能力共用一份事件词表：流式渲染、工具状态机、审批卡、四端同步
              都是同一套 reducer 的不同分支。
            </p>
          </header>
        </BlurFade>

        <div className="flex flex-col gap-32">
          {FEATURES.map((feature, index) => {
            const reversed = index % 2 === 1;
            return (
              <BlurFade key={feature.title} delay={0.05} yOffset={24}>
                <article
                  className={cn(
                    "grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16",
                  )}
                >
                  {/* 文字侧 */}
                  <div className={cn(reversed && "lg:order-2")}>
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                    {/* 代码事实行：用顶部分隔线区隔，不用彩色左边框条
                        （DESIGN §12.4 P1：左边框只允许表达语义状态） */}
                    <p className="mt-6 border-t border-border pt-4 font-mono text-sm text-spark-accent">
                      {feature.code}
                    </p>
                  </div>

                  {/* 图片侧
                      Bug 2 修复：所有截图统一 max-h-[420px] 上限，避免竖幅 mobile-chat（400×800）
                      在 lg 断点下列宽 608px 时渲染到 1216px 打破纵向节奏；object-contain 保比例不裁切。
                      Bug 3 修复：width/height 属性提供固有比例，浏览器加载前预留空间消除 CLS。 */}
                  <div className={cn(reversed && "lg:order-1")}>
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={feature.screenshot}
                        alt={feature.alt}
                        loading="lazy"
                        width={feature.width}
                        height={feature.height}
                        className="block h-auto max-h-[420px] w-full object-contain"
                      />
                    </div>
                  </div>
                </article>
              </BlurFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}

FeatureShowcase.displayName = "FeatureShowcase";
