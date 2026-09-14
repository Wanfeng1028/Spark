"use client";

import { cn } from "@/lib/utils";

interface TerminalLine {
  text: string;
  color?: string;
  prefix?: string;
}

interface TerminalProps {
  lines: TerminalLine[];
  title?: string;
  className?: string;
}

export function Terminal({ lines, title = "terminal", className }: TerminalProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-zinc-900", className)}>
      <div className="flex items-center gap-2 border-b border-zinc-700/50 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
        </div>
        <span className="ml-2 text-xs text-zinc-500 font-mono">{title}</span>
      </div>
      <div className="p-4 font-mono text-sm leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className={cn("text-zinc-300", line.color)}>
            {line.prefix && <span className="text-zinc-500 mr-2">{line.prefix}</span>}
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
