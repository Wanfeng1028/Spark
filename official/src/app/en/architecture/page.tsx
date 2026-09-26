import type { Metadata } from "next";
import { ArchitecturePageContent } from "@/app/architecture/page";
import { TranslationNotice } from "@/components/TranslationNotice";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function EnArchitecturePage() {
  return (
    <>
      <TranslationNotice />
      <ArchitecturePageContent />
    </>
  );
}

export const metadata: Metadata = {
  title: "Architecture",
  description:
    "Five layers from surface UIs to the persisted log: apps, the shared protocol package, the loopback-only server, the headless engine, and append-only session files.",
  alternates: { canonical: `${SITE_URL}/en/architecture` },
};
