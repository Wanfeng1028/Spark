/**
 * 站点绝对 URL 单源（19.46 引入环境变量、19.47 批 2 抽出共享模块）。
 * 缺省 GitHub Pages 项目站（official.yml 不动）；Cloudflare Pages 构建注入
 * NEXT_PUBLIC_SITE_URL=https://spark.gemmae.dev 覆盖。sitemap / robots /
 * layout metadataBase / en 页 canonical 全部引用这一份。
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://wanfeng1028.github.io/Spark";
