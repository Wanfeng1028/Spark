import type { Metadata } from "next";
import { FeaturesPageContent } from "@/app/features/page";
import { TranslationNotice } from "@/components/TranslationNotice";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function EnFeaturesPage() {
  return (
    <>
      <TranslationNotice />
      <FeaturesPageContent />
    </>
  );
}

export const metadata: Metadata = {
  title: "Features",
  description:
    "Streaming chat, tool-call visualization, human approval and one protocol across four surfaces — the capability list, compared side by side.",
  alternates: { canonical: `${SITE_URL}/en/features` },
};
