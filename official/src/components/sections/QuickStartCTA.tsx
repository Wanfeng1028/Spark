"use client";

import * as React from "react";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonVariants } from "@/components/ui/button";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * QuickStartCTA — 页尾三步启动 CTA。
 * 标题与按钮文案给具体动作（DESIGN §12.7 禁通用 CTA 模板文案），不用空泛动词；
 * 文案末尾也不焊箭头符号（§12.7 P1），外链语义靠 aria-label 与新标签打开表达。
 * 背景只用 bg-card/50 微区分，不用渐变（§12.1）。
 * 命令与路径与根 README「Quick Start」一致：`spark up` 拉起 server 并进 TUI（不自动开浏览器）。
 */

const INSTALL_SCRIPT = `npm i -g @spark/cli
spark up
# ↑ 拉起 server（缺省 127.0.0.1:4318）并进入 TUI，退出连带回收 server
# 首回合前配一次模型：~/.spark/models.json 声明供应商，
# API key 走环境变量（不落盘、不入日志）`;

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
            className="text-[30px] font-semibold tracking-tight text-foreground sm:text-[38px]"
          >
            三步启动
          </h2>
          <p className="text-base text-muted-foreground">
            安装 CLI、一条命令拉起 server 进 TUI、配一次模型。
          </p>
        </header>

        <CodeBlock
          code={INSTALL_SCRIPT}
          language="bash"
          className="w-full text-left"
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
          <ShimmerButton
            href={LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="浏览源码（在新标签打开 GitHub 仓库）"
            /* 官网纯黑单主题下按钮底为白色，微光用深色（v2.27） */
            shimmerColor="rgba(0, 0, 0, 0.08)"
          >
            <span className="inline-flex items-center">浏览源码</span>
          </ShimmerButton>

          <a
            href={LINKS.docs}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            阅读文档
          </a>
        </div>

        <p className="font-mono text-xs text-muted-foreground">
          MIT 许可 · 默认只监听 127.0.0.1 · 无云端依赖
        </p>
      </div>
    </section>
  );
}

QuickStartCTA.displayName = "QuickStartCTA";
