import type { MetadataRoute } from "next";

// output: export 静态导出要求路由显式声明静态（next build 校验）
export const dynamic = "force-static"

// WO-013：robots —— 与 sitemap.ts 同基准（SITE_URL，见 layout.tsx 注记）
const SITE_URL = "https://wanfeng1028.github.io/Spark";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
