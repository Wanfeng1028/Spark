import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6">
      <span className="font-mono text-[64px] font-bold text-muted-foreground/30">
        404
      </span>
      <p className="text-muted-foreground">页面不存在</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        返回首页
      </Link>
    </div>
  );
}
