import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * basePath 只自动作用于路由与 `<Link>`——裸 `<img src>` 与 metadata 里的绝对路径不会被加前缀，
 * 挂在 Pages 项目站子路径下会 404。public/ 资产一律经此函数取 URL（数据表仍存逻辑路径）。
 */
export function asset(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}
