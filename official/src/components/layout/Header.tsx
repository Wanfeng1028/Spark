"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Github, Menu, X } from "lucide-react";
import { NAV_ITEMS, LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

/** 判断是否为外部链接 */
function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

/**
 * 顶部导航栏。
 * 固定顶部，背景 bg-background/95 + border-b 分隔——不用毛玻璃（DESIGN §12.2）。
 * 移动端通过 AnimatePresence 展开/收起菜单。
 */
const Header: React.FC = () => {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        {/* Logo — 纯文字，不用图片 */}
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-foreground"
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

        {/* 右侧操作区 */}
        <div className="flex items-center gap-1">
          <ThemeToggle />

          {/* GitHub 图标链接 — 用 buttonVariants 保持与 ghost/icon 按钮一致的视觉 */}
          <a
            href={LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <Github className="h-4 w-4" aria-hidden="true" />
          </a>

          {/* 移动端菜单开关 */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
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

      {/* 移动端下拉菜单 */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.nav
            aria-label="Mobile"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t border-border md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-3">
              {NAV_ITEMS.map((item) =>
                isExternal(item.href) ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
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
