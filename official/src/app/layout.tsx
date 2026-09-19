import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

// WO-001：metadataBase —— OG/canonical 绝对 URL 的基准（无它全部输出相对路径，
// 社交平台爬虫无法拉取）。当前按 GitHub Pages 推导；正式域名确定后改此一处。
const SITE_URL = "https://wanfeng1028.github.io/Spark";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Spark — 本地 Agent 工作台",
    template: "%s — Spark",
  },
  description:
    "引擎 headless，UI 是事件流的投影。流式对话、工具调用可视化、人工审批、四端同一协议。",
  icons: {
    icon: "/favicon.svg",
  },
  // WO-002：1200×630 PNG（社交平台不解析 SVG——public/og-image.svg 仅作源稿留档）
  openGraph: {
    title: "Spark — 本地 Agent 工作台",
    description: "引擎 headless，UI 是事件流的投影。27 种事件类型驱动四端界面。",
    type: "website",
    locale: "zh_CN",
    url: SITE_URL,
    siteName: "Spark",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Spark — 本地 Agent 工作台" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spark — 本地 Agent 工作台",
    description: "引擎 headless，UI 是事件流的投影。",
    images: ["/og-image.png"],
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
