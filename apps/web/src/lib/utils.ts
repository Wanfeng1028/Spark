import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn 惯例类名合并（copy-in 组件与自有组件共用） */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
