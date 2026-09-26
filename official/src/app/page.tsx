import { HomeSections } from "@/components/HomeSections";

export const dynamic = "force-static";

/** 中文首页（根路径）。文案与 metadata 全部 zh，见 layout.tsx 与各 section 组件。 */
export default function HomePage() {
  return <HomeSections lang="zh" />;
}
