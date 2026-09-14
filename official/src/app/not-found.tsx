import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * 404 页。字号封顶 text-[40px]，与 Hero 主标题同级——不靠巨型数字制造视觉冲击
 * （DESIGN §12.3 字号约束）。
 *
 * Bug 5 修复：/40 透明度在亮暗双主题下均达不到 WCAG 大字 3:1 阈值（亮色 ~1.7:1），
 * 但巨型 404 是纯装饰性视觉重复——真实语义已由下一行「页面不存在」承载。
 * 保守修复：给 404 数字加 aria-hidden="true" 让辅助技术忽略，视觉设计意图（faint 背景数字）保持不变。
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6">
      <span
        aria-hidden="true"
        className="font-mono text-[40px] font-semibold leading-none tracking-tight text-muted-foreground/40"
      >
        404
      </span>
      <p className="text-muted-foreground">页面不存在</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        返回首页
      </Link>
    </div>
  );
}
