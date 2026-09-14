"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/* Bug#4: 多态类型 — href 存在时渲染 <a>，否则渲染 <button>（零 any） */
type ShimmerBase = {
  children: React.ReactNode;
  /**
   * 微光颜色。
   * 默认使用极低透明度的中性色（亮色主题白/暗色主题黑），严禁蓝紫渐变（DESIGN §12）。
   */
  shimmerColor?: string;
  className?: string;
};

export type ShimmerButtonAsLink = ShimmerBase &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ShimmerBase> & {
    href: string;
  };

export type ShimmerButtonAsButton = ShimmerBase &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ShimmerBase> & {
    href?: never;
  };

export type ShimmerButtonProps = ShimmerButtonAsLink | ShimmerButtonAsButton;

/**
 * 胶囊形微光按钮：hover / focus-visible 时一道细微光泽从左到右扫过一次。
 * 动画由 globals.css 的 .shimmer-sweep-layer + @keyframes shimmer-sweep 驱动；
 * 本组件只负责用 inline style 注入颜色（shimmerColor 是 prop，无法写成静态类）。
 * 静止态不动：常驻 infinite 装饰循环属 DESIGN §12.8 禁止的无意义循环动效。
 *
 * Bug#4: 传入 href 时渲染 <a>，保留完整链接语义（中键/Ctrl+点击/右键/爬虫/屏幕阅读器）。
 * Bug#5: 默认 shimmer 色根据 resolvedTheme 自动适配（暗色主题按钮底浅→用深色微光）。
 */
const ShimmerButton: React.FC<ShimmerButtonProps> = (props) => {
  const { children, shimmerColor, className, ...rest } = props;
  const { resolvedTheme } = useTheme();

  /* Bug#5: 主题感知默认色 — 暗色主题下按钮底是近白(#fafafa)，需用深色微光 */
  const effectiveColor =
    shimmerColor ??
    (resolvedTheme === "dark"
      ? "rgba(0, 0, 0, 0.08)"
      : "rgba(255, 255, 255, 0.08)");

  const sharedClasses = cn(
    "relative inline-flex items-center justify-center overflow-hidden rounded-full",
    "bg-foreground px-6 py-3 text-sm font-medium text-background",
    "transition-colors hover:bg-foreground/90",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    className,
  );

  const shimmerLayer = (
    <>
      {/* 微光扫过层 — 纯装饰，对辅助技术隐藏 */}
      <span
        aria-hidden="true"
        className="shimmer-sweep-layer pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(90deg, transparent 0%, ${effectiveColor} 50%, transparent 100%)`,
        }}
      />
      <span className="relative z-10">{children}</span>
    </>
  );

  /* Bug#4: href 存在时渲染 <a>，向后兼容无 href 时渲染 <button> */
  if ("href" in rest && rest.href) {
    const { href, ...anchorRest } = rest as Omit<ShimmerButtonAsLink, keyof ShimmerBase>;
    return (
      <a href={href} className={sharedClasses} {...anchorRest}>
        {shimmerLayer}
      </a>
    );
  }

  const buttonRest = rest as Omit<ShimmerButtonAsButton, keyof ShimmerBase>;
  return (
    <button className={sharedClasses} {...buttonRest}>
      {shimmerLayer}
    </button>
  );
};

ShimmerButton.displayName = "ShimmerButton";

export { ShimmerButton };
