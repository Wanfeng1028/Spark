import type { MetadataRoute } from "next";
import { NAV_ITEMS, LINKS } from "@/lib/constants";

// WO-012：sitemap —— 基准与 layout.tsx 的 metadataBase 同源（SITE_URL 常量单点；
// sitemap 与 robots 的 URL 基准必须一致，故不重复定义而是约定同步修改）。
const SITE_URL = "https://wanfeng1028.github.io/Spark";

/** 站内路由（外链 GitHub 不入 sitemap） */
function routes(): string[] {
  const internal = NAV_ITEMS.filter((i) => !i.href.startsWith("http")).map((i) => i.href);
  const docLinks = LINKS.filter(
    (l) => typeof l.href === "string" && l.href.startsWith("/"),
  ).map((l) => l.href as string);
  return Array.from(new Set(["/", ...internal, ...docLinks]));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return routes().map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
