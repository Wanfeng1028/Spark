import { Hero } from "@/components/sections/Hero";
import { SessionDemo } from "@/components/sections/SessionDemo";
import { FactBar } from "@/components/sections/FactBar";
import { FeatureShowcase } from "@/components/sections/FeatureShowcase";
import { ArchitectureDiagram } from "@/components/sections/ArchitectureDiagram";
import { SecurityModel } from "@/components/sections/SecurityModel";
import { QuickStartCTA } from "@/components/sections/QuickStartCTA";

export const dynamic = "force-static";

export default function HomePage() {
  return (
    <>
      <Hero />
      <SessionDemo />
      <FactBar />
      <FeatureShowcase />
      <ArchitectureDiagram />
      <SecurityModel />
      <QuickStartCTA />
    </>
  );
}
