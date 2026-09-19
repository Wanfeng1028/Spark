import type { MetadataRoute } from "next";

// WO-013：robots —— 与 sitemap.ts 同基准（SITE_URL，见 layout.tsx 注记）
const SITE_URL = "https://wanfeng1028.github.io/Spark";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
