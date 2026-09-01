// CLI 构建（工单 11.6）：esbuild JS API——shell 内联 banner 在 Windows 会被引号剥离，
// 脚本化后跨平台稳定。产物两件：① dist/main.js = TUI bundle（bin/spark.js 引导执行）；
// ② dist/server/index.mjs = server 单文件 bundle（与 apps/desktop build:server 同源命令，
//   createRequire banner 为 pino 等依赖的 CJS require 兜底）。
// playwright-core 外置：其内部对 chromium-bidi 的懒加载 require 无法静态解析（esbuild 报错，
// desktop build:server 同病），且 browser 工具本就需要运行时浏览器——运行时经依赖解析。
import { build } from 'esbuild'

const serverBanner =
  "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/main.js',
  // shebang（npm bin 要求）+ createRequire 兜底：CJS 依赖（ink→signal-exit 等）在 ESM
  // 输出里的动态 require 内置模块靠 banner 提供的 require 落地（server bundle 同款）。
  // 别名声明——bundle 内部分依赖自带 createRequire 导入，直接用同名会重复声明
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __sparkCreateRequire } from 'node:module'; var require = __sparkCreateRequire(import.meta.url);",
  },
  // protocol 一并入包：dev 下 workspace 指向 src/*.ts（Node ESM 直跑无法解析 .js 后缀的
  // TS 相对导入），外置会让 dist/main.js 无法用 node 直启——bundle 后产物自包含
})

await build({
  entryPoints: ['../../apps/server/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/server/index.mjs',
  banner: { js: serverBanner },
  external: ['playwright-core'],
})
