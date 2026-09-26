import type { Metadata } from "next";
import { HomeSections } from "@/components/HomeSections";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

const SITE_URL_EN = SITE_URL;

/** 英文首页（/en）：与中文首页同一份 HomeSections，lang="en" 走各组件 COPY 的 en 文案。 */
export default function EnHomePage() {
  return <HomeSections lang="en" />;
}

export const metadata: Metadata = {
  title: "Spark — One engine, four interfaces",
  description:
    "One engine, four interfaces. 27 event types drive the Web, desktop, CLI and mobile surfaces in real time; write-class tools pass human approval, and sessions persist as append-only JSONL.",
  alternates: { canonical: `${SITE_URL_EN}/en` },
  openGraph: {
    title: "Spark — One engine, four interfaces",
    description:
      "One engine, four interfaces. 27 event types drive the Web, desktop, CLI and mobile surfaces in real time; sessions persist as append-only JSONL.",
    url: `${SITE_URL_EN}/en`,
    siteName: "Spark",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Spark — One engine, four interfaces" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spark — One engine, four interfaces",
    description:
      "One engine, four interfaces. 27 event types drive four surfaces; sessions persist as append-only JSONL.",
    images: ["/og-image.png"],
  },
};
