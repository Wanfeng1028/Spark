import type { Metadata } from "next";
import { QuickStartPageContent } from "@/app/quickstart/page";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function EnQuickStartPage() {
  return <QuickStartPageContent lang="en" />;
}

export const metadata: Metadata = {
  title: "Quickstart",
  description:
    "Install once, start the loopback server with a single command, configure a model before the first turn — running Spark from source until the npm release lands.",
  alternates: { canonical: `${SITE_URL}/en/quickstart` },
};
