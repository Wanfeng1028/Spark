import { Hero } from "@/components/sections/Hero";
import { SessionDemoZone } from "@/components/sections/SessionDemoZone";
import { FourTiles } from "@/components/sections/FourTiles";
import { JobPicker } from "@/components/sections/JobPicker";
import { ProtocolSection } from "@/components/sections/ProtocolSection";
import { FeatureShowcase } from "@/components/sections/FeatureShowcase";
import { ArchitectureDiagram } from "@/components/sections/ArchitectureDiagram";
import { SecurityModel } from "@/components/sections/SecurityModel";
import { QuickStartCTA } from "@/components/sections/QuickStartCTA";
import type { Lang } from "@/lib/i18n";

/**
 * 首页区块顺序（DESIGN v2.34，x.ai 实拍同构）：
 * Hero（旋转词）→ 三卡演示区（会话/终端/审批）→ 四端瓦片 → 任务选择器 →
 * 开发者区（左文右代码窗）→ 核心能力 → 架构（灰带）→ 安全模型 → 双栏起跑（浅色卡）。
 * 19.47 批 2：首页主体抽成共享组件供 /（zh）与 /en（en）两棵路由树复用——
 * 文案在各 section 组件内部的 COPY 对里，此处只传 lang。
 */
export function HomeSections({ lang = "zh" }: { lang?: Lang }): React.JSX.Element {
  return (
    <div className={lang === "en" ? "lang-en" : undefined}>
      <Hero lang={lang} />
      <SessionDemoZone lang={lang} />
      <FourTiles lang={lang} />
      <JobPicker lang={lang} />
      <ProtocolSection lang={lang} />
      <FeatureShowcase lang={lang} />
      <ArchitectureDiagram lang={lang} />
      <SecurityModel lang={lang} />
      <QuickStartCTA lang={lang} />
    </div>
  );
}
