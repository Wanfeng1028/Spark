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
 * 外点/ESC 关闭；aria-haspopup/expanded/menu 语义齐全。
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

/** 移动端可展开分组（x.ai 实拍同构：条目带一句描述，chevron 翻转） */
function MobileAccordion({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const items = [
    { label: "Web 工作台", desc: "React 19 SPA，只消费事件流" },
    { label: "Desktop 壳", desc: "Electron 壳，sidecar 复用同一引擎" },
    { label: "CLI TUI", desc: "Ink 7 终端，纯单栏转录流" },
    { label: "移动端与小程序", desc: "Expo + RN 配对即连；Taro 同源" },
  ] as const;

  return (
    <div className="border-b border-zinc-100">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between py-4 text-left text-xl text-zinc-900"
      >
        产品
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 text-zinc-400 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 pb-5 pl-4">
              {items.map((item) => (
                <Link
                  key={item.label}
                  href="/features"
                  onClick={onClose}
                  className="block"
                >
                  <p className="text-base font-medium text-zinc-900">{item.label}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">{item.desc}</p>
                </Link>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const Header: React.FC = () => {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  /* Bug#6.1: 路由变化时关闭移动菜单 */
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  /* ESC 键关闭菜单 */
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

  /* 全屏菜单期间锁定背景滚动 */
  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
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
        <nav className="hidden items-center gap-6 md:flex" aria-label="主导航">
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

        {/* 右侧操作区：黑色胶囊 CTA 带 ▾ 下拉（x.ai "Try for free ⌄" 同构）+ GitHub 图标 */}
        <div className="flex items-center gap-1">
          <NavDropdown
            label="快速上手"
            align="right"
            triggerClassName="rounded-full bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800 hover:text-white mr-1"
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
            aria-label="GitHub 仓库"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <Github className="h-4 w-4" aria-hidden="true" />
          </a>

          {/* 移动端菜单开关 — aria-expanded + aria-controls */}
          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon"
            className="rounded-full bg-zinc-100 md:hidden"
            aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
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

      {/* 移动端全屏菜单（x.ai 实拍同构：大字条目 + 发丝线 + 可展开分组带描述 + 底部 CTA） */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            id={MOBILE_MENU_ID}
            onKeyDown={handleMenuKeyDown}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex flex-col bg-white md:hidden"
          >
            <div className="flex h-14 items-center justify-between px-6">
              <Link
                href="/"
                onClick={handleClose}
                className="text-base font-semibold tracking-tight text-foreground"
              >
                Spark
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-zinc-100"
                aria-label="关闭菜单"
                onClick={handleClose}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <nav aria-label="移动端导航" className="flex-1 overflow-y-auto px-6 pt-2">
              <MobileAccordion onClose={handleClose} />
              {NAV_ITEMS.map((item) =>
                isExternal(item.href) ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between border-b border-zinc-100 py-4 text-xl text-zinc-900"
                  >
                    {item.label}
                    <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-zinc-400" />
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleClose}
                    className="block border-b border-zinc-100 py-4 text-xl text-zinc-900"
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>

            <div className="px-6 pb-8 pt-4">
              <Link
                href="/quickstart"
                onClick={handleClose}
                className={cn(buttonVariants({ size: "lg" }), "w-full rounded-full")}
              >
                快速上手
              </Link>
              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-400">
                <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600">
                  GitHub
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href={`${LINKS.github}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-600"
                >
                  LICENSE
                </a>
                <span aria-hidden="true">·</span>
                <span>MIT</span>
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
};

Header.displayName = "Header";

export { Header };
