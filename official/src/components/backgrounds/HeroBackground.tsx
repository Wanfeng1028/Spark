"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import SoftAurora from "@/components/backgrounds/SoftAurora";
import LineWaves from "@/components/backgrounds/LineWaves";
import Galaxy from "@/components/backgrounds/Galaxy";

/**
 * HeroBackground — hero 背景轮换器（19.47 排印追加，晚风拍板"02 06 10 轮换"）：
 * Soft Aurora → Line Waves → Galaxy，每 24s 1.6s 交叉淡入淡出（DESIGN v2.47 豁免）。
 * 三者皆 React Bits copy-in（MIT + Commons Clause，文件头各自保留版权声明），
 * 参数统一黑白合规（§12.1：仅灰白明度，无色相）。
 * prefers-reduced-motion：固定 Soft Aurora 静帧（speed=0 冻结 uSpeed），不轮换不动画。
 */

const ROTATE_MS = 24000;

export function HeroBackground(): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % 3), ROTATE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <div className="absolute inset-0">
        <SoftAurora speed={0} color1="#f7f7f7" color2="#e5e5e5" brightness={0.9} />
      </div>
    );
  }

  const layers: React.JSX.Element[] = [
    <SoftAurora
      key="aurora"
      speed={0.5}
      color1="#f7f7f7"
      color2="#e5e5e5"
      brightness={0.9}
    />,
    <LineWaves key="lines" speed={0.35} brightness={0.3} />,
    <Galaxy
      key="galaxy"
      speed={0.8}
      saturation={0}
      hueShift={0}
      starSpeed={0.4}
      twinkleIntensity={0.3}
      rotationSpeed={0.08}
    />,
  ];

  return (
    <div className="absolute inset-0">
      <AnimatePresence initial={false}>
        <motion.div
          key={index}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeInOut" }}
        >
          {layers[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

HeroBackground.displayName = "HeroBackground";
