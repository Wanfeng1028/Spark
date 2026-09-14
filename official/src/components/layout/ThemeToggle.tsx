"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * 主题切换按钮（ghost variant）——三态循环 light → dark → system。
 * 通过 mounted 检查防止 hydration mismatch。
 */
const ThemeToggle: React.FC = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  /* 挂载前渲染空占位，保持布局稳定且避免 SSR/CSR 不一致 */
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
      />
    );
  }

  /* Bug#7: 三态循环——用 theme 判断是否 system，用 resolvedTheme 判断实际深浅 */
  const isSystem = theme === "system";
  const isDark = !isSystem && resolvedTheme === "dark";

  const nextTheme = isSystem ? "light" : isDark ? "system" : "dark";
  const ariaLabel = isSystem
    ? "切换到浅色主题"
    : isDark
      ? "切换到跟随系统"
      : "切换到深色主题";

  const Icon = isSystem ? Monitor : isDark ? Moon : Sun;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      onClick={() => setTheme(nextTheme)}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
};

ThemeToggle.displayName = "ThemeToggle";

export { ThemeToggle };
