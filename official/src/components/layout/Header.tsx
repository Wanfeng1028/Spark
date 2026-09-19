"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronDown, Github, Menu, X } from "lucide-react";
import { NAV_ITEMS, LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

/** 判断是否为外部链接 */
function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

const MOBILE_MENU_ID = "mobile-menu";

/** 下拉菜单数据：分组标签 + 条目（可带外部 ↗），可带底部"查看全部"行（x.ai 同构） */
interface DropdownItem {
  label: string;
  href: string;
  external?: boolean;
}

interface DropdownGroup {
  label: string;
  items: readonly DropdownItem[];
}

interface DropdownSpec {
  label: string;
  groups: readonly DropdownGroup[];
  footer?: { label: string; href: string };
  align?: "left" | "right";
  triggerClassName?: string;
}

/**
 * NavDropdown — 点击展开的下拉菜单（x.ai 实拍同构，DESIGN v2.32）：
 * 白色圆角面板（分组小标签 + 条目 hover 灰底 + 外部条目 ↗ + 底部行），
 * 动效 = fade + y(-6) + scale(.97)，180ms ease-out；触发钮 chevron 180° 翻转。
 * 外点/ESC 关闭；aria-expanded/haspopup/menu 语义齐全。
 * x.ai 线上为压缩 bundle 无可读源码，参数按截图 + 标准曲线复刻（抄设计不抄框架）。
 */
function NavDropdown({ label, groups, footer, align = "left", triggerClassName }: DropdownSpec): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md",
          triggerClassName,
        )}
      >
        {label}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "absolute top-full z-50 mt-3 w-60 rounded-xl border border-zinc-200 bg-white p-2 shadow-md",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-1 pt-2.5 text-[11px] tracking-wider text-zinc-400">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const itemClass =
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:bg-zinc-100";
                  return isExternal(item.href) ? (
                    <a
                      key={item.label}
                      role="menuitem"
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOpen(false)}
                      className={itemClass}
                    >
                      {item.label}
                      <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 text-zinc-400" />
                    </a>
                  ) : (
                    <Link
                      key={item.label}
                      role="menuitem"
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={itemClass}
                    >
                      {item.label}
                      {item.external ? (
                        <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 text-zinc-400" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
            {footer ? (
              <Link
                role="menuitem"
                href={footer.href}
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center justify-between rounded-lg border-t border-zinc-100 px-3 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:bg-zinc-50"
              >
                {footer.label}
                <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 text-zinc-400" />
              </Link>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

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

  /* WO-014（WCAG 2.4.3）：焦点陷阱——菜单展开期间 Tab 循环限制在菜单项内 */
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

        {/* 桌面端导航：普通链接 + 下拉菜单（产品） */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          <NavDropdown
            label="产品"
            groups={[
              {
                label: "形态",
                items: [
                  { label: "Web 工作台", href: "/features" },
                  { label: "Desktop 壳", href: "/features" },
                  { label: "CLI TUI", href: "/features" },
                  { label: "移动端与小程序", href: "/features" },
                ],
              },
            ]}
            footer={{ label: "查看全部能力", href: "/features" }}
          />
          {NAV_ITEMS.filter((item) => item.label !== "Features").map((item) =>
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

        {/* 右侧操作区：CTA 带▾ 下拉（x.ai "Try for free ⌄" 同构）+ GitHub 图标 */}
        <div className="flex items-center gap-1">
          <NavDropdown
            label="快速上手"
            align="right"
            triggerClassName="rounded-full bg-spark-accent px-4 py-2 font-medium text-white hover:bg-spark-accent/90 hover:text-white mr-1"
            groups={[
              {
                label: "开始",
                items: [
                  { label: "快速上手", href: "/quickstart" },
                  { label: "开发者文档", href: LINKS.docs, external: true },
                ],
              },
              {
                label: "源码",
                items: [
                  { label: "GitHub 仓库", href: LINKS.github, external: true },
                  {
                    label: "CHANGELOG",
                    href: `${LINKS.github}/blob/main/CHANGELOG.md`,
                    external: true,
                  },
                ],
              },
            ]}
          />

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
