import type { MetadataRoute } from "next";
import { NAV_ITEMS } from "@/lib/constants";

// output: export 静态导出要求路由显式声明静态（next build 校验）
export const dynamic = "force-static"

// WO-012：sitemap —— 基准与 layout.tsx 的 metadataBase 同源（SITE_URL 常量单点；
// sitemap 与 robots 的 URL 基准必须一致，故不重复定义而是约定同步修改）。
// 路由来源 = NAV_ITEMS 站内项（Docs/GitHub 均外链不入 sitemap——LINKS 无站内项）。
const SITE_URL = "https://wanfeng1028.github.io/Spark";

function routes(): string[] {
  return Array.from(
    new Set(["/", ...NAV_ITEMS.filter((i) => !i.href.startsWith("http")).map((i) => i.href)]),
  );
}

export default function sitemap(): MetadataRoute.Sitemap {
  return routes().map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
