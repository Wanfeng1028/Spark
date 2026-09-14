"use client";

import { motion, type Variants } from "motion/react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
}

export function SplitText({
  text,
  className,
  delay = 0.03,
  duration = 0.4,
}: SplitTextProps) {
  const characters = useMemo(() => text.split(""), [text]);

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: delay,
      },
    },
  };

  const charVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration, ease: "easeOut" },
    },
  };

  return (
    <motion.span
      className={cn("inline-block", className)}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      aria-label={text}
    >
      {characters.map((char, index) => (
        <motion.span
          key={index}
          variants={charVariants}
          className="inline-block"
          aria-hidden="true"
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </motion.span>
  );
}
