import { Hero } from "@/components/sections/Hero";
import { SessionDemoZone } from "@/components/sections/SessionDemoZone";
import { FourTiles } from "@/components/sections/FourTiles";
import { ProtocolSection } from "@/components/sections/ProtocolSection";
import { FeatureShowcase } from "@/components/sections/FeatureShowcase";
import { ArchitectureDiagram } from "@/components/sections/ArchitectureDiagram";
import { SecurityModel } from "@/components/sections/SecurityModel";
import { QuickStartCTA } from "@/components/sections/QuickStartCTA";

export const dynamic = "force-static";

/**
 * 首页区块顺序（DESIGN v2.31，x.ai 实拍同构）：
 * Hero（旋转词）→ 三卡演示区（会话/终端/审批）→ 四端瓦片 →
 * 开发者区（左文右代码窗）→ 核心能力 → 架构（灰带）→ 安全模型 → 双栏起跑（浅色卡）。
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <SessionDemoZone />
      <FourTiles />
      <ProtocolSection />
      <FeatureShowcase />
      <ArchitectureDiagram />
      <SecurityModel />
      <QuickStartCTA />
    </>
  );
}
