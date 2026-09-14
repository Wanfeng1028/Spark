"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";
import { BlurFade } from "@/components/magicui/blur-fade";

/**
 * SecurityModel — 四条安全承诺，纵向列表（不包裹卡片，DESIGN §12：禁止装饰性卡片阵列）。
 * 每条：序号 + 标题 + 一句说明 + 一行事实证据（font-mono）。
 * 标题用 BlurFade；列表项直接用 motion.li + staggerChildren，避免 BlurFade 的 <div> 破坏 <ol>/<li> 语义。
 */

interface SecurityPromise {
  title: string;
  description: string;
  evidence: string;
}

const PROMISES: readonly SecurityPromise[] = [
  {
    title: "本地优先",
    description: "数据不离开本机，无云端依赖。默认绑定回环地址，外部网络无法访问。",
    evidence: "bind: 127.0.0.1:3100",
  },
  {
    title: "Fail-closed 审批",
    description: "高危工具调用必须人类确认，超时即拒绝。默认拒绝比默认放行安全得多。",
    evidence: "approval.timeout \u2192 reject",
  },
  {
    title: "硬边界先行",
    description: "Bash 走 sandbox wrapper，文件系统写入隔离。护栏在工具执行前生效，而非事后审计。",
    evidence: "sandbox: wrapper \u2192 exec",
  },
  {
    title: "Durable 可审计",
    description: "Append-only JSONL 日志，完整会话可回放重建。任何一次决策都有据可查。",
    evidence: "~/.spark/sessions/<cwd>/<id>.jsonl",
  },
];

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

export function SecurityModel(): React.JSX.Element {
  return (
    <section
      id="security"
      className="px-6 py-32"
      aria-labelledby="security-heading"
    >
      <div className="mx-auto max-w-3xl">
        <BlurFade delay={0}>
          <header className="mb-16">
            <h2
              id="security-heading"
              className="text-[28px] font-semibold tracking-tight text-foreground"
            >
              安全模型
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              每一步可审计，每一个操作有边界。
            </p>
          </header>
        </BlurFade>

        <motion.ol
          className="flex flex-col gap-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={listVariants}
        >
          {PROMISES.map((item, index) => (
            <motion.li
              key={item.title}
              variants={itemVariants}
              className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2"
            >
              {/* 序号（mono，克制） */}
              <span
                aria-hidden="true"
                className="pt-1 font-mono text-sm text-muted-foreground/70"
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-medium text-foreground">
                  {item.title}
                </h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
                <code className="mt-1 inline-block w-fit rounded border border-border bg-card px-2 py-1 font-mono text-xs text-muted-foreground/80">
                  {item.evidence}
                </code>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}

SecurityModel.displayName = "SecurityModel";
