"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * 主题 Provider，包裹 next-themes。
 * attribute="class" 配合 Tailwind dark 变体；enableSystem 跟随系统偏好。
 */
const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => (
  <NextThemesProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
  >
    {children}
  </NextThemesProvider>
);

ThemeProvider.displayName = "ThemeProvider";

export { ThemeProvider };
