"use client";

import * as React from "react";
import { motion } from "motion/react";
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
 * 模糊淡入动画：元素进入视口时从 opacity:0 + y偏移 + blur 过渡到完全可见。
 * 注意：blur 是动画过程中的过渡效果，不是 backdrop-blur 毛玻璃，不违反 DESIGN §12。
 */
const BlurFade: React.FC<BlurFadeProps> = ({
  children,
  delay = 0,
  duration = 0.4,
  yOffset = 20,
  className,
}) => (
  <motion.div
    className={cn(className)}
    initial={{ opacity: 0, y: yOffset, filter: "blur(4px)" }}
    whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
    viewport={{ once: true, margin: "-40px" }}
    transition={{ duration, delay, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

BlurFade.displayName = "BlurFade";

export { BlurFade };
