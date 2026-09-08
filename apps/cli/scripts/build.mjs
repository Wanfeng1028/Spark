// CLI 构建（工单 11.6）：esbuild JS API——shell 内联 banner 在 Windows 会被引号剥离，
// 脚本化后跨平台稳定。产物两件：① dist/main.js = TUI bundle（bin/spark.js 引导执行）；
// ② dist/server/index.mjs = server 单文件 bundle（与 apps/desktop build:server 同源命令，
//   createRequire banner 为 pino 等依赖的 CJS require 兜底）。
// playwright-core 外置（**两个 bundle 都需要**）：其内部对 chromium-bidi 的懒加载 require 无法静态
// 解析（esbuild 报 `Could not resolve "chromium-bidi/..."`），且 browser 工具本就需要运行时浏览器——
// 运行时经依赖解析（本包 dependencies 已声明 playwright-core）。
// ② 的 server bundle 一开始就外置了；① 的 TUI bundle 自工单 12.3（`spark -p` 的 print.ts 引入
// Engine → engine → browser 驱动）起也拉进了同一条依赖链，同样必须外置（CI run 34250968591 实测：
// 主 CI 首次跑 `pnpm -r build` 才暴露——此前构建不在门禁里，缺陷自 12.3 起潜伏）。
// desktop build:server 同病，已照此修（apps/desktop/scripts/build-server.mjs）。
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
  // playwright-core 必须外置（见文件头注释：TUI 自 12.3 起经 Engine 拉进同一条依赖链）
  external: ['playwright-core'],
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
