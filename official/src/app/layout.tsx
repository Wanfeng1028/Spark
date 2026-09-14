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
  // TODO: og-image 需 1200×630 PNG（社交平台不解析 SVG），设计资产就位后恢复 images 字段
  openGraph: {
    title: "Spark — 本地 Agent 工作台",
    description: "引擎 headless，UI 是事件流的投影。27 种事件类型驱动四端界面。",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spark — 本地 Agent 工作台",
    description: "引擎 headless，UI 是事件流的投影。",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <ThemeProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
