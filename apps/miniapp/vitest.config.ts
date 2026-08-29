/** vitest 配置——逻辑层单测（doc/06 L5.5）：纯函数/投影/解析，无小程序运行时依赖 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
