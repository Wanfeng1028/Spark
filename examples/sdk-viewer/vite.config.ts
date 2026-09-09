import { defineConfig } from 'vite'

/**
 * 同源代理：viewer 用空 baseUrl（同源），`/api`（含 SSE `/api/event` 与会话级流）
 * 转发到本地 server（缺省 127.0.0.1:4318，即 `pnpm --filter server dev` 的地址）。
 * 与 apps/web 的 dev 代理同一思路——浏览器端示例不必处理 CORS，也不需要 token。
 */
export default defineConfig({
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:4318', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
})
