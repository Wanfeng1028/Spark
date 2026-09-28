"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import SoftAurora from "@/components/backgrounds/SoftAurora";
import LineWaves from "@/components/backgrounds/LineWaves";
import Galaxy from "@/components/backgrounds/Galaxy";

/**
 * HeroBackground — hero 背景轮换器（19.47 排印追加，晚风拍板"02 06 10 轮换"）：
 * Soft Aurora → Line Waves → Galaxy，每 24s 换一帧并从暗底淡入（DESIGN v2.47 豁免、v2.48 改淡入）。
 * 三者皆 React Bits copy-in（MIT + Commons Clause，文件头各自保留版权声明），
 * 参数统一黑白合规（§12.1：仅灰白明度，无色相）。
 * prefers-reduced-motion：固定 Soft Aurora 静帧（speed=0），不轮换不动画。
 *
 * 性能（DESIGN v2.48）：一次只挂一层。原本的 AnimatePresence 交叉淡入会让两套满幅片元着色器
 * 同帧渲染（GPU 峰值翻倍）——这正是高分屏上整台机器卡死的成因之一；改为旧层直接卸载、新层从
 * hero 的近黑底淡入。滚出视口时暂停轮换：换层意味着重建 WebGL 上下文并重编译着色器，
 * 看不见的地方不值得付这笔开销。
 */

const ROTATE_MS = 24000;
const FADE_IN_S = 1.2;

const LAYERS: React.JSX.Element[] = [
  <SoftAurora key="aurora" speed={0.5} color1="#f7f7f7" color2="#e5e5e5" brightness={0.9} />,
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

export function HeroBackground(): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const onScreen = useInView(containerRef);

  React.useEffect(() => {
    if (reducedMotion || !onScreen) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % LAYERS.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, onScreen]);

  if (reducedMotion) {
    return (
      <div className="absolute inset-0">
        <SoftAurora speed={0} color1="#f7f7f7" color2="#e5e5e5" brightness={0.9} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* key 换层即重挂载：旧层卸载后新层从暗底淡入，全程只有一套着色器在跑 */}
      <motion.div
        key={index}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: FADE_IN_S, ease: "easeInOut" }}
      >
        {LAYERS[index]}
      </motion.div>
    </div>
  );
}

HeroBackground.displayName = "HeroBackground";
