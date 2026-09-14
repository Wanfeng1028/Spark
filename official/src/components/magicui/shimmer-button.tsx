"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ShimmerButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  /**
   * 微光颜色。
   * 默认使用极低透明度的中性白，严禁蓝紫渐变（DESIGN §12）。
   */
  shimmerColor?: string;
  className?: string;
}

/**
 * 胶囊形微光按钮：hover / focus-visible 时一道细微光泽从左到右扫过一次。
 * 动画由 globals.css 的 .shimmer-sweep-layer + @keyframes shimmer-sweep 驱动；
 * 本组件只负责用 inline style 注入颜色（shimmerColor 是 prop，无法写成静态类）。
 * 静止态不动：常驻 infinite 装饰循环属 DESIGN §12.8 禁止的无意义循环动效。
 */
const ShimmerButton: React.FC<ShimmerButtonProps> = ({
  children,
  shimmerColor = "rgba(255, 255, 255, 0.08)",
  className,
  ...props
}) => (
  <button
    className={cn(
      "relative inline-flex items-center justify-center overflow-hidden rounded-full",
      "bg-foreground px-6 py-3 text-sm font-medium text-background",
      "transition-colors hover:bg-foreground/90",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {/* 微光扫过层 — 纯装饰，对辅助技术隐藏 */}
    <span
      aria-hidden="true"
      className="shimmer-sweep-layer pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `linear-gradient(90deg, transparent 0%, ${shimmerColor} 50%, transparent 100%)`,
      }}
    />
    <span className="relative z-10">{children}</span>
  </button>
);

ShimmerButton.displayName = "ShimmerButton";

export { ShimmerButton };
