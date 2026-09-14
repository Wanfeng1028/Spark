"use client";

import * as React from "react";
import { BlurFade } from "@/components/magicui/blur-fade";
import { cn } from "@/lib/utils";

/**
 * FeatureShowcase — 四项核心能力纵向堆叠，图文交替。
 * 严禁"三张特性卡一行 / bento 网格"（DESIGN §12），所以是 4 项，且每项占大空间。
 * 每项：文字侧（标题 + 描述 + 一行代码事实）+ 图片侧（截图 SVG）。
 */

interface Feature {
  title: string;
  description: string;
  code: string;
  screenshot: string;
  alt: string;
}

const FEATURES: readonly Feature[] = [
  {
    title: "流式对话",
    description:
      "Token 级增量渲染，27 种事件实时投影到 UI。从模型输出到界面刷新的延迟低于人眼感知阈值，对话过程可见即可得。",
    code: "token 级增量 · 27 种事件实时投影",
    screenshot: "/screenshots/web-session.svg",
    alt: "Web 端会话截图：左侧会话列表，右侧流式对话面板",
  },
  {
    title: "工具调用可视化",
    description:
      "每一次 tool invocation 的输入、输出、耗时全量展示。执行路径可追溯，不再是黑盒。工具失败时错误码与堆栈同屏呈现。",
    code: "invocation.input \u2192 output · 耗时全量展示",
    screenshot: "/screenshots/desktop-shell.svg",
    alt: "桌面端截图：Electron 壳内的工具调用详情面板",
  },
  {
    title: "人工审批",
    description:
      "Fail-closed 语义：高危操作必须人类确认，超时一律拒绝。审批链 durable 落盘，事后可完整回放每一次决策。",
    code: "fail-closed · 超时 = 拒绝 · durable 可回放",
    screenshot: "/screenshots/mobile-chat.svg",
    alt: "移动端截图：审批弹窗与对话流",
  },
  {
    title: "四端同一协议",
    description:
      "Web、Desktop、CLI、Mobile 共享 @spark/protocol 事件词表。任何一端新增的能力，其他端通过 reducer 自动获得对应状态。",
    code: "@spark/protocol · Web / Desktop / CLI / Mobile",
    screenshot: "/screenshots/cli-tui.svg",
    alt: "CLI 端截图：Ink 7 终端 TUI 四区形态",
  },
];

export function FeatureShowcase(): React.JSX.Element {
  return (
    <section
      id="features"
      className="px-6 py-32"
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
              四件事，每一件都做透。
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
                    <p className="mt-6 border-l-2 border-spark-accent pl-3 font-mono text-sm text-spark-accent">
                      {feature.code}
                    </p>
                  </div>

                  {/* 图片侧 */}
                  <div className={cn(reversed && "lg:order-1")}>
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={feature.screenshot}
                        alt={feature.alt}
                        loading="lazy"
                        className="block h-auto w-full"
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
