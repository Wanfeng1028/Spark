import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { asset } from "@/lib/utils";
import "./globals.css";

// WO-001：metadataBase —— OG/canonical 绝对 URL 的基准（无它全部输出相对路径，
// 社交平台爬虫无法拉取）。双站发布后（19.45）由构建环境注入：缺省 GitHub Pages
// 项目站 wanfeng1028.github.io/Spark，Cloudflare Pages 构建时设
// NEXT_PUBLIC_SITE_URL=https://spark.gemmae.dev 覆盖默认值。
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wanfeng1028.github.io/Spark";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Spark — 一个引擎，四个界面",
    template: "%s — Spark",
  },
  description:
    "一个引擎，四个界面。27 种事件驱动 Web / 桌面 / CLI / 移动端，写类工具先经人工审批，会话 append-only 落盘。",
  icons: {
    icon: asset("/favicon.svg"),
  },
  // WO-002：1200×630 PNG（社交平台不解析 SVG——public/og-image.svg 仅作源稿留档）
  openGraph: {
    title: "Spark — 一个引擎，四个界面",
    description: "一个引擎，四个界面。27 种事件驱动 Web / 桌面 / CLI / 移动端。",
    type: "website",
    locale: "zh_CN",
    url: SITE_URL,
    siteName: "Spark",
    images: [{ url: asset("/og-image.png"), width: 1200, height: 630, alt: "Spark — 一个引擎，四个界面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spark — 一个引擎，四个界面",
    description: "一个引擎，四个界面。27 种事件驱动 Web / 桌面 / CLI / 移动端。",
    images: [asset("/og-image.png")],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        {/* WO-018：skip-to-content——键盘用户一键跳过全部导航（WCAG 2.4.1） */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background"
        >
          跳到主内容
        </a>
        <ThemeProvider>
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
