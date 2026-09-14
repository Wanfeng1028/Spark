"use client";

import * as React from "react";
import { useInView, useMotionValue, useSpring, useReducedMotion } from "motion/react";
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
 * SSG 输出目标值（SEO + 无 JS 场景正确），客户端挂载后仅当元素尚未进入视口时才播放动画。
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
  const reducedMotion = useReducedMotion();
  const startValue = direction === "down" ? value : 0;
  const endValue = direction === "down" ? 0 : value;

  const motionValue = useMotionValue(startValue);
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  // null = 未确定，true = 将播放动画，false = 直接显示目标值
  const [willAnimate, setWillAnimate] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (reducedMotion || !ref.current) {
      setWillAnimate(false);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const visibleOnMount = rect.top < window.innerHeight && rect.bottom > 0;
    // 已在视口内（首屏场景）：直接显示目标值，避免 "27→0→27" 回跳闪烁
    setWillAnimate(!visibleOnMount);
  }, [reducedMotion]);

  /* 动画模式：将 DOM 置为起始值，等待进入视口后触发弹簧动画 */
  React.useEffect(() => {
    if (willAnimate !== true || !ref.current) return;
    ref.current.textContent = startValue.toFixed(decimalPlaces);
    const unsubscribe = springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = latest.toFixed(decimalPlaces);
      }
    });
    return unsubscribe;
  }, [springValue, decimalPlaces, willAnimate, startValue]);

  /* 进入视口后触发弹簧动画 */
  React.useEffect(() => {
    if (!isInView || willAnimate !== true) return;
    const timer = window.setTimeout(() => {
      motionValue.set(endValue);
    }, delay * 1000);
    return () => window.clearTimeout(timer);
  }, [isInView, willAnimate, motionValue, endValue, delay]);

  return (
    <span
      ref={ref}
      className={cn("inline-block font-mono tabular-nums", className)}
      aria-label={String(value)}
      suppressHydrationWarning
    >
      {/* 服务端/首次渲染输出目标值，SEO 与无 JS 场景正确 */}
      {value.toFixed(decimalPlaces)}
    </span>
  );
};

NumberTicker.displayName = "NumberTicker";

export { NumberTicker };
