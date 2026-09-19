import { Hero } from "@/components/sections/Hero";
import { SessionDemo } from "@/components/sections/SessionDemo";
import { FourTiles } from "@/components/sections/FourTiles";
import { ProtocolSection } from "@/components/sections/ProtocolSection";
import { FeatureShowcase } from "@/components/sections/FeatureShowcase";
import { ArchitectureDiagram } from "@/components/sections/ArchitectureDiagram";
import { SecurityModel } from "@/components/sections/SecurityModel";
import { QuickStartCTA } from "@/components/sections/QuickStartCTA";

export const dynamic = "force-static";

/**
 * 首页区块顺序（DESIGN v2.29，对标 x.ai 骨架）：
 * Hero → 会话流演示（暗带）→ 四端瓦片 → 协议区（词表跑马灯 + 统计）→
 * 核心能力 → 架构（灰带）→ 安全模型 → 双栏起跑（暗带收尾）。
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <SessionDemo />
      <FourTiles />
      <ProtocolSection />
      <FeatureShowcase />
      <ArchitectureDiagram />
      <SecurityModel />
      <QuickStartCTA />
    </>
  );
}
