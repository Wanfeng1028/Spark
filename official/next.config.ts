import type { NextConfig } from "next";

/**
 * GitHub Pages 项目站发布在 wanfeng1028.github.io/Spark/，静态导出必须带子路径前缀：
 * 不设 basePath 时 out/ 发出的是 `/_next/*`，挂在子路径下每个资源都 404（打开白屏）。
 * 缺省 /Spark；将来绑自定义域名只需把构建环境的 NEXT_PUBLIC_BASE_PATH 置空，不改本文件。
 * trailingSlash 必开：Pages 不做 extensionless 映射，`/features` 要导出成 `features/index.html`。
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/Spark";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // 让 asset() 在客户端与 metadata 里读到同一个前缀（basePath 不自动作用于裸 <img src>）
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
