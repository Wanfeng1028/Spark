// 桌面壳的 server sidecar 构建（工单 14.1 第三批修：与 apps/cli/scripts/build.mjs 同源同病同治）。
//
// 两件事必须与 cli 的做法一致：
// ① banner 走脚本而不是 shell 内联——内联引号在 Windows cmd 会被剥离（cli 的脚本注释已记此坑），
//    而 desktop-win.yml 跑在 windows-latest；
// ② playwright-core 外置——它内部对 chromium-bidi 的懒加载 require 无法静态解析，esbuild 直接报
//    `Could not resolve "chromium-bidi/lib/cjs/bidiMapper/BidiMapper"`（CI 实测：run 34249674960，
//    本包 build:server 因此失败；cli 早已外置并在注释里写明"desktop build:server 同病"）。
//    browser 工具本就需要运行时浏览器，故运行时经依赖解析——playwright-core 已列入本包 dependencies。
import { build } from 'esbuild'

await build({
  entryPoints: ['../../apps/server/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'build/server/index.mjs',
  // createRequire 兜底：pino 等 CJS 依赖在 ESM 产物里的 require 靠它落地（cli 的 server bundle 同款）
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  external: ['playwright-core'],
})
