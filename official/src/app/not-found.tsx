import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * 404 页。字号封顶 text-[40px]，与 Hero 主标题同级——不靠巨型数字制造视觉冲击
 * （DESIGN §12.3 字号约束）。
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6">
      <span className="font-mono text-[40px] font-semibold leading-none tracking-tight text-muted-foreground/40">
        404
      </span>
      <p className="text-muted-foreground">页面不存在</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        返回首页
      </Link>
    </div>
  );
}
