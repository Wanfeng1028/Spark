import type { MetadataRoute } from "next";
import { NAV_ITEMS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// output: export 静态导出要求路由显式声明静态（next build 校验）
export const dynamic = "force-static"

// WO-012：sitemap —— 基准 = lib/site.ts 的 SITE_URL 单源（与 layout metadataBase、
// robots 同源）。路由来源 = NAV_ITEMS 站内项 + 首页；19.47 批 2 起双语言：
// 每条中文路由带一条 /en 对应路由（alternates 标注 hreflang）。
function routes(): string[] {
  return Array.from(
    new Set(["/", ...NAV_ITEMS.filter((i) => !i.href.startsWith("http")).map((i) => i.href)]),
  );
}

export default function sitemap(): MetadataRoute.Sitemap {
  return routes().flatMap((path) => [
    {
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1 : 0.7,
    },
    {
      url: `${SITE_URL}/en${path === "/" ? "" : path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 0.9 : 0.6,
    },
  ]);
}
