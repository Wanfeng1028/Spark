"use client";

import * as React from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";
import { cn } from "@/lib/utils";

export interface NumberTickerProps {
  /** 目标数值 */
  value: number;
  /** 滚动方向：up 从 0 → value，down 从 value → 0 */
  direction?: "up" | "down";
  /** 进入视口后的额外延迟（秒） */
  delay?: number;
  /** 保留小数位数 */
  decimalPlaces?: number;
  className?: string;
}

/**
 * 数字滚动动画组件。
 * 进入视口时通过弹簧物理从起始值平滑过渡到目标值。
 * 纯数字 + mono 字体，无渐变/发光效果。
 */
const NumberTicker: React.FC<NumberTickerProps> = ({
  value,
  direction = "up",
  delay = 0,
  decimalPlaces = 0,
  className,
}) => {
  const ref = React.useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(direction === "down" ? value : 0);
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  /* 进入视口后触发弹簧动画 */
  React.useEffect(() => {
    if (!isInView) return;
    const timer = window.setTimeout(() => {
      motionValue.set(direction === "down" ? 0 : value);
    }, delay * 1000);
    return () => window.clearTimeout(timer);
  }, [isInView, motionValue, direction, value, delay]);

  /* 直接操作 DOM textContent，避免每帧 re-render */
  React.useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = latest.toFixed(decimalPlaces);
      }
    });
    return unsubscribe;
  }, [springValue, decimalPlaces]);

  return (
    <span
      ref={ref}
      className={cn("inline-block font-mono tabular-nums", className)}
      aria-label={String(value)}
    >
      {/* 静态初始值，避免 hydration mismatch；动画启动后由 DOM 直写覆盖 */}
      {direction === "down"
        ? value.toFixed(decimalPlaces)
        : (0).toFixed(decimalPlaces)}
    </span>
  );
};

NumberTicker.displayName = "NumberTicker";

export { NumberTicker };
