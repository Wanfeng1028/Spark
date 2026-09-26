"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { BlurFade } from "@/components/magicui/blur-fade";

/**
 * SecurityModel — 四条安全承诺，纵向列表（不包裹卡片，DESIGN §12：禁止装饰性卡片阵列）。
 * 每条：序号 + 标题 + 一句说明 + 一行事实证据（font-mono）。
 * 标题用 BlurFade；列表项直接用 motion.li + staggerChildren，避免 BlurFade 的 <div> 破坏 <ol>/<li> 语义。
 *
 * 四条证据行的出处（禁假状态，逐条可核）：
 * - 绑定地址/端口：packages/engine/src/config.ts SPARK_DEFAULTS = { port: 4318, host: '127.0.0.1' }；
 *   非环回强制配对鉴权见 apps/server/src/index.ts 与 ADR D24。
 * - 审批超时：packages/engine/src/permission/service.ts settle(…, 'reject', 'timeout')，
 *   timeoutMs 取 spark.json engine.permissionTimeoutMs，缺省 300_000。
 * - 路径硬边界：packages/engine/src/tools/definition.ts resolveInRoot → E_PATH_OUTSIDE（先于审批）；
 *   bash 沙箱 packages/engine/src/tools/sandbox.ts（缺省 off，ADR D15）。
 * - 会话日志落点：packages/engine/src/session/store.ts + mungeDir(cwd)。
 */

interface SecurityPromise {
  title: string;
  description: string;
  evidence: string;
}

const PROMISES: readonly SecurityPromise[] = [
  {
    title: "缺省绑定回环",
    description:
      "server 缺省只监听回环地址，会话数据全部落在本机 ~/.spark/ 下。需要对外暴露时（非环回绑定）强制开启配对鉴权：6 位短码换长效 token。",
    evidence: "server: { host: '127.0.0.1', port: 4318 }",
  },
  {
    title: "Fail-closed 审批",
    description:
      "写类工具与 bash 必须人类确认，答复只有 once / always / reject 三种。超时、异常、中断、级联、模式切换一律结清为 reject，审计主体记 system；bash 工具缺省全审批。",
    evidence: "timeout \u2192 permission.resolved { reply: 'reject' }",
  },
  {
    title: "硬边界先行",
    description:
      "允许根 = cwd，路径 resolve 归一后越界直接抛 E_PATH_OUTSIDE，发生在审批之前而不是事后审计。可选的 bash 沙箱走平台 wrapper 前缀（Linux bwrap / macOS Seatbelt），wrapper 不可用即拒跑，不降级裸跑。",
    evidence: "resolveInRoot \u2192 E_PATH_OUTSIDE",
  },
  {
    title: "Durable 可审计",
    description:
      "append-only JSONL：第 0 行是 header，其后每行一个事件信封，seq 等于文件行号。只追加不改写，因此可回放、可分叉、可回滚（checkpoint）。",
    evidence: "~/.spark/sessions/<mungeDir(cwd)>/<ts>_<id>.jsonl",
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
  // Bug 10 修复：prefers-reduced-motion 为真时跳过 whileInView 动画，直接呈现终态。
  const reducedMotion = useReducedMotion();

  return (
    <section
      id="security"
      // Bug 6 修复：sticky header 高 56px，锚点跳转留 64px 余量避免遮挡。
      className="scroll-mt-16 px-6 py-32"
      aria-labelledby="security-heading"
    >
      <div className="mx-auto max-w-3xl">
        <BlurFade delay={0}>
          <header className="mb-16">
            <h2
              id="security-heading"
              className="text-[30px] font-semibold tracking-tight text-foreground sm:text-[38px]"
            >
              安全模型
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              缺省绑定回环；审批超时、异常、中断一律结清为拒绝；路径越界先于
              审批拦下；事件全程 append-only 落盘。
            </p>
          </header>
        </BlurFade>

        <motion.ol
          className="flex flex-col gap-12"
          initial={reducedMotion ? false : "hidden"}
          {...(reducedMotion
            ? { animate: "visible" as const }
            : {
                whileInView: "visible" as const,
                viewport: { once: true, margin: "-60px" },
              })}
          variants={listVariants}
        >
          {PROMISES.map((item, index) => (
            <motion.li
              key={item.title}
              variants={itemVariants}
              // Bug 9 修复：no-JS 场景下由 globals.css 的 [data-reveal] 兜底还原可见态。
              data-reveal=""
              className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2"
            >
              {/* 序号（mono，克制）
                  Bug 5 修复：小字号（text-sm）+ /70 透明度在亮色主题对比度仅 ~3:1，
                  直接用 text-muted-foreground（亮色 4.9:1 / 暗色 7.6:1）达 WCAG AA。 */}
              <span
                aria-hidden="true"
                className="pt-1 font-mono text-sm text-muted-foreground"
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
                {/* Bug 1 修复：第 4 条 evidence 是 49 字符无空格长串（~/.spark/sessions/<mungeDir(cwd)>/<ts>_<id>.jsonl），
                    窄屏（<456px）会撑破视口产生页面级横向滚动条。
                    [overflow-wrap:anywhere] 允许在任意字符间断行，比 break-all 更稳（连字符/斜杠也会考虑）；
                    max-w-full 兜底避免极端情况下仍溢出父容器。
                    Bug 5 修复：移除 text-xs 上的 /80 透明度修饰符，直接 text-muted-foreground 达 WCAG AA。 */}
                <code className="mt-1 inline-block w-fit max-w-full rounded border border-border bg-card px-2 py-1 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
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
