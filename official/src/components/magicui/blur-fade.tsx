"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface BlurFadeProps {
  children: React.ReactNode;
  /** 进入视口后的延迟（秒） */
  delay?: number;
  /** 动画时长（秒） */
  duration?: number;
  /** 初始 Y 偏移（px） */
  yOffset?: number;
  className?: string;
}

/**
 * 模糊淡入动画：元素进入视口时从 opacity:0 + y 偏移 + blur 过渡到完全可见。
 * 注意：blur 是元素自身入场过程中的瞬时滤镜，不是导航/卡片上的毛玻璃背景（DESIGN §12.2），
 * 且 once:true + prefers-reduced-motion 降级，不属常驻循环动效。
 */
const BlurFade: React.FC<BlurFadeProps> = ({
  children,
  delay = 0,
  duration = 0.4,
  yOffset = 20,
  className,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  // Bug 4: 滚动位置恢复时元素已在视口上方，IntersectionObserver 永不相交
  const [aboveViewport, setAboveViewport] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.bottom <= 0) {
      setAboveViewport(true);
    }
  }, []);

  const skipAnimation = reducedMotion || aboveViewport;

  return (
    <motion.div
      ref={ref}
      data-reveal
      className={cn(className)}
      initial={skipAnimation ? false : { opacity: 0, y: yOffset, filter: "blur(4px)" }}
      whileInView={skipAnimation ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={skipAnimation ? undefined : { once: true, margin: "-40px" }}
      transition={skipAnimation ? undefined : { duration, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
};

BlurFade.displayName = "BlurFade";

export { BlurFade };
