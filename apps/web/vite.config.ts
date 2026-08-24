/**
 * Vite 配置（doc/02 §6.9 要点）：@ 与 @spark/protocol 别名、/api 代理到本地引擎、es2022 产物。
 * Tailwind v4 走 @tailwindcss/vite 插件（CSS-first，无 tailwind.config.js）。
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@spark/protocol': fileURLToPath(new URL('../../packages/protocol/src', import.meta.url)),
    },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:4318' },
  },
  build: { target: 'es2022', sourcemap: true },
})
