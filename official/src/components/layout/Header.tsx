"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Github, Menu, X } from "lucide-react";
import { NAV_ITEMS, LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

/** 判断是否为外部链接 */
function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

const MOBILE_MENU_ID = "mobile-menu";

/**
 * 顶部导航栏。
 * 固定顶部，背景 bg-background/95 + border-b 分隔——不用毛玻璃（DESIGN §12.2）。
 * 移动端通过 AnimatePresence 展开/收起菜单，菜单 absolute 脱离文档流不推移内容。
 */
const Header: React.FC = () => {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const firstLinkRef = React.useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();

  /* Bug#6.1: 路由变化时关闭移动菜单 */
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  /* Bug#6.3: ESC 键关闭菜单 */
  React.useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  /* Bug#6.3: 展开时焦点移入第一个菜单项 */
  React.useEffect(() => {
    if (mobileOpen) {
      // 等动画帧后 focus
      requestAnimationFrame(() => firstLinkRef.current?.focus());
    }
  }, [mobileOpen]);

  /* WO-014（WCAG 2.4.3）：焦点陷阱——菜单展开期间 Tab 循环限制在菜单项内，
   * 不再逃逸到菜单背后的页面元素；ESC 关闭与焦点归还已有（上方 effect） */
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const nav = document.getElementById(MOBILE_MENU_ID);
    if (nav === null) return;
    const focusables = nav.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleClose = React.useCallback(() => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        {/* Logo — 纯文字，不用图片；点击关闭移动菜单 */}
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-foreground"
          onClick={() => setMobileOpen(false)}
        >
          Spark
        </Link>

        {/* 桌面端导航 */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          {NAV_ITEMS.map((item) =>
            isExternal(item.href) ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        {/* 右侧操作区（官网单主题纯黑，无主题切换面——DESIGN v2.27） */}
        <div className="flex items-center gap-1">
          <Link
            href="/quickstart"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "mr-1 hidden rounded-full px-4 sm:inline-flex",
            )}
          >
            快速上手
          </Link>

          {/* GitHub 图标链接 */}
          <a
            href={LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <Github className="h-4 w-4" aria-hidden="true" />
          </a>

          {/* 移动端菜单开关 — Bug#6.3: aria-expanded + aria-controls */}
          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls={MOBILE_MENU_ID}
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Bug#6.2: 移动端下拉菜单 — absolute 脱离文档流，不推移页面内容 */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.nav
            id={MOBILE_MENU_ID}
            aria-label="Mobile"
            onKeyDown={handleMenuKeyDown}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="absolute left-0 right-0 top-full overflow-hidden border-b border-border bg-background shadow-sm md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-3">
              {NAV_ITEMS.map((item, index) =>
                isExternal(item.href) ? (
                  <a
                    key={item.href}
                    ref={index === 0 ? firstLinkRef : undefined}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleClose}
                    className="rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    ref={index === 0 ? firstLinkRef : undefined}
                    href={item.href}
                    onClick={handleClose}
                    className="rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
};

Header.displayName = "Header";

export { Header };
