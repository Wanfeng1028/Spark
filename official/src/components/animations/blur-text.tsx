"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

export interface BlurTextProps {
  /** 要逐词显现的文本 */
  text: string;
  /** 整体延迟（秒） */
  delay?: number;
  /** 单个词的动画时长（秒） */
  duration?: number;
  /** 词与词之间的错开间隔（秒） */
  staggerDelay?: number;
  className?: string;
}

/**
 * 文字逐词显现动画。
 * 每个词依次从 opacity:0 + blur(8px) 过渡到完全清晰，幅度克制（§6 只允许微动效）。
 */
const BlurText: React.FC<BlurTextProps> = ({
  text,
  delay = 0,
  duration = 0.5,
  staggerDelay = 0.05,
  className,
}) => {
  const words = React.useMemo(() => text.split(" "), [text]);

  const parentVariants = React.useMemo<Variants>(
    () => ({
      hidden: {},
      visible: {
        transition: {
          staggerChildren: staggerDelay,
          delayChildren: delay,
        },
      },
    }),
    [staggerDelay, delay],
  );

  const childVariants = React.useMemo<Variants>(
    () => ({
      hidden: { opacity: 0, filter: "blur(8px)" },
      visible: {
        opacity: 1,
        filter: "blur(0px)",
        transition: { duration, ease: "easeOut" },
      },
    }),
    [duration],
  );

  return (
    <motion.span
      className={cn("inline-block", className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={parentVariants}
      aria-label={text}
    >
      {words.map((word, index) => (
        <React.Fragment key={`${word}-${index}`}>
          <motion.span
            className="inline-block"
            variants={childVariants}
            aria-hidden="true"
          >
            {word}
          </motion.span>
          {/* 词间空格，允许自然换行 */}
          {index < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </motion.span>
  );
};

BlurText.displayName = "BlurText";

export { BlurText };
