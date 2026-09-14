"use client";

import * as React from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CodeBlockProps {
  /** 要展示的原始代码文本 */
  code: string;
  /** 可选语言标记，仅作为视觉徽标展示（不做语法高亮） */
  language?: string;
  className?: string;
}

type CopyStatus = "idle" | "copied" | "failed";

/** execCommand fallback — 非安全上下文或权限拒绝时的降级路径 */
function fallbackCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

/**
 * 深色代码块，右上角带复制按钮。
 * 复制成功短暂显示对勾，失败显示 X（1.5s 后恢复）。
 * 移动端常显按钮，桌面端 hover/focus 显示（Bug#1）。
 */
const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ code, language, className }, ref) => {
    const [status, setStatus] = React.useState<CopyStatus>("idle");
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetTimer = React.useCallback(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStatus("idle"), 1500);
    }, []);

    React.useEffect(
      () => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      },
      [],
    );

    const handleCopy = React.useCallback(async () => {
      try {
        await navigator.clipboard.writeText(code);
        setStatus("copied");
      } catch {
        // Bug#2: fallback — execCommand 降级
        if (fallbackCopy(code)) {
          setStatus("copied");
        } else {
          setStatus("failed");
        }
      }
      resetTimer();
    }, [code, resetTimer]);

    /* Bug#3: 有 language 时按钮内嵌标签行，无 language 时 absolute 于代码区 */
    const copyButton = (
      <button
        type="button"
        onClick={handleCopy}
        aria-label={
          status === "copied"
            ? "Copied"
            : status === "failed"
              ? "Copy failed"
              : "Copy code"
        }
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          /* Bug#1: 移动端常显，桌面端 hover/focus 显示 */
          "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
          status !== "idle" && "md:opacity-100",
          !language && "absolute right-3 top-3",
        )}
      >
        {status === "copied" ? (
          <Check className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
        ) : status === "failed" ? (
          <X className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    );

    return (
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border bg-card",
          className,
        )}
      >
        {language ? (
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="font-mono text-xs text-muted-foreground">
              {language}
            </span>
            {copyButton}
          </div>
        ) : (
          copyButton
        )}

        <pre
          ref={ref}
          className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-card-foreground"
        >
          <code>{code}</code>
        </pre>
      </div>
    );
  },
);
CodeBlock.displayName = "CodeBlock";

export { CodeBlock };
