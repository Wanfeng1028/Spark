import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Spark — 本地 Agent 工作台",
    template: "%s — Spark",
  },
  description:
    "引擎 headless，UI 是事件流的投影。流式对话、工具调用可视化、人工审批、四端同一协议。",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Spark — 本地 Agent 工作台",
    description: "引擎 headless，UI 是事件流的投影。27 种事件类型驱动四端界面。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "Spark" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spark — 本地 Agent 工作台",
    description: "引擎 headless，UI 是事件流的投影。",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider>
          <Header />
          <main>{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
