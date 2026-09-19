import { LINKS } from "@/lib/constants";

/** 页脚链接项 — LICENSE / CHANGELOG / CONTRIBUTING 指向仓库源文件 */
const FOOTER_LINKS = [
  { label: "GitHub", href: LINKS.github },
  { label: "LICENSE", href: `${LINKS.github}/blob/main/LICENSE` },
  { label: "CHANGELOG", href: `${LINKS.github}/blob/main/CHANGELOG.md` },
  {
    label: "CONTRIBUTING",
    href: `${LINKS.github}/blob/main/CONTRIBUTING.md`,
  },
] as const;

/**
 * 页脚：简洁单行/双行布局，亮色（x.ai 实拍页脚为亮色，v2.31 翻回）。
 * 严禁四列营销链接墙（DESIGN §12）。最大宽度与 Header 一致。
 */
const Footer: React.FC = () => (
  <footer className="border-t border-border">
    <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm text-muted-foreground sm:flex-row">
      <p>© 2026 Spark · MIT License</p>
      <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Footer">
        {FOOTER_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  </footer>
);

Footer.displayName = "Footer";

export { Footer };
