"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonVariants } from "@/components/ui/button";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * QuickStartCTA — 页尾三步启动 CTA。
 * 严禁 "Get Started"/"开始使用" 空泛文案（DESIGN §12），所以标题是具体的"三步启动"。
 * 严禁大渐变背景，只用 bg-card/50 微微区分。
 */

const INSTALL_SCRIPT = `npm i -g @spark/cli
spark up
# 浏览器自动打开，配置模型 API Key`;

export function QuickStartCTA(): React.JSX.Element {
  return (
    <section
      id="quickstart"
      className="border-t border-border bg-card/50 px-6 py-32"
      aria-labelledby="quickstart-heading"
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-10 text-center">
        <header className="flex flex-col gap-3">
          <h2
            id="quickstart-heading"
            className="text-[28px] font-semibold tracking-tight text-foreground"
          >
            三步启动
          </h2>
          <p className="text-base text-muted-foreground">
            安装 CLI、启动服务、浏览器接管。
          </p>
        </header>

        <CodeBlock
          code={INSTALL_SCRIPT}
          language="bash"
          className="w-full text-left"
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
          {/* ShimmerButton 是 <button>，外链通过 onClick + window.open 跳转（避免 <a> 嵌 <button>） */}
          <ShimmerButton
            type="button"
            onClick={() => {
              window.open(LINKS.github, "_blank", "noopener,noreferrer");
            }}
            aria-label="浏览源码（在新标签打开 GitHub 仓库）"
          >
            <span className="inline-flex items-center">
              浏览源码
              <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </ShimmerButton>

          <Link
            href={LINKS.docs}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            阅读文档
          </Link>
        </div>

        <p className="font-mono text-xs text-muted-foreground/70">
          MIT licensed · 127.0.0.1 only · no cloud dependency
        </p>
      </div>
    </section>
  );
}

QuickStartCTA.displayName = "QuickStartCTA";
