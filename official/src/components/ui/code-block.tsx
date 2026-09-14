"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CodeBlockProps {
  /** 要展示的原始代码文本 */
  code: string;
  /** 可选语言标记，仅作为视觉徽标展示（不做语法高亮） */
  language?: string;
  className?: string;
}

/**
 * 深色代码块，右上角带复制按钮。
 * 复制成功后按钮短暂显示对勾并回到原状（1.5s）。
 */
const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ code, language, className }, ref) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = React.useCallback(async () => {
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        // 剪贴板不可用时静默失败（例如非安全上下文）
        return;
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }, [code]);

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
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100 data-[copied=true]:opacity-100"
          data-copied={copied}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

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
