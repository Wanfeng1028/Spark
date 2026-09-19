"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
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
 * CJK 文本按空格 split 只会得到整段一坨（中文词间无空格），display 级大标题下
 * 逐字 stagger 才有节奏——tokenize 把连续 CJK 段拆成单字 token，拉丁词保持整词。
 */

interface Token {
  text: string;
  /** 是否跟一个空格：只有原文本的空格边界才有；CJK 单字之间不补空格 */
  spaceAfter: boolean;
}

function tokenize(text: string): Token[] {
  const chunks = text.split(" ");
  const tokens: Token[] = [];
  chunks.forEach((chunk, i) => {
    const units = /[\u3400-\u9fff]/.test(chunk) ? Array.from(chunk) : [chunk];
    units.forEach((unit, j) => {
      tokens.push({
        text: unit,
        spaceAfter: i < chunks.length - 1 && j === units.length - 1,
      });
    });
  });
  return tokens;
}

const BlurText: React.FC<BlurTextProps> = ({
  text,
  delay = 0,
  duration = 0.5,
  staggerDelay = 0.05,
  className,
}) => {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion();
  const [aboveViewport, setAboveViewport] = React.useState(false);

  const words = React.useMemo(() => tokenize(text), [text]);

  React.useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.bottom <= 0) {
      setAboveViewport(true);
    }
  }, []);

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

  const skipAnimation = reducedMotion || aboveViewport;

  return (
    <motion.span
      ref={ref}
      data-reveal
      className={cn("inline-block", className)}
      initial={skipAnimation ? false : "hidden"}
      whileInView={skipAnimation ? undefined : "visible"}
      viewport={skipAnimation ? undefined : { once: true, margin: "-40px" }}
      variants={skipAnimation ? undefined : parentVariants}
      aria-label={text}
    >
      {words.map((word, index) => (
        <React.Fragment key={`${word.text}-${index}`}>
          <motion.span
            className="inline-block"
            variants={skipAnimation ? undefined : childVariants}
            aria-hidden="true"
          >
            {word.text}
          </motion.span>
          {/* 词间空格，允许自然换行（CJK 单字间不补） */}
          {word.spaceAfter ? " " : null}
        </React.Fragment>
      ))}
    </motion.span>
  );
};

BlurText.displayName = "BlurText";

export { BlurText };
